/**
 * LumiBot Analyzer Service
 * 
 * Analyzes completed visits and creates appropriate nudge sequences
 * based on diagnoses discussed and medications started/changed.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
    Nudge,
    NudgeCreateInput,
    NudgeActionType,
} from '../types/lumibot';
import {
    matchDiagnosesToProtocols,
    ConditionProtocol,
} from '../data/conditionProtocols';
import {
    getMedicationSequence,
    formatMedicationMessage,
} from '../data/medicationSequences';
import {
    getConditionsCoveredByMedications,
    getTrackingTypeForMedication,
} from '../data/medicationClasses';
import { VisitSummaryResult, MedicationChangeEntry } from './openai';


// =============================================================================
// Helpers
// =============================================================================

/** Generate a short random ID for sequence grouping */
function generateShortId(): string {
    return Math.random().toString(36).substring(2, 10);
}

// =============================================================================
// Firestore Access
// =============================================================================

const db = () => admin.firestore();
const getNudgesCollection = () => db().collection('nudges');

// =============================================================================
// Nudge Creation
// =============================================================================

async function createNudge(input: NudgeCreateInput): Promise<string> {
    const now = admin.firestore.Timestamp.now();

    // Build nudge data, excluding undefined values (Firestore doesn't accept undefined)
    const nudge: Record<string, unknown> = {
        userId: input.userId,
        visitId: input.visitId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionType: input.actionType,
        scheduledFor: admin.firestore.Timestamp.fromDate(input.scheduledFor),
        sequenceDay: input.sequenceDay,
        sequenceId: input.sequenceId,
        status: 'pending',
        notificationSent: false, // For push notification tracking
        createdAt: now,
        updatedAt: now,
    };


    // Only add optional fields if they have values
    if (input.conditionId) nudge.conditionId = input.conditionId;
    if (input.medicationId) nudge.medicationId = input.medicationId;
    if (input.medicationName) nudge.medicationName = input.medicationName;

    const docRef = await getNudgesCollection().add(nudge);

    functions.logger.info(`[LumibotAnalyzer] Created nudge ${docRef.id}`, {
        userId: input.userId,
        type: input.type,
        title: input.title,
        scheduledFor: input.scheduledFor.toISOString(),
    });

    return docRef.id;
}

// =============================================================================
// Introduction Nudge (Immediate)
// =============================================================================

interface IntroNudgeParams {
    userId: string;
    visitId: string;
    conditionName?: string;
    medicationName?: string;
    isNewMedication?: boolean;
}

async function createIntroductionNudge(params: IntroNudgeParams): Promise<string> {
    const { userId, visitId, conditionName, medicationName, isNewMedication } = params;

    let title: string;
    let message: string;

    if (conditionName && medicationName) {
        // Both condition and medication
        title = 'LumiBot is Here to Help';
        message = `I noticed your provider discussed ${conditionName} and started you on ${medicationName}. I'll be checking in periodically to see how things are going and help you track your progress. 💙`;
    } else if (conditionName) {
        // Condition only
        title = 'LumiBot is Here to Help';
        message = `I see your provider discussed ${conditionName} during your visit. I'll be checking in to help you monitor and track your progress. 💙`;
    } else if (medicationName && isNewMedication) {
        // New medication only
        title = 'New Medication Started';
        message = `I noticed your provider started you on ${medicationName}. I'll be checking in over the next few weeks to see how it's working for you. 💙`;
    } else if (medicationName) {
        // Changed medication
        title = 'Medication Update';
        message = `I see your provider made a change to your ${medicationName}. I'll check in to see how the adjustment is going. 💙`;
    } else {
        // Generic fallback
        title = 'LumiBot is Here to Help';
        message = 'I noticed some updates from your recent visit. I\'ll be checking in to help you track your progress. 💙';
    }

    // Schedule for "now" (immediate) - 10 seconds from now to ensure processing completes
    const scheduledFor = new Date();
    scheduledFor.setSeconds(scheduledFor.getSeconds() + 10);

    return await createNudge({
        userId,
        visitId,
        type: 'introduction',
        title,
        message,
        actionType: 'acknowledge', // Simple dismiss action
        scheduledFor,
        sequenceDay: 0,
        sequenceId: `intro_${visitId}`,
    });
}

