/**
 * Health Insight Generator Service
 * 
 * Batched AI generation of health insights based on:
 * - Health logs (BP, glucose, weight trends)
 * - Nudge responses (concerning vs positive)
 * - Medication adherence
 * 
 * Insights are cached in Firestore and regenerated daily.
 */

import axios, { AxiosInstance } from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import { withRetry } from '../utils/retryUtils';
import { HealthLogDomainService } from './domain/healthLogs/HealthLogDomainService';
import { InsightDomainService } from './domain/insights/InsightDomainService';
import { MedicationDomainService } from './domain/medications/MedicationDomainService';
import { NudgeDomainService } from './domain/nudges/NudgeDomainService';
import { FirestoreHealthLogRepository } from './repositories/healthLogs/FirestoreHealthLogRepository';
import { FirestoreInsightRepository } from './repositories/insights/FirestoreInsightRepository';
import { FirestoreMedicationRepository } from './repositories/medications/FirestoreMedicationRepository';
import { FirestoreNudgeRepository } from './repositories/nudges/FirestoreNudgeRepository';

const BASE_URL = 'https://api.openai.com/v1';

// =============================================================================
// Types
// =============================================================================

export type InsightType = 'positive' | 'neutral' | 'attention' | 'tip';

export interface HealthInsight {
    id?: string;
    text: string;
    type: InsightType;
    category: 'medication' | 'vitals' | 'engagement' | 'general';
    generatedAt: admin.firestore.Timestamp;
    expiresAt: admin.firestore.Timestamp;
}

interface InsightGenerationContext {
    userId: string;
    // Health data
    bpReadings?: { systolic: number; diastolic: number; date: string }[];
    glucoseReadings?: { reading: number; timing: string; date: string }[];
    weightReadings?: { weight: number; date: string }[];
    // Nudge data
    nudgeResponses?: { type: string; response: string; medicationName?: string; date: string }[];
    concerningResponses?: { response: string; medicationName?: string; date: string }[];
    // Medication data
    activeMedications?: { name: string; startedAt?: string }[];
    adherenceRate?: number;
    // Engagement
    nudgesCompleted?: number;
    nudgesDismissed?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const INSIGHT_GENERATION_PROMPT = `You are LumiBot, a friendly healthcare assistant. Generate 3-5 personalized health insights for a patient based on their recent data.

Guidelines:
- Be warm, encouraging, and supportive
- Use simple language (6th-8th grade reading level)
- Include 1-2 emoji per insight for warmth (, ,, , , )
- Keep each insight to 1-2 sentences max
- Focus on actionable or encouraging observations
- Never give medical advice; suggest discussing with doctor when appropriate
- When goals are provided, reference progress toward them with encouragement:
  - "Your average BP this week is 128/84 - getting closer to your 120/80 goal! "
  - "3 of your last 5 glucose readings were in target range - great work! "

Insight types:
- "positive": Celebrate improvements, good adherence, or progress toward goals
- "neutral": Informational observations
- "attention": Things to mention to provider (not alarming)
- "tip": Helpful suggestions

Insight categories:
- "medication": About medication-taking patterns
- "vitals": About BP, glucose, weight trends and goals
- "engagement": About app usage and check-ins
- "general": Overall health observations

Respond with JSON only:
{
  "insights": [
    {
      "text": "The insight text (1-2 sentences)",
      "type": "positive" | "neutral" | "attention" | "tip",
      "category": "medication" | "vitals" | "engagement" | "general"
    }
  ]
}`;

// =============================================================================
// Insight Generator Service
// =============================================================================

export type InsightGeneratorServiceDependencies = {
    client?: AxiosInstance;
    db?: admin.firestore.Firestore;
    model?: string;
    insightService?: InsightDomainService;
    healthLogService?: HealthLogDomainService;
    medicationService?: MedicationDomainService;
    nudgeService?: NudgeDomainService;
};

export class InsightGeneratorService {
    private client: AxiosInstance;
    private model: string;
    private insightService: InsightDomainService;
    private healthLogService: HealthLogDomainService;
    private medicationService: MedicationDomainService;
    private nudgeService: NudgeDomainService;

