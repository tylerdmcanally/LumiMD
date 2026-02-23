import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import {
  requireAuth,
  AuthRequest,
  hasOperatorAccess,
  ensureOperatorAccessOrReject,
  ensureOperatorRestoreReasonOrReject,
} from '../middlewares/auth';
import { storageConfig } from '../config';
import { normalizeMedicationSummary } from '../services/medicationSync';
import { getAssemblyAIService } from '../services/assemblyai';
import { sanitizePlainText } from '../utils/inputSanitization';
import { createDomainServiceContainer } from '../services/domain/serviceContainer';
import { RepositoryValidationError } from '../services/repositories/common/errors';
import type { VisitRecord } from '../services/repositories/visits/VisitRepository';
import {
  calculateRetryWaitSeconds,
  resolveRetryPath,
} from '../services/visitProcessingTransitions';
import {
  RESTORE_REASON_MAX_LENGTH,
  recordRestoreAuditEvent,
} from '../services/restoreAuditService';
import {
  ensureVisitOwnerAccessOrReject,
  ensureVisitReadAccessOrReject,
} from '../middlewares/visitAccess';

export const visitsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();
const getVisitDomainService = () => createDomainServiceContainer({ db: getDb() }).visitService;
const VISIT_NOTES_MAX_LENGTH = 10000;
const VISIT_SUMMARY_MAX_LENGTH = 20000;
const VISIT_METADATA_MAX_LENGTH = 256;
const VISIT_LIST_TEXT_MAX_LENGTH = 256;
const VISITS_PAGE_SIZE_DEFAULT = 50;
const VISITS_PAGE_SIZE_MAX = 100;
const VISITS_ESCALATIONS_PAGE_SIZE_DEFAULT = 25;
const VISITS_ESCALATIONS_PAGE_SIZE_MAX = 100;
const VISITS_ESCALATION_NOTE_MAX_LENGTH = 1000;

const decodeStoragePathFromAudioUrl = (audioUrl?: string | null): string | null => {
  if (!audioUrl) return null;
  try {
    const url = new URL(audioUrl);
    const parts = url.pathname.split('/o/');
    if (parts.length < 2) return null;
    return decodeURIComponent(parts[1]);
  } catch (error) {
    functions.logger.warn('[visits] Failed to parse storage path from audioUrl', error);
    return null;
  }
};

const parseBucketFromAudioUrl = (audioUrl?: string | null): string | null => {
  if (!audioUrl) return null;
  try {
    const match = audioUrl.match(/\/b\/([^/]+)\//);
    return match ? match[1] : null;
  } catch (error) {
    functions.logger.warn('[visits] Failed to parse bucket from audioUrl', error);
    return null;
  }
};

const timestampToIso = (value: unknown): string | null =>
  (value as admin.firestore.Timestamp | undefined)?.toDate?.().toISOString?.() ?? null;

const normalizeOperationList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

const normalizeOperationAttempts = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const attempts: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>).forEach(([operation, rawAttempts]) => {
    if (typeof rawAttempts !== 'number' || !Number.isFinite(rawAttempts) || rawAttempts < 0) {
      return;
    }
    attempts[operation] = Math.floor(rawAttempts);
  });
  return attempts;
};

const normalizeOperationRetryAt = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const retryAtByOperation: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([operation, rawTimestamp]) => {
    const iso = timestampToIso(rawTimestamp);
    if (!iso) {
      return;
    }
    retryAtByOperation[operation] = iso;
  });
  return retryAtByOperation;
};

const serializeVisitForResponse = (visit: VisitRecord) => ({
  ...visit,
  id: visit.id,
  createdAt: visit.createdAt?.toDate?.().toISOString?.(),
  updatedAt: visit.updatedAt?.toDate?.().toISOString?.(),
  processedAt: visit.processedAt?.toDate?.().toISOString?.() ?? null,
  visitDate: visit.visitDate?.toDate?.()
    ? visit.visitDate.toDate().toISOString()
    : visit.visitDate ?? null,
});

