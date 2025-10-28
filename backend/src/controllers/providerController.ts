import { Response, NextFunction } from 'express';
import providerService from '../services/providerService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

/**
 * Provider controller
 */
class ProviderController {
  /**
   * Create new provider
   * POST /api/providers
   */
  create = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const provider = await providerService.createProvider(req.userId, req.body);

      const response: SuccessResponse = {
        success: true,
        data: provider,
        message: 'Provider created successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Get provider by ID
   * GET /api/providers/:id
   */
  getById = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      const provider = await providerService.getProviderById(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: provider,
      };

      res.status(200).json(response);
    }
  );

  /**
   * List all providers or search
   * GET /api/providers?search=query
   */
  list = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const searchQuery = req.query.search as string;

      const providers = searchQuery
        ? await providerService.searchProviders(req.userId, searchQuery)
        : await providerService.listProviders(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: providers,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Update provider
   * PUT /api/providers/:id
   */
  update = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      const provider = await providerService.updateProvider(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: provider,
        message: 'Provider updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete provider
   * DELETE /api/providers/:id
   */
  delete = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      await providerService.deleteProvider(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Provider deleted successfully',
      };

      res.status(200).json(response);
    }
  );
}

export default new ProviderController();
