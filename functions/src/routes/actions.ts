import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';

export const actionsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();

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
  description: z.string().min(1),
  notes: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  visitId: z.string().nullable().optional(),
  calendarEvents: calendarEventsSchema,
});

const updateActionSchema = z.object({
  description: z.string().min(1).optional(),
  notes: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  visitId: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  completedAt: z.string().optional(),
  calendarEvents: calendarEventsSchema,
});

/**
 * GET /v1/actions
 * List all action items for the authenticated user
 */
actionsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    
    // Query actions collection for this user
    const actionsSnapshot = await getDb()
      .collection('actions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    const actions = actionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore timestamps to ISO strings
      createdAt: doc.data().createdAt?.toDate().toISOString(),
      updatedAt: doc.data().updatedAt?.toDate().toISOString(),
      completedAt: doc.data().completedAt?.toDate()?.toISOString() || null,
      dueAt: doc.data().dueAt?.toDate?.().toISOString() || null,
    }));
    
    functions.logger.info(`[actions] Listed ${actions.length} actions for user ${userId}`);
    res.json(actions);
  } catch (error) {
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
    
    const actionDoc = await getDb().collection('actions').doc(actionId).get();
    
    if (!actionDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }
    
    const action = actionDoc.data()!;
    
    // Verify ownership
    if (action.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this action',
      });
      return;
    }
    
    res.json({
      id: actionDoc.id,
      ...action,
      createdAt: action.createdAt?.toDate().toISOString(),
      updatedAt: action.updatedAt?.toDate().toISOString(),
      completedAt: action.completedAt?.toDate()?.toISOString() || null,
      dueAt: action.dueAt?.toDate?.().toISOString() || null,
    });
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

    const data = createActionSchema.parse(req.body);
    const now = admin.firestore.Timestamp.now();

    const dueAtTimestamp = data.dueAt
      ? admin.firestore.Timestamp.fromDate(new Date(data.dueAt))
      : null;

    const payload: FirebaseFirestore.DocumentData = {
      userId,
      description: data.description.trim(),
      notes: data.notes?.trim() || '',
      completed: false,
      source: data.visitId ? 'visit' : 'manual',
      visitId: data.visitId || null,
      dueAt: dueAtTimestamp,
      calendarEvents: data.calendarEvents || null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    const actionRef = await getDb().collection('actions').add(payload);
    const actionDoc = await actionRef.get();
    const action = actionDoc.data()!;

    res.status(201).json({
      id: actionRef.id,
      ...action,
      createdAt: action.createdAt?.toDate().toISOString(),
      updatedAt: action.updatedAt?.toDate().toISOString(),
      completedAt: action.completedAt?.toDate()?.toISOString() || null,
      dueAt: action.dueAt?.toDate?.().toISOString() || null,
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
    
    // Validate request body
    const data = updateActionSchema.parse(req.body);
    
    const actionRef = getDb().collection('actions').doc(actionId);
    const actionDoc = await actionRef.get();
    
    if (!actionDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }
    
    const action = actionDoc.data()!;
    
    // Verify ownership
    if (action.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this action',
      });
      return;
    }
    
    // Prepare update data
    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (data.description !== undefined) {
      updateData.description = data.description.trim();
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes.trim();
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
    
    // Update action
    await actionRef.update(updateData);
    
    const updatedDoc = await actionRef.get();
    const updatedAction = updatedDoc.data()!;
    
    functions.logger.info(`[actions] Updated action ${actionId} for user ${userId}`);
    
    res.json({
      id: actionId,
      ...updatedAction,
      createdAt: updatedAction.createdAt.toDate().toISOString(),
      updatedAt: updatedAction.updatedAt.toDate().toISOString(),
      completedAt: updatedAction.completedAt?.toDate()?.toISOString() || null,
      dueAt: updatedAction.dueAt?.toDate?.().toISOString() || null,
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
    
    const actionRef = getDb().collection('actions').doc(actionId);
    const actionDoc = await actionRef.get();
    
    if (!actionDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Action not found',
      });
      return;
    }
    
    const action = actionDoc.data()!;
    
    // Verify ownership
    if (action.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this action',
      });
      return;
    }
    
    // Delete action
    await actionRef.delete();
    
    functions.logger.info(`[actions] Deleted action ${actionId} for user ${userId}`);
    
    res.status(204).send();
  } catch (error) {
    functions.logger.error('[actions] Error deleting action:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to delete action',
    });
  }
});