const sanitizeStringArray = (
  values: unknown,
  maxLength: number = VISIT_LIST_TEXT_MAX_LENGTH,
): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => sanitizePlainText(value, maxLength))
        .filter((value): value is string => value.length > 0),
    ),
  );
};

// Validation schemas
const medicationEntrySchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    dose: z.string().optional(),
    frequency: z.string().optional(),
    note: z.string().optional(),
    display: z.string().optional(),
    original: z.string().optional(),
  }),
]);

const medicationsSchema = z.object({
  started: z.array(medicationEntrySchema).optional(),
  stopped: z.array(medicationEntrySchema).optional(),
  changed: z.array(medicationEntrySchema).optional(),
});

const processingStatusEnum = z.enum([
  'pending',
  'processing',
  'transcribing',
  'summarizing',
  'completed',
  'failed',
]);

const createVisitSchema = z.object({
  audioUrl: z.string().optional(),
  storagePath: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['recording', 'processing', 'completed', 'failed']).default('recording'),
});

const updateVisitSchema = z.object({
  notes: z.string().optional(),
  status: z.enum(['recording', 'processing', 'completed', 'failed']).optional(),
  transcript: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  diagnoses: z.array(z.string()).optional(),
  medications: medicationsSchema.optional(),
  imaging: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  processingStatus: processingStatusEnum.optional(),
  processedAt: z.string().nullable().optional(),
  storagePath: z.string().optional(),
  provider: z.string().optional(),
  location: z.string().optional(),
  specialty: z.string().optional(),
  visitDate: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  folders: z.array(z.string()).optional(),
});

const acknowledgeEscalationSchema = z.object({
  note: z.string().max(VISITS_ESCALATION_NOTE_MAX_LENGTH).optional(),
});

const resolveEscalationSchema = z.object({
  note: z.string().max(VISITS_ESCALATION_NOTE_MAX_LENGTH).optional(),
});

const restoreVisitSchema = z.object({
  reason: z.string().max(RESTORE_REASON_MAX_LENGTH).optional(),
});

/**
 * GET /v1/visits
 * List all visits for the authenticated user
 * Query params:
 * - limit: number (optional) - limit results
 * - sort: 'asc' | 'desc' (optional) - sort by createdAt
 */
visitsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitService = getVisitDomainService();
    const rawLimit = req.query.limit;
    const cursor =
      typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
        ? req.query.cursor.trim()
        : null;
    const paginationRequested = rawLimit !== undefined || cursor !== null;
    const sort = req.query.sort as 'asc' | 'desc' | undefined;
    const orderDirection = sort === 'asc' ? 'asc' : 'desc';

    let limit = VISITS_PAGE_SIZE_DEFAULT;
    if (rawLimit !== undefined) {
      const parsedLimit = parseInt(String(rawLimit), 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'limit must be a positive integer',
        });
        return;
      }
      limit = Math.min(parsedLimit, VISITS_PAGE_SIZE_MAX);
    }

    let visits: VisitRecord[];
    let hasMore = false;
    let nextCursor: string | null = null;

    if (paginationRequested) {
      const page = await visitService.listForUser(userId, {
        limit,
        cursor,
        sortDirection: orderDirection,
      });

      visits = page.items;
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
    } else {
      visits = await visitService.listAllForUser(userId, {
        sortDirection: orderDirection,
      });
    }

    if (paginationRequested) {
      res.set('X-Has-More', hasMore ? 'true' : 'false');
      res.set('X-Next-Cursor', nextCursor || '');
    }

    const serializedVisits = visits.map((visit) => serializeVisitForResponse(visit));

    functions.logger.info(`[visits] Listed ${serializedVisits.length} visits for user ${userId}`, {
      paginated: paginationRequested,
      hasMore,
      nextCursor,
      orderDirection,
    });
    res.json(serializedVisits);
  } catch (error) {
    if (error instanceof RepositoryValidationError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid cursor',
      });
      return;
    }

    functions.logger.error('[visits] Error listing visits:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch visits',
    });
  }
});

