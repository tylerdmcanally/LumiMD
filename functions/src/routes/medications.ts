import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import {
  runMedicationSafetyChecks,
  MedicationSafetyWarning,
  normalizeMedicationName,
} from '../services/medicationSafety';
import { clearMedicationSafetyCacheForUser } from '../services/medicationSafetyAI';

export const medicationsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();

/**
 * Map medication frequency string to default reminder times.
 * Returns null if frequency doesn't warrant a reminder (PRN, as needed, etc.)
 */
function getDefaultReminderTimes(frequency?: string): string[] | null {
  if (!frequency) return ['08:00']; // Default morning if no frequency specified

  const freq = frequency.toLowerCase().trim();

  // PRN / as needed - no automatic reminder
  if (freq.includes('prn') || freq.includes('as needed') || freq.includes('when needed')) {
    return null;
  }

  // Once daily patterns
  if (freq.includes('once daily') || freq.includes('once a day') || freq.includes('qd') ||
    freq.includes('daily') || freq === 'qday') {
    // Check for timing hints
    if (freq.includes('morning') || freq.includes('am') || freq.includes('breakfast')) {
      return ['08:00'];
    }
    if (freq.includes('evening') || freq.includes('pm') || freq.includes('night') ||
      freq.includes('bedtime') || freq.includes('dinner')) {
      return ['20:00'];
    }
    return ['08:00']; // Default morning for once daily
  }

  // Twice daily patterns
  if (freq.includes('twice') || freq.includes('bid') || freq.includes('2x') ||
    freq.includes('two times') || freq.includes('every 12')) {
    return ['08:00', '20:00'];
  }

  // Three times daily patterns
  if (freq.includes('three times') || freq.includes('tid') || freq.includes('3x') ||
    freq.includes('every 8')) {
    return ['08:00', '14:00', '20:00'];
  }

  // Four times daily
  if (freq.includes('four times') || freq.includes('qid') || freq.includes('4x') ||
    freq.includes('every 6')) {
    return ['08:00', '12:00', '16:00', '20:00'];
  }

  // Weekly - just one reminder
  if (freq.includes('weekly') || freq.includes('once a week')) {
    return ['08:00'];
  }

  // Default: single morning reminder
  return ['08:00'];
}

// Validation schemas
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

/**
 * GET /v1/meds
 * List all medications for the authenticated user
 */
medicationsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Query medications collection for this user
    const medsSnapshot = await getDb()
      .collection('medications')
      .where('userId', '==', userId)
      .orderBy('name', 'asc')
      .get();

    const medications = medsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Convert Firestore timestamps to ISO strings
        createdAt: data.createdAt?.toDate().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
        startedAt: data.startedAt?.toDate()?.toISOString() || null,
        stoppedAt: data.stoppedAt?.toDate()?.toISOString() || null,
        changedAt: data.changedAt?.toDate()?.toISOString() || null,
        lastSyncedAt: data.lastSyncedAt?.toDate()?.toISOString() || null,
        // Include safety warnings
        medicationWarning: data.medicationWarning || null,
        needsConfirmation: data.needsConfirmation || false,
        medicationStatus: data.medicationStatus || null,
      };
    });

    functions.logger.info(`[medications] Listed ${medications.length} medications for user ${userId}`);
    res.json(medications);
  } catch (error) {
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
medicationsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const medId = req.params.id;

    const medDoc = await getDb().collection('medications').doc(medId).get();

    if (!medDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Medication not found',
      });
      return;
    }

    const medication = medDoc.data()!;

    // Verify ownership
    if (medication.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this medication',
      });
      return;
    }

    res.json({
      id: medDoc.id,
      ...medication,
      createdAt: medication.createdAt?.toDate().toISOString(),
      updatedAt: medication.updatedAt?.toDate().toISOString(),
      startedAt: medication.startedAt?.toDate()?.toISOString() || null,
      stoppedAt: medication.stoppedAt?.toDate()?.toISOString() || null,
      changedAt: medication.changedAt?.toDate()?.toISOString() || null,
      lastSyncedAt: medication.lastSyncedAt?.toDate()?.toISOString() || null,
      medicationWarning: medication.medicationWarning || null,
      needsConfirmation: medication.needsConfirmation || false,
      medicationStatus: medication.medicationStatus || null,
    });
  } catch (error) {
    functions.logger.error('[medications] Error getting medication:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch medication',
    });
  }
});

