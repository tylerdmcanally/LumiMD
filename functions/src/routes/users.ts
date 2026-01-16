import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';

import { requireAuth, AuthRequest } from '../middlewares/auth';

export const usersRouter = Router();

const getDb = () => admin.firestore();

const userRoleSchema = z.enum(['patient', 'caregiver']);

const updateProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  dateOfBirth: z.string().max(32).optional(),
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  folders: z.array(z.string()).optional(),
  autoShareWithCaregivers: z.boolean().optional(),
  roles: z.array(userRoleSchema).optional(),
  primaryRole: userRoleSchema.optional(),
});

const registerPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android']),
  timezone: z.string().optional(), // e.g., 'America/New_York'
});

const unregisterPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
});

// Caregiver schemas
const addCaregiverSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  relationship: z.string().max(50).optional(),
});

const updateCaregiverSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  relationship: z.string().max(50).optional(),
});

const MAX_CAREGIVERS = 5;

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

const normalizeRoles = (roles?: Array<'patient' | 'caregiver'>) => {
  if (!Array.isArray(roles)) return undefined;
  return Array.from(new Set(roles)).filter((role) => role === 'patient' || role === 'caregiver');
};

const isProfileComplete = (data: Record<string, unknown>): boolean => {
  const hasFirstName =
    typeof data.firstName === 'string' && data.firstName.trim().length > 0;
  const hasDob = typeof data.dateOfBirth === 'string' && data.dateOfBirth.trim().length > 0;
  return hasFirstName && hasDob;
};


usersRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userRef = getDb().collection('users').doc(userId);
    let userDoc = await userRef.get();

    // Bootstrap profile on first fetch
    if (!userDoc.exists) {
      const now = admin.firestore.Timestamp.now();
      await userRef.set(
        {
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      userDoc = await userRef.get();
    }

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
      roles: Array.isArray(data.roles) ? data.roles : [],
      primaryRole: typeof data.primaryRole === 'string' ? data.primaryRole : null,
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

    if (payload.roles !== undefined) {
      updateData.roles = normalizeRoles(payload.roles) ?? [];
    }

    if (payload.primaryRole !== undefined) {
      updateData.primaryRole = payload.primaryRole;
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
      roles: Array.isArray(data.roles) ? data.roles : [],
      primaryRole: typeof data.primaryRole === 'string' ? data.primaryRole : null,
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
    const { token, platform, timezone } = payload;

    const userRef = getDb().collection('users').doc(userId);
    const tokensRef = userRef.collection('pushTokens');

    // Check if token already exists
    const existingTokenQuery = await tokensRef.where('token', '==', token).limit(1).get();

    const now = admin.firestore.Timestamp.now();

    if (!existingTokenQuery.empty) {
      // Update existing token
      const existingDoc = existingTokenQuery.docs[0];
      await existingDoc.ref.update({
        platform,
        timezone: timezone || null,
        updatedAt: now,
        lastActive: now,
      });

      functions.logger.info(`[users] Updated push token for user ${userId}`);
    } else {
      // Create new token document
      await tokensRef.add({
        token,
        platform,
        timezone: timezone || null,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
      });

      functions.logger.info(`[users] Registered new push token for user ${userId}`);
    }

    // Always update user's timezone on their profile (reflects current device location)
    if (timezone) {
      await userRef.set({ timezone, updatedAt: now }, { merge: true });
      functions.logger.info(`[users] Updated timezone for user ${userId}: ${timezone}`);
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

/**
 * GET /v1/users/me/export
 * Export all user data in JSON format
 */
usersRouter.get('/me/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Fetch all user data
    const [userDoc, visitsSnapshot, actionsSnapshot, medicationsSnapshot, sharesSnapshot] = await Promise.all([
      getDb().collection('users').doc(userId).get(),
      getDb().collection('visits').where('userId', '==', userId).get(),
      getDb().collection('actions').where('userId', '==', userId).get(),
      getDb().collection('medications').where('userId', '==', userId).get(),
      getDb().collection('shares').where('ownerId', '==', userId).get(),
    ]);

    const userData = userDoc.exists ? userDoc.data() : {};

    const exportData = {
      user: {
        id: userId,
        ...userData,
        createdAt: userData?.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: userData?.updatedAt?.toDate?.().toISOString() ?? null,
      },
      visits: visitsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: doc.data().updatedAt?.toDate?.().toISOString() ?? null,
        visitDate: doc.data().visitDate?.toDate?.().toISOString() ?? null,
        processedAt: doc.data().processedAt?.toDate?.().toISOString() ?? null,
      })),
      actions: actionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: doc.data().updatedAt?.toDate?.().toISOString() ?? null,
        dueAt: doc.data().dueAt?.toDate?.().toISOString() ?? null,
        completedAt: doc.data().completedAt?.toDate?.().toISOString() ?? null,
      })),
      medications: medicationsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: doc.data().updatedAt?.toDate?.().toISOString() ?? null,
        startedAt: doc.data().startedAt?.toDate?.().toISOString() ?? null,
        stoppedAt: doc.data().stoppedAt?.toDate?.().toISOString() ?? null,
      })),
      shares: sharesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: doc.data().updatedAt?.toDate?.().toISOString() ?? null,
        acceptedAt: doc.data().acceptedAt?.toDate?.().toISOString() ?? null,
      })),
      exportedAt: new Date().toISOString(),
    };

    functions.logger.info(`[users] User ${userId} exported their data`);

    res.json(exportData);
  } catch (error) {
    functions.logger.error('[users] Error exporting user data:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to export user data',
    });
  }
});

