import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';

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
});

const updateMedicationSchema = z.object({
  name: z.string().min(1).optional(),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
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
    
    const now = admin.firestore.Timestamp.now();
    
    // Create medication document
    const medRef = await getDb().collection('medications').add({
      userId,
      name: data.name,
      nameLower: data.name.toLowerCase(),
      dose: data.dose || '',
      frequency: data.frequency || '',
      notes: data.notes || '',
      active: data.active,
      createdAt: now,
      updatedAt: now,
    });
    
    const medDoc = await medRef.get();
    const medication = medDoc.data()!;
    
    functions.logger.info(`[medications] Created medication ${medRef.id} for user ${userId}`);
    
    res.status(201).json({
      id: medRef.id,
      ...medication,
      createdAt: medication.createdAt.toDate().toISOString(),
      updatedAt: medication.updatedAt.toDate().toISOString(),
      startedAt: medication.startedAt?.toDate()?.toISOString() || null,
      stoppedAt: medication.stoppedAt?.toDate()?.toISOString() || null,
      changedAt: medication.changedAt?.toDate()?.toISOString() || null,
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

    await medRef.update(updates);
    
    const updatedDoc = await medRef.get();
    const updatedMed = updatedDoc.data()!;
    
    functions.logger.info(`[medications] Updated medication ${medId} for user ${userId}`);
    
    res.json({
      id: medId,
      ...updatedMed,
      createdAt: updatedMed.createdAt.toDate().toISOString(),
      updatedAt: updatedMed.updatedAt.toDate().toISOString(),
      startedAt: updatedMed.startedAt?.toDate()?.toISOString() || null,
      stoppedAt: updatedMed.stoppedAt?.toDate()?.toISOString() || null,
      changedAt: updatedMed.changedAt?.toDate()?.toISOString() || null,
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