/**
 * GET /v1/visits/:id
 * Get a single visit by ID
 */
visitsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;
    const visitService = getVisitDomainService();

    const visit = await visitService.getById(visitId);
    if (!visit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    if (!(await ensureVisitReadAccessOrReject(userId, visit, res))) {
      return;
    }

    res.json(serializeVisitForResponse(visit));
  } catch (error) {
    functions.logger.error('[visits] Error getting visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch visit',
    });
  }
});

/**
 * GET /v1/visits/ops/post-commit-escalations
 * List escalated post-commit visit processing failures for operators
 */
visitsRouter.get('/ops/post-commit-escalations', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!ensureOperatorAccessOrReject(req.user, res)) {
      return;
    }

    const rawLimit = req.query.limit;
    const cursor =
      typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
        ? req.query.cursor.trim()
        : null;

    let limit = VISITS_ESCALATIONS_PAGE_SIZE_DEFAULT;
    if (rawLimit !== undefined) {
      const parsedLimit = parseInt(String(rawLimit), 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'limit must be a positive integer',
        });
        return;
      }
      limit = Math.min(parsedLimit, VISITS_ESCALATIONS_PAGE_SIZE_MAX);
    }

    let query = getDb()
      .collection('visits')
      .where('postCommitStatus', '==', 'partial_failure')
      .where('postCommitEscalatedAt', '!=', null)
      .orderBy('postCommitEscalatedAt', 'desc');

    if (cursor) {
      const cursorDoc = await getDb().collection('visits').doc(cursor).get();
      const cursorData = cursorDoc.data();
      if (
        !cursorDoc.exists ||
        cursorData?.postCommitStatus !== 'partial_failure' ||
        !cursorData?.postCommitEscalatedAt
      ) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid cursor',
        });
        return;
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.limit(limit + 1).get();
    const pageDocs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

    res.set('X-Has-More', hasMore ? 'true' : 'false');
    res.set('X-Next-Cursor', nextCursor || '');

    const escalations = pageDocs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: typeof data.userId === 'string' ? data.userId : null,
        processingStatus: typeof data.processingStatus === 'string' ? data.processingStatus : null,
        postCommitStatus:
          typeof data.postCommitStatus === 'string' ? data.postCommitStatus : null,
        postCommitRetryEligible:
          typeof data.postCommitRetryEligible === 'boolean'
            ? data.postCommitRetryEligible
            : null,
        postCommitFailedOperations: normalizeOperationList(data.postCommitFailedOperations),
        postCommitCompletedOperations: normalizeOperationList(data.postCommitCompletedOperations),
        postCommitOperationAttempts: normalizeOperationAttempts(data.postCommitOperationAttempts),
        postCommitOperationNextRetryAt: normalizeOperationRetryAt(
          data.postCommitOperationNextRetryAt,
        ),
        postCommitLastAttemptAt: timestampToIso(data.postCommitLastAttemptAt),
        postCommitCompletedAt: timestampToIso(data.postCommitCompletedAt),
        postCommitEscalatedAt: timestampToIso(data.postCommitEscalatedAt),
        postCommitEscalationAcknowledgedAt: timestampToIso(
          data.postCommitEscalationAcknowledgedAt,
        ),
        postCommitEscalationAcknowledgedBy:
          typeof data.postCommitEscalationAcknowledgedBy === 'string'
            ? data.postCommitEscalationAcknowledgedBy
            : null,
        postCommitEscalationNote:
          typeof data.postCommitEscalationNote === 'string'
            ? data.postCommitEscalationNote
            : null,
        postCommitEscalationResolvedAt: timestampToIso(data.postCommitEscalationResolvedAt),
        postCommitEscalationResolvedBy:
          typeof data.postCommitEscalationResolvedBy === 'string'
            ? data.postCommitEscalationResolvedBy
            : null,
        postCommitEscalationResolutionNote:
          typeof data.postCommitEscalationResolutionNote === 'string'
            ? data.postCommitEscalationResolutionNote
            : null,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
        visitDate: timestampToIso(data.visitDate),
      };
    });

    functions.logger.info('[visits] Listed escalated post-commit failures', {
      operatorId: req.user?.uid ?? null,
      count: escalations.length,
      hasMore,
      nextCursor,
    });

    res.json({ escalations });
  } catch (error) {
    functions.logger.error('[visits] Error listing post-commit escalations:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch escalated visit failures',
    });
  }
});

