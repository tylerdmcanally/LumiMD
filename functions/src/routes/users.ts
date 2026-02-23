import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';
import { z } from 'zod';

import {
  requireAuth,
  AuthRequest,
  ensureOperatorAccessOrReject,
} from '../middlewares/auth';
import { hasResourceOwnerAccess } from '../middlewares/resourceAccess';
import { sanitizePlainText } from '../utils/inputSanitization';
import { UserDomainService } from '../services/domain/users/UserDomainService';
import { ShareDomainService } from '../services/domain/shares/ShareDomainService';
import { FirestoreUserRepository } from '../services/repositories/users/FirestoreUserRepository';
import { FirestoreShareRepository } from '../services/repositories/shares/FirestoreShareRepository';
import {
  RESTORE_AUDIT_RESOURCE_TYPES,
  RESTORE_AUDIT_TRIAGE_NOTE_MAX_LENGTH,
  RESTORE_AUDIT_TRIAGE_STATUSES,
} from '../services/restoreAuditService';

export const usersRouter = Router();

const getDb = () => admin.firestore();
const getUserDomainService = () => new UserDomainService(new FirestoreUserRepository(getDb()));
const getShareDomainService = () => new ShareDomainService(new FirestoreShareRepository(getDb()));
const ANALYTICS_CONSENT_EVENT_TYPE = 'analytics_consent_changed';
const LEGAL_ASSENT_EVENT_TYPE = 'legal_documents_accepted';
const DEFAULT_AUDIT_QUERY_LIMIT = 50;
const MAX_AUDIT_QUERY_LIMIT = 100;
const DEFAULT_RESTORE_AUDIT_QUERY_LIMIT = 50;
const MAX_RESTORE_AUDIT_QUERY_LIMIT = 100;
const MAX_RESTORE_AUDIT_SCAN_LIMIT = 500;
const AUDIT_LOG_HASH_SALT = process.env.AUDIT_LOG_HASH_SALT?.trim() ?? '';
const PROFILE_NAME_MAX_LENGTH = 100;
const PROFILE_DOB_MAX_LENGTH = 32;
const PROFILE_LIST_ITEM_MAX_LENGTH = 200;
const PROFILE_LIST_MAX_ITEMS = 100;

const userRoleSchema = z.enum(['patient', 'caregiver']);

const legalAssentSchema = z.object({
  accepted: z.literal(true),
  termsVersion: z.string().trim().min(1).max(80),
  privacyVersion: z.string().trim().min(1).max(80),
  source: z
    .enum(['signup_web', 'signup_mobile', 'settings', 'migration', 'support'])
    .default('signup_web'),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  appVersion: z.string().trim().min(1).max(80).optional(),
});

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
  legalAssent: legalAssentSchema.optional(),
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

const analyticsConsentSchema = z.object({
  granted: z.boolean(),
  source: z
    .enum(['settings_toggle', 'app_boot_sync', 'migration', 'server_default'])
    .default('settings_toggle'),
  policyVersion: z.string().trim().min(1).max(40).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  appVersion: z.string().trim().min(1).max(40).optional(),
});

const analyticsConsentAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_AUDIT_QUERY_LIMIT).optional(),
});

const restoreAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_RESTORE_AUDIT_QUERY_LIMIT).optional(),
  cursor: z.string().trim().min(1).optional(),
  resourceType: z.enum(RESTORE_AUDIT_RESOURCE_TYPES).optional(),
  ownerUserId: z.string().trim().min(1).max(128).optional(),
  actorUserId: z.string().trim().min(1).max(128).optional(),
  triageStatus: z.enum(RESTORE_AUDIT_TRIAGE_STATUSES).optional(),
});

