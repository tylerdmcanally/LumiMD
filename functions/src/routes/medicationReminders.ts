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
import {
    requireAuth,
    AuthRequest,
    hasOperatorAccess,
    ensureOperatorAccessOrReject,
    ensureOperatorRestoreReasonOrReject,
} from '../middlewares/auth';
import { ensureResourceOwnerAccessOrReject } from '../middlewares/resourceAccess';
import {
    ReminderCriticality,
    ReminderTimingMode,
    normalizeIanaTimezone,
    resolveReminderTimingPolicy,
    resolveTimezoneOrDefault,
} from '../utils/medicationReminderTiming';
import { sanitizePlainText } from '../utils/inputSanitization';
import {
    RESTORE_REASON_MAX_LENGTH,
    recordRestoreAuditEvent,
} from '../services/restoreAuditService';
import { getMedicationReminderTimingBackfillStatus } from '../services/medicationReminderService';
import { UserDomainService } from '../services/domain/users/UserDomainService';
import { FirestoreUserRepository } from '../services/repositories/users/FirestoreUserRepository';

export const medicationRemindersRouter = Router();

const getDb = () => admin.firestore();
const getRemindersCollection = () => getDb().collection('medicationReminders');
const getMedicationsCollection = () => getDb().collection('medications');
const getUserDomainService = () => new UserDomainService(new FirestoreUserRepository(getDb()));

async function getUserTimezone(userId: string): Promise<string> {
    try {
        const user = await getUserDomainService().getById(userId);
        if (user) {
            return resolveTimezoneOrDefault(user.timezone);
        }
    } catch (error) {
        functions.logger.warn(`[medicationReminders] Could not fetch timezone for user ${userId}:`, error);
    }
    return resolveTimezoneOrDefault(null);
}

// =============================================================================
// Validation Schemas
// =============================================================================

const createReminderSchema = z.object({
    medicationId: z.string(),
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)), // HH:MM format
    timingMode: z.enum(['local', 'anchor']).optional(),
    anchorTimezone: z.string().optional().nullable(),
});

const updateReminderSchema = z.object({
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)).optional(),
    enabled: z.boolean().optional(),
    timingMode: z.enum(['local', 'anchor']).optional(),
    anchorTimezone: z.string().optional().nullable(),
});

const restoreReminderSchema = z.object({
    reason: z.string().max(RESTORE_REASON_MAX_LENGTH).optional(),
});

const DEBUG_MEDICATION_NAME_MAX_LENGTH = 120;
const DEBUG_MEDICATION_DOSE_MAX_LENGTH = 60;

function sanitizeDebugField(value: unknown, fallback: string, maxLength: number): string {
    return sanitizePlainText(value, maxLength) || fallback;
}

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
    timingMode: ReminderTimingMode;
    anchorTimezone: string | null;
    criticality: ReminderCriticality;
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

        const reminders: MedicationReminder[] = snapshot.docs
            .filter((doc) => !doc.data()?.deletedAt)
            .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                medicationId: data.medicationId,
                medicationName: data.medicationName,
                medicationDose: data.medicationDose,
                times: data.times || [],
                enabled: data.enabled ?? true,
                timingMode: data.timingMode === 'anchor' ? 'anchor' : 'local',
                anchorTimezone: data.anchorTimezone ?? null,
                criticality: data.criticality === 'time_sensitive' ? 'time_sensitive' : 'standard',
                lastSentAt: data.lastSentAt?.toDate().toISOString(),
                createdAt: data.createdAt?.toDate().toISOString(),
                updatedAt: data.updatedAt?.toDate().toISOString(),
            };
        });

        res.set('Cache-Control', 'private, max-age=30');
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
// GET /v1/medication-reminders/ops/timing-backfill-status - Operator timing backfill status
// =============================================================================

