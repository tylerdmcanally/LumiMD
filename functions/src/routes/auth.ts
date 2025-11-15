import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rateLimit';
import { randomBytes } from 'crypto';

export const authRouter = Router();

// Apply auth rate limiting to all routes
authRouter.use(authLimiter);

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();

// Validation schemas
const exchangeHandoffSchema = z.object({
  code: z.string().min(1),
});

// TTL: 5 minutes in milliseconds
const HANDOFF_TTL_MS = 5 * 60 * 1000;

/**
 * POST /v1/auth/create-handoff
 * Creates a one-time code for mobile → web authentication
 */
authRouter.post('/create-handoff', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    
    // Generate secure random code (32 bytes = 256 bits)
    const code = randomBytes(32).toString('base64url');
    
    // Calculate expiration timestamp
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + HANDOFF_TTL_MS
    );
    
    // Store in Firestore
    await getDb().collection('auth_handoffs').doc(code).set({
      userId,
      createdAt: now,
      expiresAt, // Firestore TTL will use this field
      used: false,
    });
    
    functions.logger.info(`[auth] Created handoff code for user ${userId}`);
    
    res.json({ code });
  } catch (error) {
    functions.logger.error('[auth] Error creating handoff:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to create authentication handoff',
    });
  }
});

/**
 * POST /v1/auth/exchange-handoff
 * Exchanges a one-time code for a Firebase custom token
 */
authRouter.post('/exchange-handoff', async (req, res): Promise<void> => {
  try {
    // Validate request body
    const { code } = exchangeHandoffSchema.parse(req.body);
    
    // Get handoff document
    const handoffRef = getDb().collection('auth_handoffs').doc(code);
    const handoffDoc = await handoffRef.get();
    
    if (!handoffDoc.exists) {
      res.status(401).json({
        code: 'unauthorized',
        message: 'Invalid or expired code',
      });
      return;
    }
    
    const handoff = handoffDoc.data()!;
    
    // Check if already used
    if (handoff.used) {
      res.status(401).json({
        code: 'unauthorized',
        message: 'Code has already been used',
      });
      return;
    }
    
    // Check if expired
    const now = Date.now();
    const expiresAt = handoff.expiresAt.toMillis();
    
    if (now > expiresAt) {
      // Clean up expired code
      await handoffRef.delete();
      res.status(401).json({
        code: 'unauthorized',
        message: 'Code has expired',
      });
      return;
    }
    
    // Mark as used (prevent replay attacks)
    await handoffRef.update({ used: true });
    
    // Create Firebase custom token
    const customToken = await admin.auth().createCustomToken(handoff.userId);
    
    functions.logger.info(`[auth] Exchanged handoff code for user ${handoff.userId}`);
    
    res.json({ token: customToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }
    
    functions.logger.error('[auth] Error exchanging handoff:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to exchange authentication handoff',
    });
  }
});

