import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { randomBytes } from 'crypto';
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
 * Handles both existing users and users without accounts
 */
sharesRouter.post('/', shareLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerId = req.user!.uid;
    const data = createShareSchema.parse(req.body);

    // Get owner info for email
    const ownerUser = await admin.auth().getUser(ownerId);
    const ownerEmail = ownerUser.email || '';
    const ownerProfile = await getDb().collection('users').doc(ownerId).get();
    const ownerData = ownerProfile.data();
    const ownerName =
      ownerData?.preferredName ||
      ownerData?.firstName ||
      ownerUser.displayName ||
      ownerEmail.split('@')[0];

    // Prevent sharing with yourself
    if (ownerEmail.toLowerCase() === data.caregiverEmail.toLowerCase()) {
      res.status(400).json({
        code: 'invalid_share',
        message: 'You cannot share with yourself',
      });
      return;
    }

    // Check for existing share or invite
    const existingInviteQuery = await getDb()
      .collection('shareInvites')
      .where('ownerId', '==', ownerId)
      .where('inviteeEmail', '==', data.caregiverEmail.toLowerCase())
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingInviteQuery.empty) {
      res.status(409).json({
        code: 'invite_exists',
        message: 'An invitation has already been sent to this email',
      });
      return;
    }

    // Try to find existing user
    let caregiverUserId: string | null = null;
    try {
      const caregiverUser = await admin.auth().getUserByEmail(data.caregiverEmail);
      caregiverUserId = caregiverUser.uid;

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
    } catch (error) {
      // User doesn't exist - will create invite instead
      caregiverUserId = null;
    }

    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 7 * 24 * 60 * 60 * 1000, // 7 days
    );

    if (caregiverUserId) {
      // User exists - create share directly
      const shareId = `${ownerId}_${caregiverUserId}`;

      await getDb()
        .collection('shares')
        .doc(shareId)
        .set({
          ownerId,
          caregiverUserId,
          caregiverEmail: data.caregiverEmail.toLowerCase(),
          role: data.role,
          status: 'pending',
          message: data.message || null,
          createdAt: now,
          updatedAt: now,
        });

      // Email will be sent by frontend via Vercel API route
      functions.logger.info(`[shares] Created share invitation from ${ownerId} to existing user ${caregiverUserId}. Email should be sent by frontend.`);

      const shareDoc = await getDb().collection('shares').doc(shareId).get();
      const share = shareDoc.data()!;

      functions.logger.info(
        `[shares] Created share invitation from ${ownerId} to existing user ${caregiverUserId}`,
      );

      res.status(201).json({
        id: shareDoc.id,
        ...share,
        createdAt: share.createdAt?.toDate().toISOString(),
        updatedAt: share.updatedAt?.toDate().toISOString(),
      });
    } else {
      // User doesn't exist - create invite
      const inviteToken = randomBytes(32).toString('base64url');

      await getDb()
        .collection('shareInvites')
        .doc(inviteToken)
        .set({
          ownerId,
          ownerEmail,
          ownerName,
          inviteeEmail: data.caregiverEmail.toLowerCase(),
          status: 'pending',
          message: data.message || null,
          role: data.role,
          createdAt: now,
          expiresAt,
        });

      // Email will be sent by frontend via Vercel API route
      functions.logger.info(`[shares] Created share invite from ${ownerId} to ${data.caregiverEmail} (no account yet). Email should be sent by frontend.`);

      functions.logger.info(
        `[shares] Created share invite from ${ownerId} to ${data.caregiverEmail} (no account yet)`,
      );

      res.status(201).json({
        id: inviteToken,
        ownerId,
        ownerEmail,
        ownerName,
        inviteeEmail: data.caregiverEmail,
        status: 'pending',
        message: data.message || null,
        role: data.role,
        createdAt: now.toDate().toISOString(),
        expiresAt: expiresAt.toDate().toISOString(),
        type: 'invite',
      });
    }
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
 * GET /v1/shares/invites
 * Get pending invites for the current user (by email)
 */
sharesRouter.get('/invites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const user = await admin.auth().getUser(userId);
    const userEmail = user.email?.toLowerCase();

    if (!userEmail) {
      res.status(400).json({
        code: 'no_email',
        message: 'User email is required to check for invitations',
      });
      return;
    }

    const invitesSnapshot = await getDb()
      .collection('shareInvites')
      .where('inviteeEmail', '==', userEmail)
      .where('status', '==', 'pending')
      .get();

    const invites = invitesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString(),
        expiresAt: data.expiresAt?.toDate().toISOString(),
      };
    });

    res.json(invites);
  } catch (error) {
    functions.logger.error('[shares] Error fetching invites:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch invitations',
    });
  }
});

/**
 * PATCH /v1/shares/invites/:id
 * Owner can cancel a pending invite
 */
