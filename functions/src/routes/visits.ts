import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { storageConfig } from '../config';
import { normalizeMedicationSummary } from '../services/medicationSync';
import { getAssemblyAIService } from '../services/assemblyai';
import {
  calculateRetryWaitSeconds,
  resolveRetryPath,
} from '../services/visitProcessingTransitions';

export const visitsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();

const decodeStoragePathFromAudioUrl = (audioUrl?: string | null): string | null => {
  if (!audioUrl) return null;
  try {
    const url = new URL(audioUrl);
    const parts = url.pathname.split('/o/');
    if (parts.length < 2) return null;
    return decodeURIComponent(parts[1]);
  } catch (error) {
    functions.logger.warn('[visits] Failed to parse storage path from audioUrl', error);
    return null;
  }
};

const parseBucketFromAudioUrl = (audioUrl?: string | null): string | null => {
  if (!audioUrl) return null;
  try {
    const match = audioUrl.match(/\/b\/([^/]+)\//);
    return match ? match[1] : null;
  } catch (error) {
    functions.logger.warn('[visits] Failed to parse bucket from audioUrl', error);
    return null;
  }
};

// Validation schemas
const medicationEntrySchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    dose: z.string().optional(),
    frequency: z.string().optional(),
    note: z.string().optional(),
    display: z.string().optional(),
    original: z.string().optional(),
  }),
]);

const medicationsSchema = z.object({
  started: z.array(medicationEntrySchema).optional(),
  stopped: z.array(medicationEntrySchema).optional(),
  changed: z.array(medicationEntrySchema).optional(),
});

const processingStatusEnum = z.enum([
  'pending',
  'processing',
  'transcribing',
  'summarizing',
  'completed',
  'failed',
]);

const createVisitSchema = z.object({
  audioUrl: z.string().optional(),
  storagePath: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['recording', 'processing', 'completed', 'failed']).default('recording'),
});

const updateVisitSchema = z.object({
  notes: z.string().optional(),
  status: z.enum(['recording', 'processing', 'completed', 'failed']).optional(),
  transcript: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  diagnoses: z.array(z.string()).optional(),
  medications: medicationsSchema.optional(),
  imaging: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  processingStatus: processingStatusEnum.optional(),
  processedAt: z.string().nullable().optional(),
  storagePath: z.string().optional(),
  provider: z.string().optional(),
  location: z.string().optional(),
  specialty: z.string().optional(),
  visitDate: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  folders: z.array(z.string()).optional(),
});

/**
 * GET /v1/visits
 * List all visits for the authenticated user
 * Query params:
 * - limit: number (optional) - limit results
 * - sort: 'asc' | 'desc' (optional) - sort by createdAt
 */
visitsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const sort = req.query.sort as 'asc' | 'desc' | undefined;

    // Query visits collection for this user
    let query = getDb()
      .collection('visits')
      .where('userId', '==', userId)
      .orderBy('createdAt', sort === 'asc' ? 'asc' : 'desc');

    if (limit && limit > 0) {
      query = query.limit(limit);
    }

    const visitsSnapshot = await query.get();

    const visits = visitsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore timestamps to ISO strings
      createdAt: doc.data().createdAt?.toDate().toISOString(),
      updatedAt: doc.data().updatedAt?.toDate().toISOString(),
      processedAt: doc.data().processedAt?.toDate().toISOString() ?? null,
      visitDate: doc.data().visitDate?.toDate?.()
        ? doc.data().visitDate.toDate().toISOString()
        : doc.data().visitDate ?? null,
    }));

    functions.logger.info(`[visits] Listed ${visits.length} visits for user ${userId}`);
    res.json(visits);
  } catch (error) {
    functions.logger.error('[visits] Error listing visits:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch visits',
    });
  }
});

/**
 * GET /v1/visits/:id
 * Get a single visit by ID
 */
visitsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;

    const visitDoc = await getDb().collection('visits').doc(visitId).get();

    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    const visit = visitDoc.data()!;

    // Verify ownership
    if (visit.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this visit',
      });
      return;
    }

    res.json({
      id: visitDoc.id,
      ...visit,
      createdAt: visit.createdAt?.toDate().toISOString(),
      updatedAt: visit.updatedAt?.toDate().toISOString(),
      processedAt: visit.processedAt?.toDate().toISOString() ?? null,
      visitDate: visit.visitDate?.toDate?.()
        ? visit.visitDate.toDate().toISOString()
        : visit.visitDate ?? null,
    });
  } catch (error) {
    functions.logger.error('[visits] Error getting visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch visit',
    });
  }
});

