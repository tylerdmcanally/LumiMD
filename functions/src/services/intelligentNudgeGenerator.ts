/**
 * Intelligent Nudge Generator
 * 
 * AI-first nudge generation that synthesizes patient context to create
 * personalized, contextual messages. Replaces template-based generation.
 */

import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import { withRetry } from '../utils/retryUtils';
import { PatientContext, getPatientContext } from './patientContextAggregator';
import { NudgeActionType } from '../types/lumibot';

const BASE_URL = 'https://api.openai.com/v1';

// =============================================================================
// Types
// =============================================================================

export interface NudgePurpose {
    type: 'medication_checkin' | 'condition_tracking' | 'followup' | 'introduction';
    trigger: 'pickup_check' | 'started_check' | 'side_effects' | 'feeling_check' | 'log_reading' | 'symptom_check' | 'general';
    medicationName?: string;
    conditionId?: string;
}

export interface GeneratedNudge {
    title: string;
    message: string;
    actionType: NudgeActionType;
    priority: 'high' | 'medium' | 'low';
    aiGenerated: true;
}

// =============================================================================
// System Prompt
// =============================================================================

const INTELLIGENT_NUDGE_PROMPT = `You are LumiBot, a personalized medical assistant. Generate a single nudge message that feels like a caring friend who knows the patient's health journey.

Guidelines:
- Be warm, conversational, and specific to THIS patient's data
- Reference concrete details: "You've been on Lisinopril for 12 days now..."
- Connect dots between data points when relevant
- Do NOT use emojis
- Keep messages 2-3 sentences max (under 200 characters)
- NEVER give medical advice, dosing suggestions, or diagnosis interpretations
- For concerning symptoms, only suggest "discussing with your doctor"

Safety rules:
- Do not suggest stopping, changing, or adjusting medications
- Do not interpret lab values or vital signs as good/bad beyond general trends
- If user reported concerning symptoms, acknowledge but do not triage

Synthesize context into observations like:
- "Your BP has been stable since starting [med] - great progress."
- "I notice you haven't logged glucose in 5 days - want to do a quick check?"
- "You mentioned some concerns recently - worth discussing at your next visit."

Respond with JSON only:
{
  "title": "Short title (3-5 words, no emojis)",
  "message": "Personalized message (2-3 sentences, no emojis, under 200 chars)",
  "actionType": "one of: log_bp, log_glucose, log_weight, pickup_check, started_check, feeling_check, side_effects, symptom_check, acknowledge",
  "priority": "high | medium | low"
}`;

// =============================================================================
// Intelligent Nudge Generator Service
// =============================================================================

export class IntelligentNudgeGenerator {
    private client: AxiosInstance;
    private model: string;

