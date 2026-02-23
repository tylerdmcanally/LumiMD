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
import { ensureResourceOwnerAccessOrReject } from '../middlewares/resourceAccess';
import { NudgeResponse } from '../types/lumibot';
import { sanitizePlainText } from '../utils/inputSanitization';
import { NudgeDomainService } from '../services/domain/nudges/NudgeDomainService';
import { MedicationDomainService } from '../services/domain/medications/MedicationDomainService';
import { FirestoreNudgeRepository } from '../services/repositories/nudges/FirestoreNudgeRepository';
import { FirestoreMedicationRepository } from '../services/repositories/medications/FirestoreMedicationRepository';

export const nudgesRouter = Router();

const getDb = () => admin.firestore();
const getNudgeDomainService = () => new NudgeDomainService(new FirestoreNudgeRepository(getDb()));
const getMedicationDomainService = () =>
    new MedicationDomainService(new FirestoreMedicationRepository(getDb()));
const NUDGE_NOTE_MAX_LENGTH = 1000;
const NUDGE_SIDE_EFFECT_MAX_ITEMS = 20;
const NUDGE_SIDE_EFFECT_ITEM_MAX_LENGTH = 120;
const NUDGE_FREE_TEXT_MAX_LENGTH = 2000;

// =============================================================================
// Validation Schemas
// =============================================================================

const updateNudgeSchema = z.object({
    status: z.enum(['completed', 'snoozed', 'dismissed']),
    snoozeDays: z.number().min(1).max(7).optional(),
    responseValue: z.union([z.string(), z.record(z.unknown())]).optional(),
});

const respondToNudgeSchema = z.object({
    response: z.enum([
        // Pickup check
        'got_it', 'not_yet',
        // Started check
        'taking_it', 'having_trouble',
        // Feeling/side effects
        'good', 'okay', 'issues',
        'none', 'mild', 'concerning',
    ]),
    note: z.string().optional(),
    sideEffects: z.array(z.string()).optional(), // Side effect IDs when having_issues
});

// =============================================================================
// GET /v1/nudges - Get active nudges for user
// =============================================================================

nudgesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const nudgeService = getNudgeDomainService();

        const nudges = await nudgeService.listActiveByUser(userId, {
            now: admin.firestore.Timestamp.now(),
            limit: 10,
        });

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
        res.set('Cache-Control', 'private, max-age=30');
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
        const nudgeService = getNudgeDomainService();

        // Validate request body
        const parsedData = updateNudgeSchema.parse(req.body);
        const data = {
            ...parsedData,
            ...(typeof parsedData.responseValue === 'string'
                ? { responseValue: sanitizePlainText(parsedData.responseValue, NUDGE_FREE_TEXT_MAX_LENGTH) }
                : {}),
        };

        // Verify nudge belongs to user
        const nudge = await nudgeService.getById(nudgeId);

        if (
            !ensureResourceOwnerAccessOrReject(userId, nudge, res, {
                resourceName: 'nudge',
                notFoundMessage: 'Nudge not found',
            })
        ) {
            return;
        }

        // Update based on status
        const now = admin.firestore.Timestamp.now();
        switch (data.status) {
            case 'completed': {
                await nudgeService.completeById(nudgeId, {
                    now,
                    responseValue: data.responseValue,
                });
                break;
            }
            case 'snoozed': {
                const snoozedUntil = new Date();
                snoozedUntil.setDate(snoozedUntil.getDate() + (data.snoozeDays || 1));
                await nudgeService.snoozeById(nudgeId, {
                    now,
                    snoozedUntil: admin.firestore.Timestamp.fromDate(snoozedUntil),
                });
                break;
            }
            case 'dismissed': {
                await nudgeService.dismissById(nudgeId, {
                    now,
                });
                break;
            }
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
        const nudgeService = getNudgeDomainService();

        // Validate request body
        const parsedData = respondToNudgeSchema.parse(req.body);
        const note = sanitizePlainText(parsedData.note, NUDGE_NOTE_MAX_LENGTH);
        const sideEffects = sanitizeStringArray(parsedData.sideEffects);
        const data = {
            ...parsedData,
            ...(note ? { note } : {}),
            ...(sideEffects.length > 0 ? { sideEffects } : {}),
        };

        // Verify nudge belongs to user
        const nudge = await nudgeService.getById(nudgeId);

        if (
            !ensureResourceOwnerAccessOrReject(userId, nudge, res, {
                resourceName: 'nudge',
                notFoundMessage: 'Nudge not found',
            })
        ) {
            return;
        }
        const nudgeData = nudge as Record<string, any>;

        // Complete the nudge with the response
        await nudgeService.completeById(nudgeId, {
            now: admin.firestore.Timestamp.now(),
            responseValue: {
                response: data.response,
                note: data.note,
                sideEffects: data.sideEffects,
            },
        });

        functions.logger.info(`[nudges] Nudge ${nudgeId} responded with ${data.response}`);

        // =========================================================================
        // SMART TIMING: Adjust future nudges based on response
        // =========================================================================

        // Positive response on key milestones → patient is doing well, skip remaining check-ins
        const positiveResponses = ['taking_it', 'good', 'none'];
        const concerningResponses = ['having_trouble', 'issues', 'concerning'];

        if (
            positiveResponses.includes(data.response) &&
            nudgeData.sequenceId &&
            nudgeData.medicationName
        ) {
            // Skip remaining pending nudges in this sequence - patient confirmed they're on track
            try {
                const pendingNudges = await nudgeService.listByUserAndSequence(
                    userId,
                    nudgeData.sequenceId as string,
                    ['pending', 'snoozed'],
                );

                if (pendingNudges.length > 0) {
                    const now = admin.firestore.Timestamp.now();
                    const pendingNudgeIds = pendingNudges.map((pendingNudge) => pendingNudge.id);
                    const dismissResult = await nudgeService.dismissByIds(pendingNudgeIds, {
                        now,
                    });

                    functions.logger.info(
                        `[nudges] Smart skip: dismissed ${dismissResult.updatedCount} remaining nudges for ${nudgeData.medicationName} after positive response`
                    );
                }
            } catch (skipErr) {
                functions.logger.error('[nudges] Error skipping remaining nudges:', skipErr);
            }
        } else if (concerningResponses.includes(data.response) && nudgeData.medicationName) {
            // Concerning response → schedule a follow-up check in 3 days
            try {
                const followUpDate = new Date();
                followUpDate.setDate(followUpDate.getDate() + 3);
                const now = admin.firestore.Timestamp.now();

                await nudgeService.createRecord({
                    userId,
                    visitId: nudgeData.visitId,
                    type: 'followup',
                    medicationName: nudgeData.medicationName,
                    medicationId: nudgeData.medicationId || null,
                    title: `Following up on ${nudgeData.medicationName}`,
                    message: `How are things going with ${nudgeData.medicationName}? Any updates since you mentioned having some issues?`,
                    actionType: 'feeling_check',
                    scheduledFor: admin.firestore.Timestamp.fromDate(followUpDate),
                    sequenceDay: 0,
                    sequenceId: `followup_${nudgeId}`,
                    status: 'pending',
                    createdAt: now,
                    updatedAt: now,
                });
                functions.logger.info(
                    `[nudges] Smart follow-up: created 3-day check-in for ${nudgeData.medicationName} after concerning response`
                );
            } catch (followUpErr) {
                functions.logger.error('[nudges] Error creating follow-up nudge:', followUpErr);
            }
        }

        // Return appropriate message based on response
        let message = 'Thanks for letting us know!';
        // Positive responses
        if (['got_it', 'taking_it', 'good', 'none'].includes(data.response)) {
            message = 'Great! Thanks for the update.';
            // Not yet responses
        } else if (data.response === 'not_yet') {
            message = 'No worries! We\'ll check in again soon.';
            // Neutral responses
        } else if (['okay', 'mild'].includes(data.response)) {
            message = 'Thanks for the update. Let us know if anything changes.';
            // Concerning responses
        } else if (['having_trouble', 'issues', 'concerning'].includes(data.response)) {
            message = 'This is worth mentioning to your doctor at your next visit. We\'ll check in again soon.';
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
    text: z.string().min(1).max(NUDGE_FREE_TEXT_MAX_LENGTH),
});

function sanitizeStringArray(
    values: unknown,
    maxLength = NUDGE_SIDE_EFFECT_ITEM_MAX_LENGTH,
    maxItems = NUDGE_SIDE_EFFECT_MAX_ITEMS,
): string[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .slice(0, maxItems)
        .map((value) => sanitizePlainText(value, maxLength))
        .filter((value) => value.length > 0);
}

