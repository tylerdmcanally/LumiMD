import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import providerController from '../controllers/providerController';
import { validate, createProviderSchema, updateProviderSchema } from '../middleware/validate';

const router = Router();

/**
 * Provider management routes
 * All routes require authentication
 */

// GET /api/providers - List all providers or search
router.get(
  '/',
  authenticate,
  providerController.list
);

// POST /api/providers - Create new provider
router.post(
  '/',
  authenticate,
  validate(createProviderSchema),
  providerController.create
);

// GET /api/providers/:id - Get provider by ID
router.get(
  '/:id',
  authenticate,
  providerController.getById
);

// PUT /api/providers/:id - Update provider
router.put(
  '/:id',
  authenticate,
  validate(updateProviderSchema),
  providerController.update
);

// DELETE /api/providers/:id - Delete provider
router.delete(
  '/:id',
  authenticate,
  providerController.delete
);

export default router;
