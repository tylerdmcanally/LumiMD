import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type MedicationStatusSummary = {
    total: number;
    taken: number;
    skipped: number;
    pending: number;
    missed: number;
};

type MedicationStatusQueryOptions = {
    timezone?: string;
    medicationsSnapshot?: FirebaseFirestore.QuerySnapshot;
    remindersSnapshot?: FirebaseFirestore.QuerySnapshot;
    logsSnapshot?: FirebaseFirestore.QuerySnapshot;
    now?: Date;
};

type RegisterCareMedicationStatusRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (
        caregiverId: string,
        patientId: string,
    ) => {
        addQueries: (count?: number) => void;
        finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
    };
    getTodaysMedicationStatus: (
        patientId: string,
        options?: MedicationStatusQueryOptions,
    ) => Promise<MedicationStatusSummary>;
};

export function registerCareMedicationStatusRoutes(
    router: Router,
    options: RegisterCareMedicationStatusRoutesOptions,
): void {
    const { getDb, createPerfTracker, getTodaysMedicationStatus } = options;
    const getMedicationStatusServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/medication-status
    // Today's medication doses for a specific patient
    router.get(
        '/:patientId/medication-status',
        requireAuth,
        async (req: AuthRequest, res) => {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const perf = createPerfTracker(caregiverId, patientId);
            let statusCode = 200;

            try {
                // Validate caregiver has access
                if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                    onForbidden: () => {
                        statusCode = 403;
                    },
                }))) {
                    return;
                }
                const {
                    medicationLogService,
                    medicationReminderService,
                    userService,
                } = getMedicationStatusServices();

                const overdueGraceMinutes = 120;

                const userDoc = await userService.getById(patientId);
                const userTimezone =
                    typeof userDoc?.timezone === 'string'
                        ? (userDoc.timezone as string)
                        : 'America/Chicago';

                const now = new Date();
                const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone });

                const dayBoundaries = (() => {
                    const dateStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone });
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const testUTC = new Date(
                        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`,
                    );
                    const tzFormatter = new Intl.DateTimeFormat('en-US', {
                        timeZone: userTimezone,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                    });
                    const tzParts = tzFormatter.formatToParts(testUTC);
                    const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
                    const tzMinute = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);
                    const offsetMinutes = (tzHour - 12) * 60 + tzMinute;
                    const midnightUTC = new Date(
                        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
                    );
                    const startOfDayUTC = new Date(
                        midnightUTC.getTime() - offsetMinutes * 60 * 1000,
                    );
                    const endOfDayUTC = new Date(
                        startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1,
                    );
                    return { startOfDayUTC, endOfDayUTC };
                })();

                // Get active medications
                const medsSnapshot = await getDb()
                    .collection('medications')
                    .where('userId', '==', patientId)
                    .where('active', '==', true)
                    .get();

                // Get reminders
                const reminders = await medicationReminderService.listForUser(patientId, {
                    enabled: true,
                });

                // Get today's logs
                const logs = await medicationLogService.listForUser(patientId, {
                    startDate: dayBoundaries.startOfDayUTC,
                    endDate: dayBoundaries.endOfDayUTC,
                    dateField: 'loggedAt',
                });
                perf.addQueries(4);

                const medications = medsSnapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        name: data.name as string,
                        dose: data.dose as string | undefined,
                        ...data,
                    };
                });

                const reminderMap = new Map<string, string[]>();
                reminders.forEach((data) => {
                    if (typeof data.medicationId !== 'string' || data.medicationId.length === 0) {
                        return;
                    }
                    reminderMap.set(data.medicationId, data.times || []);
                });

                // Build schedule
                const logsForToday = logs
                    .filter((log) => {
                        const logDateStr =
                            log.scheduledDate ||
                            (log.loggedAt?.toDate
                                ? log.loggedAt
                                    .toDate()
                                    .toLocaleDateString('en-CA', { timeZone: userTimezone })
                                : null);
                        return logDateStr === todayStr;
                    });

                const schedule = medications.flatMap((med) => {
                    const times = reminderMap.get(med.id) || [];
                    return times.map((time) => {
                        const log = logsForToday.find(
                            (l) => l.medicationId === med.id && l.scheduledTime === time,
                        );

                        let status: 'taken' | 'skipped' | 'pending' | 'missed' = 'pending';
                        let actionAt: string | undefined;

                        if (log) {
                            if (log.action === 'taken' || log.action === 'skipped') {
                                status = log.action;
                            } else {
                                status = 'pending';
                            }
                            actionAt = log.loggedAt?.toDate?.().toISOString();
                        } else {
                            // Check if missed
                            const [hourStr, minStr] = time.split(':');
                            const scheduledMins =
                                parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
                            const currentTimeStr = now.toLocaleTimeString('en-US', {
                                timeZone: userTimezone,
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit',
                            });
                            const currentMins =
                                parseInt(currentTimeStr.slice(0, 2), 10) * 60 +
                                parseInt(currentTimeStr.slice(3, 5), 10);

                            if (currentMins > scheduledMins + overdueGraceMinutes) {
                                status = 'missed';
                            }
                        }

                        return {
                            medicationId: med.id,
                            medicationName: med.name,
                            dose: med.dose,
                            scheduledTime: time,
                            status,
                            actionAt,
                        };
                    });
                });

                // Sort by time
                schedule.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

                const summary = await getTodaysMedicationStatus(patientId, {
                    timezone: userTimezone,
                    medicationsSnapshot: medsSnapshot,
                    remindersSnapshot: {
                        docs: reminders.map((reminder) => ({
                            id: reminder.id,
                            data: () => reminder,
                        })),
                    } as unknown as FirebaseFirestore.QuerySnapshot,
                    logsSnapshot: {
                        docs: logs.map((log) => ({
                            id: log.id,
                            data: () => log,
                        })),
                    } as unknown as FirebaseFirestore.QuerySnapshot,
                    now,
                });

                res.set('Cache-Control', 'private, max-age=30');
                res.json({
                    date: todayStr,
                    schedule,
                    summary,
                });
            } catch (error) {
                statusCode = 500;
                functions.logger.error('[care] Error fetching medication status:', error);
                res.status(500).json({
                    code: 'server_error',
                    message: 'Failed to fetch medication status',
                });
            } finally {
                perf.finalize(statusCode);
            }
        },
    );
}
