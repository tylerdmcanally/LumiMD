import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type AlertsPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type MedicationStatusResult = {
    missed: number;
    [key: string]: unknown;
};

type CareAlert = {
    id: string;
    type: 'missed_dose' | 'overdue_action' | 'health_warning' | 'no_data' | 'med_change';
    severity: 'emergency' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    targetUrl?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
};

type RegisterCareAlertsRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => AlertsPerfTracker;
    resolveTimezone: (rawTimezone: unknown) => string;
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
    formatHealthValue: (type: string, value: unknown) => string;
    getHealthLogTypeLabel: (type: string) => string;
};

export function registerCareAlertsRoutes(
    router: Router,
    options: RegisterCareAlertsRoutesOptions,
): void {
    const {
        getDb,
        createPerfTracker,
        resolveTimezone,
        getTodaysMedicationStatus,
        formatHealthValue,
        getHealthLogTypeLabel,
    } = options;
    const getAlertServices = () => createDomainServiceContainer({ db: getDb() });

    router.get('/:patientId/alerts', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;

        try {
            const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 30);

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

            const alerts: CareAlert[] = [];

            // 1b. Check 7-day adherence rate for declining compliance
            const adherenceWindowStart = new Date(now);
            adherenceWindowStart.setDate(adherenceWindowStart.getDate() - 7);
            const {
                actionService,
                healthLogService,
                medicationLogService,
                medicationReminderService,
                medicationService,
                userService,
            } = getAlertServices();

            const [profile, recentLogs, reminders, medicationRecords] = await Promise.all([
                userService.getById(patientId),
                medicationLogService.listForUser(patientId, {
                    startDate: adherenceWindowStart,
                    dateField: 'loggedAt',
                }),
                medicationReminderService.listForUser(patientId, {
                    enabled: true,
                }),
                medicationService.listAllForUser(patientId, {
                    includeDeleted: true,
                    sortDirection: 'asc',
                    sortField: 'name',
                }),
            ]);
            perf.addQueries(4);

            const medsSnapshot = {
                docs: medicationRecords.map((medication) => ({
                    id: medication.id,
                    data: () => medication,
                })),
                size: medicationRecords.length,
            } as unknown as FirebaseFirestore.QuerySnapshot;
            const remindersSnapshot = {
                docs: reminders.map((reminder) => ({
                    id: reminder.id,
                    data: () => reminder,
                })),
            } as unknown as FirebaseFirestore.QuerySnapshot;
            const recentLogsSnapshot = {
                docs: recentLogs.map((medicationLog) => ({
                    id: medicationLog.id,
                    data: () => medicationLog,
                })),
            } as unknown as FirebaseFirestore.QuerySnapshot;

            // 1. Check for missed doses today
            const userTimezone = resolveTimezone(profile?.timezone);
            const todayMedStatus = await getTodaysMedicationStatus(patientId, {
                timezone: userTimezone,
                medicationsSnapshot: medsSnapshot,
                remindersSnapshot,
                logsSnapshot: recentLogsSnapshot,
                now,
            });
            if (todayMedStatus.missed > 0) {
                alerts.push({
                    id: `missed-dose-${now.toISOString().split('T')[0]}`,
                    type: 'missed_dose',
                    severity: todayMedStatus.missed >= 3 ? 'high' : 'medium',
                    title: 'Missed Medications',
                    description: `${todayMedStatus.missed} medication dose${todayMedStatus.missed > 1 ? 's' : ''} missed today`,
                    targetUrl: `/care/${patientId}/medications`,
                    timestamp: now.toISOString(),
                    metadata: { missedCount: todayMedStatus.missed },
                });
            }

            const takenCount = recentLogs.filter(l => l.action === 'taken').length;
            // skippedCount available for future use in adherence calculations
            void recentLogs.filter(l => l.action === 'skipped').length;

            let expectedDoses = 0;
            reminders.forEach((data) => {
                const times = data.times || [];
                expectedDoses += times.length * 7; // 7 days
            });

            if (expectedDoses > 0) {
                const adherenceRate = Math.round((takenCount / expectedDoses) * 100);
                if (adherenceRate < 50) {
                    alerts.push({
                        id: 'low-adherence-7d',
                        type: 'health_warning',
                        severity: 'high',
                        title: 'Critical: Low Medication Adherence',
                        description: `Only ${adherenceRate}% adherence over the past 7 days`,
                        targetUrl: `/care/${patientId}/adherence`,
                        timestamp: now.toISOString(),
                        metadata: { adherenceRate, takenCount, expectedDoses },
                    });
                } else if (adherenceRate < 70) {
                    alerts.push({
                        id: 'declining-adherence-7d',
                        type: 'health_warning',
                        severity: 'medium',
                        title: 'Declining Medication Adherence',
                        description: `${adherenceRate}% adherence over the past 7 days`,
                        targetUrl: `/care/${patientId}/adherence`,
                        timestamp: now.toISOString(),
                        metadata: { adherenceRate, takenCount, expectedDoses },
                    });
                }
            }

            // 2. Check for overdue actions
            const actionRecords = await actionService.listAllForUser(patientId, {
                sortDirection: 'desc',
                includeDeleted: true,
            });
            perf.addQueries(1);

            const overdueActions = actionRecords.filter((data) => {
                if (data.deletedAt) return false;
                if (data.completed) return false;
                if (!data.dueAt) return false;
                const dueDate = typeof data.dueAt === 'string' ? new Date(data.dueAt) : data.dueAt.toDate?.() ?? new Date(data.dueAt);
                return dueDate < now;
            });

            overdueActions.forEach((data) => {
                const dueDate = typeof data.dueAt === 'string' ? new Date(data.dueAt) : data.dueAt.toDate?.() ?? new Date(data.dueAt);
                const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

                alerts.push({
                    id: `overdue-action-${data.id}`,
                    type: 'overdue_action',
                    severity: daysOverdue >= 7 ? 'high' : daysOverdue >= 3 ? 'medium' : 'low',
                    title: 'Overdue Action Item',
                    description: `"${(data.description || 'Task').substring(0, 50)}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
                    targetUrl: `/care/${patientId}/actions`,
                    timestamp: dueDate.toISOString(),
                    metadata: { actionId: data.id, daysOverdue },
                });
            });

            // 3. Check for health warnings in the period
            const healthLogRecords = await healthLogService.listForUser(patientId, {
                startDate,
                sortDirection: 'desc',
                includeDeleted: true,
                limit: 50,
            });
            perf.addQueries(1);

            const activeHealthLogs = healthLogRecords.filter(
                (healthLog) => !healthLog.deletedAt,
            );
            activeHealthLogs.forEach((data) => {
                if (data.alertLevel === 'emergency' || data.alertLevel === 'warning') {
                    const createdAt = data.createdAt?.toDate?.()?.toISOString() || now.toISOString();
                    alerts.push({
                        id: `health-warning-${data.id}`,
                        type: 'health_warning',
                        severity: data.alertLevel === 'emergency' ? 'emergency' : 'high',
                        title: `${data.alertLevel === 'emergency' ? 'Critical' : 'Concerning'} Health Reading`,
                        description: `${getHealthLogTypeLabel(data.type)}: ${formatHealthValue(data.type, data.value)}`,
                        targetUrl: `/care/${patientId}/health`,
                        timestamp: createdAt,
                        metadata: { logId: data.id, type: data.type, value: data.value },
                    });
                }
            });

            // 4. Check for data staleness (no vitals in 10+ days)
            const lastHealthLog = activeHealthLogs[0];
            if (!lastHealthLog) {
                alerts.push({
                    id: 'no-data-vitals',
                    type: 'no_data',
                    severity: 'low',
                    title: 'No Recent Health Data',
                    description: `No health readings recorded in the last ${days} days`,
                    targetUrl: `/care/${patientId}/health`,
                    timestamp: now.toISOString(),
                });
            } else {
                const lastDate = lastHealthLog.createdAt?.toDate?.() || now;
                const daysSinceVitals = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSinceVitals >= 10) {
                    alerts.push({
                        id: 'stale-vitals',
                        type: 'no_data',
                        severity: daysSinceVitals >= 14 ? 'medium' : 'low',
                        title: 'Health Data Getting Stale',
                        description: `No health readings in ${daysSinceVitals} days`,
                        targetUrl: `/care/${patientId}/health`,
                        timestamp: lastDate.toISOString(),
                        metadata: { daysSinceVitals },
                    });
                }
            }

            // 4b. Check if patient hasn't opened app recently
            try {
                const latestPushToken = await userService.getLatestPushToken(patientId);
                perf.addQueries(1);

                const lastActive = latestPushToken?.lastActive?.toDate?.();
                if (lastActive) {
                    const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSinceActive >= 7) {
                        alerts.push({
                            id: 'patient-inactive',
                            type: 'no_data',
                            severity: daysSinceActive >= 14 ? 'high' : 'medium',
                            title: 'Patient App Inactive',
                            description: `Patient hasn't opened the app in ${daysSinceActive} days`,
                            targetUrl: `/care/${patientId}`,
                            timestamp: lastActive.toISOString(),
                            metadata: { daysSinceActive },
                        });
                    }
                }
            } catch (e) {
                // Push token collection may not exist
                functions.logger.debug('[care] Could not check lastActive for alerts:', e);
            }

            // 5. Check for recent medication changes (started/stopped in last 7 days)
            const medChangeWindowStart = new Date(now);
            medChangeWindowStart.setDate(medChangeWindowStart.getDate() - 7);

            medicationRecords.forEach((data) => {
                if (data.deletedAt) {
                    return;
                }
                const startedAt = data.startedAt?.toDate?.();
                const stoppedAt = data.stoppedAt?.toDate?.();

                if (startedAt && startedAt >= medChangeWindowStart) {
                    alerts.push({
                        id: `med-started-${data.id}`,
                        type: 'med_change',
                        severity: 'low',
                        title: 'New Medication Started',
                        description: `${data.name} was started${data.dose ? ` (${data.dose})` : ''}`,
                        targetUrl: `/care/${patientId}/medications`,
                        timestamp: startedAt.toISOString(),
                        metadata: { medicationId: data.id, changeType: 'started' },
                    });
                }

                if (stoppedAt && stoppedAt >= medChangeWindowStart) {
                    alerts.push({
                        id: `med-stopped-${data.id}`,
                        type: 'med_change',
                        severity: 'medium',
                        title: 'Medication Discontinued',
                        description: `${data.name} was stopped`,
                        targetUrl: `/care/${patientId}/medications`,
                        timestamp: stoppedAt.toISOString(),
                        metadata: { medicationId: data.id, changeType: 'stopped' },
                    });
                }
            });

            // Sort by severity then timestamp
            const severityOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
            alerts.sort((a, b) => {
                const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
                if (sevDiff !== 0) return sevDiff;
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            });

            // Build summary
            const summary = {
                emergency: alerts.filter((a) => a.severity === 'emergency').length,
                high: alerts.filter((a) => a.severity === 'high').length,
                medium: alerts.filter((a) => a.severity === 'medium').length,
                low: alerts.filter((a) => a.severity === 'low').length,
                total: alerts.length,
            };

            res.set('Cache-Control', 'private, max-age=30');
            res.json({
                alerts,
                summary,
                period: {
                    days,
                    from: startDate.toISOString(),
                    to: now.toISOString(),
                },
            });
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error fetching alerts:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to fetch alerts' });
        } finally {
            perf.finalize(statusCode);
        }
    });
}
