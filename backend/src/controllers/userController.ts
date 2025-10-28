import { Response, NextFunction } from 'express';
import userService from '../services/userService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

/**
 * User controller
 */
class UserController {
  /**
   * Get current user profile
   * GET /api/users/profile
   */
  getProfile = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const user = await userService.getUserProfile(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: user,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Update user profile
   * PUT /api/users/profile
   */
  updateProfile = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const user = await userService.updateUserProfile(req.userId, req.body);

      const response: SuccessResponse = {
        success: true,
        data: user,
        message: 'Profile updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Upload profile photo
   * POST /api/users/upload-photo
   */
  uploadPhoto = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const file = req.file;

      if (!file) {
        throw new ValidationError('Photo file is required');
      }

      const result = await userService.uploadProfilePhoto(req.userId, file);

      const response: SuccessResponse = {
        success: true,
        data: result,
        message: 'Profile photo uploaded successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete user account
   * DELETE /api/users/account
   */
  deleteAccount = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      await userService.deleteUserAccount(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Account deleted successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get user statistics
   * GET /api/users/statistics
   */
  getStatistics = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const statistics = await userService.getUserStatistics(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: statistics,
      };

      res.status(200).json(response);
    }
  );
}

export default new UserController();
