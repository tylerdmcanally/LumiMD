import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import crypto from 'crypto';
import { parseActionDueDate, resolveVisitReferenceDate } from '../utils/actionDueDate';
import { webhookConfig } from '../config';
import { getNotificationService } from '../services/notifications';

export const webhooksRouter = Router();

/**
 * Timing-safe string comparison to prevent timing attacks
 * Uses constant-time comparison to avoid leaking information about the secret
 */
function timingSafeEqual(a: string | string[] | undefined, b: string): boolean {
  if (!a || typeof a !== 'string') {
    return false;
  }

  // If lengths differ, still compare to prevent timing leaks
  // Use a dummy comparison if lengths don't match
  if (a.length !== b.length) {
    // Compare against dummy value to maintain constant time
    const dummy = Buffer.alloc(b.length);
    crypto.timingSafeEqual(Buffer.from(a.padEnd(b.length, '\0')), dummy);
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

const getDb = () => admin.firestore();

const medicationsSchema = z.object({
  started: z.array(z.string()).default([]),
  stopped: z.array(z.string()).default([]),
  changed: z.array(z.string()).default([]),
});

const visitProcessedSchema = z.object({
  visitId: z.string(),
  transcript: z.string().optional().default(''),
  summary: z.string().optional().default(''),
  diagnoses: z.array(z.string()).optional().default([]),
  medications: medicationsSchema.optional().default({
    started: [],
    stopped: [],
    changed: [],
  }),
  imaging: z.array(z.string()).optional().default([]),
  nextSteps: z.array(z.string()).optional().default([]),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional().default('completed'),
});

const WEBHOOK_SECRET = webhookConfig.visitProcessingSecret;

if (!WEBHOOK_SECRET) {
  functions.logger.warn(
    '[webhooks] VISIT_PROCESSING_WEBHOOK_SECRET is not set. Webhook endpoint will reject requests.',
  );
}

/**
 * POST /v1/webhooks/visit-processed
 * Receives structured AI output for a visit
 */
webhooksRouter.post('/visit-processed', async (req, res) => {
  try {
    if (!WEBHOOK_SECRET) {
      res.status(500).json({
        code: 'server_error',
        message: 'Webhook secret not configured',
      });
      return;
    }

    const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-webhook-signature'];

    // Use timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(providedSecret, WEBHOOK_SECRET)) {
      res.status(401).json({
        code: 'unauthorized',
        message: 'Invalid webhook secret',
      });
      return;
    }

    const payload = visitProcessedSchema.parse(req.body);
    const { visitId, transcript, summary, diagnoses, medications, imaging, nextSteps, processingStatus } = payload;

    const visitRef = getDb().collection('visits').doc(visitId);
    const visitDoc = await visitRef.get();

    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: `Visit ${visitId} not found`,
      });
      return;
    }

    const visit = visitDoc.data();
    if (!visit) {
      res.status(500).json({
        code: 'server_error',
        message: 'Visit data is empty',
      });
      return;
    }

    const userId = visit.userId;

    const now = admin.firestore.Timestamp.now();
    const referenceDate = resolveVisitReferenceDate(visit, now.toDate());

    await visitRef.update({
      transcript,
      summary,
      diagnoses,
      medications: {
        started: medications.started ?? [],
        stopped: medications.stopped ?? [],
        changed: medications.changed ?? [],
      },
      imaging,
      nextSteps,
      processingStatus,
      status: processingStatus === 'completed' ? 'completed' : visit.status ?? 'processing',
      processedAt: now,
      updatedAt: now,
    });

    // Remove existing action items for this visit
    const actionsCollection = getDb().collection('actions');
    const existingActions = await actionsCollection.where('visitId', '==', visitId).get();
    const batch = getDb().batch();

    existingActions.docs.forEach(doc => batch.delete(doc.ref));

    nextSteps.forEach(step => {
      const actionRef = actionsCollection.doc();
      const parsedDueDate = parseActionDueDate(step, referenceDate);

      batch.set(actionRef, {
        userId,
        visitId,
        description: step,
        completed: false,
        completedAt: null,
        notes: '',
        createdAt: now,
        updatedAt: now,
        dueAt: parsedDueDate ? admin.firestore.Timestamp.fromDate(parsedDueDate) : null,
      });
    });

    await batch.commit();

    functions.logger.info(
      `[webhooks] Processed visit ${visitId} for user ${userId}. Created ${nextSteps.length} action items.`,
    );

    // Send push notification if visit is completed
    if (processingStatus === 'completed') {
      try {
        // Count pending actions for badge
        const pendingActionsSnapshot = await getDb()
          .collection('actions')
          .where('userId', '==', userId)
          .where('completed', '==', false)
          .get();
        const badgeCount = pendingActionsSnapshot.size;

        const notificationService = getNotificationService();
        await notificationService.notifyVisitReady(userId, visitId, badgeCount);
      } catch (error) {
        // Don't fail the webhook if notification fails
        functions.logger.error(
          `[webhooks] Failed to send push notification for visit ${visitId}:`,
          error,
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid payload',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[webhooks] Error processing visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to process visit data',
    });
  }
});

