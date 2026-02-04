/**
 * LumiBot AI Service
 * 
 * AI-powered message generation for personalized nudges.
 * Uses OpenAI to generate contextual, empathetic messages based on
 * patient context, diagnoses, and medications.
 */

import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import { withRetry } from '../utils/retryUtils';
import { PatientContext } from './patientContextAggregator';
import { NudgeType } from '../types/lumibot';

const BASE_URL = 'https://api.openai.com/v1';

// =============================================================================
// Types
// =============================================================================

export interface DiagnosisIntroductionResult {
    title: string;
    message: string;
    explanation: string;  // 1-2 sentence explanation of the diagnosis
}

export interface CheckInMessageResult {
    title: string;
    message: string;
}

export type FollowUpUrgency = 'immediate' | 'same_day' | 'next_day' | '3_days' | '1_week' | 'none';

export interface FollowUpRecommendation {
    needed: boolean;
    urgency: FollowUpUrgency;
    reason: string;
    focusArea?: string;  // What the follow-up should focus on
    suggestedMessage?: string;
}

export interface ResponseInterpretationResult {
    sentiment: 'positive' | 'neutral' | 'negative' | 'concerning';
    extractedData?: Record<string, unknown>;
    followUpNeeded: boolean;
    followUp?: FollowUpRecommendation;
    suggestedAction?: string;
    summary: string;
}

interface NudgeContext {
    nudgeType: NudgeType;
    conditionId?: string;
    medicationName?: string;
    originalMessage: string;
}

export interface PatientTrendContext {
    recentBpReadings?: { systolic: number; diastolic: number; date: Date }[];
    recentGlucoseReadings?: { value: number; date: Date }[];
    bpTrend?: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
    glucoseTrend?: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
    daysSinceLastLog?: number;
    engagementLevel?: 'high' | 'medium' | 'low';  // Based on nudge completion rate
}

// =============================================================================
// System Prompts
// =============================================================================

const LUMIBOT_PERSONA = `You are LumiBot, a friendly and supportive healthcare assistant. Your role is to help patients understand and manage their health conditions.

Tone guidelines:
- Warm, empathetic, and encouraging
- Use simple, patient-friendly language (6th-8th grade reading level)
- Include appropriate emoji sparingly (, ,) for warmth
- Never be alarmist; be reassuring while still conveying important information
- Keep messages concise (2-3 sentences max for check-ins)
- Use "your doctor" instead of specific provider names

HIPAA compliance:
- Never include specific dosages or medication names from context that weren't explicitly provided
- Focus on guidance and support, not medical advice
- Encourage consultation with healthcare providers for specific questions`;

const DIAGNOSIS_INTRO_PROMPT = `${LUMIBOT_PERSONA}

Generate a personalized introduction message for a patient who was recently diagnosed with a condition.

The message should:
1. Acknowledge the diagnosis in a non-alarming way
2. Provide a brief, patient-friendly explanation (1-2 sentences)
3. Let them know LumiBot will be checking in to help them

Respond with JSON only:
{
  "title": "Short title for the nudge card (3-5 words)",
  "message": "Main message (2-3 sentences, warm and supportive)",
  "explanation": "Brief explanation of what this condition means (1-2 sentences, easy to understand)"
}`;

const CHECKIN_MESSAGE_PROMPT = `${LUMIBOT_PERSONA}

Generate a personalized check-in message for a patient's ongoing health monitoring.

Consider:
- Their recent health log trends (if provided)
- Time since last log entry
- The condition or medication being monitored

The message should:
1. Be warm and encouraging
2. Prompt them to take action (log a reading, check in, etc.)
3. Feel personalized based on their context

Respond with JSON only:
{
  "title": "Short action-oriented title (3-5 words)",
  "message": "Check-in message (2-3 sentences, encouraging and specific)"
}`;

