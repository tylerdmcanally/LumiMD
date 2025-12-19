/**
 * LumiBot Debug Routes
 * 
 * Development/testing endpoints for manually creating and triggering nudges.
 * These should only be accessible in development environments.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import {
    analyzeVisitForNudges,
} from '../services/lumibotAnalyzer';
import {
    hypertensionProtocol,
    diabetesProtocol,
} from '../data/conditionProtocols';
import type { NudgeActionType } from '../types/lumibot';

export const nudgesDebugRouter = Router();

const getDb = () => admin.firestore();
const getNudgesCollection = () => getDb().collection('nudges');

// Check if we're in development mode
const isDevelopment = () => {
    return process.env.FUNCTIONS_EMULATOR === 'true' ||
        process.env.NODE_ENV !== 'production' ||
        process.env.LUMIBOT_DEBUG === 'true';
};

// =============================================================================
// POST /v1/nudges/debug/create - Create immediate test nudge
// =============================================================================

const createTestNudgeSchema = z.object({
    type: z.enum(['condition_tracking', 'medication_checkin', 'introduction']),
    conditionId: z.enum(['hypertension', 'diabetes']).optional(),
    medicationName: z.string().optional(),
    actionType: z.enum(['log_bp', 'log_glucose', 'log_weight', 'confirm_yes_no', 'medication_check', 'symptom_check', 'acknowledge']).optional(),
    // NEW: Allow scheduling for future (in seconds from now)
    scheduledInSeconds: z.number().min(0).max(86400).optional(), // Max 24 hours
});

nudgesDebugRouter.post('/debug/create', requireAuth, async (req: AuthRequest, res) => {
    // Check development mode
    if (!isDevelopment()) {
        res.status(403).json({
            code: 'forbidden',
            message: 'Debug endpoints are only available in development',
        });
        return;
    }

    try {
        const userId = req.user!.uid;
        const data = createTestNudgeSchema.parse(req.body);
        const now = admin.firestore.Timestamp.now();

        // Calculate scheduled time (default: immediate)
        const scheduledDate = data.scheduledInSeconds
            ? new Date(Date.now() + (data.scheduledInSeconds * 1000))
            : now.toDate();
        const scheduledFor = admin.firestore.Timestamp.fromDate(scheduledDate);

        let nudgeData: Record<string, unknown>;

        if (data.type === 'introduction') {
            // Introduction nudge
            nudgeData = {
                userId,
                visitId: 'debug-visit',
                type: 'introduction',
                title: '[TEST] LumiBot is Here to Help',
                message: 'This is a test introduction nudge. Tap to acknowledge!',
                actionType: 'acknowledge',
                scheduledFor,
                sequenceDay: 0,
                sequenceId: `debug_intro_${Date.now()}`,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            };
        } else if (data.type === 'condition_tracking') {
            const protocol = data.conditionId === 'diabetes' ? diabetesProtocol : hypertensionProtocol;
            const actionType: NudgeActionType = data.conditionId === 'diabetes' ? 'log_glucose' : 'log_bp';

            nudgeData = {
                userId,
                visitId: 'debug-visit',
                type: 'condition_tracking',
                conditionId: protocol.id,
                title: `[TEST] ${protocol.name}`,
                message: protocol.nudgeSchedule[0].message,
                actionType: data.actionType || actionType,
                scheduledFor,
                sequenceDay: 1,
                sequenceId: `debug_${Date.now()}`,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            };
        } else {
            // Medication check-in
            const medName = data.medicationName || 'Test Medication';
            nudgeData = {
                userId,
                visitId: 'debug-visit',
                type: 'medication_checkin',
                medicationName: medName,
                title: `[TEST] How is ${medName} going?`,
                message: `Just checking in - how are you feeling on ${medName}? Any side effects or concerns?`,
                actionType: data.actionType || 'medication_check',
                scheduledFor,
                sequenceDay: 1,
                sequenceId: `debug_med_${Date.now()}`,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            };
        }

        const docRef = await getNudgesCollection().add(nudgeData);

        functions.logger.info('[LumiBot Debug] Created test nudge', {
            nudgeId: docRef.id,
            userId,
            type: data.type,
            scheduledInSeconds: data.scheduledInSeconds ?? 0,
        });

        res.status(201).json({
            id: docRef.id,
            message: data.scheduledInSeconds
                ? `Test nudge created, will surface in ${data.scheduledInSeconds}s`
                : 'Test nudge created (immediate)',
            nudge: {
                ...nudgeData,
                id: docRef.id,
                scheduledFor: scheduledDate.toISOString(),
                createdAt: now.toDate().toISOString(),
            },
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

        functions.logger.error('[LumiBot Debug] Error creating test nudge:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to create test nudge',
        });
    }
});

// =============================================================================
// POST /v1/nudges/debug/create-sequence - Create compressed medication sequence
// =============================================================================

const createSequenceSchema = z.object({
    medicationName: z.string().default('Test Medication'),
    // Interval in SECONDS between sequence steps (default: 30s)
    intervalSeconds: z.number().min(10).max(300).default(30),
});

nudgesDebugRouter.post('/debug/create-sequence', requireAuth, async (req: AuthRequest, res) => {
    if (!isDevelopment()) {
        res.status(403).json({
            code: 'forbidden',
            message: 'Debug endpoints are only available in development',
        });
        return;
    }

    try {
        const userId = req.user!.uid;
        const data = createSequenceSchema.parse(req.body);
        const now = admin.firestore.Timestamp.now();
        const medName = data.medicationName;
        const sequenceId = `debug_seq_${Date.now()}`;
        const interval = data.intervalSeconds * 1000; // Convert to ms

        // Compressed medication sequence (normally Day 1, 4, 10, 28)
        const steps = [
            { day: 1, title: 'Prescription Pickup', message: `Have you been able to pick up ${medName} from the pharmacy?`, actionType: 'confirm_yes_no' },
            { day: 4, title: 'Getting Started', message: `How's it going with ${medName}? Have you been able to start taking it?`, actionType: 'confirm_yes_no' },
            { day: 10, title: 'Side Effects Check', message: `You've been on ${medName} for a bit now. Any side effects or concerns?`, actionType: 'medication_check' },
            { day: 28, title: 'Monthly Check-in', message: `It's been a while on ${medName}. How are things going overall?`, actionType: 'medication_check' },
        ];

        const createdNudges: Array<{ id: string; title: string; scheduledIn: string }> = [];

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const scheduledDate = new Date(Date.now() + (i * interval));
            const scheduledFor = admin.firestore.Timestamp.fromDate(scheduledDate);

            const nudgeData = {
                userId,
                visitId: 'debug-visit',
                type: 'medication_checkin',
                medicationName: medName,
                title: `[TEST] ${step.title}`,
                message: step.message,
                actionType: step.actionType,
                scheduledFor,
                sequenceDay: step.day,
                sequenceId,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            };

            const docRef = await getNudgesCollection().add(nudgeData);
            createdNudges.push({
                id: docRef.id,
                title: step.title,
                scheduledIn: `${i * data.intervalSeconds}s`,
            });
        }

        functions.logger.info('[LumiBot Debug] Created compressed sequence', {
            userId,
            medicationName: medName,
            count: createdNudges.length,
            intervalSeconds: data.intervalSeconds,
        });

        res.status(201).json({
            message: `Created ${createdNudges.length} nudges with ${data.intervalSeconds}s intervals`,
            sequenceId,
            medicationName: medName,
            nudges: createdNudges,
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

        functions.logger.error('[LumiBot Debug] Error creating sequence:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to create nudge sequence',
        });
    }
});

// =============================================================================
// POST /v1/nudges/debug/analyze-visit - Re-run analysis on a visit
// =============================================================================

const analyzeVisitSchema = z.object({
    visitId: z.string(),
    useCurrentDate: z.boolean().default(true),
});

nudgesDebugRouter.post('/debug/analyze-visit', requireAuth, async (req: AuthRequest, res) => {
    if (!isDevelopment()) {
        res.status(403).json({
            code: 'forbidden',
            message: 'Debug endpoints are only available in development',
        });
        return;
    }

    try {
        const userId = req.user!.uid;
        const data = analyzeVisitSchema.parse(req.body);

        // Fetch the visit
        const visitDoc = await getDb().collection('visits').doc(data.visitId).get();

        if (!visitDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Visit not found',
            });
            return;
        }

        const visitData = visitDoc.data()!;

        // Verify ownership
        if (visitData.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'Not authorized to access this visit',
            });
            return;
        }

        // Build summary from visit data
        const summary = {
            summary: visitData.summary || '',
            diagnoses: visitData.diagnoses || [],
            medications: visitData.medications || { started: [], changed: [], stopped: [], continued: [] },
            nextSteps: visitData.nextSteps || [],
            imaging: visitData.imaging || [],
            education: visitData.education || [],
        };

        // Run analysis with current date so nudges are created for now
        const visitDate = data.useCurrentDate ? new Date() : visitData.visitDate?.toDate?.() || new Date();

        const result = await analyzeVisitForNudges(
            userId,
            data.visitId,
            summary,
            visitDate
        );

        functions.logger.info('[LumiBot Debug] Re-analyzed visit', {
            visitId: data.visitId,
            userId,
            result,
        });

        res.json({
            message: 'Visit analyzed successfully',
            visitId: data.visitId,
            result,
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

        functions.logger.error('[LumiBot Debug] Error analyzing visit:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to analyze visit',
        });
    }
});

// =============================================================================
// DELETE /v1/nudges/debug/clear - Clear all nudges for user (testing cleanup)
// =============================================================================

nudgesDebugRouter.delete('/debug/clear', requireAuth, async (req: AuthRequest, res) => {
    if (!isDevelopment()) {
        res.status(403).json({
            code: 'forbidden',
            message: 'Debug endpoints are only available in development',
        });
        return;
    }

    try {
        const userId = req.user!.uid;

        const snapshot = await getNudgesCollection()
            .where('userId', '==', userId)
            .get();

        const batch = getDb().batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        functions.logger.info('[LumiBot Debug] Cleared all nudges', {
            userId,
            count: snapshot.docs.length,
        });

        res.json({
            message: `Cleared ${snapshot.docs.length} nudges`,
            count: snapshot.docs.length,
        });
    } catch (error) {
        functions.logger.error('[LumiBot Debug] Error clearing nudges:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to clear nudges',
        });
    }
});

// =============================================================================
// GET /v1/nudges/debug/status - Check debug mode status
// =============================================================================

nudgesDebugRouter.get('/debug/status', requireAuth, async (_req: AuthRequest, res) => {
    res.json({
        debugEnabled: isDevelopment(),
        environment: process.env.NODE_ENV,
        emulator: process.env.FUNCTIONS_EMULATOR === 'true',
        debugFlag: process.env.LUMIBOT_DEBUG === 'true',
    });
});