/**
 * POST /v1/visits/ops/post-commit-escalations/:id/acknowledge
 * Acknowledge an escalated post-commit visit processing failure
 */
visitsRouter.post(
  '/ops/post-commit-escalations/:id/acknowledge',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      if (!ensureOperatorAccessOrReject(req.user, res)) {
        return;
      }

      const operatorId = req.user!.uid;
      const visitId = req.params.id;
      const payload = acknowledgeEscalationSchema.parse(req.body ?? {});
      const visitService = getVisitDomainService();

      const visit = await visitService.getById(visitId);
      if (!visit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      if (!visit.postCommitEscalatedAt) {
        res.status(409).json({
          code: 'not_escalated',
          message: 'Visit does not have an active escalation',
        });
        return;
      }

      const note =
        payload.note !== undefined
          ? sanitizePlainText(payload.note, VISITS_ESCALATION_NOTE_MAX_LENGTH)
          : undefined;
      const now = admin.firestore.Timestamp.now();

      const updatedVisit = await visitService.updateRecord(visitId, {
        postCommitEscalationAcknowledgedAt: now,
        postCommitEscalationAcknowledgedBy: operatorId,
        postCommitEscalationNote: note !== undefined ? note : admin.firestore.FieldValue.delete(),
        updatedAt: now,
      });
      if (!updatedVisit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      functions.logger.info('[visits] Acknowledged post-commit escalation', {
        operatorId,
        visitId,
      });

      res.json({
        success: true,
        id: visitId,
        acknowledgedAt: now.toDate().toISOString(),
        acknowledgedBy: operatorId,
        note: note ?? null,
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

      functions.logger.error('[visits] Error acknowledging post-commit escalation:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to acknowledge escalated visit failure',
      });
    }
  },
);

/**
 * POST /v1/visits/ops/post-commit-escalations/:id/resolve
 * Mark an escalated post-commit failure as resolved by an operator
 */
visitsRouter.post(
  '/ops/post-commit-escalations/:id/resolve',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      if (!ensureOperatorAccessOrReject(req.user, res)) {
        return;
      }

      const operatorId = req.user!.uid;
      const visitId = req.params.id;
      const payload = resolveEscalationSchema.parse(req.body ?? {});
      const visitService = getVisitDomainService();

      const visit = await visitService.getById(visitId);
      if (!visit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      if (!visit.postCommitEscalatedAt) {
        res.status(409).json({
          code: 'not_escalated',
          message: 'Visit does not have an active escalation',
        });
        return;
      }

      const note =
        payload.note !== undefined
          ? sanitizePlainText(payload.note, VISITS_ESCALATION_NOTE_MAX_LENGTH)
          : undefined;
      const now = admin.firestore.Timestamp.now();

      const updatedVisit = await visitService.updateRecord(visitId, {
        postCommitEscalationResolvedAt: now,
        postCommitEscalationResolvedBy: operatorId,
        postCommitEscalationResolutionNote:
          note !== undefined ? note : admin.firestore.FieldValue.delete(),
        postCommitEscalationAcknowledgedAt:
          visit.postCommitEscalationAcknowledgedAt || now,
        postCommitEscalationAcknowledgedBy:
          visit.postCommitEscalationAcknowledgedBy || operatorId,
        updatedAt: now,
      });
      if (!updatedVisit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      functions.logger.info('[visits] Resolved post-commit escalation', {
        operatorId,
        visitId,
      });

      res.json({
        success: true,
        id: visitId,
        resolvedAt: now.toDate().toISOString(),
        resolvedBy: operatorId,
        note: note ?? null,
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

      functions.logger.error('[visits] Error resolving post-commit escalation:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to resolve escalated visit failure',
      });
    }
  },
);

/**
 * POST /v1/visits/ops/post-commit-escalations/:id/reopen
 * Reopen a resolved escalation when the incident requires follow-up
 */
visitsRouter.post(
  '/ops/post-commit-escalations/:id/reopen',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      if (!ensureOperatorAccessOrReject(req.user, res)) {
        return;
      }

      const operatorId = req.user!.uid;
      const visitId = req.params.id;
      const visitService = getVisitDomainService();
      const visit = await visitService.getById(visitId);
      if (!visit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      if (!visit.postCommitEscalatedAt) {
        res.status(409).json({
          code: 'not_escalated',
          message: 'Visit does not have an active escalation',
        });
        return;
      }

      const now = admin.firestore.Timestamp.now();
      const updatedVisit = await visitService.updateRecord(visitId, {
        postCommitEscalatedAt: now,
        postCommitEscalationResolvedAt: admin.firestore.FieldValue.delete(),
        postCommitEscalationResolvedBy: admin.firestore.FieldValue.delete(),
        postCommitEscalationResolutionNote: admin.firestore.FieldValue.delete(),
        postCommitEscalationAcknowledgedAt: admin.firestore.FieldValue.delete(),
        postCommitEscalationAcknowledgedBy: admin.firestore.FieldValue.delete(),
        postCommitEscalationNote: admin.firestore.FieldValue.delete(),
        updatedAt: now,
      });
      if (!updatedVisit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      functions.logger.info('[visits] Reopened post-commit escalation', {
        operatorId,
        visitId,
      });

      res.json({
        success: true,
        id: visitId,
        reopenedAt: now.toDate().toISOString(),
        reopenedBy: operatorId,
      });
    } catch (error) {
      functions.logger.error('[visits] Error reopening post-commit escalation:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to reopen escalated visit failure',
      });
    }
  },
);

/**
 * POST /v1/visits
 * Create a new visit (premium)
 */
visitsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitService = getVisitDomainService();

    // Validate request body
    const data = createVisitSchema.parse(req.body);

    const now = admin.firestore.Timestamp.now();

    // Create visit document
    const visit = await visitService.createRecord({
      userId,
      audioUrl: data.audioUrl || null,
      storagePath: data.storagePath || null,
      notes: sanitizePlainText(data.notes, VISIT_NOTES_MAX_LENGTH),
      status: data.status,
      processingStatus: 'pending',
      transcript: null,
      summary: null,
      diagnoses: [],
      medications: {
        started: [],
        stopped: [],
        changed: [],
      },
      imaging: [],
      nextSteps: [],
      processedAt: null,
      retryCount: 0,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    functions.logger.info(`[visits] Created visit ${visit.id} for user ${userId}`);

    res.status(201).json({
      ...visit,
      createdAt: visit.createdAt.toDate().toISOString(),
      updatedAt: visit.updatedAt.toDate().toISOString(),
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

    functions.logger.error('[visits] Error creating visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to create visit',
    });
  }
});

/**
 * PATCH /v1/visits/:id
 * Update a visit
 */
visitsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;
    const visitService = getVisitDomainService();

    // Validate request body
    const data = updateVisitSchema.parse(req.body);

    const visit = await visitService.getById(visitId);
    if (!visit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    if (!ensureVisitOwnerAccessOrReject(userId, visit, res)) {
      return;
    }

    const updatePayload: Record<string, unknown> = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (data.notes !== undefined) {
      updatePayload.notes = sanitizePlainText(data.notes, VISIT_NOTES_MAX_LENGTH);
    }

    if (data.status !== undefined) {
      updatePayload.status = data.status;
    }

    if (data.transcript !== undefined) {
      updatePayload.transcript = data.transcript;
    }

    if (data.summary !== undefined) {
      updatePayload.summary = data.summary === null
        ? null
        : sanitizePlainText(data.summary, VISIT_SUMMARY_MAX_LENGTH);
    }

    if (data.diagnoses !== undefined) {
      updatePayload.diagnoses = sanitizeStringArray(data.diagnoses);
    }

    if (data.medications !== undefined) {
      updatePayload.medications = normalizeMedicationSummary(data.medications);
    }

    if (data.imaging !== undefined) {
      updatePayload.imaging = sanitizeStringArray(data.imaging);
    }

    if (data.nextSteps !== undefined) {
      updatePayload.nextSteps = sanitizeStringArray(data.nextSteps);
    }

    if (data.processingStatus !== undefined) {
      updatePayload.processingStatus = data.processingStatus;
    }

    if (data.processedAt !== undefined) {
      updatePayload.processedAt = data.processedAt
        ? admin.firestore.Timestamp.fromDate(new Date(data.processedAt))
        : null;
    }

    if (data.provider !== undefined) {
      updatePayload.provider = sanitizePlainText(data.provider, VISIT_METADATA_MAX_LENGTH) || null;
    }

    if (data.location !== undefined) {
      updatePayload.location = sanitizePlainText(data.location, VISIT_METADATA_MAX_LENGTH) || null;
    }

    if (data.specialty !== undefined) {
      updatePayload.specialty = sanitizePlainText(data.specialty, VISIT_METADATA_MAX_LENGTH) || null;
    }

    if (data.visitDate !== undefined) {
      updatePayload.visitDate = data.visitDate
        ? admin.firestore.Timestamp.fromDate(new Date(data.visitDate))
        : null;
    }

    if (data.tags !== undefined) {
      updatePayload.tags = sanitizeStringArray(data.tags);
    }

    if (data.folders !== undefined) {
      updatePayload.folders = sanitizeStringArray(data.folders);
    }

    const updatedVisit = await visitService.updateRecord(visitId, updatePayload);
    if (!updatedVisit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    functions.logger.info(`[visits] Updated visit ${visitId} for user ${userId}`);

    res.json(serializeVisitForResponse(updatedVisit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[visits] Error updating visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update visit',
    });
  }
});

