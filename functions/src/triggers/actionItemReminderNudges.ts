import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FirestoreNudgeRepository } from '../services/repositories/nudges/FirestoreNudgeRepository';
import { NudgeDomainService } from '../services/domain/nudges/NudgeDomainService';

/** Maximum nudges per user per day (shared with other nudge types). */
const MAX_DAILY_NUDGES = 3;

/** Quiet hours — do not send nudges during these times. */
const QUIET_HOURS_START = 21; // 9pm
const QUIET_HOURS_END = 8;   // 8am
const DEFAULT_TIMEZONE = 'America/Chicago';

/** Reminder phases: how many days before/after due date to send nudges. */
const REMINDER_PHASES = [
  { phase: 'upcoming', daysOffset: -3, label: '3 days before' },
  { phase: 'due_today', daysOffset: 0, label: 'due today' },
  { phase: 'overdue_3', daysOffset: 3, label: '3 days overdue' },
  { phase: 'overdue_7', daysOffset: 7, label: '7 days overdue' },
] as const;

type ReminderPhase = typeof REMINDER_PHASES[number]['phase'];

/** Type-specific nudge content templates. */
const NUDGE_TEMPLATES: Record<string, Record<ReminderPhase, { title: string; message: string }>> = {
  lab_draw: {
    upcoming: { title: 'Bloodwork coming up', message: 'Your bloodwork is due by {date}. Have you scheduled it?' },
    due_today: { title: 'Bloodwork due today', message: 'Your bloodwork is due today. Have you gotten it done?' },
    overdue_3: { title: 'Bloodwork overdue', message: 'Your bloodwork is now 3 days overdue. It\'s important to get this done.' },
    overdue_7: { title: 'Bloodwork overdue', message: 'Your bloodwork is now 7 days overdue. Please schedule this soon.' },
  },
  specialist_referral: {
    upcoming: { title: 'Referral follow-up', message: 'Have you called to schedule your referral? It\'s due by {date}.' },
    due_today: { title: 'Referral due today', message: 'Your specialist referral was due today. Have you scheduled it?' },
    overdue_3: { title: 'Referral overdue', message: 'Your specialist referral is 3 days overdue. Please call to schedule.' },
    overdue_7: { title: 'Referral overdue', message: 'Your specialist referral is now 7 days overdue. Please follow up.' },
  },
};

const DEFAULT_TEMPLATES: Record<ReminderPhase, { title: string; message: string }> = {
  upcoming: { title: 'Follow-up coming up', message: 'You have a follow-up due by {date}: {description}' },
  due_today: { title: 'Follow-up due today', message: '{description} is due today.' },
  overdue_3: { title: 'Follow-up overdue', message: '{description} is 3 days overdue.' },
  overdue_7: { title: 'Follow-up overdue', message: '{description} is now 7 days overdue. Please follow up with your care team.' },
};

const db = () => admin.firestore();

function isQuietHours(now: Date, timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  } catch {
    // Fallback to UTC
    const hour = now.getUTCHours();
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  }
}

function getTodayBoundaries(now: Date, timezone: string): { start: Date; end: Date } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = formatter.format(now);
    const [month, day, year] = dateStr.split('/').map(Number);
    const start = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  } catch {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
}

function getNudgeTemplate(actionType: string | null | undefined, phase: ReminderPhase): { title: string; message: string } {
  if (actionType && NUDGE_TEMPLATES[actionType]) {
    return NUDGE_TEMPLATES[actionType][phase];
  }
  return DEFAULT_TEMPLATES[phase];
}

function formatTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Action Item Reminder Nudges
 *
 * Runs every 15 minutes. For each pending action item with a due date,
 * checks the 4-phase reminder schedule (3 days before, day of, 3 days after,
 * 7 days after) and creates nudges as appropriate.
 *
 * Respects: max 3 nudges/user/day, quiet hours 9pm-8am, dedup by action+phase.
 * Priority: 2 (between medication follow-ups at 3 and condition tracking at 1).
 */