/**
 * POST /v1/meds
 * Create a new medication
 */
medicationsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Validate request body
    const data = createMedicationSchema.parse(req.body);

    // Run medication safety checks BEFORE creating
    // Uses AI-powered comprehensive checks (1-2 seconds)
    const warnings = await runMedicationSafetyChecks(
      userId,
      {
        name: data.name,
        dose: data.dose,
        frequency: data.frequency,
      },
      { useAI: true } // Enable AI for comprehensive safety checks
    );

    functions.logger.info(
      `[medications] Safety checks completed for ${data.name}: ${warnings.length} warnings found`,
      { warnings }
    );

    // Determine if medication needs confirmation based on warning severity
    const hasCriticalWarnings = warnings.some((w: MedicationSafetyWarning) => w.severity === 'critical' || w.severity === 'high');

    // Remove undefined fields from warnings (Firestore doesn't accept undefined)
    const cleanedWarnings = warnings.map(w => {
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
    const canonicalName = normalizeMedicationName(data.name);

    // Create medication document with safety warnings
    const medRef = await getDb().collection('medications').add({
      userId,
      name: data.name,
      nameLower: data.name.toLowerCase(),
      canonicalName,
      dose: data.dose || '',
      frequency: data.frequency || '',
      notes: data.notes || '',
      active: data.active,
      source: data.source || 'manual',
      sourceVisitId: data.source === 'visit' ? (data.sourceVisitId || null) : null,
      createdAt: now,
      updatedAt: now,
      // Add safety warning fields
      medicationWarning: cleanedWarnings.length > 0 ? cleanedWarnings : null,
      needsConfirmation: hasCriticalWarnings,
      medicationStatus: hasCriticalWarnings ? 'pending_review' : null,
    });

    const medDoc = await medRef.get();
    const medication = medDoc.data()!;

    await clearMedicationSafetyCacheForUser(userId);

    // Auto-create medication reminder with smart defaults based on frequency
    const defaultTimes = getDefaultReminderTimes(data.frequency);
    let autoCreatedReminder = null;

    if (defaultTimes && data.active !== false) {
      try {
        const reminderRef = await getDb().collection('medicationReminders').add({
          userId,
          medicationId: medRef.id,
          medicationName: data.name,
          medicationDose: data.dose || undefined,
          times: defaultTimes,
          enabled: true,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });

        autoCreatedReminder = {
          id: reminderRef.id,
          times: defaultTimes,
          enabled: true,
        };

        functions.logger.info(
          `[medications] Auto-created reminder ${reminderRef.id} for medication ${medRef.id} with times: ${defaultTimes.join(', ')}`
        );
      } catch (reminderError) {
        // Don't fail medication creation if reminder fails - just log
        functions.logger.error('[medications] Failed to auto-create reminder:', reminderError);
      }
    } else if (!defaultTimes) {
      functions.logger.info(
        `[medications] Skipped auto-reminder for ${data.name} - PRN/as-needed frequency`
      );
    }

    functions.logger.info(
      `[medications] Created medication ${medRef.id} for user ${userId} with ${warnings.length} warnings (critical/high: ${hasCriticalWarnings})`
    );

    const responseData = {
      id: medRef.id,
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
      needsConfirmation: medication.needsConfirmation || false,
      medicationStatus: medication.medicationStatus || null,
      autoCreatedReminder: autoCreatedReminder,
    };

    functions.logger.info(
      `[medications] Returning response with medicationWarning:`,
      { medicationWarning: responseData.medicationWarning }
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
medicationsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const medId = req.params.id;

    // Validate request body
    const data = updateMedicationSchema.parse(req.body);

    const medRef = getDb().collection('medications').doc(medId);
    const medDoc = await medRef.get();

    if (!medDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Medication not found',
      });
      return;
    }

    const medication = medDoc.data()!;

    // Verify ownership
    if (medication.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this medication',
      });
      return;
    }

    // If name, dose, or frequency are being updated, re-run safety checks
    let warnings = medication.medicationWarning || [];
    let hasCriticalWarnings = medication.needsConfirmation || false;

    if (data.name !== undefined || data.dose !== undefined || data.frequency !== undefined) {
      // Build the updated medication data for safety check
      const updatedMedData = {
        name: data.name ?? medication.name,
        dose: data.dose ?? medication.dose,
        frequency: data.frequency ?? medication.frequency,
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

    if (data.name !== undefined) {
      updates.name = data.name;
      updates.nameLower = data.name.toLowerCase();
      updates.canonicalName = normalizeMedicationName(data.name);
    }
    if (data.dose !== undefined) updates.dose = data.dose;
    if (data.frequency !== undefined) updates.frequency = data.frequency;
    if (data.notes !== undefined) updates.notes = data.notes;
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

    await medRef.update(updates);

    const updatedDoc = await medRef.get();
    const updatedMed = updatedDoc.data()!;

    await clearMedicationSafetyCacheForUser(userId);

    // If medication was stopped (active changed to false), clear pending nudges and reminders
    if (data.active === false && medication.active !== false) {
      const nudgesSnapshot = await getDb()
        .collection('nudges')
        .where('userId', '==', userId)
        .where('medicationId', '==', medId)
        .where('status', 'in', ['pending', 'active', 'snoozed'])
        .get();

      if (!nudgesSnapshot.empty) {
        const batch = getDb().batch();
        nudgesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        functions.logger.info(`[medications] Cleared ${nudgesSnapshot.size} pending nudge(s) for stopped medication ${medId}`);
      }

      // Also delete medication reminders for stopped medication
      const remindersSnapshot = await getDb()
        .collection('medicationReminders')
        .where('userId', '==', userId)
        .where('medicationId', '==', medId)
        .get();

      if (!remindersSnapshot.empty) {
        const reminderBatch = getDb().batch();
        remindersSnapshot.docs.forEach(doc => reminderBatch.delete(doc.ref));
        await reminderBatch.commit();
        functions.logger.info(`[medications] Deleted ${remindersSnapshot.size} reminder(s) for stopped medication ${medId}`);
      }
    }

    functions.logger.info(
      `[medications] Updated medication ${medId} for user ${userId} with ${warnings.length} warnings (critical/high: ${hasCriticalWarnings})`
    );

    res.json({
      id: medId,
      ...updatedMed,
      canonicalName: updatedMed.canonicalName ?? normalizeMedicationName(updatedMed.name),
      createdAt: updatedMed.createdAt.toDate().toISOString(),
      updatedAt: updatedMed.updatedAt.toDate().toISOString(),
      startedAt: updatedMed.startedAt?.toDate()?.toISOString() || null,
      stoppedAt: updatedMed.stoppedAt?.toDate()?.toISOString() || null,
      changedAt: updatedMed.changedAt?.toDate()?.toISOString() || null,
      lastSyncedAt: updatedMed.lastSyncedAt?.toDate()?.toISOString() || null,
      medicationWarning: updatedMed.medicationWarning || null,
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
 * POST /v1/meds/safety-check
 * Check medication safety for a proposed medication
 */
medicationsRouter.post('/safety-check', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Validate request body
    const data = safetyCheckSchema.parse(req.body);

    // Run safety checks
    const warnings = await runMedicationSafetyChecks(userId, {
      name: data.name,
      dose: data.dose,
      frequency: data.frequency,
    });

    functions.logger.info(
      `[medications] Safety check for user ${userId}, medication ${data.name}: ${warnings.length} warnings`,
    );

    res.json({
      medication: data,
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

/**
 * DELETE /v1/meds/:id
 * Delete a medication
 */
medicationsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const medId = req.params.id;

    const medRef = getDb().collection('medications').doc(medId);
    const medDoc = await medRef.get();

    if (!medDoc.exists) {
      res.status(404).json({
        code: 'not_found',
        message: 'Medication not found',
      });
      return;
    }

    const medication = medDoc.data()!;

    // Verify ownership
    if (medication.userId !== userId) {
      res.status(403).json({
        code: 'forbidden',
        message: 'You do not have access to this medication',
      });
      return;
    }

    // Delete medication
    await medRef.delete();

    // Cascade delete: Remove any reminders for this medication
    const remindersSnapshot = await getDb()
      .collection('medicationReminders')
      .where('userId', '==', userId)
      .where('medicationId', '==', medId)
      .get();

    if (!remindersSnapshot.empty) {
      const batch = getDb().batch();
      remindersSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      functions.logger.info(`[medications] Cascade deleted ${remindersSnapshot.size} reminder(s) for medication ${medId}`);
    }

    // Cascade delete: Remove any nudges for this medication
    const nudgesSnapshot = await getDb()
      .collection('nudges')
      .where('userId', '==', userId)
      .where('medicationId', '==', medId)
      .get();

    if (!nudgesSnapshot.empty) {
      const nudgeBatch = getDb().batch();
      nudgesSnapshot.docs.forEach(doc => nudgeBatch.delete(doc.ref));
      await nudgeBatch.commit();
      functions.logger.info(`[medications] Cascade deleted ${nudgesSnapshot.size} nudge(s) for medication ${medId}`);
    }

    await clearMedicationSafetyCacheForUser(userId);

    functions.logger.info(`[medications] Deleted medication ${medId} for user ${userId}`);

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
 * GET /v1/meds/schedule
 * Get today's medication schedule with taken status
 */
medicationsRouter.get('/schedule/today', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    // Get start and end of today (00:00:00 to 23:59:59)
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all medication reminders for this user
    const remindersSnapshot = await getDb()
      .collection('medicationReminders')
      .where('userId', '==', userId)
      .where('enabled', '==', true)
      .get();

    // Get today's medication logs
    const logsSnapshot = await getDb()
      .collection('medicationLogs')
      .where('userId', '==', userId)
      .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
      .get();

    // Build a map of logged doses: medicationId_time -> log
    const loggedDoses = new Map<string, any>();
    logsSnapshot.docs.forEach(doc => {
      const log = doc.data();
      const key = `${log.medicationId}_${log.scheduledTime || 'any'}`;
      loggedDoses.set(key, { id: doc.id, ...log });
    });

    // Get medication details for each reminder
    const medicationIds = new Set<string>();
    remindersSnapshot.docs.forEach(doc => {
      const reminder = doc.data();
      if (reminder.medicationId) {
        medicationIds.add(reminder.medicationId);
      }
    });

    // Fetch medication details
    const medicationsMap = new Map<string, any>();
    for (const medId of medicationIds) {
      const medDoc = await getDb().collection('medications').doc(medId).get();
      if (medDoc.exists) {
        const med = medDoc.data()!;
        if (med.active !== false) {
          medicationsMap.set(medId, { id: medId, ...med });
        }
      }
    }

    // Build scheduled doses array
    const scheduledDoses: any[] = [];

    remindersSnapshot.docs.forEach(doc => {
      const reminder = doc.data();
      const medication = medicationsMap.get(reminder.medicationId);

      if (!medication) return;

      // Each reminder can have multiple times
      const times = reminder.times || [];
      times.forEach((time: string) => {
        const logKey = `${reminder.medicationId}_${time}`;
        const log = loggedDoses.get(logKey);

        scheduledDoses.push({
          medicationId: reminder.medicationId,
          reminderId: doc.id,
          name: medication.name,
          dose: medication.dose || '',
          scheduledTime: time,
          status: log ? log.action : 'pending',
          logId: log?.id || null,
        });
      });
    });

    // Sort by scheduled time
    scheduledDoses.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

    // Calculate summary
    const taken = scheduledDoses.filter(d => d.status === 'taken').length;
    const skipped = scheduledDoses.filter(d => d.status === 'skipped').length;
    const pending = scheduledDoses.filter(d => d.status === 'pending').length;
    const total = scheduledDoses.length;

    // Find next due dose
    const currentTimeHHMM = now.toTimeString().slice(0, 5);
    const nextDue = scheduledDoses.find(
      d => d.status === 'pending' && d.scheduledTime >= currentTimeHHMM
    );

    functions.logger.info(`[medications] Retrieved schedule for user ${userId}`, {
      total,
      taken,
      pending,
      skipped,
    });

    res.json({
      scheduledDoses,
      summary: { taken, skipped, pending, total },
      nextDue: nextDue ? { name: nextDue.name, time: nextDue.scheduledTime } : null,
    });
  } catch (error) {
    functions.logger.error('[medications] Error fetching schedule:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch medication schedule',
    });
  }
});

/**
 * POST /v1/meds/schedule/mark
 * Quick mark a scheduled dose as taken/skipped
 */
medicationsRouter.post('/schedule/mark', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    const schema = z.object({
      medicationId: z.string().min(1),
      scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
      action: z.enum(['taken', 'skipped']),
    });

    const data = schema.parse(req.body);

    // Get medication info
    const medDoc = await getDb().collection('medications').doc(data.medicationId).get();
    if (!medDoc.exists) {
      res.status(404).json({ code: 'not_found', message: 'Medication not found' });
      return;
    }

    const medication = medDoc.data()!;
    if (medication.userId !== userId) {
      res.status(403).json({ code: 'forbidden', message: 'Not your medication' });
      return;
    }

    const now = admin.firestore.Timestamp.now();

    // Create medication log
    const logRef = await getDb().collection('medicationLogs').add({
      userId,
      medicationId: data.medicationId,
      medicationName: medication.name,
      action: data.action,
      scheduledTime: data.scheduledTime,
      loggedAt: now,
      createdAt: now,
    });

    functions.logger.info(`[medications] Logged ${data.action} for ${medication.name} at ${data.scheduledTime}`);

    res.status(201).json({
      id: logRef.id,
      medicationId: data.medicationId,
      action: data.action,
      scheduledTime: data.scheduledTime,
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

    functions.logger.error('[medications] Error marking dose:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to mark dose',
    });
  }
});

/**
 * POST /v1/meds/schedule/mark-batch
 * Mark multiple scheduled doses at once (Mark All feature)
 */
medicationsRouter.post('/schedule/mark-batch', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    const schema = z.object({
      doses: z.array(z.object({
        medicationId: z.string().min(1),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
      })).min(1).max(20),
      action: z.enum(['taken', 'skipped']),
    });

    const data = schema.parse(req.body);
    const now = admin.firestore.Timestamp.now();
    const results: any[] = [];
    const errors: any[] = [];

    // Process each dose
    for (const dose of data.doses) {
      try {
        const medDoc = await getDb().collection('medications').doc(dose.medicationId).get();
        if (!medDoc.exists) {
          errors.push({ medicationId: dose.medicationId, error: 'not_found' });
          continue;
        }

        const medication = medDoc.data()!;
        if (medication.userId !== userId) {
          errors.push({ medicationId: dose.medicationId, error: 'forbidden' });
          continue;
        }

        const logRef = await getDb().collection('medicationLogs').add({
          userId,
          medicationId: dose.medicationId,
          medicationName: medication.name,
          action: data.action,
          scheduledTime: dose.scheduledTime,
          loggedAt: now,
          createdAt: now,
        });

        results.push({
          id: logRef.id,
          medicationId: dose.medicationId,
          medicationName: medication.name,
          scheduledTime: dose.scheduledTime,
          action: data.action,
        });
      } catch (err) {
        errors.push({ medicationId: dose.medicationId, error: 'failed' });
      }
    }

    functions.logger.info(`[medications] Batch marked ${results.length} doses as ${data.action}`, {
      success: results.length,
      errors: errors.length,
    });

    res.status(201).json({ results, errors });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        code: 'validation_failed',
        message: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    functions.logger.error('[medications] Error batch marking doses:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to batch mark doses',
    });
  }
});

