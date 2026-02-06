import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';

import { requireAuth, AuthRequest } from '../middlewares/auth';

export const usersRouter = Router();

const getDb = () => admin.firestore();
const FIRESTORE_DELETE_BATCH_SIZE = 450;

type DeletionQueryTarget = {
  collection: string;
  field: string;
  value: string;
};

const buildDeletionTargets = (userId: string, userEmailCandidates: string[]): DeletionQueryTarget[] => {
  const targets: DeletionQueryTarget[] = [
    { collection: 'visits', field: 'userId', value: userId },
    { collection: 'actions', field: 'userId', value: userId },
    { collection: 'medications', field: 'userId', value: userId },
    { collection: 'medicationReminders', field: 'userId', value: userId },
    { collection: 'medicationLogs', field: 'userId', value: userId },
    { collection: 'healthLogs', field: 'userId', value: userId },
    { collection: 'nudges', field: 'userId', value: userId },
    { collection: 'shares', field: 'ownerId', value: userId },
    { collection: 'shares', field: 'caregiverUserId', value: userId },
    { collection: 'shareInvites', field: 'ownerId', value: userId },
    { collection: 'shareInvites', field: 'caregiverUserId', value: userId },
    { collection: 'caregiverNotes', field: 'patientId', value: userId },
    { collection: 'caregiverNotes', field: 'caregiverId', value: userId },
    { collection: 'careTasks', field: 'patientId', value: userId },
    { collection: 'careTasks', field: 'caregiverId', value: userId },
    { collection: 'caregiverEmailLog', field: 'userId', value: userId },
    { collection: 'medicationSafetyCache', field: 'userId', value: userId },
    { collection: 'medicationSafetyExternalCache', field: 'userId', value: userId },
    { collection: 'auth_handoffs', field: 'userId', value: userId },
  ];

  userEmailCandidates.forEach((email) => {
    targets.push(
      { collection: 'shares', field: 'ownerEmail', value: email },
      { collection: 'shares', field: 'caregiverEmail', value: email },
      { collection: 'shareInvites', field: 'ownerEmail', value: email },
      { collection: 'shareInvites', field: 'caregiverEmail', value: email },
      { collection: 'shareInvites', field: 'inviteeEmail', value: email },
    );
  });

  return targets;
};

const fetchDocsForDeletion = async (targets: DeletionQueryTarget[]) => {
  const snapshots = await Promise.all(
    targets.map((target) =>
      getDb().collection(target.collection).where(target.field, '==', target.value).get(),
    ),
  );
  return snapshots.flatMap((snapshot) => snapshot.docs);
};

const fetchUserSubcollectionDocs = async (userId: string) => {
  const userRef = getDb().collection('users').doc(userId);
  const subcollections = await userRef.listCollections();
  if (subcollections.length === 0) {
    return [];
  }

  const snapshots = await Promise.all(subcollections.map((subcollectionRef) => subcollectionRef.get()));
  return snapshots.flatMap((snapshot) => snapshot.docs);
};

const deleteDocsInBatches = async (docRefs: admin.firestore.DocumentReference[]): Promise<number> => {
  const uniqueDocRefs = new Map<string, admin.firestore.DocumentReference>();
  docRefs.forEach((ref) => uniqueDocRefs.set(ref.path, ref));

  const refs = Array.from(uniqueDocRefs.values());
  if (refs.length === 0) {
    return 0;
  }

  let deletedCount = 0;
  for (let start = 0; start < refs.length; start += FIRESTORE_DELETE_BATCH_SIZE) {
    const batch = getDb().batch();
    const chunk = refs.slice(start, start + FIRESTORE_DELETE_BATCH_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deletedCount += chunk.length;
  }

  return deletedCount;
};

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
  // Stable app-install identifier. Lets us reassign device ownership even if push token rotates.
  deviceId: z.string().min(1).max(200).optional(),
  // Previous Expo token seen on this device (helps cleanup when tokens rotate).
  previousToken: z.string().min(1).optional(),
});

const unregisterPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
});

// Legacy caregiver schemas removed - now using shares collection

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
 * 
 * IMPORTANT: A device token can only belong to ONE user at a time.
 * When registering, we first remove this token from ALL other users
 * to prevent cross-user notification leaks (e.g., when switching accounts).
 */
