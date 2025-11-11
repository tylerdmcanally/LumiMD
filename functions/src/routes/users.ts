import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';

import { requireAuth, AuthRequest } from '../middlewares/auth';

export const usersRouter = Router();

const getDb = () => admin.firestore();

const updateProfileSchema = z.object({
  allergies: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  folders: z.array(z.string()).optional(),
});

usersRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    const data = userDoc.exists ? userDoc.data() ?? {} : {};

    res.json({
      id: userId,
      allergies: Array.isArray(data.allergies) ? data.allergies : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
    });
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

    if (payload.allergies !== undefined) {
      updateData.allergies = Array.from(
        new Set(
          (payload.allergies || [])
            .map((item) => item?.trim())
            .filter(Boolean) as string[],
        ),
      );
    }

    if (payload.tags !== undefined) {
      updateData.tags = Array.from(
        new Set(
          (payload.tags || [])
            .map((item) => item?.trim())
            .filter(Boolean) as string[],
        ),
      );
    }

    if (payload.folders !== undefined) {
      updateData.folders = Array.from(
        new Set(
          (payload.folders || [])
            .map((item) => item?.trim())
            .filter(Boolean) as string[],
        ),
      );
    }

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      updateData.createdAt = now;
    }

    await userRef.set(updateData, { merge: true });

    const updatedDoc = await userRef.get();
    const data = updatedDoc.data() ?? {};

    res.json({
      id: userId,
      allergies: Array.isArray(data.allergies) ? data.allergies : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
    });
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

