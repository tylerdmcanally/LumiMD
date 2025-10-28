import { Router } from 'express';
import authController from '../controllers/authController';
import { validate, registerSchema, loginSchema, refreshTokenSchema } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/security';

const router = Router();

/**
 * Authentication routes
 */

// POST /api/auth/register - Register new user
router.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  authController.register
);

// POST /api/auth/login - Login user
router.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  authController.login
);

// POST /api/auth/refresh - Refresh access token
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  authController.refresh
);

// POST /api/auth/logout - Logout user
router.post(
  '/logout',
  authenticate,
  authController.logout
);

// POST /api/auth/forgot-password - Request password reset
router.post(
  '/forgot-password',
  authRateLimiter,
  authController.forgotPassword
);

// POST /api/auth/verify-otp - Verify OTP
router.post(
  '/verify-otp',
  authRateLimiter,
  authController.verifyOTP
);

export default router;
