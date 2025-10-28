import { Response, NextFunction } from 'express';
import { z } from 'zod';
import visitFolderService from '../services/visitFolderService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100, 'Folder name too long'),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').optional(),
  icon: z.string().max(50).optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').optional(),
  icon: z.string().max(50).optional(),
});

const addTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).min(1, 'At least one tag required'),
});

const moveVisitSchema = z.object({
  folderId: z.string().uuid('Invalid folder ID').nullable(),
});

class VisitFolderController {
  /**
   * Create a new folder
   * POST /api/folders
   */
  createFolder = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const input = createFolderSchema.parse(req.body);
      const folder = await visitFolderService.createFolder(req.userId, input);

      const response: SuccessResponse = {
        success: true,
        data: folder,
        message: 'Folder created successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * List all folders
   * GET /api/folders
   */
  listFolders = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const folders = await visitFolderService.listFolders(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: folders,
      };

      res.json(response);
    }
  );

  /**
   * Get folder by ID
   * GET /api/folders/:id
   */
  getFolderById = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const folder = await visitFolderService.getFolderById(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: folder,
      };

      res.json(response);
    }
  );

  /**
   * Update folder
   * PUT /api/folders/:id
   */
  updateFolder = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const input = updateFolderSchema.parse(req.body);
      const folder = await visitFolderService.updateFolder(id, req.userId, input);

      const response: SuccessResponse = {
        success: true,
        data: folder,
        message: 'Folder updated successfully',
      };

      res.json(response);
    }
  );

  /**
   * Delete folder
   * DELETE /api/folders/:id
   */
  deleteFolder = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await visitFolderService.deleteFolder(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        message: 'Folder deleted successfully',
      };

      res.json(response);
    }
  );

  /**
   * Move visit to folder
   * PUT /api/visits/:id/folder
   */
  moveVisitToFolder = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const { folderId } = moveVisitSchema.parse(req.body);
      const visit = await visitFolderService.moveVisitToFolder(id, folderId, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: visit,
        message: folderId ? 'Visit moved to folder' : 'Visit removed from folder',
      };

      res.json(response);
    }
  );

  /**
   * Add tags to visit
   * POST /api/visits/:id/tags
   */
  addTagsToVisit = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const { tags } = addTagsSchema.parse(req.body);
      const visit = await visitFolderService.addTagsToVisit(id, req.userId, tags);

      const response: SuccessResponse = {
        success: true,
        data: visit,
        message: 'Tags added successfully',
      };

      res.json(response);
    }
  );

  /**
   * Remove tag from visit
   * DELETE /api/visits/:id/tags/:tag
   */
  removeTagFromVisit = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id, tag } = req.params;
      const visit = await visitFolderService.removeTagFromVisit(id, req.userId, tag);

      const response: SuccessResponse = {
        success: true,
        data: visit,
        message: 'Tag removed successfully',
      };

      res.json(response);
    }
  );

  /**
   * Get all user tags
   * GET /api/tags
   */
  getUserTags = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const tags = await visitFolderService.getUserTags(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: tags,
      };

      res.json(response);
    }
  );
}

export default new VisitFolderController();