const updateRestoreAuditTriageSchema = z
  .object({
    triageStatus: z.enum(RESTORE_AUDIT_TRIAGE_STATUSES).optional(),
    triageNote: z.string().max(RESTORE_AUDIT_TRIAGE_NOTE_MAX_LENGTH).optional(),
    clearTriageNote: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.triageStatus !== undefined ||
      data.triageNote !== undefined ||
      data.clearTriageNote === true,
    {
      message: 'At least one triage field must be provided',
      path: ['triageStatus'],
    },
  );

// Legacy caregiver schemas removed - now using shares collection

const sanitizeString = (value?: string | null, maxLength = 10000) => {
  if (typeof value !== 'string') return undefined;
  const sanitized = sanitizePlainText(value, maxLength);
  return sanitized.length > 0 ? sanitized : undefined;
};

const sanitizeAuditString = (value?: string | null, maxLength = 200) => {
  const sanitized = sanitizeString(value, maxLength);
  if (!sanitized) return undefined;
  return sanitized;
};

const resolveAutoShareWithCaregivers = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : true;

const timestampToIso = (value: unknown): string | null => {
  return (value as admin.firestore.Timestamp | undefined)?.toDate?.().toISOString?.() ?? null;
};

const getHashedAuditValue = (value?: string | null): string | undefined => {
  const sanitized = sanitizeAuditString(value, 256);
  if (!sanitized || !AUDIT_LOG_HASH_SALT) return undefined;
  return createHash('sha256')
    .update(`${AUDIT_LOG_HASH_SALT}:${sanitized}`)
    .digest('hex');
};

const getClientIp = (req: AuthRequest): string | undefined => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return sanitizeAuditString(forwardedFor[0]?.split(',')[0], 128);
  }
  if (typeof forwardedFor === 'string') {
    return sanitizeAuditString(forwardedFor.split(',')[0], 128);
  }
  return sanitizeAuditString(req.ip, 128);
};

const serializeAnalyticsConsent = (consentData: Record<string, unknown> | undefined) => ({
  granted: typeof consentData?.granted === 'boolean' ? consentData.granted : false,
  source: typeof consentData?.source === 'string' ? consentData.source : null,
  policyVersion:
    typeof consentData?.policyVersion === 'string' ? consentData.policyVersion : null,
  updatedAt: timestampToIso(consentData?.updatedAt),
});

const serializeLegalAssent = (assentData: Record<string, unknown> | undefined) => ({
  accepted: typeof assentData?.accepted === 'boolean' ? assentData.accepted : false,
  termsVersion:
    typeof assentData?.termsVersion === 'string' ? assentData.termsVersion : null,
  privacyVersion:
    typeof assentData?.privacyVersion === 'string' ? assentData.privacyVersion : null,
  source: typeof assentData?.source === 'string' ? assentData.source : null,
  platform: typeof assentData?.platform === 'string' ? assentData.platform : null,
  appVersion: typeof assentData?.appVersion === 'string' ? assentData.appVersion : null,
  acceptedAt: timestampToIso(assentData?.acceptedAt),
  updatedAt: timestampToIso(assentData?.updatedAt),
});

