import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { UserDomainService } from '../../services/domain/users/UserDomainService';
import { FirestoreUserRepository } from '../../services/repositories/users/FirestoreUserRepository';

export const DEFAULT_USER_TIMEZONE = 'America/Chicago';
const TWENTY_FOUR_HOUR_TIME_REGEX = /^\d{2}:\d{2}$/;

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

function resolveTimezone(timezone: unknown, userId: string): string {
  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    return DEFAULT_USER_TIMEZONE;
  }

  const candidate = timezone.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    functions.logger.warn(
      `[medications] Invalid timezone "${candidate}" for user ${userId}; falling back to ${DEFAULT_USER_TIMEZONE}`,
    );
    return DEFAULT_USER_TIMEZONE;
  }
}

function buildDoseCompletionLogDocId(
  medicationId: string,
  scheduledDate: string,
  scheduledTime: string,
): string {
  const safeDate = scheduledDate.replace(/-/g, '');
  const safeTime = scheduledTime.replace(/:/g, '');
  return `dose_${medicationId}_${safeDate}_${safeTime}`;
}

export function createMedicationRouteHelpers(getDb: () => FirebaseFirestore.Firestore) {
  const getUserDomainService = () => new UserDomainService(new FirestoreUserRepository(getDb()));

  /**
   * Map medication frequency string to default reminder times.
   * Returns null if frequency doesn't warrant a reminder (PRN, as needed, etc.)
   */
  function getDefaultReminderTimes(frequency?: string): string[] | null {
    if (!frequency) return ['08:00']; // Default morning if no frequency specified

    const freq = frequency.toLowerCase().trim();

    // PRN / as needed - no automatic reminder
    if (freq.includes('prn') || freq.includes('as needed') || freq.includes('when needed')) {
      return null;
    }

    // Once daily patterns
    if (
      freq.includes('once daily') ||
      freq.includes('once a day') ||
      freq.includes('qd') ||
      freq.includes('daily') ||
      freq === 'qday'
    ) {
      // Check for timing hints
      if (freq.includes('morning') || freq.includes('am') || freq.includes('breakfast')) {
        return ['08:00'];
      }
      if (
        freq.includes('evening') ||
        freq.includes('pm') ||
        freq.includes('night') ||
        freq.includes('bedtime') ||
        freq.includes('dinner')
      ) {
        return ['20:00'];
      }
      return ['08:00']; // Default morning for once daily
    }

    // Twice daily patterns
    if (
      freq.includes('twice') ||
      freq.includes('bid') ||
      freq.includes('2x') ||
      freq.includes('two times') ||
      freq.includes('every 12')
    ) {
      return ['08:00', '20:00'];
    }

    // Three times daily patterns
    if (
      freq.includes('three times') ||
      freq.includes('tid') ||
      freq.includes('3x') ||
      freq.includes('every 8')
    ) {
      return ['08:00', '14:00', '20:00'];
    }

    // Four times daily
    if (
      freq.includes('four times') ||
      freq.includes('qid') ||
      freq.includes('4x') ||
      freq.includes('every 6')
    ) {
      return ['08:00', '12:00', '16:00', '20:00'];
    }

    // Weekly - just one reminder
    if (freq.includes('weekly') || freq.includes('once a week')) {
      return ['08:00'];
    }

    // Default: single morning reminder
    return ['08:00'];
  }

  /**
   * Get user's timezone from their profile
   */
  async function getUserTimezone(userId: string): Promise<string> {
    try {
      const user = await getUserDomainService().getById(userId);
      if (user) {
        return resolveTimezone(user.timezone, userId);
      }
    } catch (error) {
      functions.logger.warn(`[medications] Could not fetch timezone for user ${userId}:`, error);
    }
    return DEFAULT_USER_TIMEZONE;
  }

  /**
   * Get start and end of day in a specific timezone
   * Returns UTC Date objects representing midnight and end of day in the user's timezone
   */
  function getDayBoundariesInTimezone(timezone: string): { startOfDay: Date; endOfDay: Date } {
    const now = new Date();

    // Get current date string in user's timezone (YYYY-MM-DD format)
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const [year, month, day] = dateStr.split('-').map(Number);

    // Create a test date at a known UTC time (noon UTC) to calculate offset
    const testUTC = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`,
    );

    // Get what time this UTC moment is in the user's timezone
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const tzParts = tzFormatter.formatToParts(testUTC);
    const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
    const tzMinute = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);

    // Calculate offset: if UTC noon is 7 AM in user's TZ, offset is -5 hours
    const offsetHours = tzHour - 12;
    const offsetMinutes = offsetHours * 60 + tzMinute;

    // Calculate midnight in user's timezone
    // Midnight UTC for the date, adjusted by the offset
    const midnightUTC = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
    );
    const startOfDayUTC = new Date(midnightUTC.getTime() - offsetMinutes * 60 * 1000);
    const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    return { startOfDay: startOfDayUTC, endOfDay: endOfDayUTC };
  }

  function normalizeReminderTimes(rawTimes: unknown, reminderId: string, userId: string): string[] {
    if (typeof rawTimes === 'string') {
      if (TWENTY_FOUR_HOUR_TIME_REGEX.test(rawTimes)) {
        return [rawTimes];
      }
      functions.logger.warn(
        `[medications] Ignoring invalid reminder time "${rawTimes}" for reminder ${reminderId} (user ${userId})`,
      );
      return [];
    }

    if (!Array.isArray(rawTimes)) {
      if (rawTimes !== undefined && rawTimes !== null) {
        functions.logger.warn(
          `[medications] Ignoring malformed reminder times for reminder ${reminderId} (user ${userId})`,
        );
      }
      return [];
    }

    const validTimes = rawTimes.filter(
      (value): value is string =>
        typeof value === 'string' && TWENTY_FOUR_HOUR_TIME_REGEX.test(value),
    );

    if (validTimes.length !== rawTimes.length) {
      functions.logger.warn(
        `[medications] Dropped ${rawTimes.length - validTimes.length} invalid reminder time(s) for reminder ${reminderId} (user ${userId})`,
      );
    }

    return validTimes;
  }

  function buildDoseKey(medicationId: string, scheduledTime: string): string {
    return `${medicationId}_${scheduledTime}`;
  }

  function getLogTimestampMillis(log: admin.firestore.DocumentData | undefined): number {
    if (!log) return 0;
    if (typeof log.loggedAt?.toMillis === 'function') {
      return log.loggedAt.toMillis();
    }
    if (log.loggedAt instanceof Date) {
      return log.loggedAt.getTime();
    }
    return 0;
  }

  function getLogDateStringInTimezone(
    log: admin.firestore.DocumentData | undefined,
    timezone: string,
  ): string | null {
    if (!log) return null;
    if (typeof log.scheduledDate === 'string' && log.scheduledDate.trim().length > 0) {
      return log.scheduledDate;
    }
    if (typeof log.loggedAt?.toDate === 'function') {
      return log.loggedAt.toDate().toLocaleDateString('en-CA', { timeZone: timezone });
    }
    if (log.loggedAt instanceof Date) {
      return log.loggedAt.toLocaleDateString('en-CA', { timeZone: timezone });
    }
    return null;
  }

  async function getTodayCompletionLogMap(
    userId: string,
    timezone: string,
    intendedDateStr: string,
  ): Promise<Map<string, CompletionLogState>> {
    const { startOfDay, endOfDay } = getDayBoundariesInTimezone(timezone);
    const logsSnapshot = await getDb()
      .collection('medicationLogs')
      .where('userId', '==', userId)
      .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
      .get();

    const completionLogs = new Map<string, CompletionLogState>();

    logsSnapshot.docs.forEach((doc) => {
      const log = doc.data();
      if (log.action !== 'taken' && log.action !== 'skipped') return;
      if (typeof log.medicationId !== 'string' || typeof log.scheduledTime !== 'string') return;

      const logDateStr = getLogDateStringInTimezone(log, timezone);
      if (logDateStr !== intendedDateStr) return;

      const doseKey = buildDoseKey(log.medicationId, log.scheduledTime);
      const candidate: CompletionLogState = {
        id: doc.id,
        action: log.action,
        loggedAtMillis: getLogTimestampMillis(log),
      };
      const existing = completionLogs.get(doseKey);
      if (!existing || candidate.loggedAtMillis >= existing.loggedAtMillis) {
        completionLogs.set(doseKey, candidate);
      }
    });

    return completionLogs;
  }

  async function upsertDoseCompletionLog(params: {
    userId: string;
    medicationId: string;
    medicationName: string;
    scheduledTime: string;
    scheduledDate: string;
    action: DoseCompletionAction;
    now: admin.firestore.Timestamp;
    completionLogs: Map<string, CompletionLogState>;
  }): Promise<CompletionUpsertResult> {
    const {
      userId,
      medicationId,
      medicationName,
      scheduledTime,
      scheduledDate,
      action,
      now,
      completionLogs,
    } = params;

    const doseKey = buildDoseKey(medicationId, scheduledTime);
    const existingForDose = completionLogs.get(doseKey);

    if (existingForDose) {
      if (existingForDose.action === action) {
        return { id: existingForDose.id, status: 'unchanged' };
      }

      await getDb()
        .collection('medicationLogs')
        .doc(existingForDose.id)
        .set(
          {
            userId,
            medicationId,
            medicationName,
            action,
            scheduledTime,
            scheduledDate,
            loggedAt: now,
            updatedAt: now,
          },
          { merge: true },
        );

      completionLogs.set(doseKey, {
        id: existingForDose.id,
        action,
        loggedAtMillis: now.toMillis(),
      });

      return {
        id: existingForDose.id,
        status: 'updated',
        previousAction: existingForDose.action,
      };
    }

    const logId = buildDoseCompletionLogDocId(medicationId, scheduledDate, scheduledTime);
    const logRef = getDb().collection('medicationLogs').doc(logId);
    const existingDoc = await logRef.get();

    if (existingDoc.exists) {
      const existingData = existingDoc.data();
      const existingAction =
        existingData?.action === 'taken' || existingData?.action === 'skipped'
          ? (existingData.action as DoseCompletionAction)
          : undefined;

      if (existingAction === action) {
        completionLogs.set(doseKey, {
          id: logId,
          action,
          loggedAtMillis: getLogTimestampMillis(existingData),
        });
        return { id: logId, status: 'unchanged' };
      }

      await logRef.set(
        {
          userId,
          medicationId,
          medicationName,
          action,
          scheduledTime,
          scheduledDate,
          loggedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      completionLogs.set(doseKey, {
        id: logId,
        action,
        loggedAtMillis: now.toMillis(),
      });

      return { id: logId, status: 'updated', previousAction: existingAction };
    }

    await logRef.set({
      userId,
      medicationId,
      medicationName,
      action,
      scheduledTime,
      scheduledDate,
      loggedAt: now,
      createdAt: now,
    });

    completionLogs.set(doseKey, {
      id: logId,
      action,
      loggedAtMillis: now.toMillis(),
    });

    return { id: logId, status: 'created' };
  }

  return {
    getDefaultReminderTimes,
    getUserTimezone,
    getDayBoundariesInTimezone,
    normalizeReminderTimes,
    buildDoseKey,
    getLogTimestampMillis,
    getLogDateStringInTimezone,
    getTodayCompletionLogMap,
    upsertDoseCompletionLog,
  };
}
