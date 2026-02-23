import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { shareLimiter } from '../middlewares/rateLimit';
import {
  hasResourceOwnerAccess,
  ensureResourceOwnerAccessOrReject,
  ensureResourceParticipantAccessOrReject,
} from '../middlewares/resourceAccess';
import { invalidateCaregiverShareLookupCache } from '../services/shareAccess';
import { escapeHtml, sanitizePlainText } from '../utils/inputSanitization';
import { ShareDomainService } from '../services/domain/shares/ShareDomainService';
import { FirestoreShareRepository } from '../services/repositories/shares/FirestoreShareRepository';
import { UserDomainService } from '../services/domain/users/UserDomainService';
import { FirestoreUserRepository } from '../services/repositories/users/FirestoreUserRepository';

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
const getShareDomainService = () => new ShareDomainService(new FirestoreShareRepository(getDb()));
const getUserDomainService = () => new UserDomainService(new FirestoreUserRepository(getDb()));
const SHARE_MESSAGE_MAX_LENGTH = 1000;
const OWNER_NAME_MAX_LENGTH = 120;
const SHARES_PAGE_SIZE_DEFAULT = 50;
const SHARES_PAGE_SIZE_MAX = 100;

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

const toMillisSafe = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : 0;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in (value as Record<string, unknown>) &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      const millis = (value as { toMillis: () => number }).toMillis();
      return Number.isFinite(millis) ? millis : 0;
    } catch {
      return 0;
    }
  }

  if (typeof value === 'string') {
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : 0;
  }

  return 0;
};

const compareByCreatedAtDescThenId = (
  left: { id: string; createdAt?: unknown },
  right: { id: string; createdAt?: unknown },
): number => {
  const millisDiff = toMillisSafe(right.createdAt) - toMillisSafe(left.createdAt);
  if (millisDiff !== 0) {
    return millisDiff;
  }
  return left.id.localeCompare(right.id);
};

type CursorPaginationParseResult =
  | {
      ok: true;
      limit: number;
      cursor: string | null;
      paginationRequested: boolean;
    }
  | {
      ok: false;
      message: string;
    };

const parseCursorPagination = (query: Record<string, unknown>): CursorPaginationParseResult => {
  const rawLimit = query.limit;
  const rawCursor = query.cursor;
  const cursor =
    typeof rawCursor === 'string' && rawCursor.trim().length > 0 ? rawCursor.trim() : null;
  const paginationRequested = rawLimit !== undefined || cursor !== null;

  let limit = SHARES_PAGE_SIZE_DEFAULT;
  if (rawLimit !== undefined) {
    if (typeof rawLimit !== 'string') {
      return { ok: false, message: 'limit must be a positive integer' };
    }
    const parsedLimit = parseInt(rawLimit, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return { ok: false, message: 'limit must be a positive integer' };
    }
    limit = Math.min(parsedLimit, SHARES_PAGE_SIZE_MAX);
  }

  return {
    ok: true,
    limit,
    cursor,
    paginationRequested,
  };
};

type CursorPageResult<TItem extends { id: string }> = {
  items: TItem[];
  hasMore: boolean;
  nextCursor: string | null;
  invalidCursor: boolean;
};

