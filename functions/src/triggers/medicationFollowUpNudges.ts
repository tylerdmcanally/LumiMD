import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  FirestoreMedicationReminderProcessingRepository,
} from '../services/repositories/medicationReminderProcessing/FirestoreMedicationReminderProcessingRepository';
import { FirestoreNudgeRepository } from '../services/repositories/nudges/FirestoreNudgeRepository';
import { NudgeDomainService } from '../services/domain/nudges/NudgeDomainService';

/**
 * Grace window: how long after a reminder was sent before we send a follow-up.
 * We look for reminders sent between GRACE_MIN and GRACE_MAX hours ago.
 */
const GRACE_MIN_HOURS = 2;
const GRACE_MAX_HOURS = 4;

/** Maximum follow-up nudges per user per day (shared with other nudge types). */
const MAX_DAILY_FOLLOWUP_NUDGES = 3;

/** Quiet hours — do not send follow-ups during these times. */
const QUIET_HOURS_START = 21; // 9pm
const QUIET_HOURS_END = 8;   // 8am
const DEFAULT_TIMEZONE = 'America/Chicago';

const db = () => admin.firestore();

/**
 * Medication Follow-Up Nudges
 *
 * Runs every 15 minutes. For each medication reminder that was sent 2-4 hours
 * ago, checks if the patient logged that dose. If not, creates a
 * `medication_followup` nudge asking "Did you take {med}?"
 *
 * The patient's response (via the nudge respond endpoint) creates the
 * medication log entry, closing the data gap that undermines adherence accuracy.
 */