sharesRouter.patch('/invites/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const inviteId = req.params.id;

    const inviteRef = getDb().collection('shareInvites').doc(inviteId);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invite not found',
      });
      return;
    }

    const invite = inviteDoc.data()!;
    if (invite.ownerId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You are not authorized to modify this invite',
      });
      return;
    }

    if (invite.status !== 'pending') {
      res.status(400).json({
        code: 'invalid_status',
        message: 'Only pending invites can be cancelled',
      });
      return;
    }

    await inviteRef.update({
      status: 'revoked',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await inviteRef.get();
    const updatedInvite = updatedDoc.data()!;

    res.json({
      id: inviteId,
      ...updatedInvite,
      createdAt: updatedInvite.createdAt?.toDate().toISOString(),
      expiresAt: updatedInvite.expiresAt?.toDate().toISOString(),
      updatedAt: updatedInvite.updatedAt?.toDate().toISOString(),
    });
  } catch (error) {
    functions.logger.error('[shares] Error cancelling invite:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to cancel invite',
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
 * POST /v1/shares/accept-invite
 * Accept a share invitation by token
 * Used when caregiver clicks invite link
 */
sharesRouter.post('/accept-invite', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

    // Check if it's a shareInvite (for users without accounts)
    const inviteDoc = await getDb().collection('shareInvites').doc(token).get();

    if (inviteDoc.exists) {
      const invite = inviteDoc.data()!;

      // Verify email matches (normalize both to lowercase for comparison)
      const user = await admin.auth().getUser(userId);
      const userEmail = user.email?.toLowerCase().trim() || '';
      const inviteEmail = invite.inviteeEmail?.toLowerCase().trim() || '';
      
      if (userEmail !== inviteEmail) {
        functions.logger.warn(
          `[shares] Email mismatch for invite ${token}: user email "${userEmail}" does not match invite email "${inviteEmail}"`,
        );
        res.status(403).json({
          code: 'email_mismatch',
          message: 'This invitation was sent to a different email address',
          userMessage: `This invitation was sent to ${invite.inviteeEmail}, but you are signed in as ${user.email}. Please sign in with the email address that received the invitation.`,
        });
        return;
      }

      // Check if expired
      const currentTime = Date.now();
      const expiresAt = invite.expiresAt?.toMillis() || 0;
      if (currentTime > expiresAt) {
        await inviteDoc.ref.update({ status: 'expired' });
        res.status(410).json({
          code: 'invite_expired',
          message: 'This invitation has expired',
        });
        return;
      }

      // Check if already accepted
      if (invite.status !== 'pending') {
        res.status(400).json({
          code: 'invite_already_processed',
          message: 'This invitation has already been processed',
        });
        return;
      }

      // Create the share
      const shareId = `${invite.ownerId}_${userId}`;
      const now = admin.firestore.Timestamp.now();

      await getDb()
        .collection('shares')
        .doc(shareId)
        .set({
          ownerId: invite.ownerId,
          caregiverUserId: userId,
          caregiverEmail: invite.inviteeEmail,
          role: invite.role,
          status: 'accepted',
          message: invite.message || null,
          createdAt: now,
          updatedAt: now,
          acceptedAt: now,
        });

      // Mark invite as accepted
      await inviteDoc.ref.update({
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now,
      });

      functions.logger.info(
        `[shares] User ${userId} accepted invite ${token} from ${invite.ownerId}`,
      );

      const shareDoc = await getDb().collection('shares').doc(shareId).get();
      const share = shareDoc.data()!;

      res.json({
        id: shareId,
        ...share,
        createdAt: share.createdAt?.toDate().toISOString(),
        updatedAt: share.updatedAt?.toDate().toISOString(),
        acceptedAt: share.acceptedAt?.toDate().toISOString(),
      });
      return;
    }

    // Check if it's a direct share (for existing users)
    const shareId = token;
    const shareDoc = await getDb().collection('shares').doc(shareId).get();

    if (!shareDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    const share = shareDoc.data()!;

    // Verify user is the caregiver
    if (share.caregiverUserId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You are not authorized to accept this invitation',
      });
      return;
    }

    // Check if already accepted
    if (share.status === 'accepted') {
      res.json({
        id: shareId,
        ...share,
        createdAt: share.createdAt?.toDate().toISOString(),
        updatedAt: share.updatedAt?.toDate().toISOString(),
        acceptedAt: share.acceptedAt?.toDate().toISOString(),
      });
      return;
    }

    // Accept the share
    if (share.status === 'pending') {
      await shareDoc.ref.update({
        status: 'accepted',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`[shares] User ${userId} accepted share ${shareId}`);

      const updatedDoc = await shareDoc.ref.get();
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

    res.status(400).json({
      code: 'invalid_status',
      message: 'This invitation cannot be accepted',
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

    functions.logger.error('[shares] Error accepting invite:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to accept invitation',
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