/**
 * POST /v1/meds/schedule/snooze
 * Snooze a medication reminder for a specified duration
 */
medicationsRouter.post('/schedule/snooze', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;

    const schema = z.object({
      medicationId: z.string().min(1),
      scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
      snoozeMinutes: z.enum(['15', '30', '60']),
    });

    const data = schema.parse(req.body);

    // Get medication info
    const medDoc = await getDb().collection('medications').doc(data.medicationId).get();
    if (!medDoc.exists) {
      res.status(404).json({ code: 'not_found', message: 'Medication not found' });
      return;
    }

    const medication = medDoc.data()!;
    if (medication.userId !== userId) {
      res.status(403).json({ code: 'forbidden', message: 'Not your medication' });
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const snoozeUntil = new Date(Date.now() + parseInt(data.snoozeMinutes) * 60 * 1000);

    // Create snooze log
    const logRef = await getDb().collection('medicationLogs').add({
      userId,
      medicationId: data.medicationId,
      medicationName: medication.name,
      action: 'snoozed',
      scheduledTime: data.scheduledTime,
      snoozeMinutes: parseInt(data.snoozeMinutes),
      snoozeUntil: admin.firestore.Timestamp.fromDate(snoozeUntil),
      loggedAt: now,
      createdAt: now,
    });

    functions.logger.info(`[medications] Snoozed ${medication.name} for ${data.snoozeMinutes} minutes`);

    res.status(201).json({
      id: logRef.id,
      medicationId: data.medicationId,
      medicationName: medication.name,
      snoozeMinutes: parseInt(data.snoozeMinutes),
      snoozeUntil: snoozeUntil.toISOString(),
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

    functions.logger.error('[medications] Error snoozing dose:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to snooze dose',
    });
  }
});

