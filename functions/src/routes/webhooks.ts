import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import crypto from 'crypto';
import { webhookConfig } from '../config';
import { buildWebhookVisitUpdate } from '../services/visitProcessingTransitions';

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
      const updatePayload = buildWebhookVisitUpdate({
        status: 'completed',
        now,
        fieldDelete: admin.firestore.FieldValue.delete(),
        formattedTranscript,
        transcriptText: fullTranscript.text || text || '',
      });

      await visitRef.update(updatePayload);

      functions.logger.info(`[webhooks] Visit ${visitRef.id} moved to summarizing via webhook`);
    } else if (status === 'error') {
      const updatePayload = buildWebhookVisitUpdate({
        status: 'error',
        now,
        fieldDelete: admin.firestore.FieldValue.delete(),
        error,
      });
      await visitRef.update(updatePayload);

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