/**
 * POST /v1/visits
 * Create a new visit (premium)
 */
visitsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Validate request body
    const data = createVisitSchema.parse(req.body);

    const now = admin.firestore.Timestamp.now();

    // Create visit document
    const visitRef = await getDb().collection('visits').add({
      userId,
      audioUrl: data.audioUrl || null,
      storagePath: data.storagePath || null,
      notes: data.notes || '',
      status: data.status,
      processingStatus: 'pending',
      transcript: null,
      summary: null,
      diagnoses: [],
      medications: {
        started: [],
        stopped: [],
        changed: [],
      },
      imaging: [],
      nextSteps: [],
      processedAt: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const visitDoc = await visitRef.get();
    const visit = visitDoc.data()!;

    functions.logger.info(`[visits] Created visit ${visitRef.id} for user ${userId}`);

    res.status(201).json({
      id: visitRef.id,
      ...visit,
      createdAt: visit.createdAt.toDate().toISOString(),
      updatedAt: visit.updatedAt.toDate().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[visits] Error creating visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to create visit',
    });
  }
});

/**
 * PATCH /v1/visits/:id
 * Update a visit
 */
visitsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;

    // Validate request body
    const data = updateVisitSchema.parse(req.body);

    const visitRef = getDb().collection('visits').doc(visitId);
    const visitDoc = await visitRef.get();

    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    const visit = visitDoc.data()!;

    // Verify ownership
    if (visit.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this visit',
      });
      return;
    }

    const updatePayload: Record<string, unknown> = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (data.notes !== undefined) {
      updatePayload.notes = data.notes;
    }

    if (data.status !== undefined) {
      updatePayload.status = data.status;
    }

    if (data.transcript !== undefined) {
      updatePayload.transcript = data.transcript;
    }

    if (data.summary !== undefined) {
      updatePayload.summary = data.summary;
    }

    if (data.diagnoses !== undefined) {
      updatePayload.diagnoses = data.diagnoses;
    }

    if (data.medications !== undefined) {
      updatePayload.medications = normalizeMedicationSummary(data.medications);
    }

    if (data.imaging !== undefined) {
      updatePayload.imaging = data.imaging;
    }

    if (data.nextSteps !== undefined) {
      updatePayload.nextSteps = data.nextSteps;
    }

    if (data.processingStatus !== undefined) {
      updatePayload.processingStatus = data.processingStatus;
    }

    if (data.processedAt !== undefined) {
      updatePayload.processedAt = data.processedAt
        ? admin.firestore.Timestamp.fromDate(new Date(data.processedAt))
        : null;
    }

    if (data.provider !== undefined) {
      updatePayload.provider = data.provider?.trim() || null;
    }

    if (data.location !== undefined) {
      updatePayload.location = data.location?.trim() || null;
    }

    if (data.specialty !== undefined) {
      updatePayload.specialty = data.specialty?.trim() || null;
    }

    if (data.visitDate !== undefined) {
      updatePayload.visitDate = data.visitDate
        ? admin.firestore.Timestamp.fromDate(new Date(data.visitDate))
        : null;
    }

    if (data.tags !== undefined) {
      const cleanedTags = Array.from(
        new Set(
          (data.tags || []).map((tag) => tag?.trim()).filter(Boolean) as string[],
        ),
      );
      updatePayload.tags = cleanedTags;
    }

    if (data.folders !== undefined) {
      const cleanedFolders = Array.from(
        new Set(
          (data.folders || [])
            .map((folder) => folder?.trim())
            .filter(Boolean) as string[],
        ),
      );
      updatePayload.folders = cleanedFolders;
    }

    await visitRef.update(updatePayload);

    const updatedDoc = await visitRef.get();
    const updatedVisit = updatedDoc.data()!;

    functions.logger.info(`[visits] Updated visit ${visitId} for user ${userId}`);

    res.json({
      id: visitId,
      ...updatedVisit,
      createdAt: updatedVisit.createdAt?.toDate().toISOString(),
      updatedAt: updatedVisit.updatedAt?.toDate().toISOString(),
      processedAt: updatedVisit.processedAt?.toDate().toISOString() ?? null,
      visitDate: updatedVisit.visitDate?.toDate
        ? updatedVisit.visitDate.toDate().toISOString()
        : updatedVisit.visitDate ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[visits] Error updating visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to update visit',
    });
  }
});

