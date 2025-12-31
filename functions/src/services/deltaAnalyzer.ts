/**
 * Delta Analyzer Service
 * 
 * Uses AI to analyze the difference between a patient's existing medical context
 * and new visit data to determine what nudges should be created.
 * 
 * This is the "brain" that intelligently determines what's truly new or changed.
 */

import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import { withRetry } from '../utils/retryUtils';
import {
    PatientMedicalContext,
    getPatientMedicalContext,
    getContextSummaryForAI,
    VisitContextUpdate,
    updatePatientContextFromVisit,
    TrackingType,
} from './patientMedicalContext';
import { NudgeType } from '../types/lumibot';

const BASE_URL = 'https://api.openai.com/v1';

// =============================================================================
// Types
// =============================================================================

export type NudgeUrgency = 'immediate' | 'day1' | 'day3' | 'week1';

export interface NudgeRecommendation {
    type: NudgeType;
    reason: string;
    conditionId?: string;
    medicationName?: string;
    trackingType?: TrackingType;
    urgency: NudgeUrgency;
    isNewDiagnosis?: boolean;
}

export interface ContextUpdateRecommendation {
    newConditions: string[];
    trackingToEnable: TrackingType[];
}

export interface DeltaAnalysisResult {
    nudgesToCreate: NudgeRecommendation[];
    contextUpdates: ContextUpdateRecommendation;
    reasoning: string;
}

export interface VisitSummaryForAnalysis {
    visitId: string;
    visitDate: Date;
    summaryText: string;
    diagnoses: string[];
    medicationsStarted: { name: string; dose?: string; frequency?: string }[];
    medicationsChanged: { name: string; change?: string }[];
    medicationsStopped: string[];
}

// =============================================================================
// AI Prompt
// =============================================================================

const DELTA_ANALYSIS_PROMPT = `You are analyzing a patient visit to determine what health nudges to create.

CORE PHILOSOPHY: Less is more. Only create nudges for ESSENTIAL follow-up. Do NOT overwhelm the patient.

STRICT RULES:
1. MAX 2 NUDGES per visit - prioritize what matters most
2. For NEW diagnoses: create ONE "introduction" nudge that mentions ALL new conditions together
3. For NEW diagnoses: do NOT create condition_tracking nudges yet - wait for day3/week1
4. For CHANGED medications: create ONE "followup" nudge about the change
5. For EXISTING conditions with new meds: can create condition_tracking for that condition
6. 24-HOUR COOL-DOWN: Do NOT create tracking nudges for types already logged today (see recentlyLogged)
7. ONBOARDING TIMELINE: For conditions diagnosed less than 7 days ago, no tracking nudges - just education
8. Never provide medical advice or dosage recommendations
9. When in doubt, create FEWER nudges

PATIENT'S EXISTING CONTEXT:
- Known conditions: {existingConditions}
- Current medications: {currentMedications}
- Already tracking: {activeTracking}
- Recently logged (skip for 24h): {recentlyLogged}
- Condition age: {conditionDiagnosedDates}

THIS VISIT'S SUMMARY:
{visitSummary}

CHANGES IN THIS VISIT:
- Diagnoses discussed: {diagnoses}
- Medications started: {medicationsStarted}
- Medications changed: {medicationsChanged}
- Medications stopped: {medicationsStopped}

DECISION TREE:
1. Are there NEW conditions not in existing context?
   → Create ONE introduction nudge (immediate) mentioning ALL new conditions
   → Add new conditions to trackingToEnable, but schedule tracking for week1
   
2. Are there CHANGED medications for EXISTING conditions (>7 days old)?
   → Create ONE medication_checkin or condition_tracking nudge (day1-day3)
   → But SKIP if that tracking type was logged today (in recentlyLogged)
   
3. Nothing new or changed, or patient already logged today?
   → Return empty arrays

Return ONLY valid JSON:
{
  "nudgesToCreate": [
    {
      "type": "introduction" | "medication_checkin" | "condition_tracking" | "followup",
      "reason": "Brief reason why this nudge",
      "conditionId": "optional - hypertension|diabetes|heart_failure|copd|afib|anticoagulation",
      "medicationName": "optional - medication name if relevant",
      "trackingType": "bp" | "glucose" | "weight" | "symptoms" | null,
      "urgency": "immediate" | "day1" | "day3" | "week1",
      "isNewDiagnosis": true | false
    }
  ],
  "contextUpdates": {
    "newConditions": ["new_condition_1"],
    "trackingToEnable": ["bp", "glucose"]
  },
  "reasoning": "Brief explanation of analysis"
}

REMEMBER: Maximum 2 nudges. Respect 24h cool-down. Prioritize quality over quantity.`;

// =============================================================================
// Delta Analyzer Service
// =============================================================================

export class DeltaAnalyzerService {
    private client: AxiosInstance;
    private model: string;

    constructor(apiKey: string, model: string) {
        if (!apiKey) {
            throw new Error('OpenAI API key is not configured for DeltaAnalyzer');
        }

        this.model = model || 'gpt-4o';

        this.client = axios.create({
            baseURL: BASE_URL,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 45000, // 45 second timeout for analysis
        });
    }