    constructor() {
        if (!openAIConfig.apiKey) {
            throw new Error('OpenAI API key is not configured for IntelligentNudgeGenerator');
        }

        this.model = openAIConfig.model || 'gpt-4o';

        this.client = axios.create({
            baseURL: BASE_URL,
            headers: {
                Authorization: `Bearer ${openAIConfig.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }

    /**
     * Generate a single intelligent nudge for a user.
     */
    async generateNudge(
        userId: string,
        purpose: NudgePurpose,
        context?: PatientContext
    ): Promise<GeneratedNudge> {
        // Get context if not provided
        const patientContext = context || await getPatientContext(userId);

        // Build context string for AI
        const contextString = this.buildContextString(patientContext, purpose);

        try {
            const response = await withRetry(
                async () => await this.client.post('/chat/completions', {
                    model: this.model,
                    store: false,  // HIPAA: Zero data retention
                    temperature: 0.7,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: INTELLIGENT_NUDGE_PROMPT },
                        {
                            role: 'user',
                            content: `Generate a nudge for this purpose and patient:\n\nPURPOSE: ${JSON.stringify(purpose, null, 2)}\n\nPATIENT CONTEXT:\n${contextString}`,
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

            // Guardrails: Validate and sanitize output
            let sanitizedMessage = parsed.message || this.getFallbackMessage(purpose);
            let sanitizedTitle = parsed.title || this.getFallbackTitle(purpose);

            // Strip any emojis that slipped through
            sanitizedMessage = this.stripEmojis(sanitizedMessage);
            sanitizedTitle = this.stripEmojis(sanitizedTitle);

            // Truncate if too long
            if (sanitizedMessage.length > 250) {
                sanitizedMessage = sanitizedMessage.substring(0, 247) + '...';
            }
            if (sanitizedTitle.length > 50) {
                sanitizedTitle = sanitizedTitle.substring(0, 47) + '...';
            }

            // Check for medical advice red flags
            const redFlags = ['stop taking', 'increase dose', 'decrease dose', 'emergency', 'call 911', 'go to er'];
            const hasRedFlag = redFlags.some(flag => sanitizedMessage.toLowerCase().includes(flag));
            if (hasRedFlag) {
                functions.logger.warn('[IntelligentNudge] AI output contained red flag, using fallback');
                return this.getFallbackNudge(purpose);
            }

            return {
                title: sanitizedTitle,
                message: sanitizedMessage,
                actionType: this.validateActionType(parsed.actionType, purpose),
                priority: ['high', 'medium', 'low'].includes(parsed.priority)
                    ? parsed.priority
                    : 'medium',
                aiGenerated: true,
            };
        } catch (error) {
            functions.logger.error('[IntelligentNudge] AI generation failed, using fallback:', error);
            return this.getFallbackNudge(purpose);
        }
    }

    /**
     * Build a concise context string for AI consumption.
     */
    private buildContextString(context: PatientContext, purpose: NudgePurpose): string {
        const parts: string[] = [];

        // Active medications with time on med
        if (context.activeMedications.length > 0) {
            parts.push('MEDICATIONS:');
            context.activeMedications.forEach(med => {
                const daysText = med.daysOnMedication
                    ? `(${med.daysOnMedication} days)`
                    : '';
                parts.push(`  - ${med.name} ${med.dose || ''} ${daysText}`.trim());
            });
        }

        // Health trends with days since last log
        if (context.healthLogTrends.length > 0) {
            parts.push('HEALTH DATA:');
            context.healthLogTrends.forEach(trend => {
                const staleText = trend.daysSinceLastLog !== undefined
                    ? `(${trend.daysSinceLastLog} days ago)`
                    : '';
                parts.push(`  - ${trend.type.toUpperCase()}: ${trend.trend} ${staleText}`.trim());
                if (trend.averageValue) {
                    parts.push(`    Average: ${Math.round(trend.averageValue)}`);
                }
            });
        }

        // Diagnoses
        if (context.recentDiagnoses.length > 0) {
            parts.push(`DIAGNOSES: ${context.recentDiagnoses.join(', ')}`);
        }

        // Engagement
        parts.push('ENGAGEMENT:');
        parts.push(`  - Completed nudges (30d): ${context.nudgeMetrics.completedLast30Days}`);
        parts.push(`  - Dismissed: ${context.nudgeMetrics.dismissedLast30Days}`);
        parts.push(`  - Concerning responses: ${context.nudgeMetrics.concerningResponsesLast30Days}`);

        return parts.join('\n');
    }

    private validateActionType(aiType: string, purpose: NudgePurpose): NudgeActionType {
        const validTypes: NudgeActionType[] = [
            'log_bp', 'log_glucose', 'log_weight', 'pickup_check',
            'started_check', 'feeling_check', 'side_effects', 'symptom_check', 'acknowledge'
        ];

        if (validTypes.includes(aiType as NudgeActionType)) {
            return aiType as NudgeActionType;
        }

        // Fallback based on purpose
        switch (purpose.trigger) {
            case 'pickup_check': return 'pickup_check';
            case 'started_check': return 'started_check';
            case 'side_effects': return 'side_effects';
            case 'feeling_check': return 'feeling_check';
            case 'log_reading':
                if (purpose.conditionId === 'bp' || purpose.conditionId === 'hypertension') return 'log_bp';
                if (purpose.conditionId === 'glucose' || purpose.conditionId === 'diabetes') return 'log_glucose';
                return 'log_weight';
            default: return 'acknowledge';
        }
    }

    private getFallbackTitle(purpose: NudgePurpose): string {
        if (purpose.medicationName) return `Check-in: ${purpose.medicationName}`;
        if (purpose.conditionId) return `Health Check`;
        return 'LumiBot Check-in';
    }

    private getFallbackMessage(purpose: NudgePurpose): string {
        if (purpose.trigger === 'pickup_check' && purpose.medicationName) {
            return `Have you picked up ${purpose.medicationName} from the pharmacy?`;
        }
        if (purpose.trigger === 'log_reading') {
            return 'Time for a quick health reading - it helps us track your progress.';
        }
        return 'Just checking in - how are things going?';
    }

    /**
     * Strip emojis from text
     */
    private stripEmojis(text: string): string {
        return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, '').trim();
    }

    private getFallbackNudge(purpose: NudgePurpose): GeneratedNudge {
        return {
            title: this.getFallbackTitle(purpose),
            message: this.getFallbackMessage(purpose),
            actionType: this.validateActionType('', purpose),
            priority: 'medium',
            aiGenerated: true,
        };
    }

    private shouldRetry(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            return status === 429 || (!!status && status >= 500);
        }
        return false;
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let intelligentNudgeInstance: IntelligentNudgeGenerator | null = null;

export const getIntelligentNudgeGenerator = (): IntelligentNudgeGenerator => {
    if (!intelligentNudgeInstance) {
        intelligentNudgeInstance = new IntelligentNudgeGenerator();
    }
    return intelligentNudgeInstance;
};
