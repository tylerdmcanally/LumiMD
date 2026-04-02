/**
 * Care Flow Engine
 *
 * Core logic for advancing care flows. Called by the advanceCareFlows
 * scheduled Cloud Function every 15 minutes.
 *
 * For each due flow:
 * 1. Check if patient already logged → skip touchpoint
 * 2. Check for pending nudge from this flow → don't double-send
 * 3. Determine touchpoint type from phase + template
 * 4. Generate personalized message via intelligentNudgeGenerator
 * 5. Create nudge in nudges/{id} with careFlowId linking back
 * 6. Append touchpoint to flow audit trail
 * 7. Calculate next touchpoint time
 * 8. Check phase transitions
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
    CareFlow,
    CareFlowPhase,
    CareFlowTouchpoint,
    TouchpointType,
    AdvanceCareFlowsResult,
} from '../types/careFlows';
import { getCareFlowTemplate } from '../data/careFlowTemplates';
import { FirestoreCareFlowRepository } from './repositories/careFlows/FirestoreCareFlowRepository';
import { NudgeDomainService } from './domain/nudges/NudgeDomainService';
import { FirestoreNudgeRepository } from './repositories/nudges/FirestoreNudgeRepository';
import { HealthLogDomainService } from './domain/healthLogs/HealthLogDomainService';
import { FirestoreHealthLogRepository } from './repositories/healthLogs/FirestoreHealthLogRepository';
import { UserDomainService } from './domain/users/UserDomainService';
import { FirestoreUserRepository } from './repositories/users/FirestoreUserRepository';
import { resolveNotificationPreferences, isInQuietHours } from './notificationPreferences';

const getDb = () => admin.firestore();

// =============================================================================
// Configuration
// =============================================================================

const MAX_TOUCHPOINTS_PER_RUN = 100;
const MAX_DAILY_NUDGES_PER_USER = 3;
// Max 1 touchpoint per flow per day — enforced in processFlow

// =============================================================================
// Main Engine Function
// =============================================================================

export async function advanceCareFlows(): Promise<AdvanceCareFlowsResult> {
    const db = getDb();
    const careFlowRepo = new FirestoreCareFlowRepository(db);
    const nudgeService = new NudgeDomainService(new FirestoreNudgeRepository(db));
    const healthLogService = new HealthLogDomainService(new FirestoreHealthLogRepository(db));
    const userService = new UserDomainService(new FirestoreUserRepository(db));

    const now = admin.firestore.Timestamp.now();
    const result: AdvanceCareFlowsResult = {
        flowsProcessed: 0,
        touchpointsCreated: 0,
        skippedAlreadyLogged: 0,
        skippedPendingNudge: 0,
        phaseTransitions: 0,
        errors: 0,
    };

    try {
        const dueFlows = await careFlowRepo.listDueActiveFlows(now, MAX_TOUCHPOINTS_PER_RUN);

        if (dueFlows.length === 0) {
            functions.logger.info('[CareFlowEngine] No due flows to process');
            return result;
        }

        functions.logger.info(`[CareFlowEngine] Processing ${dueFlows.length} due flow(s)`);

        // Track daily nudge count per user to enforce limit
        const dailyNudgeCounts = new Map<string, number>();

        for (const flow of dueFlows) {
            try {
                await processFlow(flow, {
                    careFlowRepo,
                    nudgeService,
                    healthLogService,
                    userService,
                    now,
                    result,
                    dailyNudgeCounts,
                });
                result.flowsProcessed++;
            } catch (error) {
                result.errors++;
                functions.logger.error(
                    `[CareFlowEngine] Error processing flow ${flow.id}:`,
                    error,
                );
            }
        }

        functions.logger.info('[CareFlowEngine] Processing complete', result);
        return result;
    } catch (error) {
        functions.logger.error('[CareFlowEngine] Fatal error:', error);
        throw error;
    }
}

// =============================================================================
// Flow Processing
// =============================================================================

interface ProcessContext {
    careFlowRepo: FirestoreCareFlowRepository;
    nudgeService: NudgeDomainService;
    healthLogService: HealthLogDomainService;
    userService: UserDomainService;
    now: FirebaseFirestore.Timestamp;
    result: AdvanceCareFlowsResult;
    dailyNudgeCounts: Map<string, number>;
}

async function processFlow(flow: CareFlow, ctx: ProcessContext): Promise<void> {
    const template = getCareFlowTemplate(flow.condition);
    if (!template) {
        functions.logger.warn(`[CareFlowEngine] No template for condition ${flow.condition}, skipping flow ${flow.id}`);
        return;
    }

    // Check for stale (no-response) touchpoints
    const lastTp = flow.touchpoints[flow.touchpoints.length - 1];
    if (lastTp && lastTp.outcome === 'pending' && lastTp.deliveredAt) {
        const daysSinceDelivery = Math.floor(
            (ctx.now.toDate().getTime() - lastTp.deliveredAt.toDate().getTime()) / (1000 * 60 * 60 * 24),
        );
        const noResponseThreshold = template.cadenceRules.escalateAfterNoResponse || 14;

        if (daysSinceDelivery >= noResponseThreshold) {
            functions.logger.info(
                `[CareFlowEngine] No response for ${daysSinceDelivery} days on flow ${flow.id}, marking stale`,
            );

            // Mark the stale touchpoint
            const updatedTouchpoints = [...flow.touchpoints];
            updatedTouchpoints[updatedTouchpoints.length - 1] = {
                ...lastTp,
                outcome: 'no_response',
            };

            // Tighten cadence (same as concerning response)
            const newCadence = { ...flow.cadence };
            newCadence.consecutiveNormalCount = 0;
            newCadence.currentIntervalDays = Math.max(
                template.cadenceRules.minInterval,
                Math.round(newCadence.currentIntervalDays / 2),
            );
            newCadence.lastEscalationReason = 'no_response';

            // Schedule next touchpoint soon (re-engage)
            const nextAt = new Date(ctx.now.toDate());
            nextAt.setDate(nextAt.getDate() + newCadence.currentIntervalDays);
            nextAt.setHours(9, 0, 0, 0);

            await ctx.careFlowRepo.update(flow.id, {
                touchpoints: updatedTouchpoints,
                cadence: newCadence,
                nextTouchpointAt: admin.firestore.Timestamp.fromDate(nextAt),
            } as any);

            // Update the in-memory flow so the rest of processing uses fresh state
            flow.touchpoints = updatedTouchpoints;
            flow.cadence = newCadence;
        }
    }

    // Check quiet hours
    try {
        const user = await ctx.userService.getById(flow.userId);
        const prefs = resolveNotificationPreferences(user as Record<string, unknown> | null);
        const timezone = (user as Record<string, unknown> | null)?.timezone as string || 'America/Chicago';
        if (isInQuietHours(new Date(), timezone, prefs)) {
            // Reschedule to next morning (8 AM user time)
            const nextMorning = getNextMorning(timezone);
            await ctx.careFlowRepo.update(flow.id, {
                nextTouchpointAt: admin.firestore.Timestamp.fromDate(nextMorning),
            } as any);
            return;
        }
    } catch {
        // Fail open — proceed if can't check prefs
    }

    // Check daily nudge limit for user
    let userDailyCount = ctx.dailyNudgeCounts.get(flow.userId);
    if (userDailyCount === undefined) {
        userDailyCount = await countTodaysNudgesForUser(ctx.nudgeService, flow.userId, ctx.now);
        ctx.dailyNudgeCounts.set(flow.userId, userDailyCount);
    }
    if (userDailyCount >= MAX_DAILY_NUDGES_PER_USER) {
        // Reschedule to tomorrow
        const tomorrow = new Date(ctx.now.toDate());
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        await ctx.careFlowRepo.update(flow.id, {
            nextTouchpointAt: admin.firestore.Timestamp.fromDate(tomorrow),
        } as any);
        return;
    }

    // Check max 1 touchpoint per flow per day
    const lastTouchpoint = flow.touchpoints[flow.touchpoints.length - 1];
    if (lastTouchpoint?.deliveredAt) {
        const lastDelivered = lastTouchpoint.deliveredAt.toDate();
        const nowDate = ctx.now.toDate();
        if (isSameDay(lastDelivered, nowDate)) {
            // Already delivered today — schedule for tomorrow
            const tomorrow = new Date(nowDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            await ctx.careFlowRepo.update(flow.id, {
                nextTouchpointAt: admin.firestore.Timestamp.fromDate(tomorrow),
            } as any);
            return;
        }
    }

    // Determine touchpoint type
    const touchpointType = determineTouchpointType(flow, template);

    // "Skip if already logged" — check if patient logged the metric we'd ask for
    if (touchpointType === 'log_prompt' || touchpointType === 'combined') {
        const recentLog = await checkRecentLog(
            ctx.healthLogService,
            flow.userId,
            template.metric,
            lastTouchpoint?.scheduledAt || flow.createdAt,
        );

        if (recentLog) {
            ctx.result.skippedAlreadyLogged++;
            // Record as positive outcome, advance cadence
            const touchpoint: CareFlowTouchpoint = {
                type: touchpointType,
                scheduledAt: ctx.now,
                deliveredAt: ctx.now,
                outcome: 'positive',
                phaseAtTime: flow.phase,
                responseSummary: 'Patient logged unprompted',
            };

            const newCadence = { ...flow.cadence };
            newCadence.consecutiveNormalCount++;

            const nextAt = calculateNextTouchpointAt(flow, template, newCadence);

            // Check phase transition
            const newPhase = checkPhaseTransition(flow, newCadence, template);
            if (newPhase && newPhase !== flow.phase) {
                ctx.result.phaseTransitions++;
            }

            await ctx.careFlowRepo.update(flow.id, {
                touchpoints: [...flow.touchpoints, touchpoint],
                cadence: newCadence,
                phase: newPhase || flow.phase,
                nextTouchpointAt: admin.firestore.Timestamp.fromDate(nextAt),
                nextTouchpointType: determineTouchpointTypeForPhase(newPhase || flow.phase, template),
            } as any);

            return;
        }
    }

    // Check for pending nudge from this flow (don't double-send)
    const hasPending = await checkPendingNudgeForFlow(ctx.nudgeService, flow);
    if (hasPending) {
        ctx.result.skippedPendingNudge++;
        return;
    }

    // Generate personalized message via AI
    let title: string;
    let message: string;
    let aiGenerated = false;

    try {
        const { getIntelligentNudgeGenerator } = await import('./intelligentNudgeGenerator');
        const generator = getIntelligentNudgeGenerator();
        const nudgePurpose = mapTouchpointToPurpose(touchpointType, flow);
        nudgePurpose.careFlowPhase = flow.phase;
        nudgePurpose.touchpointCount = flow.touchpoints.length;
        nudgePurpose.reportedIssues = flow.context.reportedIssues;
        const aiResult = await generator.generateNudge(flow.userId, nudgePurpose);
        title = aiResult.title;
        message = aiResult.message;
        aiGenerated = true;
    } catch (error) {
        functions.logger.warn(`[CareFlowEngine] AI generation failed for flow ${flow.id}, using fallback:`, error);
        const fallback = getFallbackMessage(touchpointType, flow);
        title = fallback.title;
        message = fallback.message;
    }

    // Map touchpoint type to nudge action type
    const actionType = mapTouchpointToActionType(touchpointType, flow.condition);

    // Create nudge
    const nudgeData = {
        userId: flow.userId,
        visitId: flow.visitId,
        type: 'condition_tracking' as const,
        conditionId: flow.condition,
        medicationId: flow.medicationId || null,
        medicationName: flow.medicationName || null,
        title,
        message,
        actionType,
        scheduledFor: ctx.now,
        sequenceDay: getDaysSinceFlowStart(flow),
        sequenceId: `careflow_${flow.id}_${Date.now()}`,
        status: 'pending' as const,
        aiGenerated,
        careFlowId: flow.id,
        context: {
            visitId: flow.visitId,
            visitDate: flow.context.visitDate,
            ...(flow.context.providerName ? { providerName: flow.context.providerName } : {}),
            ...(flow.medicationName ? { medicationName: flow.medicationName } : {}),
            ...(flow.context.medicationDose ? { medicationDose: flow.context.medicationDose } : {}),
            trackingReason: `Care flow: ${flow.phase} phase`,
        },
        createdAt: ctx.now,
        updatedAt: ctx.now,
    };

    await ctx.nudgeService.createRecord(nudgeData as any);

    // Append touchpoint to flow
    const touchpoint: CareFlowTouchpoint = {
        type: touchpointType,
        scheduledAt: ctx.now,
        deliveredAt: ctx.now,
        outcome: 'pending',
        phaseAtTime: flow.phase,
    };

    // Calculate next touchpoint
    const nextAt = calculateNextTouchpointAt(flow, template, flow.cadence);

    // Check phase transition
    const newPhase = checkPhaseTransition(flow, flow.cadence, template);
    if (newPhase && newPhase !== flow.phase) {
        ctx.result.phaseTransitions++;
    }

    await ctx.careFlowRepo.update(flow.id, {
        touchpoints: [...flow.touchpoints, touchpoint],
        phase: newPhase || flow.phase,
        nextTouchpointAt: admin.firestore.Timestamp.fromDate(nextAt),
        nextTouchpointType: determineTouchpointTypeForPhase(newPhase || flow.phase, template),
    } as any);

    // Increment daily count
    ctx.dailyNudgeCounts.set(flow.userId, (userDailyCount || 0) + 1);
    ctx.result.touchpointsCreated++;
}

// =============================================================================
// Phase Transition Logic
// =============================================================================

function checkPhaseTransition(
    flow: CareFlow,
    cadence: CareFlow['cadence'],
    template: ReturnType<typeof getCareFlowTemplate>,
): CareFlowPhase | null {
    if (!template) return null;

    const daysSinceStart = getDaysSinceFlowStart(flow);

    switch (flow.phase) {
        case 'understand':
            // → establish: after day 2 OR first log received
            if (daysSinceStart > 2 || cadence.consecutiveNormalCount >= 1) {
                return 'establish';
            }
            break;

        case 'establish':
            // → maintain: after day 14 OR 5+ normal readings
            if (daysSinceStart > 14 || cadence.consecutiveNormalCount >= 5) {
                return 'maintain';
            }
            break;

        case 'maintain':
            // → coast: after week 8 (56 days) with consecutiveNormalCount >= 6
            if (daysSinceStart > 56 && cadence.consecutiveNormalCount >= 6) {
                return 'coast';
            }
            break;

        case 'coast':
            // Coast is the final stable phase — no automatic transition
            break;
    }

    return null;
}

// =============================================================================
// Helper Functions
// =============================================================================

function determineTouchpointType(
    flow: CareFlow,
    template: ReturnType<typeof getCareFlowTemplate>,
): TouchpointType {
    if (!template) return 'log_prompt';

    const phaseConfig = template.phases[flow.phase];
    const daysSinceStart = getDaysSinceFlowStart(flow);

    // Check for fixed touchpoints in current phase
    if (phaseConfig.touchpoints) {
        for (const tp of phaseConfig.touchpoints) {
            // Skip conditional touchpoints if condition isn't met
            if (tp.condition === 'has_new_med' && !flow.medicationName) continue;
            if (tp.condition === 'has_side_effects' && flow.context.reportedIssues.length === 0) continue;

            // Skip side-effect checks if patient said "already talked to doctor"
            if (tp.type === 'side_effect_check' && flow.context.skipNextSideEffectCheck) {
                flow.context.skipNextSideEffectCheck = false; // Clear the flag
                continue;
            }

            const phaseDayStart = getPhaseStartDay(flow);
            const dayInPhase = daysSinceStart - phaseDayStart;

            // Check if this touchpoint hasn't been delivered yet
            const alreadyDelivered = flow.touchpoints.some(
                t => t.type === tp.type && t.phaseAtTime === flow.phase,
            );

            if (!alreadyDelivered && dayInPhase >= tp.day) {
                return tp.type;
            }
        }
    }

    // Default touchpoint types by phase
    return determineTouchpointTypeForPhase(flow.phase, template);
}

function determineTouchpointTypeForPhase(
    phase: CareFlowPhase,
    template: ReturnType<typeof getCareFlowTemplate>,
): TouchpointType {
    switch (phase) {
        case 'understand': return 'educate';
        case 'establish': return 'log_prompt';
        case 'maintain': {
            // Monthly summary check
            if (template?.phases.maintain.monthlySummary) {
                return 'log_prompt'; // Default; trend_summary inserted monthly by engine
            }
            return 'log_prompt';
        }
        case 'coast': return 'log_prompt';
        default: return 'log_prompt';
    }
}

function calculateNextTouchpointAt(
    flow: CareFlow,
    template: ReturnType<typeof getCareFlowTemplate>,
    cadence: CareFlow['cadence'],
): Date {
    if (!template) {
        const next = new Date();
        next.setDate(next.getDate() + 7);
        return next;
    }

    const phaseConfig = template.phases[flow.phase];
    const intervalDays = cadence.currentIntervalDays || phaseConfig.defaultInterval || 7;

    const next = new Date();
    next.setDate(next.getDate() + intervalDays);
    next.setHours(9, 0, 0, 0); // Default to 9 AM

    return next;
}

async function checkRecentLog(
    healthLogService: HealthLogDomainService,
    userId: string,
    metricType: string,
    sinceTimestamp: FirebaseFirestore.Timestamp,
): Promise<boolean> {
    try {
        const logs = await healthLogService.listForUser(userId, {
            type: metricType as any,
            sortDirection: 'desc',
            limit: 1,
        });

        if (logs.length === 0) return false;

        const logDate = logs[0].createdAt?.toDate?.();
        if (!logDate) return false;

        return logDate.getTime() > sinceTimestamp.toDate().getTime();
    } catch {
        return false;
    }
}

async function checkPendingNudgeForFlow(
    nudgeService: NudgeDomainService,
    flow: CareFlow,
): Promise<boolean> {
    try {
        const pendingNudges = await nudgeService.listByUserAndStatuses(
            flow.userId,
            ['pending', 'active', 'snoozed'],
        );

        return pendingNudges.some(
            (nudge: any) => nudge.careFlowId === flow.id,
        );
    } catch {
        return false;
    }
}

async function countTodaysNudgesForUser(
    nudgeService: NudgeDomainService,
    userId: string,
    now: FirebaseFirestore.Timestamp,
): Promise<number> {
    const today = now.toDate();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return nudgeService.countByUserNotificationSentBetween(
        userId,
        admin.firestore.Timestamp.fromDate(startOfDay),
        admin.firestore.Timestamp.fromDate(endOfDay),
    );
}

function getDaysSinceFlowStart(flow: CareFlow): number {
    const startDate = flow.createdAt.toDate();
    const now = new Date();
    return Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

function getPhaseStartDay(flow: CareFlow): number {
    // Find the last phase transition touchpoint
    for (let i = flow.touchpoints.length - 1; i >= 0; i--) {
        const tp = flow.touchpoints[i];
        if (tp.phaseAtTime !== flow.phase && i < flow.touchpoints.length - 1) {
            // The touchpoint after this one started the current phase
            const transitionDate = flow.touchpoints[i + 1].scheduledAt.toDate();
            const startDate = flow.createdAt.toDate();
            return Math.floor((transitionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        }
    }
    return 0; // Phase started at flow creation
}

function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

function getNextMorning(timezone: string): Date {
    try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: timezone,
        });
        const todayStr = formatter.format(now);
        const tomorrow = new Date(`${todayStr}T08:00:00`);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    } catch {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        return tomorrow;
    }
}

function mapTouchpointToActionType(
    touchpointType: TouchpointType,
    condition: string,
): string {
    switch (touchpointType) {
        case 'log_prompt':
        case 'combined':
            // Opens the appropriate log modal (BP, glucose, weight)
            if (condition === 'htn') return 'log_bp';
            if (condition === 'dm') return 'log_glucose';
            if (condition === 'heart_failure') return 'log_weight';
            return 'symptom_check';
        case 'side_effect_check':
            // Opens side effects modal (None / Mild / Concerning)
            return 'side_effects';
        case 'educate':
            // "How are you feeling?" — captures patient sentiment about new med/diagnosis
            return 'feeling_check';
        case 'trend_summary':
            // "How are things going?" — captures patient sentiment about their progress
            return 'feeling_check';
        case 'celebration':
            // Positive reinforcement — no action needed beyond reading
            return 'acknowledge';
        case 'escalation':
            // Symptom assessment
            return 'symptom_check';
        default:
            return 'feeling_check';
    }
}

function mapTouchpointToPurpose(
    touchpointType: TouchpointType,
    flow: CareFlow,
): {
    type: 'medication_checkin' | 'condition_tracking' | 'followup' | 'introduction';
    trigger: 'pickup_check' | 'started_check' | 'side_effects' | 'feeling_check' | 'log_reading' | 'symptom_check' | 'general';
    conditionId?: string;
    medicationName?: string;
    careFlowPhase?: 'understand' | 'establish' | 'maintain' | 'coast';
    touchpointCount?: number;
    reportedIssues?: string[];
} {
    switch (touchpointType) {
        case 'log_prompt':
        case 'combined':
            return {
                type: 'condition_tracking',
                trigger: 'log_reading',
                conditionId: flow.condition,
                medicationName: flow.medicationName,
            };
        case 'side_effect_check':
            return {
                type: 'medication_checkin',
                trigger: 'side_effects',
                conditionId: flow.condition,
                medicationName: flow.medicationName,
            };
        case 'educate':
            return {
                type: 'medication_checkin',
                trigger: 'feeling_check',
                conditionId: flow.condition,
                medicationName: flow.medicationName,
            };
        case 'trend_summary':
            return {
                type: 'condition_tracking',
                trigger: 'feeling_check',
                conditionId: flow.condition,
                medicationName: flow.medicationName,
            };
        default:
            return {
                type: 'condition_tracking',
                trigger: 'feeling_check',
                conditionId: flow.condition,
            };
    }
}

function getFallbackMessage(
    touchpointType: TouchpointType,
    flow: CareFlow,
): { title: string; message: string } {
    switch (touchpointType) {
        case 'log_prompt':
            if (flow.condition === 'htn') {
                return {
                    title: 'Blood Pressure Check',
                    message: 'Time for a quick BP reading — it helps track how things are going.',
                };
            }
            return {
                title: 'Health Check',
                message: 'Time for a quick reading to keep your health data up to date.',
            };
        case 'side_effect_check':
            return {
                title: `How's ${flow.medicationName || 'your medication'}?`,
                message: 'Any side effects or issues to report? Let us know how you\'re feeling.',
            };
        case 'educate':
            if (flow.medicationName) {
                return {
                    title: `Starting ${flow.medicationName}`,
                    message: `You've started ${flow.medicationName}. How are you feeling about things so far?`,
                };
            }
            return {
                title: 'How Are You Feeling?',
                message: 'Your recent visit included some changes. How are you feeling about things?',
            };
        case 'combined':
            return {
                title: 'Weekly Check-In',
                message: 'Quick reading plus a check on how things are going.',
            };
        case 'trend_summary':
            return {
                title: 'Your Health Summary',
                message: 'Here\'s how your readings have been trending. How are things going?',
            };
        case 'celebration':
            return {
                title: 'Great Progress!',
                message: 'Your consistency is paying off. Keep it up!',
            };
        default:
            return {
                title: 'Health Check-In',
                message: 'Just checking in — how are things going?',
            };
    }
}