// =============================================================================
// Condition Nudge Generation
// =============================================================================

function getActionTypeForTracking(trackingType: string): NudgeActionType {
    switch (trackingType) {
        case 'bp':
            return 'log_bp';
        case 'glucose':
            return 'log_glucose';
        case 'weight':
            return 'log_weight';
        case 'symptom_check':
            return 'symptom_check';
        default:
            return 'symptom_check';
    }
}

async function createConditionNudges(
    userId: string,
    visitId: string,
    protocol: ConditionProtocol,
    visitDate: Date
): Promise<number> {
    const sequenceId = `${protocol.id}_${visitId}_${generateShortId()}`;
    let nudgesCreated = 0;

    // Get primary tracking type for this condition
    const primaryTracking = protocol.tracking[0];
    const actionType = getActionTypeForTracking(primaryTracking.type);

    for (const scheduleItem of protocol.nudgeSchedule) {
        // Calculate scheduled date
        const scheduledDate = new Date(visitDate);
        scheduledDate.setDate(scheduledDate.getDate() + scheduleItem.day);

        // Only create nudge if it's in the future
        if (scheduledDate > new Date()) {
            await createNudge({
                userId,
                visitId,
                type: 'condition_tracking',
                conditionId: protocol.id,
                title: protocol.name,
                message: scheduleItem.message,
                actionType,
                scheduledFor: scheduledDate,
                sequenceDay: scheduleItem.day,
                sequenceId,
            });
            nudgesCreated++;
        }

        // Handle recurring nudges - create next 4 occurrences
        if (scheduleItem.recurring && scheduleItem.interval) {
            for (let i = 1; i <= 4; i++) {
                const recurringDate = new Date(scheduledDate);
                recurringDate.setDate(recurringDate.getDate() + (scheduleItem.interval * i));

                if (recurringDate > new Date()) {
                    await createNudge({
                        userId,
                        visitId,
                        type: 'condition_tracking',
                        conditionId: protocol.id,
                        title: protocol.name,
                        message: scheduleItem.message,
                        actionType,
                        scheduledFor: recurringDate,
                        sequenceDay: scheduleItem.day + (scheduleItem.interval * i),
                        sequenceId,
                    });
                    nudgesCreated++;
                }
            }
        }
    }

    functions.logger.info(`[LumibotAnalyzer] Created ${nudgesCreated} nudges for condition ${protocol.id}`, {
        userId,
        visitId,
        conditionId: protocol.id,
    });

    return nudgesCreated;
}

// =============================================================================
// Medication Nudge Generation
// =============================================================================

