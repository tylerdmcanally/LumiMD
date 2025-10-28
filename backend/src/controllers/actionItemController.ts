import { Response, NextFunction } from 'express';
import actionItemService from '../services/actionItemService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

/**
 * Action Item controller
 */
class ActionItemController {
  /**
   * List all action items
   * GET /api/action-items?completed=false&upcoming=true
   */
  list = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const filters = {
        completed: req.query.completed === 'true' ? true : req.query.completed === 'false' ? false : undefined,
        upcoming: req.query.upcoming === 'true',
        overdue: req.query.overdue === 'true',
      };

      const actionItems = await actionItemService.listActionItems(
        req.userId,
        filters
      );

      const response: SuccessResponse = {
        success: true,
        data: actionItems,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get action item by ID
   * GET /api/action-items/:id
   */
  getById = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const actionItem = await actionItemService.getActionItemById(
        id,
        req.userId
      );

      const response: SuccessResponse = {
        success: true,
        data: actionItem,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Create action item
   * POST /api/action-items
   */
  create = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const actionItem = await actionItemService.createActionItem(
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: actionItem,
        message: 'Action item created successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Update action item
   * PUT /api/action-items/:id
   */
  update = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const actionItem = await actionItemService.updateActionItem(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: actionItem,
        message: 'Action item updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Mark action item as complete
   * POST /api/action-items/:id/complete
   */
  complete = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const actionItem = await actionItemService.completeActionItem(
        id,
        req.userId
      );

      const response: SuccessResponse = {
        success: true,
        data: actionItem,
        message: 'Action item marked as complete',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete action item
   * DELETE /api/action-items/:id
   */
  delete = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await actionItemService.deleteActionItem(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Action item deleted successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get action item statistics
   * GET /api/action-items/statistics
   */
  getStatistics = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const statistics = await actionItemService.getStatistics(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: statistics,
      };

      res.status(200).json(response);
    }
  );
}

export default new ActionItemController();
