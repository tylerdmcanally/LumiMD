import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

type OperatorAccessResponse = {
  status: (statusCode: number) => {
    json: (payload: { code: string; message: string }) => void;
  };
};

const getOperatorUidAllowlist = (): Set<string> =>
  new Set(
    (process.env.OPERATOR_UIDS ?? '')
      .split(',')
      .map((rawUid) => rawUid.trim())
      .filter((rawUid) => rawUid.length > 0),
  );

const claimFlagIsTrue = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1;

export const hasOperatorAccess = (
  user?: admin.auth.DecodedIdToken,
): boolean => {
  if (!user) {
    return false;
  }

  const claims = user as Record<string, unknown>;
  const claimRoles = Array.isArray(claims.roles)
    ? claims.roles
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.trim().toLowerCase())
    : [];

  if (
    claimFlagIsTrue(claims.operator) ||
    claimFlagIsTrue(claims.admin) ||
    claimFlagIsTrue(claims.support) ||
    claimRoles.includes('operator') ||
    claimRoles.includes('admin') ||
    claimRoles.includes('support')
  ) {
    return true;
  }

  const allowlist = getOperatorUidAllowlist();
  return allowlist.has(user.uid);
};

export function ensureOperatorAccessOrReject(
  user: admin.auth.DecodedIdToken | undefined,
  res: OperatorAccessResponse,
  message = 'Operator access required',
): boolean {
  if (hasOperatorAccess(user)) {
    return true;
  }

  res.status(403).json({
    code: 'forbidden',
    message,
  });
  return false;
}

type OperatorRestoreReasonOptions = {
  actorUserId: string;
  ownerUserId: string | null | undefined;
  isOperator: boolean;
  reason: string | undefined;
  res: OperatorAccessResponse;
  message?: string;
};

export function ensureOperatorRestoreReasonOrReject({
  actorUserId,
  ownerUserId,
  isOperator,
  reason,
  res,
  message = 'Restore reason is required for operator-initiated restores',
}: OperatorRestoreReasonOptions): boolean {
  if (!isOperator) {
    return true;
  }

  if (ownerUserId === actorUserId) {
    return true;
  }

  if (typeof reason === 'string' && reason.trim().length > 0) {
    return true;
  }

  res.status(400).json({
    code: 'reason_required',
    message,
  });
  return false;
}

export function requireOperator(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!hasOperatorAccess(req.user)) {
    res.status(403).json({
      code: 'forbidden',
      message: 'Operator access required',
    });
    return;
  }
  next();
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

    // Verify the ID token and check if it has been revoked
    // checkRevoked: true ensures revoked tokens are rejected (critical for HIPAA compliance)
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
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
