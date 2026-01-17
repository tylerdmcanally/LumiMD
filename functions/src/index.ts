import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { visitsRouter } from './routes/visits';
import { actionsRouter } from './routes/actions';
import { medicationsRouter } from './routes/medications';
import { webhooksRouter } from './routes/webhooks';
import { usersRouter } from './routes/users';
import { sharesRouter } from './routes/shares';
import { nudgesRouter } from './routes/nudges';
import { insightsRouter } from './routes/insights';
import { nudgesDebugRouter } from './routes/nudgesDebug';
import { healthLogsRouter } from './routes/healthLogs';
import { medicationRemindersRouter } from './routes/medicationReminders';
import medicationLogsRouter from './routes/medicationLogs';
import { medicalContextRouter } from './routes/medicalContext';
import { careRouter } from './routes/care';
import { apiLimiter } from './middlewares/rateLimit';
import { requireHttps } from './middlewares/httpsOnly';
import { errorHandler } from './middlewares/errorHandler';
import { corsConfig } from './config';
import { initSentry, sentryRequestHandler, setupSentryErrorHandler } from './utils/sentry';
import { processAndNotifyDueNudges } from './services/nudgeNotificationService';
import { processAndNotifyMedicationReminders } from './services/medicationReminderService';

export { processVisitAudio } from './triggers/processVisitAudio';
export { checkPendingTranscriptions } from './triggers/checkPendingTranscriptions';
export { summarizeVisitTrigger } from './triggers/summarizeVisit';
export { autoAcceptShareInvites } from './triggers/autoAcceptShareInvites';
export { analyzeMedicationSafety } from './callables/medicationSafety';
export { privacyDataSweeper } from './triggers/privacySweeper';
export { staleVisitSweeper } from './triggers/staleVisitSweeper';


// Initialize Sentry BEFORE other initializations
initSentry();

// Initialize Firebase Admin
admin.initializeApp();

// Create Express app
const app = express();

// Trust proxy - Firebase Functions/Cloud Run runs behind Google's Cloud Load Balancer.
// Setting to 1 means "trust only the first proxy hop" which is the load balancer.
// This is more secure than 'true' and properly extracts client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// Configure CORS with whitelist
const allowedOrigins = corsConfig.allowedOrigins
  ? corsConfig.allowedOrigins.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

// In development, allow localhost and common development ports
const devOrigins = corsConfig.isDevelopment
  ? ['http://localhost:3000', 'http://localhost:19006', 'http://localhost:8081']
  : [];

const allAllowedOrigins = [...allowedOrigins, ...devOrigins];

if (allAllowedOrigins.length === 0) {
  functions.logger.warn(
    '[cors] No ALLOWED_ORIGINS configured. API will reject all CORS requests from browsers. ' +
    'Set ALLOWED_ORIGINS environment variable with comma-separated origins.'
  );
}

// Middleware
app.use(requireHttps);

// Sentry request handler - must be first middleware to capture all requests
app.use(sentryRequestHandler);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allAllowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Allow Vercel preview deployments (ends with .vercel.app)
    if (origin.endsWith('.vercel.app')) {
      callback(null, true);
      return;
    }

    // Allow production domain if configured
    if (origin === 'https://portal.lumimd.app' || origin === 'https://lumimd.app') {
      callback(null, true);
      return;
    }

    functions.logger.warn(`[cors] Rejected request from unauthorized origin: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security headers with helmet.js
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for some frameworks
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'], // Allow images from HTTPS and data URIs
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Disable X-Powered-By header
  hidePoweredBy: true,
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
}));

// Request size limits and parsing
app.use(express.json({ limit: '10mb' })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Global rate limiting
app.use(apiLimiter);

// Routes
app.use('/v1/auth', authRouter);
app.use('/v1/visits', visitsRouter);
app.use('/v1/actions', actionsRouter);
app.use('/v1/meds', medicationsRouter);
app.use('/v1/webhooks', webhooksRouter);
app.use('/v1/users', usersRouter);
app.use('/v1/shares', sharesRouter);
app.use('/v1/nudges', nudgesRouter);
app.use('/v1/nudges', nudgesDebugRouter); // Debug endpoints under same path
app.use('/v1/health-logs', healthLogsRouter);
app.use('/v1/medication-reminders', medicationRemindersRouter);
app.use('/v1/medication-logs', medicationLogsRouter);
app.use('/v1/insights', insightsRouter);
app.use('/v1/medical-context', medicalContextRouter);
app.use('/v1/care', careRouter);

// Public endpoint for caregivers to view shared visit summaries (no auth required)
app.get('/v1/shared/visits/:userId/:visitId', async (req, res) => {
  try {
    const { userId, visitId } = req.params;

    // Validate parameters
    if (!userId || !visitId) {
      res.status(400).json({
        code: 'invalid_params',
        message: 'User ID and Visit ID are required',
      });
      return;
    }

    const db = admin.firestore();

    // Check if visit exists and user has sharing enabled
    const visitDoc = await db.collection('visits').doc(visitId).get();
    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    const visit = visitDoc.data()!;

    // Verify visit belongs to the specified user
    if (visit.userId !== userId) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    // Must be a completed visit
    if (visit.processingStatus !== 'completed' && visit.status !== 'completed') {
      res.status(400).json({
        code: 'not_ready',
        message: 'Visit summary is not yet available',
      });
      return;
    }

    // Get patient info for display
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const patientName = userData?.firstName
      ? `${userData.firstName}${userData.lastName ? ' ' + userData.lastName : ''}`
      : undefined;

    // Return sanitized visit data (public-safe fields only)
    res.json({
      id: visitId,
      visitDate: visit.visitDate?.toDate?.()?.toISOString() ||
        visit.createdAt?.toDate?.()?.toISOString() ||
        new Date().toISOString(),
      provider: visit.provider || undefined,
      specialty: visit.specialty || undefined,
      location: visit.location || undefined,
      summary: visit.summary || undefined,
      diagnoses: visit.diagnoses || [],
      medications: visit.medications || {},
      nextSteps: visit.nextSteps || [],
      patientName,
    });
  } catch (error) {
    functions.logger.error('[shared/visits] Error fetching shared visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to load visit summary',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Sentry error handler - must come before custom error handler
setupSentryErrorHandler(app);

// Centralized error handling
app.use(errorHandler);

// Export the API (v2)
export const api = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 40,
  },
  app
);

// Scheduled function to process nudge notifications every 15 minutes
export const processNudgeNotifications = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 15 minutes',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running nudge notification processor');

    try {
      const result = await processAndNotifyDueNudges();
      functions.logger.info('[Scheduler] Nudge processing complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error processing nudges:', error);
      throw error;
    }
  }
);

// Scheduled function to process medication reminders every 5 minutes
export const processMedicationReminders = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 5 minutes',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running medication reminder processor');

    try {
      const result = await processAndNotifyMedicationReminders();
      functions.logger.info('[Scheduler] Med reminder processing complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error processing med reminders:', error);
      throw error;
    }
  }
);

// Scheduled function to create recurring condition check-in nudges (daily at 9 AM)
export const processConditionReminders = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every hour',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running condition reminder processor');

    // Import dynamically to avoid circular dependencies
    const { processConditionReminders: runReminders } = await import('./services/conditionReminderService');

    try {
      const result = await runReminders();
      functions.logger.info('[Scheduler] Condition reminder processing complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error processing condition reminders:', error);
      throw error;
    }
  }
);