/**
 * DELETE /v1/visits/:id
 * Remove a visit and related resources
 */
visitsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;

    const visitRef = getDb().collection('visits').doc(visitId);
    const visitDoc = await visitRef.get();

    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    const visit = visitDoc.data()!;

    if (visit.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this visit',
      });
      return;
    }

    // Attempt to delete associated audio file
    const storagePath =
      visit.storagePath ||
      decodeStoragePathFromAudioUrl(visit.audioUrl) ||
      null;
    const bucketName =
      visit.bucketName ||
      parseBucketFromAudioUrl(visit.audioUrl) ||
      storageConfig.bucket;

    if (storagePath && bucketName) {
      try {
        const bucket = admin.storage().bucket(bucketName);
        await bucket.file(storagePath).delete({ ignoreNotFound: true });
        functions.logger.info(
          `[visits] Deleted storage file for visit ${visitId}: ${storagePath}`,
        );
      } catch (error) {
        functions.logger.warn(
          `[visits] Unable to delete storage file for visit ${visitId}:`,
          error,
        );
      }
    }

    const transcriptionId =
      typeof visit.transcriptionId === 'string' ? visit.transcriptionId : null;

    if (transcriptionId) {
      try {
        const assemblyAI = getAssemblyAIService();
        await assemblyAI.deleteTranscript(transcriptionId);
        functions.logger.info(
          `[visits] Deleted AssemblyAI transcript for visit ${visitId}: ${transcriptionId}`,
        );
      } catch (error) {
        functions.logger.warn(
          `[visits] Unable to delete AssemblyAI transcript for visit ${visitId}`,
          error,
        );
      }
    }

    // Remove action items tied to this visit
    const actionsSnapshot = await getDb()
      .collection('actions')
      .where('visitId', '==', visitId)
      .get();

    const batch = getDb().batch();

    actionsSnapshot.docs.forEach((actionDoc) => {
      const action = actionDoc.data();
      if (action.userId === userId) {
        batch.delete(actionDoc.ref);
      }
    });

    batch.delete(visitRef);

    await batch.commit();

    functions.logger.info(
      `[visits] Deleted visit ${visitId} and related data for user ${userId}`,
    );

    res.status(204).send();
  } catch (error) {
    functions.logger.error('[visits] Error deleting visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to delete visit',
    });
  }
});

/**
 * POST /v1/visits/:id/retry
 * Re-run AI processing for a visit
 */
