import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import actionItemController from '../controllers/actionItemController';
import { validate, createActionItemSchema, updateActionItemSchema } from '../middleware/validate';

const router = Router();

/**
 * Action items and reminders routes
 * All routes require authentication
 */

// GET /api/action-items/statistics - Get statistics (BEFORE /:id)
router.get(
  '/statistics',
  authenticate,
  actionItemController.getStatistics
);

// GET /api/action-items - List all action items
router.get(
  '/',
  authenticate,
  actionItemController.list
);

// POST /api/action-items - Create action item
router.post(
  '/',
  authenticate,
  validate(createActionItemSchema),
  actionItemController.create
);

// POST /api/action-items/:id/complete - Mark as complete (BEFORE /:id)
router.post(
  '/:id/complete',
  authenticate,
  actionItemController.complete
);

// GET /api/action-items/:id - Get action item
router.get(
  '/:id',
  authenticate,
  actionItemController.getById
);

// PUT /api/action-items/:id - Update action item
router.put(
  '/:id',
  authenticate,
  validate(updateActionItemSchema),
  actionItemController.update
);

// DELETE /api/action-items/:id - Delete action item
router.delete(
  '/:id',
  authenticate,
  actionItemController.delete
);

export default router;
