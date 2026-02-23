import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import type { MedicationDomainService } from '../../services/domain/medications/MedicationDomainService';
import type { MedicationRecord } from '../../services/repositories/medications/MedicationRepository';
import { RepositoryValidationError } from '../../services/repositories/common/errors';

type RegisterMedicationQueryRoutesOptions = {
  getMedicationDomainService: () => MedicationDomainService;
  pageSizeDefault: number;
  pageSizeMax: number;
};

function serializeMedication(medication: MedicationRecord) {
  return {
    ...medication,
    id: medication.id,
    createdAt: medication.createdAt?.toDate?.().toISOString?.(),
    updatedAt: medication.updatedAt?.toDate?.().toISOString?.(),
    startedAt: medication.startedAt?.toDate?.()?.toISOString?.() || null,
    stoppedAt: medication.stoppedAt?.toDate?.()?.toISOString?.() || null,
    changedAt: medication.changedAt?.toDate?.()?.toISOString?.() || null,
    lastSyncedAt: medication.lastSyncedAt?.toDate?.()?.toISOString?.() || null,
    medicationWarning: medication.medicationWarning || null,
    warningAcknowledgedAt: medication.warningAcknowledgedAt?.toDate?.()?.toISOString?.() || null,
    needsConfirmation: medication.needsConfirmation || false,
    medicationStatus: medication.medicationStatus || null,
  };
}

export function registerMedicationQueryRoutes(
  router: Router,
  options: RegisterMedicationQueryRoutesOptions,
): void {
  const { getMedicationDomainService, pageSizeDefault, pageSizeMax } = options;

  /**
   * GET /v1/meds
   * List all medications for the authenticated user
   */
  router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const medicationService = getMedicationDomainService();
      const rawLimit = req.query.limit;
      const cursor =
        typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
          ? req.query.cursor.trim()
          : null;
      const paginationRequested = rawLimit !== undefined || cursor !== null;

      let limit = pageSizeDefault;
      if (rawLimit !== undefined) {
        const parsedLimit = parseInt(String(rawLimit), 10);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
          res.status(400).json({
            code: 'validation_failed',
            message: 'limit must be a positive integer',
          });
          return;
        }
        limit = Math.min(parsedLimit, pageSizeMax);
      }

      let medications: MedicationRecord[];
      let hasMore = false;
      let nextCursor: string | null = null;

      if (paginationRequested) {
        const page = await medicationService.listForUser(userId, {
          limit,
          cursor,
          sortDirection: 'asc',
          sortField: 'name',
        });

        medications = page.items;
        hasMore = page.hasMore;
        nextCursor = page.nextCursor;

        res.set('X-Has-More', hasMore ? 'true' : 'false');
        res.set('X-Next-Cursor', nextCursor || '');
      } else {
        medications = await medicationService.listAllForUser(userId, {
          sortDirection: 'asc',
          sortField: 'name',
        });
      }

      const serialized = medications.map((medication) => serializeMedication(medication));

      functions.logger.info(`[medications] Listed ${serialized.length} medications for user ${userId}`, {
        paginated: paginationRequested,
        hasMore,
        nextCursor,
      });
      res.json(serialized);
    } catch (error) {
      if (error instanceof RepositoryValidationError) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid cursor',
        });
        return;
      }

      functions.logger.error('[medications] Error listing medications:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to fetch medications',
      });
    }
  });

  /**
   * GET /v1/meds/:id
   * Get a single medication by ID
   */
  router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const medId = req.params.id;
      const medicationService = getMedicationDomainService();

      const medication = await medicationService.getForUser(userId, medId);

      if (!medication) {
        res.status(404).json({
          code: 'not_found',
          message: 'Medication not found',
        });
        return;
      }

      res.json(serializeMedication(medication));
    } catch (error) {
      functions.logger.error('[medications] Error getting medication:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to fetch medication',
      });
    }
  });
}