usersRouter.post('/push-tokens', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const payload = registerPushTokenSchema.parse(req.body);
    const { token, platform, timezone, deviceId, previousToken } = payload;

    const now = admin.firestore.Timestamp.now();
    const userRef = getDb().collection('users').doc(userId);
    const tokensRef = userRef.collection('pushTokens');

    // CRITICAL: Remove this device/token from ALL other users first.
    // We clean by token and (when provided) by stable deviceId to handle token rotation.
    const staleTokenRefs = new Map<string, admin.firestore.DocumentReference>();

    try {
      const tokensToClean = new Set<string>([token]);
      if (previousToken && previousToken !== token) {
        tokensToClean.add(previousToken);
      }

      for (const tokenToClean of tokensToClean) {
        const allTokensWithThisValue = await getDb()
          .collectionGroup('pushTokens')
          .where('token', '==', tokenToClean)
          .get();

        for (const tokenDoc of allTokensWithThisValue.docs) {
          const pathParts = tokenDoc.ref.path.split('/');
          const tokenOwnerId = pathParts[1];
          if (tokenOwnerId !== userId) {
            staleTokenRefs.set(tokenDoc.ref.path, tokenDoc.ref);
          }
        }
      }
    } catch (tokenCleanupError) {
      functions.logger.warn('[users] Error cleaning stale tokens by token (non-fatal):', tokenCleanupError);
    }

    if (deviceId) {
      try {
        const allTokensForDevice = await getDb()
          .collectionGroup('pushTokens')
          .where('deviceId', '==', deviceId)
          .get();

        for (const tokenDoc of allTokensForDevice.docs) {
          const pathParts = tokenDoc.ref.path.split('/');
          const tokenOwnerId = pathParts[1];
          if (tokenOwnerId !== userId) {
            staleTokenRefs.set(tokenDoc.ref.path, tokenDoc.ref);
          }
        }
      } catch (deviceCleanupError) {
        functions.logger.warn('[users] Error cleaning stale tokens by deviceId (non-fatal):', deviceCleanupError);
      }
    }

    if (staleTokenRefs.size > 0) {
      const batch = getDb().batch();
      staleTokenRefs.forEach((ref) => batch.delete(ref));
      await batch.commit();
      functions.logger.info(
        `[users] Removed ${staleTokenRefs.size} stale push token(s) - device now belongs to user ${userId}`,
      );
    }

    // Check if token already exists for current user
    const existingTokenQuery = await tokensRef.where('token', '==', token).limit(1).get();
    let existingDoc = existingTokenQuery.empty ? null : existingTokenQuery.docs[0];

    if (!existingDoc && deviceId) {
      const existingByDeviceQuery = await tokensRef.where('deviceId', '==', deviceId).limit(1).get();
      if (!existingByDeviceQuery.empty) {
        existingDoc = existingByDeviceQuery.docs[0];
      }
    }

    if (existingDoc) {
      // Update existing token
      const updateData: Record<string, unknown> = {
        token,
        platform,
        timezone: timezone || null,
        updatedAt: now,
        lastActive: now,
      };
      if (deviceId) {
        updateData.deviceId = deviceId;
      }
      await existingDoc.ref.update(updateData);

      functions.logger.info(`[users] Updated push token for user ${userId}`);
    } else {
      // Create new token document
      const createData: Record<string, unknown> = {
        token,
        platform,
        timezone: timezone || null,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
      };
      if (deviceId) {
        createData.deviceId = deviceId;
      }
      await tokensRef.add(createData);

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
 * DELETE /v1/users/push-tokens/all
 * Unregister ALL push notification tokens for the authenticated user
 * Used during logout to ensure no stale tokens remain
 */
usersRouter.delete('/push-tokens/all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    const tokensRef = getDb().collection('users').doc(userId).collection('pushTokens');
    const tokensSnapshot = await tokensRef.get();

    if (tokensSnapshot.empty) {
      functions.logger.info(`[users] No push tokens to delete for user ${userId}`);
      res.status(204).send();
      return;
    }

    // Delete all tokens for this user
    const batch = getDb().batch();
    tokensSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    functions.logger.info(`[users] Deleted ${tokensSnapshot.size} push token(s) for user ${userId} during logout`);

    res.status(204).send();
  } catch (error) {
    functions.logger.error('[users] Error deleting all push tokens:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to delete push tokens',
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

    // Pull email variants for legacy docs that may have only email-based links.
    const authUser = await admin.auth().getUser(userId);
    const emailCandidates = Array.from(
      new Set(
        [authUser.email?.trim(), authUser.email?.toLowerCase().trim()].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );

    const deletionTargets = buildDeletionTargets(userId, emailCandidates);

    const [queryDocs, userSubcollectionDocs] = await Promise.all([
      fetchDocsForDeletion(deletionTargets),
      fetchUserSubcollectionDocs(userId),
    ]);

    const directDocRefs: admin.firestore.DocumentReference[] = [
      getDb().collection('users').doc(userId),
      getDb().collection('patientContexts').doc(userId),
      getDb().collection('patientEvaluations').doc(userId),
    ];

    const deleteCount = await deleteDocsInBatches([
      ...queryDocs.map((doc) => doc.ref),
      ...userSubcollectionDocs.map((doc) => doc.ref),
      ...directDocRefs,
    ]);

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
// CAREGIVER MANAGEMENT (uses shares collection as canonical source)
// =============================================================================

/**
 * GET /v1/users/me/caregivers
 * List all caregivers for the authenticated user
 * Now uses shares collection as the canonical source
 */
usersRouter.get('/me/caregivers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Get caregivers from shares collection (outgoing shares where user is owner)
    const sharesSnapshot = await getDb()
      .collection('shares')
      .where('ownerId', '==', userId)
      .get();

    // Also get pending invites
    const invitesSnapshot = await getDb()
      .collection('shareInvites')
      .where('ownerId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    const caregivers = [];

    // Add accepted shares as active caregivers
    for (const doc of sharesSnapshot.docs) {
      const share = doc.data();
      if (share.status === 'accepted') {
        caregivers.push({
          id: doc.id,
          name: share.caregiverEmail?.split('@')[0] || 'Caregiver',
          email: share.caregiverEmail,
          relationship: share.role || 'viewer',
          status: 'active',
          shareUserId: share.caregiverUserId,
          createdAt: share.createdAt?.toDate?.()?.toISOString() ?? null,
        });
      }
    }

    // Add pending invites
    for (const doc of invitesSnapshot.docs) {
      const invite = doc.data();
      const email = invite.caregiverEmail || invite.inviteeEmail;
      caregivers.push({
        id: doc.id,
        name: email?.split('@')[0] || 'Pending',
        email,
        relationship: invite.role || 'viewer',
        status: 'pending',
        createdAt: invite.createdAt?.toDate?.()?.toISOString() ?? null,
      });
    }

    res.json({
      caregivers,
      autoShareWithCaregivers: false, // Deprecated field
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
 * Add a new caregiver - redirects to /v1/shares/invite
 * @deprecated Use POST /v1/shares/invite instead
 */
usersRouter.post('/me/caregivers', requireAuth, async (req: AuthRequest, res) => {
  // Redirect to the new shares-based invite system
  res.status(410).json({
    code: 'deprecated',
    message: 'This endpoint is deprecated. Use POST /v1/shares/invite instead.',
    newEndpoint: '/v1/shares/invite',
  });
});

/**
 * PUT /v1/users/me/caregivers/:id
 * @deprecated Caregiver management now uses shares collection
 */
usersRouter.put('/me/caregivers/:id', requireAuth, async (req: AuthRequest, res) => {
  res.status(410).json({
    code: 'deprecated',
    message: 'This endpoint is deprecated. Manage caregivers via /v1/shares endpoints.',
  });
});

/**
 * DELETE /v1/users/me/caregivers/:id
 * Remove a caregiver - now uses shares collection
 */
usersRouter.delete('/me/caregivers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const caregiverId = req.params.id;
    const now = admin.firestore.Timestamp.now();

    // Check if it's a share ID (new system)
    const shareRef = getDb().collection('shares').doc(caregiverId);
    const shareDoc = await shareRef.get();

    if (shareDoc.exists && shareDoc.data()?.ownerId === userId) {
      await shareRef.update({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      });
      functions.logger.info(`[users] Revoked share ${caregiverId} for user ${userId}`);
      res.status(204).send();
      return;
    }

    // Check if it's a pending invite
    const inviteRef = getDb().collection('shareInvites').doc(caregiverId);
    const inviteDoc = await inviteRef.get();

    if (inviteDoc.exists && inviteDoc.data()?.ownerId === userId) {
      await inviteRef.update({
        status: 'revoked',
        updatedAt: now,
      });
      functions.logger.info(`[users] Revoked invite ${caregiverId} for user ${userId}`);
      res.status(204).send();
      return;
    }

    res.status(404).json({
      code: 'not_found',
      message: 'Caregiver not found',
    });
  } catch (error) {
    functions.logger.error('[users] Error removing caregiver:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to remove caregiver',
    });
  }
});
