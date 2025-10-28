import { Response, NextFunction } from 'express';
import trustedAccessService from '../services/trustedAccessService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

/**
 * Trusted Access controller
 * Handles sharing healthcare information with family/caregivers
 */
class TrustedAccessController {
  /**
   * List users I've granted access to
   * GET /api/trusted-access/granted
   */
  listTrustedUsers = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const trustedUsers = await trustedAccessService.listTrustedUsers(
        req.userId
      );

      const response: SuccessResponse = {
        success: true,
        data: trustedUsers,
      };

      res.status(200).json(response);
    }
  );

  /**
   * List users who have granted me access
   * GET /api/trusted-access/received
   */
  listGrantingUsers = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const grantingUsers = await trustedAccessService.listGrantingUsers(
        req.userId
      );

      const response: SuccessResponse = {
        success: true,
        data: grantingUsers,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Invite/grant trusted access to another user
   * POST /api/trusted-access/invite
   */
  inviteTrustedUser = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const trustedAccess = await trustedAccessService.inviteTrustedUser(
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: trustedAccess,
        message: 'Trusted access granted successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Update trusted access level
   * PUT /api/trusted-access/:id
   */
  updateTrustedAccess = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const trustedAccess = await trustedAccessService.updateTrustedAccess(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: trustedAccess,
        message: 'Trusted access updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Revoke trusted access
   * DELETE /api/trusted-access/:id
   */
  revokeTrustedAccess = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await trustedAccessService.revokeTrustedAccess(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Trusted access revoked successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get all visits shared with me
   * GET /api/trusted-access/shared-visits
   */
  getSharedVisits = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const sharedVisits = await trustedAccessService.getSharedVisits(
        req.userId
      );

      const response: SuccessResponse = {
        success: true,
        data: sharedVisits,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Check if I have access to another user's data
   * GET /api/trusted-access/check/:targetUserId
   */
  checkAccess = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { targetUserId } = req.params;
      const accessInfo = await trustedAccessService.checkAccess(
        req.userId,
        targetUserId
      );

      const response: SuccessResponse = {
        success: true,
        data: accessInfo,
      };

      res.status(200).json(response);
    }
  );
}

export default new TrustedAccessController();