/**
 * GET /v1/meds/compliance
 * Get medication compliance summary for the past 7/30 days
 */
medicationsRouter.get('/compliance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.uid;
    const days = parseInt(req.query.days as string) || 7;

    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get all medication reminders for this user
    const remindersSnapshot = await getDb()
      .collection('medicationReminders')
      .where('userId', '==', userId)
      .where('enabled', '==', true)
      .get();

    if (remindersSnapshot.empty) {
      res.json({
        hasReminders: false,
        period: days,
        adherence: 0,
        takenCount: 0,
        expectedCount: 0,
        byMedication: [],
        dailyData: [],
      });
      return;
    }

    // Get all medication logs in the date range
    const logsSnapshot = await getDb()
      .collection('medicationLogs')
      .where('userId', '==', userId)
      .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get();

    // Build map of logs by date and med
    const logsByDateAndMed = new Map<string, Set<string>>();
    logsSnapshot.docs.forEach(doc => {
      const log = doc.data();
      if (log.action !== 'taken') return;

      const logDate = log.loggedAt?.toDate();
      if (!logDate) return;

      const dateKey = logDate.toISOString().slice(0, 10);
      const key = `${dateKey}_${log.medicationId}`;

      if (!logsByDateAndMed.has(key)) {
        logsByDateAndMed.set(key, new Set());
      }
      logsByDateAndMed.get(key)!.add(log.scheduledTime || 'any');
    });

    // Calculate expected doses per medication
    const medicationExpected = new Map<string, { name: string; dosesPerDay: number }>();
    remindersSnapshot.docs.forEach(doc => {
      const reminder = doc.data();
      const times = reminder.times || [];
      medicationExpected.set(reminder.medicationId, {
        name: reminder.medicationName || 'Unknown',
        dosesPerDay: times.length,
      });
    });

    // Calculate daily adherence
    const dailyData: Array<{ date: string; adherence: number; taken: number; expected: number }> = [];
    let totalTaken = 0;
    let totalExpected = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().slice(0, 10);
      let dayTaken = 0;
      let dayExpected = 0;

      medicationExpected.forEach((med, medId) => {
        const key = `${dateKey}_${medId}`;
        const takenTimes = logsByDateAndMed.get(key);
        const taken = takenTimes ? takenTimes.size : 0;
        dayTaken += Math.min(taken, med.dosesPerDay);
        dayExpected += med.dosesPerDay;
      });

      dailyData.push({
        date: dateKey,
        adherence: dayExpected > 0 ? Math.round((dayTaken / dayExpected) * 100) : 0,
        taken: dayTaken,
        expected: dayExpected,
      });

      totalTaken += dayTaken;
      totalExpected += dayExpected;
    }

    // Calculate per-medication adherence
    const byMedication: Array<{ medicationId: string; name: string; adherence: number; taken: number; expected: number }> = [];
    medicationExpected.forEach((med, medId) => {
      let medTaken = 0;
      const medExpected = med.dosesPerDay * days;

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().slice(0, 10);
        const key = `${dateKey}_${medId}`;
        const takenTimes = logsByDateAndMed.get(key);
        medTaken += takenTimes ? Math.min(takenTimes.size, med.dosesPerDay) : 0;
      }

      byMedication.push({
        medicationId: medId,
        name: med.name,
        adherence: medExpected > 0 ? Math.round((medTaken / medExpected) * 100) : 0,
        taken: medTaken,
        expected: medExpected,
      });
    });

    const overallAdherence = totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;

    functions.logger.info(`[medications] Compliance for user ${userId}`, {
      period: days,
      adherence: overallAdherence,
      totalTaken,
      totalExpected,
    });

    res.json({
      hasReminders: true,
      period: days,
      adherence: overallAdherence,
      takenCount: totalTaken,
      expectedCount: totalExpected,
      byMedication,
      dailyData,
    });
  } catch (error) {
    functions.logger.error('[medications] Error fetching compliance:', error);
    res.status(500).json({
      code: 'server_error',
      message: 'Failed to fetch compliance data',
    });
  }
});
