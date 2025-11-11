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
export { processVisitAudio } from './triggers/processVisitAudio';
export { checkPendingTranscriptions } from './triggers/checkPendingTranscriptions';
export { summarizeVisitTrigger } from './triggers/summarizeVisit';

// Initialize Firebase Admin
admin.initializeApp();

// Create Express app
const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Routes
app.use('/v1/auth', authRouter);
app.use('/v1/visits', visitsRouter);
app.use('/v1/actions', actionsRouter);
app.use('/v1/meds', medicationsRouter);
app.use('/v1/webhooks', webhooksRouter);
app.use('/v1/users', usersRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the API
export const api = functions.https.onRequest(app);

