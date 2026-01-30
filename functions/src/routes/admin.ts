import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import crypto from 'crypto';
import { webhookConfig } from '../config';

export const adminRouter = Router();

const getDb = () => admin.firestore();

// Use RevenueCat webhook secret as admin auth key
const ADMIN_SECRET = webhookConfig.revenuecatWebhookSecret;

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string | undefined, b: string): boolean {
  if (!a || typeof a !== 'string') return false;
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(b.length);
    crypto.timingSafeEqual(Buffer.from(a.padEnd(b.length, '\0')), dummy);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const setBypassSchema = z.object({
  userId: z.string().min(1),
  bypass: z.boolean(),
});

/**
 * POST /v1/admin/set-bypass
 * Set or remove paywall bypass for a user
 * 
 * Headers:
 *   Authorization: <REVENUECAT_WEBHOOK_SECRET>
 * 
 * Body:
 *   { "userId": "abc123", "bypass": true }
 */
adminRouter.post('/set-bypass', async (req, res) => {
  try {
    // Verify admin secret (trim to handle env var trailing newlines)
    const adminSecret = ADMIN_SECRET?.trim();
    if (!adminSecret) {
      functions.logger.error('[admin] REVENUECAT_WEBHOOK_SECRET not configured');
      res.status(500).json({ code: 'config_error', message: 'Admin secret not configured' });
      return;
    }

    const authHeader = (req.headers['authorization'] as string)?.trim();
    if (!timingSafeEqual(authHeader, adminSecret)) {
      functions.logger.warn('[admin] Invalid admin authorization', { 
        headerLen: authHeader?.length, 
        secretLen: adminSecret?.length 
      });
      res.status(401).json({ code: 'unauthorized', message: 'Invalid authorization' });
      return;
    }

    // Parse and validate body
    const { userId, bypass } = setBypassSchema.parse(req.body);

    // Check if user exists
    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ code: 'not_found', message: `User ${userId} not found` });
      return;
    }

    // Update bypass flag
    await userRef.update({
      bypassPaywall: bypass,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    const userData = userDoc.data();
    functions.logger.info(`[admin] Set bypassPaywall=${bypass} for user ${userId} (${userData?.email || 'no email'})`);

    res.json({
      success: true,
      userId,
      email: userData?.email || null,
      bypassPaywall: bypass,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: 'validation_failed', message: 'Invalid request body', details: err.errors });
      return;
    }

    functions.logger.error('[admin] set-bypass error:', err);
    res.status(500).json({ code: 'server_error', message: 'Failed to set bypass' });
  }
});

/**
 * GET /v1/admin/list-bypass
 * List all users with paywall bypass enabled
 * 
 * Headers:
 *   Authorization: <REVENUECAT_WEBHOOK_SECRET>
 */
adminRouter.get('/list-bypass', async (req, res) => {
  try {
    // Verify admin secret (trim to handle env var trailing newlines)
    const adminSecret = ADMIN_SECRET?.trim();
    if (!adminSecret) {
      res.status(500).json({ code: 'config_error', message: 'Admin secret not configured' });
      return;
    }

    const authHeader = (req.headers['authorization'] as string)?.trim();
    if (!timingSafeEqual(authHeader, adminSecret)) {
      res.status(401).json({ code: 'unauthorized', message: 'Invalid authorization' });
      return;
    }

    const snapshot = await getDb()
      .collection('users')
      .where('bypassPaywall', '==', true)
      .get();

    const users = snapshot.docs.map(doc => ({
      userId: doc.id,
      email: doc.data().email || null,
      displayName: doc.data().displayName || null,
    }));

    res.json({
      count: users.length,
      users,
    });
  } catch (err) {
    functions.logger.error('[admin] list-bypass error:', err);
    res.status(500).json({ code: 'server_error', message: 'Failed to list bypass users' });
  }
});
