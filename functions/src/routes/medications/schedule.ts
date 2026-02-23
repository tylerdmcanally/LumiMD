import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import {
  ensureResourceOwnerAccessOrReject,
  hasResourceOwnerAccess,
} from '../../middlewares/resourceAccess';

type DoseCompletionAction = 'taken' | 'skipped';

type CompletionLogState = {
  id: string;
  action: DoseCompletionAction;
  loggedAtMillis: number;
};

type CompletionUpsertResult = {
  id: string;
  status: 'created' | 'updated' | 'unchanged';
  previousAction?: DoseCompletionAction;
};

type RegisterMedicationScheduleRoutesOptions = {
  getDb: () => FirebaseFirestore.Firestore;
  getUserTimezone: (userId: string) => Promise<string>;
  getDayBoundariesInTimezone: (timezone: string) => { startOfDay: Date; endOfDay: Date };
  normalizeReminderTimes: (rawTimes: unknown, reminderId: string, userId: string) => string[];
  buildDoseKey: (medicationId: string, scheduledTime: string) => string;
  getLogTimestampMillis: (log: admin.firestore.DocumentData | undefined) => number;
  getLogDateStringInTimezone: (
    log: admin.firestore.DocumentData | undefined,
    timezone: string,
  ) => string | null;
  getTodayCompletionLogMap: (
    userId: string,
    timezone: string,
    intendedDateStr: string,
  ) => Promise<Map<string, CompletionLogState>>;
  upsertDoseCompletionLog: (params: {
    userId: string;
    medicationId: string;
    medicationName: string;
    scheduledTime: string;
    scheduledDate: string;
    action: DoseCompletionAction;
    now: admin.firestore.Timestamp;
    completionLogs: Map<string, CompletionLogState>;
  }) => Promise<CompletionUpsertResult>;
};

