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
// POST /v1/nudges/:id/respond-text - AI-interpreted free-text response
// =============================================================================

import { getLumiBotAIService, PatientTrendContext, FollowUpUrgency } from '../services/lumibotAI';
import { getPatientContext } from '../services/patientContextAggregator';

const freeTextResponseSchema = z.object({
    text: z.string().min(1).max(2000),
});

nudgesRouter.post('/:id/respond-text', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const nudgeId = req.params.id;

        // Validate request body
        const data = freeTextResponseSchema.parse(req.body);

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

        // Get patient context for trends
        let trendContext: PatientTrendContext | undefined;
        try {
            const patientContext = await getPatientContext(userId);
            if (patientContext) {
                // Extract trends
                const bpTrend = patientContext.healthLogTrends?.find(t => t.type === 'bp');
                const glucoseTrend = patientContext.healthLogTrends?.find(t => t.type === 'glucose');

                // Calculate engagement level
                const metrics = patientContext.nudgeMetrics;
                let engagementLevel: 'high' | 'medium' | 'low' = 'medium';
                if (metrics) {
                    const total = metrics.completedLast30Days + metrics.dismissedLast30Days;
                    if (total > 0) {
                        const completionRate = metrics.completedLast30Days / total;
                        engagementLevel = completionRate > 0.7 ? 'high' : completionRate > 0.4 ? 'medium' : 'low';
                    }
                }

                trendContext = {
                    bpTrend: bpTrend?.trend,
                    glucoseTrend: glucoseTrend?.trend,
                    engagementLevel,
                };
            }
        } catch (ctxError) {
            functions.logger.warn('[nudges] Could not fetch patient context for AI:', ctxError);
        }

        // Interpret response with AI
        const aiService = getLumiBotAIService();
        const interpretation = await aiService.interpretUserResponse({
            nudgeContext: {
                nudgeType: nudge.type,
                conditionId: nudge.conditionId,
                medicationName: nudge.medicationName,
                originalMessage: nudge.message,
            },
            userResponse: data.text,
            trendContext,
        });

        // Complete the nudge with the response
        await completeNudge(nudgeId, {
            freeTextResponse: data.text,
            aiInterpretation: interpretation,
        });

        functions.logger.info(`[nudges] Free-text response for nudge ${nudgeId}`, {
            sentiment: interpretation.sentiment,
            followUpNeeded: interpretation.followUpNeeded,
            summary: interpretation.summary,
        });

        // Create follow-up nudge if needed
        let followUpCreated = false;
        if (interpretation.followUpNeeded && interpretation.followUp) {
            try {
                const followUp = interpretation.followUp;
                const scheduledFor = calculateFollowUpDate(followUp.urgency);

                await getDb().collection('nudges').add({
                    userId,
                    visitId: nudge.visitId,
                    type: 'followup',
                    conditionId: nudge.conditionId,
                    medicationName: nudge.medicationName,
                    title: 'Follow-up Check',
                    message: followUp.suggestedMessage ||
                        `Checking back in on you. ${followUp.focusArea ? `Let's talk about ${followUp.focusArea}.` : ''} 💙`,
                    actionType: 'confirm_yes_no',
                    scheduledFor: admin.firestore.Timestamp.fromDate(scheduledFor),
                    sequenceDay: 0,
                    sequenceId: `followup_${nudgeId}_${Date.now()}`,
                    status: 'pending',
                    notificationSent: false,
                    aiGenerated: true,
                    personalizedContext: followUp.reason,
                    sourceNudgeId: nudgeId,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                });

                followUpCreated = true;
                functions.logger.info(`[nudges] Created AI-driven follow-up for nudge ${nudgeId}`, {
                    urgency: followUp.urgency,
                    reason: followUp.reason,
                });
            } catch (followUpError) {
                functions.logger.error('[nudges] Failed to create follow-up nudge:', followUpError);
            }
        }

        // Build response message based on interpretation
        let message = 'Thanks for sharing! 💙';
        if (interpretation.sentiment === 'positive') {
            message = "That's great to hear! Keep up the good work. 💙";
        } else if (interpretation.sentiment === 'negative') {
            message = "Thanks for letting us know. We'll check back in to see how things are going.";
        } else if (interpretation.sentiment === 'concerning') {
            message = "Thank you for sharing. Please consider reaching out to your doctor's office if you have concerns.";
        }

        res.json({
            id: nudgeId,
            status: 'completed',
            message,
            interpretation: {
                sentiment: interpretation.sentiment,
                summary: interpretation.summary,
            },
            followUpScheduled: followUpCreated,
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

        functions.logger.error('[nudges] Error processing free-text response:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to process response',
        });
    }
});

/**
 * Calculate follow-up date based on urgency level.
 */
function calculateFollowUpDate(urgency: FollowUpUrgency): Date {
    const now = new Date();
    switch (urgency) {
        case 'immediate':
            // 30 minutes from now
            now.setMinutes(now.getMinutes() + 30);
            return now;
        case 'same_day':
            // 4 hours from now
            now.setHours(now.getHours() + 4);
            return now;
        case 'next_day':
            now.setDate(now.getDate() + 1);
            now.setHours(10, 0, 0, 0); // 10 AM next day
            return now;
        case '3_days':
            now.setDate(now.getDate() + 3);
            now.setHours(10, 0, 0, 0);
            return now;
        case '1_week':
            now.setDate(now.getDate() + 7);
            now.setHours(10, 0, 0, 0);
            return now;
        default:
            now.setDate(now.getDate() + 1);
            return now;
    }
}


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
