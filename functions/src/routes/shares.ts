import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { shareLimiter } from '../middlewares/rateLimit';

export const sharesRouter = Router();

const getDb = () => admin.firestore();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createShareSchema = z.object({
  caregiverEmail: z.string().email(),
  role: z.enum(['viewer']).default('viewer'), // Only viewer role supported for now
  message: z.string().optional(),
});

const updateShareSchema = z.object({
  status: z.enum(['accepted', 'revoked']),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /v1/shares
 * List all share relationships for the current user
 * Returns shares where user is owner OR caregiver
 */
sharesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Get shares where user is the owner
    const ownedSharesSnapshot = await getDb()
      .collection('shares')
      .where('ownerId', '==', userId)
      .get();

    // Get shares where user is the caregiver
    const caregiverSharesSnapshot = await getDb()
      .collection('shares')
      .where('caregiverUserId', '==', userId)
      .get();

    const shares = [
      ...ownedSharesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate().toISOString(),
        updatedAt: doc.data().updatedAt?.toDate().toISOString(),
        type: 'outgoing' as const, // User shared their data with someone
      })),
      ...caregiverSharesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate().toISOString(),
        updatedAt: doc.data().updatedAt?.toDate().toISOString(),
        type: 'incoming' as const, // Someone shared their data with user
      })),
    ];

    res.json(shares);
  } catch (error) {
    functions.logger.error('[shares] Error listing shares:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch shares',
    });
  }
});

/**
 * POST /v1/shares
 * Create a new share invitation
 * Owner invites a caregiver by email
 */
sharesRouter.post('/', shareLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerId = req.user!.uid;
    const data = createShareSchema.parse(req.body);

    // Look up caregiver user by email
    let caregiverUserId: string;
    try {
      const caregiverUser = await admin.auth().getUserByEmail(data.caregiverEmail);
      caregiverUserId = caregiverUser.uid;
    } catch (error) {
      res.status(404).json({
        code: 'user_not_found',
        message: 'No user found with that email address',
      });
      return;
    }

    // Prevent sharing with yourself
    if (caregiverUserId === ownerId) {
      res.status(400).json({
        code: 'invalid_share',
        message: 'You cannot share with yourself',
      });
      return;
    }

    // Check if share already exists
    const shareId = `${ownerId}_${caregiverUserId}`;
    const existingShare = await getDb().collection('shares').doc(shareId).get();

    if (existingShare.exists) {
      const existingStatus = existingShare.data()?.status;
      if (existingStatus === 'accepted' || existingStatus === 'pending') {
        res.status(409).json({
          code: 'share_exists',
          message: 'Share already exists with this user',
        });
        return;
      }
      // If previously revoked, allow re-creating
    }

    const now = admin.firestore.Timestamp.now();

    // Create or update share document
    await getDb()
      .collection('shares')
      .doc(shareId)
      .set({
        ownerId,
        caregiverUserId,
        caregiverEmail: data.caregiverEmail,
        role: data.role,
        status: 'pending',
        message: data.message || null,
        createdAt: now,
        updatedAt: now,
      });

    const shareDoc = await getDb().collection('shares').doc(shareId).get();
    const share = shareDoc.data()!;

    functions.logger.info(
      `[shares] Created share invitation from ${ownerId} to ${caregiverUserId}`,
    );

    res.status(201).json({
      id: shareDoc.id,
      ...share,
      createdAt: share.createdAt?.toDate().toISOString(),
      updatedAt: share.updatedAt?.toDate().toISOString(),
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

    functions.logger.error('[shares] Error creating share:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to create share',
    });
  }
});

/**
 * GET /v1/shares/:id
 * Get a specific share by ID
 * Only accessible by owner or caregiver
 */
sharesRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const shareId = req.params.id;

    const shareDoc = await getDb().collection('shares').doc(shareId).get();

    if (!shareDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Share not found',
      });
      return;
    }

    const share = shareDoc.data()!;

    // Verify user is either owner or caregiver
    if (share.ownerId !== userId && share.caregiverUserId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this share',
      });
      return;
    }

    res.json({
      id: shareDoc.id,
      ...share,
      createdAt: share.createdAt?.toDate().toISOString(),
      updatedAt: share.updatedAt?.toDate().toISOString(),
    });
  } catch (error) {
    functions.logger.error('[shares] Error getting share:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch share',
    });
  }
});

/**
 * PATCH /v1/shares/:id
 * Update share status
 * - Owner can revoke
 * - Caregiver can accept
 */
sharesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const shareId = req.params.id;

    const data = updateShareSchema.parse(req.body);

    const shareRef = getDb().collection('shares').doc(shareId);
    const shareDoc = await shareRef.get();

    if (!shareDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Share not found',
      });
      return;
    }

    const share = shareDoc.data()!;

    // Owner revoking access
    if (userId === share.ownerId && data.status === 'revoked') {
      await shareRef.update({
        status: 'revoked',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`[shares] Owner ${userId} revoked share ${shareId}`);

      const updatedDoc = await shareRef.get();
      const updatedShare = updatedDoc.data()!;

      res.json({
        id: shareId,
        ...updatedShare,
        createdAt: updatedShare.createdAt?.toDate().toISOString(),
        updatedAt: updatedShare.updatedAt?.toDate().toISOString(),
      });
      return;
    }

    // Caregiver accepting invitation
    if (
      userId === share.caregiverUserId &&
      share.status === 'pending' &&
      data.status === 'accepted'
    ) {
      await shareRef.update({
        status: 'accepted',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`[shares] Caregiver ${userId} accepted share ${shareId}`);

      const updatedDoc = await shareRef.get();
      const updatedShare = updatedDoc.data()!;

      res.json({
        id: shareId,
        ...updatedShare,
        createdAt: updatedShare.createdAt?.toDate().toISOString(),
        updatedAt: updatedShare.updatedAt?.toDate().toISOString(),
        acceptedAt: updatedShare.acceptedAt?.toDate().toISOString(),
      });
      return;
    }

    // Invalid state transition
    res.status(400).json({
      code: 'invalid_transition',
      message: 'Invalid status transition for your role',
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

    functions.logger.error('[shares] Error updating share:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update share',
    });
  }
});

/**
 * DELETE /v1/shares/:id
 * Delete a share (disabled - use revoke instead)
 * Keeping revoked shares provides audit trail
 */
sharesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  res.status(405).json({
    code: 'method_not_allowed',
    message: 'Use PATCH with status: "revoked" instead of DELETE',
  });
});
