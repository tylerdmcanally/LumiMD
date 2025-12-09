import { Request, Response, NextFunction } from 'express';
import * as functions from 'firebase-functions';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  functions.logger.error('Unhandled error:', err);

  // If headers have already been sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  if (process.env.NODE_ENV === 'production') {
    // In production, don't leak stack traces
    res.status(500).json({
      code: 'server_error',
      message: 'An unexpected error occurred',
    });
  } else {
    // In development/staging, show details for debugging
    res.status(500).json({
      code: 'server_error',
      message: err.message,
      stack: err.stack,
    });
  }
}