const sanitizeStringArray = (
  values?: string[],
  maxItemLength = PROFILE_LIST_ITEM_MAX_LENGTH,
  maxItems = PROFILE_LIST_MAX_ITEMS,
) => {
  if (!Array.isArray(values)) return undefined;
  return Array.from(
    new Set(
      values
        .slice(0, maxItems)
        .map((item) => sanitizeString(item, maxItemLength) ?? '')
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
    const now = admin.firestore.Timestamp.now();
    const userService = getUserDomainService();
    const data = await userService.ensureExists(userId, {
      createdAt: now,
      updatedAt: now,
    });

    const privacy = (data.privacy as Record<string, unknown> | undefined) ?? {};
    const legalAssent = (privacy.legalAssent as Record<string, unknown> | undefined) ?? {};

    const response = {
      id: userId,
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : '',
      allergies: Array.isArray(data.allergies) ? data.allergies : [],
      medicalHistory: Array.isArray(data.medicalHistory) ? data.medicalHistory : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
      autoShareWithCaregivers: resolveAutoShareWithCaregivers(data.autoShareWithCaregivers),
      roles: Array.isArray(data.roles) ? data.roles : [],
      primaryRole: typeof data.primaryRole === 'string' ? data.primaryRole : null,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      legalAssent: serializeLegalAssent(legalAssent),
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
    const userService = getUserDomainService();
    const now = admin.firestore.Timestamp.now();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (payload.firstName !== undefined) {
      updateData.firstName = sanitizeString(payload.firstName, PROFILE_NAME_MAX_LENGTH) ?? '';
    }

    if (payload.lastName !== undefined) {
      updateData.lastName = sanitizeString(payload.lastName, PROFILE_NAME_MAX_LENGTH) ?? '';
    }

    if (payload.dateOfBirth !== undefined) {
      updateData.dateOfBirth = sanitizeString(payload.dateOfBirth, PROFILE_DOB_MAX_LENGTH) ?? '';
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

    if (payload.autoShareWithCaregivers !== undefined) {
      updateData.autoShareWithCaregivers = payload.autoShareWithCaregivers;
    }

    if (payload.roles !== undefined) {
      updateData.roles = normalizeRoles(payload.roles) ?? [];
    }

    if (payload.primaryRole !== undefined) {
      updateData.primaryRole = payload.primaryRole;
    }

    if (payload.legalAssent !== undefined) {
      const legalAssentPayload = payload.legalAssent;
      const traceHeader = sanitizeAuditString(req.header('x-cloud-trace-context'), 256);
      const traceId = traceHeader ? traceHeader.split('/')[0] : null;
      const userAgent = sanitizeAuditString(req.get('user-agent'), 256) ?? null;
      const origin = sanitizeAuditString(req.get('origin'), 256) ?? null;
      const ipHash = getHashedAuditValue(getClientIp(req)) ?? null;

      await userService.applyLegalAssent(userId, updateData, {
        termsVersion: legalAssentPayload.termsVersion,
        privacyVersion: legalAssentPayload.privacyVersion,
        source: legalAssentPayload.source,
        platform: legalAssentPayload.platform ?? null,
        appVersion: legalAssentPayload.appVersion ?? null,
        now,
        traceId,
        userAgent,
        origin,
        ipHash,
        eventType: LEGAL_ASSENT_EVENT_TYPE,
      });
    } else {
      await userService.upsertById(userId, updateData, {
        createdAtOnInsert: now,
      });
    }

    const data = ((await userService.getById(userId)) ?? {}) as Record<string, unknown>;
    const privacy = (data.privacy as Record<string, unknown> | undefined) ?? {};
    const legalAssent = (privacy.legalAssent as Record<string, unknown> | undefined) ?? {};

    const response = {
      id: userId,
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : '',
      allergies: Array.isArray(data.allergies) ? data.allergies : [],
      medicalHistory: Array.isArray(data.medicalHistory) ? data.medicalHistory : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
      autoShareWithCaregivers: resolveAutoShareWithCaregivers(data.autoShareWithCaregivers),
      roles: Array.isArray(data.roles) ? data.roles : [],
      primaryRole: typeof data.primaryRole === 'string' ? data.primaryRole : null,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      legalAssent: serializeLegalAssent(legalAssent),
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
 * GET /v1/users/privacy/analytics-consent
 * Fetch analytics consent state for the authenticated user.
 */
usersRouter.get('/privacy/analytics-consent', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userService = getUserDomainService();
    const analyticsConsent = await userService.getAnalyticsConsent(userId);

    res.json(serializeAnalyticsConsent(analyticsConsent));
  } catch (error) {
    functions.logger.error('[users] Error fetching analytics consent:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch analytics consent state',
    });
  }
});

/**
 * POST /v1/users/privacy/analytics-consent
 * Update analytics consent and write immutable audit log entry when state changes.
 */
usersRouter.post('/privacy/analytics-consent', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userService = getUserDomainService();
    const payload = analyticsConsentSchema.parse(req.body);
    const now = admin.firestore.Timestamp.now();

    const traceHeader = sanitizeAuditString(req.header('x-cloud-trace-context'), 256);
    const traceId = traceHeader ? traceHeader.split('/')[0] : null;
    const userAgent = sanitizeAuditString(req.get('user-agent'), 256) ?? null;
    const origin = sanitizeAuditString(req.get('origin'), 256) ?? null;
    const ipHash = getHashedAuditValue(getClientIp(req)) ?? null;

    const transactionResult = await userService.updateAnalyticsConsent(userId, {
      granted: payload.granted,
      source: payload.source,
      policyVersion: payload.policyVersion ?? null,
      platform: payload.platform ?? null,
      appVersion: payload.appVersion ?? null,
      now,
      traceId,
      userAgent,
      origin,
      ipHash,
      eventType: ANALYTICS_CONSENT_EVENT_TYPE,
    });

    functions.logger.info('[users] Updated analytics consent state', {
      userId,
      granted: payload.granted,
      source: payload.source,
      changed: transactionResult.hasChanged,
    });

    res.json({
      ...serializeAnalyticsConsent(transactionResult.nextConsent),
      changed: transactionResult.hasChanged,
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

    functions.logger.error('[users] Error updating analytics consent:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update analytics consent state',
    });
  }
});

/**
 * GET /v1/users/privacy/analytics-consent/audit
 * Return recent analytics consent audit events for authenticated user.
 */
usersRouter.get('/privacy/analytics-consent/audit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userService = getUserDomainService();
    const { limit } = analyticsConsentAuditQuerySchema.parse(req.query);
    const auditLimit = limit ?? DEFAULT_AUDIT_QUERY_LIMIT;

    const auditEvents = await userService.listAnalyticsConsentAudit(userId, auditLimit);

    const events = auditEvents.map((event) => {
      const data = event.data as Record<string, unknown>;
      return {
        id: event.id,
        eventType: typeof data.eventType === 'string' ? data.eventType : null,
        granted: typeof data.granted === 'boolean' ? data.granted : null,
        previousGranted:
          typeof data.previousGranted === 'boolean' ? data.previousGranted : null,
        source: typeof data.source === 'string' ? data.source : null,
        policyVersion:
          typeof data.policyVersion === 'string' ? data.policyVersion : null,
        platform: typeof data.platform === 'string' ? data.platform : null,
        appVersion: typeof data.appVersion === 'string' ? data.appVersion : null,
        occurredAt: timestampToIso(data.occurredAt),
      };
    });

    res.json({
      events,
      count: events.length,
      limit: auditLimit,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[users] Error fetching analytics consent audit trail:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch analytics consent audit trail',
    });
  }
});