export function registerMedicationScheduleRoutes(
  router: Router,
  options: RegisterMedicationScheduleRoutesOptions,
): void {
  const {
    getDb,
    getUserTimezone,
    getDayBoundariesInTimezone,
    normalizeReminderTimes,
    buildDoseKey,
    getLogTimestampMillis,
    getLogDateStringInTimezone,
    getTodayCompletionLogMap,
    upsertDoseCompletionLog,
  } = options;

  /**
   * GET /v1/meds/schedule
   * Get today's medication schedule with taken status
   */
  router.get('/schedule/today', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const overdueGraceMinutes = 120;

      // Get user's timezone
      const userTimezone = await getUserTimezone(userId);

      // Get start and end of today in user's timezone (00:00:00 to 23:59:59)
      const { startOfDay, endOfDay } = getDayBoundariesInTimezone(userTimezone);

      // Get current time in user's timezone for "next due" calculation
      const now = new Date();
      const currentTimeInTZ = now.toLocaleTimeString('en-US', {
        timeZone: userTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const currentMinutes =
        parseInt(currentTimeInTZ.slice(0, 2), 10) * 60 + parseInt(currentTimeInTZ.slice(3, 5), 10);

      // Get all medication reminders for this user
      const remindersSnapshot = await getDb()
        .collection('medicationReminders')
        .where('userId', '==', userId)
        .where('enabled', '==', true)
        .get();

      // Get today's medication logs
      const logsSnapshot = await getDb()
        .collection('medicationLogs')
        .where('userId', '==', userId)
        .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
        .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
        .get();

      // Get today's date string in user's timezone for validation
      const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone });

      // Build maps for today's dose state:
      // - loggedDoses: definitive completion state (taken/skipped)
      // - activeSnoozes: latest snooze window for each scheduled dose
      const loggedDoses = new Map<string, {
        id: string;
        action: DoseCompletionAction;
        loggedAt: admin.firestore.Timestamp | Date | null;
        scheduledDate: string | null;
        loggedAtMillis: number;
      }>();
      const activeSnoozes = new Map<string, any>();
      logsSnapshot.docs.forEach(doc => {
        const log = doc.data();
        if (typeof log.medicationId !== 'string' || typeof log.scheduledTime !== 'string') {
          return;
        }

        const logDateStr = getLogDateStringInTimezone(log, userTimezone);
        if (logDateStr !== todayDateStr) {
          // Log is from a different day, skip it (shouldn't happen due to query, but safety check)
          functions.logger.warn(
            `[medications] Skipping log ${doc.id} - date mismatch: ${logDateStr} vs ${todayDateStr}`,
          );
          return;
        }

        const key = buildDoseKey(log.medicationId, log.scheduledTime);
        const currentLoggedAtMillis = getLogTimestampMillis(log);

        if (log.action === 'taken' || log.action === 'skipped') {
          const existing = loggedDoses.get(key);
          // Keep the latest completion action for this scheduled dose.
          if (!existing || currentLoggedAtMillis >= existing.loggedAtMillis) {
            loggedDoses.set(key, {
              id: doc.id,
              action: log.action,
              loggedAt: log.loggedAt ?? null,
              scheduledDate: typeof log.scheduledDate === 'string' ? log.scheduledDate : null,
              loggedAtMillis: currentLoggedAtMillis,
            });
          }
        }

        if (log.action === 'snoozed' && log.scheduledTime) {
          const existing = activeSnoozes.get(key);
          const currentSnoozeLoggedAtMillis = currentLoggedAtMillis;
          const existingLoggedAtMillis = existing?.loggedAt?.toMillis?.() ?? 0;

          // Keep only the latest snooze action for this dose.
          if (!existing || currentSnoozeLoggedAtMillis >= existingLoggedAtMillis) {
            activeSnoozes.set(key, { id: doc.id, ...log });
          }
        }
      });

      // Get medication details for each reminder
      const medicationIds = new Set<string>();
      remindersSnapshot.docs.forEach(doc => {
        const reminder = doc.data();
        if (reminder.medicationId) {
          medicationIds.add(reminder.medicationId);
        }
      });

      // Fetch medication details
      const medicationsMap = new Map<string, any>();
      const medicationDocs = await Promise.all(
        Array.from(medicationIds).map((medId) =>
          getDb().collection('medications').doc(medId).get().then((medDoc) => ({
            medId,
            medDoc,
          })),
        ),
      );
      medicationDocs.forEach(({ medId, medDoc }) => {
        if (medDoc.exists) {
          const med = medDoc.data()!;
          if (med.active !== false) {
            medicationsMap.set(medId, { id: medId, ...med });
          }
        }
      });

      // Build scheduled doses array
      const scheduledDoses: any[] = [];

      remindersSnapshot.docs.forEach(doc => {
        const reminder = doc.data();
        const medication = medicationsMap.get(reminder.medicationId);

        if (!medication) return;

        // Each reminder can have multiple times
        const times = normalizeReminderTimes(reminder.times, doc.id, userId);
        times.forEach((time: string) => {
          const logKey = buildDoseKey(reminder.medicationId, time);
          const log = loggedDoses.get(logKey);

          // Additional validation: if we found a log, verify it's actually for today
          // This prevents interday matching issues
          let status: 'taken' | 'skipped' | 'pending' | 'overdue' = 'pending';
          let logId: string | null = null;

          if (log) {
            // Prefer scheduledDate if available (new logs), otherwise fall back to loggedAt date
            const logDateStr = log.scheduledDate || (() => {
              if (log.loggedAt && typeof (log.loggedAt as admin.firestore.Timestamp).toDate === 'function') {
                return (log.loggedAt as admin.firestore.Timestamp)
                  .toDate()
                  .toLocaleDateString('en-CA', { timeZone: userTimezone });
              }
              if (log.loggedAt instanceof Date) {
                return log.loggedAt.toLocaleDateString('en-CA', { timeZone: userTimezone });
              }
              return null;
            })();

            if (logDateStr === todayDateStr) {
              // Log is for today, use it
              status = log.action;
              logId = log.id;
            } else {
              // Log is from a different day, ignore it (shouldn't happen due to query + previous check)
              functions.logger.warn(`[medications] Ignoring log ${log.id} for ${reminder.medicationId} ${time} - date mismatch: ${logDateStr} vs ${todayDateStr}`);
            }
          }

          const snoozeLog = activeSnoozes.get(logKey);
          const snoozedUntilMillis = snoozeLog?.snoozeUntil?.toMillis?.();
          const isActivelySnoozed =
            typeof snoozedUntilMillis === 'number' && snoozedUntilMillis > now.getTime();

          if (status === 'pending' && !isActivelySnoozed) {
            const [hours, minutes] = time.split(':').map(Number);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) {
              functions.logger.warn(
                `[medications] Ignoring invalid scheduled time "${time}" for reminder ${doc.id} (user ${userId})`,
              );
              return;
            }
            const scheduledMinutes = hours * 60 + minutes;
            if (scheduledMinutes <= currentMinutes - overdueGraceMinutes) {
              status = 'overdue';
            }
          }

          scheduledDoses.push({
            medicationId: reminder.medicationId,
            reminderId: doc.id,
            name: medication.name,
            dose: medication.dose || '',
            scheduledTime: time,
            status,
            logId,
            snoozedUntil:
              isActivelySnoozed && snoozeLog?.snoozeUntil
                ? snoozeLog.snoozeUntil.toDate().toISOString()
                : null,
          });
        });
      });

      // Sort by scheduled time
      scheduledDoses.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

      // Calculate summary
      const taken = scheduledDoses.filter(d => d.status === 'taken').length;
      const skipped = scheduledDoses.filter(d => d.status === 'skipped').length;
      const overdue = scheduledDoses.filter(d => d.status === 'overdue').length;
      const pending = scheduledDoses.filter(d => d.status === 'pending' || d.status === 'overdue').length;
      const total = scheduledDoses.length;

      // Find next due dose using current time in user's timezone
      const currentTimeHHMM = currentTimeInTZ;
      const nextDue =
        scheduledDoses.find(
          d => d.status === 'pending' && d.scheduledTime >= currentTimeHHMM,
        ) ||
        scheduledDoses.find(d => d.status === 'overdue') ||
        scheduledDoses.find(d => d.status === 'pending');

      functions.logger.info(`[medications] Retrieved schedule for user ${userId}`, {
        total,
        taken,
        pending,
        skipped,
      });

      res.json({
        scheduledDoses,
        summary: { taken, skipped, pending, overdue, total },
        nextDue: nextDue ? { name: nextDue.name, time: nextDue.scheduledTime } : null,
      });
    } catch (error) {
      functions.logger.error('[medications] Error fetching schedule:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to fetch medication schedule',
      });
    }
  });

  /**
   * POST /v1/meds/schedule/mark
   * Quick mark a scheduled dose as taken/skipped
   */
  router.post('/schedule/mark', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;

      const schema = z.object({
        medicationId: z.string().min(1),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
        action: z.enum(['taken', 'skipped']),
      });

      const data = schema.parse(req.body);

      // Get medication info
      const medDoc = await getDb().collection('medications').doc(data.medicationId).get();

      if (
        !ensureResourceOwnerAccessOrReject(userId, medDoc.data(), res, {
          resourceName: 'medication',
          message: 'Not your medication',
          notFoundMessage: 'Medication not found',
        })
      ) {
        return;
      }
      const medication = medDoc.data()!;

      const now = admin.firestore.Timestamp.now();

      // Get user's timezone to determine the intended date for this scheduled dose
      const userTimezone = await getUserTimezone(userId);
      const nowDate = new Date();
      const intendedDateStr = nowDate.toLocaleDateString('en-CA', { timeZone: userTimezone });
      const completionLogs = await getTodayCompletionLogMap(
        userId,
        userTimezone,
        intendedDateStr,
      );

      const upsertResult = await upsertDoseCompletionLog({
        userId,
        medicationId: data.medicationId,
        medicationName: medication.name,
        scheduledTime: data.scheduledTime,
        scheduledDate: intendedDateStr,
        action: data.action,
        now,
        completionLogs,
      });

      functions.logger.info(
        `[medications] ${upsertResult.status} ${data.action} for ${medication.name} at ${data.scheduledTime}`,
        upsertResult.previousAction
          ? { previousAction: upsertResult.previousAction }
          : undefined,
      );

      res.status(upsertResult.status === 'created' ? 201 : 200).json({
        id: upsertResult.id,
        medicationId: data.medicationId,
        action: data.action,
        scheduledTime: data.scheduledTime,
        status: upsertResult.status,
        idempotent: upsertResult.status === 'unchanged',
        previousAction: upsertResult.previousAction ?? null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid request body',
          details: error.errors,
        });
        return;
      }

      functions.logger.error('[medications] Error marking dose:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to mark dose',
      });
    }
  });

  /**
   * POST /v1/meds/schedule/mark-batch
   * Mark multiple scheduled doses at once (Mark All feature)
   */
  router.post('/schedule/mark-batch', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;

      const schema = z.object({
        doses: z.array(z.object({
          medicationId: z.string().min(1),
          scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
        })).min(1).max(20),
        action: z.enum(['taken', 'skipped']),
      });

      const data = schema.parse(req.body);
      const now = admin.firestore.Timestamp.now();
      const results: any[] = [];
      const errors: any[] = [];
      const seenDoseKeys = new Set<string>();
      const uniqueDoses = data.doses.filter((dose) => {
        const key = buildDoseKey(dose.medicationId, dose.scheduledTime);
        if (seenDoseKeys.has(key)) return false;
        seenDoseKeys.add(key);
        return true;
      });

      // Resolve timezone/date once per batch.
      const userTimezone = await getUserTimezone(userId);
      const nowDate = new Date();
      const intendedDateStr = nowDate.toLocaleDateString('en-CA', { timeZone: userTimezone });
      const completionLogs = await getTodayCompletionLogMap(
        userId,
        userTimezone,
        intendedDateStr,
      );
      const medicationCache = new Map<string, admin.firestore.DocumentData>();

      // Process each unique dose
      for (const dose of uniqueDoses) {
        try {
          let medication = medicationCache.get(dose.medicationId);

          if (!medication) {
            const medDoc = await getDb().collection('medications').doc(dose.medicationId).get();
            if (!medDoc.exists) {
              errors.push({
                medicationId: dose.medicationId,
                scheduledTime: dose.scheduledTime,
                error: 'not_found',
              });
              continue;
            }

            medication = medDoc.data()!;
            medicationCache.set(dose.medicationId, medication);
          }

          if (!hasResourceOwnerAccess(userId, medication)) {
            errors.push({
              medicationId: dose.medicationId,
              scheduledTime: dose.scheduledTime,
              error: 'forbidden',
            });
            continue;
          }

          const upsertResult = await upsertDoseCompletionLog({
            userId,
            medicationId: dose.medicationId,
            medicationName: medication.name,
            scheduledTime: dose.scheduledTime,
            scheduledDate: intendedDateStr,
            action: data.action,
            now,
            completionLogs,
          });

          results.push({
            id: upsertResult.id,
            medicationId: dose.medicationId,
            medicationName: medication.name,
            scheduledTime: dose.scheduledTime,
            action: data.action,
            status: upsertResult.status,
            idempotent: upsertResult.status === 'unchanged',
            previousAction: upsertResult.previousAction ?? null,
          });
        } catch (err) {
          errors.push({
            medicationId: dose.medicationId,
            scheduledTime: dose.scheduledTime,
            error: 'failed',
          });
        }
      }

      const createdCount = results.filter(result => result.status === 'created').length;
      const updatedCount = results.filter(result => result.status === 'updated').length;
      const unchangedCount = results.filter(result => result.status === 'unchanged').length;
      const duplicateInputCount = data.doses.length - uniqueDoses.length;

      functions.logger.info(`[medications] Batch marked ${results.length} doses as ${data.action}`, {
        created: createdCount,
        updated: updatedCount,
        unchanged: unchangedCount,
        duplicateInputsIgnored: duplicateInputCount,
        errors: errors.length,
      });

      res
        .status(createdCount > 0 ? 201 : 200)
        .json({ results, errors, duplicateInputsIgnored: duplicateInputCount });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid request body',
          details: error.errors,
        });
        return;
      }

      functions.logger.error('[medications] Error batch marking doses:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to batch mark doses',
      });
    }
  });

  /**
   * POST /v1/meds/schedule/snooze
   * Snooze a medication reminder for a specified duration
   */
  router.post('/schedule/snooze', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;

      const schema = z.object({
        medicationId: z.string().min(1),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
        snoozeMinutes: z.enum(['15', '30', '60']),
      });

      const data = schema.parse(req.body);

      // Get medication info
      const medDoc = await getDb().collection('medications').doc(data.medicationId).get();

      if (
        !ensureResourceOwnerAccessOrReject(userId, medDoc.data(), res, {
          resourceName: 'medication',
          message: 'Not your medication',
          notFoundMessage: 'Medication not found',
        })
      ) {
        return;
      }
      const medication = medDoc.data()!;

      const now = admin.firestore.Timestamp.now();
      const snoozeUntil = new Date(Date.now() + parseInt(data.snoozeMinutes) * 60 * 1000);

      // Get user's timezone for intended date
      const userTimezone = await getUserTimezone(userId);
      const nowDate = new Date();
      const intendedDateStr = nowDate.toLocaleDateString('en-CA', { timeZone: userTimezone });

      // Create snooze log
      const logRef = await getDb().collection('medicationLogs').add({
        userId,
        medicationId: data.medicationId,
        medicationName: medication.name,
        action: 'snoozed',
        scheduledTime: data.scheduledTime,
        scheduledDate: intendedDateStr, // Store the date this dose was intended for
        snoozeMinutes: parseInt(data.snoozeMinutes),
        snoozeUntil: admin.firestore.Timestamp.fromDate(snoozeUntil),
        loggedAt: now,
        createdAt: now,
      });

      functions.logger.info(`[medications] Snoozed ${medication.name} for ${data.snoozeMinutes} minutes`);

      res.status(201).json({
        id: logRef.id,
        medicationId: data.medicationId,
        medicationName: medication.name,
        snoozeMinutes: parseInt(data.snoozeMinutes),
        snoozeUntil: snoozeUntil.toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid request body',
          details: error.errors,
        });
        return;
      }

      functions.logger.error('[medications] Error snoozing dose:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to snooze dose',
      });
    }
  });

  /**
   * GET /v1/meds/compliance
   * Get medication compliance summary for the past 7/30 days
   */
  router.get('/compliance', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.uid;
      const days = parseInt(req.query.days as string) || 7;

      // Get date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Get all medication reminders for this user
      const remindersSnapshot = await getDb()
        .collection('medicationReminders')
        .where('userId', '==', userId)
        .where('enabled', '==', true)
        .get();

      if (remindersSnapshot.empty) {
        res.json({
          hasReminders: false,
          period: days,
          adherence: 0,
          takenCount: 0,
          expectedCount: 0,
          byMedication: [],
          dailyData: [],
        });
        return;
      }

      // Get all medication logs in the date range
      const logsSnapshot = await getDb()
        .collection('medicationLogs')
        .where('userId', '==', userId)
        .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();

      // Build map of logs by date and med
      const logsByDateAndMed = new Map<string, Set<string>>();
      logsSnapshot.docs.forEach(doc => {
        const log = doc.data();
        if (log.action !== 'taken') return;

        const logDate = log.loggedAt?.toDate();
        if (!logDate) return;

        const dateKey = logDate.toISOString().slice(0, 10);
        const key = `${dateKey}_${log.medicationId}`;

        if (!logsByDateAndMed.has(key)) {
          logsByDateAndMed.set(key, new Set());
        }
        logsByDateAndMed.get(key)!.add(log.scheduledTime || 'any');
      });

      // Calculate expected doses per medication
      const medicationExpected = new Map<string, { name: string; dosesPerDay: number }>();
      remindersSnapshot.docs.forEach(doc => {
        const reminder = doc.data();
        const times = reminder.times || [];
        medicationExpected.set(reminder.medicationId, {
          name: reminder.medicationName || 'Unknown',
          dosesPerDay: times.length,
        });
      });

      // Calculate daily adherence
      const dailyData: Array<{ date: string; adherence: number; taken: number; expected: number }> = [];
      let totalTaken = 0;
      let totalExpected = 0;

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().slice(0, 10);
        let dayTaken = 0;
        let dayExpected = 0;

        medicationExpected.forEach((med, medId) => {
          const key = `${dateKey}_${medId}`;
          const takenTimes = logsByDateAndMed.get(key);
          const taken = takenTimes ? takenTimes.size : 0;
          dayTaken += Math.min(taken, med.dosesPerDay);
          dayExpected += med.dosesPerDay;
        });

        dailyData.push({
          date: dateKey,
          adherence: dayExpected > 0 ? Math.round((dayTaken / dayExpected) * 100) : 0,
          taken: dayTaken,
          expected: dayExpected,
        });

        totalTaken += dayTaken;
        totalExpected += dayExpected;
      }

      // Calculate per-medication adherence
      const byMedication: Array<{ medicationId: string; name: string; adherence: number; taken: number; expected: number }> = [];
      medicationExpected.forEach((med, medId) => {
        let medTaken = 0;
        const medExpected = med.dosesPerDay * days;

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateKey = d.toISOString().slice(0, 10);
          const key = `${dateKey}_${medId}`;
          const takenTimes = logsByDateAndMed.get(key);
          medTaken += takenTimes ? Math.min(takenTimes.size, med.dosesPerDay) : 0;
        }

        byMedication.push({
          medicationId: medId,
          name: med.name,
          adherence: medExpected > 0 ? Math.round((medTaken / medExpected) * 100) : 0,
          taken: medTaken,
          expected: medExpected,
        });
      });

      const overallAdherence = totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;

      functions.logger.info(`[medications] Compliance for user ${userId}`, {
        period: days,
        adherence: overallAdherence,
        totalTaken,
        totalExpected,
      });

      res.json({
        hasReminders: true,
        period: days,
        adherence: overallAdherence,
        takenCount: totalTaken,
        expectedCount: totalExpected,
        byMedication,
        dailyData,
      });
    } catch (error) {
      functions.logger.error('[medications] Error fetching compliance:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to fetch compliance data',
      });
    }
  });
}
