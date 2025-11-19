import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';

import { requireAuth, AuthRequest } from '../middlewares/auth';

export const usersRouter = Router();

const getDb = () => admin.firestore();

const updateProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  dateOfBirth: z.string().max(32).optional(),
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  folders: z.array(z.string()).optional(),
});

const registerPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android']),
});

const unregisterPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
});

const sanitizeString = (value?: string | null) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeStringArray = (values?: string[]) => {
  if (!Array.isArray(values)) return undefined;
  return Array.from(
    new Set(
      values
        .map((item) => sanitizeString(item) ?? '')
        .filter((item): item is string => item.length > 0),
    ),
  );
};

const isProfileComplete = (data: Record<string, unknown>): boolean => {
  const hasName =
    typeof data.firstName === 'string' &&
    data.firstName.trim().length > 0 &&
    typeof data.lastName === 'string' &&
    data.lastName.trim().length > 0;
  const hasDob = typeof data.dateOfBirth === 'string' && data.dateOfBirth.trim().length > 0;
  return hasName && hasDob;
};

usersRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    const data = userDoc.exists ? userDoc.data() ?? {} : {};

    const response = {
      id: userId,
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : '',
      allergies: Array.isArray(data.allergies) ? data.allergies : [],
      medicalHistory: Array.isArray(data.medicalHistory) ? data.medicalHistory : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
      complete: isProfileComplete(data),
    };

    res.json(response);
  } catch (error) {
    functions.logger.error('[users] Error fetching profile:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch user profile',
    });
  }
});

usersRouter.patch('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const payload = updateProfileSchema.parse(req.body);

    const userRef = getDb().collection('users').doc(userId);
    const now = admin.firestore.Timestamp.now();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (payload.firstName !== undefined) {
      updateData.firstName = sanitizeString(payload.firstName) ?? '';
    }

    if (payload.lastName !== undefined) {
      updateData.lastName = sanitizeString(payload.lastName) ?? '';
    }

    if (payload.dateOfBirth !== undefined) {
      updateData.dateOfBirth = sanitizeString(payload.dateOfBirth) ?? '';
    }

    if (payload.allergies !== undefined) {
      updateData.allergies = sanitizeStringArray(payload.allergies) ?? [];
    }

    if (payload.medicalHistory !== undefined) {
      updateData.medicalHistory = sanitizeStringArray(payload.medicalHistory) ?? [];
    }

    if (payload.tags !== undefined) {
      updateData.tags = sanitizeStringArray(payload.tags) ?? [];
    }

    if (payload.folders !== undefined) {
      updateData.folders = sanitizeStringArray(payload.folders) ?? [];
    }

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      updateData.createdAt = now;
    }

    await userRef.set(updateData, { merge: true });

    const updatedDoc = await userRef.get();
    const data = updatedDoc.data() ?? {};

    const response = {
      id: userId,
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : '',
      allergies: Array.isArray(data.allergies) ? data.allergies : [],
      medicalHistory: Array.isArray(data.medicalHistory) ? data.medicalHistory : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
      complete: isProfileComplete(data),
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[users] Error updating profile:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update user profile',
    });
  }
});

/**
 * POST /v1/users/push-tokens
 * Register a push notification token for the authenticated user
 */
usersRouter.post('/push-tokens', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const payload = registerPushTokenSchema.parse(req.body);
    const { token, platform } = payload;

    const tokensRef = getDb().collection('users').doc(userId).collection('pushTokens');
    
    // Check if token already exists
    const existingTokenQuery = await tokensRef.where('token', '==', token).limit(1).get();
    
    const now = admin.firestore.Timestamp.now();
    
    if (!existingTokenQuery.empty) {
      // Update existing token
      const existingDoc = existingTokenQuery.docs[0];
      await existingDoc.ref.update({
        platform,
        updatedAt: now,
        lastActive: now,
      });
      
      functions.logger.info(`[users] Updated push token for user ${userId}`);
    } else {
      // Create new token document
      await tokensRef.add({
        token,
        platform,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
      });
      
      functions.logger.info(`[users] Registered new push token for user ${userId}`);
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[users] Error registering push token:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to register push token',
    });
  }
});

/**
 * DELETE /v1/users/push-tokens
 * Unregister a push notification token for the authenticated user
 */
usersRouter.delete('/push-tokens', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const payload = unregisterPushTokenSchema.parse(req.body);
    const { token } = payload;

    const tokensRef = getDb().collection('users').doc(userId).collection('pushTokens');
    const tokenQuery = await tokensRef.where('token', '==', token).get();

    if (tokenQuery.empty) {
      res.status(404).json({
        code: 'not_found',
        message: 'Push token not found',
      });
      return;
    }

    // Delete all matching tokens (should only be one, but handle multiple just in case)
    const batch = getDb().batch();
    tokenQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    functions.logger.info(`[users] Unregistered push token for user ${userId}`);

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[users] Error unregistering push token:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to unregister push token',
    });
  }
});