/**
 * GET /v1/users/ops/restore-audit
 * Operator-facing restore audit trail across soft-deleted resources.
 */
usersRouter.get('/ops/restore-audit', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!ensureOperatorAccessOrReject(req.user, res)) {
      return;
    }

    const userService = getUserDomainService();
    const { limit, cursor, resourceType, ownerUserId, actorUserId, triageStatus } =
      restoreAuditQuerySchema.parse(req.query);
    const auditLimit = limit ?? DEFAULT_RESTORE_AUDIT_QUERY_LIMIT;
    const scanLimit = Math.min(auditLimit * 2, MAX_RESTORE_AUDIT_SCAN_LIMIT);

    const listResult = await userService.listRestoreAuditEvents({
      limit: auditLimit,
      scanLimit,
      cursor,
      resourceType,
      ownerUserId,
      actorUserId,
      triageStatus,
    });
    if (!listResult) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid cursor',
      });
      return;
    }

    const filteredEvents = listResult.events.map((event) => {
      const data = event.data as Record<string, unknown>;
      return {
        id: event.id,
        resourceType: typeof data.resourceType === 'string' ? data.resourceType : null,
        resourceId: typeof data.resourceId === 'string' ? data.resourceId : null,
        ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : null,
        actorUserId: typeof data.actorUserId === 'string' ? data.actorUserId : null,
        actorCategory: typeof data.actorCategory === 'string' ? data.actorCategory : null,
        reason: typeof data.reason === 'string' ? data.reason : null,
        metadata:
          data.metadata && typeof data.metadata === 'object'
            ? (data.metadata as Record<string, unknown>)
            : null,
        triageStatus:
          typeof data.triageStatus === 'string' ? data.triageStatus : 'unreviewed',
        triageNote: typeof data.triageNote === 'string' ? data.triageNote : null,
        triageUpdatedAt: timestampToIso(data.triageUpdatedAt),
        triageUpdatedBy:
          typeof data.triageUpdatedBy === 'string' ? data.triageUpdatedBy : null,
        createdAt: timestampToIso(data.createdAt),
      };
    });

    res.set('X-Has-More', listResult.hasMore ? 'true' : 'false');
    res.set('X-Next-Cursor', listResult.nextCursor || '');

    res.json({
      events: filteredEvents,
      count: filteredEvents.length,
      limit: auditLimit,
      hasMore: listResult.hasMore,
      nextCursor: listResult.nextCursor,
      scanned: listResult.scanned,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[users] Error fetching restore audit trail:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch restore audit trail',
    });
  }
});

/**
 * PATCH /v1/users/ops/restore-audit/:id/triage
 * Persist triage/review state for a restore-audit event.
 */
