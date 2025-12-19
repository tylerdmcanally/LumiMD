/**
 * Nudge Notification Service
 * Processes due nudges and sends push notifications
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService, PushNotificationPayload } from './notifications';

const getDb = () => admin.firestore();
const getNudgesCollection = () => getDb().collection('nudges');

interface DueNudge {
    id: string;
    userId: string;
    title: string;
    message: string;
    medicationName?: string;
    conditionId?: string;
    actionType?: string;
}

/**
 * Process all due nudges and send push notifications
 * Called by Cloud Scheduler every 15 minutes
 */
export async function processAndNotifyDueNudges(): Promise<{
    processed: number;
    notified: number;
    errors: number;
}> {
    const now = admin.firestore.Timestamp.now();
    const stats = { processed: 0, notified: 0, errors: 0 };

    try {
        // Find nudges that are due and haven't been notified yet
        const dueNudgesQuery = await getNudgesCollection()
            .where('status', '==', 'pending')
            .where('scheduledFor', '<=', now)
            .where('notificationSent', '==', false)
            .limit(100) // Process in batches
            .get();

        if (dueNudgesQuery.empty) {
            functions.logger.info('[NudgeNotifications] No due nudges to process');
            return stats;
        }

        functions.logger.info(`[NudgeNotifications] Found ${dueNudgesQuery.docs.length} due nudges`);

        // Group by userId for efficient token fetching
        const nudgesByUser = new Map<string, DueNudge[]>();

        dueNudgesQuery.docs.forEach(doc => {
            const data = doc.data();
            const userId = data.userId as string;

            if (!nudgesByUser.has(userId)) {
                nudgesByUser.set(userId, []);
            }

            nudgesByUser.get(userId)!.push({
                id: doc.id,
                userId,
                title: data.title as string,
                message: data.message as string,
                medicationName: data.medicationName as string | undefined,
                conditionId: data.conditionId as string | undefined,
                actionType: data.actionType as string | undefined,
            });
        });

        const notificationService = getNotificationService();
        const batch = getDb().batch();

        // Process each user's nudges
        for (const [userId, nudges] of nudgesByUser) {
            try {
                // Get user's push tokens
                const tokens = await notificationService.getUserPushTokens(userId);

                if (tokens.length === 0) {
                    functions.logger.info(`[NudgeNotifications] No push tokens for user ${userId}`);
                    // Still mark as processed, just not notified
                    for (const nudge of nudges) {
                        batch.update(getNudgesCollection().doc(nudge.id), {
                            notificationSent: true,
                            notificationSkipped: 'no_push_tokens',
                            updatedAt: now,
                        });
                        stats.processed++;
                    }
                    continue;
                }

                // Send notification for each nudge
                for (const nudge of nudges) {
                    const payloads: PushNotificationPayload[] = tokens.map(({ token }) => ({
                        to: token,
                        title: nudge.title,
                        body: nudge.message,
                        data: {
                            type: 'nudge',
                            nudgeId: nudge.id,
                            actionType: nudge.actionType,
                        },
                        sound: 'default',
                        priority: 'high',
                    }));

                    const responses = await notificationService.sendNotifications(payloads);
                    const successCount = responses.filter(r => r.status === 'ok').length;

                    // Handle invalid tokens
                    responses.forEach((response, index) => {
                        if (response.details?.error === 'DeviceNotRegistered') {
                            void notificationService.removeInvalidToken(userId, tokens[index].token);
                        }
                    });

                    // Mark nudge as notified
                    batch.update(getNudgesCollection().doc(nudge.id), {
                        notificationSent: true,
                        notificationSentAt: now,
                        updatedAt: now,
                    });

                    stats.processed++;
                    if (successCount > 0) {
                        stats.notified++;
                    }

                    functions.logger.info(`[NudgeNotifications] Sent notification for nudge ${nudge.id}`, {
                        userId,
                        title: nudge.title,
                        successCount,
                        totalTokens: tokens.length,
                    });
                }
            } catch (userError) {
                functions.logger.error(`[NudgeNotifications] Error processing user ${userId}:`, userError);
                stats.errors++;
            }
        }

        // Commit all updates
        await batch.commit();

        functions.logger.info('[NudgeNotifications] Processing complete', stats);
        return stats;

    } catch (error) {
        functions.logger.error('[NudgeNotifications] Error processing due nudges:', error);
        throw error;
    }
}

/**
 * Also process nudges where notificationSent field doesn't exist yet (legacy)
 * Run this once or include in main processor
 */
export async function backfillNotificationSentField(): Promise<number> {
    const snapshot = await getNudgesCollection()
        .where('status', '==', 'pending')
        .get();

    const batch = getDb().batch();
    let updated = 0;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.notificationSent === undefined) {
            batch.update(doc.ref, { notificationSent: false });
            updated++;
        }
    });

    if (updated > 0) {
        await batch.commit();
        functions.logger.info(`[NudgeNotifications] Backfilled ${updated} nudges with notificationSent=false`);
    }

    return updated;
}