const paginateByCursor = <TItem extends { id: string }>(
  items: TItem[],
  options: {
    limit: number;
    cursor: string | null;
  },
): CursorPageResult<TItem> => {
  let startIndex = 0;
  if (options.cursor) {
    const cursorIndex = items.findIndex((item) => item.id === options.cursor);
    if (cursorIndex === -1) {
      return {
        items: [],
        hasMore: false,
        nextCursor: null,
        invalidCursor: true,
      };
    }
    startIndex = cursorIndex + 1;
  }

  const remaining = items.slice(startIndex);
  const pageItems = remaining.slice(0, options.limit);
  const hasMore = remaining.length > options.limit;

  return {
    items: pageItems,
    hasMore,
    nextCursor: hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null,
    invalidCursor: false,
  };
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

const invalidateCaregiverShareCache = (
  caregiverUserId: unknown,
  ownerId: unknown,
): void => {
  const caregiverId =
    typeof caregiverUserId === 'string' ? caregiverUserId.trim() : '';
  const patientOwnerId =
    typeof ownerId === 'string' ? ownerId.trim() : '';

  if (!caregiverId) {
    return;
  }

  invalidateCaregiverShareLookupCache(caregiverId, patientOwnerId || undefined);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createShareSchema = z.object({
  caregiverEmail: z.string().email(),
  role: z.enum(['viewer']).default('viewer'), // Only viewer role supported for now
  message: z.string().max(SHARE_MESSAGE_MAX_LENGTH).optional(),
});

const updateShareSchema = z.object({
  status: z.enum(['accepted', 'revoked']),
});

const sanitizeShareMessage = (value: unknown): string | null => {
  const sanitized = sanitizePlainText(value, SHARE_MESSAGE_MAX_LENGTH);
  return sanitized || null;
};

type SharesRouteResponse = {
  status: (statusCode: number) => {
    json: (payload: Record<string, unknown>) => void;
  };
};

type InviteEmailMatchOptions = {
  res: SharesRouteResponse;
  currentUserEmail: string;
  inviteEmail: string;
  mismatchCode?: 'email_mismatch' | 'forbidden';
  message: string;
  userMessage: string;
  logContext?: string;
};

const ensureInviteEmailMatchOrReject = ({
  res,
  currentUserEmail,
  inviteEmail,
  mismatchCode = 'email_mismatch',
  message,
  userMessage,
  logContext,
}: InviteEmailMatchOptions): boolean => {
  if (currentUserEmail && inviteEmail && currentUserEmail === inviteEmail) {
    return true;
  }

  if (logContext) {
    functions.logger.warn(logContext);
  }

  res.status(403).json({
    code: mismatchCode,
    message,
    userMessage,
  });
  return false;
};

type ShareAcceptAccessResult = {
  allow: boolean;
  requiresCaregiverMigration: boolean;
  shareEmail: string;
};

const resolveShareAcceptAccess = (
  viewerUserId: string,
  share: Record<string, unknown>,
  currentUserEmail: string,
): ShareAcceptAccessResult => {
  if (hasResourceOwnerAccess(viewerUserId, share, { ownerField: 'caregiverUserId' })) {
    return {
      allow: true,
      requiresCaregiverMigration: false,
      shareEmail: normalizeEmail(share.caregiverEmail),
    };
  }

  const shareEmail = normalizeEmail(share.caregiverEmail);
  const canMigrateByEmail = !!currentUserEmail && !!shareEmail && currentUserEmail === shareEmail;

  return {
    allow: canMigrateByEmail,
    requiresCaregiverMigration: canMigrateByEmail,
    shareEmail,
  };
};

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
    const pagination = parseCursorPagination(req.query as Record<string, unknown>);
    if (!pagination.ok) {
      res.status(400).json({
        code: 'validation_failed',
        message: pagination.message,
      });
      return;
    }

    const userId = req.user!.uid;
    const shareService = getShareDomainService();

    const [ownedShares, caregiverShares] = await Promise.all([
      shareService.listByOwnerId(userId),
      shareService.listByCaregiverUserId(userId),
    ]);

    const shares = [
      ...ownedShares.map((share) =>
        serializeSharePayload(share.id, share as Record<string, unknown>, 'outgoing'),
      ),
      ...caregiverShares.map((share) =>
        serializeSharePayload(share.id, share as Record<string, unknown>, 'incoming'),
      ),
    ].sort(compareByCreatedAtDescThenId);

    let responsePayload = shares;
    let hasMore = false;
    let nextCursor: string | null = null;
    if (pagination.paginationRequested) {
      const page = paginateByCursor(shares, {
        limit: pagination.limit,
        cursor: pagination.cursor,
      });
      if (page.invalidCursor) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid cursor',
        });
        return;
      }

      responsePayload = page.items;
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
      res.set('X-Has-More', hasMore ? 'true' : 'false');
      res.set('X-Next-Cursor', nextCursor || '');
    }

    res.set('Cache-Control', 'private, max-age=30');
    res.json(responsePayload);
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
    const shareService = getShareDomainService();
    const userService = getUserDomainService();
    const data = createShareSchema.parse(req.body);
    const caregiverEmail = normalizeEmail(data.caregiverEmail);

    // Get owner info for email
    const ownerUser = await admin.auth().getUser(ownerId);
    const ownerEmail = ownerUser.email || '';
    const ownerData = await userService.getById(ownerId);
    const ownerNameRaw =
      ownerData?.preferredName ||
      ownerData?.firstName ||
      ownerUser.displayName ||
      ownerEmail.split('@')[0];
    const ownerName = sanitizePlainText(ownerNameRaw, OWNER_NAME_MAX_LENGTH) || ownerEmail.split('@')[0] || 'Someone';
    const shareMessage = sanitizeShareMessage(data.message);

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
      shareService.hasPendingInviteByOwnerAndInviteeEmail(ownerId, caregiverEmail),
      shareService.hasPendingInviteByOwnerAndCaregiverEmail(ownerId, caregiverEmail),
    ]);

    if (existingInviteByLegacyEmail || existingInviteByCaregiverEmail) {
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
      const existingShare = await shareService.getById(shareId);
      if (existingShare) {
        const existingStatus = existingShare.status;
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
      const sharePayload = {
        ownerId,
        ownerName,
        ownerEmail,
        caregiverUserId,
        caregiverEmail,
        role: data.role,
        status: 'pending',
        message: shareMessage,
        createdAt: now,
        updatedAt: now,
      };

      await shareService.setShare(shareId, sharePayload);

      // Email will be sent by frontend via Vercel API route
      functions.logger.info(`[shares] Created share invitation from ${ownerId} to existing user ${caregiverUserId}. Email should be sent by frontend.`);

      functions.logger.info(
        `[shares] Created share invitation from ${ownerId} to existing user ${caregiverUserId}`,
      );

      res.status(201).json(serializeSharePayload(shareId, sharePayload));
    } else {
      // User doesn't exist - create invite
      const inviteToken = randomBytes(32).toString('base64url');
      const invitePayload = {
        ownerId,
        ownerEmail,
        ownerName,
        inviteeEmail: caregiverEmail,
        caregiverEmail,
        status: 'pending',
        message: shareMessage,
        role: data.role,
        createdAt: now,
        expiresAt,
      };

      await shareService.createInvite(inviteToken, invitePayload);

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
        message: shareMessage,
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
    const pagination = parseCursorPagination(req.query as Record<string, unknown>);
    if (!pagination.ok) {
      res.status(400).json({
        code: 'validation_failed',
        message: pagination.message,
      });
      return;
    }

    const userId = req.user!.uid;
    const user = await admin.auth().getUser(userId);
    const userEmail = normalizeEmail(user.email);
    const shareService = getShareDomainService();

    if (!userEmail) {
      res.status(400).json({
        code: 'no_email',
        message: 'User email is required to check for invitations',
      });
      return;
    }

    const invites = await shareService.listPendingInvitesForCaregiverEmail(userEmail);
    const payload = invites.map((invite) => {
      const data = invite as Record<string, unknown>;
      const caregiverEmail = getInviteCaregiverEmail(data as Record<string, unknown>);
      return {
        id: invite.id,
        ...data,
        caregiverEmail: caregiverEmail || null,
        inviteeEmail: normalizeEmail(data.inviteeEmail) || caregiverEmail || null,
        createdAt: toISOStringSafe(data.createdAt),
        expiresAt: toISOStringSafe(data.expiresAt),
      };
    }).sort(compareByCreatedAtDescThenId);

    let responsePayload = payload;
    let hasMore = false;
    let nextCursor: string | null = null;
    if (pagination.paginationRequested) {
      const page = paginateByCursor(payload, {
        limit: pagination.limit,
        cursor: pagination.cursor,
      });
      if (page.invalidCursor) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid cursor',
        });
        return;
      }

      responsePayload = page.items;
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
      res.set('X-Has-More', hasMore ? 'true' : 'false');
      res.set('X-Next-Cursor', nextCursor || '');
    }

    res.set('Cache-Control', 'private, max-age=30');
    res.json(responsePayload);
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
    const shareService = getShareDomainService();
    const invite = await shareService.getInviteById(inviteId);
    if (
      !ensureResourceOwnerAccessOrReject(userId, invite, res, {
        resourceName: 'invite',
        ownerField: 'ownerId',
        notFoundMessage: 'Invite not found',
        message: 'You are not authorized to modify this invite',
      })
    ) {
      return;
    }
    const ownerInvite = invite!;

    if (ownerInvite.status !== 'pending') {
      res.status(400).json({
        code: 'invalid_status',
        message: 'Only pending invites can be cancelled',
      });
      return;
    }

    const updatedInvite = await shareService.updateInviteRecord(inviteId, {
      status: 'revoked',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!updatedInvite) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invite not found',
      });
      return;
    }

    const { id: _inviteId, ...updatedInvitePayload } = updatedInvite;

    res.json({
      ...updatedInvitePayload,
      id: inviteId,
      createdAt: toISOStringSafe(updatedInvite.createdAt),
      expiresAt: toISOStringSafe(updatedInvite.expiresAt),
      updatedAt: toISOStringSafe(updatedInvite.updatedAt),
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
    const shareService = getShareDomainService();

    // Allow static routes registered later (e.g. /my-invites) to resolve correctly.
    if (shareId === 'my-invites') {
      next();
      return;
    }

    const share = await shareService.getById(shareId);
    if (
      !ensureResourceParticipantAccessOrReject(userId, share, res, {
        resourceName: 'share',
        participantFields: ['ownerId', 'caregiverUserId'],
        notFoundMessage: 'Share not found',
        message: 'You do not have access to this share',
      })
    ) {
      return;
    }
    const participantShare = share!;

    res.set('Cache-Control', 'private, max-age=30');
    res.json(serializeSharePayload(shareId, participantShare));
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
    const shareService = getShareDomainService();

    const data = updateShareSchema.parse(req.body);

    const transitionResult = await shareService.transitionStatus(
      shareId,
      userId,
      data.status,
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    );

    if (transitionResult.outcome === 'not_found') {
      res.status(404).json({
        code: 'not_found',
        message: 'Share not found',
      });
      return;
    }

    if (transitionResult.outcome === 'invalid_transition') {
      res.status(400).json({
        code: 'invalid_transition',
        message: 'Invalid status transition for your role',
      });
      return;
    }

    const updatedShare = transitionResult.share;
    invalidateCaregiverShareCache(updatedShare.caregiverUserId, updatedShare.ownerId);
    functions.logger.info(
      `[shares] ${userId} updated share ${shareId} to ${updatedShare.status}`,
    );

    res.json(serializeSharePayload(shareId, updatedShare as Record<string, unknown>));
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
    const shareService = getShareDomainService();
    const userService = getUserDomainService();
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

    // Check if it's a shareInvite (for users without accounts)
    const invite = await shareService.getInviteById(token);

    if (invite) {
      // Verify email matches (normalize both to lowercase for comparison)
      const user = await admin.auth().getUser(userId);
      const userEmail = normalizeEmail(user.email);
      const inviteEmail = getInviteCaregiverEmail(invite as Record<string, unknown>);

      if (!ensureInviteEmailMatchOrReject({
        res,
        currentUserEmail: userEmail,
        inviteEmail,
        mismatchCode: 'email_mismatch',
        message: 'This invitation was sent to a different email address',
        userMessage: `This invitation was sent to ${inviteEmail || 'a different email address'}, but you are signed in as ${user.email}. Please sign in with the email address that received the invitation.`,
        logContext: `[shares] Email mismatch for invite ${token}: user email "${userEmail}" does not match invite email "${inviteEmail}"`,
      })) {
        return;
      }

      // Check if expired
      const currentTime = Date.now();
      const expiresAt = invite.expiresAt?.toMillis() || 0;
      if (currentTime > expiresAt) {
        await shareService.updateInviteRecord(token, { status: 'expired' });
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
      await shareService.acceptInviteAndSetShare({
        inviteId: token,
        inviteUpdates: {
          status: 'accepted',
          acceptedAt: now,
          updatedAt: now,
        },
        shareId,
        sharePayload: {
          ownerId: invite.ownerId,
          ownerName: sanitizePlainText(invite.ownerName, OWNER_NAME_MAX_LENGTH) || 'Someone',
          ownerEmail: invite.ownerEmail,
          caregiverUserId: userId,
          caregiverEmail: inviteEmail,
          role: invite.role,
          status: 'accepted',
          message: sanitizeShareMessage(invite.message),
          createdAt: now,
          updatedAt: now,
          acceptedAt: now,
        },
      });
      invalidateCaregiverShareCache(userId, invite.ownerId);

      await userService.ensureCaregiverRole(userId);

      functions.logger.info(
        `[shares] User ${userId} accepted invite ${token} from ${invite.ownerId}`,
      );

      const share = await shareService.getById(shareId);
      if (!share) {
        res.status(500).json({
          code: 'server_error',
          message: 'Failed to fetch accepted share',
        });
        return;
      }

      res.json(serializeSharePayload(shareId, share as Record<string, unknown>));
      return;
    }

    // Check if it's a direct share (for existing users)
    const shareId = token;
    const share = await shareService.getById(shareId);
    if (!share) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    // Debug logging for 403 issues
    functions.logger.info(`[shares] Accept invite attempt: userId=${userId}, shareId=${shareId}`);
    functions.logger.info(`[shares] Share data: caregiverUserId=${share.caregiverUserId}, ownerId=${share.ownerId}, status=${share.status}, caregiverEmail=${share.caregiverEmail}`);

    // Get current user's email for validation
    const currentUser = await admin.auth().getUser(userId);
    const currentUserEmail = normalizeEmail(currentUser.email);

    // Validate access: either user ID matches OR email matches
    // If email matches but user ID doesn't, update the share with correct user ID
    // This handles cases where accounts were recreated or invite was resent
    const accessResult = resolveShareAcceptAccess(userId, share, currentUserEmail);

    if (!accessResult.allow) {
        functions.logger.warn(`[shares] 403: User ${userId} (email: ${currentUserEmail}) tried to accept share ${shareId} but caregiverEmail is ${accessResult.shareEmail} and caregiverUserId is ${share.caregiverUserId}`);
        res.status(403).json({
          code: 'forbidden',
          message: 'You are not authorized to accept this invitation',
        });
        return;
    }

    if (accessResult.requiresCaregiverMigration) {
      // Email matches - update the caregiverUserId to this user and accept
      functions.logger.info(`[shares] Email match - updating caregiverUserId from ${share.caregiverUserId} to ${userId}`);

      // Also update the document ID to match new format
      const newShareId = `${share.ownerId}_${userId}`;
      await shareService.migrateShareToCaregiver({
        currentShareId: shareId,
        newShareId,
        newSharePayload: {
          ...share,
          caregiverUserId: userId,
          status: 'accepted',
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      invalidateCaregiverShareCache(share.caregiverUserId, share.ownerId);
      invalidateCaregiverShareCache(userId, share.ownerId);

      await userService.ensureCaregiverRole(userId);

      functions.logger.info(`[shares] User ${userId} accepted share (migrated from ${shareId} to ${newShareId})`);

      const newShare = await shareService.getById(newShareId);
      if (!newShare) {
        res.status(500).json({
          code: 'server_error',
          message: 'Failed to fetch accepted share',
        });
        return;
      }

      res.json(serializeSharePayload(newShareId, newShare as Record<string, unknown>));
      return;
    }

    // Check if already accepted
    if (share.status === 'accepted') {
      res.json({
        ...share,
        id: shareId,
        createdAt: share.createdAt?.toDate().toISOString(),
        updatedAt: share.updatedAt?.toDate().toISOString(),
        acceptedAt: share.acceptedAt?.toDate().toISOString(),
      });
      return;
    }

    // Accept the share
    if (share.status === 'pending') {
      const transitionResult = await shareService.transitionStatus(shareId, userId, 'accepted', {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (transitionResult.outcome !== 'updated') {
        res.status(400).json({
          code: 'invalid_status',
          message: 'This invitation cannot be accepted',
        });
        return;
      }

      invalidateCaregiverShareCache(userId, share.ownerId);

      await userService.ensureCaregiverRole(userId);

      functions.logger.info(`[shares] User ${userId} accepted share ${shareId}`);

      const updatedShare = await shareService.getById(shareId);
      if (!updatedShare) {
        res.status(500).json({
          code: 'server_error',
          message: 'Failed to fetch accepted share',
        });
        return;
      }

      res.json(serializeSharePayload(shareId, updatedShare as Record<string, unknown>));
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
    const shareService = getShareDomainService();
    const invite = await shareService.getInviteById(token);

    if (!invite) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    // Check if expired
    const now = Date.now();
    const expiresAtMillis =
      invite.expiresAt &&
      typeof (invite.expiresAt as { toMillis?: unknown }).toMillis === 'function'
        ? (invite.expiresAt as { toMillis: () => number }).toMillis()
        : null;
    if (expiresAtMillis !== null && expiresAtMillis < now) {
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
      ownerName: sanitizePlainText(invite.ownerName, OWNER_NAME_MAX_LENGTH) || 'Someone',
      caregiverEmail: caregiverEmail || null,
      status: invite.status,
      expiresAt: toISOStringSafe(invite.expiresAt),
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
    const shareService = getShareDomainService();
    const userService = getUserDomainService();
    const data = createShareSchema.parse(req.body);
    const caregiverEmail = data.caregiverEmail.toLowerCase().trim();

    // Get owner info
    const ownerUser = await admin.auth().getUser(ownerId);
    const ownerEmail = ownerUser.email?.toLowerCase().trim() || '';
    const ownerData = await userService.getById(ownerId);
    const ownerNameRaw =
      ownerData?.preferredName ||
      ownerData?.firstName ||
      ownerUser.displayName ||
      ownerEmail.split('@')[0];
    const ownerName = sanitizePlainText(ownerNameRaw, OWNER_NAME_MAX_LENGTH) || ownerEmail.split('@')[0] || 'Someone';
    const inviteMessage = sanitizeShareMessage(data.message);

    // Edge case: Prevent sharing with yourself
    if (ownerEmail === caregiverEmail) {
      res.status(400).json({
        code: 'invalid_share',
        message: 'You cannot share with yourself',
      });
      return;
    }

    // Check canonical shares collection for existing relationship
    const existingShare = await shareService.findFirstByOwnerAndCaregiverEmail(
      ownerId,
      caregiverEmail,
    );
    if (existingShare) {
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
    const [existingPendingInvite, existingLegacyPendingInvite] = await Promise.all([
      shareService.hasPendingInviteByOwnerAndCaregiverEmail(ownerId, caregiverEmail),
      shareService.hasPendingInviteByOwnerAndInviteeEmail(ownerId, caregiverEmail),
    ]);

    if (existingPendingInvite || existingLegacyPendingInvite) {
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
    await shareService.createInvite(inviteToken, {
      ownerId,
      ownerEmail,
      ownerName,
      caregiverEmail,
      caregiverUserId: null, // Set on acceptance
      status: 'pending',
      role: 'viewer',
      message: inviteMessage,
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
        const hasMessage = !!inviteMessage;
        const escapedOwnerName = escapeHtml(ownerName);
        const escapedInviteLink = escapeHtml(inviteLink);
        const escapedInviteMessage = inviteMessage
          ? escapeHtml(inviteMessage).replace(/\n/g, '<br>')
          : '';

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
      ${escapedOwnerName} wants to share health info with you
    </h1>
    
    <p style="font-size: 15px; color: #555; margin: 0 0 20px 0;">
      You've been invited to view <strong>${escapedOwnerName}'s</strong> medical visits, medications, and care tasks on LumiMD.
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapedInviteLink}" 
         style="display: inline-block; background-color: #078A94; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    ${hasMessage ? `<div style="margin: 16px 0; padding: 12px; background-color: #f8f9fa; border-radius: 8px; border-left: 3px solid #078A94;"><p style="margin: 0; font-size: 14px; color: #555; font-style: italic;">"${escapedInviteMessage}"</p></div>` : ''}

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
${hasMessage ? `\n"${inviteMessage}"\n` : ''}
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
      message: inviteMessage,
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
    const shareService = getShareDomainService();
    const userService = getUserDomainService();

    // Get invite document
    const invite = await shareService.getInviteById(token);
    if (!invite) {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    const inviteEmail = getInviteCaregiverEmail(invite);

    // Edge case: Check if expired
    const now = admin.firestore.Timestamp.now();
    if (invite.expiresAt && invite.expiresAt.toMillis() < now.toMillis()) {
      await shareService.updateInviteRecord(token, { status: 'expired' });
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
    if (!ensureInviteEmailMatchOrReject({
      res,
      currentUserEmail,
      inviteEmail,
      mismatchCode: 'email_mismatch',
      message: `This invitation was sent to ${inviteEmail || 'a different email address'}. Please sign in with that email address.`,
      userMessage: `This invitation was sent to ${inviteEmail || 'a different email address'}. Please sign in with that email address.`,
      logContext: `[shares] Email mismatch for token ${token}: user email "${currentUserEmail}" does not match invite email "${inviteEmail}"`,
    })) {
      return;
    }

    // Edge case: Check if already accepted
    if (invite.status === 'accepted') {
      res.json({
        ...invite,
        id: token,
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
    const shareId = `${invite.ownerId}_${userId}`;
    await shareService.acceptInviteAndSetShare({
      inviteId: token,
      inviteUpdates: {
        status: 'accepted',
        caregiverUserId: userId,
        caregiverEmail: inviteEmail,
        acceptedAt,
      },
      shareId,
      sharePayload: {
        ownerId: invite.ownerId,
        ownerName: sanitizePlainText(invite.ownerName, OWNER_NAME_MAX_LENGTH) || 'Someone',
        ownerEmail: invite.ownerEmail,
        caregiverUserId: userId,
        caregiverEmail: inviteEmail,
        role: invite.role || 'viewer',
        status: 'accepted',
        message: sanitizeShareMessage(invite.message),
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
        acceptedAt,
      },
      mergeShare: true,
    });
    invalidateCaregiverShareCache(userId, invite.ownerId);

    functions.logger.info(`[shares] User ${userId} accepted invite ${token}`);

    await userService.ensureCaregiverRole(userId);

    // Fetch updated document
    const updatedInvite = await shareService.getInviteById(token);
    if (!updatedInvite) {
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to fetch invitation',
      });
      return;
    }

    res.json({
      ...updatedInvite,
      id: token,
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
    const pagination = parseCursorPagination(req.query as Record<string, unknown>);
    if (!pagination.ok) {
      res.status(400).json({
        code: 'validation_failed',
        message: pagination.message,
      });
      return;
    }

    const userId = req.user!.uid;
    const shareService = getShareDomainService();

    const invites = await shareService.listInvitesByOwnerId(userId);
    const payload = invites.map((invite) => ({
      ...invite,
      id: invite.id,
      createdAt: toISOStringSafe(invite.createdAt),
      expiresAt: toISOStringSafe(invite.expiresAt),
      acceptedAt: toISOStringSafe(invite.acceptedAt),
    })).sort(compareByCreatedAtDescThenId);

    let responsePayload = payload;
    let hasMore = false;
    let nextCursor: string | null = null;
    if (pagination.paginationRequested) {
      const page = paginateByCursor(payload, {
        limit: pagination.limit,
        cursor: pagination.cursor,
      });
      if (page.invalidCursor) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid cursor',
        });
        return;
      }

      responsePayload = page.items;
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
      res.set('X-Has-More', hasMore ? 'true' : 'false');
      res.set('X-Next-Cursor', nextCursor || '');
    }

    res.set('Cache-Control', 'private, max-age=30');
    res.json(responsePayload);
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
    const shareService = getShareDomainService();

    const revokeResult = await shareService.revokeInviteByOwner(token, userId);

    if (revokeResult.outcome === 'not_found') {
      res.status(404).json({
        code: 'not_found',
        message: 'Invitation not found',
      });
      return;
    }

    if (revokeResult.outcome === 'forbidden') {
      res.status(403).json({
        code: 'forbidden',
        message: 'Only the owner can revoke this invitation',
      });
      return;
    }

    const ownerInvite = revokeResult.invite;
    invalidateCaregiverShareCache(ownerInvite.caregiverUserId, ownerInvite.ownerId);

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
