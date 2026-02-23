import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import {
  AuthRequest,
  hasOperatorAccess,
  requireAuth,
  ensureOperatorRestoreReasonOrReject,
} from '../../middlewares/auth';
import { ensureResourceOwnerAccessOrReject } from '../../middlewares/resourceAccess';
import { sanitizePlainText } from '../../utils/inputSanitization';
import { clearMedicationSafetyCacheForUser } from '../../services/medicationSafetyAI';
import {
  RESTORE_REASON_MAX_LENGTH,
  recordRestoreAuditEvent,
} from '../../services/restoreAuditService';
import type { MedicationDomainService } from '../../services/domain/medications/MedicationDomainService';

const restoreMedicationSchema = z.object({
  reason: z.string().max(RESTORE_REASON_MAX_LENGTH).optional(),
});

type RegisterMedicationLifecycleRoutesOptions = {
  getMedicationDomainService: () => MedicationDomainService;
};

export function registerMedicationLifecycleRoutes(
  router: Router,
  options: RegisterMedicationLifecycleRoutesOptions,
): void {
  const { getMedicationDomainService } = options;

  /**
   * DELETE /v1/meds/:id
   * Delete a medication
   */
  router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
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

      const now = admin.firestore.Timestamp.now();
      const { disabledReminders, dismissedNudges } = await medicationService.softDeleteMedicationCascade(
        medId,
        userId,
        now,
      );

      if (disabledReminders > 0) {
        functions.logger.info(
          `[medications] Soft-disabled ${disabledReminders} reminder(s) for medication ${medId}`,
        );
      }
      if (dismissedNudges > 0) {
        functions.logger.info(
          `[medications] Dismissed ${dismissedNudges} nudge(s) for medication ${medId}`,
        );
      }

      await clearMedicationSafetyCacheForUser(userId);

      functions.logger.info(`[medications] Soft-deleted medication ${medId} for user ${userId}`);

      res.status(204).send();
    } catch (error) {
      functions.logger.error('[medications] Error deleting medication:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to delete medication',
      });
    }
  });

  /**
   * POST /v1/meds/:id/restore
   * Restore a soft-deleted medication and related reminders from the same delete event
   */
  router.post('/:id/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const medId = req.params.id;
      const isOperator = hasOperatorAccess(req.user);
      const medicationService = getMedicationDomainService();

      const payload = restoreMedicationSchema.safeParse(req.body ?? {});
      if (!payload.success) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid restore request body',
          details: payload.error.errors,
        });
        return;
      }
      const restoreReason =
        sanitizePlainText(payload.data.reason, RESTORE_REASON_MAX_LENGTH) || undefined;

      const medication = await medicationService.getById(medId);
      if (!medication) {
        res.status(404).json({
          code: 'not_found',
          message: 'Medication not found',
        });
        return;
      }

      if (
        !ensureResourceOwnerAccessOrReject(userId, medication, res, {
          resourceName: 'medication',
          notFoundMessage: 'Medication not found',
          allowOperator: true,
          isOperator,
          allowDeleted: true,
        })
      ) {
        return;
      }

      if (!ensureOperatorRestoreReasonOrReject({
        actorUserId: userId,
        ownerUserId: medication.userId,
        isOperator,
        reason: restoreReason,
        res,
      })) {
        return;
      }

      if (!medication.deletedAt) {
        res.status(409).json({
          code: 'not_deleted',
          message: 'Medication is not deleted',
        });
        return;
      }

      const medicationDeletedAtMillis =
        typeof medication.deletedAt?.toMillis === 'function'
          ? medication.deletedAt.toMillis()
          : null;

      const now = admin.firestore.Timestamp.now();
      const { restoredReminders } = await medicationService.restoreMedicationCascade(
        medId,
        medication.userId,
        medicationDeletedAtMillis,
        now,
      );
      await clearMedicationSafetyCacheForUser(medication.userId);

      try {
        await recordRestoreAuditEvent({
          resourceType: 'medication',
          resourceId: medId,
          ownerUserId: medication.userId,
          actorUserId: userId,
          actorIsOperator: isOperator,
          reason: restoreReason,
          metadata: {
            route: 'medications.restore',
            restoredReminders,
          },
          createdAt: now,
        });
      } catch (auditError) {
        functions.logger.error('[medications] Failed to record restore audit event', {
          medId,
          actorUserId: userId,
          ownerUserId: medication.userId,
          message: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }

      functions.logger.info(
        `[medications] Restored medication ${medId} and ${restoredReminders} reminder(s) for user ${userId}`,
      );

      res.json({
        success: true,
        id: medId,
        restoredReminders,
        restoredBy: userId,
        restoredFor: medication.userId,
        reason: restoreReason ?? null,
        restoredAt: now.toDate().toISOString(),
      });
    } catch (error) {
      functions.logger.error('[medications] Error restoring medication:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to restore medication',
      });
    }
  });
}
