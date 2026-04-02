/**
 * Care Flow Creator
 *
 * Creates care flow documents from visit processing signals.
 * Called during post-commit operations in visitProcessor.ts.
 *
 * Detection logic:
 * 1. New medications matching condition drug lists → trigger flow
 * 2. New diagnoses matching condition names → trigger flow
 * 3. Medication changes (dose, frequency) → update existing flow context
 *
 * Dedup: one active flow per user × condition.
 * If a flow already exists and it's a med change, update flow context
 * and restart at establish phase.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
    CareFlowCondition,
    CareFlowCreateInput,
    CareFlowPhase,
    CareFlowTrigger,
} from '../types/careFlows';
import {
    detectConditionFromDiagnosis,
    detectConditionFromMedication,
    getCareFlowTemplate,
} from '../data/careFlowTemplates';
import { FirestoreCareFlowRepository } from './repositories/careFlows/FirestoreCareFlowRepository';

const db = () => admin.firestore();

interface VisitSignals {
    userId: string;
    visitId: string;
    visitDate: string;
    providerName?: string;
    diagnoses: string[];
    medicationsStarted: { name: string; dose?: string; frequency?: string; id?: string }[];
    medicationsChanged: { name: string; dose?: string; frequency?: string; id?: string }[];
}

interface CreateCareFlowsResult {
    flowsCreated: number;
    flowsUpdated: number;
    signals: string[];
}

/**
 * Detect condition signals from visit data and create/update care flows.
 */
