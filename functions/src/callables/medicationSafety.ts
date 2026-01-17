import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { runMedicationSafetyChecks } from '../services/medicationSafety';

interface AnalyzeMedicationSafetyRequest {
    visitId: string;
}

interface AnalyzeMedicationSafetyResponse {
    warnings: Array<{
        medicationName: string;
        warnings: any[];
    }>;
    updatedVisit: boolean;
}

export const analyzeMedicationSafety = onCall(
    {
        region: 'us-central1',
        timeoutSeconds: 120,
        memory: '256MiB',
        maxInstances: 20,
    },
    async (request): Promise<AnalyzeMedicationSafetyResponse> => {
        // Ensure user is authenticated
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { visitId } = request.data as AnalyzeMedicationSafetyRequest;
        const userId = request.auth.uid;

        if (!visitId) {
            throw new HttpsError('invalid-argument', 'visitId is required');
        }

        logger.info(`[analyzeMedicationSafety] Analyzing visit ${visitId} for user ${userId}`);

        try {
            const admin = await import('firebase-admin');
            const db = admin.firestore();

            // Get the visit
            const visitRef = db.collection('visits').doc(visitId);
            const visitDoc = await visitRef.get();

            if (!visitDoc.exists) {
                throw new HttpsError('not-found', 'Visit not found');
            }

            const visitData = visitDoc.data();

            // Verify ownership
            if (visitData?.userId !== userId) {
                throw new HttpsError('permission-denied', 'You do not have access to this visit');
            }

            const medications = visitData?.medications;
            if (!medications) {
                logger.info(`[analyzeMedicationSafety] No medications in visit ${visitId}`);
                return { warnings: [], updatedVisit: false };
            }

            const allWarnings: Array<{ medicationName: string; warnings: any[] }> = [];
            let visitUpdated = false;

            // Process started medications
            if (medications.started && Array.isArray(medications.started)) {
                for (const med of medications.started) {
                    if (!med.name) continue;

                    const warnings = await runMedicationSafetyChecks(
                        userId,
                        {
                            name: med.name,
                            dose: med.dose,
                            frequency: med.frequency,
                            note: med.note,
                        },
                        { useAI: true }
                    );

                    if (warnings.length > 0) {
                        allWarnings.push({
                            medicationName: med.name,
                            warnings,
                        });

                        // Update the medication entry in the visit document
                        med.warning = warnings.map(w => w.message).join(' | ');
                        med.medicationWarning = warnings;
                        visitUpdated = true;
                    }
                }
            }

            // Process changed medications
            if (medications.changed && Array.isArray(medications.changed)) {
                for (const med of medications.changed) {
                    if (!med.name) continue;

                    const warnings = await runMedicationSafetyChecks(
                        userId,
                        {
                            name: med.name,
                            dose: med.dose,
                            frequency: med.frequency,
                            note: med.note,
                        },
                        { useAI: true }
                    );

                    if (warnings.length > 0) {
                        allWarnings.push({
                            medicationName: med.name,
                            warnings,
                        });

                        // Update the medication entry in the visit document
                        med.warning = warnings.map(w => w.message).join(' | ');
                        med.medicationWarning = warnings;
                        visitUpdated = true;
                    }
                }
            }

            // Update the visit document if we found new warnings
            if (visitUpdated) {
                await visitRef.update({
                    medications,
                    lastSafetyCheckAt: admin.firestore.Timestamp.now(),
                });
                logger.info(`[analyzeMedicationSafety] Updated visit ${visitId} with ${allWarnings.length} warnings`);
            }

            return {
                warnings: allWarnings,
                updatedVisit: visitUpdated,
            };
        } catch (error) {
            logger.error(`[analyzeMedicationSafety] Error analyzing visit ${visitId}:`, error);
            throw new HttpsError('internal', 'Failed to analyze medication safety');
        }
    }
);