/**
 * DELETE /v1/visits/:id
 * Remove a visit and related resources
 */
visitsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;
    const visitService = getVisitDomainService();

    const visit = await visitService.getById(visitId);
    if (!visit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    if (!ensureVisitOwnerAccessOrReject(userId, visit, res)) {
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const { softDeletedActions } = await visitService.softDeleteRecord(visitId, userId, now);

    functions.logger.info(
      `[visits] Soft-deleted visit ${visitId} and related actions for user ${userId}`,
      { softDeletedActions },
    );

    res.status(204).send();
  } catch (error) {
    functions.logger.error('[visits] Error deleting visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to delete visit',
    });
  }
});

/**
 * POST /v1/visits/:id/restore
 * Restore a soft-deleted visit and related action items
 */
visitsRouter.post('/:id/restore', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;
    const isOperator = hasOperatorAccess(req.user);
    const visitService = getVisitDomainService();

    const payload = restoreVisitSchema.safeParse(req.body ?? {});
    if (!payload.success) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid restore request body',
        details: payload.error.errors,
      });
      return;
    }
    const restoreReason =
      sanitizePlainText(payload.data.reason, RESTORE_REASON_MAX_LENGTH) || undefined;

    const visit = await visitService.getById(visitId);
    if (!visit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    if (!ensureVisitOwnerAccessOrReject(userId, visit, res, {
      allowOperator: true,
      isOperator,
      allowDeleted: true,
    })) {
      return;
    }

    if (!ensureOperatorRestoreReasonOrReject({
      actorUserId: userId,
      ownerUserId: visit.userId,
      isOperator,
      reason: restoreReason,
      res,
    })) {
      return;
    }

    if (!visit.deletedAt) {
      res.status(409).json({
        code: 'not_deleted',
        message: 'Visit is not deleted',
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const { restoredActions } = await visitService.restoreRecord(visitId, userId, now);

    try {
      await recordRestoreAuditEvent({
        resourceType: 'visit',
        resourceId: visitId,
        ownerUserId: visit.userId,
        actorUserId: userId,
        actorIsOperator: isOperator,
        reason: restoreReason,
        metadata: {
          route: 'visits.restore',
          restoredActions,
        },
        createdAt: now,
      });
    } catch (auditError) {
      functions.logger.error('[visits] Failed to record restore audit event', {
        visitId,
        actorUserId: userId,
        ownerUserId: visit.userId,
        message: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }

    functions.logger.info(
      `[visits] Restored visit ${visitId} and ${restoredActions} related action(s) for user ${userId}`,
    );

    res.json({
      success: true,
      id: visitId,
      restoredActions,
      restoredBy: userId,
      restoredFor: visit.userId,
      reason: restoreReason ?? null,
      restoredAt: now.toDate().toISOString(),
    });
  } catch (error) {
    functions.logger.error('[visits] Error restoring visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to restore visit',
    });
  }
});

/**
 * POST /v1/visits/:id/retry
 * Re-run AI processing for a visit
 */
visitsRouter.post('/:id/retry', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;
    const visitService = getVisitDomainService();

    const visit = await visitService.getById(visitId);
    if (!visit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    if (!ensureVisitOwnerAccessOrReject(userId, visit, res)) {
      return;
    }

    if (['processing', 'transcribing', 'summarizing'].includes(visit.processingStatus)) {
      res.status(409).json({
        code: 'already_processing',
        message: 'This visit is currently being processed',
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const lastRetryAt = visit.lastRetryAt as admin.firestore.Timestamp | undefined;
    const MIN_RETRY_INTERVAL_MS = 30 * 1000;

    const waitSeconds = calculateRetryWaitSeconds({
      lastRetryAtMillis: lastRetryAt?.toMillis?.(),
      nowMillis: Date.now(),
      minIntervalMs: MIN_RETRY_INTERVAL_MS,
    });

    if (waitSeconds > 0) {
      res.status(429).json({
        code: 'retry_too_soon',
        message: `Please wait ${waitSeconds} more seconds before retrying`,
      });
      return;
    }

    const storagePath =
      visit.storagePath || decodeStoragePathFromAudioUrl(visit.audioUrl) || null;

    if (!storagePath) {
      res.status(400).json({
        code: 'missing_audio',
        message: 'Visit has no associated audio file to process',
      });
      return;
    }

    const bucketName =
      parseBucketFromAudioUrl(visit.audioUrl) || storageConfig.bucket || visit.bucketName;

    // Check if we already have a transcript to save costs/time
    const retryPath = resolveRetryPath({
      transcript: visit.transcript,
      transcriptText: visit.transcriptText,
    });
    let updatedVisit: VisitRecord | null = null;

    if (retryPath === 'summarize') {
      // Skip transcription and go straight to summarization
      updatedVisit = await visitService.updateRecord(visitId, {
        processingStatus: 'summarizing',
        status: 'processing',
        processingError: admin.firestore.FieldValue.delete(),
        summarizationStartedAt: admin.firestore.FieldValue.delete(),
        summarizationCompletedAt: admin.firestore.FieldValue.delete(),
        summary: admin.firestore.FieldValue.delete(),
        diagnoses: [],
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        imaging: [],
        nextSteps: [],
        processedAt: null,
        lastRetryAt: now,
        retryCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      });
      if (!updatedVisit) {
        res.status(404).json({
          code: 'not_found',
          message: 'Visit not found',
        });
        return;
      }

      functions.logger.info(`[visits] Retrying visit ${visitId} starting from summarization (transcript found)`);
    } else {
      // No transcript, full re-process
      try {
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(storagePath);

        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 4 * 60 * 60 * 1000, // 4 hours to allow for long transcription queues
        });

        if (!signedUrl) {
          throw new Error('Unable to generate signed URL for transcription');
        }

        const assemblyAI = getAssemblyAIService();
        const transcriptionId = await assemblyAI.submitTranscription(signedUrl);

        updatedVisit = await visitService.updateRecord(visitId, {
          transcriptionId,
          transcriptionStatus: 'submitted',
          transcriptionSubmittedAt: now,
          transcriptionCompletedAt: null,
          summarizationStartedAt: admin.firestore.FieldValue.delete(),
          summarizationCompletedAt: admin.firestore.FieldValue.delete(),
          transcript: admin.firestore.FieldValue.delete(),
          transcriptText: admin.firestore.FieldValue.delete(),
          summary: admin.firestore.FieldValue.delete(),
          diagnoses: [],
          medications: {
            started: [],
            stopped: [],
            changed: [],
          },
          imaging: [],
          nextSteps: [],
          processedAt: null,
          processingStatus: 'transcribing',
          status: 'processing',
          processingError: admin.firestore.FieldValue.delete(),
          lastRetryAt: now,
          retryCount: admin.firestore.FieldValue.increment(1),
          storagePath,
          updatedAt: now,
        });
        if (!updatedVisit) {
          res.status(404).json({
            code: 'not_found',
            message: 'Visit not found',
          });
          return;
        }

        functions.logger.info(`[visits] Retrying visit ${visitId} with full re-transcription`);
      } catch (error) {
        functions.logger.error(`[visits] Error submitting visit ${visitId} for retry:`, error);
        res.status(500).json({
          code: 'retry_failed',
          message: 'Failed to requeue visit for processing',
        });
        return;
      }
    }

    if (!updatedVisit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    res.json(serializeVisitForResponse(updatedVisit));
  } catch (error) {
    functions.logger.error('[visits] Error retrying visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to retry visit processing',
    });
  }
});

/**
 * POST /v1/visits/:id/share-with-caregivers
 * Send visit summary PDF to caregivers
 */
visitsRouter.post('/:id/share-with-caregivers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;
    const visitService = getVisitDomainService();

    // Validate optional caregiver filter
    const caregiverIds = Array.isArray(req.body.caregiverIds) ? req.body.caregiverIds : undefined;

    // Verify visit exists and belongs to user
    const visit = await visitService.getById(visitId);
    if (!visit) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }
    if (!ensureVisitOwnerAccessOrReject(userId, visit, res)) {
      return;
    }

    // Check visit has been processed
    if (visit.processingStatus !== 'completed' && visit.status !== 'completed') {
      res.status(400).json({
        code: 'not_ready',
        message: 'Visit must be fully processed before sharing',
      });
      return;
    }

    // Import and call the caregiver email service
    const { sendVisitPdfToAllCaregivers } = await import('../services/caregiverEmailService');
    const result = await sendVisitPdfToAllCaregivers(userId, visitId, caregiverIds);

    if (result.sent === 0 && result.failed === 0) {
      res.status(400).json({
        code: 'no_caregivers',
        message: 'No active caregivers to share with',
      });
      return;
    }

    functions.logger.info(`[visits] Shared visit ${visitId} with caregivers`, {
      userId,
      sent: result.sent,
      failed: result.failed,
    });

    res.json({
      message: `Sent to ${result.sent} caregiver(s)`,
      sent: result.sent,
      failed: result.failed,
      results: result.results,
    });
  } catch (error) {
    functions.logger.error('[visits] Error sharing with caregivers:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to share visit with caregivers',
    });
  }
});