usersRouter.patch('/ops/restore-audit/:id/triage', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!ensureOperatorAccessOrReject(req.user, res)) {
      return;
    }

    const eventId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (eventId.length === 0) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Event ID is required',
      });
      return;
    }

    const payload = updateRestoreAuditTriageSchema.parse(req.body ?? {});
    const triageNote =
      payload.triageNote !== undefined
        ? sanitizePlainText(payload.triageNote, RESTORE_AUDIT_TRIAGE_NOTE_MAX_LENGTH)
        : undefined;
    const userService = getUserDomainService();
    const now = admin.firestore.Timestamp.now();
    const updatedEvent = await userService.updateRestoreAuditTriage(eventId, {
      triageStatus: payload.triageStatus,
      triageNote:
        payload.triageNote !== undefined ? (triageNote && triageNote.length > 0 ? triageNote : null) : undefined,
      clearTriageNote: payload.clearTriageNote,
      updatedBy: req.user!.uid,
      updatedAt: now,
    });
    if (!updatedEvent) {
      res.status(404).json({
        code: 'not_found',
        message: 'Restore audit event not found',
      });
      return;
    }
    const data = updatedEvent.data as Record<string, unknown>;

    res.json({
      id: updatedEvent.id,
      resourceType: typeof data.resourceType === 'string' ? data.resourceType : null,
      resourceId: typeof data.resourceId === 'string' ? data.resourceId : null,
      ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : null,
      actorUserId: typeof data.actorUserId === 'string' ? data.actorUserId : null,
      actorCategory: typeof data.actorCategory === 'string' ? data.actorCategory : null,
      reason: typeof data.reason === 'string' ? data.reason : null,
      metadata:
        data.metadata && typeof data.metadata === 'object'
          ? (data.metadata as Record<string, unknown>)
          : null,
      triageStatus: typeof data.triageStatus === 'string' ? data.triageStatus : 'unreviewed',
      triageNote: typeof data.triageNote === 'string' ? data.triageNote : null,
      triageUpdatedAt: timestampToIso(data.triageUpdatedAt),
      triageUpdatedBy: typeof data.triageUpdatedBy === 'string' ? data.triageUpdatedBy : null,
      createdAt: timestampToIso(data.createdAt),
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

    functions.logger.error('[users] Error updating restore audit triage state:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update restore audit triage state',
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
    const userService = getUserDomainService();
    const payload = registerPushTokenSchema.parse(req.body);
    const { token, platform, timezone, deviceId, previousToken } = payload;

    const now = admin.firestore.Timestamp.now();
    const result = await userService.registerPushToken({
      userId,
      token,
      platform,
      timezone,
      deviceId,
      previousToken,
      now,
    });

    if (result.fallbackUsed) {
      functions.logger.info(
        `[users] Fallback scan identified ${result.staleRemovedCount} stale push token(s)`,
      );
    }

    if (result.staleRemovedCount > 0) {
      functions.logger.info(
        `[users] Removed ${result.staleRemovedCount} stale push token(s) - device now belongs to user ${userId}`,
      );
    }

    if (result.updatedExisting) {
      functions.logger.info(`[users] Updated push token for user ${userId}`);
    } else {
      functions.logger.info(`[users] Registered new push token for user ${userId}`);
    }

    if (timezone) {
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
    const userService = getUserDomainService();
    const payload = unregisterPushTokenSchema.parse(req.body);
    const { token } = payload;

    const result = await userService.unregisterPushToken(userId, token);
    if (result.deletedCount === 0) {
      res.status(404).json({
        code: 'not_found',
        message: 'Push token not found',
      });
      return;
    }

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
    const userService = getUserDomainService();

    const result = await userService.deleteAllPushTokens(userId);
    if (result.deletedCount === 0) {
      functions.logger.info(`[users] No push tokens to delete for user ${userId}`);
      res.status(204).send();
      return;
    }

    functions.logger.info(
      `[users] Deleted ${result.deletedCount} push token(s) for user ${userId} during logout`,
    );

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
    const userService = getUserDomainService();
    const exportPayload = await userService.getExportData(userId, { auditLimit: 1000 });
    const userData = exportPayload.user ?? {};
    const privacy = (userData?.privacy as Record<string, unknown> | undefined) ?? {};
    const analyticsConsent = (privacy.analyticsConsent as Record<string, unknown> | undefined) ?? {};
    const legalAssent = (privacy.legalAssent as Record<string, unknown> | undefined) ?? {};
    const auditEvents = exportPayload.auditEvents.map((event) => {
      const data = event.data as Record<string, unknown>;
      return {
        id: event.id,
        eventType: typeof data.eventType === 'string' ? data.eventType : null,
        granted: typeof data.granted === 'boolean' ? data.granted : null,
        previousGranted:
          typeof data.previousGranted === 'boolean' ? data.previousGranted : null,
        accepted: typeof data.accepted === 'boolean' ? data.accepted : null,
        termsVersion:
          typeof data.termsVersion === 'string' ? data.termsVersion : null,
        privacyVersion:
          typeof data.privacyVersion === 'string' ? data.privacyVersion : null,
        previousTermsVersion:
          typeof data.previousTermsVersion === 'string' ? data.previousTermsVersion : null,
        previousPrivacyVersion:
          typeof data.previousPrivacyVersion === 'string' ? data.previousPrivacyVersion : null,
        source: typeof data.source === 'string' ? data.source : null,
        policyVersion:
          typeof data.policyVersion === 'string' ? data.policyVersion : null,
        platform: typeof data.platform === 'string' ? data.platform : null,
        appVersion: typeof data.appVersion === 'string' ? data.appVersion : null,
        occurredAt: timestampToIso(data.occurredAt),
      };
    });

    const exportData = {
      user: {
        id: userId,
        ...userData,
        createdAt: userData?.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: userData?.updatedAt?.toDate?.().toISOString() ?? null,
      },
      visits: exportPayload.visits.map((visit) => ({
        id: visit.id,
        ...visit.data,
        createdAt: visit.data.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: visit.data.updatedAt?.toDate?.().toISOString() ?? null,
        visitDate: visit.data.visitDate?.toDate?.().toISOString() ?? null,
        processedAt: visit.data.processedAt?.toDate?.().toISOString() ?? null,
      })),
      actions: exportPayload.actions.map((action) => ({
        id: action.id,
        ...action.data,
        createdAt: action.data.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: action.data.updatedAt?.toDate?.().toISOString() ?? null,
        dueAt: action.data.dueAt?.toDate?.().toISOString() ?? null,
        completedAt: action.data.completedAt?.toDate?.().toISOString() ?? null,
      })),
      medications: exportPayload.medications.map((medication) => ({
        id: medication.id,
        ...medication.data,
        createdAt: medication.data.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: medication.data.updatedAt?.toDate?.().toISOString() ?? null,
        startedAt: medication.data.startedAt?.toDate?.().toISOString() ?? null,
        stoppedAt: medication.data.stoppedAt?.toDate?.().toISOString() ?? null,
      })),
      shares: exportPayload.shares.map((share) => ({
        id: share.id,
        ...share.data,
        createdAt: share.data.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: share.data.updatedAt?.toDate?.().toISOString() ?? null,
        acceptedAt: share.data.acceptedAt?.toDate?.().toISOString() ?? null,
      })),
      privacy: {
        analyticsConsent: serializeAnalyticsConsent(analyticsConsent),
        analyticsConsentAudit: auditEvents.filter(
          (event) => event.eventType === ANALYTICS_CONSENT_EVENT_TYPE,
        ),
        legalAssent: serializeLegalAssent(legalAssent),
        legalAssentAudit: auditEvents.filter(
          (event) => event.eventType === LEGAL_ASSENT_EVENT_TYPE,
        ),
      },
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
    const userService = getUserDomainService();

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

    const deleteCount = await userService.deleteAccountData(userId, emailCandidates);

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
    const userService = getUserDomainService();
    const shareService = getShareDomainService();
    const [userData, shares, invites] = await Promise.all([
      userService.getById(userId),
      shareService.listByOwnerId(userId),
      shareService.listInvitesByOwnerId(userId),
    ]);

    const caregivers = [];

    // Add accepted shares as active caregivers
    for (const share of shares) {
      if (share.status === 'accepted') {
        caregivers.push({
          id: share.id,
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
    for (const invite of invites) {
      if (invite.status !== 'pending') {
        continue;
      }
      const email = invite.caregiverEmail || invite.inviteeEmail;
      caregivers.push({
        id: invite.id,
        name: email?.split('@')[0] || 'Pending',
        email,
        relationship: invite.role || 'viewer',
        status: 'pending',
        createdAt: invite.createdAt?.toDate?.()?.toISOString() ?? null,
      });
    }

    res.json({
      caregivers,
      autoShareWithCaregivers: resolveAutoShareWithCaregivers(
        userData?.autoShareWithCaregivers,
      ),
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
    const shareService = getShareDomainService();

    const share = await shareService.getById(caregiverId);
    if (share && hasResourceOwnerAccess(userId, share, { ownerField: 'ownerId' })) {
      await shareService.setShare(
        caregiverId,
        {
          status: 'revoked',
          revokedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      functions.logger.info(`[users] Revoked share ${caregiverId} for user ${userId}`);
      res.status(204).send();
      return;
    }

    const invite = await shareService.getInviteById(caregiverId);
    if (invite && hasResourceOwnerAccess(userId, invite, { ownerField: 'ownerId' })) {
      await shareService.updateInviteRecord(caregiverId, {
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