nudgesRouter.post('/:id/respond-text', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const nudgeId = req.params.id;
        const nudgeService = getNudgeDomainService();

        // Validate request body
        const parsedData = freeTextResponseSchema.parse(req.body);
        const sanitizedText = sanitizePlainText(parsedData.text, NUDGE_FREE_TEXT_MAX_LENGTH);
        if (!sanitizedText) {
            res.status(400).json({
                code: 'validation_failed',
                message: 'Response text is required',
            });
            return;
        }
        const data = { ...parsedData, text: sanitizedText };

        // Verify nudge belongs to user
        const nudge = await nudgeService.getById(nudgeId);

        if (
            !ensureResourceOwnerAccessOrReject(userId, nudge, res, {
                resourceName: 'nudge',
                notFoundMessage: 'Nudge not found',
            })
        ) {
            return;
        }
        const nudgeData = nudge as Record<string, any>;

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
                nudgeType: nudgeData.type,
                conditionId: nudgeData.conditionId,
                medicationName: nudgeData.medicationName,
                originalMessage: nudgeData.message,
            },
            userResponse: data.text,
            trendContext,
        });

        // Complete the nudge with the response
        await nudgeService.completeById(nudgeId, {
            now: admin.firestore.Timestamp.now(),
            responseValue: {
                freeTextResponse: data.text,
                aiInterpretation: interpretation,
            },
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
                const now = admin.firestore.Timestamp.now();

                await nudgeService.createRecord({
                    userId,
                    visitId: nudgeData.visitId,
                    type: 'followup',
                    conditionId: nudgeData.conditionId,
                    medicationName: nudgeData.medicationName,
                    title: 'Follow-up Check',
                    message: followUp.suggestedMessage ||
                        `Checking back in on you. ${followUp.focusArea ? `Let's talk about ${followUp.focusArea}.` : ''}`,
                    actionType: 'feeling_check',
                    scheduledFor: admin.firestore.Timestamp.fromDate(scheduledFor),
                    sequenceDay: 0,
                    sequenceId: `followup_${nudgeId}_${Date.now()}`,
                    status: 'pending',
                    notificationSent: false,
                    aiGenerated: true,
                    personalizedContext: followUp.reason,
                    sourceNudgeId: nudgeId,
                    createdAt: now,
                    updatedAt: now,
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
        let message = 'Thanks for sharing!';
        if (interpretation.sentiment === 'positive') {
            message = "That's great to hear! Keep up the good work.";
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
        const nudgeService = getNudgeDomainService();
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

        const history = await nudgeService.listHistoryByUser(userId, limit);

        const response: NudgeResponse[] = history.map((nudge) => {
            const data = nudge as any;
            return {
                id: nudge.id,
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
        res.set('Cache-Control', 'private, max-age=30');
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
            functions.logger.error('[nudges] NUDGE_SCHEDULER_TOKEN not configured - rejecting request');
            res.status(500).json({
                code: 'configuration_error',
                message: 'Scheduler token not configured',
            });
            return;
        }
        
        if (token !== SCHEDULER_TOKEN) {
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

// =============================================================================
// POST /v1/nudges/cleanup-orphans - Delete nudges for discontinued medications
// =============================================================================

nudgesRouter.post('/cleanup-orphans', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const nudgeService = getNudgeDomainService();
        const medicationService = getMedicationDomainService();

        // Get all pending/active nudges with medication references for this user
        const activeNudges = await nudgeService.listByUserAndStatuses(userId, [
            'pending',
            'active',
            'snoozed',
        ]);

        if (activeNudges.length === 0) {
            res.json({ success: true, message: 'No pending nudges found', deleted: 0 });
            return;
        }

        // Get all active medications for this user
        const medications = await medicationService.listAllForUser(userId, {
            includeDeleted: false,
        });

        const activeMedNames = new Set(
            medications
                .filter((medication) => medication.active === true)
                .map((medication) => medication.name)
                .filter((name): name is string => typeof name === 'string' && name.length > 0)
                .map((name) => name.toLowerCase()),
        );

        // Find nudges that reference discontinued medications
        const orphans: string[] = [];
        for (const nudge of activeNudges) {
            const nudgeData = nudge as Record<string, unknown>;

            // Only check nudges that have a medicationName
            if (typeof nudgeData.medicationName === 'string' && nudgeData.medicationName.length > 0) {
                const medNameLower = nudgeData.medicationName.toLowerCase();
                if (!activeMedNames.has(medNameLower)) {
                    orphans.push(nudge.id);
                }
            }
        }

        if (orphans.length === 0) {
            res.json({ success: true, message: 'No orphaned nudges found', deleted: 0 });
            return;
        }

        // Delete orphaned nudges
        const now = admin.firestore.Timestamp.now();
        const dismissResult = await nudgeService.dismissByIds(orphans, {
            now,
            dismissalReason: 'medication_discontinued',
        });

        functions.logger.info(`[nudges] Cleaned up ${dismissResult.updatedCount} orphaned nudges`, {
            userId,
            orphanedIds: orphans,
        });

        res.json({
            success: true,
            message: `Dismissed ${dismissResult.updatedCount} nudge(s) for discontinued medications`,
            deleted: dismissResult.updatedCount,
        });
    } catch (error) {
        functions.logger.error('[nudges] Cleanup failed:', error);
        res.status(500).json({
            code: 'internal_error',
            message: 'Failed to cleanup orphaned nudges',
        });
    }
});