// =============================================================================
// AssemblyAI Transcription Complete Webhook
// =============================================================================

const ASSEMBLYAI_WEBHOOK_SECRET = webhookConfig.assemblyaiWebhookSecret;

const assemblyaiWebhookSchema = z.object({
  transcript_id: z.string(),
  status: z.enum(['completed', 'error']),
  text: z.string().optional(),
  error: z.string().optional(),
});

/**
 * POST /v1/webhooks/assemblyai/transcription-complete
 * Called by AssemblyAI when transcription is ready (instant vs 1-min polling)
 * Polling remains as backup in checkPendingTranscriptions
 */
webhooksRouter.post('/assemblyai/transcription-complete', async (req, res) => {
  try {
    // Validate webhook secret if configured
    if (ASSEMBLYAI_WEBHOOK_SECRET) {
      const providedSecret = req.headers['x-assemblyai-secret'] || req.query.secret;
      if (!timingSafeEqual(providedSecret as string, ASSEMBLYAI_WEBHOOK_SECRET)) {
        functions.logger.warn('[webhooks] Invalid AssemblyAI webhook secret');
        res.status(401).json({ code: 'unauthorized', message: 'Invalid webhook secret' });
        return;
      }
    }

    const payload = assemblyaiWebhookSchema.parse(req.body);
    const { transcript_id, status, text, error } = payload;

    functions.logger.info(`[webhooks] AssemblyAI webhook received for transcript ${transcript_id}, status: ${status}`);

    // Find visit by transcriptionId
    const visitsSnapshot = await getDb()
      .collection('visits')
      .where('transcriptionId', '==', transcript_id)
      .where('processingStatus', '==', 'transcribing')
      .limit(1)
      .get();

    if (visitsSnapshot.empty) {
      // Visit not found or already processed (maybe by polling backup)
      functions.logger.info(`[webhooks] Visit not found or already processed for transcript ${transcript_id}`);
      res.json({ success: true, message: 'Already processed or not found' });
      return;
    }

    const visitDoc = visitsSnapshot.docs[0];
    const visitRef = visitDoc.ref;
    const now = admin.firestore.Timestamp.now();

    if (status === 'completed') {
      // Fetch full transcript with utterances for speaker labels
      const { getAssemblyAIService } = await import('../services/assemblyai');
      const assemblyAI = getAssemblyAIService();
      const fullTranscript = await assemblyAI.getTranscript(transcript_id);

      const formattedTranscript = assemblyAI.formatTranscript(fullTranscript.utterances, fullTranscript.text);

      await visitRef.update({
        transcriptionStatus: 'completed',
        transcriptionCompletedAt: now,
        transcriptionError: admin.firestore.FieldValue.delete(),
        transcript: formattedTranscript,
        transcriptText: fullTranscript.text || text || '',
        processingStatus: 'summarizing',
        processingError: admin.firestore.FieldValue.delete(),
        updatedAt: now,
        webhookTriggered: true,
      });

      functions.logger.info(`[webhooks] Visit ${visitRef.id} moved to summarizing via webhook`);
    } else if (status === 'error') {
      await visitRef.update({
        transcriptionStatus: 'error',
        transcriptionError: error || 'Transcription failed',
        processingStatus: 'failed',
        status: 'failed',
        processingError: error || 'Transcription failed',
        updatedAt: now,
      });

      functions.logger.error(`[webhooks] Visit ${visitRef.id} transcription failed: ${error}`);
    }

    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: 'validation_failed', message: 'Invalid payload', details: err.errors });
      return;
    }

    functions.logger.error('[webhooks] AssemblyAI webhook error:', err);
    res.status(500).json({ code: 'server_error', message: 'Failed to process webhook' });
  }
});


