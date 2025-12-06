import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const subscriptionsRouter = Router();

const getDb = () => admin.firestore();

type RevenueCatEvent = {
  event: {
    type: string;
    app_user_id?: string;
    product_id?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number | null;
    environment?: string;
    app_id?: string;
  };
};

function verifySecret(req: any): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return true; // allow if not set to avoid blocking in dev
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof header !== 'string') return false;
  return header === `Bearer ${secret}`;
}

function mapStatus(eventType: string, expirationMs?: number | null): 'active' | 'expired' {
  if (eventType === 'CANCELLATION' || eventType === 'EXPIRATION') return 'expired';
  if (typeof expirationMs === 'number' && expirationMs < Date.now()) return 'expired';
  return 'active';
}

subscriptionsRouter.post('/webhook', async (req, res) => {
  if (!verifySecret(req)) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const payload = req.body as RevenueCatEvent;
  const event = payload?.event;
  if (!event?.app_user_id) {
    res.status(400).json({ message: 'Missing app_user_id' });
    return;
  }

  const userId = event.app_user_id;

  try {
    const status = mapStatus(event.type, event.expiration_at_ms ?? null);
    const trialStartedAt = event.purchased_at_ms
      ? admin.firestore.Timestamp.fromMillis(event.purchased_at_ms)
      : admin.firestore.Timestamp.now();
    const trialEndsAt =
      typeof event.expiration_at_ms === 'number'
        ? admin.firestore.Timestamp.fromMillis(event.expiration_at_ms)
        : null;

    await getDb()
      .collection('users')
      .doc(userId)
      .set(
        {
          subscriptionStatus: status,
          subscriptionPlatform: 'ios',
          revenuecatUserId: userId,
          updatedAt: admin.firestore.Timestamp.now(),
          trialStartedAt,
          ...(trialEndsAt ? { trialEndsAt } : {}),
        },
        { merge: true },
      );

    functions.logger.info(`[subscriptions] Updated subscription for ${userId} via RevenueCat`, {
      type: event.type,
      status,
    });

    res.status(200).json({ received: true });
  } catch (error) {
    functions.logger.error('[subscriptions] Webhook error', error);
    res.status(500).json({ message: 'Failed to process webhook' });
  }
});


