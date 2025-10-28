import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadImage } from '../middleware/upload';
import userController from '../controllers/userController';
import { validate, updateProfileSchema } from '../middleware/validate';

const router = Router();

/**
 * User profile routes
 * All routes require authentication
 */

// GET /api/users/profile - Get current user profile
router.get(
  '/profile',
  authenticate,
  userController.getProfile
);

// GET /api/users/statistics - Get user statistics
router.get(
  '/statistics',
  authenticate,
  userController.getStatistics
);

// PUT /api/users/profile - Update user profile
router.put(
  '/profile',
  authenticate,
  validate(updateProfileSchema),
  userController.updateProfile
);

// POST /api/users/upload-photo - Upload profile photo
router.post(
  '/upload-photo',
  authenticate,
  uploadImage.single('photo'),
  userController.uploadPhoto
);

// DELETE /api/users/account - Delete user account
router.delete(
  '/account',
  authenticate,
  userController.deleteAccount
);

export default router;
