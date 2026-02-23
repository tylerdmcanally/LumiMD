import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../../middlewares/auth';
import {
  runMedicationSafetyChecks,
  MedicationSafetyWarning,
  normalizeMedicationName,
} from '../../services/medicationSafety';
import type { MedicationDomainService } from '../../services/domain/medications/MedicationDomainService';
import { clearMedicationSafetyCacheForUser } from '../../services/medicationSafetyAI';
import { resolveReminderTimingPolicy } from '../../utils/medicationReminderTiming';
import { sanitizePlainText } from '../../utils/inputSanitization';

type RegisterMedicationCoreRoutesOptions = {
  getMedicationDomainService: () => MedicationDomainService;
  getDefaultReminderTimes: (frequency?: string) => string[] | null;
  getUserTimezone: (userId: string) => Promise<string>;
  medicationNameMaxLength: number;
  medicationDoseMaxLength: number;
  medicationFrequencyMaxLength: number;
  medicationNotesMaxLength: number;
};

const createMedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().default(true),
  source: z.enum(['manual', 'visit']).default('manual'),
  sourceVisitId: z.string().nullable().optional(),
});

const updateMedicationSchema = z.object({
  name: z.string().min(1).optional(),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
  source: z.enum(['manual', 'visit']).optional(),
  sourceVisitId: z.string().nullable().optional(),
});

const safetyCheckSchema = z.object({
  name: z.string().min(1),
  dose: z.string().optional(),
  frequency: z.string().optional(),
});

