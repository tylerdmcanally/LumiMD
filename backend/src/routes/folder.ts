import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import visitFolderController from '../controllers/visitFolderController';

const router = Router();

/**
 * Visit folder management routes
 * All routes require authentication
 */

// Folder CRUD
router.post('/', authenticate, visitFolderController.createFolder);
router.get('/', authenticate, visitFolderController.listFolders);
router.get('/:id', authenticate, visitFolderController.getFolderById);
router.put('/:id', authenticate, visitFolderController.updateFolder);
router.delete('/:id', authenticate, visitFolderController.deleteFolder);

export default router;
