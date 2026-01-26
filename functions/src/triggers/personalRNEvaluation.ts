/**
 * Personal RN Evaluation Trigger
 * 
 * Scheduled job that evaluates patients and creates nudges based on
 * their frequency tier and current state.
 * 
 * Runs every 2 hours to check patients due for evaluation.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { evaluatePatient, FrequencyTier, FREQUENCY_INTERVALS, NudgeContent } from '../services/personalRNService';

const db = () => admin.firestore();

// =============================================================================
// Scheduled Evaluation Job
// =============================================================================

/**
 * Cloud Function that runs every 2 hours to evaluate patients.
 * Creates nudges for patients who are due based on their frequency tier.
 */
export const evaluatePatients = onSchedule(
    {
        schedule: 'every 2 hours',
        timeZone: 'America/Chicago',
    },
    async () => {
        logger.info('[PersonalRN] Starting patient evaluation job');

        try {
            // Get all patients due for evaluation
            const patientsDue = await getPatientsDueForEvaluation();

            logger.info(`[PersonalRN] Found ${patientsDue.length} patients due for evaluation`);

            let nudgesCreated = 0;
            let errors = 0;

            for (const patient of patientsDue) {
                try {
                    const result = await evaluatePatient(patient.userId);

                    if (result.shouldNudge && result.nudge) {
                        await createNudgeFromEvaluation(patient.userId, result.nudge, result.reason);
                        nudgesCreated++;
                    }

                    // Update next evaluation time
                    await updateNextEvaluation(patient.userId, result.nextEvaluationHours);

                } catch (error) {
                    logger.error(`[PersonalRN] Failed to evaluate patient ${patient.userId}:`, error);
                    errors++;
                }
            }

            logger.info('[PersonalRN] Evaluation job complete', {
                patientsEvaluated: patientsDue.length,
                nudgesCreated,
                errors,
            });

        } catch (error) {
            logger.error('[PersonalRN] Evaluation job failed:', error);
        }
    }
);

// =============================================================================
// Patient Tracking
// =============================================================================

interface PatientEvaluationRecord {
    userId: string;
    frequencyTier: FrequencyTier;
    nextEvaluationAt: admin.firestore.Timestamp;
    lastEvaluatedAt: admin.firestore.Timestamp;
}

/**
 * Get patients who are due for evaluation based on their next evaluation time.
 */
async function getPatientsDueForEvaluation(): Promise<PatientEvaluationRecord[]> {
    const now = admin.firestore.Timestamp.now();

    // Get patients due for evaluation
    const snapshot = await db()
        .collection('patientEvaluations')
        .where('nextEvaluationAt', '<=', now)
        .limit(100) // Process in batches
        .get();

    return snapshot.docs.map(doc => ({
        userId: doc.id,
        ...doc.data(),
    } as PatientEvaluationRecord));
}

/**
 * Update the next evaluation time for a patient.
 */
async function updateNextEvaluation(userId: string, hoursUntilNext: number): Promise<void> {
    const now = new Date();
    now.setHours(now.getHours() + hoursUntilNext);

    await db().collection('patientEvaluations').doc(userId).set({
        nextEvaluationAt: admin.firestore.Timestamp.fromDate(now),
        lastEvaluatedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });
}

/**
 * Create a nudge from an evaluation result.
 */
async function createNudgeFromEvaluation(
    userId: string,
    nudge: NudgeContent,
    reason: string
): Promise<void> {
    const now = admin.firestore.Timestamp.now();

    // Schedule for now (will be picked up by notification job)
    await db().collection('nudges').add({
        userId,
        type: 'condition_tracking',
        title: nudge.title,
        message: nudge.message,
        actionType: nudge.actionType,
        priority: nudge.priority,
        status: 'pending',
        scheduledFor: now,
        sequenceDay: 0,
        sequenceId: `personal_rn_${Date.now()}`,
        notificationSent: false,
        aiGenerated: true,
        evaluationReason: reason,
        createdAt: now,
        updatedAt: now,
    });
}

// =============================================================================
// Patient Registration (Called After Visit)
// =============================================================================

/**
 * Register a patient for evaluation after their first visit.
 * Called from visit processing.
 */
export async function registerPatientForEvaluation(userId: string): Promise<void> {
    const exists = await db().collection('patientEvaluations').doc(userId).get();

    if (!exists.exists) {
        // New patient - start with high frequency (new diagnosis/medication context)
        const nextEval = new Date();
        nextEval.setHours(nextEval.getHours() + FREQUENCY_INTERVALS.high);

        await db().collection('patientEvaluations').doc(userId).set({
            frequencyTier: 'high',
            nextEvaluationAt: admin.firestore.Timestamp.fromDate(nextEval),
            lastEvaluatedAt: admin.firestore.Timestamp.now(),
            registeredAt: admin.firestore.Timestamp.now(),
        });

        logger.info(`[PersonalRN] Registered patient ${userId} for evaluation`);
    }
}

/**
 * Escalate a patient to high frequency (called when concerning reading is logged).
 */
export async function escalatePatientFrequency(userId: string): Promise<void> {
    const nextEval = new Date();
    nextEval.setHours(nextEval.getHours() + FREQUENCY_INTERVALS.high);

    await db().collection('patientEvaluations').doc(userId).set({
        frequencyTier: 'high',
        nextEvaluationAt: admin.firestore.Timestamp.fromDate(nextEval),
        escalatedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });

    logger.info(`[PersonalRN] Escalated patient ${userId} to high frequency`);
}