    /**
     * Analyze a visit against patient context to determine nudges
     */
    async analyzeVisit(
        userId: string,
        visit: VisitSummaryForAnalysis
    ): Promise<DeltaAnalysisResult> {
        functions.logger.info(`[DeltaAnalyzer] Analyzing visit ${visit.visitId} for user ${userId}`);

        // Get existing patient context
        let context = await getPatientMedicalContext(userId);
        const contextSummary = context
            ? getContextSummaryForAI(context)
            : { existingConditions: [], currentMedications: [], activeTracking: [], recentlyLogged: [], conditionDiagnosedDates: {} };

        // Build the prompt
        const prompt = this.buildPrompt(contextSummary, visit);

        try {
            const response = await withRetry(
                async () => await this.client.post('/chat/completions', {
                    model: this.model,
                    store: false, // HIPAA: Zero data retention
                    temperature: 0.3, // Lower temperature for consistent analysis
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: DELTA_ANALYSIS_PROMPT },
                        { role: 'user', content: prompt },
                    ],
                }),
                { shouldRetry: this.shouldRetry }
            );

            const content = response.data?.choices?.[0]?.message?.content?.trim();
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }

            const parsed = JSON.parse(content);
            const result = this.validateAndNormalizeResult(parsed);

            functions.logger.info(`[DeltaAnalyzer] Analysis complete`, {
                userId,
                visitId: visit.visitId,
                nudgesRecommended: result.nudgesToCreate.length,
                reasoning: result.reasoning,
            });

            return result;

        } catch (error) {
            functions.logger.error(`[DeltaAnalyzer] AI analysis failed, using fallback:`, error);
            return this.getFallbackAnalysis(contextSummary, visit);
        }
    }

    /**
     * Analyze and update patient context in one operation
     */
    async analyzeAndUpdateContext(
        userId: string,
        visit: VisitSummaryForAnalysis
    ): Promise<{ analysis: DeltaAnalysisResult; context: PatientMedicalContext }> {
        // Run analysis
        const analysis = await this.analyzeVisit(userId, visit);

        // Update patient context
        const contextUpdate: VisitContextUpdate = {
            visitId: visit.visitId,
            visitDate: visit.visitDate,
            diagnoses: visit.diagnoses,
            medicationsStarted: visit.medicationsStarted,
            medicationsChanged: visit.medicationsChanged,
            medicationsStopped: visit.medicationsStopped,
        };

        const context = await updatePatientContextFromVisit(userId, contextUpdate);

        return { analysis, context };
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private buildPrompt(
        context: ReturnType<typeof getContextSummaryForAI>,
        visit: VisitSummaryForAnalysis
    ): string {
        // Format condition ages for the prompt
        const conditionAges = Object.entries(context.conditionDiagnosedDates || {})
            .map(([id, age]) => `${id}: ${age}`)
            .join(', ') || 'None';

        return [
            `Existing conditions: ${context.existingConditions.join(', ') || 'None known'}`,
            `Current medications: ${context.currentMedications.join(', ') || 'None known'}`,
            `Already tracking: ${context.activeTracking.join(', ') || 'Nothing'}`,
            `Recently logged (24h cool-down): ${context.recentlyLogged?.join(', ') || 'None'}`,
            `Condition diagnosed dates: ${conditionAges}`,
            '',
            `Visit summary:`,
            visit.summaryText,
            '',
            `Diagnoses discussed: ${visit.diagnoses.join(', ') || 'None'}`,
            `Medications started: ${visit.medicationsStarted.map(m => m.name).join(', ') || 'None'}`,
            `Medications changed: ${visit.medicationsChanged.map(m => m.name).join(', ') || 'None'}`,
            `Medications stopped: ${visit.medicationsStopped.join(', ') || 'None'}`,
        ].join('\n');
    }

    private validateAndNormalizeResult(parsed: unknown): DeltaAnalysisResult {
        const result = parsed as Record<string, unknown>;

        // Validate and normalize nudgesToCreate
        let nudgesToCreate: NudgeRecommendation[] = [];
        if (Array.isArray(result.nudgesToCreate)) {
            for (const nudge of result.nudgesToCreate) {
                if (this.isValidNudgeRecommendation(nudge)) {
                    nudgesToCreate.push({
                        type: nudge.type,
                        reason: nudge.reason || 'Recommended by AI',
                        conditionId: nudge.conditionId,
                        medicationName: nudge.medicationName,
                        trackingType: nudge.trackingType,
                        urgency: nudge.urgency || 'day1',
                        isNewDiagnosis: nudge.isNewDiagnosis === true,
                    });
                }
            }
        }

        // ENFORCE: Maximum 2 nudges per visit
        // Priority: introduction > medication_checkin > condition_tracking > followup
        if (nudgesToCreate.length > 2) {
            const originalCount = nudgesToCreate.length;
            const priorityOrder = ['introduction', 'medication_checkin', 'condition_tracking', 'followup'];
            nudgesToCreate.sort((a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type));
            nudgesToCreate = nudgesToCreate.slice(0, 2);
            functions.logger.info(`[DeltaAnalyzer] Limited nudges to 2 (was ${originalCount})`);
        }

        // ENFORCE: No immediate tracking nudges for new diagnoses
        nudgesToCreate = nudgesToCreate.map(nudge => {
            if (nudge.type === 'condition_tracking' && nudge.isNewDiagnosis && nudge.urgency === 'immediate') {
                return { ...nudge, urgency: 'day3' as NudgeUrgency };
            }
            return nudge;
        });

        // Validate contextUpdates
        const contextUpdates: ContextUpdateRecommendation = {
            newConditions: [],
            trackingToEnable: [],
        };
        if (result.contextUpdates && typeof result.contextUpdates === 'object') {
            const updates = result.contextUpdates as Record<string, unknown>;
            if (Array.isArray(updates.newConditions)) {
                contextUpdates.newConditions = updates.newConditions.filter(
                    (c): c is string => typeof c === 'string'
                );
            }
            if (Array.isArray(updates.trackingToEnable)) {
                contextUpdates.trackingToEnable = updates.trackingToEnable.filter(
                    (t): t is TrackingType => ['bp', 'glucose', 'weight', 'symptoms'].includes(t as string)
                );
            }
        }

        return {
            nudgesToCreate,
            contextUpdates,
            reasoning: typeof result.reasoning === 'string' ? result.reasoning : '',
        };
    }

    private isValidNudgeRecommendation(nudge: unknown): nudge is NudgeRecommendation {
        if (!nudge || typeof nudge !== 'object') return false;
        const n = nudge as Record<string, unknown>;

        const validTypes: NudgeType[] = ['introduction', 'medication_checkin', 'condition_tracking', 'followup', 'insight'];
        return validTypes.includes(n.type as NudgeType);
    }

    private getFallbackAnalysis(
        context: ReturnType<typeof getContextSummaryForAI>,
        visit: VisitSummaryForAnalysis
    ): DeltaAnalysisResult {
        // Simple fallback logic - create nudges for new medications
        const nudgesToCreate: NudgeRecommendation[] = [];
        const trackingToEnable: TrackingType[] = [];

        // If there are new medications, create medication check-in nudges
        for (const med of visit.medicationsStarted) {
            nudgesToCreate.push({
                type: 'medication_checkin',
                reason: 'New medication started',
                medicationName: med.name,
                urgency: 'day1',
            });

            // Infer tracking type from medication
            const trackingType = this.inferTrackingFromMedication(med.name);
            if (trackingType && !context.activeTracking.includes(trackingType)) {
                trackingToEnable.push(trackingType);
            }
        }

        // If there are new diagnoses not in context, create intro nudge
        const newDiagnoses = visit.diagnoses.filter(
            d => !context.existingConditions.some(
                c => c.toLowerCase().includes(d.toLowerCase()) ||
                    d.toLowerCase().includes(c.toLowerCase())
            )
        );

        if (newDiagnoses.length > 0) {
            nudgesToCreate.push({
                type: 'introduction',
                reason: 'New diagnosis discussed',
                conditionId: newDiagnoses[0].toLowerCase().replace(/\s+/g, '_'),
                urgency: 'immediate',
            });
        }

        return {
            nudgesToCreate,
            contextUpdates: {
                newConditions: newDiagnoses,
                trackingToEnable,
            },
            reasoning: 'Fallback analysis (AI unavailable)',
        };
    }

    private inferTrackingFromMedication(medName: string): TrackingType | undefined {
        const lower = medName.toLowerCase();

        // BP medications
        const bpMeds = ['lisinopril', 'losartan', 'amlodipine', 'metoprolol', 'hydrochlorothiazide', 'hctz'];
        if (bpMeds.some(m => lower.includes(m))) return 'bp';

        // Diabetes medications
        const diabetesMeds = ['metformin', 'glipizide', 'sitagliptin', 'empagliflozin', 'insulin', 'januvia', 'jardiance'];
        if (diabetesMeds.some(m => lower.includes(m))) return 'glucose';

        // Weight-related
        const weightMeds = ['ozempic', 'wegovy', 'mounjaro', 'semaglutide', 'tirzepatide'];
        if (weightMeds.some(m => lower.includes(m))) return 'weight';

        return undefined;
    }

    private shouldRetry(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            return status === 429 || (!!status && status >= 500);
        }
        if (error instanceof Error) {
            return (
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('ENOTFOUND')
            );
        }
        return false;
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let deltaAnalyzerInstance: DeltaAnalyzerService | null = null;

export function getDeltaAnalyzer(): DeltaAnalyzerService {
    if (!deltaAnalyzerInstance) {
        deltaAnalyzerInstance = new DeltaAnalyzerService(
            openAIConfig.apiKey,
            openAIConfig.model
        );
    }
    return deltaAnalyzerInstance;
}