visitsRouter.post('/:id/retry', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;

    const visitRef = getDb().collection('visits').doc(visitId);
    const visitDoc = await visitRef.get();

    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    const visit = visitDoc.data()!;

    if (visit.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this visit',
      });
      return;
    }

    if (['processing', 'transcribing', 'summarizing'].includes(visit.processingStatus)) {
      res.status(409).json({
        code: 'already_processing',
        message: 'This visit is currently being processed',
      });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const lastRetryAt = visit.lastRetryAt as admin.firestore.Timestamp | undefined;
    const MIN_RETRY_INTERVAL_MS = 30 * 1000;

    const waitSeconds = calculateRetryWaitSeconds({
      lastRetryAtMillis: lastRetryAt?.toMillis?.(),
      nowMillis: Date.now(),
      minIntervalMs: MIN_RETRY_INTERVAL_MS,
    });

    if (waitSeconds > 0) {
      res.status(429).json({
        code: 'retry_too_soon',
        message: `Please wait ${waitSeconds} more seconds before retrying`,
      });
      return;
    }

    const storagePath =
      visit.storagePath || decodeStoragePathFromAudioUrl(visit.audioUrl) || null;

    if (!storagePath) {
      res.status(400).json({
        code: 'missing_audio',
        message: 'Visit has no associated audio file to process',
      });
      return;
    }

    const bucketName =
      parseBucketFromAudioUrl(visit.audioUrl) || storageConfig.bucket || visit.bucketName;

    // Check if we already have a transcript to save costs/time
    const retryPath = resolveRetryPath(visit);

    if (retryPath === 'summarize') {
      // Skip transcription and go straight to summarization
      await visitRef.update({
        processingStatus: 'summarizing',
        status: 'processing',
        processingError: admin.firestore.FieldValue.delete(),
        summarizationStartedAt: admin.firestore.FieldValue.delete(),
        summarizationCompletedAt: admin.firestore.FieldValue.delete(),
        summary: admin.firestore.FieldValue.delete(),
        diagnoses: [],
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        imaging: [],
        nextSteps: [],
        processedAt: null,
        lastRetryAt: now,
        retryCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      });

      functions.logger.info(`[visits] Retrying visit ${visitId} starting from summarization (transcript found)`);
    } else {
      // No transcript, full re-process
      try {
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(storagePath);

        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 4 * 60 * 60 * 1000, // 4 hours to allow for long transcription queues
        });

        if (!signedUrl) {
          throw new Error('Unable to generate signed URL for transcription');
        }

        const assemblyAI = getAssemblyAIService();
        const transcriptionId = await assemblyAI.submitTranscription(signedUrl);

        await visitRef.update({
          transcriptionId,
          transcriptionStatus: 'submitted',
          transcriptionSubmittedAt: now,
          transcriptionCompletedAt: null,
          summarizationStartedAt: admin.firestore.FieldValue.delete(),
          summarizationCompletedAt: admin.firestore.FieldValue.delete(),
          transcript: admin.firestore.FieldValue.delete(),
          transcriptText: admin.firestore.FieldValue.delete(),
          summary: admin.firestore.FieldValue.delete(),
          diagnoses: [],
          medications: {
            started: [],
            stopped: [],
            changed: [],
          },
          imaging: [],
          nextSteps: [],
          processedAt: null,
          processingStatus: 'transcribing',
          status: 'processing',
          processingError: admin.firestore.FieldValue.delete(),
          lastRetryAt: now,
          retryCount: admin.firestore.FieldValue.increment(1),
          storagePath,
          updatedAt: now,
        });

        functions.logger.info(`[visits] Retrying visit ${visitId} with full re-transcription`);
      } catch (error) {
        functions.logger.error(`[visits] Error submitting visit ${visitId} for retry:`, error);
        res.status(500).json({
          code: 'retry_failed',
          message: 'Failed to requeue visit for processing',
        });
        return;
      }
    }

    const updatedDoc = await visitRef.get();
    const updatedVisit = updatedDoc.data()!;

    res.json({
      id: updatedDoc.id,
      ...updatedVisit,
      createdAt: updatedVisit.createdAt?.toDate().toISOString(),
      updatedAt: updatedVisit.updatedAt?.toDate().toISOString(),
      processedAt: updatedVisit.processedAt?.toDate().toISOString() ?? null,
    });
  } catch (error) {
    functions.logger.error('[visits] Error retrying visit:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to retry visit processing',
    });
  }
});

/**
 * POST /v1/visits/:id/share-with-caregivers
 * Send visit summary PDF to caregivers
 */
visitsRouter.post('/:id/share-with-caregivers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const visitId = req.params.id;

    // Validate optional caregiver filter
    const caregiverIds = Array.isArray(req.body.caregiverIds) ? req.body.caregiverIds : undefined;

    // Verify visit exists and belongs to user
    const visitDoc = await getDb().collection('visits').doc(visitId).get();
    if (!visitDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Visit not found',
      });
      return;
    }

    const visit = visitDoc.data()!;
    if (visit.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this visit',
      });
      return;
    }

    // Check visit has been processed
    if (visit.processingStatus !== 'completed' && visit.status !== 'completed') {
      res.status(400).json({
        code: 'not_ready',
        message: 'Visit must be fully processed before sharing',
      });
      return;
    }

    // Import and call the caregiver email service
    const { sendVisitPdfToAllCaregivers } = await import('../services/caregiverEmailService');
    const result = await sendVisitPdfToAllCaregivers(userId, visitId, caregiverIds);

    if (result.sent === 0 && result.failed === 0) {
      res.status(400).json({
        code: 'no_caregivers',
        message: 'No active caregivers to share with',
      });
      return;
    }

    functions.logger.info(`[visits] Shared visit ${visitId} with caregivers`, {
      userId,
      sent: result.sent,
      failed: result.failed,
    });

    res.json({
      message: `Sent to ${result.sent} caregiver(s)`,
      sent: result.sent,
      failed: result.failed,
      results: result.results,
    });
  } catch (error) {
    functions.logger.error('[visits] Error sharing with caregivers:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to share visit with caregivers',
    });
  }
});
