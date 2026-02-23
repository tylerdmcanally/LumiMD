import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import {
  requireAuth,
  AuthRequest,
  hasOperatorAccess,
  ensureOperatorRestoreReasonOrReject,
} from '../middlewares/auth';
import { ensureResourceOwnerAccessOrReject } from '../middlewares/resourceAccess';
import { sanitizePlainText } from '../utils/inputSanitization';
import { createDomainServiceContainer } from '../services/domain/serviceContainer';
import { RepositoryValidationError } from '../services/repositories/common/errors';
import type { ActionRecord } from '../services/repositories/actions/ActionRepository';
import {
  RESTORE_REASON_MAX_LENGTH,
  recordRestoreAuditEvent,
} from '../services/restoreAuditService';

export const actionsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();
const getActionDomainService = () => createDomainServiceContainer({ db: getDb() }).actionService;
const ACTION_DESCRIPTION_MAX_LENGTH = 5000;
const ACTION_NOTES_MAX_LENGTH = 10000;
const ACTIONS_PAGE_SIZE_DEFAULT = 50;
const ACTIONS_PAGE_SIZE_MAX = 100;

const serializeActionForResponse = (action: ActionRecord) => ({
  ...action,
  id: action.id,
  createdAt: action.createdAt?.toDate?.().toISOString?.(),
  updatedAt: action.updatedAt?.toDate?.().toISOString?.(),
  completedAt: action.completedAt?.toDate?.()?.toISOString?.() || null,
  dueAt: action.dueAt?.toDate?.()?.toISOString?.() || null,
});

// Validation schemas
const calendarEventEntrySchema = z.object({
  platform: z.string().optional(),
  calendarId: z.string().nullable().optional(),
  eventId: z.string().min(1),
  addedAt: z.string().optional(),
  removedAt: z.string().optional(),
});

const calendarEventsSchema = z
  .record(calendarEventEntrySchema)
  .nullable()
  .optional();

const createActionSchema = z.object({
  description: z.string().min(1).max(ACTION_DESCRIPTION_MAX_LENGTH),
  notes: z.string().max(ACTION_NOTES_MAX_LENGTH).optional(),
  dueAt: z.string().nullable().optional(),
  visitId: z.string().nullable().optional(),
  calendarEvents: calendarEventsSchema,
});

const updateActionSchema = z.object({
  description: z.string().min(1).max(ACTION_DESCRIPTION_MAX_LENGTH).optional(),
  notes: z.string().max(ACTION_NOTES_MAX_LENGTH).optional(),
  dueAt: z.string().nullable().optional(),
  visitId: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  completedAt: z.string().optional(),
  calendarEvents: calendarEventsSchema,
});

const restoreActionSchema = z.object({
  reason: z.string().max(RESTORE_REASON_MAX_LENGTH).optional(),
});

/**
 * GET /v1/actions
 * List all action items for the authenticated user
 */
actionsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const actionService = getActionDomainService();

    const rawLimit = req.query.limit;
    const cursor =
      typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
        ? req.query.cursor.trim()
        : null;
    const paginationRequested = rawLimit !== undefined || cursor !== null;

    let limit = ACTIONS_PAGE_SIZE_DEFAULT;
    if (rawLimit !== undefined) {
      const parsedLimit = parseInt(String(rawLimit), 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'limit must be a positive integer',
        });
        return;
      }
      limit = Math.min(parsedLimit, ACTIONS_PAGE_SIZE_MAX);
    }

    let actions: ActionRecord[];
    let hasMore = false;
    let nextCursor: string | null = null;

    if (paginationRequested) {
      const page = await actionService.listForUser(userId, {
        limit,
        cursor,
        sortDirection: 'desc',
      });
      actions = page.items;
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;

      res.set('X-Has-More', hasMore ? 'true' : 'false');
      res.set('X-Next-Cursor', nextCursor || '');
    } else {
      actions = await actionService.listAllForUser(userId, {
        sortDirection: 'desc',
      });
    }

    const serialized = actions.map((action) => serializeActionForResponse(action));

    functions.logger.info(`[actions] Listed ${serialized.length} actions for user ${userId}`, {
      paginated: paginationRequested,
      hasMore,
      nextCursor,
    });
    res.json(serialized);
  } catch (error) {
    if (error instanceof RepositoryValidationError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid cursor',
      });
      return;
    }

    functions.logger.error('[actions] Error listing actions:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch actions',
    });
  }
});

/**
 * GET /v1/actions/:id
 * Get a single action by ID
 */
actionsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const actionId = req.params.id;
    const actionService = getActionDomainService();
    
    const action = await actionService.getById(actionId);

    if (!action) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }

    if (!ensureResourceOwnerAccessOrReject(userId, action, res, {
      resourceName: 'action',
      message: 'You do not have access to this action',
      notFoundMessage: 'Action not found',
    })) {
      return;
    }
    
    res.json(serializeActionForResponse(action));
  } catch (error) {
    functions.logger.error('[actions] Error getting action:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch action',
    });
  }
});

/**
 * POST /v1/actions
 * Create a manual action item
 */
actionsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const actionService = getActionDomainService();

    const data = createActionSchema.parse(req.body);
    const now = admin.firestore.Timestamp.now();
    const description = sanitizePlainText(data.description, ACTION_DESCRIPTION_MAX_LENGTH);
    const notes = sanitizePlainText(data.notes, ACTION_NOTES_MAX_LENGTH);

    if (!description) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Description is required',
      });
      return;
    }

    const dueAtTimestamp = data.dueAt
      ? admin.firestore.Timestamp.fromDate(new Date(data.dueAt))
      : null;

    const payload: FirebaseFirestore.DocumentData = {
      userId,
      description,
      notes,
      completed: false,
      source: data.visitId ? 'visit' : 'manual',
      visitId: data.visitId || null,
      dueAt: dueAtTimestamp,
      calendarEvents: data.calendarEvents || null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      deletedAt: null,
      deletedBy: null,
    };

    const action = await actionService.createRecord(payload);
    res.status(201).json(serializeActionForResponse(action));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }
    functions.logger.error('[actions] Error creating action:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to create action item',
    });
  }
});

/**
 * PATCH /v1/actions/:id
 * Update an action (typically to mark as complete)
 */
actionsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const actionId = req.params.id;
    const actionService = getActionDomainService();
    
    // Validate request body
    const data = updateActionSchema.parse(req.body);
    
    const action = await actionService.getById(actionId);

    if (!action) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }

    if (!ensureResourceOwnerAccessOrReject(userId, action, res, {
      resourceName: 'action',
      message: 'You do not have access to this action',
      notFoundMessage: 'Action not found',
    })) {
      return;
    }
    
    // Prepare update data
    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (data.description !== undefined) {
      const description = sanitizePlainText(data.description, ACTION_DESCRIPTION_MAX_LENGTH);
      if (!description) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Description is required',
        });
        return;
      }
      updateData.description = description;
    }

    if (data.notes !== undefined) {
      updateData.notes = sanitizePlainText(data.notes, ACTION_NOTES_MAX_LENGTH);
    }

    if (data.dueAt !== undefined) {
      updateData.dueAt = data.dueAt
        ? admin.firestore.Timestamp.fromDate(new Date(data.dueAt))
        : null;
    }

    if (data.visitId !== undefined) {
      updateData.visitId = data.visitId || null;
      updateData.source = data.visitId ? 'visit' : 'manual';
    }
    
    if (data.calendarEvents !== undefined) {
      updateData.calendarEvents = data.calendarEvents ?? null;
    }
    
    // If marking as completed, set completedAt timestamp
    if (data.completed === true) {
      updateData.completed = true;
      updateData.completedAt =
        data.completedAt
          ? admin.firestore.Timestamp.fromDate(new Date(data.completedAt))
          : admin.firestore.Timestamp.now();
    }
    
    // If marking as incomplete, clear completedAt
    if (data.completed === false) {
      updateData.completed = false;
      updateData.completedAt = null;
    }
    
    const updatedAction = await actionService.updateRecord(actionId, updateData);
    if (!updatedAction) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }
    
    functions.logger.info(`[actions] Updated action ${actionId} for user ${userId}`);

    res.json(serializeActionForResponse(updatedAction));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }
    
    functions.logger.error('[actions] Error updating action:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update action',
    });
  }
});

/**
 * DELETE /v1/actions/:id
 * Delete an action
 */
actionsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const actionId = req.params.id;
    const actionService = getActionDomainService();

    const action = await actionService.getById(actionId);

    if (!action) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }

    if (!ensureResourceOwnerAccessOrReject(userId, action, res, {
      resourceName: 'action',
      message: 'You do not have access to this action',
      notFoundMessage: 'Action not found',
    })) {
      return;
    }

    // Soft delete action
    const now = admin.firestore.Timestamp.now();
    await actionService.softDeleteRecord(actionId, userId, now);

    functions.logger.info(`[actions] Soft-deleted action ${actionId} for user ${userId}`);
    
    res.status(204).send();
  } catch (error) {
    functions.logger.error('[actions] Error deleting action:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to delete action',
    });
  }
});

/**
 * POST /v1/actions/:id/restore
 * Restore a soft-deleted action
 */
actionsRouter.post('/:id/restore', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const actionId = req.params.id;
    const actionService = getActionDomainService();
    const isOperator = hasOperatorAccess(req.user);

    const payload = restoreActionSchema.safeParse(req.body ?? {});
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

    const action = await actionService.getById(actionId);
    if (!action) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }

    if (!ensureResourceOwnerAccessOrReject(userId, action, res, {
      resourceName: 'action',
      message: 'You do not have access to this action',
      notFoundMessage: 'Action not found',
      allowOperator: true,
      isOperator,
      allowDeleted: true,
    })) {
      return;
    }

    if (!ensureOperatorRestoreReasonOrReject({
      actorUserId: userId,
      ownerUserId: action.userId,
      isOperator,
      reason: restoreReason,
      res,
    })) {
      return;
    }

    if (!action.deletedAt) {
      res.status(409).json({
        code: 'not_deleted',
        message: 'Action is not deleted',
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    await actionService.restoreRecord(actionId, now);

    try {
      await recordRestoreAuditEvent({
        resourceType: 'action',
        resourceId: actionId,
        ownerUserId: action.userId,
        actorUserId: userId,
        actorIsOperator: isOperator,
        reason: restoreReason,
        metadata: {
          route: 'actions.restore',
        },
        createdAt: now,
      });
    } catch (auditError) {
      functions.logger.error('[actions] Failed to record restore audit event', {
        actionId,
        actorUserId: userId,
        ownerUserId: action.userId,
        message: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }

    functions.logger.info(`[actions] Restored action ${actionId} for user ${userId}`);

    res.json({
      success: true,
      id: actionId,
      restoredBy: userId,
      restoredFor: action.userId,
      reason: restoreReason ?? null,
      restoredAt: now.toDate().toISOString(),
    });
  } catch (error) {
    functions.logger.error('[actions] Error restoring action:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to restore action',
    });
  }
});
