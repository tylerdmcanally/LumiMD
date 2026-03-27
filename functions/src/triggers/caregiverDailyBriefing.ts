import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService } from '../services/notifications';

const db = () => admin.firestore();

const DEFAULT_BRIEFING_HOUR = 8;
const DEFAULT_TIMEZONE = 'America/Chicago';

/**
 * Caregiver Daily Briefing
 *
 * Runs every hour. For each caregiver with accepted shares, checks if the
 * current hour in their timezone matches their preferred briefing hour.
 * Sends a push notification summarizing their patients' medication status
 * and overdue actions.
 *
 * Dedup: writes `briefings/{caregiverId}/{YYYY-MM-DD}` to prevent
 * double-sends if the trigger fires twice in the same hour.
 */
export const processCaregiverDailyBriefing = onSchedule(
  {
    region: 'us-central1',
    schedule: '0 * * * *', // Every hour on the hour
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[DailyBriefing] Starting caregiver daily briefing processor');

    const firestore = db();
    const notificationService = getNotificationService();

    let sent = 0;
    let skippedWrongHour = 0;
    let skippedDedup = 0;
    let skippedNoTokens = 0;
    let errors = 0;

    try {
      // 1. Find all accepted shares and group by caregiver
      const sharesSnapshot = await firestore
        .collection('shares')
        .where('status', '==', 'accepted')
        .get();

      if (sharesSnapshot.empty) {
        functions.logger.info('[DailyBriefing] No accepted shares found');
        return;
      }

      const caregiverPatients = new Map<string, string[]>();
      for (const doc of sharesSnapshot.docs) {
        const data = doc.data();
        const caregiverId = data.caregiverUserId;
        const ownerId = data.ownerId;
        if (!caregiverId || !ownerId) continue;

        const existing = caregiverPatients.get(caregiverId) || [];
        existing.push(ownerId);
        caregiverPatients.set(caregiverId, existing);
      }

      functions.logger.info(
        `[DailyBriefing] Found ${caregiverPatients.size} caregivers with accepted shares`,
      );

      const nowUtc = new Date();

      // 2. Process each caregiver
      for (const [caregiverId, patientIds] of caregiverPatients) {
        try {
          // Resolve caregiver's timezone and preferred briefing hour
          let timezone = DEFAULT_TIMEZONE;
          let briefingHour = DEFAULT_BRIEFING_HOUR;
          let caregiverName = '';

          try {
            const userDoc = await firestore.collection('users').doc(caregiverId).get();
            const userData = userDoc.data();
            if (userData?.timezone) timezone = userData.timezone;
            if (typeof userData?.briefingHour === 'number') briefingHour = userData.briefingHour;
            caregiverName = userData?.preferredName || userData?.firstName || '';

            // Respect briefingEnabled preference (default true for backwards compatibility)
            if (userData?.briefingEnabled === false) {
              skippedWrongHour++;
              continue;
            }
          } catch {
            // Use defaults
          }

          // Check if current hour in caregiver's timezone matches briefing hour
          const caregiverHour = getCurrentHourInTimezone(nowUtc, timezone);
          if (caregiverHour !== briefingHour) {
            skippedWrongHour++;
            continue;
          }

          // Dedup: check if already sent today
          const todayStr = getDateStringInTimezone(nowUtc, timezone);
          const dedupRef = firestore
            .collection('briefings')
            .doc(caregiverId)
            .collection('daily')
            .doc(todayStr);

          const dedupDoc = await dedupRef.get();
          if (dedupDoc.exists) {
            skippedDedup++;
            continue;
          }

          // Get caregiver's push tokens
          const tokens = await notificationService.getUserPushTokens(caregiverId);
          if (tokens.length === 0) {
            skippedNoTokens++;
            continue;
          }

          // Aggregate patient data
          const patientSummaries: string[] = [];
          for (const patientId of patientIds) {
            try {
              const summary = await aggregatePatientStatus(firestore, patientId);
              patientSummaries.push(summary);
            } catch (err) {
              functions.logger.warn(
                `[DailyBriefing] Error aggregating patient ${patientId}`,
                err,
              );
              // Skip this patient but continue with others
            }
          }

          if (patientSummaries.length === 0) {
            continue;
          }

          // Build notification
          const greeting = caregiverName ? `Good morning, ${caregiverName}` : 'Good morning';
          const body = patientSummaries.join(' ').slice(0, 150);

          // Send to all devices
          const payloads = tokens.map(({ token }) => ({
            to: token,
            title: greeting,
            body,
            data: {
              type: 'daily_briefing' as const,
            },
            sound: 'default' as const,
            priority: 'default' as const,
          }));

          await notificationService.sendNotifications(payloads);

          // Write dedup doc
          await dedupRef.set({
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            patientCount: patientIds.length,
          });

          sent++;
          functions.logger.info(
            `[DailyBriefing] Sent briefing to caregiver ${caregiverId}`,
            { patientCount: patientIds.length },
          );
        } catch (caregiverError) {
          errors++;
          functions.logger.error(
            `[DailyBriefing] Error processing caregiver ${caregiverId}`,
            caregiverError,
          );
        }
      }
    } catch (error) {
      functions.logger.error('[DailyBriefing] Fatal error', error);
    }

    functions.logger.info('[DailyBriefing] Complete', {
      sent,
      skippedWrongHour,
      skippedDedup,
      skippedNoTokens,
      errors,
    });
  },
);

