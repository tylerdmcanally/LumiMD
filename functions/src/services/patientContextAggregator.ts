/**
 * Patient Context Aggregator
 * 
 * Aggregates patient data from Firestore to provide context for AI-powered
 * LumiBot message generation. This enables personalized nudges based on
 * the patient's medical history, medications, and health trends.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { HealthLogDomainService } from './domain/healthLogs/HealthLogDomainService';
import { MedicationDomainService } from './domain/medications/MedicationDomainService';
import { NudgeDomainService } from './domain/nudges/NudgeDomainService';
import { VisitDomainService } from './domain/visits/VisitDomainService';
import { FirestoreHealthLogRepository } from './repositories/healthLogs/FirestoreHealthLogRepository';
import { FirestoreMedicationRepository } from './repositories/medications/FirestoreMedicationRepository';
import { FirestoreNudgeRepository } from './repositories/nudges/FirestoreNudgeRepository';
import { FirestoreVisitRepository } from './repositories/visits/FirestoreVisitRepository';

// =============================================================================
// Types
// =============================================================================

export interface MedicationInfo {
    id: string;
    name: string;
    dose?: string;
    frequency?: string;
    startedAt?: Date;
    daysOnMedication?: number;  // How long user has been on this med
    active: boolean;
}

export interface HealthLogTrend {
    type: string;
    trend: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
    lastValue?: unknown;
    lastLoggedAt?: Date;
    daysSinceLastLog?: number;  // For AI to reference stale data
    averageValue?: number;
    dataPoints: number;
}

export interface RecentVisitSummary {
    visitId: string;
    visitDate: Date;
    diagnoses: string[];
    medicationsStarted: string[];
    medicationsStopped: string[];
    nextSteps: string[];
}

export interface PatientContext {
    userId: string;

    // Recent diagnoses from visits (last 90 days)
    recentDiagnoses: string[];

    // Active medications
    activeMedications: MedicationInfo[];

    // Recent visit summaries (last 3 visits)
    recentVisits: RecentVisitSummary[];

    // Health log trends (BP, glucose, weight)
    healthLogTrends: HealthLogTrend[];

    // Nudge engagement metrics
    nudgeMetrics: {
        activeCount: number;
        completedLast30Days: number;
        dismissedLast30Days: number;
        concerningResponsesLast30Days: number;  // For AI to detect patterns
        averageResponseTimeHours?: number;
    };

    // Context timestamp
    aggregatedAt: Date;
}

// =============================================================================
// Firestore Access
// =============================================================================

type PatientContextDependencies = {
    healthLogService?: Pick<HealthLogDomainService, 'listForUser'>;
    medicationService?: Pick<MedicationDomainService, 'listAllForUser'>;
    nudgeService?: Pick<NudgeDomainService, 'listByUserAndStatuses'>;
    visitService?: Pick<VisitDomainService, 'listAllForUser'>;
    nowProvider?: () => Date;
};

function buildDefaultDependencies(): Required<Omit<PatientContextDependencies, 'nowProvider'>> {
    const db = admin.firestore();
    return {
        healthLogService: new HealthLogDomainService(new FirestoreHealthLogRepository(db)),
        medicationService: new MedicationDomainService(new FirestoreMedicationRepository(db)),
        nudgeService: new NudgeDomainService(new FirestoreNudgeRepository(db)),
        visitService: new VisitDomainService(new FirestoreVisitRepository(db)),
    };
}

function resolveDependencies(
    overrides: PatientContextDependencies,
): Required<PatientContextDependencies> {
    const defaults = buildDefaultDependencies();
    return {
        healthLogService: overrides.healthLogService ?? defaults.healthLogService,
        medicationService: overrides.medicationService ?? defaults.medicationService,
        nudgeService: overrides.nudgeService ?? defaults.nudgeService,
        visitService: overrides.visitService ?? defaults.visitService,
        nowProvider: overrides.nowProvider ?? (() => new Date()),
    };
}

// =============================================================================
// Health Log Trend Analysis
// =============================================================================

interface NumericLogEntry {
    value: number;
    createdAt: FirebaseFirestore.Timestamp;
}

function calculateTrend(values: NumericLogEntry[]): 'improving' | 'stable' | 'worsening' | 'insufficient_data' {
    if (values.length < 3) {
        return 'insufficient_data';
    }

    // Sort by date ascending
    const sorted = [...values].sort((a, b) =>
        a.createdAt.toMillis() - b.createdAt.toMillis()
    );

    // Compare first third average to last third average
    const thirdLength = Math.floor(sorted.length / 3);
    const firstThird = sorted.slice(0, thirdLength);
    const lastThird = sorted.slice(-thirdLength);

    const firstAvg = firstThird.reduce((sum, v) => sum + v.value, 0) / firstThird.length;
    const lastAvg = lastThird.reduce((sum, v) => sum + v.value, 0) / lastThird.length;

    const percentChange = ((lastAvg - firstAvg) / firstAvg) * 100;

    // For BP/glucose, lower is generally better
    // 5% threshold for significance
    if (percentChange < -5) {
        return 'improving';
    } else if (percentChange > 5) {
        return 'worsening';
    }
    return 'stable';
}

async function getHealthLogTrends(
    userId: string,
    dependencies: Required<PatientContextDependencies>,
    daysBack: number = 30,
): Promise<HealthLogTrend[]> {
    const startDate = dependencies.nowProvider();
    startDate.setDate(startDate.getDate() - daysBack);

    const logs = await dependencies.healthLogService.listForUser(userId, {
        startDate,
        sortDirection: 'desc',
    });

    // Group by type
    const logsByType: Record<string, FirebaseFirestore.DocumentData[]> = {};
    logs.forEach((data) => {
        const type = typeof data.type === 'string' ? data.type : null;
        if (!type) {
            return;
        }
        if (!logsByType[type]) {
            logsByType[type] = [];
        }
        logsByType[type].push(data);
    });

    const trends: HealthLogTrend[] = [];

    for (const [type, logs] of Object.entries(logsByType)) {
        const mostRecent = logs[0];

        // Extract numeric values for trend analysis
        let numericValues: NumericLogEntry[] = [];

        if (type === 'bp') {
            // Use systolic for BP trend
            numericValues = logs
                .filter((l) => {
                    const value =
                        l.value && typeof l.value === 'object'
                            ? (l.value as Record<string, unknown>)
                            : null;
                    return value !== null && typeof value.systolic === 'number';
                })
                .map(l => ({
                    value: (l.value as Record<string, number>).systolic,
                    createdAt: l.createdAt as FirebaseFirestore.Timestamp,
                }));
        } else if (type === 'glucose') {
            numericValues = logs
                .filter((l) => {
                    const value =
                        l.value && typeof l.value === 'object'
                            ? (l.value as Record<string, unknown>)
                            : null;
                    return value !== null && typeof value.reading === 'number';
                })
                .map(l => ({
                    value: (l.value as Record<string, number>).reading,
                    createdAt: l.createdAt as FirebaseFirestore.Timestamp,
                }));
        } else if (type === 'weight') {
            numericValues = logs
                .filter((l) => {
                    const value =
                        l.value && typeof l.value === 'object'
                            ? (l.value as Record<string, unknown>)
                            : null;
                    return value !== null && typeof value.weight === 'number';
                })
                .map(l => ({
                    value: (l.value as Record<string, number>).weight,
                    createdAt: l.createdAt as FirebaseFirestore.Timestamp,
                }));
        }

        const trend = calculateTrend(numericValues);
        const avgValue = numericValues.length > 0
            ? numericValues.reduce((sum, v) => sum + v.value, 0) / numericValues.length
            : undefined;

        // Calculate days since last log
        const lastLogDate = mostRecent?.createdAt?.toDate();
        const daysSinceLastLog = lastLogDate
            ? Math.floor((Date.now() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24))
            : undefined;

        trends.push({
            type,
            trend,
            lastValue: mostRecent?.value,
            lastLoggedAt: lastLogDate,
            daysSinceLastLog,
            averageValue: avgValue,
            dataPoints: logs.length,
        });
    }

    return trends;
}

// =============================================================================
// Recent Visits
// =============================================================================

async function getRecentVisits(
    userId: string,
    dependencies: Required<PatientContextDependencies>,
    limit: number = 3,
): Promise<RecentVisitSummary[]> {
    const visits = await dependencies.visitService.listAllForUser(userId, {
        sortDirection: 'desc',
    });

    return visits
        .filter((visit) => visit.processingStatus === 'completed')
        .slice(0, limit)
        .map((data) => {
        return {
            visitId: data.id,
            visitDate: data.visitDate?.toDate() || data.createdAt?.toDate() || new Date(),
            diagnoses: data.diagnoses || [],
            medicationsStarted: (data.medications?.started || []).map((m: unknown) =>
                typeof m === 'string' ? m : (m as { name?: string })?.name || ''
            ).filter(Boolean),
            medicationsStopped: (data.medications?.stopped || []).map((m: unknown) =>
                typeof m === 'string' ? m : (m as { name?: string })?.name || ''
            ).filter(Boolean),
            nextSteps: data.nextSteps || [],
        };
    });
}

// =============================================================================
// Active Medications
// =============================================================================

async function getActiveMedications(
    userId: string,
    dependencies: Required<PatientContextDependencies>,
): Promise<MedicationInfo[]> {
    const medications = await dependencies.medicationService.listAllForUser(userId);

    return medications
        .filter((data) => data.active === true)
        .map((data) => {
        const startedAt = data.createdAt?.toDate();
        const daysOnMedication = startedAt
            ? Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24))
            : undefined;
        return {
            id: data.id,
            name: data.name,
            dose: data.dose,
            frequency: data.frequency,
            startedAt,
            daysOnMedication,
            active: true,
        };
    });
}

// =============================================================================
// Nudge Engagement Metrics
// =============================================================================

async function getNudgeMetrics(
    userId: string,
    dependencies: Required<PatientContextDependencies>,
): Promise<PatientContext['nudgeMetrics']> {
    const thirtyDaysAgo = dependencies.nowProvider();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all relevant nudge statuses for metrics
    const nudges = await dependencies.nudgeService.listByUserAndStatuses(userId, [
        'pending',
        'active',
        'completed',
        'dismissed',
        'snoozed',
    ]);

    let activeCount = 0;
    let completedLast30Days = 0;
    let dismissedLast30Days = 0;
    let concerningResponsesLast30Days = 0;
    const responseTimes: number[] = [];

    nudges.forEach((data) => {
        const status = data.status as string;
        const completedAt = data.completedAt as FirebaseFirestore.Timestamp | undefined;
        const dismissedAt = data.dismissedAt as FirebaseFirestore.Timestamp | undefined;
        const scheduledFor = data.scheduledFor as FirebaseFirestore.Timestamp | undefined;
        const responseValue = data.responseValue as Record<string, unknown> | undefined;

        if (status === 'active' || status === 'pending') {
            activeCount++;
        }

        if (status === 'completed' && completedAt && completedAt.toDate() > thirtyDaysAgo) {
            completedLast30Days++;

            // Track concerning responses
            const response = responseValue?.response as string | undefined;
            if (response && ['having_trouble', 'issues', 'concerning'].includes(response)) {
                concerningResponsesLast30Days++;
            }

            // Calculate response time
            if (scheduledFor) {
                const responseTimeMs = completedAt.toMillis() - scheduledFor.toMillis();
                if (responseTimeMs > 0) {
                    responseTimes.push(responseTimeMs / (1000 * 60 * 60)); // Convert to hours
                }
            }
        } else if (status === 'dismissed' && dismissedAt && dismissedAt.toDate() > thirtyDaysAgo) {
            dismissedLast30Days++;
        }
    });

    const averageResponseTimeHours = responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : undefined;

    return {
        activeCount,
        completedLast30Days,
        dismissedLast30Days,
        concerningResponsesLast30Days,
        averageResponseTimeHours,
    };
}

// =============================================================================
// Main Aggregation Function
// =============================================================================

/**
 * Aggregates patient context for AI-powered message generation.
 * Returns a comprehensive view of the patient's recent medical history,
 * medications, health trends, and engagement with LumiBot.
 */
