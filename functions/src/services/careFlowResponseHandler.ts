/**
 * Care Flow Response Handler
 *
 * Updates a care flow document when a patient responds to a nudge
 * that was created by the care flow engine.
 *
 * Logic (from design doc §9):
 * - Positive → consecutiveNormalCount++, decay interval if threshold met
 * - Concerning → reset count, tighten interval, schedule follow-up
 * - "Too frequent" → slowdown, double interval
 * - "Already talked to doctor" → record, skip next side-effect check
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
    TouchpointOutcome,
    CareFlowResponseUpdate,
} from '../types/careFlows';
import { getCareFlowTemplate } from '../data/careFlowTemplates';
import { FirestoreCareFlowRepository } from './repositories/careFlows/FirestoreCareFlowRepository';
import { HealthLogDomainService } from './domain/healthLogs/HealthLogDomainService';
import { FirestoreHealthLogRepository } from './repositories/healthLogs/FirestoreHealthLogRepository';

const getDb = () => admin.firestore();

// Response classification
const POSITIVE_RESPONSES = new Set([
    'good', 'okay', 'none', 'taking_it', 'got_it', 'feeling_fine',
]);

const CONCERNING_RESPONSES = new Set([
    'having_trouble', 'issues', 'concerning', 'mild',
]);

const TOO_FREQUENT_RESPONSE = 'too_frequent';
const TALKED_TO_DOCTOR_RESPONSE = 'already_talked_to_doctor';

/**
 * Update a care flow based on a nudge response.
 */
