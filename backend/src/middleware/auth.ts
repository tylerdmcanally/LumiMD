import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AuthenticatedRequest, JWTPayload } from '../types';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import logger from '../utils/logger';

/**
 * Authentication middleware - Verify JWT token
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    // Check if it's an access token
    if (decoded.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    // Attach user info to request
    req.userId = decoded.userId;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      firstName: '', // Will be populated from DB if needed
      lastName: '',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token', { error: error.message });
      return next(new AuthenticationError('Invalid token'));
    }

    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired JWT token');
      return next(new AuthenticationError('Token expired'));
    }

    next(error);
  }
};

/**
 * Optional authentication - Don't fail if no token, but verify if present
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

      if (decoded.type === 'access') {
        req.userId = decoded.userId;
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          firstName: '',
          lastName: '',
        };
      }
    }

    next();
  } catch (error) {
    // Don't fail - just continue without user
    next();
  }
};

/**
 * Generate access token
 */
export const generateAccessToken = (userId: string, email: string): string => {
  const payload: JWTPayload = {
    userId,
    email,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (userId: string, email: string): string => {
  const payload: JWTPayload = {
    userId,
    email,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;

    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Refresh token expired');
    }

    throw error;
  }
};

/**
 * Check if user has access to a resource
 */
export const checkResourceAccess = (
  resourceUserId: string,
  requestUserId: string
) => {
  if (resourceUserId !== requestUserId) {
    throw new AuthorizationError(
      'You do not have permission to access this resource'
    );
  }
};
