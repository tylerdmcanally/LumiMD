import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadAudio } from '../middleware/upload';
import { uploadRateLimiter } from '../middleware/security';
import { auditLogger } from '../middleware/auditLog';
import visitController from '../controllers/visitController';
import visitFolderController from '../controllers/visitFolderController';
import { validate, createVisitSchema } from '../middleware/validate';

const router = Router();

/**
 * Visit management routes
 * All routes require authentication
 */

router.post(
  '/',
  authenticate,
  uploadRateLimiter,
  uploadAudio.single('audio'),
  auditLogger('Visit'),
  visitController.submit
);

// GET /api/visits - List all visits
router.get(
  '/',
  authenticate,
  auditLogger('Visit'),
  visitController.list
);

// POST /api/visits/start - Start new visit recording
router.post(
  '/start',
  authenticate,
  validate(createVisitSchema),
  visitController.start
);

// POST /api/visits/:id/upload - Upload audio file
router.post(
  '/:id/upload',
  authenticate,
  uploadRateLimiter,
  uploadAudio.single('audio'),
  auditLogger('Visit'),
  visitController.uploadAudio
);

// GET /api/visits/:id/summary - Get visit summary (BEFORE /:id to avoid conflict)
router.get(
  '/:id/summary',
  authenticate,
  auditLogger('Visit'),
  visitController.getSummary
);

// GET /api/visits/:id/transcript - Get full transcript
router.get(
  '/:id/transcript',
  authenticate,
  auditLogger('Visit'),
  visitController.getTranscript
);

// GET /api/visits/:id - Get visit details
router.get(
  '/:id',
  authenticate,
  auditLogger('Visit'),
  visitController.getById
);

// PUT /api/visits/:id - Update visit
router.put(
  '/:id',
  authenticate,
  visitController.update
);

// DELETE /api/visits/:id - Delete visit
router.delete(
  '/:id',
  authenticate,
  visitController.delete
);

// POST /api/visits/:id/share - Share visit
router.post(
  '/:id/share',
  authenticate,
  visitController.share
);

// PUT /api/visits/:id/folder - Move visit to folder
router.put(
  '/:id/folder',
  authenticate,
  visitFolderController.moveVisitToFolder
);

// POST /api/visits/:id/tags - Add tags to visit
router.post(
  '/:id/tags',
  authenticate,
  visitFolderController.addTagsToVisit
);

// DELETE /api/visits/:id/tags/:tag - Remove tag from visit
router.delete(
  '/:id/tags/:tag',
  authenticate,
  visitFolderController.removeTagFromVisit
);

export default router;