export async function updateCareFlowFromResponse(
    update: CareFlowResponseUpdate,
): Promise<void> {
    const repo = new FirestoreCareFlowRepository(getDb());
    const flow = await repo.getById(update.careFlowId);

    if (!flow) {
        functions.logger.warn(
            `[CareFlowResponse] Care flow ${update.careFlowId} not found`,
        );
        return;
    }

    if (flow.status !== 'active') {
        functions.logger.info(
            `[CareFlowResponse] Care flow ${update.careFlowId} is ${flow.status}, skipping update`,
        );
        return;
    }

    const template = getCareFlowTemplate(flow.condition);
    if (!template) return;

    const now = admin.firestore.Timestamp.now();

    // Find the touchpoint for this nudge and update it
    const updatedTouchpoints = [...flow.touchpoints];
    const touchpointIdx = updatedTouchpoints.findIndex(
        tp => tp.nudgeId === update.nudgeId,
    );

    // Classify outcome
    const outcome = classifyOutcome(update.response);

    if (touchpointIdx >= 0) {
        updatedTouchpoints[touchpointIdx] = {
            ...updatedTouchpoints[touchpointIdx],
            responseReceived: true,
            responseValue: update.response,
            responseSummary: update.note,
            outcome,
        };
    } else {
        // Touchpoint may not have nudgeId set yet (race condition)
        // Update the most recent pending touchpoint
        let pendingIdx = -1;
        for (let i = updatedTouchpoints.length - 1; i >= 0; i--) {
            if (updatedTouchpoints[i].outcome === 'pending') {
                pendingIdx = i;
                break;
            }
        }
        if (pendingIdx >= 0) {
            updatedTouchpoints[pendingIdx] = {
                ...updatedTouchpoints[pendingIdx],
                nudgeId: update.nudgeId,
                responseReceived: true,
                responseValue: update.response,
                responseSummary: update.note,
                outcome,
            };
        }
    }

    // Update cadence based on response
    const newCadence = { ...flow.cadence };
    const cadenceRules = template.cadenceRules;

    if (outcome === 'positive') {
        newCadence.consecutiveNormalCount++;

        // Decay interval if threshold met
        if (newCadence.consecutiveNormalCount >= cadenceRules.decayAfterNormal) {
            newCadence.currentIntervalDays = Math.min(
                Math.round(newCadence.currentIntervalDays * cadenceRules.decayMultiplier),
                cadenceRules.maxInterval,
            );
        }
    } else if (outcome === 'concerning') {
        newCadence.consecutiveNormalCount = 0;
        newCadence.currentIntervalDays = Math.max(
            cadenceRules.minInterval,
            Math.round(newCadence.currentIntervalDays / 2),
        );

        // Add to reported issues
        if (update.note) {
            flow.context.reportedIssues.push(update.note);
        }
        if (update.sideEffects && update.sideEffects.length > 0) {
            flow.context.reportedIssues.push(...update.sideEffects);
        }
    }

    // Handle special responses
    if (update.response === TALKED_TO_DOCTOR_RESPONSE) {
        // Skip the next side-effect check — patient already discussed with their doctor
        flow.context.skipNextSideEffectCheck = true;
    }

    if (update.response === TOO_FREQUENT_RESPONSE) {
        newCadence.patientRequestedSlowdown = true;
        newCadence.currentIntervalDays = Math.min(
            cadenceRules.maxInterval,
            newCadence.currentIntervalDays * 2,
        );
    }

    // Track phase re-escalation (applied to updateData below)
    let phaseOverride: string | undefined;
    if (outcome === 'concerning') {
        if (flow.phase === 'coast') {
            phaseOverride = 'establish';
            newCadence.currentIntervalDays = cadenceRules.minInterval;
            functions.logger.info(
                `[CareFlowResponse] Re-escalating flow ${flow.id} from coast → establish`,
            );
        } else if (flow.phase === 'maintain') {
            const recentConcerning = flow.touchpoints
                .slice(-3)
                .filter(tp => tp.outcome === 'concerning').length;
            if (recentConcerning >= 1) {
                phaseOverride = 'establish';
                newCadence.currentIntervalDays = cadenceRules.minInterval;
                functions.logger.info(
                    `[CareFlowResponse] Re-escalating flow ${flow.id} from maintain → establish`,
                );
            }
        }
    }

    // BP crisis escalation: check if the patient just logged a dangerously high reading
    if (flow.condition === 'htn' && cadenceRules.escalateBPSystolic && cadenceRules.escalateBPDiastolic) {
        try {
            const healthLogService = new HealthLogDomainService(new FirestoreHealthLogRepository(getDb()));
            const recentLogs = await healthLogService.listForUser(flow.userId, {
                type: 'bp' as any,
                sortDirection: 'desc',
                limit: 1,
            });

            if (recentLogs.length > 0) {
                const logValue = recentLogs[0].value as Record<string, unknown>;
                const systolic = typeof logValue?.systolic === 'number' ? logValue.systolic : 0;
                const diastolic = typeof logValue?.diastolic === 'number' ? logValue.diastolic : 0;

                if (systolic >= cadenceRules.escalateBPSystolic || diastolic >= cadenceRules.escalateBPDiastolic) {
                    functions.logger.warn(
                        `[CareFlowResponse] BP crisis detected for flow ${flow.id}: ${systolic}/${diastolic}`,
                    );
                    newCadence.consecutiveNormalCount = 0;
                    newCadence.currentIntervalDays = cadenceRules.minInterval;
                    newCadence.lastEscalationReason = `bp_crisis:${systolic}/${diastolic}`;
                }
            }
        } catch (error) {
            functions.logger.warn(`[CareFlowResponse] Could not check BP escalation:`, error);
        }
    }

    // Calculate next touchpoint
    const nextDate = new Date(now.toDate());
    nextDate.setDate(nextDate.getDate() + newCadence.currentIntervalDays);
    nextDate.setHours(9, 0, 0, 0);

    // Build update
    const updateData: Record<string, unknown> = {
        touchpoints: updatedTouchpoints,
        cadence: newCadence,
        'context.reportedIssues': flow.context.reportedIssues,
        'context.skipNextSideEffectCheck': flow.context.skipNextSideEffectCheck || false,
        nextTouchpointAt: admin.firestore.Timestamp.fromDate(nextDate),
        updatedAt: now,
        ...(phaseOverride ? { phase: phaseOverride } : {}),
    };

    await repo.update(flow.id, updateData as any);

    functions.logger.info(
        `[CareFlowResponse] Updated flow ${flow.id}: outcome=${outcome}, interval=${newCadence.currentIntervalDays}d, normalCount=${newCadence.consecutiveNormalCount}`,
    );
}

function classifyOutcome(response: string): TouchpointOutcome {
    if (POSITIVE_RESPONSES.has(response)) return 'positive';
    if (CONCERNING_RESPONSES.has(response)) return 'concerning';
    if (response === TALKED_TO_DOCTOR_RESPONSE) return 'neutral';
    if (response === TOO_FREQUENT_RESPONSE) return 'neutral';
    return 'neutral';
}