export const processMedicationFollowUpNudges = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 15 minutes',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[MedFollowUp] Starting medication follow-up nudge sweep');

    const firestore = db();
    const reminderRepo = new FirestoreMedicationReminderProcessingRepository(firestore);
    const nudgeService = new NudgeDomainService(new FirestoreNudgeRepository(firestore));

    const now = new Date();
    const nowTimestamp = admin.firestore.Timestamp.now();

    // Window: reminders sent between 2 and 4 hours ago
    const graceMinCutoff = new Date(now.getTime() - GRACE_MIN_HOURS * 60 * 60 * 1000);
    const graceMaxCutoff = new Date(now.getTime() - GRACE_MAX_HOURS * 60 * 60 * 1000);

    let created = 0;
    let skippedAlreadyLogged = 0;
    let skippedAlreadyNudged = 0;
    let skippedQuietHours = 0;
    let skippedDailyLimit = 0;
    let errors = 0;

    try {
      // 1. Get all enabled reminders
      const reminders = await reminderRepo.listEnabledReminders();

      if (reminders.length === 0) {
        functions.logger.info('[MedFollowUp] No enabled reminders found');
        return;
      }

      // 2. Group by userId
      const byUser = new Map<string, typeof reminders>();
      for (const r of reminders) {
        if (!r.lastSentAt) continue; // Never sent — skip

        const sentAtMs = r.lastSentAt.toMillis();
        // Only consider reminders sent within our grace window
        if (sentAtMs > graceMinCutoff.getTime() || sentAtMs < graceMaxCutoff.getTime()) {
          continue;
        }

        const arr = byUser.get(r.userId) || [];
        arr.push(r);
        byUser.set(r.userId, arr);
      }

      functions.logger.info(
        `[MedFollowUp] Found ${byUser.size} user(s) with reminders in grace window`,
      );

      // 3. Process each user
      for (const [userId, userReminders] of byUser) {
        try {
          // Check quiet hours
          let timezone = DEFAULT_TIMEZONE;
          try {
            const tz = await reminderRepo.getUserTimezoneValue(userId);
            if (tz) timezone = tz;
          } catch {
            // Use default
          }

          if (isQuietHours(now, timezone)) {
            skippedQuietHours += userReminders.length;
            continue;
          }

          // Check daily nudge count
          const todayStart = getTodayStart(now, timezone);
          const todayEnd = getTodayEnd(now, timezone);
          const dailyCount = await nudgeService.countByUserNotificationSentBetween(
            userId,
            admin.firestore.Timestamp.fromDate(todayStart),
            admin.firestore.Timestamp.fromDate(todayEnd),
          );

          if (dailyCount >= MAX_DAILY_FOLLOWUP_NUDGES) {
            skippedDailyLimit += userReminders.length;
            continue;
          }

          let remaining = MAX_DAILY_FOLLOWUP_NUDGES - dailyCount;

          // Get today's medication logs for this user
          const dayBoundaries = getDayBoundaries(now, timezone);
          const todayLogs = await reminderRepo.listMedicationLogsByUserAndLoggedAtRange(
            userId,
            dayBoundaries,
          );

          // Build a set of (medicationId, scheduledDate) pairs that have logs
          const loggedDoseKeys = new Set<string>();
          for (const log of todayLogs) {
            const medId = log.medicationId;
            const action = log.action;
            if (medId && (action === 'taken' || action === 'skipped')) {
              // Key by medicationId + scheduledDate (or today's date)
              const schedDate = log.scheduledDate || now.toISOString().split('T')[0];
              loggedDoseKeys.add(`${medId}:${schedDate}`);
            }
          }

          const todayDateStr = now.toISOString().split('T')[0];

          for (const reminder of userReminders) {
            if (remaining <= 0) {
              skippedDailyLimit++;
              continue;
            }

            // Check if dose was already logged
            const doseKey = `${reminder.medicationId}:${todayDateStr}`;
            if (loggedDoseKeys.has(doseKey)) {
              skippedAlreadyLogged++;
              continue;
            }

            // Check if we already sent a follow-up nudge for this reminder today
            const existingNudges = await firestore
              .collection('nudges')
              .where('userId', '==', userId)
              .where('type', '==', 'medication_followup')
              .where('medicationId', '==', reminder.medicationId)
              .where('status', 'in', ['pending', 'active', 'completed'])
              .limit(1)
              .get();

            // Filter to today's nudges by checking metadata.scheduledDate
            const todayNudge = existingNudges.docs.find((doc) => {
              const data = doc.data();
              const meta = data.metadata as Record<string, unknown> | undefined;
              return meta?.scheduledDate === todayDateStr;
            });

            if (todayNudge) {
              skippedAlreadyNudged++;
              continue;
            }

            // Determine which scheduled time triggered this reminder
            const sentAt = reminder.lastSentAt!.toDate();
            const sentHHMM = `${String(sentAt.getHours()).padStart(2, '0')}:${String(sentAt.getMinutes()).padStart(2, '0')}`;
            const matchedTime = findClosestScheduledTime(reminder.times || [], sentHHMM);

            // Create the follow-up nudge
            await nudgeService.createRecord({
              userId,
              type: 'medication_followup',
              medicationId: reminder.medicationId,
              medicationName: reminder.medicationName,
              title: `Did you take ${reminder.medicationName}?`,
              message: matchedTime
                ? `Your ${matchedTime} dose — tap to log it`
                : `Tap to log whether you took ${reminder.medicationName}`,
              actionType: 'medication_followup_response',
              scheduledFor: nowTimestamp,
              sequenceDay: 0,
              sequenceId: `med_followup_${reminder.id}_${todayDateStr}`,
              status: 'pending',
              notificationSent: false,
              metadata: {
                reminderId: reminder.id,
                scheduledTime: matchedTime || null,
                scheduledDate: todayDateStr,
                followUpWindowHours: GRACE_MAX_HOURS,
              },
              createdAt: nowTimestamp,
              updatedAt: nowTimestamp,
            });

            created++;
            remaining--;
          }
        } catch (error) {
          errors++;
          functions.logger.error(
            `[MedFollowUp] Error processing user ${userId}:`,
            error,
          );
        }
      }
    } catch (error) {
      functions.logger.error('[MedFollowUp] Fatal error in follow-up sweep:', error);
      throw error;
    }

    functions.logger.info('[MedFollowUp] Sweep complete', {
      created,
      skippedAlreadyLogged,
      skippedAlreadyNudged,
      skippedQuietHours,
      skippedDailyLimit,
      errors,
    });
  },
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function isQuietHours(now: Date, timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const hour = parseInt(formatter.format(now), 10);
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  } catch {
    // If timezone is invalid, default to not quiet
    return false;
  }
}

function getTodayStart(now: Date, timezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });
    const dateStr = formatter.format(now); // YYYY-MM-DD
    return new Date(`${dateStr}T00:00:00`);
  } catch {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

function getTodayEnd(now: Date, timezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });
    const dateStr = formatter.format(now);
    return new Date(`${dateStr}T23:59:59.999`);
  } catch {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}

function getDayBoundaries(now: Date, timezone: string): { start: Date; end: Date } {
  return {
    start: getTodayStart(now, timezone),
    end: getTodayEnd(now, timezone),
  };
}

/**
 * Find the closest scheduled time to `sentHHMM` from a list of times.
 * Handles the ±7 minute matching window used by the reminder service.
 */
function findClosestScheduledTime(times: string[], sentHHMM: string): string | null {
  if (times.length === 0) return null;

  const sentMinutes = parseHHMM(sentHHMM);
  if (sentMinutes === null) return times[0] || null;

  let closest: string | null = null;
  let closestDiff = Infinity;

  for (const t of times) {
    const tMinutes = parseHHMM(t);
    if (tMinutes === null) continue;
    const diff = Math.abs(tMinutes - sentMinutes);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = t;
    }
  }

  return closest;
}

function parseHHMM(time: string): number | null {
  const parts = time.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
