import { Request, Response, NextFunction } from 'express';
import { AppError, formatErrorResponse } from '../utils/errors';
import logger from '../utils/logger';
import config from '../config';

/**
 * Global error handling middleware
 * Catches all errors and returns consistent error responses
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error:', {
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error('Unexpected error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Handle operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(formatErrorResponse(err));
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;

    // Unique constraint violation
    if (prismaError.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: {
          message: 'A record with this information already exists',
          statusCode: 409,
        },
      });
    }

    // Record not found
    if (prismaError.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Record not found',
          statusCode: 404,
        },
      });
    }
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        message: err.message,
        statusCode: 400,
      },
    });
  }

  // Handle multer errors (file upload)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: {
        message: `File upload error: ${err.message}`,
        statusCode: 400,
      },
    });
  }

  // Default to 500 internal server error
  const statusCode = 500;
  const message =
    config.env === 'production'
      ? 'An unexpected error occurred'
      : err.message || 'Internal server error';

  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...(config.env !== 'production' && { stack: err.stack }),
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    },
  });
};

/**
 * Async route handler wrapper
 * Catches errors from async route handlers and passes to error middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
