import { Request, Response, NextFunction } from 'express';
import authService from '../services/authService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Authentication controller
 */
class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  register = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, password, firstName, lastName, dateOfBirth, phone, invitationPin } =
        req.body;

      const result = await authService.register({
        email,
        password,
        firstName,
        lastName,
        dateOfBirth,
        phone,
        invitationPin,
      });

      const response: SuccessResponse = {
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
        message: 'User registered successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Login user
   * POST /api/auth/login
   */
  login = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, password } = req.body;

      const result = await authService.login(email, password);

      const response: SuccessResponse = {
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
        message: 'Login successful',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refresh = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { refreshToken } = req.body;

      const result = await authService.refreshAccessToken(refreshToken);

      const response: SuccessResponse = {
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
        message: 'Token refreshed successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (req.userId) {
        await authService.logout(req.userId);
      }

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Logout successful',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email } = req.body;

      await authService.requestPasswordReset(email);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'If the email exists, a password reset link has been sent',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Verify OTP
   * POST /api/auth/verify-otp
   */
  verifyOTP = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { identifier, otp } = req.body;

      const isValid = await authService.verifyOTP(identifier, otp);

      const response: SuccessResponse = {
        success: true,
        data: { verified: isValid },
        message: isValid ? 'OTP verified successfully' : 'Invalid OTP',
      };

      res.status(200).json(response);
    }
  );
}

export default new AuthController();