export function registerMedicationCoreRoutes(
  router: Router,
  options: RegisterMedicationCoreRoutesOptions,
): void {
  const {
    getMedicationDomainService,
    getDefaultReminderTimes,
    getUserTimezone,
    medicationNameMaxLength,
    medicationDoseMaxLength,
    medicationFrequencyMaxLength,
    medicationNotesMaxLength,
  } = options;

  /**
   * POST /v1/meds
   * Create a new medication
   */
  router.post('/', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const medicationService = getMedicationDomainService();

      // Validate request body
      const data = createMedicationSchema.parse(req.body);
      const medicationName = sanitizePlainText(data.name, medicationNameMaxLength);
      const medicationDose = sanitizePlainText(data.dose, medicationDoseMaxLength);
      const medicationFrequency = sanitizePlainText(data.frequency, medicationFrequencyMaxLength);
      const medicationNotes = sanitizePlainText(data.notes, medicationNotesMaxLength);

      if (!medicationName) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Medication name is required',
        });
        return;
      }

      // Run medication safety checks BEFORE creating
      // Uses AI-powered comprehensive checks (1-2 seconds)
      const warnings = await runMedicationSafetyChecks(
        userId,
        {
          name: medicationName,
          dose: medicationDose,
          frequency: medicationFrequency,
        },
        { useAI: true }, // Enable AI for comprehensive safety checks
      );

      functions.logger.info(
        `[medications] Safety checks completed for ${medicationName}: ${warnings.length} warnings found`,
        { warnings },
      );

      // Determine if medication needs confirmation based on warning severity
      const hasCriticalWarnings = warnings.some((w: MedicationSafetyWarning) => w.severity === 'critical' || w.severity === 'high');

      // Remove undefined fields from warnings (Firestore doesn't accept undefined)
      const cleanedWarnings = warnings.map((w) => {
        const cleaned: any = {
          type: w.type,
          severity: w.severity,
          message: w.message,
          details: w.details,
          recommendation: w.recommendation,
        };
        if (w.conflictingMedication !== undefined) {
          cleaned.conflictingMedication = w.conflictingMedication;
        }
        if (w.allergen !== undefined) {
          cleaned.allergen = w.allergen;
        }
        return cleaned;
      });

      const now = admin.firestore.Timestamp.now();
      const canonicalName = normalizeMedicationName(medicationName);

      // Create medication document with safety warnings
      const medication = await medicationService.createRecord({
        userId,
        name: medicationName,
        nameLower: medicationName.toLowerCase(),
        canonicalName,
        dose: medicationDose || '',
        frequency: medicationFrequency || '',
        notes: medicationNotes || '',
        active: data.active,
        source: data.source || 'manual',
        sourceVisitId: data.source === 'visit' ? (data.sourceVisitId || null) : null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
        // Add safety warning fields
        medicationWarning: cleanedWarnings.length > 0 ? cleanedWarnings : null,
        needsConfirmation: hasCriticalWarnings,
        medicationStatus: hasCriticalWarnings ? 'pending_review' : null,
      });

      await clearMedicationSafetyCacheForUser(userId);

      // Auto-create medication reminder with smart defaults based on frequency
      const defaultTimes = getDefaultReminderTimes(medicationFrequency);
      let autoCreatedReminder = null;

      if (defaultTimes && data.active !== false) {
        try {
          const userTimezone = await getUserTimezone(userId);
          const reminderTimingPolicy = resolveReminderTimingPolicy({
            medicationName,
            userTimezone,
          });

          const reminder = await medicationService.createReminder({
            userId,
            medicationId: medication.id,
            medicationName,
            medicationDose: medicationDose || undefined,
            times: defaultTimes,
            enabled: true,
            timingMode: reminderTimingPolicy.timingMode,
            anchorTimezone: reminderTimingPolicy.anchorTimezone,
            criticality: reminderTimingPolicy.criticality,
            deletedAt: null,
            deletedBy: null,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
          });

          autoCreatedReminder = {
            id: reminder.id,
            times: defaultTimes,
            enabled: true,
            timingMode: reminderTimingPolicy.timingMode,
            anchorTimezone: reminderTimingPolicy.anchorTimezone,
            criticality: reminderTimingPolicy.criticality,
          };

          functions.logger.info(
            `[medications] Auto-created reminder ${reminder.id} for medication ${medication.id} with times: ${defaultTimes.join(', ')}`,
            {
              timingMode: reminderTimingPolicy.timingMode,
              anchorTimezone: reminderTimingPolicy.anchorTimezone,
              criticality: reminderTimingPolicy.criticality,
            },
          );
        } catch (reminderError) {
          // Don't fail medication creation if reminder fails - just log
          functions.logger.error('[medications] Failed to auto-create reminder:', reminderError);
        }
      } else if (!defaultTimes) {
        functions.logger.info(
          `[medications] Skipped auto-reminder for ${medicationName} - PRN/as-needed frequency`,
        );
      }

      functions.logger.info(
        `[medications] Created medication ${medication.id} for user ${userId} with ${warnings.length} warnings (critical/high: ${hasCriticalWarnings})`,
      );

      const responseData = {
        ...medication,
        source: medication.source || data.source || 'manual',
        sourceVisitId: medication.sourceVisitId || null,
        canonicalName: medication.canonicalName || canonicalName,
        createdAt: medication.createdAt.toDate().toISOString(),
        updatedAt: medication.updatedAt.toDate().toISOString(),
        startedAt: medication.startedAt?.toDate()?.toISOString() || null,
        stoppedAt: medication.stoppedAt?.toDate()?.toISOString() || null,
        changedAt: medication.changedAt?.toDate()?.toISOString() || null,
        lastSyncedAt: medication.lastSyncedAt?.toDate()?.toISOString() || null,
        medicationWarning: medication.medicationWarning || null,
        warningAcknowledgedAt: null, // New medication, not yet acknowledged
        needsConfirmation: medication.needsConfirmation || false,
        medicationStatus: medication.medicationStatus || null,
        autoCreatedReminder,
      };

      functions.logger.info(
        '[medications] Returning response with medicationWarning:',
        { medicationWarning: responseData.medicationWarning },
      );

      res.status(201).json(responseData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid request body',
          details: error.errors,
        });
        return;
      }

      functions.logger.error('[medications] Error creating medication:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to create medication',
      });
    }
  });

  /**
   * PATCH /v1/meds/:id
   * Update a medication
   */
  router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const medId = req.params.id;
      const medicationService = getMedicationDomainService();

      // Validate request body
      const data = updateMedicationSchema.parse(req.body);
      const medicationName = data.name !== undefined
        ? sanitizePlainText(data.name, medicationNameMaxLength)
        : undefined;
      const medicationDose = data.dose !== undefined
        ? sanitizePlainText(data.dose, medicationDoseMaxLength)
        : undefined;
      const medicationFrequency = data.frequency !== undefined
        ? sanitizePlainText(data.frequency, medicationFrequencyMaxLength)
        : undefined;
      const medicationNotes = data.notes !== undefined
        ? sanitizePlainText(data.notes, medicationNotesMaxLength)
        : undefined;

      if (data.name !== undefined && !medicationName) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Medication name is required',
        });
        return;
      }

      const medication = await medicationService.getForUser(userId, medId);
      if (!medication) {
        res.status(404).json({
          code: 'not_found',
          message: 'Medication not found',
        });
        return;
      }

      // If name, dose, or frequency are being updated, re-run safety checks
      let warnings = medication.medicationWarning || [];
      let hasCriticalWarnings = medication.needsConfirmation || false;

      if (data.name !== undefined || data.dose !== undefined || data.frequency !== undefined) {
        // Build the updated medication data for safety check
        const updatedMedData = {
          name: medicationName ?? medication.name,
          dose: medicationDose ?? medication.dose,
          frequency: medicationFrequency ?? medication.frequency,
        };

        // Use AI-powered comprehensive checks
        warnings = await runMedicationSafetyChecks(userId, updatedMedData, {
          useAI: true,
          excludeMedicationId: medId,
        });
        hasCriticalWarnings = warnings.some((w: MedicationSafetyWarning) => w.severity === 'critical' || w.severity === 'high');
      }

      // Update medication - only update fields that are explicitly provided
      const updates: Record<string, any> = {
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (medicationName !== undefined) {
        updates.name = medicationName;
        updates.nameLower = medicationName.toLowerCase();
        updates.canonicalName = normalizeMedicationName(medicationName);
      }
      if (medicationDose !== undefined) updates.dose = medicationDose;
      if (medicationFrequency !== undefined) updates.frequency = medicationFrequency;
      if (medicationNotes !== undefined) updates.notes = medicationNotes;
      if (data.active !== undefined) updates.active = data.active;
      if (data.source !== undefined) updates.source = data.source;
      if (data.sourceVisitId !== undefined) {
        updates.sourceVisitId =
          (data.source ?? medication.source) === 'visit' ? data.sourceVisitId ?? null : null;
      }

      // Update safety warning fields if medication details changed
      if (data.name !== undefined || data.dose !== undefined || data.frequency !== undefined) {
        // Remove undefined fields from warnings (Firestore doesn't accept undefined)
        const cleanedWarnings = warnings.map((w: MedicationSafetyWarning) => {
          const cleaned: any = {
            type: w.type,
            severity: w.severity,
            message: w.message,
            details: w.details,
            recommendation: w.recommendation,
          };
          if (w.conflictingMedication !== undefined) {
            cleaned.conflictingMedication = w.conflictingMedication;
          }
          if (w.allergen !== undefined) {
            cleaned.allergen = w.allergen;
          }
          return cleaned;
        });

        updates.medicationWarning = cleanedWarnings.length > 0 ? cleanedWarnings : null;
        updates.needsConfirmation = hasCriticalWarnings;
        updates.medicationStatus = hasCriticalWarnings ? 'pending_review' : null;
      }

      const updatedMed = await medicationService.updateRecord(medId, updates);
      if (!updatedMed) {
        res.status(404).json({
          code: 'not_found',
          message: 'Medication not found',
        });
        return;
      }

      await clearMedicationSafetyCacheForUser(userId);

      // Sync reminder name/dose if medication name or dose was updated
      if (medicationName !== undefined || medicationDose !== undefined) {
        const reminderUpdates: Record<string, unknown> = {
          updatedAt: admin.firestore.Timestamp.now(),
        };
        if (medicationName !== undefined) {
          reminderUpdates.medicationName = medicationName;
          const userTimezone = await getUserTimezone(userId);
          const reminderTimingPolicy = resolveReminderTimingPolicy({
            medicationName,
            userTimezone,
          });
          reminderUpdates.criticality = reminderTimingPolicy.criticality;
        }
        if (medicationDose !== undefined) {
          reminderUpdates.medicationDose = medicationDose || null;
        }

        const syncedReminderCount = await medicationService.updateRemindersForMedication(
          userId,
          medId,
          reminderUpdates,
        );
        if (syncedReminderCount > 0) {
          functions.logger.info(
            `[medications] Synced name/dose to ${syncedReminderCount} reminder(s) for medication ${medId}`,
          );
        }
      }

      // If frequency changed, update reminder times to match new frequency
      if (medicationFrequency !== undefined && medicationFrequency !== medication.frequency) {
        const newDefaultTimes = getDefaultReminderTimes(medicationFrequency);

        // Only auto-update if we have a clear mapping for the new frequency
        if (newDefaultTimes) {
          const updatedReminderCount = await medicationService.updateRemindersForMedication(
            userId,
            medId,
            {
              times: newDefaultTimes,
              updatedAt: admin.firestore.Timestamp.now(),
            },
          );
          if (updatedReminderCount > 0) {
            functions.logger.info(
              `[medications] Updated reminder times for ${medId} to ${newDefaultTimes.join(', ')} based on new frequency: ${medicationFrequency}`,
            );
          }
        } else if (newDefaultTimes === null) {
          // Frequency changed to PRN/as-needed - disable reminders
          const disabledReminderCount = await medicationService.softDeleteRemindersForMedication(
            userId,
            medId,
            userId,
            admin.firestore.Timestamp.now(),
          );
          if (disabledReminderCount > 0) {
            functions.logger.info(
              `[medications] Disabled reminders for ${medId} - frequency changed to PRN/as-needed`,
            );
          }
        }
      }

      // If medication was stopped (active changed to false), clear pending nudges and reminders
      if (data.active === false && medication.active !== false) {
        const now = admin.firestore.Timestamp.now();
        const { dismissedNudges, disabledReminders } = await medicationService.stopMedicationCascade(
          userId,
          medId,
          userId,
          now,
        );

        if (dismissedNudges > 0) {
          functions.logger.info(
            `[medications] Cleared ${dismissedNudges} pending nudge(s) for stopped medication ${medId}`,
          );
        }

        if (disabledReminders > 0) {
          functions.logger.info(
            `[medications] Disabled ${disabledReminders} reminder(s) for stopped medication ${medId}`,
          );
        }
      }

      functions.logger.info(
        `[medications] Updated medication ${medId} for user ${userId} with ${warnings.length} warnings (critical/high: ${hasCriticalWarnings})`,
      );

      res.json({
        ...updatedMed,
        canonicalName: updatedMed.canonicalName ?? normalizeMedicationName(updatedMed.name),
        createdAt: updatedMed.createdAt.toDate().toISOString(),
        updatedAt: updatedMed.updatedAt.toDate().toISOString(),
        startedAt: updatedMed.startedAt?.toDate()?.toISOString() || null,
        stoppedAt: updatedMed.stoppedAt?.toDate()?.toISOString() || null,
        changedAt: updatedMed.changedAt?.toDate()?.toISOString() || null,
        lastSyncedAt: updatedMed.lastSyncedAt?.toDate()?.toISOString() || null,
        medicationWarning: updatedMed.medicationWarning || null,
        warningAcknowledgedAt: updatedMed.warningAcknowledgedAt?.toDate()?.toISOString() || null,
        needsConfirmation: updatedMed.needsConfirmation || false,
        medicationStatus: updatedMed.medicationStatus || null,
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

      functions.logger.error('[medications] Error updating medication:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to update medication',
      });
    }
  });

  /**
   * POST /v1/meds/:id/acknowledge-warnings
   * Acknowledge non-critical medication warnings (clears badge for moderate/low severity)
   * Critical warnings cannot be acknowledged - they always persist
   */
  router.post('/:id/acknowledge-warnings', requireAuth, async (req: AuthRequest, res) => {
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

      const warnings = medication.medicationWarning || [];

      // Check if there are any non-critical warnings to acknowledge
      const hasNonCriticalWarnings = warnings.some(
        (w: { severity: string }) => w.severity !== 'critical',
      );

      if (!hasNonCriticalWarnings) {
        res.status(200).json({
          acknowledged: false,
          message: 'No non-critical warnings to acknowledge',
        });
        return;
      }

      // Update the medication with acknowledgment timestamp
      const now = admin.firestore.Timestamp.now();
      const updatedMed = await medicationService.updateRecord(medId, {
        warningAcknowledgedAt: now,
        updatedAt: now,
      });
      if (!updatedMed) {
        res.status(404).json({
          code: 'not_found',
          message: 'Medication not found',
        });
        return;
      }

      functions.logger.info(
        `[medications] User ${userId} acknowledged warnings for medication ${medId}`,
      );

      res.json({
        acknowledged: true,
        acknowledgedAt: now.toDate().toISOString(),
      });
    } catch (error) {
      functions.logger.error('[medications] Error acknowledging warnings:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to acknowledge warnings',
      });
    }
  });

  /**
   * POST /v1/meds/safety-check
   * Check medication safety for a proposed medication
   */
  router.post('/safety-check', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;

      // Validate request body
      const data = safetyCheckSchema.parse(req.body);
      const medicationName = sanitizePlainText(data.name, medicationNameMaxLength);
      const medicationDose = sanitizePlainText(data.dose, medicationDoseMaxLength);
      const medicationFrequency = sanitizePlainText(data.frequency, medicationFrequencyMaxLength);

      if (!medicationName) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Medication name is required',
        });
        return;
      }

      // Run safety checks
      const warnings = await runMedicationSafetyChecks(userId, {
        name: medicationName,
        dose: medicationDose,
        frequency: medicationFrequency,
      });

      functions.logger.info(
        `[medications] Safety check for user ${userId}, medication ${medicationName}: ${warnings.length} warnings`,
      );

      res.json({
        medication: {
          name: medicationName,
          dose: medicationDose || undefined,
          frequency: medicationFrequency || undefined,
        },
        warnings,
        safe: warnings.filter(w => w.severity === 'critical' || w.severity === 'high').length === 0,
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

      functions.logger.error('[medications] Error running safety check:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to run safety check',
      });
    }
  });
}