    constructor(dependencies: InsightGeneratorServiceDependencies = {}) {
        this.model = dependencies.model || openAIConfig.model || 'gpt-4o';
        const db = dependencies.db ?? admin.firestore();

        this.insightService =
            dependencies.insightService ??
            new InsightDomainService(new FirestoreInsightRepository(db));
        this.healthLogService =
            dependencies.healthLogService ??
            new HealthLogDomainService(new FirestoreHealthLogRepository(db));
        this.medicationService =
            dependencies.medicationService ??
            new MedicationDomainService(new FirestoreMedicationRepository(db));
        this.nudgeService =
            dependencies.nudgeService ??
            new NudgeDomainService(new FirestoreNudgeRepository(db));

        if (dependencies.client) {
            this.client = dependencies.client;
            return;
        }

        if (!openAIConfig.apiKey) {
            throw new Error('OpenAI API key is not configured for InsightGenerator');
        }

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
     * Generate insights for a single user.
     */
    async generateInsightsForUser(userId: string): Promise<HealthInsight[]> {
        // 1. Gather context
        const context = await this.gatherUserContext(userId);

        // 2. Check if user has enough data for insights
        if (!this.hasEnoughData(context)) {
            functions.logger.info(`[InsightGenerator] User ${userId} has insufficient data for insights`);
            return [];
        }

        // 3. Generate insights via AI
        const insights = await this.generateInsightsFromContext(context);

        // 4. Store insights
        await this.storeInsights(userId, insights);

        functions.logger.info(`[InsightGenerator] Generated ${insights.length} insights for user ${userId}`);
        return insights;
    }

    /**
     * Check if user needs new insights (hasn't been generated today).
     */
    async needsInsightGeneration(userId: string): Promise<boolean> {
        const now = admin.firestore.Timestamp.now();
        const hasActiveInsights = await this.insightService.hasActiveInsights(userId, now);
        return !hasActiveInsights;
    }

    /**
     * Get cached insights for a user.
     */
    async getCachedInsights(userId: string): Promise<HealthInsight[]> {
        const now = admin.firestore.Timestamp.now();
        const cachedInsights = await this.insightService.listActiveInsights(userId, {
            now,
            limit: 5,
        });

        return cachedInsights.map((insight) => ({
            ...insight,
        } as HealthInsight));
    }

    /**
     * Gather all relevant context for insight generation.
     */
    private async gatherUserContext(userId: string): Promise<InsightGenerationContext> {
        const context: InsightGenerationContext = { userId };
        const now = new Date();
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // Get health logs
        const healthLogs = await this.healthLogService.listForUser(userId, {
            startDate: twoWeeksAgo,
            sortDirection: 'desc',
            limit: 50,
        });

        context.bpReadings = [];
        context.glucoseReadings = [];
        context.weightReadings = [];

        healthLogs.forEach((data) => {
            const date = data.createdAt?.toDate()?.toISOString() || '';
            const rawValue =
                data.value && typeof data.value === 'object'
                    ? (data.value as Record<string, unknown>)
                    : {};

            if (data.type === 'bp' && Object.keys(rawValue).length > 0) {
                const systolic =
                    typeof rawValue.systolic === 'number' ? rawValue.systolic : undefined;
                const diastolic =
                    typeof rawValue.diastolic === 'number' ? rawValue.diastolic : undefined;
                if (systolic === undefined || diastolic === undefined) {
                    return;
                }
                context.bpReadings!.push({
                    systolic,
                    diastolic,
                    date,
                });
            } else if (data.type === 'glucose' && Object.keys(rawValue).length > 0) {
                const reading =
                    typeof rawValue.reading === 'number' ? rawValue.reading : undefined;
                if (reading === undefined) {
                    return;
                }
                context.glucoseReadings!.push({
                    reading,
                    timing: typeof rawValue.timing === 'string' ? rawValue.timing : 'unknown',
                    date,
                });
            } else if (data.type === 'weight' && Object.keys(rawValue).length > 0) {
                const weight = typeof rawValue.weight === 'number' ? rawValue.weight : undefined;
                if (weight === undefined) {
                    return;
                }
                context.weightReadings!.push({
                    weight,
                    date,
                });
            }
        });

        // Get nudge responses
        const completedNudges = await this.nudgeService.listByUserAndStatuses(userId, ['completed']);
        const recentCompletedNudges = completedNudges
            .filter((nudge) => {
                const completedAt = nudge.completedAt as FirebaseFirestore.Timestamp | undefined;
                return completedAt ? completedAt.toMillis() >= twoWeeksAgo.getTime() : false;
            })
            .sort((left, right) => {
                const leftMillis =
                    (left.completedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() || 0;
                const rightMillis =
                    (right.completedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() || 0;
                return rightMillis - leftMillis;
            })
            .slice(0, 20);

        context.nudgeResponses = [];
        context.concerningResponses = [];
        context.nudgesCompleted = recentCompletedNudges.length;

        const dismissedNudges = await this.nudgeService.listByUserAndStatuses(userId, ['dismissed']);
        const recentDismissedNudges = dismissedNudges
            .filter((nudge) => {
                const updatedAt = nudge.updatedAt as FirebaseFirestore.Timestamp | undefined;
                return updatedAt ? updatedAt.toMillis() >= twoWeeksAgo.getTime() : false;
            })
            .sort((left, right) => {
                const leftMillis =
                    (left.updatedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() || 0;
                const rightMillis =
                    (right.updatedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() || 0;
                return rightMillis - leftMillis;
            })
            .slice(0, 20);
        context.nudgesDismissed = recentDismissedNudges.length;

        recentCompletedNudges.forEach((data) => {
            const responseValue = data.responseValue as Record<string, unknown> | undefined;
            const response = responseValue?.response as string | undefined;
            const date = data.completedAt?.toDate()?.toISOString() || '';

            if (response) {
                context.nudgeResponses!.push({
                    type: data.type,
                    response,
                    medicationName: data.medicationName,
                    date,
                });

                // Track concerning responses
                if (['having_trouble', 'issues', 'concerning'].includes(response)) {
                    context.concerningResponses!.push({
                        response,
                        medicationName: data.medicationName,
                        date,
                    });
                }
            }
        });

        // Get active medications
        const medications = await this.medicationService.listAllForUser(userId);
        context.activeMedications = medications
            .filter((medication) => medication.active === true)
            .slice(0, 10)
            .map((medication) => ({
                name: medication.name,
                startedAt: medication.startedAt?.toDate?.()?.toISOString(),
            }));

        // Calculate adherence (if reminders exist)
        // This is a simplified version - could be enhanced
        const positiveResponses = context.nudgeResponses?.filter(
            r => ['taking_it', 'good', 'none', 'got_it'].includes(r.response)
        ).length || 0;
        const totalResponses = context.nudgeResponses?.length || 0;
        if (totalResponses > 0) {
            context.adherenceRate = Math.round((positiveResponses / totalResponses) * 100);
        }

        return context;
    }

    /**
     * Check if user has enough data to generate meaningful insights.
     */
    private hasEnoughData(context: InsightGenerationContext): boolean {
        const hasHealthData = (context.bpReadings?.length || 0) +
            (context.glucoseReadings?.length || 0) +
            (context.weightReadings?.length || 0) > 0;
        const hasNudgeData = (context.nudgeResponses?.length || 0) > 0;
        const hasMeds = (context.activeMedications?.length || 0) > 0;

        return hasHealthData || hasNudgeData || hasMeds;
    }

    /**
     * Generate insights using AI.
     */
    private async generateInsightsFromContext(context: InsightGenerationContext): Promise<HealthInsight[]> {
        const contextSummary = this.buildContextSummary(context);

        try {
            const response = await withRetry(
                async () => await this.client.post('/chat/completions', {
                    model: this.model,
                    store: false,  // HIPAA: Zero data retention
                    temperature: 0.7,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: INSIGHT_GENERATION_PROMPT },
                        {
                            role: 'user',
                            content: `Generate health insights based on this patient data:\n\n${contextSummary}`,
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
            const now = admin.firestore.Timestamp.now();
            const expiresAt = admin.firestore.Timestamp.fromDate(
                new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            );

            return (parsed.insights || []).map((insight: Record<string, string>) => ({
                text: insight.text || 'Keep up the good work!',
                type: (['positive', 'neutral', 'attention', 'tip'].includes(insight.type)
                    ? insight.type
                    : 'neutral') as InsightType,
                category: (['medication', 'vitals', 'engagement', 'general'].includes(insight.category)
                    ? insight.category
                    : 'general') as HealthInsight['category'],
                generatedAt: now,
                expiresAt,
            }));
        } catch (error) {
            functions.logger.error('[InsightGenerator] Failed to generate insights:', error);
            // Return a generic fallback insight
            return [{
                text: 'Keep up with your health tracking! Every reading helps your care team.',
                type: 'tip',
                category: 'general',
                generatedAt: admin.firestore.Timestamp.now(),
                expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
            }];
        }
    }

    /**
     * Build a summary string for AI context.
     */
    private buildContextSummary(context: InsightGenerationContext): string {
        const parts: string[] = [];

        // BP data
        if (context.bpReadings?.length) {
            const latest = context.bpReadings[0];
            const avgSystolic = Math.round(
                context.bpReadings.reduce((a, b) => a + b.systolic, 0) / context.bpReadings.length
            );
            const avgDiastolic = Math.round(
                context.bpReadings.reduce((a, b) => a + b.diastolic, 0) / context.bpReadings.length
            );
            parts.push(`Blood Pressure:`);
            parts.push(`  - ${context.bpReadings.length} readings in past 2 weeks`);
            parts.push(`  - Latest: ${latest.systolic}/${latest.diastolic}`);
            parts.push(`  - Average: ${avgSystolic}/${avgDiastolic}`);
            parts.push(`  - Goal: 120/80 (standard healthy target)`);
            // Calculate progress
            const inRangeCount = context.bpReadings.filter(r => r.systolic <= 130 && r.diastolic <= 80).length;
            parts.push(`  - Readings in healthy range: ${inRangeCount}/${context.bpReadings.length}`);
        }

        if (context.glucoseReadings?.length) {
            const latest = context.glucoseReadings[0];
            const avg = Math.round(
                context.glucoseReadings.reduce((a, b) => a + b.reading, 0) / context.glucoseReadings.length
            );
            parts.push(`Blood Glucose:`);
            parts.push(`  - ${context.glucoseReadings.length} readings in past 2 weeks`);
            parts.push(`  - Latest: ${latest.reading} mg/dL (${latest.timing})`);
            parts.push(`  - Average: ${avg} mg/dL`);
            parts.push(`  - Target range: 70-130 mg/dL (fasting), <180 mg/dL (after meals)`);
            // Calculate in-range readings
            const inRangeCount = context.glucoseReadings.filter(r => r.reading >= 70 && r.reading <= 180).length;
            parts.push(`  - Readings in target range: ${inRangeCount}/${context.glucoseReadings.length}`);
        }

        // Weight data
        if (context.weightReadings?.length) {
            const latest = context.weightReadings[0];
            const oldest = context.weightReadings[context.weightReadings.length - 1];
            const change = latest.weight - oldest.weight;
            parts.push(`Weight:`);
            parts.push(`  - ${context.weightReadings.length} readings`);
            parts.push(`  - Latest: ${latest.weight} lbs`);
            if (context.weightReadings.length > 1) {
                parts.push(`  - Change: ${change > 0 ? '+' : ''}${change.toFixed(1)} lbs`);
            }
        }

        // Medications
        if (context.activeMedications?.length) {
            parts.push(`Active Medications: ${context.activeMedications.map(m => m.name).join(', ')}`);
        }

        // Nudge engagement
        if (context.nudgesCompleted || context.nudgesDismissed) {
            parts.push(`LumiBot Check-ins (2 weeks):`);
            parts.push(`  - Completed: ${context.nudgesCompleted || 0}`);
            parts.push(`  - Dismissed: ${context.nudgesDismissed || 0}`);
            if (context.adherenceRate !== undefined) {
                parts.push(`  - Positive response rate: ${context.adherenceRate}%`);
            }
        }

        // Concerning responses
        if (context.concerningResponses?.length) {
            parts.push(`Issues Reported:`);
            context.concerningResponses.slice(0, 3).forEach(r => {
                parts.push(`  - "${r.response}" ${r.medicationName ? `for ${r.medicationName}` : ''}`);
            });
        }

        return parts.join('\n');
    }

    /**
     * Store insights in Firestore.
     */
    private async storeInsights(userId: string, insights: HealthInsight[]): Promise<void> {
        await this.insightService.replaceInsightsForUser(
            userId,
            insights,
            admin.firestore.Timestamp.now(),
        );
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

let insightGeneratorInstance: InsightGeneratorService | null = null;

export const getInsightGeneratorService = (): InsightGeneratorService => {
    if (!insightGeneratorInstance) {
        insightGeneratorInstance = new InsightGeneratorService();
    }
    return insightGeneratorInstance;
};
