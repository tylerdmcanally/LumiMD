import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type TrendsPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type RegisterCareTrendsRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => TrendsPerfTracker;
    toDateSafe: (raw: unknown) => Date | null;
};

/**
 * Calculate vital trend from recent and older values.
 */
function calculateVitalTrend(recent: number[], older: number[]): {
    current: number | null;
    previous: number | null;
    change: number | null;
    changePercent: number | null;
    direction: 'up' | 'down' | 'stable' | null;
    alertLevel: string | null;
} {
    const currentAvg = recent.length > 0 ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
    const previousAvg = older.length > 0 ? Math.round(older.reduce((a, b) => a + b, 0) / older.length) : null;

    if (currentAvg === null) {
        return { current: null, previous: previousAvg, change: null, changePercent: null, direction: null, alertLevel: null };
    }

    const change = previousAvg !== null ? currentAvg - previousAvg : null;
    const changePercent = previousAvg !== null && previousAvg > 0 ? Math.round((change! / previousAvg) * 100) : null;

    let direction: 'up' | 'down' | 'stable' | null = null;
    if (changePercent !== null) {
        if (changePercent > 5) direction = 'up';
        else if (changePercent < -5) direction = 'down';
        else direction = 'stable';
    }

    return { current: currentAvg, previous: previousAvg, change, changePercent, direction, alertLevel: null };
}

function toValueRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
}

function toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function registerCareTrendsRoutes(
    router: Router,
    options: RegisterCareTrendsRoutesOptions,
): void {
    const { getDb, createPerfTracker, toDateSafe } = options;
    const getTrendServices = () => createDomainServiceContainer({ db: getDb() });

    router.get('/:patientId/trends', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;

        try {
            const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 7), 90);

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
                onForbidden: () => {
                    statusCode = 403;
                },
            }))) {
                return;
            }

            const now = new Date();
            const startDate = new Date(now);
            startDate.setDate(startDate.getDate() - days);
            const midDate = new Date(now);
            midDate.setDate(midDate.getDate() - Math.floor(days / 2));
            const {
                actionService,
                healthLogService,
                medicationLogService,
                visitService,
            } = getTrendServices();

            const medLogsPromise = medicationLogService.listForUser(patientId, {
                startDate,
                dateField: 'createdAt',
            })
                .catch((err) => {
                    functions.logger.warn('[care] Error fetching adherence data:', err);
                    return null;
                });

            const [healthLogRecords, actionRecords, lastVisitPage, medLogRecords] = await Promise.all([
                healthLogService.listForUser(patientId, {
                    startDate,
                    sortDirection: 'desc',
                    includeDeleted: true,
                }),
                actionService.listAllForUser(patientId, {
                    sortDirection: 'desc',
                    includeDeleted: true,
                }),
                visitService.listForUser(patientId, {
                    limit: 5,
                    sortDirection: 'desc',
                    includeDeleted: true,
                }),
                medLogsPromise,
            ]);
            perf.addQueries(4);

            const healthLogs = healthLogRecords
                .filter((healthLog) => !healthLog.deletedAt)
                .map((data) => {
                    return {
                        type: data.type,
                        value: data.value,
                        alertLevel: data.alertLevel,
                        createdAt: toDateSafe(data.createdAt) || now,
                    };
                });

            // Split into recent and older halves
            const recentLogs = healthLogs.filter((l) => l.createdAt >= midDate);
            const olderLogs = healthLogs.filter((l) => l.createdAt < midDate);

            // Calculate BP trends
            const recentBpSystolic = recentLogs
                .filter((l) => l.type === 'bp')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['systolic']))
                .filter((value): value is number => value !== null);
            const olderBpSystolic = olderLogs
                .filter((l) => l.type === 'bp')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['systolic']))
                .filter((value): value is number => value !== null);
            const recentBpDiastolic = recentLogs
                .filter((l) => l.type === 'bp')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['diastolic']))
                .filter((value): value is number => value !== null);
            const olderBpDiastolic = olderLogs
                .filter((l) => l.type === 'bp')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['diastolic']))
                .filter((value): value is number => value !== null);

            const latestBp = healthLogs.find((l) => l.type === 'bp');
            const latestBpValue = latestBp ? toValueRecord(latestBp.value) : null;

            const bpTrend = {
                systolic: calculateVitalTrend(recentBpSystolic, olderBpSystolic),
                diastolic: calculateVitalTrend(recentBpDiastolic, olderBpDiastolic),
                latestReading: latestBpValue ? `${latestBpValue['systolic']}/${latestBpValue['diastolic']}` : null,
                latestDate: latestBp?.createdAt.toISOString() || null,
            };

            // Calculate glucose trends
            const recentGlucose = recentLogs
                .filter((l) => l.type === 'glucose')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['reading']))
                .filter((value): value is number => value !== null);
            const olderGlucose = olderLogs
                .filter((l) => l.type === 'glucose')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['reading']))
                .filter((value): value is number => value !== null);
            const latestGlucose = healthLogs.find((l) => l.type === 'glucose');
            const latestGlucoseValue = latestGlucose ? toValueRecord(latestGlucose.value) : null;

            const glucoseTrend = {
                ...calculateVitalTrend(recentGlucose, olderGlucose),
                latestReading: latestGlucoseValue ? `${latestGlucoseValue['reading']} mg/dL` : null,
                latestDate: latestGlucose?.createdAt.toISOString() || null,
            };

            // Calculate weight trends
            const recentWeight = recentLogs
                .filter((l) => l.type === 'weight')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['weight']))
                .filter((value): value is number => value !== null);
            const olderWeight = olderLogs
                .filter((l) => l.type === 'weight')
                .map((l) => toFiniteNumber(toValueRecord(l.value)['weight']))
                .filter((value): value is number => value !== null);
            const latestWeight = healthLogs.find((l) => l.type === 'weight');
            const latestWeightValue = latestWeight ? toValueRecord(latestWeight.value) : null;

            const weightTrend = {
                ...calculateVitalTrend(recentWeight, olderWeight),
                latestReading: latestWeightValue
                    ? `${latestWeightValue['weight']} ${latestWeightValue['unit'] || 'lbs'}`
                    : null,
                latestDate: latestWeight?.createdAt.toISOString() || null,
            };

            // Fetch medication adherence data
            let adherenceData = {
                current: 0,
                previous: 0,
                change: 0,
                direction: 'stable' as 'up' | 'down' | 'stable',
                streak: 0,
            };

            if (medLogRecords) {
                const medLogs = medLogRecords.map((data) => ({
                    action: data.action,
                    createdAt: data.createdAt?.toDate?.() || now,
                }));

                const recentMedLogs = medLogs.filter((l) => l.createdAt >= midDate);
                const olderMedLogs = medLogs.filter((l) => l.createdAt < midDate);

                const recentTaken = recentMedLogs.filter((l) => l.action === 'taken').length;
                const recentTotal = recentMedLogs.length;
                const olderTaken = olderMedLogs.filter((l) => l.action === 'taken').length;
                const olderTotal = olderMedLogs.length;

                const currentRate = recentTotal > 0 ? Math.round((recentTaken / recentTotal) * 100) : 0;
                const previousRate = olderTotal > 0 ? Math.round((olderTaken / olderTotal) * 100) : 0;

                // Calculate streak in O(days + logs) by pre-grouping daily totals.
                const dailyTotals = new Map<string, { total: number; taken: number }>();
                medLogs.forEach((log) => {
                    const dayKey = log.createdAt.toISOString().split('T')[0];
                    const current = dailyTotals.get(dayKey) ?? { total: 0, taken: 0 };
                    current.total += 1;
                    if (log.action === 'taken') {
                        current.taken += 1;
                    }
                    dailyTotals.set(dayKey, current);
                });

                let streak = 0;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                for (let i = 0; i < days; i++) {
                    const checkDate = new Date(today);
                    checkDate.setDate(checkDate.getDate() - i);
                    const dateStr = checkDate.toISOString().split('T')[0];
                    const daySummary = dailyTotals.get(dateStr);
                    if (daySummary && daySummary.taken > 0 && daySummary.taken === daySummary.total) {
                        streak++;
                    } else if (daySummary && daySummary.total > 0) {
                        break;
                    }
                }

                adherenceData = {
                    current: currentRate,
                    previous: previousRate,
                    change: currentRate - previousRate,
                    direction: currentRate > previousRate ? 'up' : currentRate < previousRate ? 'down' : 'stable',
                    streak,
                };
            }

            const actions = actionRecords.map((data) => {
                return {
                    completed: data.completed,
                    completedAt: toDateSafe(data.completedAt),
                    dueAt: data.dueAt ? (typeof data.dueAt === 'string' ? new Date(data.dueAt) : toDateSafe(data.dueAt)) : null,
                    deletedAt: data.deletedAt ? toDateSafe(data.deletedAt) : null,
                };
            }).filter((action) => !action.deletedAt);

            const completedInPeriod = actions.filter((a) => a.completed && a.completedAt && a.completedAt >= startDate).length;
            const pending = actions.filter((a) => !a.completed).length;
            const overdue = actions.filter((a) => !a.completed && a.dueAt && a.dueAt < now).length;
            const totalActions = actions.length;
            const completionRate = totalActions > 0 ? Math.round((actions.filter((a) => a.completed).length / totalActions) * 100) : 0;

            const actionsData = {
                completed: completedInPeriod,
                pending,
                overdue,
                completionRate,
            };

            // Calculate coverage metrics
            const uniqueVitalDays = new Set(healthLogs.map((l) => l.createdAt.toISOString().split('T')[0])).size;
            const expectedVitalDays = days;
            const vitalsCoveragePercent = Math.round((uniqueVitalDays / expectedVitalDays) * 100);

            // Get last non-deleted visit date
            const lastVisit = lastVisitPage.items.find((visit) => !visit.deletedAt);
            const lastVisitDate = toDateSafe(lastVisit?.visitDate) || toDateSafe(lastVisit?.createdAt) || null;

            const lastVitalDate = healthLogs[0]?.createdAt || null;
            const daysWithoutVitals = lastVitalDate ? Math.floor((now.getTime() - lastVitalDate.getTime()) / (1000 * 60 * 60 * 24)) : days;
            const daysWithoutVisit = lastVisitDate ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;

            const coverage = {
                vitalsLogged: uniqueVitalDays,
                vitalsExpected: expectedVitalDays,
                vitalsCoveragePercent,
                lastVitalDate: lastVitalDate?.toISOString() || null,
                lastVisitDate: lastVisitDate?.toISOString() || null,
                daysWithoutVitals,
                daysWithoutVisit,
                isStale: daysWithoutVitals >= 10,
            };

            res.set('Cache-Control', 'private, max-age=60');
            res.json({
                vitals: {
                    bp: bpTrend,
                    glucose: glucoseTrend,
                    weight: weightTrend,
                },
                adherence: adherenceData,
                actions: actionsData,
                coverage,
                period: {
                    days,
                    from: startDate.toISOString(),
                    to: now.toISOString(),
                },
            });
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error fetching trends:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to fetch trends' });
        } finally {
            perf.finalize(statusCode);
        }
    });
}
