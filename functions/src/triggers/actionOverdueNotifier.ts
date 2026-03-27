import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService } from '../services/notifications';

const db = () => admin.firestore();

/** Days overdue thresholds for caregiver push notifications. */
const NOTIFY_AT_DAYS_OVERDUE = [3, 7];

/**
 * Action Overdue Notifier
 *
 * Runs daily at 10:00 AM UTC. Finds overdue, incomplete, non-deleted action
 * items for patients with active caregiver shares. Sends push notifications
 * at 3 days overdue (first alert) and 7 days overdue (escalation).
 *
 * Dedup via `caregiverNotifications` array on action document — each
 * caregiver + daysOverdue combination is tracked to prevent repeats.
 */
export const processActionOverdueNotifier = onSchedule(
  {
    region: 'us-central1',
    schedule: '0 10 * * *', // Daily at 10:00 AM UTC
    timeZone: 'Etc/UTC',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async () => {
    functions.logger.info('[ActionOverdue] Starting overdue action notifier');

    const firestore = db();
    const notificationService = getNotificationService();

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let notified = 0;
    let skippedAlreadyNotified = 0;
    let skippedNoShares = 0;
    let errors = 0;

    try {
      // 1. Get all pending, non-deleted action items
      const actionsSnapshot = await firestore
        .collection('actions')
        .where('completed', '==', false)
        .where('deletedAt', '==', null)
        .get();

      // Filter to overdue items (3+ days overdue)
      const overdueActions: Array<{
        id: string;
        data: FirebaseFirestore.DocumentData;
        daysOverdue: number;
      }> = [];

      for (const doc of actionsSnapshot.docs) {
        const data = doc.data();
        if (!data.dueAt) continue;

        const dueDate = typeof data.dueAt === 'string'
          ? new Date(data.dueAt)
          : data.dueAt.toDate?.() ?? new Date(data.dueAt);

        if (isNaN(dueDate.getTime())) continue;

        const dueDateStr = dueDate.toISOString().slice(0, 10);
        const daysOverdue = Math.round(
          (new Date(todayStr).getTime() - new Date(dueDateStr).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Only process if at a notification threshold
        if (NOTIFY_AT_DAYS_OVERDUE.includes(daysOverdue)) {
          overdueActions.push({ id: doc.id, data, daysOverdue });
        }
      }

      if (overdueActions.length === 0) {
        functions.logger.info('[ActionOverdue] No actions at notification thresholds');
        return;
      }

      functions.logger.info(
        `[ActionOverdue] Found ${overdueActions.length} actions at notification thresholds`,
      );

      // 2. Group by userId
      const byUser = new Map<string, typeof overdueActions>();
      for (const action of overdueActions) {
        const userId = action.data.userId;
        if (!userId) continue;
        const arr = byUser.get(userId) || [];
        arr.push(action);
        byUser.set(userId, arr);
      }

      // 3. Process each user's overdue actions
      for (const [patientId, userActions] of byUser) {
        try {
          // Find active caregiver shares for this patient
          const sharesSnapshot = await firestore
            .collection('shares')
            .where('ownerId', '==', patientId)
            .where('status', '==', 'accepted')
            .get();

          if (sharesSnapshot.empty) {
            skippedNoShares += userActions.length;
            continue;
          }

          // Get patient name for notification content
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

          for (const action of userActions) {
            const existingNotifications = Array.isArray(action.data.caregiverNotifications)
              ? action.data.caregiverNotifications
              : [];

            for (const shareDoc of sharesSnapshot.docs) {
              const shareData = shareDoc.data();
              const caregiverId = shareData.caregiverUserId;
              if (!caregiverId) continue;

              // Dedup: check if we already notified this caregiver at this threshold
              const alreadyNotified = existingNotifications.some(
                (n: any) => n.caregiverId === caregiverId && n.daysOverdue === action.daysOverdue,
              );

              if (alreadyNotified) {
                skippedAlreadyNotified++;
                continue;
              }

              try {
                // Get caregiver's push tokens
                const tokens = await notificationService.getUserPushTokens(caregiverId);

                if (tokens.length === 0) continue;

                // Build notification
                const description = action.data.description || 'Follow-up item';
                const isEscalation = action.daysOverdue >= 7;
                const title = isEscalation
                  ? `${patientName}'s follow-up is ${action.daysOverdue} days overdue`
                  : `${patientName} has an overdue follow-up`;
                const body = isEscalation
                  ? `"${description}" is now ${action.daysOverdue} days overdue. This may need your attention.`
                  : `"${description}" is ${action.daysOverdue} days overdue.`;

                // Send push to all caregiver devices
                const payloads = tokens.map(({ token }) => ({
                  to: token,
                  title,
                  body,
                  data: {
                    type: 'overdue_action' as const,
                    actionId: action.id,
                    patientId,
                    daysOverdue: String(action.daysOverdue),
                  },
                  sound: 'default' as const,
                  priority: 'default' as const,
                }));
                await notificationService.sendNotifications(payloads);

                // Record notification in action document
                existingNotifications.push({
                  caregiverId,
                  notifiedAt: new Date().toISOString(),
                  daysOverdue: action.daysOverdue,
                });

                notified++;

                functions.logger.info(
                  `[ActionOverdue] Notified caregiver ${caregiverId} about action ${action.id}`,
                  { daysOverdue: action.daysOverdue, patientId },
                );
              } catch (notifyError) {
                errors++;
                functions.logger.error(
                  `[ActionOverdue] Error notifying caregiver ${caregiverId}`,
                  notifyError,
                );
              }
            }

            // Update the action document with notification records
            if (existingNotifications.length > 0) {
              await firestore.collection('actions').doc(action.id).update({
                caregiverNotifications: existingNotifications,
                updatedAt: admin.firestore.Timestamp.now(),
              });
            }
          }
        } catch (userError) {
          errors++;
          functions.logger.error(
            `[ActionOverdue] Error processing patient ${patientId}`,
            userError,
          );
        }
      }
    } catch (error) {
      functions.logger.error('[ActionOverdue] Fatal error in notifier', error);
    }

    functions.logger.info('[ActionOverdue] Notifier complete', {
      notified,
      skippedAlreadyNotified,
      skippedNoShares,
      errors,
    });
  },
);
