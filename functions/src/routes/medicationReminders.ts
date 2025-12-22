/**
 * Medication Reminders API Routes
 * 
 * CRUD operations for medication reminders.
 * Patient-controlled reminder times.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';

export const medicationRemindersRouter = Router();

const getDb = () => admin.firestore();
const getRemindersCollection = () => getDb().collection('medicationReminders');
const getMedicationsCollection = () => getDb().collection('medications');

// =============================================================================
// Validation Schemas
// =============================================================================

const createReminderSchema = z.object({
    medicationId: z.string(),
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)), // HH:MM format
});

const updateReminderSchema = z.object({
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)).optional(),
    enabled: z.boolean().optional(),
});

// =============================================================================
// Types
// =============================================================================

interface MedicationReminder {
    id: string;
    userId: string;
    medicationId: string;
    medicationName: string;
    medicationDose?: string;
    times: string[];
    enabled: boolean;
    lastSentAt?: string;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// GET /v1/medication-reminders - List all reminders for user
// =============================================================================

medicationRemindersRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;

        const snapshot = await getRemindersCollection()
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();

        const reminders: MedicationReminder[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                medicationId: data.medicationId,
                medicationName: data.medicationName,
                medicationDose: data.medicationDose,
                times: data.times || [],
                enabled: data.enabled ?? true,
                lastSentAt: data.lastSentAt?.toDate().toISOString(),
                createdAt: data.createdAt?.toDate().toISOString(),
                updatedAt: data.updatedAt?.toDate().toISOString(),
            };
        });

        res.json({ reminders });
    } catch (error) {
        functions.logger.error('[medicationReminders] List failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to fetch reminders',
        });
    }
});

// =============================================================================
// POST /v1/medication-reminders - Create reminder for a medication
// =============================================================================

medicationRemindersRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const data = createReminderSchema.parse(req.body);

        // Verify medication belongs to user
        const medDoc = await getMedicationsCollection().doc(data.medicationId).get();
        if (!medDoc.exists) {
            res.status(404).json({
                code: 'medication_not_found',
                message: 'Medication not found',
            });
            return;
        }

        const medData = medDoc.data()!;
        if (medData.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'Cannot create reminder for another user\'s medication',
            });
            return;
        }

        // Check for existing reminder for this medication
        const existing = await getRemindersCollection()
            .where('userId', '==', userId)
            .where('medicationId', '==', data.medicationId)
            .limit(1)
            .get();

        if (!existing.empty) {
            res.status(409).json({
                code: 'reminder_exists',
                message: 'Reminder already exists for this medication',
                existingReminderId: existing.docs[0].id,
            });
            return;
        }

        const now = admin.firestore.Timestamp.now();

        const reminderData: Record<string, unknown> = {
            userId,
            medicationId: data.medicationId,
            medicationName: medData.name || 'Unknown',
            times: data.times,
            enabled: true,
            createdAt: now,
            updatedAt: now,
        };

        // Only add medicationDose if it exists (Firestore doesn't accept undefined)
        if (medData.dosage) {
            reminderData.medicationDose = medData.dosage;
        }

        const docRef = await getRemindersCollection().add(reminderData);

        functions.logger.info(`[medicationReminders] Created reminder ${docRef.id}`, {
            userId,
            medicationId: data.medicationId,
            times: data.times,
        });

        res.status(201).json({
            id: docRef.id,
            ...reminderData,
            createdAt: now.toDate().toISOString(),
            updatedAt: now.toDate().toISOString(),
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
        functions.logger.error('[medicationReminders] Create failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to create reminder',
        });
    }
});

// =============================================================================
// PUT /v1/medication-reminders/:id - Update reminder
// =============================================================================

medicationRemindersRouter.put('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const reminderId = req.params.id;
        const data = updateReminderSchema.parse(req.body);

        const docRef = getRemindersCollection().doc(reminderId);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({
                code: 'reminder_not_found',
                message: 'Reminder not found',
            });
            return;
        }

        if (doc.data()!.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'Cannot update another user\'s reminder',
            });
            return;
        }

        const updateData: Record<string, unknown> = {
            updatedAt: admin.firestore.Timestamp.now(),
        };

        if (data.times !== undefined) updateData.times = data.times;
        if (data.enabled !== undefined) updateData.enabled = data.enabled;

        await docRef.update(updateData);

        functions.logger.info(`[medicationReminders] Updated reminder ${reminderId}`, {
            userId,
            updates: Object.keys(data),
        });

        res.json({
            id: reminderId,
            ...doc.data(),
            ...updateData,
            updatedAt: (updateData.updatedAt as admin.firestore.Timestamp).toDate().toISOString(),
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
        functions.logger.error('[medicationReminders] Update failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to update reminder',
        });
    }
});

// =============================================================================
// DELETE /v1/medication-reminders/:id - Delete reminder
// =============================================================================

medicationRemindersRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const reminderId = req.params.id;

        const docRef = getRemindersCollection().doc(reminderId);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({
                code: 'reminder_not_found',
                message: 'Reminder not found',
            });
            return;
        }

        if (doc.data()!.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'Cannot delete another user\'s reminder',
            });
            return;
        }

        await docRef.delete();

        functions.logger.info(`[medicationReminders] Deleted reminder ${reminderId}`, { userId });

        res.json({ success: true, message: 'Reminder deleted' });
    } catch (error) {
        functions.logger.error('[medicationReminders] Delete failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to delete reminder',
        });
    }
});

// =============================================================================
// POST /v1/medication-reminders/debug/test-notify - Send test notification
// =============================================================================

medicationRemindersRouter.post('/debug/test-notify', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const { medicationName = 'Test Medication', medicationDose = '10mg' } = req.body;

        // Get user's push tokens
        const tokensSnapshot = await getDb()
            .collection('users')
            .doc(userId)
            .collection('pushTokens')
            .get();

        if (tokensSnapshot.empty) {
            res.status(400).json({
                code: 'no_tokens',
                message: 'No push tokens registered for this user',
            });
            return;
        }

        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

        // Send test notification via Expo Push API
        const messages = tokens.map(token => ({
            to: token,
            title: 'Medication Reminder (Test)',
            body: `Time to take your ${medicationName} (${medicationDose})`,
            data: {
                type: 'medication_reminder',
                medicationId: 'test-med-id',
                medicationName,
                medicationDose,
                reminderId: 'test-reminder-id',
            },
            sound: 'default' as const,
            priority: 'high' as const,
        }));

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        const result = await response.json();

        functions.logger.info('[medicationReminders] Test notification sent', {
            userId,
            tokenCount: tokens.length,
            result
        });

        res.json({
            success: true,
            message: `Sent test notification to ${tokens.length} device(s)`,
            result,
        });
    } catch (error) {
        functions.logger.error('[medicationReminders] Test notify failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to send test notification',
        });
    }
});
