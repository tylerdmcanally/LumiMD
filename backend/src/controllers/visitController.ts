import { Response, NextFunction } from 'express';
import { z } from 'zod';
import visitService from '../services/visitService';
import { AuthenticatedRequest, SuccessResponse, VisitSubmissionPayload } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';
import { logAction } from '../middleware/auditLog';

const visitSubmissionSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID').optional(),
  visitDate: z
    .string()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid visit date'),
  visitType: z
    .enum(['IN_PERSON', 'TELEHEALTH', 'ER', 'URGENT_CARE', 'PHONE_CALL', 'OTHER'])
    .optional(),
  consent: z.object({
    userConsented: z.boolean(),
    additionalPartyConsented: z.boolean().optional(),
    stateName: z.string().optional(),
  }),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
});

/**
 * Visit controller
 */
class VisitController {
  /**
   * Submit a visit with audio in a single request
   * POST /api/visits
   */
  submit = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const file = req.file;

      if (!file) {
        throw new ValidationError('Audio file is required');
      }

      const rawPayload = req.body.payload;

      if (!rawPayload) {
        throw new ValidationError('Visit metadata payload is required');
      }

      let payload: VisitSubmissionPayload;

      try {
        const parsedJson = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
        payload = visitSubmissionSchema.parse(parsedJson);
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(
            `Validation failed: ${error.errors.map((err) => err.message).join(', ')}`
          );
        }

        throw new ValidationError('Invalid visit metadata payload');
      }

      // Extract health profile context if provided
      const healthProfileContext = req.body.healthProfileContext;

      const visit = await visitService.submitVisit(
        req.userId,
        payload,
        file as any,
        healthProfileContext
      );

      await logAction(req.userId, 'CREATE', 'VisitConsent', visit.id, {
        consent: payload.consent,
        location: payload.location,
      });

      const response: SuccessResponse = {
        success: true,
        data: visit,
        message: 'Visit submitted successfully. Processing will begin shortly.',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Create new visit
   * POST /api/visits/start
   */
  start = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { providerId, visitDate, visitType } = req.body;

      const visit = await visitService.createVisit(req.userId, {
        providerId,
        visitDate,
        visitType,
      });

      const response: SuccessResponse = {
        success: true,
        data: visit,
        message: 'Visit started successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Upload audio file
   * POST /api/visits/:id/upload
   */
  uploadAudio = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const file = req.file;

      if (!file) {
        throw new ValidationError('Audio file is required');
      }

      const result = await visitService.uploadAudio(id, req.userId, file as any);

      const response: SuccessResponse = {
        success: true,
        data: result,
        message: 'Audio uploaded successfully. Processing will begin shortly.',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get visit by ID
   * GET /api/visits/:id
   */
  getById = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      const visit = await visitService.getVisitById(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: visit,
      };

      res.status(200).json(response);
    }
  );

  /**
   * List all visits
   * GET /api/visits
   */
  list = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const includeShared = req.query.includeShared === 'true';

      const result = await visitService.listVisits(req.userId, {
        page,
        limit,
        includeShared,
      });

      const response: SuccessResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Update visit
   * PUT /api/visits/:id
   */
  update = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const updateData = req.body;

      const visit = await visitService.updateVisit(id, req.userId, updateData);

      const response: SuccessResponse = {
        success: true,
        data: visit,
        message: 'Visit updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete visit
   * DELETE /api/visits/:id
   */
  delete = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      await visitService.deleteVisit(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Visit deleted successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get visit summary
   * GET /api/visits/:id/summary
   */
  getSummary = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      const summary = await visitService.getVisitSummary(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: summary,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Get visit transcript
   * GET /api/visits/:id/transcript
   */
  getTranscript = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;

      const transcript = await visitService.getVisitTranscript(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: transcript,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Share visit with trusted user
   * POST /api/visits/:id/share
   */
  share = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const { sharedWithUserId } = req.body;

      if (!sharedWithUserId) {
        throw new ValidationError('sharedWithUserId is required');
      }

      const sharedVisit = await visitService.shareVisit(
        id,
        req.userId,
        sharedWithUserId
      );

      const response: SuccessResponse = {
        success: true,
        data: sharedVisit,
        message: 'Visit shared successfully',
      };

      res.status(200).json(response);
    }
  );
}

export default new VisitController();
