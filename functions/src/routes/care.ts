/**
 * Care Dashboard API Routes
 *
 * Endpoints for caregiver dashboard to view aggregated data
 * for all patients who have shared their health info.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { registerCareAlertsRoutes } from './care/alerts';
import { registerCareExportSummaryRoutes } from './care/exportSummary';
import {
    clearCaregiverShareLookupCacheForTests,
    getAcceptedSharesForCaregiver,
    invalidateCaregiverShareLookupCache,
} from '../services/shareAccess';
import { registerCareHealthLogRoutes } from './care/healthLogs';
import { registerCareMedicationAdherenceRoutes } from './care/medicationAdherence';
import { registerCareMedicationChangeRoutes } from './care/medicationChanges';
import { registerCareMedicationStatusRoutes } from './care/medicationStatus';
import { registerCareNotesRoutes } from './care/notes';
import { registerCareOverviewRoutes } from './care/overview';
import { registerCarePatientResourceRoutes } from './care/patientResources';
import { registerCareQuickOverviewRoutes } from './care/quickOverview';
import { registerCareSummaryRoutes } from './care/summary';
import { registerCareTaskRoutes } from './care/tasks';
import { registerCareTrendsRoutes } from './care/trends';
import { registerCareUpcomingActionsRoutes } from './care/upcomingActions';
import { registerCareVisitMetadataRoutes } from './care/visitMetadata';
import { createDomainServiceContainer } from '../services/domain/serviceContainer';

export const careRouter = Router();

const getDb = () => admin.firestore();
const getCareDomainServices = () => createDomainServiceContainer({ db: getDb() });
const CARE_NOTE_MAX_LENGTH = 5000;
const CARE_TASK_TITLE_MAX_LENGTH = 200;
const CARE_TASK_DESCRIPTION_MAX_LENGTH = 5000;
const CARE_VISIT_METADATA_MAX_LENGTH = 256;
const CARE_PAGE_SIZE_DEFAULT = 50;
const CARE_PAGE_SIZE_MAX = 100;

export {
    clearCaregiverShareLookupCacheForTests,
    getAcceptedSharesForCaregiver,
    invalidateCaregiverShareLookupCache,
};

type MedicationLogRecord = {
    id: string;
    action: string | null;
    medicationId: string | null;
    medicationName: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    createdAt: Date | null;
    loggedAt: Date | null;
    timestamp: Date;
};

type CareOverviewAlert = {
    type: 'missed_dose' | 'overdue_action';
    priority: 'high' | 'medium' | 'low';
    message: string;
};

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

type DayWindow = {
    timezone: string;
    todayStr: string;
    startOfDayUTC: Date;
    endOfDayUTC: Date;
    currentMinutes: number;
};

const DEFAULT_CARE_TIMEZONE = 'America/Chicago';
const FIRESTORE_IN_QUERY_CHUNK_SIZE = 10;
const MEDICATION_OVERDUE_GRACE_MINUTES = 120;
const REMINDER_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

type PatientDetailEndpoint =
    | 'summary'
    | 'quick-overview'
    | 'alerts'
    | 'medication-status'
    | 'export-summary'
    | 'trends'
    | 'medication-adherence'
    | 'med-changes'
    | 'upcoming-actions';

type PatientDetailPerfBudget = {
    queryBudget: number;
    latencyBudgetMs: number;
};

const PATIENT_DETAIL_PERF_BUDGETS: Record<PatientDetailEndpoint, PatientDetailPerfBudget> = {
    summary: { queryBudget: 8, latencyBudgetMs: 900 },
    'quick-overview': { queryBudget: 10, latencyBudgetMs: 1400 },
    alerts: { queryBudget: 9, latencyBudgetMs: 1400 },
    'medication-status': { queryBudget: 6, latencyBudgetMs: 1100 },
    'export-summary': { queryBudget: 6, latencyBudgetMs: 1500 },
    trends: { queryBudget: 6, latencyBudgetMs: 1200 },
    'medication-adherence': { queryBudget: 5, latencyBudgetMs: 1400 },
    'med-changes': { queryBudget: 4, latencyBudgetMs: 900 },
    'upcoming-actions': { queryBudget: 4, latencyBudgetMs: 900 },
};

type PatientDetailPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

function createPatientDetailPerfTracker(
    endpoint: PatientDetailEndpoint,
    caregiverId: string,
    patientId: string,
): PatientDetailPerfTracker {
    const startedAtMs = Date.now();
    const budget = PATIENT_DETAIL_PERF_BUDGETS[endpoint];
    let queryCount = 0;

    return {
        addQueries(count = 1) {
            queryCount += count;
        },
        finalize(statusCode, extra = {}) {
            const elapsedMs = Date.now() - startedAtMs;
            const payload = {
                endpoint,
                caregiverId,
                patientId,
                statusCode,
                elapsedMs,
                queryCount,
                queryBudget: budget.queryBudget,
                latencyBudgetMs: budget.latencyBudgetMs,
                ...extra,
            };

            functions.logger.debug('[care][perf] patient detail metrics', payload);

            if (statusCode < 500 && (queryCount > budget.queryBudget || elapsedMs > budget.latencyBudgetMs)) {
                functions.logger.warn('[care][perf] patient detail guardrail exceeded', payload);
            }
        },
    };
}

function toDateSafe(raw: unknown): Date | null {
    if (!raw) return null;

    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : raw;
    }

    if (raw instanceof admin.firestore.Timestamp) {
        const date = raw.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (
        typeof raw === 'object' &&
        raw !== null &&
        'toDate' in (raw as Record<string, unknown>) &&
        typeof (raw as { toDate?: unknown }).toDate === 'function'
    ) {
        try {
            const date = (raw as { toDate: () => Date }).toDate();
            return Number.isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    if (typeof raw === 'string' || typeof raw === 'number') {
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
}

async function getPatientTimezone(patientId: string): Promise<string> {
    const { userService } = getCareDomainServices();
    const userDoc = await userService.getById(patientId);
    return resolveCareTimezone(userDoc?.timezone);
}

function resolveCareTimezone(rawTimezone: unknown): string {
    if (typeof rawTimezone !== 'string' || rawTimezone.trim().length === 0) {
        return DEFAULT_CARE_TIMEZONE;
    }

    const candidate = rawTimezone.trim();
    try {
        Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
        return candidate;
    } catch {
        return DEFAULT_CARE_TIMEZONE;
    }
}

function getDayWindowForTimezone(timezone: string, now: Date = new Date()): DayWindow {
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const [year, month, day] = todayStr.split('-').map(Number);

    const testUTC = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`,
    );
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
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
    const startOfDayUTC = new Date(midnightUTC.getTime() - offsetMinutes * 60 * 1000);
    const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    const currentTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });

    return {
        timezone,
        todayStr,
        startOfDayUTC,
        endOfDayUTC,
        currentMinutes: toMinutesFromHHMM(currentTimeStr) ?? 0,
    };
}

function toMinutesFromHHMM(value: string): number | null {
    if (!REMINDER_TIME_REGEX.test(value)) return null;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
    if (values.length === 0) {
        return [];
    }

    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += chunkSize) {
        chunks.push(values.slice(i, i + chunkSize));
    }
    return chunks;
}

function emptyMedicationStatus(): MedicationStatusSummary {
    return {
        total: 0,
        taken: 0,
        skipped: 0,
        pending: 0,
        missed: 0,
    };
}

function resolveMedicationLogTimestamp(
    data: FirebaseFirestore.DocumentData,
    queriedField: 'createdAt' | 'loggedAt',
): Date | null {
    const createdAt = toDateSafe(data.createdAt);
    const loggedAt = toDateSafe(data.loggedAt);
    return queriedField === 'createdAt'
        ? (createdAt || loggedAt)
        : (loggedAt || createdAt);
}

async function queryMedicationLogsByDateField(
    patientId: string,
    startDate: Date,
    endDate: Date,
    dateField: 'createdAt' | 'loggedAt',
): Promise<MedicationLogRecord[]> {
    const { medicationLogService } = getCareDomainServices();
    const logRecords = await medicationLogService.listForUser(patientId, {
        startDate,
        endDate,
        dateField,
    });

    return logRecords.map((data) => {
        const timestamp = resolveMedicationLogTimestamp(data, dateField) || new Date(0);
        return {
            id: data.id,
            action: typeof data.action === 'string' ? data.action : null,
            medicationId:
                typeof data.medicationId === 'string' && data.medicationId.trim().length > 0
                    ? data.medicationId
                    : null,
            medicationName:
                typeof data.medicationName === 'string' && data.medicationName.trim().length > 0
                    ? data.medicationName
                    : null,
            scheduledDate:
                typeof data.scheduledDate === 'string' && data.scheduledDate.trim().length > 0
                    ? data.scheduledDate
                    : null,
            scheduledTime:
                typeof data.scheduledTime === 'string' && data.scheduledTime.trim().length > 0
                    ? data.scheduledTime
                    : null,
            createdAt: toDateSafe(data.createdAt),
            loggedAt: toDateSafe(data.loggedAt),
            timestamp,
        };
    });
}

export async function getMedicationLogsForRange(
    patientId: string,
    startDate: Date,
    endDate: Date,
    options?: { limit?: number },
): Promise<MedicationLogRecord[]> {
    const byId = new Map<string, MedicationLogRecord>();
    const errors: unknown[] = [];

    for (const dateField of ['createdAt', 'loggedAt'] as const) {
        try {
            const logs = await queryMedicationLogsByDateField(
                patientId,
                startDate,
                endDate,
                dateField,
            );
            logs.forEach((log) => {
                const existing = byId.get(log.id);
                if (!existing || log.timestamp.getTime() >= existing.timestamp.getTime()) {
                    byId.set(log.id, log);
                }
            });
        } catch (error) {
            errors.push(error);
            functions.logger.warn(
                `[care] Failed medicationLogs query for ${patientId} using ${dateField}`,
                error,
            );
        }
    }

    if (byId.size === 0 && errors.length >= 2) {
        throw errors[0];
    }

    const logs = Array.from(byId.values()).sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    const limit = options?.limit;
    if (typeof limit === 'number' && limit > 0) {
        return logs.slice(0, limit);
    }

    return logs;
}

// =============================================================================
// HELPER: Get today's medication schedule for a user
// =============================================================================

async function getTodaysMedicationStatus(
    patientId: string,
    options: MedicationStatusQueryOptions = {},
) {
    const {
        medicationLogService,
        medicationReminderService,
    } = getCareDomainServices();
    const userTimezone = resolveCareTimezone(
        options.timezone ?? (await getPatientTimezone(patientId)),
    );
    const dayWindow = getDayWindowForTimezone(userTimezone, options.now);

    const [medsSnapshot, remindersSnapshot, logsSnapshot] = await Promise.all([
        options.medicationsSnapshot
            ? Promise.resolve(options.medicationsSnapshot)
            : getDb()
                .collection('medications')
                .where('userId', '==', patientId)
                .where('active', '==', true)
                .get(),
        options.remindersSnapshot
            ? Promise.resolve(options.remindersSnapshot)
            : medicationReminderService.listForUser(patientId, {
                enabled: true,
            }).then((reminders) => {
                return {
                    docs: reminders.map((reminder) => ({
                        id: reminder.id,
                        data: () => reminder,
                    })),
                } as unknown as FirebaseFirestore.QuerySnapshot;
            }),
        options.logsSnapshot
            ? Promise.resolve(options.logsSnapshot)
            : medicationLogService.listForUser(patientId, {
                startDate: dayWindow.startOfDayUTC,
                endDate: dayWindow.endOfDayUTC,
                dateField: 'loggedAt',
            }).then((logs) => {
                return {
                    docs: logs.map((log) => ({
                        id: log.id,
                        data: () => log,
                    })),
                } as unknown as FirebaseFirestore.QuerySnapshot;
            }),
    ]);

    const logs = logsSnapshot.docs
        .map((doc) => doc.data())
        .filter((log) => {
            const loggedAtDate = toDateSafe(log.loggedAt) ?? toDateSafe(log.createdAt);
            if (
                loggedAtDate &&
                (loggedAtDate < dayWindow.startOfDayUTC || loggedAtDate > dayWindow.endOfDayUTC)
            ) {
                return false;
            }
            const logDateStr =
                log.scheduledDate ||
                (log.loggedAt?.toDate
                    ? log.loggedAt.toDate().toLocaleDateString('en-CA', { timeZone: userTimezone })
                    : null);
            return logDateStr === dayWindow.todayStr;
        });

    // Build reminder map: medicationId -> times
    const reminderMap = new Map<string, string[]>();
    remindersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        reminderMap.set(data.medicationId, data.times || []);
    });

    // Calculate expected doses and status
    let total = 0;
    let taken = 0;
    let skipped = 0;
    let pending = 0;
    let missed = 0;

    medsSnapshot.docs.forEach((doc) => {
        const medData = doc.data();
        if (medData.active === false || medData.deletedAt) {
            return;
        }
        const medId = doc.id;
        const times = reminderMap.get(medId) || [];

        times.forEach((time) => {
            total++;
            const [hourStr, minStr] = time.split(':');
            const scheduledHour = parseInt(hourStr, 10);
            const scheduledMin = parseInt(minStr, 10);

            // Check if dose was logged
            const log = logs.find(
                (l) => l.medicationId === medId && l.scheduledTime === time
            );

            if (log) {
                if (log.action === 'taken') taken++;
                else if (log.action === 'skipped') skipped++;
            } else {
                // Not logged - check if missed (past time by grace window)
                const scheduledMins = scheduledHour * 60 + scheduledMin;
                if (dayWindow.currentMinutes > scheduledMins + MEDICATION_OVERDUE_GRACE_MINUTES) {
                    missed++;
                } else {
                    pending++;
                }
            }
        });
    });

    return { total, taken, skipped, pending, missed };
}

// =============================================================================
// HELPER: Get pending actions count for a user
// =============================================================================

async function getPatientProfilesById(
    patientIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
    const { userService } = getCareDomainServices();
    const profilesById = new Map<string, Record<string, unknown>>();
    const userRecords = await userService.listByIds(patientIds);
    userRecords.forEach((userRecord) => {
        profilesById.set(userRecord.id, userRecord as unknown as Record<string, unknown>);
    });

    return profilesById;
}

async function getPendingActionsAndOverdueAlertsForPatients(patientIds: string[]): Promise<{
    pendingActionsByPatient: Map<string, number>;
    overdueAlertsByPatient: Map<string, CareOverviewAlert[]>;
}> {
    const pendingActionsByPatient = new Map<string, number>();
    const overdueAlertsByPatient = new Map<string, CareOverviewAlert[]>();
    const patientIdSet = new Set(patientIds);
    const now = new Date();

    patientIds.forEach((patientId) => {
        pendingActionsByPatient.set(patientId, 0);
        overdueAlertsByPatient.set(patientId, []);
    });

    const chunks = chunkValues(patientIds, FIRESTORE_IN_QUERY_CHUNK_SIZE);
    for (const patientChunk of chunks) {
        const snapshot = await getDb()
            .collection('actions')
            .where('userId', 'in', patientChunk)
            .get();

        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const userId = typeof data.userId === 'string' ? data.userId : null;

            if (!userId || !patientIdSet.has(userId) || data.completed === true) {
                return;
            }

            pendingActionsByPatient.set(userId, (pendingActionsByPatient.get(userId) ?? 0) + 1);

            const dueDate = parseActionDueAt(data.dueAt);
            if (!dueDate || dueDate >= now) {
                return;
            }

            const daysOverdue = Math.floor(
                (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
            );
            const alerts = overdueAlertsByPatient.get(userId) ?? [];
            alerts.push({
                type: 'overdue_action',
                priority: daysOverdue >= 7 ? 'high' : 'medium',
                message: `Action "${data.description?.substring(0, 50)}..." overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}`,
            });
            overdueAlertsByPatient.set(userId, alerts);
        });
    }

    return { pendingActionsByPatient, overdueAlertsByPatient };
}

async function getTodaysMedicationStatusForPatients(
    patientIds: string[],
    timezoneByPatient: Map<string, string>,
): Promise<Map<string, MedicationStatusSummary>> {
    const {
        medicationLogService,
        medicationReminderService,
    } = getCareDomainServices();
    const patientIdSet = new Set(patientIds);
    const statusByPatient = new Map<string, MedicationStatusSummary>();
    const medicationIdsByPatient = new Map<string, Set<string>>();
    const reminderTimesByMedicationId = new Map<string, string[]>();
    const dayWindowByPatient = new Map<string, DayWindow>();

    patientIds.forEach((patientId) => {
        statusByPatient.set(patientId, emptyMedicationStatus());
        medicationIdsByPatient.set(patientId, new Set<string>());
        dayWindowByPatient.set(
            patientId,
            getDayWindowForTimezone(timezoneByPatient.get(patientId) ?? DEFAULT_CARE_TIMEZONE),
        );
    });

    const patientChunks = chunkValues(patientIds, FIRESTORE_IN_QUERY_CHUNK_SIZE);

    for (const patientChunk of patientChunks) {
        const medicationsSnapshot = await getDb()
            .collection('medications')
            .where('userId', 'in', patientChunk)
            .get();

        medicationsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            const userId = typeof data.userId === 'string' ? data.userId : null;
            if (!userId || !patientIdSet.has(userId) || data.active === false) {
                return;
            }
            medicationIdsByPatient.get(userId)?.add(doc.id);
        });
    }

    for (const patientChunk of patientChunks) {
        const reminderRecords = await medicationReminderService.listForUsers(patientChunk, {
            includeDeleted: true,
        });

        reminderRecords.forEach((data) => {
            if (data.enabled === false || typeof data.medicationId !== 'string') {
                return;
            }

            const validTimes = Array.isArray(data.times)
                ? data.times.filter(
                      (rawTime): rawTime is string =>
                          typeof rawTime === 'string' && REMINDER_TIME_REGEX.test(rawTime),
                  )
                : [];

            if (validTimes.length === 0) {
                return;
            }

            const existingTimes = reminderTimesByMedicationId.get(data.medicationId) ?? [];
            validTimes.forEach((time) => {
                if (!existingTimes.includes(time)) {
                    existingTimes.push(time);
                }
            });
            reminderTimesByMedicationId.set(data.medicationId, existingTimes);
        });
    }

    const loggedDoseStatusByPatient = new Map<
        string,
        Map<string, { action: 'taken' | 'skipped'; timestampMs: number }>
    >();
    patientIds.forEach((patientId) => loggedDoseStatusByPatient.set(patientId, new Map()));

    const processLogRecords = (
        logRecords: Array<FirebaseFirestore.DocumentData & { id: string }>,
    ) => {
        logRecords.forEach((data) => {
            const userId = typeof data.userId === 'string' ? data.userId : null;
            const medicationId = typeof data.medicationId === 'string' ? data.medicationId : null;
            const scheduledTime =
                typeof data.scheduledTime === 'string' ? data.scheduledTime : null;
            const action = data.action === 'taken' || data.action === 'skipped' ? data.action : null;

            if (!userId || !medicationId || !scheduledTime || !action || !REMINDER_TIME_REGEX.test(scheduledTime)) {
                return;
            }

            const dayWindow = dayWindowByPatient.get(userId);
            if (!dayWindow) {
                return;
            }

            const loggedAtDate = toDateSafe(data.loggedAt) ?? toDateSafe(data.createdAt);
            if (!loggedAtDate) {
                return;
            }

            if (loggedAtDate < dayWindow.startOfDayUTC || loggedAtDate > dayWindow.endOfDayUTC) {
                return;
            }

            const logDateStr =
                typeof data.scheduledDate === 'string'
                    ? data.scheduledDate
                    : loggedAtDate.toLocaleDateString('en-CA', {
                          timeZone: dayWindow.timezone,
                      });
            if (logDateStr !== dayWindow.todayStr) {
                return;
            }

            const doseKey = `${medicationId}_${scheduledTime}`;
            const existing = loggedDoseStatusByPatient.get(userId)?.get(doseKey);
            const timestampMs = loggedAtDate.getTime();

            if (!existing || timestampMs >= existing.timestampMs) {
                loggedDoseStatusByPatient.get(userId)?.set(doseKey, {
                    action,
                    timestampMs,
                });
            }
        });
    };

    for (const patientChunk of patientChunks) {
        const chunkDayWindows = patientChunk
            .map((patientId) => dayWindowByPatient.get(patientId))
            .filter((window): window is DayWindow => !!window);

        if (chunkDayWindows.length === 0) {
            continue;
        }

        const chunkStart = new Date(
            Math.min(...chunkDayWindows.map((window) => window.startOfDayUTC.getTime())),
        );
        const chunkEnd = new Date(
            Math.max(...chunkDayWindows.map((window) => window.endOfDayUTC.getTime())),
        );

        try {
            const logRecords = await medicationLogService.listForUsers(patientChunk, {
                startDate: chunkStart,
                endDate: chunkEnd,
                dateField: 'loggedAt',
            });
            processLogRecords(logRecords);
        } catch (error) {
            functions.logger.warn(
                `[care] Falling back to per-patient medication log queries for ${patientChunk.length} patient(s)`,
                error,
            );

            for (const patientId of patientChunk) {
                const dayWindow = dayWindowByPatient.get(patientId);
                if (!dayWindow) {
                    continue;
                }

                const logRecords = await medicationLogService.listForUser(patientId, {
                    startDate: dayWindow.startOfDayUTC,
                    endDate: dayWindow.endOfDayUTC,
                    dateField: 'loggedAt',
                });
                processLogRecords(logRecords);
            }
        }
    }

    patientIds.forEach((patientId) => {
        const dayWindow = dayWindowByPatient.get(patientId);
        const status = statusByPatient.get(patientId);
        if (!status || !dayWindow) {
            return;
        }

        const doseStatusByKey = loggedDoseStatusByPatient.get(patientId) ?? new Map();
        const medicationIds = medicationIdsByPatient.get(patientId) ?? new Set<string>();

        medicationIds.forEach((medicationId) => {
            const reminderTimes = reminderTimesByMedicationId.get(medicationId) ?? [];

            reminderTimes.forEach((scheduledTime) => {
                const scheduledMinutes = toMinutesFromHHMM(scheduledTime);
                if (scheduledMinutes === null) {
                    return;
                }

                status.total += 1;
                const doseKey = `${medicationId}_${scheduledTime}`;
                const loggedDose = doseStatusByKey.get(doseKey);

                if (loggedDose?.action === 'taken') {
                    status.taken += 1;
                    return;
                }
                if (loggedDose?.action === 'skipped') {
                    status.skipped += 1;
                    return;
                }

                if (dayWindow.currentMinutes > scheduledMinutes + MEDICATION_OVERDUE_GRACE_MINUTES) {
                    status.missed += 1;
                } else {
                    status.pending += 1;
                }
            });
        });
    });

    return statusByPatient;
}

async function getLastActiveByPatient(
    patientIds: string[],
    profilesById: Map<string, Record<string, unknown>>,
): Promise<Map<string, string | null>> {
    const { userService } = getCareDomainServices();
    const lastActiveByPatient = new Map<string, string | null>();
    const lookupIds: string[] = [];

    patientIds.forEach((patientId) => {
        const profile = profilesById.get(patientId);
        const lastActiveDate = toDateSafe(profile?.lastActive);
        if (lastActiveDate) {
            lastActiveByPatient.set(patientId, lastActiveDate.toISOString());
            return;
        }

        lookupIds.push(patientId);
        lastActiveByPatient.set(patientId, null);
    });

    await Promise.all(
        lookupIds.map(async (patientId) => {
            try {
                const latestPushToken = await userService.getLatestPushToken(patientId);
                const lastActiveDate = toDateSafe(latestPushToken?.lastActive);
                if (lastActiveDate) {
                    lastActiveByPatient.set(patientId, lastActiveDate.toISOString());
                }
            } catch (error) {
                functions.logger.debug(`[care] Could not fetch lastActive for ${patientId}:`, error);
            }
        }),
    );

    return lastActiveByPatient;
}

function parseActionDueAt(rawDueAt: unknown): Date | null {
    if (!rawDueAt) return null;

    if (rawDueAt instanceof Date) {
        return Number.isNaN(rawDueAt.getTime()) ? null : rawDueAt;
    }

    const FirestoreTimestamp = (admin.firestore as unknown as {
        Timestamp?: unknown;
    }).Timestamp;
    if (
        typeof FirestoreTimestamp === 'function' &&
        rawDueAt instanceof (FirestoreTimestamp as new (...args: unknown[]) => unknown)
    ) {
        const date = (rawDueAt as { toDate: () => Date }).toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (
        typeof rawDueAt === 'object' &&
        rawDueAt !== null &&
        'toDate' in (rawDueAt as Record<string, unknown>) &&
        typeof (rawDueAt as { toDate?: unknown }).toDate === 'function'
    ) {
        try {
            const date = (rawDueAt as { toDate: () => Date }).toDate();
            return Number.isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    if (typeof rawDueAt === 'string' || typeof rawDueAt === 'number') {
        const date = new Date(rawDueAt);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
}

// =============================================================================
// GET /v1/care/overview
// Aggregated data for all shared patients
// =============================================================================

registerCareOverviewRoutes(careRouter, {
    getAcceptedSharesForCaregiver,
    getPatientProfilesById,
    resolveTimezone: resolveCareTimezone,
    getTodaysMedicationStatusForPatients,
    getPendingActionsAndOverdueAlertsForPatients,
    getLastActiveByPatient,
    emptyMedicationStatus,
});

// =============================================================================
// GET /v1/care/:patientId/medications
// List medications/actions/visits for a shared patient (+ single visit detail)
// =============================================================================

registerCarePatientResourceRoutes(careRouter, {
    getDb,
    pageSizeDefault: CARE_PAGE_SIZE_DEFAULT,
    pageSizeMax: CARE_PAGE_SIZE_MAX,
});

// =============================================================================
// GET /v1/care/:patientId/medication-status
// Today's medication doses for a specific patient
// =============================================================================

registerCareMedicationStatusRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('medication-status', caregiverId, patientId),
    getTodaysMedicationStatus,
});

// =============================================================================
// GET /v1/care/:patientId/summary
// Quick summary for a patient (used in patient detail view)
// =============================================================================

registerCareSummaryRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('summary', caregiverId, patientId),
    getTodaysMedicationStatus,
    parseActionDueAt,
});

// =============================================================================
// CAREGIVER NOTES API
// Private notes that caregivers can add to visits
// =============================================================================

registerCareNotesRoutes(careRouter, {
    getDb,
    noteMaxLength: CARE_NOTE_MAX_LENGTH,
    pageSizeDefault: CARE_PAGE_SIZE_DEFAULT,
    pageSizeMax: CARE_PAGE_SIZE_MAX,
});

// =============================================================================
// CARE SUMMARY EXPORT
// Generate a text/JSON summary of patient care for export
// =============================================================================

registerCareExportSummaryRoutes(careRouter, {
    getDb,
    parseActionDueAt,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('export-summary', caregiverId, patientId),
});

// =============================================================================
// VISIT METADATA EDITING
// Allow caregivers to update visit metadata (provider, specialty, location, date)
// =============================================================================

registerCareVisitMetadataRoutes(careRouter, {
    getDb,
    visitMetadataMaxLength: CARE_VISIT_METADATA_MAX_LENGTH,
});

// =============================================================================
// HEALTH LOGS API FOR CAREGIVERS
// View patient health metrics (BP, glucose, weight)
// =============================================================================

registerCareHealthLogRoutes(careRouter, {
    getDb,
    pageSizeDefault: CARE_PAGE_SIZE_DEFAULT,
    pageSizeMax: 500,
});

// =============================================================================
// MEDICATION ADHERENCE API FOR CAREGIVERS
// Track medication compliance over time
// =============================================================================

registerCareMedicationAdherenceRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('medication-adherence', caregiverId, patientId),
});

// =============================================================================
// QUICK OVERVIEW API FOR CAREGIVERS
// At-a-glance dashboard data
// =============================================================================

registerCareQuickOverviewRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('quick-overview', caregiverId, patientId),
    resolveTimezone: resolveCareTimezone,
    getDayWindow: getDayWindowForTimezone,
    getTodaysMedicationStatus,
    parseActionDueAt,
    formatHealthValue,
    getHealthLogTypeLabel,
    toDateSafe,
});

/**
 * Helper to format health values for display
 */
