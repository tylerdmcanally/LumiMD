/**
 * Medication Reminder Notification Service
 * 
 * Processes due medication reminders and sends push notifications.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService, PushNotificationPayload } from './notifications';

const getDb = () => admin.firestore();
const getRemindersCollection = () => getDb().collection('medicationReminders');
const getMedicationsCollection = () => getDb().collection('medications');
const getUsersCollection = () => getDb().collection('users');


const DEFAULT_TIMEZONE = 'America/Chicago';
const LOCK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface MedicationReminderDoc {
    userId: string;
    medicationId: string;
    medicationName: string;
    medicationDose?: string;
    times: string[];
    enabled: boolean;
    lastSentAt?: admin.firestore.Timestamp;
    lastSentLockUntil?: admin.firestore.Timestamp;
    lastSentLockAt?: admin.firestore.Timestamp;
}

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
        functions.logger.warn(`[MedReminders] Could not fetch timezone for user ${userId}:`, error);
    }
    return DEFAULT_TIMEZONE;
}

/**
 * Get current time in HH:MM format (24hr) for a given timezone
 */
function getCurrentTimeHHMM(timezone: string = DEFAULT_TIMEZONE): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
    };
    return now.toLocaleTimeString('en-US', options);
}

function getDayBoundariesInTimezone(
    timezone: string,
): { startOfDay: Date; endOfDay: Date; todayStr: string } {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const [year, month, day] = todayStr.split('-').map(Number);
    const testUTC = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`
    );
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const tzParts = tzFormatter.formatToParts(testUTC);
    const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
    const tzMinute = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);
    const offsetMinutes = (tzHour - 12) * 60 + tzMinute;
    const midnightUTC = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`
    );
    const startOfDay = new Date(midnightUTC.getTime() - offsetMinutes * 60 * 1000);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { startOfDay, endOfDay, todayStr };
}

/**
 * Check if a reminder time is within the processing window (±7 minutes)
 */
function isTimeWithinWindow(reminderTime: string, currentTime: string): boolean {
    const [reminderHour, reminderMin] = reminderTime.split(':').map(Number);
    const [currentHour, currentMin] = currentTime.split(':').map(Number);

    const reminderMinutes = reminderHour * 60 + reminderMin;
    const currentMinutes = currentHour * 60 + currentMin;

    const diff = Math.abs(reminderMinutes - currentMinutes);
    // Handle midnight wrap
    const adjustedDiff = Math.min(diff, 1440 - diff);

    return adjustedDiff <= 7; // 7-minute window
}

/**
 * Check if reminder was already sent recently (within 30 minutes)
 */
function wasRecentlySent(lastSentAt: admin.firestore.Timestamp | undefined): boolean {
    if (!lastSentAt) return false;

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return lastSentAt.toDate() > thirtyMinutesAgo;
}

async function acquireReminderSendLock(
    reminderId: string,
    now: admin.firestore.Timestamp,
): Promise<boolean> {
    const reminderRef = getRemindersCollection().doc(reminderId);
    const lockUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + LOCK_WINDOW_MS);

    return getDb().runTransaction(async (tx) => {
        const snapshot = await tx.get(reminderRef);
        if (!snapshot.exists) {
            return false;
        }

        const data = snapshot.data() as MedicationReminderDoc | undefined;
        const existingLock = data?.lastSentLockUntil as admin.firestore.Timestamp | undefined;
        if (existingLock && existingLock.toMillis() > now.toMillis()) {
            return false;
        }

        tx.update(reminderRef, {
            lastSentLockUntil: lockUntil,
            lastSentLockAt: now,
            updatedAt: now,
        });

        return true;
    });
}

/**
 * Process all due medication reminders and send notifications
 */