export async function getPatientContext(
    userId: string,
    dependencyOverrides: PatientContextDependencies = {},
): Promise<PatientContext> {
    functions.logger.info(`[PatientContext] Aggregating context for user ${userId}`);
    const dependencies = resolveDependencies(dependencyOverrides);

    try {
        // Run all queries in parallel for performance
        const [
            recentVisits,
            activeMedications,
            healthLogTrends,
            nudgeMetrics,
        ] = await Promise.all([
            getRecentVisits(userId, dependencies),
            getActiveMedications(userId, dependencies),
            getHealthLogTrends(userId, dependencies),
            getNudgeMetrics(userId, dependencies),
        ]);

        // Extract unique diagnoses from recent visits
        const recentDiagnoses = [...new Set(
            recentVisits.flatMap(v => v.diagnoses)
        )];

        const context: PatientContext = {
            userId,
            recentDiagnoses,
            activeMedications,
            recentVisits,
            healthLogTrends,
            nudgeMetrics,
            aggregatedAt: dependencies.nowProvider(),
        };

        functions.logger.info(`[PatientContext] Aggregated context`, {
            userId,
            diagnosesCount: recentDiagnoses.length,
            medicationsCount: activeMedications.length,
            visitsCount: recentVisits.length,
            trendsCount: healthLogTrends.length,
        });

        return context;
    } catch (error) {
        functions.logger.error(`[PatientContext] Error aggregating context for user ${userId}:`, error);
        throw error;
    }
}

/**
 * Lightweight context fetch for simple use cases.
 * Only gets medications and recent diagnoses (faster, fewer queries).
 */
export async function getPatientContextLight(
    userId: string,
    dependencyOverrides: PatientContextDependencies = {},
): Promise<Pick<PatientContext, 'userId' | 'recentDiagnoses' | 'activeMedications'>> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const [recentVisits, activeMedications] = await Promise.all([
        getRecentVisits(userId, dependencies, 2),
        getActiveMedications(userId, dependencies),
    ]);

    const recentDiagnoses = [...new Set(
        recentVisits.flatMap(v => v.diagnoses)
    )];

    return {
        userId,
        recentDiagnoses,
        activeMedications,
    };
}