export async function createCareFlowsFromVisit(
    signals: VisitSignals,
): Promise<CreateCareFlowsResult> {
    const repo = new FirestoreCareFlowRepository(db());
    const result: CreateCareFlowsResult = {
        flowsCreated: 0,
        flowsUpdated: 0,
        signals: [],
    };

    functions.logger.info(
        `[CareFlowCreator] Evaluating visit ${signals.visitId}`,
        {
            diagnoses: signals.diagnoses,
            medsStarted: signals.medicationsStarted.map(m => m.name),
            medsChanged: signals.medicationsChanged.map(m => m.name),
        },
    );

    // Collect all condition signals with their triggers
    const conditionSignals = new Map<CareFlowCondition, {
        trigger: CareFlowTrigger;
        medicationName?: string;
        medicationId?: string;
        medicationDose?: string;
        diagnosisName?: string;
    }>();

    // Check new diagnoses
    for (const diagnosis of signals.diagnoses) {
        const condition = detectConditionFromDiagnosis(diagnosis);
        if (condition && getCareFlowTemplate(condition)) {
            conditionSignals.set(condition, {
                trigger: 'new_diagnosis',
                diagnosisName: diagnosis,
            });
            result.signals.push(`diagnosis:${diagnosis}→${condition}`);
        }
    }

    // Check started medications (overrides diagnosis signal for same condition)
    for (const med of signals.medicationsStarted) {
        const condition = detectConditionFromMedication(med.name);
        if (condition && getCareFlowTemplate(condition)) {
            conditionSignals.set(condition, {
                trigger: 'new_medication',
                medicationName: med.name,
                medicationId: med.id,
                medicationDose: med.dose,
            });
            result.signals.push(`new_med:${med.name}→${condition}`);
        }
    }

    // Check changed medications
    for (const med of signals.medicationsChanged) {
        const condition = detectConditionFromMedication(med.name);
        if (condition && getCareFlowTemplate(condition)) {
            // Only set if we don't already have a stronger signal (new_medication or new_diagnosis)
            if (!conditionSignals.has(condition)) {
                conditionSignals.set(condition, {
                    trigger: 'med_change',
                    medicationName: med.name,
                    medicationId: med.id,
                    medicationDose: med.dose,
                });
                result.signals.push(`med_change:${med.name}→${condition}`);
            }
        }
    }

    if (conditionSignals.size === 0) {
        functions.logger.info(
            `[CareFlowCreator] No condition signals detected for visit ${signals.visitId}`,
        );
        return result;
    }

    functions.logger.info(
        `[CareFlowCreator] Detected ${conditionSignals.size} condition signal(s) for visit ${signals.visitId}`,
        { signals: result.signals },
    );

    // Create or update flows for each detected condition
    for (const [condition, signal] of conditionSignals) {
        try {
            const existingFlow = await repo.findActiveByUserAndCondition(
                signals.userId,
                condition,
            );

            if (existingFlow) {
                // Flow exists — update context, restart phase, and schedule immediate touchpoint
                if (signal.trigger === 'med_change' || signal.trigger === 'new_medication') {
                    const now = admin.firestore.Timestamp.now();
                    const template = getCareFlowTemplate(condition)!;
                    const resolvedDose = signal.medicationDose || existingFlow.context.medicationDose;
                    const updates: Record<string, unknown> = {
                        ...(resolvedDose ? { 'context.medicationDose': resolvedDose } : {}),
                        'context.medicationStartDate': signals.visitDate,
                        'context.visitDate': signals.visitDate,
                        updatedAt: now,
                        // New visit with med changes → restart at understand phase with immediate touchpoint
                        phase: 'understand' as CareFlowPhase,
                        nextTouchpointAt: now,
                        nextTouchpointType: 'educate',
                        'cadence.currentIntervalDays': template.phases.establish.defaultInterval || 4,
                        'cadence.consecutiveNormalCount': 0,
                    };

                    if (signal.medicationName) {
                        updates.medicationName = signal.medicationName;
                        updates.medicationId = signal.medicationId || null;

                        // Track all medications in the flow (don't lose previous ones)
                        const existingMeds = existingFlow.context.medications || [];
                        if (!existingMeds.includes(signal.medicationName)) {
                            updates['context.medications'] = [...existingMeds, signal.medicationName];
                        }
                    }

                    await repo.update(existingFlow.id, updates as any);
                    result.flowsUpdated++;

                    functions.logger.info(
                        `[CareFlowCreator] Updated existing ${condition} flow ${existingFlow.id} for user ${signals.userId}`,
                        { trigger: signal.trigger },
                    );
                }
                continue;
            }

            // No existing flow — create new one
            const template = getCareFlowTemplate(condition)!;
            const now = admin.firestore.Timestamp.now();

            // Schedule first touchpoint
            const firstTouchpoint = template.phases.understand.touchpoints?.[0];
            const firstTouchpointType = firstTouchpoint?.type || 'educate';

            // First touchpoint is immediate (day 0) for understand phase
            const nextTouchpointAt = now;

            const input: CareFlowCreateInput = {
                userId: signals.userId,
                visitId: signals.visitId,
                trigger: signal.trigger,
                condition,
                medicationId: signal.medicationId,
                medicationName: signal.medicationName,
                diagnosisName: signal.diagnosisName,
                context: {
                    visitDate: signals.visitDate,
                    ...(signals.providerName ? { providerName: signals.providerName } : {}),
                    ...(signal.medicationDose ? { medicationDose: signal.medicationDose } : {}),
                    ...(signal.trigger === 'new_medication' ? { medicationStartDate: signals.visitDate } : {}),
                    reportedIssues: [],
                    medications: signal.medicationName ? [signal.medicationName] : [],
                },
            };

            const flowId = await repo.create({
                userId: input.userId,
                visitId: input.visitId,
                trigger: input.trigger,
                condition: input.condition,
                ...(input.medicationId ? { medicationId: input.medicationId } : {}),
                ...(input.medicationName ? { medicationName: input.medicationName } : {}),
                ...(input.diagnosisName ? { diagnosisName: input.diagnosisName } : {}),
                status: 'active',
                phase: 'understand',
                cadence: {
                    currentIntervalDays: template.phases.establish.defaultInterval || 4,
                    consecutiveNormalCount: 0,
                },
                touchpoints: [],
                nextTouchpointAt,
                nextTouchpointType: firstTouchpointType,
                context: input.context,
                createdAt: now,
                updatedAt: now,
            } as any);

            result.flowsCreated++;

            functions.logger.info(
                `[CareFlowCreator] Created ${condition} care flow ${flowId} for user ${signals.userId}`,
                { trigger: signal.trigger, visitId: signals.visitId },
            );
        } catch (error) {
            functions.logger.error(
                `[CareFlowCreator] Error creating/updating ${condition} flow for user ${signals.userId}:`,
                error,
            );
        }
    }

    return result;
}
