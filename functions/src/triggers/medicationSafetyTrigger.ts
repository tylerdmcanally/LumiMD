import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { runMedicationSafetyChecks, addSafetyWarningsToEntry } from '../services/medicationSafety';
import { MedicationChangeEntry } from '../services/openai';

export const onMedicationWritten = functions.firestore
    .document('medications/{medicationId}')
    .onWrite(async (change, context) => {
        const db = admin.firestore();
        const newData = change.after.exists ? change.after.data() : null;
        const oldData = change.before.exists ? change.before.data() : null;

        if (!newData) {
            // Document deleted
            return;
        }

        // Only run checks if:
        // 1. Medication is active
        // 2. It's a new medication OR the name/dose/frequency changed
        // 3. We haven't already run checks (check for a flag or compare timestamps)
        // To avoid infinite loops, we'll check if the 'medicationWarning' field is what triggered this.
        // A simple way is to check if the relevant fields changed.

        const isNew = !oldData;
        const doseChanged = Boolean(oldData && newData.dose !== oldData.dose);
        const freqChanged = Boolean(oldData && newData.frequency !== oldData.frequency);
        const nameChanged = Boolean(oldData && newData.name !== oldData.name);
        const activeChanged = Boolean(oldData && newData.active !== oldData.active);
        const notesChanged = Boolean(oldData && newData.notes !== oldData.notes);

        const hasRelevantChange =
            isNew || nameChanged || doseChanged || freqChanged || activeChanged || notesChanged;

        if (!hasRelevantChange) {
            functions.logger.debug(
                `[medicationSafetyTrigger] Skipping ${context.params.medicationId} — no relevant changes.`,
            );
            return;
        }

        if (!newData.active) {
            return;
        }

        const medicationId = context.params.medicationId;
        const userId = newData.userId;
        const source = (newData.source || '').toLowerCase();

        // API layer already runs safety checks for manual meds, so avoid double-checking here
        if (source === 'manual') {
            functions.logger.info(
                `[medicationSafetyTrigger] Skipping manual medication ${medicationId} (${newData.name})`,
            );
            return;
        }

        functions.logger.info(`[medicationSafetyTrigger] Running safety checks for ${medicationId} (${newData.name})`);

        try {
            // Construct MedicationChangeEntry
            const entry: MedicationChangeEntry = {
                name: newData.name,
                dose: newData.dose,
                frequency: newData.frequency,
                note: newData.notes,
                display: newData.display,
                original: newData.originalText,
                status: newData.medicationStatus,
            };

            // Run safety checks (with AI)
            const warnings = await runMedicationSafetyChecks(userId, entry, { useAI: true });

            // Process warnings
            const entryWithWarnings = addSafetyWarningsToEntry(entry, warnings);

            // Prepare updates
            const updates: any = {
                medicationWarning: entryWithWarnings.warning || null,
                needsConfirmation: entryWithWarnings.needsConfirmation || false,
                lastSafetyCheckAt: admin.firestore.Timestamp.now(),
            };

            // Update the medication document
            await change.after.ref.update(updates);

            // If this medication came from a visit, update the visit document too
            if (newData.sourceVisitId) {
                const visitRef = db.collection('visits').doc(newData.sourceVisitId);
                const visitDoc = await visitRef.get();

                if (visitDoc.exists) {
                    const visitData = visitDoc.data();
                    const medications = visitData?.medications;

                    if (medications) {
                        let updated = false;

                        // Helper to update matching med in a list
                        const updateList = (list: any[]) => {
                            if (!Array.isArray(list)) return list;
                            return list.map(item => {
                                // Match by name (and maybe dose/freq if needed, but name is usually sufficient for the summary list)
                                if (item.name === newData.name) {
                                    updated = true;
                                    return {
                                        ...item,
                                        warning: entryWithWarnings.warning || null,
                                        needsConfirmation: entryWithWarnings.needsConfirmation || false,
                                    };
                                }
                                return item;
                            });
                        };

                        const newMedications = {
                            started: updateList(medications.started),
                            stopped: updateList(medications.stopped), // Usually stopped meds don't need warnings, but consistent data is good
                            changed: updateList(medications.changed),
                        };

                        if (updated) {
                            await visitRef.update({ medications: newMedications });
                            functions.logger.info(`[medicationSafetyTrigger] Updated visit ${newData.sourceVisitId} with warnings for ${newData.name}`);
                        }
                    }
                }
            }

        } catch (error) {
            functions.logger.error(`[medicationSafetyTrigger] Error processing ${medicationId}:`, error);
        }
    });
