import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, CreateAuditLogDTO } from '../types';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Audit logging middleware for HIPAA compliance
 * Logs all access to protected health information (PHI)
 */

/**
 * Create audit log entry
 */
export const createAuditLog = async (logData: CreateAuditLogDTO) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: logData.userId,
        action: logData.action,
        resource: logData.resource,
        resourceId: logData.resourceId,
        ipAddress: logData.ipAddress,
        userAgent: logData.userAgent,
        details: logData.details,
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log:', error);
  }
};

/**
 * Middleware to log all PHI access
 */
export const auditLogger = (resource: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    // Store original response methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Track if response was sent
    let responseSent = false;

    // Override res.json
    res.json = function (body: any) {
      if (!responseSent) {
        responseSent = true;
        logAccess(req, resource, 'json');
      }
      return originalJson(body);
    };

    // Override res.send
    res.send = function (body: any) {
      if (!responseSent) {
        responseSent = true;
        logAccess(req, resource, 'send');
      }
      return originalSend(body);
    };

    next();
  };
};

/**
 * Helper function to log access
 */
const logAccess = async (
  req: AuthenticatedRequest,
  resource: string,
  responseMethod: string
) => {
  const action = getActionFromMethod(req.method);
  const resourceId = req.params.id || req.params.visitId || undefined;

  await createAuditLog({
    userId: req.userId,
    action,
    resource,
    resourceId,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    details: {
      method: req.method,
      path: req.path,
      query: req.query,
      responseMethod,
    },
  });
};

/**
 * Map HTTP method to CRUD action
 */
const getActionFromMethod = (
  method: string
): 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' => {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'CREATE';
    case 'GET':
      return 'READ';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'READ';
  }
};

/**
 * Log specific action manually
 */
export const logAction = async (
  userId: string | undefined,
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE',
  resource: string,
  resourceId?: string,
  details?: any
) => {
  await createAuditLog({
    userId,
    action,
    resource,
    resourceId,
    details,
  });
};
