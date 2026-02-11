import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { shareLimiter } from '../middlewares/rateLimit';

export const sharesRouter = Router();

// Lazy-load Resend client
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      functions.logger.warn('[shares] RESEND_API_KEY not configured, emails will not be sent');
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// Web portal URL for invite links
const WEB_PORTAL_URL = process.env.WEB_PORTAL_URL || 'https://portal.lumimd.app';

const getDb = () => admin.firestore();

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim();
};

const toISOStringSafe = (value: unknown): string | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
};

const serializeSharePayload = (
  id: string,
  data: Record<string, unknown>,
  type?: 'outgoing' | 'incoming',
) => ({
  id,
  ...data,
  createdAt: toISOStringSafe(data.createdAt),
  updatedAt: toISOStringSafe(data.updatedAt),
  acceptedAt: toISOStringSafe(data.acceptedAt),
  ...(type ? { type } : {}),
});

const getInviteCaregiverEmail = (invite: Record<string, unknown>): string =>
  normalizeEmail(invite.caregiverEmail ?? invite.inviteeEmail);

const ensureCaregiverRole = async (userId: string) => {
  const userRef = getDb().collection('users').doc(userId);
  const userDoc = await userRef.get();
  const data = userDoc.data() ?? {};
  const existingRoles = Array.isArray(data.roles) ? data.roles : [];
  const roles = Array.from(new Set([...existingRoles, 'caregiver']));

  const update: Record<string, unknown> = {
    roles,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  if (!data.primaryRole) {
    update.primaryRole = 'caregiver';
  }

  await userRef.set(update, { merge: true });
};

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
      ...ownedSharesSnapshot.docs.map((doc) =>
        serializeSharePayload(doc.id, doc.data(), 'outgoing'),
      ),
      ...caregiverSharesSnapshot.docs.map((doc) =>
        serializeSharePayload(doc.id, doc.data(), 'incoming'),
      ),
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
    const caregiverEmail = normalizeEmail(data.caregiverEmail);

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
    if (normalizeEmail(ownerEmail) === caregiverEmail) {
      res.status(400).json({
        code: 'invalid_share',
        message: 'You cannot share with yourself',
      });
      return;
    }

    // Check for existing share or invite
    const [existingInviteByLegacyEmail, existingInviteByCaregiverEmail] = await Promise.all([
      getDb()
        .collection('shareInvites')
        .where('ownerId', '==', ownerId)
        .where('inviteeEmail', '==', caregiverEmail)
        .where('status', '==', 'pending')
        .limit(1)
        .get(),
      getDb()
        .collection('shareInvites')
        .where('ownerId', '==', ownerId)
        .where('caregiverEmail', '==', caregiverEmail)
        .where('status', '==', 'pending')
        .limit(1)
        .get(),
    ]);

    if (!existingInviteByLegacyEmail.empty || !existingInviteByCaregiverEmail.empty) {
      res.status(409).json({
        code: 'invite_exists',
        message: 'An invitation has already been sent to this email',
      });
      return;
    }

    // Try to find existing user
    let caregiverUserId: string | null = null;
    try {
      const caregiverUser = await admin.auth().getUserByEmail(caregiverEmail);
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
          ownerName,
          ownerEmail,
          caregiverUserId,
          caregiverEmail,
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
          inviteeEmail: caregiverEmail,
          caregiverEmail,
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
        caregiverEmail,
        inviteeEmail: caregiverEmail,
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
    const userEmail = normalizeEmail(user.email);

    if (!userEmail) {
      res.status(400).json({
        code: 'no_email',
        message: 'User email is required to check for invitations',
      });
      return;
    }

    const [legacyInvitesSnapshot, currentInvitesSnapshot] = await Promise.all([
      getDb()
        .collection('shareInvites')
        .where('inviteeEmail', '==', userEmail)
        .where('status', '==', 'pending')
        .get(),
      getDb()
        .collection('shareInvites')
        .where('caregiverEmail', '==', userEmail)
        .where('status', '==', 'pending')
        .get(),
    ]);

    const invitesById = new Map<string, admin.firestore.QueryDocumentSnapshot>();
    legacyInvitesSnapshot.docs.forEach((doc) => invitesById.set(doc.id, doc));
    currentInvitesSnapshot.docs.forEach((doc) => invitesById.set(doc.id, doc));

    const invites = Array.from(invitesById.values()).map((doc) => {
      const data = doc.data();
      const caregiverEmail = getInviteCaregiverEmail(data as Record<string, unknown>);
      return {
        id: doc.id,
        ...data,
        caregiverEmail: caregiverEmail || null,
        inviteeEmail: normalizeEmail(data.inviteeEmail) || caregiverEmail || null,
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
sharesRouter.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.uid;
    const shareId = req.params.id;

    // Allow static routes registered later (e.g. /my-invites) to resolve correctly.
    if (shareId === 'my-invites') {
      next();
      return;
    }

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

    res.json(serializeSharePayload(shareDoc.id, share));
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
      const userEmail = normalizeEmail(user.email);
      const inviteEmail = getInviteCaregiverEmail(invite as Record<string, unknown>);

      if (userEmail !== inviteEmail) {
        functions.logger.warn(
          `[shares] Email mismatch for invite ${token}: user email "${userEmail}" does not match invite email "${inviteEmail}"`,
        );
        res.status(403).json({
          code: 'email_mismatch',
          message: 'This invitation was sent to a different email address',
          userMessage: `This invitation was sent to ${inviteEmail || 'a different email address'}, but you are signed in as ${user.email}. Please sign in with the email address that received the invitation.`,
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
          ownerName: invite.ownerName,
          ownerEmail: invite.ownerEmail,
          caregiverUserId: userId,
          caregiverEmail: inviteEmail,
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

      await ensureCaregiverRole(userId);

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

    // Debug logging for 403 issues
    functions.logger.info(`[shares] Accept invite attempt: userId=${userId}, shareId=${shareId}`);
    functions.logger.info(`[shares] Share data: caregiverUserId=${share.caregiverUserId}, ownerId=${share.ownerId}, status=${share.status}, caregiverEmail=${share.caregiverEmail}`);

    // Get current user's email for validation
    const currentUser = await admin.auth().getUser(userId);
    const currentUserEmail = currentUser.email?.toLowerCase().trim();

    // Validate access: either user ID matches OR email matches
    // If email matches but user ID doesn't, update the share with correct user ID
    // This handles cases where accounts were recreated or invite was resent
    const shareEmail = share.caregiverEmail?.toLowerCase().trim();

    if (share.caregiverUserId !== userId) {
      // User ID doesn't match - check if email matches
      if (!currentUserEmail || !shareEmail || currentUserEmail !== shareEmail) {
        functions.logger.warn(`[shares] 403: User ${userId} (email: ${currentUserEmail}) tried to accept share ${shareId} but caregiverEmail is ${shareEmail} and caregiverUserId is ${share.caregiverUserId}`);
        res.status(403).json({
          code: 'forbidden',
          message: 'You are not authorized to accept this invitation',
        });
        return;
      }

      // Email matches - update the caregiverUserId to this user and accept
      functions.logger.info(`[shares] Email match - updating caregiverUserId from ${share.caregiverUserId} to ${userId}`);

      // Also update the document ID to match new format
      const newShareId = `${share.ownerId}_${userId}`;

      await getDb().collection('shares').doc(newShareId).set({
        ...share,
        caregiverUserId: userId,
        status: 'accepted',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Delete the old share with wrong caregiver ID
      await shareDoc.ref.delete();

      await ensureCaregiverRole(userId);

      functions.logger.info(`[shares] User ${userId} accepted share (migrated from ${shareId} to ${newShareId})`);

      const newShareDoc = await getDb().collection('shares').doc(newShareId).get();
      const newShare = newShareDoc.data()!;

      res.json({
        id: newShareId,
        ...newShare,
        createdAt: newShare.createdAt?.toDate().toISOString(),
        updatedAt: newShare.updatedAt?.toDate().toISOString(),
        acceptedAt: newShare.acceptedAt?.toDate().toISOString(),
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

      await ensureCaregiverRole(userId);

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

// =============================================================================
// NEW UNIFIED TOKEN-BASED INVITE SYSTEM
// =============================================================================

/**
 * GET /v1/shares/invite-info/:token
 * Public endpoint to get basic invite information without authentication
 * Used by sign-up page to show caregiver context
 */
sharesRouter.get('/invite-info/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const inviteDoc = await getDb().collection('shareInvites').doc(token).get();

    if (!inviteDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    const invite = inviteDoc.data()!;

    // Check if expired
    const now = Date.now();
    if (invite.expiresAt && invite.expiresAt.toMillis() < now) {
      res.status(410).json({
        code: 'invite_expired',
        message: 'This invitation has expired',
      });
      return;
    }

    // Check if already used
    if (invite.status !== 'pending') {
      res.status(400).json({
        code: 'invite_used',
        message: 'This invitation has already been used',
        status: invite.status,
      });
      return;
    }

    const caregiverEmail = getInviteCaregiverEmail(invite);

    // Return only public info needed for sign-up flow
    res.json({
      ownerName: invite.ownerName || 'Someone',
      caregiverEmail: caregiverEmail || null,
      status: invite.status,
      expiresAt: invite.expiresAt?.toDate().toISOString(),
    });
  } catch (error) {
    functions.logger.error('[shares] Error fetching invite info:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch invitation',
    });
  }
});

/**
 * POST /v1/shares/invite
 * Create a new share invitation using token-based system
 * Always creates a shareInvite with random token, regardless of whether user exists
 * Email is sent by this endpoint directly via Resend
 */
sharesRouter.post('/invite', shareLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerId = req.user!.uid;
    const data = createShareSchema.parse(req.body);
    const caregiverEmail = data.caregiverEmail.toLowerCase().trim();

    // Get owner info
    const ownerUser = await admin.auth().getUser(ownerId);
    const ownerEmail = ownerUser.email?.toLowerCase().trim() || '';
    const ownerProfile = await getDb().collection('users').doc(ownerId).get();
    const ownerData = ownerProfile.data();
    const ownerName =
      ownerData?.preferredName ||
      ownerData?.firstName ||
      ownerUser.displayName ||
      ownerEmail.split('@')[0];

    // Edge case: Prevent sharing with yourself
    if (ownerEmail === caregiverEmail) {
      res.status(400).json({
        code: 'invalid_share',
        message: 'You cannot share with yourself',
      });
      return;
    }

    // Check canonical shares collection for existing relationship
    const existingShareQuery = await getDb()
      .collection('shares')
      .where('ownerId', '==', ownerId)
      .where('caregiverEmail', '==', caregiverEmail)
      .limit(1)
      .get();

    if (!existingShareQuery.empty) {
      const existingShare = existingShareQuery.docs[0].data();
      if (existingShare.status === 'pending') {
        res.status(409).json({
          code: 'invite_exists',
          message: 'An invitation has already been sent to this email',
        });
        return;
      }
      if (existingShare.status === 'accepted') {
        res.status(409).json({
          code: 'share_exists',
          message: 'You are already sharing with this user',
        });
        return;
      }
      // If revoked, allow re-inviting (fall through)
    }

    // Also check for pending invites not yet in shares
    const existingPendingInvite = await getDb()
      .collection('shareInvites')
      .where('ownerId', '==', ownerId)
      .where('caregiverEmail', '==', caregiverEmail)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    const existingLegacyPendingInvite = await getDb()
      .collection('shareInvites')
      .where('ownerId', '==', ownerId)
      .where('inviteeEmail', '==', caregiverEmail)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingPendingInvite.empty || !existingLegacyPendingInvite.empty) {
      res.status(409).json({
        code: 'invite_exists',
        message: 'An invitation has already been sent to this email',
      });
      return;
    }

    // Generate unique token
    const inviteToken = randomBytes(32).toString('base64url');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 7 * 24 * 60 * 60 * 1000 // 7 days
    );

    // Create invite document
    await getDb().collection('shareInvites').doc(inviteToken).set({
      ownerId,
      ownerEmail,
      ownerName,
      caregiverEmail,
      caregiverUserId: null, // Set on acceptance
      status: 'pending',
      role: 'viewer',
      message: data.message || null,
      createdAt: now,
      expiresAt,
      acceptedAt: null,
    });

    functions.logger.info(`[shares] Created invite ${inviteToken} from ${ownerId} to ${caregiverEmail}`);

    // Send invite email directly from backend
    const inviteLink = `${WEB_PORTAL_URL}/care/invite/${inviteToken}`;
    let emailSent = false;
    
    try {
      const resend = getResend();
      if (resend) {
        const hasMessage = !!data.message;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; padding: 16px;">
  <div style="background-color: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    
    <h1 style="color: #078A94; margin: 0 0 16px 0; font-size: 22px; font-weight: 700;">
      ${ownerName} wants to share health info with you
    </h1>
    
    <p style="font-size: 15px; color: #555; margin: 0 0 20px 0;">
      You've been invited to view <strong>${ownerName}'s</strong> medical visits, medications, and care tasks on LumiMD.
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${inviteLink}" 
         style="display: inline-block; background-color: #078A94; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    ${hasMessage ? `<div style="margin: 16px 0; padding: 12px; background-color: #f8f9fa; border-radius: 8px; border-left: 3px solid #078A94;"><p style="margin: 0; font-size: 14px; color: #555; font-style: italic;">"${data.message}"</p></div>` : ''}

    <p style="font-size: 13px; color: #888; margin: 20px 0 0 0; padding-top: 16px; border-top: 1px solid #eee;">
      New to LumiMD? You'll create a free account when you accept. Questions? Reply to this email.
    </p>
  </div>
</body>
</html>
        `.trim();

        const emailText = `
${ownerName} wants to share health info with you

You've been invited to view ${ownerName}'s medical visits, medications, and care tasks on LumiMD.
${hasMessage ? `\n"${data.message}"\n` : ''}
Accept the invitation: ${inviteLink}

New to LumiMD? You'll create a free account when you accept.
        `.trim();

        await resend.emails.send({
          from: 'LumiMD <no-reply@lumimd.app>',
          to: caregiverEmail,
          subject: `${ownerName} wants to share their health information with you`,
          html: emailHtml,
          text: emailText,
        });

        emailSent = true;
        functions.logger.info(`[shares] Sent invite email to ${caregiverEmail}`);
      }
    } catch (emailError) {
      functions.logger.error(`[shares] Failed to send invite email to ${caregiverEmail}:`, emailError);
      // Don't fail the request - invite was created successfully
    }

    // Return invite with email status
    res.status(201).json({
      id: inviteToken,
      ownerId,
      ownerEmail,
      ownerName,
      caregiverEmail,
      status: 'pending',
      role: 'viewer',
      message: data.message || null,
      createdAt: now.toDate().toISOString(),
      expiresAt: expiresAt.toDate().toISOString(),
      emailSent,
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

    functions.logger.error('[shares] Error creating invite:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to create invitation',
    });
  }
});

/**
 * POST /v1/shares/accept/:token
 * Accept a share invitation using token
 * Validates that current user's email matches invite's caregiverEmail
 * Creates accepted share and updates invite status
 */
sharesRouter.post('/accept/:token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const { token } = req.params;

    // Get invite document
    const inviteDoc = await getDb().collection('shareInvites').doc(token).get();

    if (!inviteDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    const invite = inviteDoc.data()!;
    const inviteEmail = getInviteCaregiverEmail(invite);

    // Edge case: Check if expired
    const now = admin.firestore.Timestamp.now();
    if (invite.expiresAt && invite.expiresAt.toMillis() < now.toMillis()) {
      await inviteDoc.ref.update({ status: 'expired' });
      res.status(410).json({
        code: 'invite_expired',
        message: 'This invitation has expired. Please ask for a new invitation.',
      });
      return;
    }

    // Get current user's email
    const currentUser = await admin.auth().getUser(userId);
    const currentUserEmail = normalizeEmail(currentUser.email);

    functions.logger.info(`[shares] Accept attempt: token=${token}, userId=${userId}, userEmail=${currentUserEmail}, inviteEmail=${inviteEmail}`);

    // Edge case: Validate email match
    if (!currentUserEmail || !inviteEmail || currentUserEmail !== inviteEmail) {
      res.status(403).json({
        code: 'email_mismatch',
        message: `This invitation was sent to ${inviteEmail || 'a different email address'}. Please sign in with that email address.`,
        userMessage: `This invitation was sent to ${inviteEmail || 'a different email address'}. Please sign in with that email address.`,
      });
      return;
    }

    // Edge case: Check if already accepted
    if (invite.status === 'accepted') {
      res.json({
        id: token,
        ...invite,
        createdAt: invite.createdAt?.toDate().toISOString(),
        expiresAt: invite.expiresAt?.toDate().toISOString(),
        acceptedAt: invite.acceptedAt?.toDate().toISOString(),
      });
      return;
    }

    // Edge case: Check if revoked
    if (invite.status === 'revoked') {
      res.status(403).json({
        code: 'invite_revoked',
        message: 'This invitation has been revoked.',
      });
      return;
    }

    // Accept the invite
    const acceptedAt = admin.firestore.Timestamp.now();
    await inviteDoc.ref.update({
      status: 'accepted',
      caregiverUserId: userId,
      caregiverEmail: inviteEmail,
      acceptedAt,
    });

    functions.logger.info(`[shares] User ${userId} accepted invite ${token}`);

    // Create/Update canonical share record for caregiver access
    const shareId = `${invite.ownerId}_${userId}`;
    await getDb()
      .collection('shares')
      .doc(shareId)
      .set(
        {
          ownerId: invite.ownerId,
          ownerName: invite.ownerName,
          ownerEmail: invite.ownerEmail,
          caregiverUserId: userId,
          caregiverEmail: inviteEmail,
          role: invite.role || 'viewer',
          status: 'accepted',
          message: invite.message || null,
          createdAt: acceptedAt,
          updatedAt: acceptedAt,
          acceptedAt,
        },
        { merge: true }
      );

    await ensureCaregiverRole(userId);

    // Fetch updated document
    const updatedDoc = await inviteDoc.ref.get();
    const updatedInvite = updatedDoc.data()!;

    res.json({
      id: token,
      ...updatedInvite,
      createdAt: updatedInvite.createdAt?.toDate().toISOString(),
      expiresAt: updatedInvite.expiresAt?.toDate().toISOString(),
      acceptedAt: updatedInvite.acceptedAt?.toDate().toISOString(),
    });
  } catch (error) {
    functions.logger.error('[shares] Error accepting invite:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to accept invitation',
    });
  }
});

/**
 * GET /v1/shares/my-invites
 * Get all invites sent by current user (as patient/owner)
 */
sharesRouter.get('/my-invites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    const invitesSnapshot = await getDb()
      .collection('shareInvites')
      .where('ownerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const invites = invitesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate().toISOString(),
      expiresAt: doc.data().expiresAt?.toDate().toISOString(),
      acceptedAt: doc.data().acceptedAt?.toDate().toISOString(),
    }));

    res.json(invites);
  } catch (error) {
    functions.logger.error('[shares] Error fetching invites:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch invites',
    });
  }
});

/**
 * PATCH /v1/shares/revoke/:token
 * Revoke a share invitation (by owner)
 * Also revokes the canonical shares record if invite was already accepted
 */
sharesRouter.patch('/revoke/:token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const { token } = req.params;

    const inviteDoc = await getDb().collection('shareInvites').doc(token).get();

    if (!inviteDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    const invite = inviteDoc.data()!;

    // Only owner can revoke
    if (invite.ownerId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'Only the owner can revoke this invitation',
      });
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Update invite status
    await inviteDoc.ref.update({
      status: 'revoked',
      updatedAt: now,
    });

    // If invite was accepted, also revoke the canonical shares record
    if (invite.caregiverUserId) {
      const shareId = `${invite.ownerId}_${invite.caregiverUserId}`;
      const shareDoc = await getDb().collection('shares').doc(shareId).get();
      if (shareDoc.exists) {
        await shareDoc.ref.update({
          status: 'revoked',
          updatedAt: now,
        });
        functions.logger.info(`[shares] Also revoked share record ${shareId}`);
      }
    }

    functions.logger.info(`[shares] Owner ${userId} revoked invite ${token}`);

    res.json({ success: true });
  } catch (error) {
    functions.logger.error('[shares] Error revoking invite:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to revoke invitation',
    });
  }
});