/**
 * Get the current hour (0-23) in a given IANA timezone.
 */
function getCurrentHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    const hour = parseInt(hourPart?.value ?? '0', 10);
    // Intl may return 24 for midnight in some locales
    return hour === 24 ? 0 : hour;
  } catch {
    // Invalid timezone — fall back to UTC
    return date.getUTCHours();
  }
}

/**
 * Get the current date string (YYYY-MM-DD) in a given IANA timezone.
 */
function getDateStringInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // en-CA gives YYYY-MM-DD
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Aggregate a patient's medication status and overdue actions for the briefing.
 * Returns a short summary string like "Mom took 3/4 meds."
 */
async function aggregatePatientStatus(
  firestore: FirebaseFirestore.Firestore,
  patientId: string,
): Promise<string> {
  // Get patient name
  let patientName = 'Your patient';
  try {
    const userDoc = await firestore.collection('users').doc(patientId).get();
    const userData = userDoc.data();
    if (userData?.preferredName || userData?.firstName) {
      patientName = userData.preferredName || userData.firstName;
    }
  } catch {
    // Use default
  }

  // Count today's medication logs
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const medsSnapshot = await firestore
    .collection('medications')
    .where('userId', '==', patientId)
    .where('deletedAt', '==', null)
    .where('status', '==', 'active')
    .get();

  const totalMeds = medsSnapshot.size;

  let takenCount = 0;
  if (totalMeds > 0) {
    const logsSnapshot = await firestore
      .collection('medicationLogs')
      .where('userId', '==', patientId)
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .where('action', '==', 'taken')
      .get();

    takenCount = logsSnapshot.size;
  }

  // Count overdue actions
  const todayStr = new Date().toISOString().slice(0, 10);
  const actionsSnapshot = await firestore
    .collection('actions')
    .where('userId', '==', patientId)
    .where('completed', '==', false)
    .where('deletedAt', '==', null)
    .get();

  let overdueCount = 0;
  for (const doc of actionsSnapshot.docs) {
    const data = doc.data();
    if (!data.dueAt) continue;
    const dueDate = typeof data.dueAt === 'string'
      ? new Date(data.dueAt)
      : data.dueAt.toDate?.() ?? new Date(data.dueAt);
    if (isNaN(dueDate.getTime())) continue;
    const dueDateStr = dueDate.toISOString().slice(0, 10);
    if (dueDateStr < todayStr) {
      overdueCount++;
    }
  }

  // Build summary
  const parts: string[] = [];
  if (totalMeds > 0) {
    parts.push(`${patientName} took ${takenCount}/${totalMeds} meds`);
  }
  if (overdueCount > 0) {
    parts.push(`${overdueCount} overdue action${overdueCount > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return `${patientName}: all clear.`;
  }

  return `${parts.join('. ')}.`;
}
