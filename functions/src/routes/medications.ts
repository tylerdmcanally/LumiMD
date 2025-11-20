import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { runMedicationSafetyChecks, MedicationSafetyWarning } from '../services/medicationSafety';
import { clearMedicationSafetyCacheForUser } from '../services/medicationSafetyAI';

export const medicationsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();

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

    // Create medication document with safety warnings
    const medRef = await getDb().collection('medications').add({
      userId,
      name: data.name,
      nameLower: data.name.toLowerCase(),
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

    functions.logger.info(
      `[medications] Created medication ${medRef.id} for user ${userId} with ${warnings.length} warnings (critical/high: ${hasCriticalWarnings})`
    );

    const responseData = {
      id: medRef.id,
      ...medication,
      source: medication.source || data.source || 'manual',
      sourceVisitId: medication.sourceVisitId || null,
      createdAt: medication.createdAt.toDate().toISOString(),
      updatedAt: medication.updatedAt.toDate().toISOString(),
      startedAt: medication.startedAt?.toDate()?.toISOString() || null,
      stoppedAt: medication.stoppedAt?.toDate()?.toISOString() || null,
      changedAt: medication.changedAt?.toDate()?.toISOString() || null,
      lastSyncedAt: medication.lastSyncedAt?.toDate()?.toISOString() || null,
      medicationWarning: medication.medicationWarning || null,
      needsConfirmation: medication.needsConfirmation || false,
      medicationStatus: medication.medicationStatus || null,
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

    functions.logger.info(
      `[medications] Updated medication ${medId} for user ${userId} with ${warnings.length} warnings (critical/high: ${hasCriticalWarnings})`
    );

    res.json({
      id: medId,
      ...updatedMed,
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

