/**
 * Patient Context Aggregator
 * 
 * Aggregates patient data from Firestore to provide context for AI-powered
 * LumiBot message generation. This enables personalized nudges based on
 * the patient's medical history, medications, and health trends.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// =============================================================================
// Types
// =============================================================================

export interface MedicationInfo {
    id: string;
    name: string;
    dose?: string;
    frequency?: string;
    startedAt?: Date;
    active: boolean;
}

export interface HealthLogTrend {
    type: string;
    trend: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
    lastValue?: unknown;
    lastLoggedAt?: Date;
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
        averageResponseTimeHours?: number;
    };

    // Context timestamp
    aggregatedAt: Date;
}

// =============================================================================
// Firestore Access
// =============================================================================

const db = () => admin.firestore();

// =============================================================================
// Health Log Trend Analysis
// =============================================================================

interface NumericLogEntry {
    value: number;
    createdAt: admin.firestore.Timestamp;
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

async function getHealthLogTrends(userId: string, daysBack: number = 30): Promise<HealthLogTrend[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const snapshot = await db()
        .collection('healthLogs')
        .where('userId', '==', userId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .orderBy('createdAt', 'desc')
        .get();

    // Group by type
    const logsByType: Record<string, admin.firestore.DocumentData[]> = {};
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const type = data.type as string;
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
                .filter(l => l.value?.systolic)
                .map(l => ({
                    value: l.value.systolic as number,
                    createdAt: l.createdAt as admin.firestore.Timestamp,
                }));
        } else if (type === 'glucose') {
            numericValues = logs
                .filter(l => l.value?.reading)
                .map(l => ({
                    value: l.value.reading as number,
                    createdAt: l.createdAt as admin.firestore.Timestamp,
                }));
        } else if (type === 'weight') {
            numericValues = logs
                .filter(l => l.value?.weight)
                .map(l => ({
                    value: l.value.weight as number,
                    createdAt: l.createdAt as admin.firestore.Timestamp,
                }));
        }

        const trend = calculateTrend(numericValues);
        const avgValue = numericValues.length > 0
            ? numericValues.reduce((sum, v) => sum + v.value, 0) / numericValues.length
            : undefined;

        trends.push({
            type,
            trend,
            lastValue: mostRecent?.value,
            lastLoggedAt: mostRecent?.createdAt?.toDate(),
            averageValue: avgValue,
            dataPoints: logs.length,
        });
    }

    return trends;
}

// =============================================================================
// Recent Visits
// =============================================================================

async function getRecentVisits(userId: string, limit: number = 3): Promise<RecentVisitSummary[]> {
    const snapshot = await db()
        .collection('visits')
        .where('userId', '==', userId)
        .where('processingStatus', '==', 'completed')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            visitId: doc.id,
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

async function getActiveMedications(userId: string): Promise<MedicationInfo[]> {
    const snapshot = await db()
        .collection('medications')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            dose: data.dose,
            frequency: data.frequency,
            startedAt: data.createdAt?.toDate(),
            active: true,
        };
    });
}

// =============================================================================
// Nudge Engagement Metrics
// =============================================================================

async function getNudgeMetrics(userId: string): Promise<PatientContext['nudgeMetrics']> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all nudges for metrics
    const snapshot = await db()
        .collection('nudges')
        .where('userId', '==', userId)
        .get();

    let activeCount = 0;
    let completedLast30Days = 0;
    let dismissedLast30Days = 0;
    const responseTimes: number[] = [];

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const status = data.status as string;
        const completedAt = data.completedAt as admin.firestore.Timestamp | undefined;
        const scheduledFor = data.scheduledFor as admin.firestore.Timestamp | undefined;

        if (status === 'active' || status === 'pending') {
            activeCount++;
        }

        if (completedAt && completedAt.toDate() > thirtyDaysAgo) {
            if (status === 'completed') {
                completedLast30Days++;

                // Calculate response time
                if (scheduledFor) {
                    const responseTimeMs = completedAt.toMillis() - scheduledFor.toMillis();
                    if (responseTimeMs > 0) {
                        responseTimes.push(responseTimeMs / (1000 * 60 * 60)); // Convert to hours
                    }
                }
            } else if (status === 'dismissed') {
                dismissedLast30Days++;
            }
        }
    });

    const averageResponseTimeHours = responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : undefined;

    return {
        activeCount,
        completedLast30Days,
        dismissedLast30Days,
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
export async function getPatientContext(userId: string): Promise<PatientContext> {
    functions.logger.info(`[PatientContext] Aggregating context for user ${userId}`);

    try {
        // Run all queries in parallel for performance
        const [
            recentVisits,
            activeMedications,
            healthLogTrends,
            nudgeMetrics,
        ] = await Promise.all([
            getRecentVisits(userId),
            getActiveMedications(userId),
            getHealthLogTrends(userId),
            getNudgeMetrics(userId),
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
            aggregatedAt: new Date(),
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
export async function getPatientContextLight(userId: string): Promise<Pick<PatientContext, 'userId' | 'recentDiagnoses' | 'activeMedications'>> {
    const [recentVisits, activeMedications] = await Promise.all([
        getRecentVisits(userId, 2),
        getActiveMedications(userId),
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
