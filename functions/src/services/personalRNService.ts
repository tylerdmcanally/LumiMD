/**
 * Personal RN Service
 * 
 * Hybrid LumiBot approach:
 * - Rule-based frequency tiers (WHEN to check)
 * - AI-driven content generation (WHAT to say)
 * - Hardcoded safety thresholds (WHEN to escalate)
 * - Reactive triggers on health log submissions
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getPatientContext, PatientContext } from './patientContextAggregator';
import { getLumiBotAIService } from './lumibotAI';
import { NudgeActionType } from '../types/lumibot';

// =============================================================================
// Constants
// =============================================================================

const STANDARD_DISCLAIMER = "\n\n💡 This is an AI check-in, not medical advice. Contact your provider with any concerns.";
const CONCERNING_DISCLAIMER = "\n\n⚠️ Please contact your provider if symptoms are new or worsening.";

// Frequency tier check intervals (in hours)
const FREQUENCY_INTERVALS = {
    high: 24,        // Daily
    medium: 72,      // Every 3 days
    low: 168,        // Weekly
    minimal: 336,    // Every 2 weeks
} as const;

// Safety thresholds (hardcoded, not AI-determined)
const SAFETY_THRESHOLDS = {
    bp: {
        elevated: { systolic: 130, diastolic: 80 },
        warning: { systolic: 180, diastolic: 110 },
    },
    glucose: {
        low: 70,
        high: 180,
        criticalLow: 54,
        criticalHigh: 250,
    },
};

// =============================================================================
// Types
// =============================================================================

export type FrequencyTier = 'high' | 'medium' | 'low' | 'minimal';

export interface PatientState {
    userId: string;
    hasNewMedInLast14Days: boolean;
    hasNewDiagnosisInLast14Days: boolean;
    hasElevatedReading: boolean;
    hasConcerningSymptoms: boolean;
    daysSinceLastLog: number;
    hasActiveMedications: boolean;
    hasActiveConditions: boolean;
    recentDismissals: number;  // Nudges dismissed in last 7 days
}

export interface NudgeContent {
    title: string;
    message: string;
    actionType: NudgeActionType;
    priority: 'high' | 'medium' | 'low';
}

export interface EvaluationResult {
    shouldNudge: boolean;
    frequencyTier: FrequencyTier;
    nudge?: NudgeContent;
    reason: string;
    nextEvaluationHours: number;
}

// =============================================================================
// Firestore Access
// =============================================================================

const db = () => admin.firestore();

// =============================================================================
// Frequency Tier Logic (Rule-Based)
// =============================================================================

/**
 * Determine frequency tier based on patient state.
 * This is entirely rule-based, not AI-driven.
 */
export function getFrequencyTier(state: PatientState): FrequencyTier {
    // High: Needs daily monitoring
    if (state.hasNewMedInLast14Days) return 'high';
    if (state.hasNewDiagnosisInLast14Days) return 'high';
    if (state.hasElevatedReading) return 'high';
    if (state.hasConcerningSymptoms) return 'high';

    // Medium: Every 3-4 days
    if (state.daysSinceLastLog > 7) return 'medium';
    if (state.hasActiveMedications) return 'medium';

    // Low: Weekly
    if (state.hasActiveConditions) return 'low';

    // Minimal: Every 2 weeks (or back off if low engagement)
    return 'minimal';
}

/**
 * Build patient state from aggregated context.
 */
