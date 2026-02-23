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
    getConditionsCoveredByMedications,
} from '../data/medicationClasses';
import { VisitSummaryResult, MedicationChangeEntry } from './openai';
import { NudgeDomainService } from './domain/nudges/NudgeDomainService';
import { FirestoreNudgeRepository } from './repositories/nudges/FirestoreNudgeRepository';


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
const getNudgeDomainService = () => new NudgeDomainService(new FirestoreNudgeRepository(db()));

// =============================================================================
// Rate Limiting & Deduplication Helpers
// =============================================================================

const MIN_HOURS_BETWEEN_NUDGES = 4;

/**
 * Check if user already has pending/active nudges for this condition
 */
async function hasExistingConditionNudges(userId: string, conditionId: string): Promise<boolean> {
    const nudgeService = getNudgeDomainService();
    return nudgeService.hasByUserConditionAndStatuses(userId, conditionId, [
        'pending',
        'active',
        'snoozed',
    ]);
}

/**
 * Find a suitable time slot that's at least 4 hours from existing nudges
 */
async function findAvailableTimeSlot(userId: string, preferredDate: Date): Promise<Date> {
    // Get all pending nudges for this user in the next 48 hours
    const startDate = new Date(preferredDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(preferredDate);
    endDate.setDate(endDate.getDate() + 2);

    const nudgeService = getNudgeDomainService();
    const existingNudges = await nudgeService.listByUserStatusesScheduledBetween(
        userId,
        ['pending', 'active'],
        admin.firestore.Timestamp.fromDate(startDate),
        admin.firestore.Timestamp.fromDate(endDate),
    );

    const existingTimes: Date[] = existingNudges
        .map((nudge) => (nudge.scheduledFor as admin.firestore.Timestamp | undefined)?.toDate?.())
        .filter((value): value is Date => value instanceof Date);

    // Check if preferredDate is far enough from existing nudges
    let candidateDate = new Date(preferredDate);

    for (let attempt = 0; attempt < 6; attempt++) { // Try up to 6 shifts (24 hours)
        const tooClose = existingTimes.some(existingTime => {
            const diffHours = Math.abs(candidateDate.getTime() - existingTime.getTime()) / (1000 * 60 * 60);
            return diffHours < MIN_HOURS_BETWEEN_NUDGES;
        });

        if (!tooClose) {
            return candidateDate;
        }

        // Shift by 4 hours and try again
        candidateDate = new Date(candidateDate.getTime() + MIN_HOURS_BETWEEN_NUDGES * 60 * 60 * 1000);
    }

    // If no good slot found, return original (rare edge case)
    return preferredDate;
}

/**
 * Check if user already has pending/active nudges for this medication
 */
async function hasExistingMedicationNudges(userId: string, medicationName: string): Promise<boolean> {
    const nudgeService = getNudgeDomainService();
    return nudgeService.hasByUserMedicationNameAndStatuses(userId, medicationName, [
        'pending',
        'active',
        'snoozed',
    ]);
}

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

    // AI-generated content fields
    if (input.aiGenerated) nudge.aiGenerated = true;
    if (input.diagnosisExplanation) nudge.diagnosisExplanation = input.diagnosisExplanation;
    if (input.personalizedContext) nudge.personalizedContext = input.personalizedContext;

    const nudgeService = getNudgeDomainService();
    const docRef = await nudgeService.createRecord(nudge);

    functions.logger.info(`[LumibotAnalyzer] Created nudge ${docRef.id}`, {
        userId: input.userId,
        type: input.type,
        title: input.title,
        scheduledFor: input.scheduledFor.toISOString(),
        aiGenerated: input.aiGenerated || false,
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
    medications?: string[];  // All medications from visit for context
}

async function createIntroductionNudge(params: IntroNudgeParams): Promise<string> {
    const { userId, visitId, conditionName, medicationName, isNewMedication, medications } = params;

    // Initialize with defaults to satisfy TypeScript
    let title = 'LumiBot is Here to Help';
    let message = 'I noticed some updates from your recent visit. I\'ll be checking in to help you track your progress.';
    let diagnosisExplanation: string | undefined;
    let aiGenerated = false;

    // Try AI generation first for diagnoses
    if (conditionName) {
        try {
            // Dynamic import to avoid circular dependencies
            const { getLumiBotAIService } = await import('./lumibotAI');
            const { getPatientContextLight } = await import('./patientContextAggregator');

            const [aiService, patientContext] = await Promise.all([
                Promise.resolve(getLumiBotAIService()),
                getPatientContextLight(userId).catch(() => undefined),
            ]);

            const aiResult = await aiService.generateDiagnosisIntroduction({
                diagnosis: conditionName,
                medications: medications || (medicationName ? [medicationName] : undefined),
                patientContext,
            });

            title = aiResult.title;
            message = aiResult.message;
            diagnosisExplanation = aiResult.explanation || undefined;
            aiGenerated = true;

            functions.logger.info(`[LumibotAnalyzer] AI generated intro nudge for ${conditionName}`);
        } catch (error) {
            functions.logger.warn(`[LumibotAnalyzer] AI generation failed, using template:`, error);
            // Fall through to template generation below
        }
    }

    // Template fallback if AI didn't generate
    if (!aiGenerated) {
        if (conditionName && medicationName) {
            // Both condition and medication
            title = 'LumiBot is Here to Help';
            message = `I noticed your provider discussed ${conditionName} and started you on ${medicationName}. I'll be checking in periodically to see how things are going and help you track your progress.`;
        } else if (conditionName) {
            // Condition only
            title = 'LumiBot is Here to Help';
            message = `I see your provider discussed ${conditionName} during your visit. I'll be checking in to help you monitor and track your progress.`;
        } else if (medicationName && isNewMedication) {
            // New medication only
            title = 'New Medication Started';
            message = `I noticed your provider started you on ${medicationName}. I'll be checking in over the next few weeks to see how it's working for you.`;
        } else if (medicationName) {
            // Changed medication
            title = 'Medication Update';
            message = `I see your provider made a change to your ${medicationName}. I'll check in to see how the adjustment is going.`;
        } else {
            // Generic fallback
            title = 'LumiBot is Here to Help';
            message = 'I noticed some updates from your recent visit. I\'ll be checking in to help you track your progress.';
        }
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
        aiGenerated,
        diagnosisExplanation,
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
    // Deduplication: Check if user already has pending nudges for this condition
    const hasExisting = await hasExistingConditionNudges(userId, protocol.id);
    if (hasExisting) {
        functions.logger.info(`[LumibotAnalyzer] Skipping condition ${protocol.id} - user already has pending nudges`);
        return 0;
    }

    const sequenceId = `${protocol.id}_${visitId}_${generateShortId()}`;
    let nudgesCreated = 0;

    // Get primary tracking type for this condition
    const primaryTracking = protocol.tracking[0];
    const actionType = getActionTypeForTracking(primaryTracking.type);

    for (const scheduleItem of protocol.nudgeSchedule) {
        // Calculate scheduled date
        let scheduledDate = new Date(visitDate);
        scheduledDate.setDate(scheduledDate.getDate() + scheduleItem.day);

        // Try AI-generated message once per schedule item, fall back to template
        let title = protocol.name;
        let message = scheduleItem.message;
        let aiGenerated = false;

        try {
            const { getIntelligentNudgeGenerator } = await import('./intelligentNudgeGenerator');
            const generator = getIntelligentNudgeGenerator();
            const aiNudge = await generator.generateNudge(userId, {
                type: 'condition_tracking',
                trigger: 'log_reading',
                conditionId: protocol.id,
            });
            title = aiNudge.title;
            message = aiNudge.message;
            aiGenerated = true;
        } catch (error) {
            functions.logger.warn(`[LumibotAnalyzer] AI condition nudge failed, using template:`, error);
        }

        // Only create nudge if it's in the future
        if (scheduledDate > new Date()) {
            // Smart scheduling: Find time slot 4+ hours from other nudges
            scheduledDate = await findAvailableTimeSlot(userId, scheduledDate);

            await createNudge({
                userId,
                visitId,
                type: 'condition_tracking',
                conditionId: protocol.id,
                title,
                message,
                actionType,
                scheduledFor: scheduledDate,
                sequenceDay: scheduleItem.day,
                sequenceId,
                aiGenerated,
            });
            nudgesCreated++;
        }

        // Handle recurring nudges - create next 4 occurrences
        if (scheduleItem.recurring && scheduleItem.interval) {
            for (let i = 1; i <= 4; i++) {
                let recurringDate = new Date(scheduledDate);
                recurringDate.setDate(recurringDate.getDate() + (scheduleItem.interval * i));

                if (recurringDate > new Date()) {
                    // Smart scheduling for recurring nudges too
                    recurringDate = await findAvailableTimeSlot(userId, recurringDate);

                    // Use same AI-generated content for recurring (avoid multiple API calls)
                    await createNudge({
                        userId,
                        visitId,
                        type: 'condition_tracking',
                        conditionId: protocol.id,
                        title,
                        message,
                        actionType,
                        scheduledFor: recurringDate,
                        sequenceDay: scheduleItem.day + (scheduleItem.interval * i),
                        sequenceId,
                        aiGenerated,
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
// Medication Nudge Generation (Simplified - Personal RN handles check-ins)
// =============================================================================

/**
 * Register patient for Personal RN evaluation when medication is started/changed.
 * The Personal RN scheduled job will handle ongoing check-ins based on frequency tier.
 */
async function createMedicationNudges(
    userId: string,
    visitId: string,
    medication: MedicationChangeEntry,
    trigger: 'medication_started' | 'medication_changed',
    _visitDate: Date,
    _abbreviated: boolean = false
): Promise<number> {
    const medicationName = typeof medication === 'string'
        ? medication
        : medication.name;

    // Deduplication: Check if user already has pending nudges for this medication
    const hasExisting = await hasExistingMedicationNudges(userId, medicationName);
    if (hasExisting) {
        functions.logger.info(`[LumibotAnalyzer] Skipping medication ${medicationName} - user already has pending nudges`);
        return 0;
    }

    // Register patient for Personal RN evaluation (handles ongoing check-ins)
    try {
        const { registerPatientForEvaluation } = await import('../triggers/personalRNEvaluation');
        await registerPatientForEvaluation(userId);
        functions.logger.info(`[LumibotAnalyzer] Registered patient for Personal RN evaluation`, {
            userId,
            medicationName,
            trigger,
        });
    } catch (error) {
        functions.logger.error('[LumibotAnalyzer] Failed to register for Personal RN:', error);
    }

    // Note: No hardcoded sequences created. Personal RN scheduler handles check-ins
    // based on frequency tier (high for new meds in first 14 days).

    return 0; // No nudges created here - Personal RN handles it
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

    // 1. Process new medications (first gets full sequence, rest abbreviated)
    const startedMeds = summary.medications?.started || [];
    for (let i = 0; i < startedMeds.length; i++) {
        const med = startedMeds[i];
        const medName = typeof med === 'string' ? med : med.name;
        result.newMedications.push(medName);

        // First medication gets full sequence, subsequent get abbreviated to reduce noise
        const abbreviated = i > 0;

        const nudgesCreated = await createMedicationNudges(
            userId,
            visitId,
            med,
            'medication_started',
            effectiveVisitDate,
            abbreviated
        );
        result.medicationNudges += nudgesCreated;
    }

    // 2. Process changed medications (all abbreviated if there were new meds)
    const changedMeds = summary.medications?.changed || [];
    for (let i = 0; i < changedMeds.length; i++) {
        const med = changedMeds[i];
        const medName = typeof med === 'string' ? med : med.name;
        result.changedMedications.push(medName);

        // Abbreviate if there were started meds, or if this isn't the first changed med
        const abbreviated = startedMeds.length > 0 || i > 0;

        const nudgesCreated = await createMedicationNudges(
            userId,
            visitId,
            med,
            'medication_changed',
            effectiveVisitDate,
            abbreviated
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
        const nudgeService = getNudgeDomainService();
        const hasExistingNudges = await nudgeService.hasByUserConditionAndStatuses(
            userId,
            protocol.id,
            ['pending', 'active', 'snoozed'],
        );

        if (!hasExistingNudges) {
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
    const nudgeService = getNudgeDomainService();
    const now = admin.firestore.Timestamp.now();

    const activeNudges = await nudgeService.listActiveByUser(userId, {
        now,
        limit: 10,
    });

    return activeNudges.map((nudge) => ({ ...nudge } as Nudge));
}

// =============================================================================
// Nudge Status Updates
// =============================================================================

export async function completeNudge(
    nudgeId: string,
    responseValue?: string | Record<string, unknown>
): Promise<void> {
    const nudgeService = getNudgeDomainService();
    await nudgeService.completeById(nudgeId, {
        now: admin.firestore.Timestamp.now(),
        responseValue,
    });

    functions.logger.info(`[LumibotAnalyzer] Nudge ${nudgeId} completed`);
}

export async function snoozeNudge(
    nudgeId: string,
    snoozeDays: number = 1
): Promise<void> {
    const now = admin.firestore.Timestamp.now();
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + snoozeDays);

    const nudgeService = getNudgeDomainService();
    await nudgeService.snoozeById(nudgeId, {
        now,
        snoozedUntil: admin.firestore.Timestamp.fromDate(snoozedUntil),
    });

    functions.logger.info(`[LumibotAnalyzer] Nudge ${nudgeId} snoozed for ${snoozeDays} days`);
}

export async function dismissNudge(nudgeId: string): Promise<void> {
    const nudgeService = getNudgeDomainService();
    await nudgeService.dismissById(nudgeId, {
        now: admin.firestore.Timestamp.now(),
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
        ? `Your last reading was elevated. Let's check again today to see how things are looking.`
        : `Your last reading was a bit high. Time for a follow-up check.`;

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

// =============================================================================
// Insight Nudges (Trend Detection)
// =============================================================================

interface CreateInsightNudgeInput {
    userId: string;
    type: 'weight' | 'bp' | 'glucose';
    pattern: string;
    severity: string;
    title: string;
    message: string;
}

/**
 * Create an insight nudge when a trend pattern is detected.
 * These are informational nudges with lifestyle suggestions.
 */
export async function createInsightNudge(input: CreateInsightNudgeInput): Promise<string | null> {
    const { userId, type, pattern, severity, title, message } = input;

    // Don't create nudge if we recently created one for this pattern
    const nudgeService = getNudgeDomainService();
    const hasRecentInsight = await nudgeService.hasRecentInsightByPattern(
        userId,
        `${type}_${pattern}`,
        admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // Last 3 days
        ),
    );

    if (hasRecentInsight) {
        functions.logger.info(`[LumibotAnalyzer] Skipping duplicate insight nudge`, {
            userId,
            pattern: `${type}_${pattern}`,
        });
        return null;
    }

    // Schedule for now (immediate visibility)
    const scheduledDate = new Date();
    scheduledDate.setSeconds(scheduledDate.getSeconds() + 10);

    try {
        const nudgeId = await createNudge({
            userId,
            visitId: 'insight',
            type: 'insight',
            conditionId: `${type}_${pattern}`, // Used for deduplication
            title,
            message,
            actionType: 'view_insight',
            scheduledFor: scheduledDate,
            sequenceDay: 0,
            sequenceId: `insight_${type}_${Date.now()}`,
        });

        functions.logger.info(`[LumibotAnalyzer] Created insight nudge`, {
            userId,
            nudgeId,
            type,
            pattern,
            severity,
        });

        return nudgeId;
    } catch (error) {
        functions.logger.error(`[LumibotAnalyzer] Failed to create insight nudge:`, error);
        return null;
    }
}

// =============================================================================
// AI-Powered Delta Analysis (New)
// =============================================================================

export interface DeltaAnalysisResult {
    nudgesCreated: number;
    reasoning: string;
    conditionsAdded: string[];
    trackingEnabled: string[];
}

/**
 * Analyze a visit using AI delta analysis.
 * 
 * This is the new intelligent approach that:
 * 1. Fetches patient's existing medical context
 * 2. Uses AI to compare with new visit data
 * 3. Creates only nudges for genuinely new/changed items
 */
export async function analyzeVisitWithDelta(
    userId: string,
    visitId: string,
    summary: VisitSummaryResult,
    visitDate?: Date
): Promise<DeltaAnalysisResult> {
    const effectiveVisitDate = visitDate || new Date();

    functions.logger.info(`[LumibotAnalyzer] Starting delta analysis for visit ${visitId}`);

    try {
        // Dynamic import to avoid circular dependencies
        const { getDeltaAnalyzer } = await import('./deltaAnalyzer');

        // Build visit data for analysis
        const visitForAnalysis = {
            visitId,
            visitDate: effectiveVisitDate,
            summaryText: summary.summary || '',
            diagnoses: summary.diagnoses || [],
            medicationsStarted: (summary.medications?.started || []).map(m => ({
                name: typeof m === 'string' ? m : m.name,
                dose: typeof m === 'string' ? undefined : m.dose,
                frequency: typeof m === 'string' ? undefined : m.frequency,
            })),
            medicationsChanged: (summary.medications?.changed || []).map(m => ({
                name: typeof m === 'string' ? m : m.name,
                change: typeof m === 'string' ? undefined : m.note,
            })),
            medicationsStopped: (summary.medications?.stopped || []).map(m =>
                typeof m === 'string' ? m : m.name
            ),
        };

        // Run delta analysis
        const analyzer = getDeltaAnalyzer();
        const { analysis } = await analyzer.analyzeAndUpdateContext(
            userId,
            visitForAnalysis
        );

        // Create nudges based on AI recommendations
        let nudgesCreated = 0;

        for (const rec of analysis.nudgesToCreate) {
            try {
                // Determine scheduled date based on urgency
                const scheduledFor = new Date(effectiveVisitDate);
                switch (rec.urgency) {
                    case 'immediate':
                        scheduledFor.setSeconds(scheduledFor.getSeconds() + 10);
                        break;
                    case 'day1':
                        scheduledFor.setDate(scheduledFor.getDate() + 1);
                        break;
                    case 'day3':
                        scheduledFor.setDate(scheduledFor.getDate() + 3);
                        break;
                    case 'week1':
                        scheduledFor.setDate(scheduledFor.getDate() + 7);
                        break;
                }

                // Create the nudge
                await createNudge({
                    userId,
                    visitId,
                    type: rec.type,
                    conditionId: rec.conditionId,
                    medicationName: rec.medicationName,
                    title: getNudgeTitle(rec),
                    message: getNudgeMessage(rec),
                    actionType: getActionTypeForNudge(rec),
                    scheduledFor,
                    sequenceDay: 0,
                    sequenceId: `delta_${visitId}_${nudgesCreated}`,
                    aiGenerated: true,
                    personalizedContext: rec.reason,
                });

                nudgesCreated++;
            } catch (error) {
                functions.logger.error(`[LumibotAnalyzer] Failed to create nudge from delta:`, error);
            }
        }

        functions.logger.info(`[LumibotAnalyzer] Delta analysis complete`, {
            userId,
            visitId,
            nudgesCreated,
            reasoning: analysis.reasoning,
        });

        return {
            nudgesCreated,
            reasoning: analysis.reasoning,
            conditionsAdded: analysis.contextUpdates.newConditions,
            trackingEnabled: analysis.contextUpdates.trackingToEnable,
        };

    } catch (error) {
        functions.logger.error(`[LumibotAnalyzer] Delta analysis failed, falling back to legacy:`, error);

        // Fall back to legacy analysis
        const legacyResult = await analyzeVisitForNudges(userId, visitId, summary, visitDate);

        return {
            nudgesCreated: legacyResult.conditionNudges + legacyResult.medicationNudges,
            reasoning: 'Fallback to legacy analysis',
            conditionsAdded: legacyResult.matchedConditions,
            trackingEnabled: [],
        };
    }
}

// Helper functions for delta-based nudge creation

function getNudgeTitle(rec: { type: string; medicationName?: string; conditionId?: string }): string {
    switch (rec.type) {
        case 'introduction':
            return 'LumiBot is Here to Help';
        case 'medication_checkin':
            return rec.medicationName ? `${rec.medicationName} Check-in` : 'Medication Check';
        case 'condition_tracking':
            return 'Time to Log';
        case 'followup':
            return 'Follow-up Check';
        default:
            return 'Health Check-in';
    }
}

function getNudgeMessage(rec: { type: string; reason: string; medicationName?: string }): string {
    switch (rec.type) {
        case 'introduction':
            return "I noticed some changes from your visit. I'll be checking in to help you track your progress.";
        case 'medication_checkin':
            return rec.medicationName
                ? `How's it going with ${rec.medicationName}? Let us know how you're feeling.`
                : "Let's check in on your medications.";
        case 'condition_tracking':
            return "Time to log a reading to track your progress.";
        case 'followup':
            return "Checking back in - how are things going?";
        default:
            return rec.reason || "Time for a health check-in.";
    }
}

function getActionTypeForNudge(rec: { type: string; trackingType?: string }): NudgeActionType {
    if (rec.trackingType) {
        switch (rec.trackingType) {
            case 'bp': return 'log_bp';
            case 'glucose': return 'log_glucose';
            case 'weight': return 'log_weight';
            case 'symptoms': return 'symptom_check';
        }
    }

    switch (rec.type) {
        case 'introduction':
            return 'acknowledge';
        case 'medication_checkin':
            return 'feeling_check';
        case 'condition_tracking':
            return 'symptom_check';
        default:
            return 'acknowledge';
    }
}
