import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService } from '../services/notifications';

const db = () => admin.firestore();

/**
 * Caregiver Alerts Trigger
 *
 * Runs every 15 minutes. Detects two alert types:
 *
 * 1. **Missed medications** — Finds medication reminders that were sent 2-4 hours
 *    ago with no corresponding medicationLog. Groups multiple missed meds per
 *    patient into a single notification to avoid spam.
 *
 * 2. **Newly completed visits** — Finds visits that transitioned to `completed`
 *    in the last 15 minutes and notifies caregivers.
 *
 * Dedup: `caregiverNotifications[]` array on the source document (reminder or
 * visit), following the same pattern as `actionOverdueNotifier.ts`.
 */
export const processCaregiverAlerts = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 15 minutes',
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[CaregiverAlerts] Starting caregiver alerts processor');

    const firestore = db();
    const notificationService = getNotificationService();

    let missedMedNotifications = 0;
    let visitReadyNotifications = 0;
    let skippedDedup = 0;
    let skippedNoShares = 0;
    let errors = 0;

    const now = new Date();

    // Cache caregiver profiles to avoid redundant reads across both alert sections
    const caregiverProfileCache = new Map<string, FirebaseFirestore.DocumentData | null>();

    async function getCaregiverProfile(caregiverId: string): Promise<FirebaseFirestore.DocumentData | null> {
      if (caregiverProfileCache.has(caregiverId)) return caregiverProfileCache.get(caregiverId) ?? null;
      try {
        const doc = await firestore.collection('users').doc(caregiverId).get();
        const data = doc.data() ?? null;
        caregiverProfileCache.set(caregiverId, data);
        return data;
      } catch {
        caregiverProfileCache.set(caregiverId, null);
        return null;
      }
    }

    try {
      // -----------------------------------------------------------------------
      // 1. Missed Medication Alerts
      // -----------------------------------------------------------------------
      // Find medication reminders sent 2-4 hours ago
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      const remindersSnapshot = await firestore
        .collection('medicationReminders')
        .where('deletedAt', '==', null)
        .where('lastNotifiedAt', '>=', admin.firestore.Timestamp.fromDate(fourHoursAgo))
        .where('lastNotifiedAt', '<=', admin.firestore.Timestamp.fromDate(twoHoursAgo))
        .get();

      // Group reminders by patient (userId) to batch notifications
      const remindersByPatient = new Map<
        string,
        Array<{ id: string; data: FirebaseFirestore.DocumentData }>
      >();

      for (const doc of remindersSnapshot.docs) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId) continue;

        // Check if a medicationLog exists for this reminder since it was sent
        const medicationId = data.medicationId;
        if (!medicationId) continue;

        const lastNotifiedAt = data.lastNotifiedAt?.toDate?.() ?? new Date(data.lastNotifiedAt);
        if (isNaN(lastNotifiedAt.getTime())) continue;

        const logsSnapshot = await firestore
          .collection('medicationLogs')
          .where('userId', '==', userId)
          .where('medicationId', '==', medicationId)
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(lastNotifiedAt))
          .limit(1)
          .get();

        if (!logsSnapshot.empty) {
          // Medication was logged — not missed
          continue;
        }

        const arr = remindersByPatient.get(userId) || [];
        arr.push({ id: doc.id, data });
        remindersByPatient.set(userId, arr);
      }

      // Send batched missed-med notifications per patient
      for (const [patientId, reminders] of remindersByPatient) {
        try {
          // Find active caregiver shares
          const sharesSnapshot = await firestore
            .collection('shares')
            .where('ownerId', '==', patientId)
            .where('status', '==', 'accepted')
            .get();

          if (sharesSnapshot.empty) {
            skippedNoShares += reminders.length;
            continue;
          }

          // Get patient name
          const patientName = await getPatientName(firestore, patientId);

          // Get medication names for the notification body
          const medNames: string[] = [];
          for (const reminder of reminders) {
            const medName = reminder.data.medicationName || reminder.data.name;
            if (medName) medNames.push(medName);
          }

          for (const shareDoc of sharesSnapshot.docs) {
            const caregiverId = shareDoc.data().caregiverId;
            if (!caregiverId) continue;

            // Respect caregiver alertPreferences (default true for backwards compatibility)
            const cgProfile = await getCaregiverProfile(caregiverId);
            if (cgProfile?.alertPreferences?.missedMedications === false) continue;

            // Dedup: check all reminders against this caregiver
            const remindersToNotify = reminders.filter((r) => {
              const existing = Array.isArray(r.data.caregiverNotifications)
                ? r.data.caregiverNotifications
                : [];
              return !existing.some(
                (n: any) => n.caregiverId === caregiverId && n.type === 'missed_medication',
              );
            });

            if (remindersToNotify.length === 0) {
              skippedDedup++;
              continue;
            }

            // Get caregiver push tokens
            const tokens = await notificationService.getUserPushTokens(caregiverId);
            if (tokens.length === 0) continue;

            // Build batched notification
            const title =
              remindersToNotify.length === 1
                ? `${patientName} may have missed a dose`
                : `${patientName} may have missed ${remindersToNotify.length} doses`;
            const body =
              medNames.length > 0
                ? medNames.slice(0, 3).join(', ') +
                  (medNames.length > 3 ? ` and ${medNames.length - 3} more` : '')
                : 'Check their medication schedule';

            const payloads = tokens.map(({ token }) => ({
              to: token,
              title,
              body,
              data: {
                type: 'missed_medication_caregiver' as const,
                patientId,
              },
              sound: 'default' as const,
              priority: 'high' as const,
            }));

            await notificationService.sendNotifications(payloads);
            missedMedNotifications++;

            // Record dedup on each reminder
            for (const reminder of remindersToNotify) {
              const existing = Array.isArray(reminder.data.caregiverNotifications)
                ? [...reminder.data.caregiverNotifications]
                : [];
              existing.push({
                caregiverId,
                type: 'missed_medication',
                notifiedAt: new Date().toISOString(),
              });
              await firestore
                .collection('medicationReminders')
                .doc(reminder.id)
                .update({
                  caregiverNotifications: existing,
                  updatedAt: admin.firestore.Timestamp.now(),
                });
            }

            functions.logger.info(
              `[CaregiverAlerts] Notified caregiver ${caregiverId} about ${remindersToNotify.length} missed meds for patient ${patientId}`,
            );
          }
        } catch (patientError) {
          errors++;
          functions.logger.error(
            `[CaregiverAlerts] Error processing missed meds for patient ${patientId}`,
            patientError,
          );
        }
      }

      // -----------------------------------------------------------------------
      // 2. Visit Ready Alerts
      // -----------------------------------------------------------------------
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

      const visitsSnapshot = await firestore
        .collection('visits')
        .where('processingStatus', '==', 'completed')
        .where('deletedAt', '==', null)
        .where('completedAt', '>=', admin.firestore.Timestamp.fromDate(fifteenMinutesAgo))
        .get();

      for (const visitDoc of visitsSnapshot.docs) {
        const visitData = visitDoc.data();
        const patientId = visitData.userId;
        if (!patientId) continue;

        try {
          // Dedup
          const existingNotifications = Array.isArray(visitData.caregiverNotifications)
            ? visitData.caregiverNotifications
            : [];

          // Find caregivers
          const sharesSnapshot = await firestore
            .collection('shares')
            .where('ownerId', '==', patientId)
            .where('status', '==', 'accepted')
            .get();

          if (sharesSnapshot.empty) {
            skippedNoShares++;
            continue;
          }

          const patientName = await getPatientName(firestore, patientId);

          for (const shareDoc of sharesSnapshot.docs) {
            const caregiverId = shareDoc.data().caregiverId;
            if (!caregiverId) continue;

            // Respect caregiver alertPreferences (default true for backwards compatibility)
            const cgProfile = await getCaregiverProfile(caregiverId);
            if (cgProfile?.alertPreferences?.visitReady === false) continue;

            // Dedup check
            const alreadyNotified = existingNotifications.some(
              (n: any) => n.caregiverId === caregiverId && n.type === 'visit_ready',
            );
            if (alreadyNotified) {
              skippedDedup++;
              continue;
            }

            const tokens = await notificationService.getUserPushTokens(caregiverId);
            if (tokens.length === 0) continue;

            const payloads = tokens.map(({ token }) => ({
              to: token,
              title: `${patientName}'s visit summary is ready`,
              body: 'Tap to review the visit details.',
              data: {
                type: 'visit_ready_caregiver' as const,
                patientId,
                visitId: visitDoc.id,
              },
              sound: 'default' as const,
              priority: 'default' as const,
            }));

            await notificationService.sendNotifications(payloads);
            visitReadyNotifications++;

            existingNotifications.push({
              caregiverId,
              type: 'visit_ready',
              notifiedAt: new Date().toISOString(),
            });

            functions.logger.info(
              `[CaregiverAlerts] Notified caregiver ${caregiverId} about visit ${visitDoc.id} for patient ${patientId}`,
            );
          }

          // Update visit document with dedup records
          if (existingNotifications.length > 0) {
            await firestore.collection('visits').doc(visitDoc.id).update({
              caregiverNotifications: existingNotifications,
              updatedAt: admin.firestore.Timestamp.now(),
            });
          }
        } catch (visitError) {
          errors++;
          functions.logger.error(
            `[CaregiverAlerts] Error processing visit ${visitDoc.id}`,
            visitError,
          );
        }
      }
    } catch (error) {
      functions.logger.error('[CaregiverAlerts] Fatal error', error);
    }

    functions.logger.info('[CaregiverAlerts] Complete', {
      missedMedNotifications,
      visitReadyNotifications,
      skippedDedup,
      skippedNoShares,
      errors,
    });
  },
);

/**
 * Get a patient's display name, with fallback.
 */
async function getPatientName(
  firestore: FirebaseFirestore.Firestore,
  patientId: string,
): Promise<string> {
  try {
    const userDoc = await firestore.collection('users').doc(patientId).get();
    const userData = userDoc.data();
    return userData?.preferredName || userData?.firstName || 'Your patient';
  } catch {
    return 'Your patient';
  }
}