medicationRemindersRouter.get('/ops/timing-backfill-status', requireAuth, async (req: AuthRequest, res) => {
    try {
        if (!ensureOperatorAccessOrReject(req.user, res)) {
            return;
        }

        const status = await getMedicationReminderTimingBackfillStatus();
        res.set('Cache-Control', 'private, max-age=15');
        res.json(status);
    } catch (error) {
        functions.logger.error('[medicationReminders] Failed to load timing backfill status:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to fetch timing backfill status',
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
        if (!ensureResourceOwnerAccessOrReject(userId, medData, res, {
            resourceName: 'medication',
            forbiddenCode: 'forbidden',
            notFoundCode: 'medication_not_found',
            message: 'Cannot create reminder for another user\'s medication',
            notFoundMessage: 'Medication not found',
        })) {
            return;
        }

        // Check for existing reminder for this medication
        const existing = await getRemindersCollection()
            .where('userId', '==', userId)
            .where('medicationId', '==', data.medicationId)
            .get();

        if (!existing.empty) {
            const activeExisting = existing.docs.find((doc) => !doc.data()?.deletedAt);
            if (!activeExisting) {
                // All existing reminders for this medication are soft-deleted; allow recreation.
            } else {
            res.status(409).json({
                code: 'reminder_exists',
                message: 'Reminder already exists for this medication',
                existingReminderId: activeExisting.id,
            });
            return;
            }
        }

        if (
            data.anchorTimezone !== undefined &&
            data.anchorTimezone !== null &&
            !normalizeIanaTimezone(data.anchorTimezone)
        ) {
            res.status(400).json({
                code: 'validation_failed',
                message: 'Invalid anchor timezone',
            });
            return;
        }

        const now = admin.firestore.Timestamp.now();
        const userTimezone = await getUserTimezone(userId);
        const timingPolicy = resolveReminderTimingPolicy({
            medicationName: medData.name,
            userTimezone,
            requestedTimingMode: data.timingMode,
            requestedAnchorTimezone: data.anchorTimezone,
        });

        const reminderData: Record<string, unknown> = {
            userId,
            medicationId: data.medicationId,
            medicationName: medData.name || 'Unknown',
            times: data.times,
            enabled: true,
            timingMode: timingPolicy.timingMode,
            anchorTimezone: timingPolicy.anchorTimezone,
            criticality: timingPolicy.criticality,
            deletedAt: null,
            deletedBy: null,
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
            timingMode: timingPolicy.timingMode,
            anchorTimezone: timingPolicy.anchorTimezone,
            criticality: timingPolicy.criticality,
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

        if (!ensureResourceOwnerAccessOrReject(userId, doc.data()!, res, {
            resourceName: 'reminder',
            forbiddenCode: 'forbidden',
            notFoundCode: 'reminder_not_found',
            message: 'Cannot update another user\'s reminder',
            notFoundMessage: 'Reminder not found',
        })) {
            return;
        }

        const updateData: Record<string, unknown> = {
            updatedAt: admin.firestore.Timestamp.now(),
        };
        const existingData = doc.data()!;

        if (data.times !== undefined) updateData.times = data.times;
        if (data.enabled !== undefined) updateData.enabled = data.enabled;

        if (
            data.anchorTimezone !== undefined &&
            data.anchorTimezone !== null &&
            !normalizeIanaTimezone(data.anchorTimezone)
        ) {
            res.status(400).json({
                code: 'validation_failed',
                message: 'Invalid anchor timezone',
            });
            return;
        }

        if (
            data.timingMode !== undefined ||
            data.anchorTimezone !== undefined ||
            existingData.timingMode === undefined ||
            existingData.criticality === undefined
        ) {
            const userTimezone = await getUserTimezone(userId);
            const timingPolicy = resolveReminderTimingPolicy({
                medicationName: existingData.medicationName,
                userTimezone,
                requestedTimingMode: data.timingMode ?? existingData.timingMode,
                requestedAnchorTimezone:
                    data.anchorTimezone !== undefined
                        ? data.anchorTimezone
                        : existingData.anchorTimezone,
            });
            updateData.timingMode = timingPolicy.timingMode;
            updateData.anchorTimezone = timingPolicy.anchorTimezone;
            updateData.criticality = timingPolicy.criticality;
        }

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

        if (!ensureResourceOwnerAccessOrReject(userId, doc.data()!, res, {
            resourceName: 'reminder',
            forbiddenCode: 'forbidden',
            notFoundCode: 'reminder_not_found',
            message: 'Cannot delete another user\'s reminder',
            notFoundMessage: 'Reminder not found',
        })) {
            return;
        }

        const now = admin.firestore.Timestamp.now();
        await docRef.update({
            enabled: false,
            deletedAt: now,
            deletedBy: userId,
            updatedAt: now,
        });

        functions.logger.info(`[medicationReminders] Soft deleted reminder ${reminderId}`, { userId });

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
// POST /v1/medication-reminders/:id/restore - Restore reminder
// =============================================================================

medicationRemindersRouter.post('/:id/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const reminderId = req.params.id;
        const isOperator = hasOperatorAccess(req.user);

        const payload = restoreReminderSchema.safeParse(req.body ?? {});
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

        const docRef = getRemindersCollection().doc(reminderId);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({
                code: 'reminder_not_found',
                message: 'Reminder not found',
            });
            return;
        }

        const reminder = doc.data()!;
        if (!ensureResourceOwnerAccessOrReject(userId, reminder, res, {
            resourceName: 'reminder',
            forbiddenCode: 'forbidden',
            notFoundCode: 'reminder_not_found',
            message: 'Cannot restore another user\'s reminder',
            notFoundMessage: 'Reminder not found',
            allowOperator: true,
            isOperator,
            allowDeleted: true,
        })) {
            return;
        }

        if (!ensureOperatorRestoreReasonOrReject({
            actorUserId: userId,
            ownerUserId: reminder.userId,
            isOperator,
            reason: restoreReason,
            res,
        })) {
            return;
        }

        if (!reminder.deletedAt) {
            res.status(409).json({
                code: 'not_deleted',
                message: 'Reminder is not deleted',
            });
            return;
        }

        const medDoc = await getMedicationsCollection().doc(reminder.medicationId).get();
        const medData = medDoc.data();
        if (
            !medDoc.exists ||
            medData?.userId !== reminder.userId ||
            medData?.deletedAt ||
            medData?.active === false
        ) {
            res.status(409).json({
                code: 'medication_inactive',
                message: 'Cannot restore reminder because medication is inactive or unavailable',
            });
            return;
        }

        const now = admin.firestore.Timestamp.now();
        await docRef.update({
            enabled: true,
            deletedAt: null,
            deletedBy: null,
            updatedAt: now,
        });

        try {
            await recordRestoreAuditEvent({
                resourceType: 'medication_reminder',
                resourceId: reminderId,
                ownerUserId: reminder.userId,
                actorUserId: userId,
                actorIsOperator: isOperator,
                reason: restoreReason,
                metadata: {
                    route: 'medicationReminders.restore',
                    medicationId: reminder.medicationId,
                },
                createdAt: now,
            });
        } catch (auditError) {
            functions.logger.error('[medicationReminders] Failed to record restore audit event', {
                reminderId,
                actorUserId: userId,
                ownerUserId: reminder.userId,
                message: auditError instanceof Error ? auditError.message : String(auditError),
            });
        }

        functions.logger.info(`[medicationReminders] Restored reminder ${reminderId}`, { userId });

        res.json({
            success: true,
            id: reminderId,
            restoredBy: userId,
            restoredFor: reminder.userId,
            reason: restoreReason ?? null,
            restoredAt: now.toDate().toISOString(),
        });
    } catch (error) {
        functions.logger.error('[medicationReminders] Restore failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to restore reminder',
        });
    }
});

// =============================================================================
// POST /v1/medication-reminders/debug/test-notify - Send test notification
// =============================================================================

medicationRemindersRouter.post('/debug/test-notify', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const medicationName = sanitizeDebugField(
            req.body?.medicationName,
            'Test Medication',
            DEBUG_MEDICATION_NAME_MAX_LENGTH,
        );
        const medicationDose = sanitizeDebugField(
            req.body?.medicationDose,
            '10mg',
            DEBUG_MEDICATION_DOSE_MAX_LENGTH,
        );

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
            result,
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

// =============================================================================
// POST /v1/medication-reminders/cleanup-orphans - Soft-delete reminders for missing/inactive meds
// =============================================================================

medicationRemindersRouter.post('/cleanup-orphans', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;

        // Get all reminders for this user
        const snapshot = await getRemindersCollection()
            .where('userId', '==', userId)
            .get();

        if (snapshot.empty) {
            res.json({ success: true, message: 'No reminders found', deleted: 0 });
            return;
        }

        // Check each reminder's medication exists
        const orphanRefs: FirebaseFirestore.DocumentReference[] = [];
        for (const doc of snapshot.docs) {
            const reminder = doc.data();
            if (reminder.deletedAt) {
                continue;
            }
            const medDoc = await getMedicationsCollection().doc(reminder.medicationId).get();
            const medData = medDoc.data();

            if (
                !medDoc.exists ||
                medData?.userId !== userId ||
                medData?.deletedAt ||
                medData?.active === false
            ) {
                orphanRefs.push(doc.ref);
            }
        }

        if (orphanRefs.length === 0) {
            res.json({ success: true, message: 'No orphaned reminders found', deleted: 0 });
            return;
        }

        // Soft-delete orphaned reminders
        const now = admin.firestore.Timestamp.now();
        const batch = getDb().batch();
        orphanRefs.forEach((ref) =>
            batch.update(ref, {
                enabled: false,
                deletedAt: now,
                deletedBy: userId,
                updatedAt: now,
            }),
        );
        await batch.commit();

        const orphanIds = orphanRefs.map((ref) => ref.id);
        functions.logger.info(`[medicationReminders] Soft-deleted ${orphanRefs.length} orphaned reminders`, {
            userId,
            orphanedIds: orphanIds,
        });

        res.json({
            success: true,
            message: `Soft-deleted ${orphanRefs.length} orphaned reminder(s)`,
            deleted: orphanRefs.length,
            deletedIds: orphanIds,
        });
    } catch (error) {
        functions.logger.error('[medicationReminders] Cleanup failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to cleanup orphaned reminders',
        });
    }
});
