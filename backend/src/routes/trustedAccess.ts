import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import trustedAccessController from '../controllers/trustedAccessController';
import {
  validate,
  createTrustedAccessSchema,
  updateTrustedAccessSchema,
} from '../middleware/validate';

const router = Router();

/**
 * Trusted access routes
 * All routes require authentication
 */

// GET /api/trusted-access/granted - List users I've granted access to
router.get('/granted', authenticate, trustedAccessController.listTrustedUsers);

// GET /api/trusted-access/received - List users who granted me access
router.get('/received', authenticate, trustedAccessController.listGrantingUsers);

// GET /api/trusted-access/shared-visits - Get all visits shared with me
router.get('/shared-visits', authenticate, trustedAccessController.getSharedVisits);

// GET /api/trusted-access/check/:targetUserId - Check if I have access to a user
router.get('/check/:targetUserId', authenticate, trustedAccessController.checkAccess);

// POST /api/trusted-access/invite - Invite trusted user
router.post(
  '/invite',
  authenticate,
  validate(createTrustedAccessSchema),
  trustedAccessController.inviteTrustedUser
);

// PUT /api/trusted-access/:id - Update access level
router.put(
  '/:id',
  authenticate,
  validate(updateTrustedAccessSchema),
  trustedAccessController.updateTrustedAccess
);

// DELETE /api/trusted-access/:id - Revoke access
router.delete('/:id', authenticate, trustedAccessController.revokeTrustedAccess);

export default router;
