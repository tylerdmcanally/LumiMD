import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

/**
 * Middleware to verify Firebase ID token
 */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        code: 'unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    
    next();
  } catch (error) {
    functions.logger.error('Auth middleware error:', error);
    res.status(401).json({
      code: 'unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