const RESPONSE_INTERPRETATION_PROMPT = `${LUMIBOT_PERSONA}

Interpret a patient's free-text response to a nudge. Analyze:
1. Overall sentiment about their health/medication experience
2. Any specific data that can be extracted (symptoms, concerns, positive outcomes)
3. Whether follow-up is needed and HOW SOON based on urgency

Patient context will be provided including:
- Recent health log trends (BP, glucose)
- Days since last log entry
- Engagement level

Respond with JSON only:
{
  "sentiment": "positive" | "neutral" | "negative" | "concerning",
  "extractedData": { optional key-value pairs of relevant information },
  "followUpNeeded": true/false,
  "followUp": {
    "urgency": "immediate" | "same_day" | "next_day" | "3_days" | "1_week" | "none",
    "reason": "Why this urgency level",
    "focusArea": "What the follow-up should address",
    "suggestedMessage": "Optional: suggested follow-up message"
  },
  "suggestedAction": "Optional action to take",
  "summary": "Brief summary of what the patient shared (1 sentence)"
}

Sentiment guidelines:
- positive: Things are going well, medication working, feeling good
- neutral: Just confirming, no strong sentiment either way
- negative: Having difficulties, side effects, but not urgent
- concerning: Mentions symptoms requiring medical attention (flag for provider review)

Follow-up urgency guidelines:
- immediate: Concerning symptoms, patient distress, safety issues
- same_day: Side effects mentioned, elevated readings reported
- next_day: Negative experience, needs encouragement, missed doses
- 3_days: Minor issues, patient adjusting, trend needs monitoring
- 1_week: Routine check-in, stable situation
- none: Positive response, no issues, on track`;

function safeJsonParse(content: string): Record<string, unknown> {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON response format');
    }
    return parsed as Record<string, unknown>;
}

// =============================================================================
// LumiBot AI Service Class
// =============================================================================

export class LumiBotAIService {
    private client: AxiosInstance;
    private model: string;

    constructor(apiKey: string, model: string) {
        if (!apiKey) {
            throw new Error('OpenAI API key is not configured for LumiBotAI');
        }

        this.model = model || 'gpt-4o';

        this.client = axios.create({
            baseURL: BASE_URL,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout for nudge generation
        });
    }

    /**
     * Generate a personalized introduction message for a new diagnosis.
     */
    async generateDiagnosisIntroduction(params: {
        diagnosis: string;
        medications?: string[];
        patientContext?: Partial<PatientContext>;
    }): Promise<DiagnosisIntroductionResult> {
        const { diagnosis, medications, patientContext } = params;

        const contextSummary = this.buildContextSummary(patientContext);
        const medsContext = medications?.length
            ? `They were also started on: ${medications.join(', ')}.`
            : '';

        try {
            const response = await withRetry(
                async () => await this.client.post('/chat/completions', {
                    model: this.model,
                    store: false, // HIPAA: Zero data retention
                    temperature: 0.7, // Slightly creative for personalization
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: DIAGNOSIS_INTRO_PROMPT },
                        {
                            role: 'user',
                            content: [
                                `Diagnosis: ${diagnosis}`,
                                medsContext,
                                contextSummary ? `\nPatient context:\n${contextSummary}` : '',
                                '\nGenerate the introduction message.',
                            ].filter(Boolean).join('\n'),
                        },
                    ],
                }),
                { shouldRetry: this.shouldRetry }
            );

