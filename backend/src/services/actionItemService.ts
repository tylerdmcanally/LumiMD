import { PrismaClient } from '@prisma/client';
import { CreateActionItemDTO, UpdateActionItemDTO } from '../types';
import { NotFoundError } from '../utils/errors';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Action Item service
 * Handles action items and reminders
 */
class ActionItemService {
  /**
   * List all action items for user
   */
  async listActionItems(
    userId: string,
    filters?: {
      completed?: boolean;
      upcoming?: boolean;
      overdue?: boolean;
    }
  ) {
    try {
      const where: any = {
        userId,
      };

      // Apply filters
      if (filters?.completed !== undefined) {
        where.completed = filters.completed;
      }

      if (filters?.upcoming) {
        where.dueDate = {
          gte: new Date(),
        };
        where.completed = false;
      }

      if (filters?.overdue) {
        where.dueDate = {
          lt: new Date(),
        };
        where.completed = false;
      }

      const actionItems = await prisma.actionItem.findMany({
        where,
        include: {
          visit: {
            include: {
              provider: true,
            },
          },
          reminder: true,
        },
        orderBy: [
          { completed: 'asc' },
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      return actionItems;
    } catch (error) {
      logger.error('Failed to list action items', { error, userId });
      throw error;
    }
  }

  /**
   * Get action item by ID
   */
  async getActionItemById(actionItemId: string, userId: string) {
    try {
      const actionItem = await prisma.actionItem.findFirst({
        where: {
          id: actionItemId,
          userId,
        },
        include: {
          visit: {
            include: {
              provider: true,
            },
          },
          reminder: true,
        },
      });

      if (!actionItem) {
        throw new NotFoundError('Action item not found');
      }

      return actionItem;
    } catch (error) {
      logger.error('Failed to get action item', { error, actionItemId, userId });
      throw error;
    }
  }

  /**
   * Create action item manually
   */
  async createActionItem(userId: string, data: CreateActionItemDTO) {
    try {
      // If visitId is provided, verify visit belongs to user
      if (data.visitId) {
        const visit = await prisma.visit.findFirst({
          where: {
            id: data.visitId,
            userId,
          },
        });

        if (!visit) {
          throw new NotFoundError('Visit not found');
        }
      }

      const actionItem = await prisma.actionItem.create({
        data: {
          userId,
          visitId: data.visitId || null,
          type: data.type as any,
          description: data.description,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
        include: {
          visit: {
            include: {
              provider: true,
            },
          },
          reminder: true,
        },
      });

      logger.info('Action item created', { actionItemId: actionItem.id, userId });

      return actionItem;
    } catch (error) {
      logger.error('Failed to create action item', { error, userId });
      throw error;
    }
  }

  /**
   * Update action item
   */
  async updateActionItem(
    actionItemId: string,
    userId: string,
    data: UpdateActionItemDTO
  ) {
    try {
      // Verify ownership
      const actionItem = await prisma.actionItem.findFirst({
        where: {
          id: actionItemId,
          userId,
        },
      });

      if (!actionItem) {
        throw new NotFoundError('Action item not found');
      }

      const updated = await prisma.actionItem.update({
        where: { id: actionItemId },
        data: {
          ...(data.description && { description: data.description }),
          ...(data.dueDate !== undefined && {
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
          }),
          ...(data.completed !== undefined && { completed: data.completed }),
          ...(data.completed && { completedAt: new Date() }),
        },
        include: {
          visit: {
            include: {
              provider: true,
            },
          },
          reminder: true,
        },
      });

      logger.info('Action item updated', { actionItemId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to update action item', {
        error,
        actionItemId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark action item as complete
   */
  async completeActionItem(actionItemId: string, userId: string) {
    try {
      // Verify ownership
      const actionItem = await prisma.actionItem.findFirst({
        where: {
          id: actionItemId,
          userId,
        },
      });

      if (!actionItem) {
        throw new NotFoundError('Action item not found');
      }

      const updated = await prisma.actionItem.update({
        where: { id: actionItemId },
        data: {
          completed: true,
          completedAt: new Date(),
        },
        include: {
          visit: {
            include: {
              provider: true,
            },
          },
          reminder: true,
        },
      });

      logger.info('Action item marked as complete', { actionItemId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to complete action item', {
        error,
        actionItemId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete action item
   */
  async deleteActionItem(actionItemId: string, userId: string) {
    try {
      // Verify ownership
      const actionItem = await prisma.actionItem.findFirst({
        where: {
          id: actionItemId,
          userId,
        },
      });

      if (!actionItem) {
        throw new NotFoundError('Action item not found');
      }

      await prisma.actionItem.delete({
        where: { id: actionItemId },
      });

      logger.info('Action item deleted', { actionItemId, userId });
    } catch (error) {
      logger.error('Failed to delete action item', {
        error,
        actionItemId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get action item statistics
   */
  async getStatistics(userId: string) {
    try {
      const [total, completed, pending, overdue, upcoming] = await Promise.all([
        prisma.actionItem.count({
          where: { userId },
        }),
        prisma.actionItem.count({
          where: { userId, completed: true },
        }),
        prisma.actionItem.count({
          where: { userId, completed: false },
        }),
        prisma.actionItem.count({
          where: {
            userId,
            completed: false,
            dueDate: { lt: new Date() },
          },
        }),
        prisma.actionItem.count({
          where: {
            userId,
            completed: false,
            dueDate: { gte: new Date() },
          },
        }),
      ]);

      return {
        total,
        completed,
        pending,
        overdue,
        upcoming,
      };
    } catch (error) {
      logger.error('Failed to get action item statistics', { error, userId });
      throw error;
    }
  }
}

export default new ActionItemService();