function formatHealthValue(type: string, value: any): string {
    switch (type) {
        case 'bp':
            return `${value?.systolic}/${value?.diastolic}`;
        case 'glucose':
            return `${value?.reading} mg/dL`;
        case 'weight':
            return `${value?.weight} ${value?.unit || 'lbs'}`;
        default:
            return 'Unknown';
    }
}

/**
 * Helper to get human-readable health log type labels
 */
function getHealthLogTypeLabel(type: string): string {
    switch (type) {
        case 'bp':
            return 'blood pressure';
        case 'glucose':
            return 'glucose';
        case 'weight':
            return 'weight';
        case 'symptom_check':
            return 'symptoms';
        default:
            return type;
    }
}

// =============================================================================
// UNIFIED ALERTS API
// Aggregated, prioritized alerts with 7-day default window
// =============================================================================

registerCareAlertsRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('alerts', caregiverId, patientId),
    resolveTimezone: resolveCareTimezone,
    getTodaysMedicationStatus,
    formatHealthValue,
    getHealthLogTypeLabel,
});

// =============================================================================
// TRENDS & COVERAGE API
// 30-day trends for vitals, adherence, actions + data coverage metrics
// =============================================================================

registerCareTrendsRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('trends', caregiverId, patientId),
    toDateSafe,
});

// =============================================================================
// RECENT MEDICATION CHANGES API
// Started/stopped/modified medications in the last N days
// =============================================================================

registerCareMedicationChangeRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('med-changes', caregiverId, patientId),
});

// =============================================================================
// UPCOMING ACTIONS API
// Pending actions sorted by due date with overdue highlighting
// =============================================================================

registerCareUpcomingActionsRoutes(careRouter, {
    getDb,
    createPerfTracker: (caregiverId, patientId) =>
        createPatientDetailPerfTracker('upcoming-actions', caregiverId, patientId),
});

// =============================================================================
// CAREGIVER TASKS API (Care Plan)
// CRUD for caregiver-created tasks
// =============================================================================

registerCareTaskRoutes(careRouter, {
    getDb,
    pageSizeDefault: CARE_PAGE_SIZE_DEFAULT,
    pageSizeMax: CARE_PAGE_SIZE_MAX,
    taskTitleMaxLength: CARE_TASK_TITLE_MAX_LENGTH,
    taskDescriptionMaxLength: CARE_TASK_DESCRIPTION_MAX_LENGTH,
});