/**
 * DELETE /v1/users/me
 * Delete user account and all associated data
 * This is a destructive operation that cannot be undone
 */
usersRouter.delete('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    functions.logger.info(`[users] Starting account deletion for user ${userId}`);

    // Delete user data in batches (Firestore has 500 doc limit per batch)
    const batch = getDb().batch();
    let deleteCount = 0;

    // Delete visits
    const visitsSnapshot = await getDb().collection('visits').where('userId', '==', userId).get();
    visitsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // Delete actions
    const actionsSnapshot = await getDb().collection('actions').where('userId', '==', userId).get();
    actionsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // Delete medications
    const medicationsSnapshot = await getDb().collection('medications').where('userId', '==', userId).get();
    medicationsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // Delete shares where user is owner
    const sharesSnapshot = await getDb().collection('shares').where('ownerId', '==', userId).get();
    sharesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // Delete push tokens subcollection
    const pushTokensSnapshot = await getDb()
      .collection('users')
      .doc(userId)
      .collection('pushTokens')
      .get();
    pushTokensSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    // Delete user profile
    batch.delete(getDb().collection('users').doc(userId));
    deleteCount++;

    // Commit batch deletion
    await batch.commit();

    // Delete Firebase Auth user
    await admin.auth().deleteUser(userId);

    functions.logger.info(`[users] Successfully deleted account for user ${userId}. Deleted ${deleteCount} documents.`);

    res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted',
      deletedDocuments: deleteCount,
    });
  } catch (error) {
    functions.logger.error('[users] Error deleting user account:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to delete account. Please contact support.',
    });
  }
});

// =============================================================================
// CAREGIVER MANAGEMENT
// =============================================================================

interface Caregiver {
  id: string;
  name: string;
  email: string;
  relationship?: string;
  status: 'pending' | 'active' | 'paused';
  shareUserId?: string;
  createdAt: admin.firestore.Timestamp;
  emailPausedAt?: admin.firestore.Timestamp;
}

/**
 * GET /v1/users/me/caregivers
 * List all caregivers for the authenticated user
 */
usersRouter.get('/me/caregivers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.json({ caregivers: [], autoShareWithCaregivers: false });
      return;
    }

    const data = userDoc.data() || {};
    const caregivers = Array.isArray(data.caregivers) ? data.caregivers : [];

    res.json({
      caregivers: caregivers.map((c: Caregiver) => ({
        ...c,
        createdAt: c.createdAt?.toDate?.()?.toISOString() ?? null,
        emailPausedAt: c.emailPausedAt?.toDate?.()?.toISOString() ?? null,
      })),
      autoShareWithCaregivers: data.autoShareWithCaregivers ?? false,
    });
  } catch (error) {
    functions.logger.error('[users] Error listing caregivers:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to list caregivers',
    });
  }
});

/**
 * POST /v1/users/me/caregivers
 * Add a new caregiver
 */