export async function buildPatientState(userId: string): Promise<PatientState> {
    const context = await getPatientContext(userId);
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Check for new medications in last 14 days
    const hasNewMedInLast14Days = context.activeMedications.some(med =>
        med.startedAt && med.startedAt > fourteenDaysAgo
    );

    // Check for new diagnoses in last 14 days (from recent visits)
    const hasNewDiagnosisInLast14Days = context.recentVisits.some(visit =>
        visit.visitDate > fourteenDaysAgo && visit.diagnoses.length > 0
    );

    // Check for elevated readings
    const hasElevatedReading = checkForElevatedReadings(context);

    // Check for concerning symptoms (from recent nudge responses)
    const hasConcerningSymptoms = context.nudgeMetrics.concerningResponsesLast30Days > 0;

    // Days since last health log
    const mostRecentLog = context.healthLogTrends.reduce((latest, trend) => {
        if (!trend.lastLoggedAt) return latest;
        if (!latest) return trend.lastLoggedAt;
        return trend.lastLoggedAt > latest ? trend.lastLoggedAt : latest;
    }, null as Date | null);

    const daysSinceLastLog = mostRecentLog
        ? Math.floor((now.getTime() - mostRecentLog.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

    // Check for recent dismissals
    const recentDismissals = await countRecentDismissals(userId, sevenDaysAgo);

    return {
        userId,
        hasNewMedInLast14Days,
        hasNewDiagnosisInLast14Days,
        hasElevatedReading,
        hasConcerningSymptoms,
        daysSinceLastLog,
        hasActiveMedications: context.activeMedications.length > 0,
        hasActiveConditions: context.recentDiagnoses.length > 0,
        recentDismissals,
    };
}

/**
 * Check if patient has elevated readings based on hardcoded thresholds.
 */
function checkForElevatedReadings(context: PatientContext): boolean {
    for (const trend of context.healthLogTrends) {
        if (trend.type === 'bp' && trend.lastValue) {
            const bp = trend.lastValue as { systolic: number; diastolic: number };
            if (bp.systolic >= SAFETY_THRESHOLDS.bp.elevated.systolic ||
                bp.diastolic >= SAFETY_THRESHOLDS.bp.elevated.diastolic) {
                return true;
            }
        }
        if (trend.type === 'glucose' && typeof trend.lastValue === 'number') {
            if (trend.lastValue < SAFETY_THRESHOLDS.glucose.low ||
                trend.lastValue > SAFETY_THRESHOLDS.glucose.high) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Count nudges dismissed in the recent period.
 */
async function countRecentDismissals(userId: string, since: Date): Promise<number> {
    const snapshot = await db()
        .collection('nudges')
        .where('userId', '==', userId)
        .where('status', '==', 'dismissed')
        .where('dismissedAt', '>=', admin.firestore.Timestamp.fromDate(since))
        .get();

    return snapshot.size;
}

// =============================================================================
// AI Content Generation
// =============================================================================

/**
 * Generate personalized nudge content using AI.
 * Falls back to templates if AI fails.
 */
export async function generateNudgeContent(
    context: PatientContext,
    purpose: 'checkin' | 'follow_up' | 'elevated_reading',
    options?: { medicationName?: string; conditionId?: string }
): Promise<NudgeContent> {
    try {
        const aiService = getLumiBotAIService();

        // Determine action type based on purpose
        let actionType: NudgeActionType = 'feeling_check';

        if (purpose === 'elevated_reading') {
            // Find which reading is elevated
            for (const trend of context.healthLogTrends) {
                if (trend.type === 'bp') {
                    actionType = 'log_bp';
                    break;
                }
                if (trend.type === 'glucose') {
                    actionType = 'log_glucose';
                    break;
                }
            }
        }

        // Generate message with AI
        const result = await aiService.generateCheckInMessage({
            nudgeType: 'condition_tracking',
            conditionId: options?.conditionId,
            medicationName: options?.medicationName,
            patientContext: context,
            daysSinceLastLog: getDaysSinceLastLog(context),
        });

        // Append disclaimer
        const disclaimer = purpose === 'elevated_reading' ? CONCERNING_DISCLAIMER : STANDARD_DISCLAIMER;

        return {
            title: result.title,
            message: result.message + disclaimer,
            actionType,
            priority: purpose === 'elevated_reading' ? 'high' : 'medium',
        };
    } catch (error) {
        functions.logger.error('[PersonalRN] AI content generation failed, using fallback:', error);
        return getFallbackNudgeContent(context, purpose);
    }
}

/**
 * Fallback content if AI is unavailable.
 */
function getFallbackNudgeContent(
    context: PatientContext,
    purpose: 'checkin' | 'follow_up' | 'elevated_reading'
): NudgeContent {
    if (purpose === 'elevated_reading') {
        return {
            title: 'Quick Health Check',
            message: "Your recent reading was a bit off. Let's log another to see how things are going." + CONCERNING_DISCLAIMER,
            actionType: 'log_bp',
            priority: 'high',
        };
    }

    if (context.activeMedications.length > 0) {
        const recentMed = context.activeMedications[0];
        return {
            title: 'Medication Check-in',
            message: `How's it going with ${recentMed.name}? Let us know how you're feeling.` + STANDARD_DISCLAIMER,
            actionType: 'feeling_check',
            priority: 'medium',
        };
    }

    return {
        title: 'Health Check-in',
        message: "How are you feeling today? Take a moment to log how things are going." + STANDARD_DISCLAIMER,
        actionType: 'feeling_check',
        priority: 'low',
    };
}

function getDaysSinceLastLog(context: PatientContext): number {
    const now = new Date();
    for (const trend of context.healthLogTrends) {
        if (trend.lastLoggedAt) {
            const days = Math.floor((now.getTime() - trend.lastLoggedAt.getTime()) / (24 * 60 * 60 * 1000));
            return days;
        }
    }
    return 999;
}

// =============================================================================
// Main Evaluation Function
// =============================================================================

/**
 * Evaluate whether a patient needs a nudge today.
 * Called by the scheduled job.
 */
export async function evaluatePatient(userId: string): Promise<EvaluationResult> {
    try {
        const state = await buildPatientState(userId);
        const frequencyTier = getFrequencyTier(state);
        const nextEvaluationHours = FREQUENCY_INTERVALS[frequencyTier];

        // Check if we should skip due to recent dismissals (low engagement)
        if (state.recentDismissals >= 3) {
            return {
                shouldNudge: false,
                frequencyTier: 'minimal',
                reason: 'Low engagement - 3+ recent dismissals',
                nextEvaluationHours: FREQUENCY_INTERVALS.minimal,
            };
        }

        // Check if there's a pending active nudge
        const hasActiveNudge = await checkForActiveNudge(userId);
        if (hasActiveNudge) {
            return {
                shouldNudge: false,
                frequencyTier,
                reason: 'Already has active nudge',
                nextEvaluationHours: 24, // Re-check tomorrow
            };
        }

        // Determine purpose based on state
        let purpose: 'checkin' | 'follow_up' | 'elevated_reading' = 'checkin';
        if (state.hasElevatedReading) {
            purpose = 'elevated_reading';
        } else if (state.hasConcerningSymptoms) {
            purpose = 'follow_up';
        }

        // Generate content
        const context = await getPatientContext(userId);
        const nudge = await generateNudgeContent(context, purpose);

        return {
            shouldNudge: true,
            frequencyTier,
            nudge,
            reason: `Tier ${frequencyTier}: ${getReasonDescription(state)}`,
            nextEvaluationHours,
        };
    } catch (error) {
        functions.logger.error('[PersonalRN] Evaluation failed:', error);
        return {
            shouldNudge: false,
            frequencyTier: 'low',
            reason: 'Evaluation error',
            nextEvaluationHours: 24,
        };
    }
}

async function checkForActiveNudge(userId: string): Promise<boolean> {
    const snapshot = await db()
        .collection('nudges')
        .where('userId', '==', userId)
        .where('status', 'in', ['pending', 'active', 'snoozed'])
        .limit(1)
        .get();

    return !snapshot.empty;
}

function getReasonDescription(state: PatientState): string {
    if (state.hasElevatedReading) return 'elevated reading';
    if (state.hasNewMedInLast14Days) return 'new medication';
    if (state.hasNewDiagnosisInLast14Days) return 'new diagnosis';
    if (state.hasConcerningSymptoms) return 'concerning symptoms';
    if (state.daysSinceLastLog > 7) return 'no recent logs';
    if (state.hasActiveMedications) return 'active medications';
    return 'routine check';
}

// =============================================================================
// Reactive Trigger (Called from Health Logs)
// =============================================================================

/**
 * Create an immediate follow-up nudge when an elevated reading is logged.
 * Called reactively from health log creation.
 */
export async function createReactiveNudge(
    userId: string,
    logType: 'bp' | 'glucose',
    value: { systolic?: number; diastolic?: number; reading?: number }
): Promise<void> {
    // Check if reading is elevated
    let isElevated = false;
    let isCritical = false;

    if (logType === 'bp' && value.systolic && value.diastolic) {
        isElevated = value.systolic >= SAFETY_THRESHOLDS.bp.elevated.systolic ||
            value.diastolic >= SAFETY_THRESHOLDS.bp.elevated.diastolic;
        isCritical = value.systolic >= SAFETY_THRESHOLDS.bp.warning.systolic ||
            value.diastolic >= SAFETY_THRESHOLDS.bp.warning.diastolic;
    } else if (logType === 'glucose' && value.reading !== undefined) {
        isElevated = value.reading < SAFETY_THRESHOLDS.glucose.low ||
            value.reading > SAFETY_THRESHOLDS.glucose.high;
        isCritical = value.reading < SAFETY_THRESHOLDS.glucose.criticalLow ||
            value.reading > SAFETY_THRESHOLDS.glucose.criticalHigh;
    }

    if (!isElevated) return;

    // Generate follow-up nudge content
    const context = await getPatientContext(userId);
    const nudge = await generateNudgeContent(context, 'elevated_reading');

    // Schedule for 4 hours from now (give patient time to rest/retest)
    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + (isCritical ? 1 : 4));

    const now = admin.firestore.Timestamp.now();

    await db().collection('nudges').add({
        userId,
        type: 'followup',
        title: nudge.title,
        message: nudge.message,
        actionType: nudge.actionType,
        priority: isCritical ? 'high' : nudge.priority,
        status: 'pending',
        scheduledFor: admin.firestore.Timestamp.fromDate(scheduledFor),
        sequenceDay: 0,
        sequenceId: `reactive_${logType}_${Date.now()}`,
        notificationSent: false,
        aiGenerated: true,
        reactiveTriggered: true,
        triggerReason: `Elevated ${logType} reading`,
        createdAt: now,
        updatedAt: now,
    });

    functions.logger.info(`[PersonalRN] Created reactive nudge for elevated ${logType}`, {
        userId,
        isCritical,
        scheduledFor: scheduledFor.toISOString(),
    });
}

// =============================================================================
// Exports for Scheduled Job
// =============================================================================

export { SAFETY_THRESHOLDS, FREQUENCY_INTERVALS };