async function createMedicationNudges(
    userId: string,
    visitId: string,
    medication: MedicationChangeEntry,
    trigger: 'medication_started' | 'medication_changed',
    visitDate: Date
): Promise<number> {
    const sequence = getMedicationSequence(trigger);
    if (!sequence) {
        functions.logger.warn(`[LumibotAnalyzer] No sequence found for trigger: ${trigger}`);
        return 0;
    }

    const medicationName = typeof medication === 'string'
        ? medication
        : medication.name;

    const sequenceId = `${sequence.id}_${visitId}_${generateShortId()}`;
    let nudgesCreated = 0;

    // Get tracking type for this medication (if any)
    const trackingType = getTrackingTypeForMedication(medicationName);

    for (const step of sequence.steps) {
        // Skip log_reading steps if medication doesn't have a tracking type
        if (step.type === 'log_reading' && !trackingType) {
            continue;
        }

        const scheduledDate = new Date(visitDate);
        scheduledDate.setDate(scheduledDate.getDate() + step.day);

        // Only create nudge if it's in the future
        if (scheduledDate > new Date()) {
            // Determine action type based on step type and tracking
            let actionType: NudgeActionType;
            if (step.type === 'log_reading') {
                actionType = trackingType === 'bp' ? 'log_bp' :
                    trackingType === 'glucose' ? 'log_glucose' :
                        'log_bp'; // fallback
            } else {
                actionType = step.type as NudgeActionType;
            }

            await createNudge({
                userId,
                visitId,
                type: 'medication_checkin',
                medicationName,
                title: step.title,
                message: formatMedicationMessage(step.messageTemplate, medicationName),
                actionType,
                scheduledFor: scheduledDate,
                sequenceDay: step.day,
                sequenceId,
            });
            nudgesCreated++;

            // Handle recurring nudges (create next 4 occurrences)
            if (step.recurring && step.recurringIntervalDays) {
                for (let i = 1; i <= 4; i++) {
                    const recurringDate = new Date(scheduledDate);
                    recurringDate.setDate(recurringDate.getDate() + (step.recurringIntervalDays * i));

                    if (recurringDate > new Date()) {
                        await createNudge({
                            userId,
                            visitId,
                            type: 'medication_checkin',
                            medicationName,
                            title: step.title,
                            message: formatMedicationMessage(step.messageTemplate, medicationName),
                            actionType,
                            scheduledFor: recurringDate,
                            sequenceDay: step.day + (step.recurringIntervalDays * i),
                            sequenceId,
                        });
                        nudgesCreated++;
                    }
                }
            }
        }
    }

    functions.logger.info(`[LumibotAnalyzer] Created ${nudgesCreated} nudges for medication ${medicationName}`, {
        userId,
        visitId,
        trigger,
        medicationName,
        trackingType,
    });

    return nudgesCreated;
}


// =============================================================================
// Main Analysis Function
// =============================================================================

export interface AnalyzeVisitResult {
    conditionNudges: number;
    medicationNudges: number;
    matchedConditions: string[];
    newMedications: string[];
    changedMedications: string[];
}

export async function analyzeVisitForNudges(
    userId: string,
    visitId: string,
    summary: VisitSummaryResult,
    visitDate?: Date
): Promise<AnalyzeVisitResult> {
    const effectiveVisitDate = visitDate || new Date();

    functions.logger.info(`[LumibotAnalyzer] Analyzing visit ${visitId} for user ${userId}`, {
        diagnosesCount: summary.diagnoses?.length || 0,
        startedMedsCount: summary.medications?.started?.length || 0,
        changedMedsCount: summary.medications?.changed?.length || 0,
    });

    const result: AnalyzeVisitResult = {
        conditionNudges: 0,
        medicationNudges: 0,
        matchedConditions: [],
        newMedications: [],
        changedMedications: [],
    };

    // ==========================================================================
    // CONSOLIDATION: Process medications FIRST to determine which conditions are covered
    // ==========================================================================

    // 1. Process new medications
    const startedMeds = summary.medications?.started || [];
    for (const med of startedMeds) {
        const medName = typeof med === 'string' ? med : med.name;
        result.newMedications.push(medName);

        const nudgesCreated = await createMedicationNudges(
            userId,
            visitId,
            med,
            'medication_started',
            effectiveVisitDate
        );
        result.medicationNudges += nudgesCreated;
    }

    // 2. Process changed medications
    const changedMeds = summary.medications?.changed || [];
    for (const med of changedMeds) {
        const medName = typeof med === 'string' ? med : med.name;
        result.changedMedications.push(medName);

        const nudgesCreated = await createMedicationNudges(
            userId,
            visitId,
            med,
            'medication_changed',
            effectiveVisitDate
        );
        result.medicationNudges += nudgesCreated;
    }

    // 3. Determine which conditions are already covered by medication nudges
    const allMedNames = [...result.newMedications, ...result.changedMedications];
    const conditionsCoveredByMeds = getConditionsCoveredByMedications(allMedNames);

    if (conditionsCoveredByMeds.length > 0) {
        functions.logger.info(`[LumibotAnalyzer] Conditions covered by medications:`, {
            conditionsCoveredByMeds,
            medications: allMedNames,
        });
    }

    // 4. Match diagnoses to condition protocols (skip if covered by meds)
    const diagnoses = summary.diagnoses || [];
    const matchedProtocols = matchDiagnosesToProtocols(diagnoses);

    for (const protocol of matchedProtocols) {
        result.matchedConditions.push(protocol.name);

        // CONSOLIDATION: Skip if medication already covers this condition's tracking
        if (conditionsCoveredByMeds.includes(protocol.id)) {
            functions.logger.info(`[LumibotAnalyzer] Skipping ${protocol.id} nudges - covered by medication`);
            continue;
        }

        // Check if user already has active nudges for this condition from recent visits
        const existingNudges = await getNudgesCollection()
            .where('userId', '==', userId)
            .where('conditionId', '==', protocol.id)
            .where('status', 'in', ['pending', 'active'])
            .limit(1)
            .get();

        if (existingNudges.empty) {
            const nudgesCreated = await createConditionNudges(
                userId,
                visitId,
                protocol,
                effectiveVisitDate
            );
            result.conditionNudges += nudgesCreated;
        } else {
            functions.logger.info(`[LumibotAnalyzer] User already has active nudges for ${protocol.id}, skipping`);
        }
    }


    // 4. Create immediate introduction nudge if we detected anything
    const hasNewContent = result.matchedConditions.length > 0 ||
        result.newMedications.length > 0 ||
        result.changedMedications.length > 0;

    if (hasNewContent) {
        // Determine what to mention in the intro
        const primaryCondition = result.matchedConditions[0];
        const primaryMed = result.newMedications[0] || result.changedMedications[0];
        const isNewMed = result.newMedications.length > 0;

        await createIntroductionNudge({
            userId,
            visitId,
            conditionName: primaryCondition,
            medicationName: primaryMed,
            isNewMedication: isNewMed,
        });

        functions.logger.info(`[LumibotAnalyzer] Created introduction nudge`, {
            userId,
            visitId,
            conditionName: primaryCondition,
            medicationName: primaryMed,
        });
    }

    functions.logger.info(`[LumibotAnalyzer] Visit analysis complete`, {
        userId,
        visitId,
        ...result,
    });

    return result;
}