            const content = response.data?.choices?.[0]?.message?.content?.trim();
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }

            const parsed = JSON.parse(content);
            return {
                title: parsed.title || 'LumiBot is Here to Help',
                message: parsed.message || `I noticed your provider discussed ${diagnosis}. I'll be checking in to help you track your progress.`,
                explanation: parsed.explanation || '',
            };
        } catch (error) {
            functions.logger.error('[LumiBotAI] Failed to generate diagnosis introduction:', error);
            // Return fallback template
            return {
                title: 'LumiBot is Here to Help',
                message: `I see your provider discussed ${diagnosis} during your visit. I'll be checking in to help you monitor and track your progress.`,
                explanation: '',
            };
        }
    }

    /**
     * Generate a personalized check-in message.
     */
    async generateCheckInMessage(params: {
        nudgeType: NudgeType;
        conditionId?: string;
        medicationName?: string;
        patientContext?: Partial<PatientContext>;
        daysSinceLastLog?: number;
    }): Promise<CheckInMessageResult> {
        const { nudgeType, conditionId, medicationName, patientContext, daysSinceLastLog } = params;

        const contextSummary = this.buildContextSummary(patientContext);

        // Find relevant trend for this condition
        const relevantTrend = patientContext?.healthLogTrends?.find(
            t => t.type === conditionId || t.type === 'bp' || t.type === 'glucose'
        );

        try {
            const response = await withRetry(
                async () => await this.client.post('/chat/completions', {
                    model: this.model,
                    store: false,
                    temperature: 0.7,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: CHECKIN_MESSAGE_PROMPT },
                        {
                            role: 'user',
                            content: [
                                `Check-in type: ${nudgeType}`,
                                conditionId ? `Condition: ${conditionId}` : '',
                                medicationName ? `Medication: ${medicationName}` : '',
                                daysSinceLastLog !== undefined ? `Days since last log: ${daysSinceLastLog}` : '',
                                relevantTrend ? `Recent trend: ${relevantTrend.trend} (${relevantTrend.dataPoints} readings)` : '',
                                contextSummary ? `\nPatient context:\n${contextSummary}` : '',
                                '\nGenerate the check-in message.',
                            ].filter(Boolean).join('\n'),
                        },
                    ],
                }),
                { shouldRetry: this.shouldRetry }
            );

            const content = response.data?.choices?.[0]?.message?.content?.trim();
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }

            const parsed = JSON.parse(content);
            return {
                title: parsed.title || 'Time to Check In',
                message: parsed.message || "Let's see how things are going.",
            };
        } catch (error) {
            functions.logger.error('[LumiBotAI] Failed to generate check-in message:', error);
            // Return fallback
            return this.getFallbackCheckInMessage(nudgeType, conditionId, medicationName);
        }
    }

    /**
     * Interpret a free-text user response with patient trend context.
     */
    async interpretUserResponse(params: {
        nudgeContext: NudgeContext;
        userResponse: string;
        trendContext?: PatientTrendContext;
    }): Promise<ResponseInterpretationResult> {
        const { nudgeContext, userResponse, trendContext } = params;

        if (!userResponse || userResponse.trim().length < 2) {
            return {
                sentiment: 'neutral',
                followUpNeeded: false,
                summary: 'No response provided.',
            };
        }

        // Build trend context string for AI
        const trendInfo = this.buildTrendContextString(trendContext);

        try {
            const response = await withRetry(
                async () => await this.client.post('/chat/completions', {
                    model: this.model,
                    store: false,
                    temperature: 0.3, // Lower temperature for more consistent interpretation
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: RESPONSE_INTERPRETATION_PROMPT },
                        {
                            role: 'user',
                            content: [
                                `Nudge type: ${nudgeContext.nudgeType}`,
                                nudgeContext.conditionId ? `Condition: ${nudgeContext.conditionId}` : '',
                                nudgeContext.medicationName ? `Medication: ${nudgeContext.medicationName}` : '',
                                `Original nudge message: "${nudgeContext.originalMessage}"`,
                                '',
                                trendInfo ? `Patient context:\n${trendInfo}` : '',
                                '',
                                `Patient's response: "${userResponse}"`,
                                '',
                                'Interpret this response and determine if follow-up is needed.',
                            ].filter(Boolean).join('\n'),
                        },
                    ],
                }),
                { shouldRetry: this.shouldRetry }
            );

            const content = response.data?.choices?.[0]?.message?.content?.trim();
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }

            const parsed = safeJsonParse(content);

            // Validate sentiment
            const validSentiments = ['positive', 'neutral', 'negative', 'concerning'];
            const sentiment = validSentiments.includes(parsed.sentiment as string)
                ? (parsed.sentiment as 'positive' | 'neutral' | 'negative' | 'concerning')
                : 'neutral';

            // Parse follow-up recommendation
            const followUp = this.parseFollowUpRecommendation(
                parsed.followUp,
                parsed.followUpNeeded === true
            );

            return {
                sentiment,
                extractedData: typeof parsed.extractedData === 'object' && parsed.extractedData !== null
                    ? (parsed.extractedData as Record<string, unknown>)
                    : {},
                followUpNeeded: followUp.needed,
                followUp,
                suggestedAction: typeof parsed.suggestedAction === 'string' ? parsed.suggestedAction : undefined,
                summary: typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
                    ? parsed.summary
                    : 'Response received.',
            };
        } catch (error) {
            functions.logger.error('[LumiBotAI] Failed to interpret user response:', error);
            // Basic fallback interpretation
            return {
                sentiment: 'neutral',
                followUpNeeded: false,
                summary: 'Response noted.',
            };
        }
    }

    /**
     * Build a string describing patient trends for AI context.
     */
    private buildTrendContextString(trendContext?: PatientTrendContext): string {
        if (!trendContext) return '';

        const parts: string[] = [];

        if (trendContext.bpTrend) {
            parts.push(`BP trend: ${trendContext.bpTrend}`);
        }
        if (trendContext.glucoseTrend) {
            parts.push(`Glucose trend: ${trendContext.glucoseTrend}`);
        }
        if (trendContext.daysSinceLastLog !== undefined) {
            parts.push(`Days since last log: ${trendContext.daysSinceLastLog}`);
        }
        if (trendContext.engagementLevel) {
            parts.push(`Engagement level: ${trendContext.engagementLevel}`);
        }
        if (trendContext.recentBpReadings?.length) {
            const latest = trendContext.recentBpReadings[0];
            parts.push(`Latest BP: ${latest.systolic}/${latest.diastolic}`);
        }
        if (trendContext.recentGlucoseReadings?.length) {
            const latest = trendContext.recentGlucoseReadings[0];
            parts.push(`Latest glucose: ${latest.value}`);
        }

        return parts.join('\n');
    }

    /**
     * Parse and validate follow-up recommendation from AI response.
     */
    private parseFollowUpRecommendation(
        followUp: unknown,
        fallbackNeeded: boolean
    ): FollowUpRecommendation {
        const validUrgencies: FollowUpUrgency[] = [
            'immediate', 'same_day', 'next_day', '3_days', '1_week', 'none'
        ];

        if (followUp && typeof followUp === 'object') {
            const f = followUp as Record<string, unknown>;
            const urgency = validUrgencies.includes(f.urgency as FollowUpUrgency)
                ? (f.urgency as FollowUpUrgency)
                : (fallbackNeeded ? 'next_day' : 'none');

            return {
                needed: urgency !== 'none',
                urgency,
                reason: typeof f.reason === 'string' ? f.reason : 'AI recommended',
                focusArea: typeof f.focusArea === 'string' ? f.focusArea : undefined,
                suggestedMessage: typeof f.suggestedMessage === 'string' ? f.suggestedMessage : undefined,
            };
        }

        // Fallback if no follow-up object
        return {
            needed: fallbackNeeded,
            urgency: fallbackNeeded ? 'next_day' : 'none',
            reason: fallbackNeeded ? 'Follow-up recommended' : 'No follow-up needed',
        };
    }

    // =========================================================================
    // Helper Methods
    // =========================================================================

    private buildContextSummary(context?: Partial<PatientContext>): string {
        if (!context) return '';

        const parts: string[] = [];

        if (context.recentDiagnoses?.length) {
            parts.push(`Recent diagnoses: ${context.recentDiagnoses.slice(0, 3).join(', ')}`);
        }

        if (context.activeMedications?.length) {
            const medNames = context.activeMedications.slice(0, 5).map(m => m.name);
            parts.push(`Active medications: ${medNames.join(', ')}`);
        }

        if (context.nudgeMetrics) {
            const { completedLast30Days, dismissedLast30Days } = context.nudgeMetrics;
            if (completedLast30Days > 0 || dismissedLast30Days > 0) {
                parts.push(`Engagement (30d): ${completedLast30Days} completed, ${dismissedLast30Days} dismissed`);
            }
        }

        return parts.join('\n');
    }

    private getFallbackCheckInMessage(
        nudgeType: NudgeType,
        conditionId?: string,
        medicationName?: string
    ): CheckInMessageResult {
        if (nudgeType === 'medication_checkin' && medicationName) {
            return {
                title: 'Medication Check',
                message: `How's it going with ${medicationName}? Let us know how you're feeling.`,
            };
        }

        if (nudgeType === 'condition_tracking') {
            if (conditionId === 'hypertension' || conditionId === 'bp') {
                return {
                    title: 'Blood Pressure Check',
                    message: "Time to log your blood pressure. A quick reading helps track your progress!",
                };
            }
            if (conditionId === 'diabetes' || conditionId === 'glucose') {
                return {
                    title: 'Blood Sugar Check',
                    message: "Let's check in on your blood sugar. How are things looking?",
                };
            }
        }

        return {
            title: 'Time to Check In',
            message: "How are things going? Take a moment to log how you're feeling.",
        };
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

let lumiBotAIServiceInstance: LumiBotAIService | null = null;

export const getLumiBotAIService = (): LumiBotAIService => {
    if (!lumiBotAIServiceInstance) {
        lumiBotAIServiceInstance = new LumiBotAIService(
            openAIConfig.apiKey,
            openAIConfig.model
        );
    }
    return lumiBotAIServiceInstance;
};
