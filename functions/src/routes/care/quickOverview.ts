import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type DayWindow = {
    timezone: string;
    todayStr: string;
    startOfDayUTC: Date;
    endOfDayUTC: Date;
    currentMinutes: number;
};

type QuickOverviewPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type MedicationStatusResult = {
    missed: number;
    [key: string]: unknown;
};

type RegisterCareQuickOverviewRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => QuickOverviewPerfTracker;
    resolveTimezone: (rawTimezone: unknown) => string;
    getDayWindow: (timezone: string, now?: Date) => DayWindow;
    getTodaysMedicationStatus: (
        patientId: string,
        options: {
            timezone?: string;
            medicationsSnapshot?: FirebaseFirestore.QuerySnapshot;
            remindersSnapshot?: FirebaseFirestore.QuerySnapshot;
            logsSnapshot?: FirebaseFirestore.QuerySnapshot;
            now?: Date;
        },
    ) => Promise<MedicationStatusResult>;
    parseActionDueAt: (rawDueAt: unknown) => Date | null;
    formatHealthValue: (type: string, value: unknown) => string;
    getHealthLogTypeLabel: (type: string) => string;
    toDateSafe: (raw: unknown) => Date | null;
};

export function registerCareQuickOverviewRoutes(
    router: Router,
    options: RegisterCareQuickOverviewRoutesOptions,
): void {
    const {
        getDb,
        createPerfTracker,
        resolveTimezone,
        getDayWindow,
        getTodaysMedicationStatus,
        parseActionDueAt,
        formatHealthValue,
        getHealthLogTypeLabel,
        toDateSafe,
    } = options;
    const getQuickOverviewServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/quick-overview
    // Fetch quick overview data for enhanced patient dashboard
    router.get('/:patientId/quick-overview', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;
        let weekLogFallbackUsed = false;

        try {
            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                onForbidden: () => {
                    statusCode = 403;
                },
            }))) {
                return;
            }

            const now = new Date();
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            const medChangeWindowStart = new Date(now);
            medChangeWindowStart.setDate(medChangeWindowStart.getDate() - 30);

            const {
                actionService,
                healthLogService,
                medicationLogService,
                medicationReminderService,
                userService,
                visitService,
            } = getQuickOverviewServices();
            const profileDoc = await userService.getById(patientId);
            perf.addQueries(1);
            const userTimezone = resolveTimezone(profileDoc?.timezone);
            const dayWindow = getDayWindow(userTimezone, now);

            // Parallel fetch all data needed for status + activity + action/change summaries.
            const [
                medsSnapshot,
                reminders,
                todayMedLogs,
                healthLogRecords,
                recentActionRecords,
                recentVisitsPage,
            ] = await Promise.all([
                getDb()
                    .collection('medications')
                    .where('userId', '==', patientId)
                    .get(),
                medicationReminderService.listForUser(patientId, {
                    enabled: true,
                }),
                medicationLogService.listForUser(patientId, {
                    startDate: dayWindow.startOfDayUTC,
                    endDate: dayWindow.endOfDayUTC,
                    dateField: 'loggedAt',
                }),
                healthLogService.listForUser(patientId, {
                    startDate: weekAgo,
                    sortDirection: 'desc',
                    includeDeleted: true,
                    limit: 10,
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
            ]);
            perf.addQueries(6);

            const todayMedStatus = await getTodaysMedicationStatus(patientId, {
                timezone: userTimezone,
                medicationsSnapshot: medsSnapshot,
                remindersSnapshot: {
                    docs: reminders.map((reminder) => ({
                        id: reminder.id,
                        data: () => reminder,
                    })),
                } as unknown as FirebaseFirestore.QuerySnapshot,
                logsSnapshot: {
                    docs: todayMedLogs.map((medicationLog) => ({
                        id: medicationLog.id,
                        data: () => medicationLog,
                    })),
                } as unknown as FirebaseFirestore.QuerySnapshot,
                now,
            });

            // Reuse today's logs for activity when possible and only read week logs as needed.
            const recentMedLogById = new Map<
                string,
                FirebaseFirestore.DocumentData & { id: string }
            >();
            todayMedLogs.forEach((medicationLog) => {
                recentMedLogById.set(medicationLog.id, medicationLog);
            });

            if (recentMedLogById.size < 5) {
                weekLogFallbackUsed = true;
                let recentMedLogs = await medicationLogService.listForUser(patientId, {
                    startDate: weekAgo,
                    dateField: 'createdAt',
                    limit: 10,
                }).catch(async (error) => {
                    functions.logger.warn(
                        '[care] quick-overview createdAt medicationLogs query failed; retrying with loggedAt',
                        error,
                    );

                    return medicationLogService.listForUser(patientId, {
                        startDate: weekAgo,
                        dateField: 'loggedAt',
                        limit: 10,
                    });
                });
                perf.addQueries(1);

                recentMedLogs.forEach((medicationLog) => {
                    if (!recentMedLogById.has(medicationLog.id)) {
                        recentMedLogById.set(medicationLog.id, medicationLog);
                    }
                });
            }

            const recentMedLogs = Array.from(recentMedLogById.values())
                .sort((left, right) => {
                    const leftDate =
                        toDateSafe(left.createdAt) ??
                        toDateSafe(left.loggedAt) ??
                        new Date(0);
                    const rightDate =
                        toDateSafe(right.createdAt) ??
                        toDateSafe(right.loggedAt) ??
                        new Date(0);
                    return rightDate.getTime() - leftDate.getTime();
                })
                .slice(0, 5);

            // Build needs attention items
            const needsAttention: Array<{
                type: string;
                priority: 'high' | 'medium' | 'low';
                message: string;
                actionUrl?: string;
            }> = [];

            // Check for missed medications today
            if (todayMedStatus.missed > 0) {
                needsAttention.push({
                    type: 'missed_med',
                    priority: 'high',
                    message: `${todayMedStatus.missed} missed medication${todayMedStatus.missed > 1 ? 's' : ''} today`,
                    actionUrl: `/care/${patientId}/medications`,
                });
            }

            const openActions = recentActionRecords.filter(
                (action) => action.completed === false && !action.deletedAt,
            );
            const activeHealthLogs = healthLogRecords.filter((healthLog) => !healthLog.deletedAt);
            const activeRecentVisitRecords = recentVisitsPage.items.filter((visit) => !visit.deletedAt);

            // Check for overdue actions
            const overdueActions = openActions.filter((data) => {
                const dueDate = parseActionDueAt(data.dueAt);
                return dueDate && dueDate < now;
            });
            if (overdueActions.length > 0) {
                needsAttention.push({
                    type: 'overdue_action',
                    priority: 'medium',
                    message: `${overdueActions.length} overdue action item${overdueActions.length > 1 ? 's' : ''}`,
                    actionUrl: `/care/${patientId}/actions`,
                });
            }

            // Check for health alerts
            const healthAlerts = activeHealthLogs.filter((doc) => {
                return doc.alertLevel === 'warning' || doc.alertLevel === 'emergency';
            });
            if (healthAlerts.length > 0) {
                const latest = healthAlerts[0];
                needsAttention.push({
                    type: 'health_alert',
                    priority: latest.alertLevel === 'emergency' ? 'high' : 'medium',
                    message: `Health reading flagged: ${formatHealthValue(latest.type, latest.value)}`,
                    actionUrl: `/care/${patientId}/health`,
                });
            }

            // Check for no recent logs
            if (activeHealthLogs.length === 0) {
                needsAttention.push({
                    type: 'no_recent_logs',
                    priority: 'low',
                    message: 'No health readings in the past week',
                    actionUrl: `/care/${patientId}/health`,
                });
            }

            // Sort by priority
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            needsAttention.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

            // Build health snapshot
            const healthSnapshot: {
                latestBp?: { value: string; alertLevel: string; date: string };
                latestGlucose?: { value: string; alertLevel: string; date: string };
                latestWeight?: { value: string; change?: string; date: string };
            } = {};

            activeHealthLogs.forEach((doc) => {
                const date = toDateSafe(doc.createdAt)?.toISOString() || '';
                const healthValue =
                    typeof doc.value === 'object' && doc.value !== null
                        ? (doc.value as Record<string, unknown>)
                        : {};

                if (doc.type === 'bp' && !healthSnapshot.latestBp) {
                    healthSnapshot.latestBp = {
                        value: `${healthValue['systolic']}/${healthValue['diastolic']}`,
                        alertLevel: doc.alertLevel || 'normal',
                        date,
                    };
                }
                if (doc.type === 'glucose' && !healthSnapshot.latestGlucose) {
                    healthSnapshot.latestGlucose = {
                        value: `${healthValue['reading']} mg/dL`,
                        alertLevel: doc.alertLevel || 'normal',
                        date,
                    };
                }
                if (doc.type === 'weight' && !healthSnapshot.latestWeight) {
                    healthSnapshot.latestWeight = {
                        value: `${healthValue['weight']} ${healthValue['unit'] || 'lbs'}`,
                        date,
                    };
                }
            });

            // Build recent activity
            const recentActivity: Array<{
                type: string;
                description: string;
                timestamp: string;
            }> = [];

            // Add medication logs to activity
            recentMedLogs.forEach((data) => {
                recentActivity.push({
                    type: data.action === 'taken' ? 'med_taken' : 'med_skipped',
                    description: `${data.action === 'taken' ? 'Took' : 'Skipped'} ${data.medicationName || 'medication'}`,
                    timestamp:
                        data.createdAt?.toDate?.()?.toISOString() ||
                        data.loggedAt?.toDate?.()?.toISOString() ||
                        '',
                });
            });

            // Add health logs to activity
            activeHealthLogs.slice(0, 3).forEach((doc) => {
                recentActivity.push({
                    type: 'health_log',
                    description: `Logged ${getHealthLogTypeLabel(doc.type)}: ${formatHealthValue(doc.type, doc.value)}`,
                    timestamp: toDateSafe(doc.createdAt)?.toISOString() || '',
                });
            });

            // Add recent visits to activity
            activeRecentVisitRecords.slice(0, 2).forEach((data) => {
                if (data.processingStatus === 'completed' || data.status === 'completed') {
                    recentActivity.push({
                        type: 'visit',
                        description: `Visit with ${data.provider || 'provider'}`,
                        timestamp: data.visitDate?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || '',
                    });
                }
            });

            // Sort by timestamp (newest first)
            recentActivity.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            const upcomingActions = openActions.map((data) => {
                const dueDate = parseActionDueAt(data.dueAt);
                const isOverdue = dueDate ? dueDate < now : false;
                const daysUntilDue = dueDate
                    ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                return {
                    id: data.id,
                    description: data.description || data.text || 'Unknown task',
                    dueAt: dueDate?.toISOString() || null,
                    isOverdue,
                    daysUntilDue,
                    visitId: data.visitId || null,
                    source: data.source || 'manual',
                };
            }).sort((a, b) => {
                if (a.isOverdue && !b.isOverdue) return -1;
                if (!a.isOverdue && b.isOverdue) return 1;
                if (a.daysUntilDue === null && b.daysUntilDue !== null) return 1;
                if (a.daysUntilDue !== null && b.daysUntilDue === null) return -1;
                return (a.daysUntilDue || 0) - (b.daysUntilDue || 0);
            });

            const upcomingActionsSummary = {
                overdue: upcomingActions.filter((a) => a.isOverdue).length,
                dueToday: upcomingActions.filter((a) => !a.isOverdue && a.daysUntilDue !== null && a.daysUntilDue <= 0).length,
                dueThisWeek: upcomingActions.filter((a) => !a.isOverdue && a.daysUntilDue !== null && a.daysUntilDue > 0 && a.daysUntilDue <= 7).length,
                dueLater: upcomingActions.filter((a) => !a.isOverdue && (a.daysUntilDue === null || a.daysUntilDue > 7)).length,
            };

            const recentMedicationChanges: Array<{
                id: string;
                name: string;
                changeType: 'started' | 'stopped' | 'modified';
                changeDate: string;
                dose?: string | null;
                previousDose?: string | null;
            }> = [];

            medsSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                if (data.deletedAt) {
                    return;
                }

                const startedAt = toDateSafe(data.startedAt);
                const stoppedAt = toDateSafe(data.stoppedAt);
                const changedAt = toDateSafe(data.changedAt);

                if (startedAt && startedAt >= medChangeWindowStart) {
                    recentMedicationChanges.push({
                        id: doc.id,
                        name: data.name || 'Unknown',
                        changeType: 'started',
                        changeDate: startedAt.toISOString(),
                        dose: data.dose || null,
                    });
                }

                if (stoppedAt && stoppedAt >= medChangeWindowStart) {
                    recentMedicationChanges.push({
                        id: doc.id,
                        name: data.name || 'Unknown',
                        changeType: 'stopped',
                        changeDate: stoppedAt.toISOString(),
                        dose: data.dose || null,
                    });
                }

                if (changedAt && changedAt >= medChangeWindowStart && !startedAt && !stoppedAt) {
                    recentMedicationChanges.push({
                        id: doc.id,
                        name: data.name || 'Unknown',
                        changeType: 'modified',
                        changeDate: changedAt.toISOString(),
                        dose: data.dose || null,
                        previousDose: data.previousDose || null,
                    });
                }
            });

            recentMedicationChanges.sort(
                (a, b) => new Date(b.changeDate).getTime() - new Date(a.changeDate).getTime(),
            );

            res.set('Cache-Control', 'private, max-age=30');
            res.json({
                date: dayWindow.todayStr,
                needsAttention,
                todaysMeds: todayMedStatus,
                recentActivity: recentActivity.slice(0, 5),
                healthSnapshot,
                upcomingActions: {
                    actions: upcomingActions.slice(0, 5),
                    summary: upcomingActionsSummary,
                },
                recentMedicationChanges: {
                    changes: recentMedicationChanges.slice(0, 10),
                    period: {
                        days: 30,
                        from: medChangeWindowStart.toISOString(),
                        to: now.toISOString(),
                    },
                },
            });
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error fetching quick overview:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch quick overview',
            });
        } finally {
            perf.finalize(statusCode, { weekLogFallbackUsed });
        }
    });
}