// =============================================================================
// User Nudge Queries
// =============================================================================

export async function getActiveNudgesForUser(userId: string): Promise<Nudge[]> {
    const now = admin.firestore.Timestamp.now();

    // Simplified query: Get all nudges for user, filter in memory
    // This avoids needing multiple composite indexes while they build
    const snapshot = await getNudgesCollection()
        .where('userId', '==', userId)
        .get();

    const allNudges: Nudge[] = [];
    const batch = db().batch();
    let needsCommit = false;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const status = data.status as string;
        const scheduledFor = data.scheduledFor as admin.firestore.Timestamp;
        const snoozedUntil = data.snoozedUntil as admin.firestore.Timestamp | undefined;

        // Skip completed/dismissed nudges
        if (status === 'completed' || status === 'dismissed') {
            return;
        }

        // Handle pending nudges that are due
        if (status === 'pending' && scheduledFor && scheduledFor.toMillis() <= now.toMillis()) {
            batch.update(doc.ref, {
                status: 'active',
                updatedAt: now,
            });
            needsCommit = true;
            allNudges.push({
                id: doc.id,
                ...data,
                status: 'active', // Return as active since we're updating it
            } as Nudge);
            return;
        }

        // Handle already active nudges
        if (status === 'active') {
            allNudges.push({
                id: doc.id,
                ...data,
            } as Nudge);
            return;
        }

        // Handle snoozed nudges that are due
        if (status === 'snoozed' && snoozedUntil && snoozedUntil.toMillis() <= now.toMillis()) {
            batch.update(doc.ref, {
                status: 'active',
                snoozedUntil: admin.firestore.FieldValue.delete(),
                updatedAt: now,
            });
            needsCommit = true;
            allNudges.push({
                id: doc.id,
                ...data,
                status: 'active',
            } as Nudge);
            return;
        }
    });

    if (needsCommit) {
        await batch.commit();
    }

    // Sort by scheduledFor ascending (oldest first)
    allNudges.sort((a, b) => {
        const aTime = a.scheduledFor?.toMillis?.() || 0;
        const bTime = b.scheduledFor?.toMillis?.() || 0;
        return aTime - bTime;
    });

    // Limit to 10 nudges
    return allNudges.slice(0, 10);
}

