/**
 * Subscription Routes
 *
 * Handles App Store Server Notifications V2 webhook for subscription events.
 * When Apple sends a notification (purchase, renewal, expiry, etc.), this
 * endpoint updates the user's subscription status in Firestore.
 *
 * Setup in App Store Connect:
 * 1. Go to App Information → App Store Server Notifications
 * 2. Set Production URL: https://[YOUR_FUNCTIONS_URL]/api/v1/subscriptions/apple-webhook
 * 3. Set Version: V2
 */

import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const subscriptionsRouter = Router();

const getDb = () => admin.firestore();

// Notification types from Apple
type NotificationType =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'DID_FAIL_TO_RENEW'
  | 'EXPIRED'
  | 'GRACE_PERIOD_EXPIRED'
  | 'OFFER_REDEEMED'
  | 'REFUND'
  | 'REVOKE'
  | string;

/**
 * Map Apple notification type to our subscription status
 */
function mapNotificationToStatus(
  type: NotificationType,
  subtype?: string,
): 'active' | 'expired' {
  // Active states
  if (
    type === 'SUBSCRIBED' ||
    type === 'DID_RENEW' ||
    type === 'OFFER_REDEEMED'
  ) {
    return 'active';
  }

  // Expired/cancelled states
  if (
    type === 'EXPIRED' ||
    type === 'DID_FAIL_TO_RENEW' ||
    type === 'GRACE_PERIOD_EXPIRED' ||
    type === 'REFUND' ||
    type === 'REVOKE'
  ) {
    return 'expired';
  }

  // Auto-renew disabled (still active until expiry)
  if (type === 'DID_CHANGE_RENEWAL_STATUS' && subtype === 'AUTO_RENEW_DISABLED') {
    return 'active'; // Still active, just won't renew
  }

  // Default to active for unknown types
  return 'active';
}

/**
 * Decode base64url to string
 */
function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Decode JWS payload (without verification - add verification for production)
 */
function decodeJwsPayload<T>(jws?: string): T | null {
  if (!jws || typeof jws !== 'string') return null;

  const parts = jws.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = base64UrlDecode(parts[1]);
    return JSON.parse(payload) as T;
  } catch (error) {
    functions.logger.error('[subscriptions] Failed to decode JWS payload', error);
    return null;
  }
}

/**
 * POST /v1/subscriptions/apple-webhook
 *
 * Receives App Store Server Notifications V2
 * https://developer.apple.com/documentation/appstoreservernotifications
 */
subscriptionsRouter.post('/apple-webhook', async (req, res) => {
  const { signedPayload } = req.body || {};

  if (!signedPayload || typeof signedPayload !== 'string') {
    functions.logger.warn('[subscriptions] Missing signedPayload');
    res.status(400).json({ message: 'Missing signedPayload' });
    return;
  }

  // Decode the notification
  const notification = decodeJwsPayload<any>(signedPayload);
  if (!notification) {
    functions.logger.warn('[subscriptions] Invalid signedPayload');
    res.status(400).json({ message: 'Invalid signedPayload' });
    return;
  }

  const notificationType: NotificationType = notification.notificationType;
  const subtype: string | undefined = notification.subtype;

  // Decode transaction info
  const signedTransactionInfo: string | undefined = notification.data?.signedTransactionInfo;
  const transaction = decodeJwsPayload<any>(signedTransactionInfo);

  // Get user ID from appAccountToken (set when initiating purchase)
  // Note: You need to set appAccountToken to Firebase UID when calling purchase
  const userId: string | undefined = transaction?.appAccountToken;

  if (!userId) {
    functions.logger.info('[subscriptions] No appAccountToken in transaction, ignoring', {
      notificationType,
      hasTransaction: !!transaction,
    });
    // Return 200 to acknowledge receipt (Apple will retry on non-2xx)
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  // Map to subscription status
  const status = mapNotificationToStatus(notificationType, subtype);

  // Parse expiration date
  const expiresMs =
    typeof transaction?.expiresDate === 'number'
      ? transaction.expiresDate
      : typeof transaction?.expiresDate === 'string'
        ? Number(transaction.expiresDate)
        : undefined;

  // Update Firestore
  const update: Record<string, any> = {
    subscriptionStatus: status,
    subscriptionPlatform: 'ios',
    originalTransactionId: transaction?.originalTransactionId ?? null,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  if (expiresMs && Number.isFinite(expiresMs)) {
    update.subscriptionExpiresAt = admin.firestore.Timestamp.fromMillis(expiresMs);
  }

  try {
    await getDb().collection('users').doc(userId).set(update, { merge: true });

    functions.logger.info('[subscriptions] Updated subscription', {
      userId,
      notificationType,
      status,
      expiresAt: update.subscriptionExpiresAt?.toDate?.()?.toISOString?.(),
    });

    res.status(200).json({ received: true });
  } catch (error) {
    functions.logger.error('[subscriptions] Failed to update user', { userId, error });
    res.status(500).json({ message: 'Failed to update subscription' });
  }
});
