import { Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

import { AuthRequest } from './auth';

const getDb = () => admin.firestore();
const TRIAL_DAYS = 14;

const isTimestampInFuture = (value: any): boolean => {
  try {
    if (value?.toDate) {
      return value.toDate().getTime() > Date.now();
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) && parsed > Date.now();
    }
  } catch (error) {
    functions.logger.warn('[subscription] Failed to parse timestamp', error);
  }
  return false;
};

const bootstrapUserIfMissing = async (userId: string) => {
  const userRef = getDb().collection('users').doc(userId);
  const snap = await userRef.get();
  if (snap.exists) return snap;

  const now = admin.firestore.Timestamp.now();
  const trialEndsAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );

  await userRef.set(
    {
      createdAt: now,
      updatedAt: now,
      trialStartedAt: now,
      trialEndsAt,
      subscriptionStatus: 'trial',
    },
    { merge: true },
  );

  return userRef.get();
};

export async function requireSubscription(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (process.env.SUBSCRIPTION_ENFORCEMENT_DISABLED === 'true') {
      next();
      return;
    }

    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({
        code: 'unauthorized',
        message: 'Missing authenticated user',
      });
      return;
    }

    const userDoc = await bootstrapUserIfMissing(userId);
    const data = userDoc.data() ?? {};

    const status =
      typeof data.subscriptionStatus === 'string' ? data.subscriptionStatus : undefined;
    const hasActiveSub = status === 'active';
    const inTrial = isTimestampInFuture(data.trialEndsAt);

    if (hasActiveSub || inTrial || status === 'trial') {
      next();
      return;
    }

    functions.logger.info('[subscription] Blocked premium access', {
      userId,
      status: status ?? 'unknown',
    });

    res.status(402).json({
      code: 'payment_required',
      message: 'Subscription required for this feature',
      userMessage:
        'Your trial has ended. Please subscribe in the LumiMD app to keep using AI summaries.',
    });
  } catch (error) {
    functions.logger.error('[subscription] Enforcement error', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Unable to verify subscription status',
    });
  }
}

