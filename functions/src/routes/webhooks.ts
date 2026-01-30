import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import crypto from 'crypto';
import { webhookConfig } from '../config';

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

// =============================================================================
// RevenueCat Subscription Webhook
// =============================================================================

const REVENUECAT_WEBHOOK_SECRET = webhookConfig.revenuecatWebhookSecret;

/**
 * RevenueCat webhook event types we care about
 * See: https://www.revenuecat.com/docs/integrations/webhooks
 */
type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'SUBSCRIPTION_PAUSED'
  | 'TRANSFER';

const revenuecatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: z.object({
    type: z.string(),
    app_user_id: z.string(),
    original_app_user_id: z.string().optional(),
    product_id: z.string().optional(),
    entitlement_ids: z.array(z.string()).optional(),
    expiration_at_ms: z.number().optional(),
    purchased_at_ms: z.number().optional(),
    store: z.string().optional(),
    environment: z.string().optional(),
  }),
});

/**
 * POST /v1/webhooks/revenuecat
 * Called by RevenueCat on subscription events (purchase, renewal, cancellation, etc.)
 * Updates user's subscription status in Firestore
 */
webhooksRouter.post('/revenuecat', async (req, res) => {
  try {
    // Validate webhook authorization header (trim to handle env var whitespace)
    const webhookSecret = REVENUECAT_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const authHeader = (req.headers['authorization'] as string)?.trim();
      if (!timingSafeEqual(authHeader, webhookSecret)) {
        functions.logger.warn('[webhooks] Invalid RevenueCat webhook authorization', {
          headerLen: authHeader?.length,
          secretLen: webhookSecret?.length,
        });
        res.status(401).json({ code: 'unauthorized', message: 'Invalid authorization' });
        return;
      }
    }

    const payload = revenuecatWebhookSchema.parse(req.body);
    const { event } = payload;
    const eventType = event.type as RevenueCatEventType;
    const appUserId = event.app_user_id;

    functions.logger.info(`[webhooks] RevenueCat webhook: ${eventType} for user ${appUserId}`);

    // Skip if no user ID
    if (!appUserId) {
      functions.logger.warn('[webhooks] RevenueCat webhook missing app_user_id');
      res.json({ success: true, message: 'No user ID' });
      return;
    }

    const userRef = getDb().collection('users').doc(appUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      functions.logger.warn(`[webhooks] User not found for RevenueCat event: ${appUserId}`);
      res.json({ success: true, message: 'User not found' });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
      revenuecatAppUserId: appUserId,
    };

    // Handle different event types
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        // User is now subscribed
        updateData.subscriptionStatus = 'active';
        updateData.subscriptionPlatform = 'revenuecat';
        if (event.expiration_at_ms) {
          updateData.subscriptionExpiresAt = new Date(event.expiration_at_ms).toISOString();
        }
        if (event.product_id) {
          updateData.subscriptionProductId = event.product_id;
        }
        functions.logger.info(`[webhooks] User ${appUserId} subscription activated`);
        break;

      case 'CANCELLATION':
        // User cancelled but may still have access until expiration
        updateData.subscriptionStatus = 'cancelled';
        functions.logger.info(`[webhooks] User ${appUserId} subscription cancelled`);
        break;

      case 'EXPIRATION':
        // Subscription has expired
        updateData.subscriptionStatus = 'expired';
        functions.logger.info(`[webhooks] User ${appUserId} subscription expired`);
        break;

      case 'BILLING_ISSUE':
        // Payment failed - may want to notify user
        updateData.subscriptionBillingIssue = true;
        functions.logger.warn(`[webhooks] User ${appUserId} has billing issue`);
        break;

      case 'PRODUCT_CHANGE':
        // User changed subscription tier
        if (event.product_id) {
          updateData.subscriptionProductId = event.product_id;
        }
        functions.logger.info(`[webhooks] User ${appUserId} changed product to ${event.product_id}`);
        break;

      case 'SUBSCRIPTION_PAUSED':
        updateData.subscriptionStatus = 'paused';
        functions.logger.info(`[webhooks] User ${appUserId} subscription paused`);
        break;

      case 'TRANSFER':
        // Handle subscription transfer if needed
        functions.logger.info(`[webhooks] User ${appUserId} subscription transferred`);
        break;

      default:
        functions.logger.info(`[webhooks] Unhandled RevenueCat event type: ${eventType}`);
    }

    // Update user document
    await userRef.update(updateData);

    functions.logger.info(`[webhooks] Updated user ${appUserId} subscription status`);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      functions.logger.error('[webhooks] RevenueCat webhook validation error:', err.errors);
      res.status(400).json({ code: 'validation_failed', message: 'Invalid payload', details: err.errors });
      return;
    }

    functions.logger.error('[webhooks] RevenueCat webhook error:', err);
    res.status(500).json({ code: 'server_error', message: 'Failed to process webhook' });
  }
});


