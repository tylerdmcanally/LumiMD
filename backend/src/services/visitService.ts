import { PrismaClient, VisitStatus } from '@prisma/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CreateVisitDTO, UpdateVisitDTO, UploadedFile, VisitSubmissionPayload } from '../types';
import { AuthorizationError, NotFoundError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';
import { validateConditions, validateDiagnoses, validateMedications } from './medicalValidationService';
import { medicationInteractionService } from './medicationInteractionService';
import openaiService from './openaiService';
import s3Service from './s3Service';

const prisma = new PrismaClient();

/**
 * Visit service
 * Handles visit CRUD operations and AI processing
 */
class VisitService {
  private async resolveProvider(userId: string, providerId?: string) {
    if (!providerId) {
      return null;
    }

    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        userId,
      },
    });

    if (!provider) {
      throw new NotFoundError('Provider not found or does not belong to you');
    }

    return provider.id;
  }

  private validateConsent(payload: VisitSubmissionPayload) {
    if (!payload.consent?.userConsented) {
      throw new ValidationError('User consent must be confirmed before submitting a visit');
    }

    if (payload.consent?.additionalPartyConsented === false) {
      throw new ValidationError('Provider consent must be confirmed in two-party states');
    }
  }

  /**
   * Create a new visit
   */
  async createVisit(userId: string, data: CreateVisitDTO) {
    try {
      // Verify provider belongs to user
      const provider = await prisma.provider.findFirst({
        where: {
          id: data.providerId,
          userId,
        },
      });

      if (!provider) {
        throw new NotFoundError('Provider not found or does not belong to you');
      }

      // Create visit
      const visit = await prisma.visit.create({
        data: {
          userId,
          providerId: data.providerId,
          visitDate: new Date(data.visitDate),
          visitType: data.visitType as any,
          status: VisitStatus.RECORDING,
        },
        include: {
          provider: true,
        },
      });

      logger.info('Visit created', { visitId: visit.id, userId });

      return visit;
    } catch (error) {
      logger.error('Failed to create visit', { error, userId });
      throw error;
    }
  }

  async submitVisit(
    userId: string,
    payload: VisitSubmissionPayload,
    file: UploadedFile,
    healthProfileContext?: string
  ) {
    this.validateConsent(payload);

    if (!file) {
      throw new ValidationError('Audio file is required');
    }

    let visitRecord: any = null;

    try {
      const providerId = await this.resolveProvider(userId, payload.providerId);

      const visitDate = payload.visitDate ? new Date(payload.visitDate) : new Date();
      if (Number.isNaN(visitDate.getTime())) {
        throw new ValidationError('Invalid visit date provided');
      }

      const visitType = payload.visitType ?? 'IN_PERSON';

      const visitData: any = {
        userId,
        visitDate,
        visitType: visitType as any,
        status: VisitStatus.RECORDING,
      };

      if (providerId) {
        visitData.providerId = providerId;
      }

      visitRecord = await prisma.visit.create({
        data: visitData,
        include: {
          provider: true,
        },
      });

      const { visit } = await this.uploadAudio(
        visitRecord.id,
        userId,
        file,
        healthProfileContext
      );
      return visit;
    } catch (error: any) {
      logger.error('Failed to submit visit', { error, userId });

      if (visitRecord) {
        try {
          await prisma.visit.update({
            where: { id: visitRecord.id },
            data: {
              status: VisitStatus.FAILED,
              processingError: error?.message || 'Visit submission failed',
            },
          });
        } catch (updateError) {
          logger.warn('Failed to mark visit submission failure', {
            visitId: visitRecord.id,
            error: updateError,
          });
        }
      }

      throw error;
    }
  }

  /**
   * Get visit by ID
   */
  async getVisitById(visitId: string, userId: string) {
    try {
      const visit = await prisma.visit.findFirst({
        where: {
          id: visitId,
          OR: [
            { userId }, // Own visit
            {
              sharedWith: {
                some: {
                  sharedWithId: userId,
                },
              },
            }, // Shared visit
          ],
        },
        include: {
          provider: true,
          actionItems: {
            include: {
              reminder: true,
            },
          },
          sharedWith: true,
        },
      });

      if (!visit) {
        throw new NotFoundError('Visit not found');
      }

      return visit;
    } catch (error) {
      logger.error('Failed to get visit', { error, visitId, userId });
      throw error;
    }
  }

  /**
   * List all visits for a user
   */
  async listVisits(userId: string, options?: {
    page?: number;
    limit?: number;
    includeShared?: boolean;
  }) {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 20;
      const skip = (page - 1) * limit;

      const where: any = {
        OR: [{ userId }],
      };

      if (options?.includeShared) {
        where.OR.push({
          sharedWith: {
            some: {
              sharedWithId: userId,
            },
          },
        });
      }

      const [visits, total] = await Promise.all([
        prisma.visit.findMany({
          where,
          include: {
            provider: true,
            actionItems: true,
          },
          orderBy: {
            visitDate: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.visit.count({ where }),
      ]);

      return {
        visits,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to list visits', { error, userId });
      throw error;
    }
  }

  /**
   * Upload audio file for a visit
   */
  async uploadAudio(
    visitId: string,
    userId: string,
    file: UploadedFile,
    healthProfileContext?: string
  ): Promise<{ visit: any; audioUrl: string }> {
    try {
      // Get visit and verify ownership
      const visit = await prisma.visit.findFirst({
        where: { id: visitId, userId },
      });

      if (!visit) {
        throw new NotFoundError('Visit not found');
      }

      logger.info('Uploading audio file', {
        visitId,
        userId,
        fileName: file.originalname,
        fileSize: file.size,
        hasHealthProfile: Boolean(healthProfileContext),
      });

      // Save file temporarily
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(
        tempDir,
        `${uuidv4()}-${file.originalname}`
      );
      fs.writeFileSync(tempFilePath, file.buffer);

      // Upload to S3
      const { url, key, fileName } = await s3Service.uploadBuffer(
        file.buffer,
        file.originalname,
        userId,
        visitId
      );

      // Calculate duration from file size (rough estimate)
      // For accurate duration, would need to parse audio file
      const estimatedDuration = Math.floor(file.size / 16000); // Rough estimate

      // Update visit with audio info
      const updatedVisit = await prisma.visit.update({
        where: { id: visitId },
        data: {
          audioFileUrl: url,
          audioFileName: fileName,
          duration: estimatedDuration,
          status: VisitStatus.UPLOADING,
        },
        include: {
          provider: true,
        },
      });

      // Trigger AI processing asynchronously with health profile context
      this.processVisitAudio(visitId, tempFilePath, userId, healthProfileContext).catch((error) => {
        logger.error('Background audio processing failed', {
          error,
          visitId,
        });
      });

      logger.info('Audio uploaded successfully', { visitId, audioUrl: url });

      return {
        visit: updatedVisit,
        audioUrl: url,
      };
    } catch (error) {
      logger.error('Audio upload failed', { error, visitId, userId });
      throw error;
    }
  }

  /**
   * Process visit audio (transcribe + summarize)
   * This runs asynchronously in the background
   */
  async processVisitAudio(
    visitId: string,
    audioFilePath: string,
    userId: string,
    healthProfileContext?: string
  ) {
    try {
      logger.info('Starting visit audio processing', {
        visitId,
        hasHealthProfile: Boolean(healthProfileContext)
      });

      // Update status to processing
      await prisma.visit.update({
        where: { id: visitId },
        data: { status: VisitStatus.PROCESSING },
      });

      // Process with OpenAI
      const { transcription, summary } = await openaiService.processVisit(
        audioFilePath,
        healthProfileContext
      );

      // Validate medical terms for safety
      logger.info('Validating medical terms in summary', { visitId });
      
      const validatedMedications = validateMedications(summary.summary.medications || []);
      const validatedDiagnoses = validateDiagnoses(summary.summary.diagnoses || []);
      const validatedConditions = validateConditions(summary.summary.discussedConditions || []);

      // Create enhanced summary with validation metadata
      const enhancedSummary = {
        ...summary.summary,
        medications: validatedMedications,
        diagnoses: validatedDiagnoses,
        discussedConditions: validatedConditions,
        _validationTimestamp: new Date().toISOString(),
        _hasValidationWarnings: [
          ...validatedMedications,
          ...validatedDiagnoses,
          ...validatedConditions,
        ].some((item: any) => item.validationWarning),
      };

      // Log validation warnings for review
      const warnings = [
        ...validatedMedications,
        ...validatedDiagnoses,
        ...validatedConditions,
      ].filter((item: any) => item.validationWarning);

      if (warnings.length > 0) {
        logger.warn('Medical term validation warnings detected', {
          visitId,
          warningCount: warnings.length,
          warnings: warnings.map((w: any) => ({
            original: w.name,
            suggestion: w.suggestedName,
            warning: w.validationWarning,
          })),
        });
      }

      // Check for medication interactions
      logger.info('Checking medication interactions', { visitId });
      let interactionWarnings: any[] = [];
      
      try {
        // Get user's current medications from health profile
        const currentMedications = await prisma.medication.findMany({
          where: { userId },
        });

        // Convert medications to interaction service format
        const currentMeds = medicationInteractionService.convertHealthProfileMedications(
          currentMedications
        );
        const newMeds = medicationInteractionService.convertVisitSummaryMedications(
          validatedMedications
        );

        // Check for interactions
        // IMPORTANT: Always check if there are NEW medications, even if no current meds
        // This ensures internal duplication detection (e.g., two beta-blockers prescribed in same visit)
        logger.info('Medication interaction check details', {
          visitId,
          currentMedsCount: currentMeds.length,
          newMedsCount: newMeds.length,
          currentMedsNames: currentMeds.map(m => m.name),
          newMedsNames: newMeds.map(m => m.name),
        });

        if (newMeds.length > 0) {
          interactionWarnings = await medicationInteractionService.checkInteractions(
            currentMeds,
            newMeds
          );

          if (interactionWarnings.length > 0) {
            logger.warn('⚠️ Medication interactions detected', {
              visitId,
              count: interactionWarnings.length,
              critical: interactionWarnings.filter((w) => w.severity === 'critical').length,
              major: interactionWarnings.filter((w) => w.severity === 'major').length,
              warnings: interactionWarnings,
            });
          } else {
            logger.info('No medication interactions detected', { visitId });
          }
        }
      } catch (error) {
        logger.error('Medication interaction check failed - DETAILED', {
          error: error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : String(error),
          errorType: typeof error,
          visitId,
          validatedMedications,
        });
        // Don't fail the visit if interaction check fails
      }

      // Add interaction warnings to enhanced summary
      const finalSummary = {
        ...enhancedSummary,
        medicationInteractions: interactionWarnings,
        _hasInteractionWarnings: interactionWarnings.length > 0,
      };

      // Update visit with results
      const updatedVisit = await prisma.visit.update({
        where: { id: visitId },
        data: {
          transcription: transcription.text,
          summary: finalSummary as any,
          duration: transcription.duration,
          status: VisitStatus.COMPLETED,
        },
      });

      // Create action items from summary
      if (summary.summary.actionItems && summary.summary.actionItems.length > 0) {
        await Promise.all(
          summary.summary.actionItems.map((item) =>
            prisma.actionItem.create({
              data: {
                userId,
                visitId,
                type: item.type as any,
                description: item.detail,
                dueDate: item.dueDate ? new Date(item.dueDate) : null,
              },
            })
          )
        );
      }

      // Create action items for critical/major medication interactions
      if (interactionWarnings.length > 0) {
        const criticalOrMajor = interactionWarnings.filter(
          (w) => w.severity === 'critical' || w.severity === 'major'
        );

        if (criticalOrMajor.length > 0) {
          await Promise.all(
            criticalOrMajor.map((warning) =>
              prisma.actionItem.create({
                data: {
                  userId,
                  visitId,
                  type: 'MEDICATION',
                  description: `ℹ️ Medication Information: ${warning.medication1} + ${warning.medication2} may have potential interactions. ${warning.recommendation} This is informational only - not medical advice.`,
                  dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
                },
              })
            )
          );

          logger.info('Created action items for medication interactions', {
            visitId,
            count: criticalOrMajor.length,
          });
        }
      }

      logger.info('Visit processing completed successfully', { visitId });

      return updatedVisit;
    } catch (error: any) {
      logger.error('Visit processing failed', { error, visitId });

      // Update visit with error
      await prisma.visit.update({
        where: { id: visitId },
        data: {
          status: VisitStatus.FAILED,
          processingError: error.message || 'Processing failed',
        },
      });

      throw error;
    } finally {
      if (fs.existsSync(audioFilePath)) {
        fs.unlinkSync(audioFilePath);
      }
    }
  }

  /**
   * Update visit
   */
  async updateVisit(visitId: string, userId: string, data: UpdateVisitDTO) {
    try {
      // Verify ownership
      const visit = await prisma.visit.findFirst({
        where: { id: visitId, userId },
      });

      if (!visit) {
        throw new NotFoundError('Visit not found');
      }

      const updateData: any = {};

      if (data.visitDate) {
        const nextDate = new Date(data.visitDate);
        if (Number.isNaN(nextDate.getTime())) {
          throw new ValidationError('Invalid visit date provided');
        }
        updateData.visitDate = nextDate;
      }

      if (data.visitType) {
        updateData.visitType = data.visitType as any;
      }

      if (data.transcription) {
        updateData.transcription = data.transcription;
      }

      if (data.summary) {
        updateData.summary = data.summary as any;
      }

      if (data.status) {
        updateData.status = data.status as any;
      }

      if (data.providerId && data.providerId !== visit.providerId) {
        const provider = await prisma.provider.findFirst({
          where: {
            id: data.providerId,
            userId,
          },
        });

        if (!provider) {
          throw new NotFoundError('Provider not found or does not belong to you');
        }

        updateData.providerId = data.providerId;
      }

      if (Object.keys(updateData).length === 0) {
        return await prisma.visit.findUnique({
          where: { id: visitId },
          include: {
            provider: true,
            actionItems: true,
          },
        });
      }

      const updatedVisit = await prisma.visit.update({
        where: { id: visitId },
        data: updateData,
        include: {
          provider: true,
          actionItems: true,
        },
      });

      logger.info('Visit updated', { visitId, userId });

      return updatedVisit;
    } catch (error) {
      logger.error('Failed to update visit', { error, visitId, userId });
      throw error;
    }
  }

  /**
   * Delete visit
   */
  async deleteVisit(visitId: string, userId: string) {
    try {
      // Verify ownership
      const visit = await prisma.visit.findFirst({
        where: { id: visitId, userId },
      });

      if (!visit) {
        throw new NotFoundError('Visit not found');
      }

      // Delete audio file from S3 if exists
      if (visit.audioFileUrl) {
        // Extract S3 key from URL
        const urlParts = visit.audioFileUrl.split('/');
        const s3Key = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region/

        await s3Service.deleteFile(s3Key).catch((error) => {
          logger.warn('Failed to delete S3 file', { error, s3Key });
        });
      }

      // Delete visit (cascade will delete action items)
      await prisma.visit.delete({
        where: { id: visitId },
      });

      logger.info('Visit deleted', { visitId, userId });
    } catch (error) {
      logger.error('Failed to delete visit', { error, visitId, userId });
      throw error;
    }
  }

  /**
   * Share visit with trusted user
   */
  async shareVisit(
    visitId: string,
    userId: string,
    sharedWithUserId: string
  ) {
    try {
      // Verify ownership
      const visit = await prisma.visit.findFirst({
        where: { id: visitId, userId },
      });

      if (!visit) {
        throw new NotFoundError('Visit not found');
      }

      // Verify trusted relationship exists
      const trustedAccess = await prisma.trustedAccess.findFirst({
        where: {
          grantingUserId: userId,
          trustedUserId: sharedWithUserId,
          revokedAt: null,
        },
      });

      if (!trustedAccess) {
        throw new AuthorizationError(
          'Cannot share with this user - no trusted relationship'
        );
      }

      // Create shared visit
      const sharedVisit = await prisma.sharedVisit.create({
        data: {
          visitId,
          sharedWithId: sharedWithUserId,
          sharedByUserId: userId,
        },
      });

      logger.info('Visit shared', {
        visitId,
        sharedBy: userId,
        sharedWith: sharedWithUserId,
      });

      return sharedVisit;
    } catch (error) {
      logger.error('Failed to share visit', {
        error,
        visitId,
        userId,
        sharedWithUserId,
      });
      throw error;
    }
  }

  /**
   * Get visit summary
   */
  async getVisitSummary(visitId: string, userId: string) {
    try {
      const visit = await this.getVisitById(visitId, userId);

      if (!visit.summary) {
        throw new NotFoundError('Visit summary not available yet');
      }

      return {
        visitId: visit.id,
        summary: visit.summary,
        provider: visit.provider,
        visitDate: visit.visitDate,
        visitType: visit.visitType,
        actionItems: visit.actionItems,
      };
    } catch (error) {
      logger.error('Failed to get visit summary', { error, visitId, userId });
      throw error;
    }
  }

  /**
   * Get visit transcript
   */
  async getVisitTranscript(visitId: string, userId: string) {
    try {
      const visit = await this.getVisitById(visitId, userId);

      if (!visit.transcription) {
        throw new NotFoundError('Visit transcript not available yet');
      }

      return {
        visitId: visit.id,
        transcription: visit.transcription,
        duration: visit.duration,
        provider: visit.provider,
        visitDate: visit.visitDate,
      };
    } catch (error) {
      logger.error('Failed to get visit transcript', {
        error,
        visitId,
        userId,
      });
      throw error;
    }
  }
}

export default new VisitService();
