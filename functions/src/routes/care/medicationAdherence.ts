import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type PerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type RegisterCareMedicationAdherenceRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => PerfTracker;
};

export function registerCareMedicationAdherenceRoutes(
    router: Router,
    options: RegisterCareMedicationAdherenceRoutesOptions,
): void {
    const { getDb, createPerfTracker } = options;
    const getMedicationAdherenceServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/medication-adherence
    // Fetch medication adherence statistics for a patient
    router.get('/:patientId/medication-adherence', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;

        try {
            const { days = '30', medicationId } = req.query;
            const {
                medicationLogService,
                medicationReminderService,
                medicationService,
            } = getMedicationAdherenceServices();
            const medicationIdFilter =
                typeof medicationId === 'string' && medicationId.trim().length > 0
                    ? medicationId
                    : undefined;

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                onForbidden: () => {
                    statusCode = 403;
                },
            }))) {
                return;
            }

            const daysNum = Math.min(Math.max(parseInt(days as string) || 30, 1), 365);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysNum);
            startDate.setHours(0, 0, 0, 0);

            // Fetch medication logs - try both createdAt and loggedAt fields
            let logRecords: Array<FirebaseFirestore.DocumentData & { id: string }>;
            let logQueryAttempts = 0;
            try {
                logQueryAttempts += 1;
                logRecords = await medicationLogService.listForUser(patientId, {
                    startDate,
                    dateField: 'createdAt',
                    medicationId: medicationIdFilter,
                });
            } catch (indexError) {
                // Fallback: try with loggedAt field if createdAt index doesn't exist
                functions.logger.warn('[care] createdAt query failed, trying loggedAt:', indexError);
                logQueryAttempts += 1;
                logRecords = await medicationLogService.listForUser(patientId, {
                    startDate,
                    dateField: 'loggedAt',
                    medicationId: medicationIdFilter,
                });
            } finally {
                perf.addQueries(logQueryAttempts);
            }

            // Fetch active medications
            const medicationRecords = await medicationService.listAllForUser(patientId, {
                includeDeleted: true,
                sortDirection: 'asc',
                sortField: 'name',
            });
            perf.addQueries(1);

            // Fetch medication reminders (contains the schedule times)
            const reminderRecords = await medicationReminderService.listForUser(patientId, {
                enabled: true,
            });
            perf.addQueries(1);

            // Build a map of medication ID -> reminder times
            const remindersByMedId = new Map<string, string[]>();
            reminderRecords.forEach((data) => {
                if (data.medicationId && Array.isArray(data.times)) {
                    remindersByMedId.set(data.medicationId, data.times);
                }
            });

            // Build medications map with schedule info from reminders
            const medications = new Map<string, { name: string; times: string[] }>();
            medicationRecords.forEach((medication) => {
                if (medication.deletedAt || medication.active === false) {
                    return;
                }
                const times = remindersByMedId.get(medication.id) || [];
                medications.set(medication.id, {
                    name: medication.name || 'Unknown',
                    times,
                });
            });

            // Process logs
            const logs = logRecords.map((data) => {
                const timestamp = data.createdAt?.toDate?.() || data.loggedAt?.toDate?.() || new Date();
                return {
                    medicationId: data.medicationId,
                    medicationName: data.medicationName || null,
                    action: data.action, // 'taken', 'skipped', 'snoozed'
                    scheduledDate: data.scheduledDate || null,
                    createdAt: timestamp,
                };
            });

            // Calculate overall stats
            const takenCount = logs.filter((l) => l.action === 'taken').length;
            const skippedCount = logs.filter((l) => l.action === 'skipped').length;
            const totalLogged = takenCount + skippedCount;

            // Calculate expected doses based on reminders with scheduled times
            let expectedDoses = 0;
            medications.forEach((med) => {
                if (med.times.length > 0) {
                    expectedDoses += med.times.length * daysNum;
                }
            });

            // If no reminders are set up, use the logs as the denominator
            // This handles the case where patient takes meds but hasn't set up reminders
            const effectiveExpected = expectedDoses > 0 ? expectedDoses : totalLogged;
            const missedCount = Math.max(0, effectiveExpected - totalLogged);
            const adherenceRate = effectiveExpected > 0
                ? Math.round((takenCount / effectiveExpected) * 100)
                : (takenCount > 0 ? 100 : 0);

            // Per-medication breakdown
            const byMedication: Array<{
                medicationId: string;
                medicationName: string;
                totalDoses: number;
                takenDoses: number;
                skippedDoses: number;
                adherenceRate: number;
                streak: number;
            }> = [];

            // Track medications that have logs but aren't in the active meds list
            const loggedMedIds = new Set(logs.map((l) => l.medicationId));

            medications.forEach((med, medId) => {
                const medLogs = logs.filter((l) => l.medicationId === medId);
                const taken = medLogs.filter((l) => l.action === 'taken').length;
                const skipped = medLogs.filter((l) => l.action === 'skipped').length;

                // Expected = scheduled times * days, or fallback to logged count if no schedule
                const expected = med.times.length > 0
                    ? med.times.length * daysNum
                    : (taken + skipped);

                // Calculate current streak using scheduledDate (patient's local date)
                // This ensures timezone-correct streak tracking
                let streak = 0;
                const takenLogs = medLogs.filter((l) => l.action === 'taken');

                if (takenLogs.length > 0) {
                    // Get unique dates where medication was taken (using scheduledDate)
                    const takenDates = new Set<string>();
                    takenLogs.forEach((l) => {
                        // Prefer scheduledDate (patient's local date), fallback to createdAt date
                        const logDate = l.scheduledDate || l.createdAt.toISOString().split('T')[0];
                        takenDates.add(logDate);
                    });

                    // Check consecutive days starting from today
                    const today = new Date();
                    for (let i = 0; i < daysNum; i++) {
                        const checkDate = new Date(today);
                        checkDate.setDate(checkDate.getDate() - i);
                        const dateStr = checkDate.toISOString().split('T')[0];

                        if (takenDates.has(dateStr)) {
                            streak++;
                        } else {
                            break;
                        }
                    }
                }

                byMedication.push({
                    medicationId: medId,
                    medicationName: med.name,
                    totalDoses: expected,
                    takenDoses: taken,
                    skippedDoses: skipped,
                    adherenceRate: expected > 0 ? Math.round((taken / expected) * 100) : 100,
                    streak,
                });

                loggedMedIds.delete(medId);
            });

            // Add medications that have logs but aren't in active meds (might be discontinued)
            for (const medId of loggedMedIds) {
                const medLogs = logs.filter((l) => l.medicationId === medId);
                const taken = medLogs.filter((l) => l.action === 'taken').length;
                const skipped = medLogs.filter((l) => l.action === 'skipped').length;
                const total = taken + skipped;

                // Get name from logs
                const medName = medLogs.find((l) => l.medicationName)?.medicationName || 'Unknown Medication';

                byMedication.push({
                    medicationId: medId,
                    medicationName: medName,
                    totalDoses: total,
                    takenDoses: taken,
                    skippedDoses: skipped,
                    adherenceRate: total > 0 ? Math.round((taken / total) * 100) : 100,
                    streak: 0,
                });
            }

            // Sort by adherence rate (lowest first for attention)
            byMedication.sort((a, b) => a.adherenceRate - b.adherenceRate);

            // Build calendar data (last N days)
            const calendar: Array<{
                date: string;
                scheduled: number;
                taken: number;
                skipped: number;
                missed: number;
            }> = [];

            for (let i = 0; i < daysNum; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);
                const dateStr = date.toISOString().split('T')[0];

                // Filter logs for this day using scheduledDate (patient's local date)
                // Falls back to createdAt UTC date for older logs without scheduledDate
                const dayLogs = logs.filter((l) => {
                    const logDate = l.scheduledDate || l.createdAt.toISOString().split('T')[0];
                    return logDate === dateStr;
                });

                // Calculate scheduled count from reminders
                let scheduledCount = 0;
                medications.forEach((med) => {
                    scheduledCount += med.times.length;
                });

                const taken = dayLogs.filter((l) => l.action === 'taken').length;
                const skipped = dayLogs.filter((l) => l.action === 'skipped').length;

                // For calendar, use actual logs if no schedule exists
                const effectiveScheduled = scheduledCount > 0 ? scheduledCount : (taken + skipped);
                const missed = Math.max(0, effectiveScheduled - taken - skipped);

                calendar.push({
                    date: dateStr,
                    scheduled: effectiveScheduled,
                    taken,
                    skipped,
                    missed,
                });
            }

            // Detect patterns
            const patterns: {
                bestTimeOfDay: string | null;
                worstTimeOfDay: string | null;
                insights: string[];
            } = {
                bestTimeOfDay: null,
                worstTimeOfDay: null,
                insights: [],
            };

            // Check for weekend pattern (only if we have scheduled data)
            const weekendDays = calendar.filter((c) => {
                const day = new Date(c.date).getDay();
                return day === 0 || day === 6;
            });
            const weekdayDays = calendar.filter((c) => {
                const day = new Date(c.date).getDay();
                return day !== 0 && day !== 6;
            });

            const weekendScheduled = weekendDays.reduce((sum, d) => sum + d.scheduled, 0);
            const weekdayScheduled = weekdayDays.reduce((sum, d) => sum + d.scheduled, 0);

            if (weekendScheduled > 0 && weekdayScheduled > 0) {
                const weekendRate = (weekendDays.reduce((sum, d) => sum + d.taken, 0) / weekendScheduled) * 100;
                const weekdayRate = (weekdayDays.reduce((sum, d) => sum + d.taken, 0) / weekdayScheduled) * 100;

                if (!isNaN(weekdayRate) && !isNaN(weekendRate)) {
                    if (weekdayRate - weekendRate > 15) {
                        patterns.insights.push('Lower adherence on weekends');
                    } else if (weekendRate - weekdayRate > 15) {
                        patterns.insights.push('Better adherence on weekends');
                    }
                }
            }

            // Add streak insight
            const maxStreak = Math.max(...byMedication.map((m) => m.streak), 0);
            if (maxStreak >= 7) {
                patterns.insights.push(`${maxStreak}-day streak active`);
            }

            // Add low adherence warning
            const lowAdherenceMeds = byMedication.filter((m) => m.adherenceRate < 70 && m.totalDoses > 0);
            if (lowAdherenceMeds.length > 0) {
                patterns.insights.push(`${lowAdherenceMeds.length} medication(s) below 70% adherence`);
            }

            // Add insight if no reminders are set up
            if (expectedDoses === 0 && totalLogged > 0) {
                patterns.insights.push('No medication schedules set up - showing logged data only');
            }

            res.set('Cache-Control', 'private, max-age=30');
            res.json({
                overall: {
                    totalDoses: effectiveExpected,
                    takenDoses: takenCount,
                    skippedDoses: skippedCount,
                    missedDoses: missedCount,
                    adherenceRate,
                },
                byMedication,
                calendar,
                patterns,
                period: {
                    days: daysNum,
                    from: startDate.toISOString(),
                    to: new Date().toISOString(),
                },
            });
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error fetching medication adherence:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch medication adherence',
            });
        } finally {
            perf.finalize(statusCode);
        }
    });
}
