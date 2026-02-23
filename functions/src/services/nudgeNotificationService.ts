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
import { NudgeDomainService } from './domain/nudges/NudgeDomainService';
import { FirestoreNudgeRepository } from './repositories/nudges/FirestoreNudgeRepository';
import { UserDomainService } from './domain/users/UserDomainService';
import { FirestoreUserRepository } from './repositories/users/FirestoreUserRepository';

const getDb = () => admin.firestore();

type NotificationServiceClient = Pick<
    ReturnType<typeof getNotificationService>,
    'getUserPushTokens' | 'sendNotifications' | 'removeInvalidToken'
>;

type NudgeNotificationDependencies = {
    nudgeService?: Pick<
        NudgeDomainService,
        | 'listDuePendingForNotification'
        | 'countByUserNotificationSentBetween'
        | 'acquireNotificationSendLock'
        | 'markNotificationProcessed'
        | 'backfillPendingNotificationSentField'
    >;
    userService?: Pick<UserDomainService, 'getById'>;
    notificationService?: NotificationServiceClient;
    nowTimestampProvider?: () => FirebaseFirestore.Timestamp;
};

function buildDefaultDependencies(): Required<NudgeNotificationDependencies> {
    const db = getDb();
    return {
        nudgeService: new NudgeDomainService(new FirestoreNudgeRepository(db)),
        userService: new UserDomainService(new FirestoreUserRepository(db)),
        notificationService: getNotificationService(),
        nowTimestampProvider: () => admin.firestore.Timestamp.now(),
    };
}

function resolveDependencies(
    overrides: NudgeNotificationDependencies,
): Required<NudgeNotificationDependencies> {
    const defaults = buildDefaultDependencies();
    return {
        nudgeService: overrides.nudgeService ?? defaults.nudgeService,
        userService: overrides.userService ?? defaults.userService,
        notificationService: overrides.notificationService ?? defaults.notificationService,
        nowTimestampProvider: overrides.nowTimestampProvider ?? defaults.nowTimestampProvider,
    };
}

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
export const NUDGE_TYPE_PRIORITY: Record<string, number> = {
    // Keep both keys for compatibility with legacy/variant producers.
    'followup': 3,
    'follow_up': 3,
    'medication_checkin': 2,
    'condition_tracking': 1,
};

/**
 * Get user's timezone from their profile
 */
async function getUserTimezone(
    userId: string,
    dependencies: Required<NudgeNotificationDependencies>,
): Promise<string> {
    try {
        const user = await dependencies.userService.getById(userId);
        const timezone = user?.timezone;
        if (typeof timezone === 'string' && timezone.length > 0) {
            return timezone;
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
async function getDailyNudgeCount(
    userId: string,
    dependencies: Required<NudgeNotificationDependencies>,
): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const nudgeService = dependencies.nudgeService;
    return nudgeService.countByUserNotificationSentBetween(
        userId,
        admin.firestore.Timestamp.fromDate(startOfDay),
        admin.firestore.Timestamp.fromDate(endOfDay),
    );
}

/**
 * Sort nudges by priority (follow-ups first, then medication, then condition)
 */
export function sortNudgesByPriority(nudges: DueNudge[]): DueNudge[] {
    return [...nudges].sort((a, b) => {
        const priorityA = NUDGE_TYPE_PRIORITY[a.type || ''] || 0;
        const priorityB = NUDGE_TYPE_PRIORITY[b.type || ''] || 0;
        return priorityB - priorityA;
    });
}

/**
 * Process all due nudges and send push notifications
 * Called by Cloud Scheduler every 15 minutes
 */
export async function processAndNotifyDueNudges(
    dependencyOverrides: NudgeNotificationDependencies = {},
): Promise<{
    processed: number;
    notified: number;
    errors: number;
    skippedDailyLimit: number;
    skippedQuietHours: number;
}> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const now = dependencies.nowTimestampProvider();
    const nudgeService = dependencies.nudgeService;
    const stats = { processed: 0, notified: 0, errors: 0, skippedDailyLimit: 0, skippedQuietHours: 0 };

    try {
        // Find nudges that are due and haven't been notified yet
        const dueNudges = await nudgeService.listDuePendingForNotification(now, 100);

        if (dueNudges.length === 0) {
            functions.logger.info('[NudgeNotifications] No due nudges to process');
            return stats;
        }

        functions.logger.info(`[NudgeNotifications] Found ${dueNudges.length} due nudges`);

        // Group by userId for efficient token fetching
        const nudgesByUser = new Map<string, DueNudge[]>();

        dueNudges.forEach((nudge) => {
            const data = nudge;
            const userId = data.userId as string;

            if (!nudgesByUser.has(userId)) {
                nudgesByUser.set(userId, []);
            }

            nudgesByUser.get(userId)!.push({
                id: data.id,
                userId,
                title: data.title as string,
                message: data.message as string,
                medicationName: data.medicationName as string | undefined,
                conditionId: data.conditionId as string | undefined,
                actionType: data.actionType as string | undefined,
                type: data.type as string | undefined,
            });
        });

        const notificationService = dependencies.notificationService;
        // Process each user's nudges
        for (const [userId, nudges] of nudgesByUser) {
            try {
                // Check quiet hours first
                const timezone = await getUserTimezone(userId, dependencies);
                if (isQuietHours(timezone)) {
                    functions.logger.info(`[NudgeNotifications] User ${userId} in quiet hours (${timezone}), skipping ${nudges.length} nudges`);
                    stats.skippedQuietHours += nudges.length;
                    continue;
                }

                // Check daily limit
                const dailyCount = await getDailyNudgeCount(userId, dependencies);
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
                        await nudgeService.markNotificationProcessed(nudge.id, {
                            now,
                            skippedReason: 'no_push_tokens',
                        });
                        stats.processed++;
                    }
                    continue;
                }

                // Send notification for each nudge
                for (const nudge of nudgesToSend) {
                    const lockAcquired = await nudgeService.acquireNotificationSendLock(
                        nudge.id,
                        now,
                        LOCK_WINDOW_MS,
                    );
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

                    await nudgeService.markNotificationProcessed(nudge.id, {
                        now,
                        sentAt: now,
                        clearLock: true,
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
export async function backfillNotificationSentField(
    dependencyOverrides: NudgeNotificationDependencies = {},
): Promise<number> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const nudgeService = dependencies.nudgeService;
    const updated = await nudgeService.backfillPendingNotificationSentField();
    if (updated > 0) {
        functions.logger.info(`[NudgeNotifications] Backfilled ${updated} nudges with notificationSent=false`);
    }

    return updated;
}