export async function processAndNotifyMedicationReminders(): Promise<{
    processed: number;
    sent: number;
    errors: number;
}> {
    const stats = { processed: 0, sent: 0, errors: 0 };

    functions.logger.info('[MedReminders] Starting notification processor');

    // Get all enabled reminders
    const remindersSnapshot = await getRemindersCollection()
        .where('enabled', '==', true)
        .get();

    if (remindersSnapshot.empty) {
        functions.logger.info('[MedReminders] No enabled reminders found');
        return stats;
    }

    const notificationService = getNotificationService();
    const batch = getDb().batch();
    const now = admin.firestore.Timestamp.now();

    // Group due reminders by user (and by matched time)
    const remindersByUser = new Map<string, Array<{
        id: string;
        medicationName: string;
        medicationDose?: string;
        medicationId: string;
        matchedTime: string;
    }>>();

    // Cache user timezones to avoid repeated Firestore calls
    const userTimezoneCache = new Map<string, string>();

    for (const doc of remindersSnapshot.docs) {
        const reminder = doc.data() as MedicationReminderDoc;

        // Get user's timezone (cached)
        let userTimezone = userTimezoneCache.get(reminder.userId);
        if (!userTimezone) {
            userTimezone = await getUserTimezone(reminder.userId);
            userTimezoneCache.set(reminder.userId, userTimezone);
        }

        // Get current time in user's timezone
        const currentTime = getCurrentTimeHHMM(userTimezone);

        // Log all reminders and their times for debugging
        functions.logger.info(`[MedReminders] Checking reminder ${doc.id}`, {
            medication: reminder.medicationName,
            times: reminder.times,
            currentTime,
            userTimezone,
            lastSentAt: reminder.lastSentAt?.toDate?.()?.toISOString() || 'never',
        });

        // Check if any reminder time matches current window
        const matchingTime = reminder.times.find(time => isTimeWithinWindow(time, currentTime));
        if (!matchingTime) {
            functions.logger.debug(`[MedReminders] No matching time for ${doc.id} - times: ${reminder.times.join(', ')}`);
            continue;
        }

        // Skip if recently sent
        if (wasRecentlySent(reminder.lastSentAt)) {
            functions.logger.info(`[MedReminders] Skipping ${doc.id} - recently sent at ${reminder.lastSentAt?.toDate?.()?.toISOString()}`);
            continue;
        }

        // Verify medication is still active - defense against orphaned reminders
        try {
            const medDoc = await getMedicationsCollection().doc(reminder.medicationId).get();
            if (!medDoc.exists || medDoc.get('active') === false) {
                // Orphaned reminder - medication was discontinued or deleted
                functions.logger.warn(`[MedReminders] Deleting orphaned reminder ${doc.id} - medication ${reminder.medicationName} is no longer active`);
                await doc.ref.delete();
                continue;
            }
        } catch (medCheckError) {
            functions.logger.error(`[MedReminders] Error checking medication status for ${doc.id}:`, medCheckError);
            // Continue anyway to avoid blocking all reminders on one error
        }

        if (!remindersByUser.has(reminder.userId)) {
            remindersByUser.set(reminder.userId, []);
        }

        remindersByUser.get(reminder.userId)!.push({
            id: doc.id,
            medicationName: reminder.medicationName,
            medicationDose: reminder.medicationDose,
            medicationId: reminder.medicationId,
            matchedTime: matchingTime,
        });
    }

    if (remindersByUser.size === 0) {
        functions.logger.info('[MedReminders] No reminders due at this time');
        return { processed: remindersSnapshot.size, sent: 0, errors: 0 };
    }

    // Process each user's reminders
    for (const [userId, reminders] of remindersByUser) {
        try {
            // Fetch today's logs for this user (used to suppress reminders already taken/skipped)
            let userTimezone = userTimezoneCache.get(userId);
            if (!userTimezone) {
                userTimezone = await getUserTimezone(userId);
                userTimezoneCache.set(userId, userTimezone);
            }
            const { startOfDay, endOfDay, todayStr } = getDayBoundariesInTimezone(userTimezone);
            const logsSnapshot = await getDb()
                .collection('medicationLogs')
                .where('userId', '==', userId)
                .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
                .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
                .get();
            const loggedDoseKeys = new Set<string>();
            logsSnapshot.docs.forEach((doc) => {
                const log = doc.data();
                if (log.action !== 'taken' && log.action !== 'skipped') return;
                const scheduledTime = log.scheduledTime;
                if (!scheduledTime) return;
                const logDateStr =
                    log.scheduledDate ||
                    (log.loggedAt?.toDate
                        ? log.loggedAt.toDate().toLocaleDateString('en-CA', { timeZone: userTimezone })
                        : null);
                if (logDateStr !== todayStr) return;
                loggedDoseKeys.add(`${log.medicationId}_${scheduledTime}`);
            });

            const tokens = await notificationService.getUserPushTokens(userId);

            // Log tokens for debugging
            functions.logger.info(`[MedReminders] User ${userId} has ${tokens.length} push tokens`, {
                tokens: tokens.map(t => ({
                    token: t.token.substring(0, 30) + '...',
                    platform: t.platform,
                    isExpoToken: t.token.startsWith('ExponentPushToken['),
                })),
            });

            if (tokens.length === 0) {
                functions.logger.info(`[MedReminders] No tokens for user ${userId} - skipping`);
                // Mark as processed but skipped
                for (const reminder of reminders) {
                    batch.update(getRemindersCollection().doc(reminder.id), { lastSentAt: now });
                }
                stats.processed += reminders.length;
                continue;
            }

            // Send notification for each due medication (skip if already logged today)
            for (const reminder of reminders) {
                if (loggedDoseKeys.has(`${reminder.medicationId}_${reminder.matchedTime}`)) {
                    functions.logger.info(
                        `[MedReminders] Skipping reminder ${reminder.id} - already logged for ${reminder.matchedTime}`,
                    );
                    stats.processed++;
                    continue;
                }

                const lockAcquired = await acquireReminderSendLock(reminder.id, now);
                if (!lockAcquired) {
                    functions.logger.info(
                        `[MedReminders] Skipping reminder ${reminder.id} - send lock not acquired`,
                    );
                    continue;
                }

                const doseText = reminder.medicationDose ? ` (${reminder.medicationDose})` : '';
                const notificationBody = `Time to take your ${reminder.medicationName}${doseText}`;

                const payloads: PushNotificationPayload[] = tokens.map(({ token }) => ({
                    to: token,
                    title: 'Medication Reminder',
                    body: notificationBody,
                    data: {
                        type: 'medication_reminder',
                        reminderId: reminder.id,
                        medicationId: reminder.medicationId,
                        medicationName: reminder.medicationName,
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

                // Update lastSentAt
                batch.update(getRemindersCollection().doc(reminder.id), {
                    lastSentAt: now,
                    lastSentLockUntil: admin.firestore.FieldValue.delete(),
                    lastSentLockAt: admin.firestore.FieldValue.delete(),
                    updatedAt: now,
                });

                stats.processed++;
                if (successCount > 0) {
                    stats.sent++;
                }

                functions.logger.info(`[MedReminders] Sent notification for ${reminder.id}`, {
                    userId,
                    medication: reminder.medicationName,
                    successCount,
                });
            }
        } catch (userError) {
            functions.logger.error(`[MedReminders] Error processing user ${userId}:`, userError);
            stats.errors++;
        }
    }

    // Commit all updates
    await batch.commit();

    functions.logger.info('[MedReminders] Processing complete', stats);
    return stats;
}
