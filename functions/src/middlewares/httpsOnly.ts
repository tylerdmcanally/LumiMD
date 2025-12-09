import { Request, Response, NextFunction } from 'express';

export function requireHttps(req: Request, res: Response, next: NextFunction) {
  // Firebase Functions automatically sets x-forwarded-proto
  // In local development (emulator), this might not be set or might be 'http', so we check NODE_ENV
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    res.status(403).json({
      code: 'https_required',
      message: 'HTTPS is required',
    });
    return;
  }
  next();
}

