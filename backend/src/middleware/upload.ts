import multer from 'multer';
import config from '../config';
import { ValidationError } from '../utils/errors';

/**
 * Multer configuration for file uploads
 * Uses memory storage for processing before S3 upload
 */

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter for audio files
const audioFileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedMimeTypes = config.upload.allowedAudioFormats;

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ValidationError(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`
      ),
      false
    );
  }
};

// Multer upload middleware for audio files
export const uploadAudio = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeMB * 1024 * 1024, // Convert MB to bytes
  },
});

// Multer upload middleware for images
export const uploadImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new ValidationError(
          `Invalid image type. Allowed types: ${allowedMimeTypes.join(', ')}`
        ),
        false
      );
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for images
  },
});

// Multer upload middleware for documents
export const uploadDocument = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new ValidationError(
          `Invalid document type. Allowed types: ${allowedMimeTypes.join(', ')}`
        ),
        false
      );
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for documents
  },
});