export const processActionItemReminderNudges = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 15 minutes',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[ActionReminder] Starting action item reminder nudge sweep');

    const firestore = db();
    const nudgeService = new NudgeDomainService(new FirestoreNudgeRepository(firestore));

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let created = 0;
    let skippedCompleted = 0;
    let skippedAlreadyNudged = 0;
    let skippedQuietHours = 0;
    let skippedDailyLimit = 0;
    let errors = 0;

    try {
      // 1. Get all pending (non-completed, non-deleted) action items with due dates
      const actionsSnapshot = await firestore
        .collection('actions')
        .where('completed', '==', false)
        .where('deletedAt', '==', null)
        .get();

      const actionsWithDueDate = actionsSnapshot.docs.filter((doc) => {
        const data = doc.data();
        return data.dueAt != null;
      });

      if (actionsWithDueDate.length === 0) {
        functions.logger.info('[ActionReminder] No pending action items with due dates');
        return;
      }

      // 2. Group by userId
      const byUser = new Map<string, Array<{ id: string; data: FirebaseFirestore.DocumentData }>>();
      for (const doc of actionsWithDueDate) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId) continue;
        const arr = byUser.get(userId) || [];
        arr.push({ id: doc.id, data });
        byUser.set(userId, arr);
      }

      functions.logger.info(
        `[ActionReminder] Found ${actionsWithDueDate.length} pending actions across ${byUser.size} users`,
      );

      // 3. Process each user
      for (const [userId, userActions] of byUser) {
        try {
          // Check quiet hours
          let timezone = DEFAULT_TIMEZONE;
          try {
            const userDoc = await firestore.collection('users').doc(userId).get();
            const userData = userDoc.data();
            if (userData?.timezone) timezone = userData.timezone;
          } catch {
            // Use default
          }

          if (isQuietHours(now, timezone)) {
            skippedQuietHours += userActions.length;
            continue;
          }

          // Check daily nudge count
          const todayBounds = getTodayBoundaries(now, timezone);
          const dailyCount = await nudgeService.countByUserNotificationSentBetween(
            userId,
            admin.firestore.Timestamp.fromDate(todayBounds.start),
            admin.firestore.Timestamp.fromDate(todayBounds.end),
          );

          if (dailyCount >= MAX_DAILY_NUDGES) {
            skippedDailyLimit += userActions.length;
            continue;
          }

          let remaining = MAX_DAILY_NUDGES - dailyCount;

          for (const action of userActions) {
            if (remaining <= 0) {
              skippedDailyLimit++;
              continue;
            }

            try {
              const dueAtRaw = action.data.dueAt;
              const dueDate = typeof dueAtRaw === 'string'
                ? new Date(dueAtRaw)
                : dueAtRaw?.toDate?.() ?? new Date(dueAtRaw);

              if (isNaN(dueDate.getTime())) continue;

              const dueDateStr = dueDate.toISOString().slice(0, 10);

              // Calculate which phase this action is in
              const daysDiff = Math.round(
                (new Date(todayStr).getTime() - new Date(dueDateStr).getTime()) / (1000 * 60 * 60 * 24)
              );

              // Find matching reminder phase
              const matchedPhase = REMINDER_PHASES.find((p) => p.daysOffset === daysDiff);
              if (!matchedPhase) continue; // Not at a reminder boundary

              // Dedup: check if we already sent a nudge for this action + phase
              const dedupKey = `action_reminder_${action.id}_${matchedPhase.phase}`;
              const existingNudges = await firestore
                .collection('nudges')
                .where('userId', '==', userId)
                .where('type', '==', 'action_reminder')
                .where('sequenceId', '==', dedupKey)
                .where('status', 'in', ['pending', 'active', 'completed'])
                .limit(1)
                .get();

              if (!existingNudges.empty) {
                skippedAlreadyNudged++;
                continue;
              }

              // Build nudge content
              const actionType = action.data.type || null;
              const description = action.data.description || 'Follow-up item';
              const template = getNudgeTemplate(actionType, matchedPhase.phase);

              const title = formatTemplate(template.title, {
                date: dueDateStr,
                description,
              });
              const message = formatTemplate(template.message, {
                date: dueDateStr,
                description,
              });

              // Create the nudge
              await nudgeService.createRecord({
                userId,
                type: 'action_reminder',
                title,
                message,
                actionType: 'action_followup_response',
                scheduledFor: admin.firestore.Timestamp.now(),
                sequenceDay: 0,
                sequenceId: dedupKey,
                status: 'pending',
                visitId: action.data.visitId || null,
                context: {
                  actionId: action.id,
                  actionDescription: description,
                  actionType: actionType || undefined,
                  visitId: action.data.visitId || undefined,
                  trackingReason: 'to help you stay on top of your care plan',
                },
                metadata: {
                  actionId: action.id,
                  reminderPhase: matchedPhase.phase,
                  dueDate: dueDateStr,
                  daysOffset: matchedPhase.daysOffset,
                },
              });

              created++;
              remaining--;

              functions.logger.info(
                `[ActionReminder] Created ${matchedPhase.phase} nudge for action ${action.id}`,
                { userId, actionType, dueDate: dueDateStr },
              );
            } catch (actionError) {
              errors++;
              functions.logger.error(
                `[ActionReminder] Error processing action ${action.id}`,
                actionError,
              );
            }
          }
        } catch (userError) {
          errors++;
          functions.logger.error(
            `[ActionReminder] Error processing user ${userId}`,
            userError,
          );
        }
      }
    } catch (error) {
      functions.logger.error('[ActionReminder] Fatal error in nudge sweep', error);
    }

    functions.logger.info('[ActionReminder] Sweep complete', {
      created,
      skippedCompleted,
      skippedAlreadyNudged,
      skippedQuietHours,
      skippedDailyLimit,
      errors,
    });
  },
);
