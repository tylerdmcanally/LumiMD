/**
 * LumiBot Nudges API Routes
 * 
 * Endpoints for managing nudges (get active, complete, snooze, dismiss).
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import {
    getActiveNudgesForUser,
    completeNudge,
    snoozeNudge,
    dismissNudge,
} from '../services/lumibotAnalyzer';
import { NudgeResponse } from '../types/lumibot';

export const nudgesRouter = Router();

const getDb = () => admin.firestore();

// =============================================================================
// Validation Schemas
// =============================================================================

const updateNudgeSchema = z.object({
    status: z.enum(['completed', 'snoozed', 'dismissed']),
    snoozeDays: z.number().min(1).max(7).optional(),
    responseValue: z.union([z.string(), z.record(z.unknown())]).optional(),
});

const respondToNudgeSchema = z.object({
    response: z.enum(['yes', 'no', 'good', 'having_issues']),
    note: z.string().optional(),
    sideEffects: z.array(z.string()).optional(), // Side effect IDs when having_issues
});

// =============================================================================
// GET /v1/nudges - Get active nudges for user
// =============================================================================

nudgesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;

        const nudges = await getActiveNudgesForUser(userId);

        // Transform to response format
        const response: NudgeResponse[] = nudges.map(nudge => ({
            id: nudge.id!,
            userId: nudge.userId,
            visitId: nudge.visitId,
            type: nudge.type,
            conditionId: nudge.conditionId,
            medicationId: nudge.medicationId,
            medicationName: nudge.medicationName,
            title: nudge.title,
            message: nudge.message,
            actionType: nudge.actionType,
            scheduledFor: nudge.scheduledFor.toDate().toISOString(),
            sequenceDay: nudge.sequenceDay,
            status: nudge.status,
            createdAt: nudge.createdAt.toDate().toISOString(),
        }));

        functions.logger.info(`[nudges] Retrieved ${response.length} active nudges for user ${userId}`);
        res.json(response);
    } catch (error) {
        functions.logger.error('[nudges] Error fetching nudges:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch nudges',
        });
    }
});

// =============================================================================
// PATCH /v1/nudges/:id - Update nudge status
// =============================================================================

nudgesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const nudgeId = req.params.id;

        // Validate request body
        const data = updateNudgeSchema.parse(req.body);

        // Verify nudge belongs to user
        const nudgeRef = getDb().collection('nudges').doc(nudgeId);
        const nudgeDoc = await nudgeRef.get();

        if (!nudgeDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Nudge not found',
            });
            return;
        }

        const nudge = nudgeDoc.data()!;
        if (nudge.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this nudge',
            });
            return;
        }

        // Update based on status
        switch (data.status) {
            case 'completed':
                await completeNudge(nudgeId, data.responseValue);
                break;
            case 'snoozed':
                await snoozeNudge(nudgeId, data.snoozeDays || 1);
                break;
            case 'dismissed':
                await dismissNudge(nudgeId);
                break;
        }

        functions.logger.info(`[nudges] Updated nudge ${nudgeId} to status ${data.status}`);

        res.json({
            id: nudgeId,
            status: data.status,
            message: 'Nudge updated successfully',
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

        functions.logger.error('[nudges] Error updating nudge:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to update nudge',
        });
    }
});

// =============================================================================
// POST /v1/nudges/:id/respond - Submit response to nudge
// =============================================================================

nudgesRouter.post('/:id/respond', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const nudgeId = req.params.id;

        // Validate request body
        const data = respondToNudgeSchema.parse(req.body);

        // Verify nudge belongs to user
        const nudgeRef = getDb().collection('nudges').doc(nudgeId);
        const nudgeDoc = await nudgeRef.get();

        if (!nudgeDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Nudge not found',
            });
            return;
        }

        const nudge = nudgeDoc.data()!;
        if (nudge.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this nudge',
            });
            return;
        }

        // Complete the nudge with the response
        await completeNudge(nudgeId, {
            response: data.response,
            note: data.note,
            sideEffects: data.sideEffects,
        });

        functions.logger.info(`[nudges] Nudge ${nudgeId} responded with ${data.response}`);

        // Return appropriate message based on response
        let message = 'Thanks for letting us know!';
        if (data.response === 'yes' || data.response === 'good') {
            message = 'Great! Thanks for the update. 💙';
        } else if (data.response === 'having_issues') {
            message = 'Thanks for sharing. This is worth mentioning to your doctor at your next visit.';
        }

        res.json({
            id: nudgeId,
            status: 'completed',
            message,
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

        functions.logger.error('[nudges] Error responding to nudge:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to respond to nudge',
        });
    }
});

// =============================================================================
// GET /v1/nudges/history - Get completed nudges history
// =============================================================================

nudgesRouter.get('/history', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

        const snapshot = await getDb()
            .collection('nudges')
            .where('userId', '==', userId)
            .where('status', 'in', ['completed', 'dismissed'])
            .orderBy('updatedAt', 'desc')
            .limit(limit)
            .get();

        const response: NudgeResponse[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                visitId: data.visitId,
                type: data.type,
                conditionId: data.conditionId,
                medicationId: data.medicationId,
                medicationName: data.medicationName,
                title: data.title,
                message: data.message,
                actionType: data.actionType,
                scheduledFor: data.scheduledFor?.toDate().toISOString(),
                sequenceDay: data.sequenceDay,
                status: data.status,
                createdAt: data.createdAt?.toDate().toISOString(),
            };
        });

        functions.logger.info(`[nudges] Retrieved ${response.length} history nudges for user ${userId}`);
        res.json(response);
    } catch (error) {
        functions.logger.error('[nudges] Error fetching nudge history:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch nudge history',
        });
    }
});

// =============================================================================
// POST /v1/nudges/process-due - Cloud Scheduler endpoint to send notifications
// =============================================================================

import { processAndNotifyDueNudges } from '../services/nudgeNotificationService';

const SCHEDULER_TOKEN = process.env.NUDGE_SCHEDULER_TOKEN;

nudgesRouter.post('/process-due', async (req, res) => {
    try {
        // Verify scheduler token
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!SCHEDULER_TOKEN) {
            functions.logger.warn('[nudges] NUDGE_SCHEDULER_TOKEN not configured, allowing request');
        } else if (token !== SCHEDULER_TOKEN) {
            functions.logger.warn('[nudges] Invalid scheduler token');
            res.status(401).json({
                code: 'unauthorized',
                message: 'Invalid scheduler token',
            });
            return;
        }

        const result = await processAndNotifyDueNudges();

        functions.logger.info('[nudges] Processed due nudges', result);
        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        functions.logger.error('[nudges] Error processing due nudges:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to process due nudges',
        });
    }
});