// =============================================================================
// Nudge Status Updates
// =============================================================================

export async function completeNudge(
    nudgeId: string,
    responseValue?: string | Record<string, unknown>
): Promise<void> {
    const now = admin.firestore.Timestamp.now();

    // Clean responseValue to remove undefined values (Firestore doesn't accept undefined)
    let cleanedResponseValue: string | Record<string, unknown> | undefined = responseValue;
    if (responseValue && typeof responseValue === 'object') {
        cleanedResponseValue = Object.fromEntries(
            Object.entries(responseValue).filter(([, v]) => v !== undefined)
        );
    }

    const updateData: Record<string, unknown> = {
        status: 'completed',
        completedAt: now,
        updatedAt: now,
    };

    // Only add responseValue if it has content
    if (cleanedResponseValue !== undefined) {
        updateData.responseValue = cleanedResponseValue;
    }

    await getNudgesCollection().doc(nudgeId).update(updateData);

    functions.logger.info(`[LumibotAnalyzer] Nudge ${nudgeId} completed`);
}

export async function snoozeNudge(
    nudgeId: string,
    snoozeDays: number = 1
): Promise<void> {
    const now = admin.firestore.Timestamp.now();
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + snoozeDays);

    await getNudgesCollection().doc(nudgeId).update({
        status: 'snoozed',
        snoozedUntil: admin.firestore.Timestamp.fromDate(snoozedUntil),
        updatedAt: now,
    });

    functions.logger.info(`[LumibotAnalyzer] Nudge ${nudgeId} snoozed for ${snoozeDays} days`);
}

export async function dismissNudge(nudgeId: string): Promise<void> {
    const now = admin.firestore.Timestamp.now();

    await getNudgesCollection().doc(nudgeId).update({
        status: 'dismissed',
        dismissedAt: now,
        updatedAt: now,
    });

    functions.logger.info(`[LumibotAnalyzer] Nudge ${nudgeId} dismissed`);
}

// =============================================================================
// Reactive Follow-Up Nudges
// =============================================================================

interface CreateFollowUpNudgeInput {
    userId: string;
    trackingType: 'bp' | 'glucose';
    alertLevel: 'caution' | 'warning';
    previousValue?: unknown;
}

/**
 * Create a follow-up nudge when user logs an elevated reading.
 * - Caution level: Recheck in 3 days
 * - Warning level: Recheck next day
 */
export async function createFollowUpNudge(input: CreateFollowUpNudgeInput): Promise<string | null> {
    const { userId, trackingType, alertLevel } = input;

    // Determine follow-up timing based on alert level
    const daysUntilFollowUp = alertLevel === 'warning' ? 1 : 3;

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + daysUntilFollowUp);

    // Use appropriate action type and message
    const actionType: NudgeActionType = trackingType === 'bp' ? 'log_bp' : 'log_glucose';

    const title = trackingType === 'bp'
        ? 'Blood Pressure Recheck'
        : 'Blood Sugar Recheck';

    const message = alertLevel === 'warning'
        ? `Your last reading was elevated. Let's check again today to see how things are looking. 📊`
        : `Your last reading was a bit high. Time for a follow-up check. 💙`;

    try {
        const nudgeId = await createNudge({
            userId,
            visitId: 'follow_up',
            type: 'condition_tracking',
            conditionId: trackingType === 'bp' ? 'hypertension' : 'diabetes',
            title,
            message,
            actionType,
            scheduledFor: scheduledDate,
            sequenceDay: 0,
            sequenceId: `followup_${trackingType}_${Date.now()}`,
        });

        functions.logger.info(`[LumibotAnalyzer] Created follow-up nudge for elevated ${trackingType}`, {
            userId,
            nudgeId,
            alertLevel,
            daysUntilFollowUp,
        });

        return nudgeId;
    } catch (error) {
        functions.logger.error(`[LumibotAnalyzer] Failed to create follow-up nudge:`, error);
        return null;
    }
}
