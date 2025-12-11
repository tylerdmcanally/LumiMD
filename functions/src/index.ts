import { onRequest } from 'firebase-functions/v2/https';
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
import { apiLimiter } from './middlewares/rateLimit';
import { requireHttps } from './middlewares/httpsOnly';
import { errorHandler } from './middlewares/errorHandler';
import { corsConfig } from './config';
import { initSentry, sentryRequestHandler, setupSentryErrorHandler } from './utils/sentry';
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

// Trust proxy - required for rate limiting behind Cloud Functions/Load Balancer
app.set('trust proxy', true);

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
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 100,
  },
  app
);