usersRouter.post('/me/caregivers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const payload = addCaregiverSchema.parse(req.body);

    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();
    const data = userDoc.exists ? userDoc.data() || {} : {};
    const caregivers: Caregiver[] = Array.isArray(data.caregivers) ? data.caregivers : [];

    // Check caregiver limit
    if (caregivers.length >= MAX_CAREGIVERS) {
      res.status(400).json({
        code: 'limit_reached',
        message: `Maximum of ${MAX_CAREGIVERS} caregivers allowed`,
      });
      return;
    }

    // Check for duplicate email
    const normalizedEmail = payload.email.toLowerCase().trim();
    if (caregivers.some(c => c.email.toLowerCase() === normalizedEmail)) {
      res.status(400).json({
        code: 'duplicate_email',
        message: 'A caregiver with this email already exists',
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const newCaregiver: Caregiver = {
      id: `cg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name: payload.name.trim(),
      email: normalizedEmail,
      relationship: payload.relationship?.trim() || undefined,
      status: 'pending',
      createdAt: now,
    };

    caregivers.push(newCaregiver);
    await userRef.set({ caregivers, updatedAt: now }, { merge: true });

    functions.logger.info(`[users] Added caregiver ${newCaregiver.id} for user ${userId}`);

    // Create share invite record for auto-connection on signup
    try {
      const inviteRef = getDb().collection('shareInvites').doc(); // Auto-ID
      await inviteRef.set({
        ownerId: userId,
        inviteeEmail: normalizedEmail,
        role: 'caregiver', // standard role
        caregiverId: newCaregiver.id,
        status: 'pending',
        createdAt: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        updatedAt: now,
      });
      functions.logger.info(`[users] Created share invite ${inviteRef.id} for ${normalizedEmail}`);
    } catch (err) {
      functions.logger.error('[users] Failed to create share invite record:', err);
      // Continue anyway, this is a "soft" failure
    }

    // Send invite email
    try {
      const { sendCaregiverInviteEmail } = await import('../services/caregiverEmailService');
      await sendCaregiverInviteEmail(userId, newCaregiver);
    } catch (err) {
      functions.logger.error('[users] Failed to send invite email:', err);
      // Continue, don't fail the request
    }

    res.status(201).json({
      ...newCaregiver,
      createdAt: newCaregiver.createdAt.toDate().toISOString(),
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

    functions.logger.error('[users] Error adding caregiver:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to add caregiver',
    });
  }
});

/**
 * PUT /v1/users/me/caregivers/:id
 * Update a caregiver's info
 */
usersRouter.put('/me/caregivers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const caregiverId = req.params.id;
    const payload = updateCaregiverSchema.parse(req.body);

    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Caregiver not found',
      });
      return;
    }

    const data = userDoc.data() || {};
    const caregivers: Caregiver[] = Array.isArray(data.caregivers) ? data.caregivers : [];
    const caregiverIndex = caregivers.findIndex(c => c.id === caregiverId);

    if (caregiverIndex === -1) {
      res.status(404).json({
        code: 'not_found',
        message: 'Caregiver not found',
      });
      return;
    }

    // Update caregiver fields
    if (payload.name !== undefined) {
      caregivers[caregiverIndex].name = payload.name.trim();
    }
    if (payload.relationship !== undefined) {
      caregivers[caregiverIndex].relationship = payload.relationship.trim() || undefined;
    }

    const now = admin.firestore.Timestamp.now();
    await userRef.set({ caregivers, updatedAt: now }, { merge: true });

    functions.logger.info(`[users] Updated caregiver ${caregiverId} for user ${userId}`);

    const updatedCaregiver = caregivers[caregiverIndex];
    res.json({
      ...updatedCaregiver,
      createdAt: updatedCaregiver.createdAt?.toDate?.()?.toISOString() ?? null,
      emailPausedAt: updatedCaregiver.emailPausedAt?.toDate?.()?.toISOString() ?? null,
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

    functions.logger.error('[users] Error updating caregiver:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update caregiver',
    });
  }
});

/**
 * DELETE /v1/users/me/caregivers/:id
 * Remove a caregiver
 */
usersRouter.delete('/me/caregivers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const caregiverId = req.params.id;

    const userRef = getDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Caregiver not found',
      });
      return;
    }

    const data = userDoc.data() || {};
    const caregivers: Caregiver[] = Array.isArray(data.caregivers) ? data.caregivers : [];
    const caregiverIndex = caregivers.findIndex(c => c.id === caregiverId);

    if (caregiverIndex === -1) {
      res.status(404).json({
        code: 'not_found',
        message: 'Caregiver not found',
      });
      return;
    }

    const removedCaregiver = caregivers[caregiverIndex];

    // Remove from array
    caregivers.splice(caregiverIndex, 1);

    const now = admin.firestore.Timestamp.now();
    await userRef.set({ caregivers, updatedAt: now }, { merge: true });

    // If caregiver had a linked account (shareUserId), revoke their share access
    if (removedCaregiver.shareUserId) {
      const shareId = `${userId}_${removedCaregiver.shareUserId}`;
      const shareRef = getDb().collection('shares').doc(shareId);
      const shareDoc = await shareRef.get();

      if (shareDoc.exists) {
        await shareRef.update({
          status: 'revoked',
          revokedAt: now,
          updatedAt: now,
        });
        functions.logger.info(`[users] Revoked share ${shareId} for removed caregiver`);
      }
    }

    functions.logger.info(`[users] Removed caregiver ${caregiverId} for user ${userId}`);

    res.status(204).send();
  } catch (error) {
    functions.logger.error('[users] Error removing caregiver:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to remove caregiver',
    });
  }
});
