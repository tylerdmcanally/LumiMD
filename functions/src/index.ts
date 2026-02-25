import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
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
import {
  backfillMedicationReminderTimingPolicy,
  processAndNotifyMedicationReminders,
} from './services/medicationReminderService';
import { purgeSoftDeletedCollections } from './services/softDeleteRetentionService';
import { processVisitPostCommitRecoveries } from './services/visitPostCommitRecoveryService';
import { reportPostCommitEscalations } from './services/postCommitEscalationReportingService';
import { backfillDenormalizedFields } from './services/denormalizationSync';
import { backfillListQueryContractData } from './services/listQueryContractBackfill';

export { processVisitAudio } from './triggers/processVisitAudio';
export { checkPendingTranscriptions } from './triggers/checkPendingTranscriptions';
export { summarizeVisitTrigger } from './triggers/summarizeVisit';
export { autoAcceptShareInvites } from './triggers/autoAcceptShareInvites';
export {
  syncReminderDenormalizationOnMedicationWrite,
  syncShareOwnerDenormalizationOnUserWrite,
} from './triggers/denormalizationSync';
export { analyzeMedicationSafety } from './callables/medicationSafety';
export { privacyDataSweeper } from './triggers/privacySweeper';
export { staleVisitSweeper } from './triggers/staleVisitSweeper';

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

const DENORMALIZATION_BACKFILL_DRY_RUN =
  process.env.DENORMALIZATION_BACKFILL_DRY_RUN === 'true' ||
  process.env.DENORMALIZATION_BACKFILL_DRY_RUN === '1';
const DENORMALIZATION_BACKFILL_PAGE_SIZE = parsePositiveInt(
  process.env.DENORMALIZATION_BACKFILL_PAGE_SIZE,
);
const LIST_QUERY_CONTRACT_BACKFILL_DRY_RUN =
  process.env.LIST_QUERY_CONTRACT_BACKFILL_DRY_RUN === 'true' ||
  process.env.LIST_QUERY_CONTRACT_BACKFILL_DRY_RUN === '1';
const LIST_QUERY_CONTRACT_BACKFILL_PAGE_SIZE = parsePositiveInt(
  process.env.LIST_QUERY_CONTRACT_BACKFILL_PAGE_SIZE,
);

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

app.use(compression({
  threshold: 1024,
  level: 6,
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

// Public shared visit links are deprecated. Visit access now requires authenticated caregiver access.
app.get('/v1/shared/visits/:userId/:visitId', (_req, res) => {
  res.status(410).json({
    code: 'deprecated_public_endpoint',
    message: 'Public shared links are no longer supported. Sign in to view shared visits in the Care Dashboard.',
  });
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

// Scheduled function to progressively backfill reminder timing metadata for legacy reminders
export const backfillMedicationReminderTiming = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 2 hours',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running medication reminder timing backfill');

    try {
      const result = await backfillMedicationReminderTimingPolicy();
      functions.logger.info('[Scheduler] Medication reminder timing backfill complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error in medication reminder timing backfill:', error);
      throw error;
    }
  }
);

// Scheduled function to backfill denormalized fields for shares/invites/reminders
export const backfillDenormalizedFieldSync = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 2 hours',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running denormalized field backfill', {
      dryRun: DENORMALIZATION_BACKFILL_DRY_RUN,
      pageSize: DENORMALIZATION_BACKFILL_PAGE_SIZE ?? 'default',
    });

    try {
      const db = admin.firestore();
      const result = await backfillDenormalizedFields({
        db,
        stateCollection: db.collection('systemMaintenance'),
        now: admin.firestore.Timestamp.now(),
        pageSize: DENORMALIZATION_BACKFILL_PAGE_SIZE,
        dryRun: DENORMALIZATION_BACKFILL_DRY_RUN,
      });
      functions.logger.info('[Scheduler] Denormalized field backfill complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error in denormalized field backfill:', error);
      throw error;
    }
  },
);

// Scheduled function to backfill legacy docs so paginated list queries remain canonical.
export const backfillLegacyListQueryContract = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 2 hours',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running list-query contract backfill', {
      dryRun: LIST_QUERY_CONTRACT_BACKFILL_DRY_RUN,
      pageSize: LIST_QUERY_CONTRACT_BACKFILL_PAGE_SIZE ?? 'default',
    });

    try {
      const db = admin.firestore();
      const result = await backfillListQueryContractData({
        db,
        stateCollection: db.collection('systemMaintenance'),
        now: admin.firestore.Timestamp.now(),
        pageSize: LIST_QUERY_CONTRACT_BACKFILL_PAGE_SIZE,
        dryRun: LIST_QUERY_CONTRACT_BACKFILL_DRY_RUN,
      });
      functions.logger.info('[Scheduler] List-query contract backfill complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error in list-query contract backfill:', error);
      throw error;
    }
  },
);

// Scheduled function to purge soft-deleted resources after retention window
export const purgeSoftDeletedData = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 24 hours',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running soft-deleted data purge');

    try {
      const result = await purgeSoftDeletedCollections();
      functions.logger.info('[Scheduler] Soft-deleted data purge complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error purging soft-deleted data:', error);
      throw error;
    }
  }
);

// Scheduled function to retry visit post-commit operations that previously failed
export const retryVisitPostCommitOperations = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 30 minutes',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running visit post-commit recovery');

    try {
      const result = await processVisitPostCommitRecoveries();
      functions.logger.info('[Scheduler] Visit post-commit recovery complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error in visit post-commit recovery:', error);
      throw error;
    }
  }
);

// Scheduled function to report escalated post-commit failures for incident visibility
export const reportVisitPostCommitEscalations = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every hour',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[Scheduler] Running visit post-commit escalation report');

    try {
      const result = await reportPostCommitEscalations();
      functions.logger.info('[Scheduler] Visit post-commit escalation report complete', result);
    } catch (error) {
      functions.logger.error('[Scheduler] Error in visit post-commit escalation report:', error);
      throw error;
    }
  },
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
