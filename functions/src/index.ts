import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { visitsRouter } from './routes/visits';
import { actionsRouter } from './routes/actions';
import { medicationsRouter } from './routes/medications';
import { webhooksRouter } from './routes/webhooks';
import { usersRouter } from './routes/users';
import { sharesRouter } from './routes/shares';
import { apiLimiter } from './middlewares/rateLimit';
export { processVisitAudio } from './triggers/processVisitAudio';
export { checkPendingTranscriptions } from './triggers/checkPendingTranscriptions';
export { summarizeVisitTrigger } from './triggers/summarizeVisit';
export { analyzeMedicationSafety } from './callables/medicationSafety';

// Initialize Firebase Admin
admin.initializeApp();

// Create Express app
const app = express();

// Trust proxy - required for rate limiting behind Cloud Functions/Load Balancer
app.set('trust proxy', true);

// Middleware
app.use(cors({ origin: true }));
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

// Export the API
export const api = functions.https.onRequest(app);

