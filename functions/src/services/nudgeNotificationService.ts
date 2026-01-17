/**
 * Nudge Notification Service
 * Processes due nudges and sends push notifications
 * 
 * Rate limiting:
 * - Max 3 nudges per user per day
 * - Follow-ups prioritized over check-ins
 * - Quiet hours: 9pm-8am in user's local time
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService, PushNotificationPayload } from './notifications';

const getDb = () => admin.firestore();
const getNudgesCollection = () => getDb().collection('nudges');
const getUsersCollection = () => getDb().collection('users');

// Max nudges to send per user per day
const MAX_DAILY_NUDGES = 3;

// Quiet hours config (in user's local time)
const QUIET_HOURS_START = 21; // 9pm
const QUIET_HOURS_END = 8;    // 8am
const DEFAULT_TIMEZONE = 'America/Chicago';
const LOCK_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface DueNudge {
    id: string;
    userId: string;
    title: string;
    message: string;
    medicationName?: string;
    conditionId?: string;
    actionType?: string;
    type?: string;
}

// Priority order for nudge types (higher = more important)
const NUDGE_TYPE_PRIORITY: Record<string, number> = {
    'follow_up': 3,
    'medication_checkin': 2,
    'condition_tracking': 1,
};

/**
 * Get user's timezone from their profile
 */
async function getUserTimezone(userId: string): Promise<string> {
    try {
        const userDoc = await getUsersCollection().doc(userId).get();
        if (userDoc.exists) {
            const timezone = userDoc.data()?.timezone;
            if (timezone && typeof timezone === 'string') {
                return timezone;
            }
        }
    } catch (error) {
        functions.logger.warn(`[NudgeNotifications] Could not fetch timezone for user ${userId}:`, error);
    }
    return DEFAULT_TIMEZONE;
}

/**
 * Check if it's currently quiet hours for a given timezone
 */
function isQuietHours(timezone: string): boolean {
    try {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
            hour: 'numeric',
            hour12: false,
            timeZone: timezone,
        };
        const localHour = parseInt(now.toLocaleTimeString('en-US', options), 10);

        // Quiet hours: 9pm (21) to 8am (8)
        // This means: hour >= 21 OR hour < 8
        return localHour >= QUIET_HOURS_START || localHour < QUIET_HOURS_END;
    } catch (error) {
        // Invalid timezone, default to not quiet hours
        functions.logger.warn(`[NudgeNotifications] Invalid timezone: ${timezone}`);
        return false;
    }
}

/**
 * Get count of nudges already sent to user today
 */
async function getDailyNudgeCount(userId: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const snapshot = await getNudgesCollection()
        .where('userId', '==', userId)
        .where('notificationSentAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
        .where('notificationSentAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
        .get();

    return snapshot.size;
}

/**
 * Sort nudges by priority (follow-ups first, then medication, then condition)
 */
function sortNudgesByPriority(nudges: DueNudge[]): DueNudge[] {
    return [...nudges].sort((a, b) => {
        const priorityA = NUDGE_TYPE_PRIORITY[a.type || ''] || 0;
        const priorityB = NUDGE_TYPE_PRIORITY[b.type || ''] || 0;
        return priorityB - priorityA;
    });
}

async function acquireNudgeSendLock(nudgeId: string, now: admin.firestore.Timestamp): Promise<boolean> {
    const nudgeRef = getNudgesCollection().doc(nudgeId);
    const lockUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + LOCK_WINDOW_MS);

    return getDb().runTransaction(async (tx) => {
        const snapshot = await tx.get(nudgeRef);
        if (!snapshot.exists) {
            return false;
        }

        const data = snapshot.data();
        if (data?.notificationSent === true) {
            return false;
        }

        const existingLock = data?.notificationLockUntil as admin.firestore.Timestamp | undefined;
        if (existingLock && existingLock.toMillis() > now.toMillis()) {
            return false;
        }

        tx.update(nudgeRef, {
            notificationLockUntil: lockUntil,
            notificationLockAt: now,
            updatedAt: now,
        });

        return true;
    });
}

/**
 * Process all due nudges and send push notifications
 * Called by Cloud Scheduler every 15 minutes
 */
export async function processAndNotifyDueNudges(): Promise<{
    processed: number;
    notified: number;
    errors: number;
    skippedDailyLimit: number;
    skippedQuietHours: number;
}> {
    const now = admin.firestore.Timestamp.now();
    const stats = { processed: 0, notified: 0, errors: 0, skippedDailyLimit: 0, skippedQuietHours: 0 };

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
                type: data.type as string | undefined,
            });
        });

        const notificationService = getNotificationService();
        const batch = getDb().batch();

        // Process each user's nudges
        for (const [userId, nudges] of nudgesByUser) {
            try {
                // Check quiet hours first
                const timezone = await getUserTimezone(userId);
                if (isQuietHours(timezone)) {
                    functions.logger.info(`[NudgeNotifications] User ${userId} in quiet hours (${timezone}), skipping ${nudges.length} nudges`);
                    stats.skippedQuietHours += nudges.length;
                    continue;
                }

                // Check daily limit
                const dailyCount = await getDailyNudgeCount(userId);
                const remaining = MAX_DAILY_NUDGES - dailyCount;

                if (remaining <= 0) {
                    functions.logger.info(`[NudgeNotifications] User ${userId} at daily limit, skipping ${nudges.length} nudges`);
                    // Mark as skipped but don't send - will retry tomorrow
                    stats.skippedDailyLimit += nudges.length;
                    continue;
                }

                // Sort by priority and take only up to remaining limit
                const sortedNudges = sortNudgesByPriority(nudges);
                const nudgesToSend = sortedNudges.slice(0, remaining);
                const nudgesToSkip = sortedNudges.slice(remaining);

                // Log skipped nudges
                if (nudgesToSkip.length > 0) {
                    functions.logger.info(`[NudgeNotifications] Skipping ${nudgesToSkip.length} lower-priority nudges for user ${userId} due to daily limit`);
                    stats.skippedDailyLimit += nudgesToSkip.length;
                }

                // Get user's push tokens
                const tokens = await notificationService.getUserPushTokens(userId);

                if (tokens.length === 0) {
                    functions.logger.info(`[NudgeNotifications] No push tokens for user ${userId}`);
                    // Still mark as processed, just not notified
                    for (const nudge of nudgesToSend) {
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
                for (const nudge of nudgesToSend) {
                    const lockAcquired = await acquireNudgeSendLock(nudge.id, now);
                    if (!lockAcquired) {
                        functions.logger.info(
                            `[NudgeNotifications] Skipping nudge ${nudge.id} - send lock not acquired`,
                        );
                        continue;
                    }

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
                        notificationLockUntil: admin.firestore.FieldValue.delete(),
                        notificationLockAt: admin.firestore.FieldValue.delete(),
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

