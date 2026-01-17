/**
 * Condition Reminder Service
 * 
 * Creates recurring nudges for users who haven't logged health data recently.
 * Checks users with active BP/glucose medications and prompts them to log
 * if they haven't done so in the configured interval.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { findMedicationClass } from '../data/medicationClasses';

// =============================================================================
// Configuration
// =============================================================================

const STALE_THRESHOLD_DAYS = 5; // Create reminder if no log in this many days
const DEFAULT_TIMEZONE = 'America/Chicago';
const TARGET_LOCAL_HOUR = 9; // 9 AM local
const TARGET_LOCAL_MINUTE = 0;
const WINDOW_MINUTES = 30; // Allow for scheduler drift

const getUserTimezone = async (
    db: admin.firestore.Firestore,
    userId: string,
): Promise<string> => {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const timezone = userDoc.data()?.timezone;
        if (timezone && typeof timezone === 'string') {
            return timezone;
        }
    } catch (error) {
        functions.logger.warn(`[ConditionReminder] Could not fetch timezone for user ${userId}:`, error);
    }
    return DEFAULT_TIMEZONE;
};

const getCurrentTimeInTimezone = (timezone: string): { hour: number; minute: number } => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(now);

    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return { hour, minute };
};

const isWithinLocalReminderWindow = (timezone: string): boolean => {
    const { hour, minute } = getCurrentTimeInTimezone(timezone);
    const currentMinutes = hour * 60 + minute;
    const targetMinutes = TARGET_LOCAL_HOUR * 60 + TARGET_LOCAL_MINUTE;
    return Math.abs(currentMinutes - targetMinutes) <= WINDOW_MINUTES;
};

// =============================================================================
// Types
// =============================================================================

interface UserConditionData {
    userId: string;
    trackingType: 'bp' | 'glucose';
    conditionName: string;
    medicationNames: string[];
    lastLogDate: Date | null;
    daysSinceLastLog: number | null;
    hasPendingNudge: boolean;
}

interface ProcessingResult {
    usersChecked: number;
    nudgesCreated: number;
    skippedRecentLog: number;
    skippedPendingNudge: number;
}

// =============================================================================
// Main Service Function
// =============================================================================

/**
 * Process all users and create condition reminders where needed.
 */
export async function processConditionReminders(): Promise<ProcessingResult> {
    const db = admin.firestore();
    const result: ProcessingResult = {
        usersChecked: 0,
        nudgesCreated: 0,
        skippedRecentLog: 0,
        skippedPendingNudge: 0,
    };

    try {
        // Get all users with active medications
        const usersWithMeds = await findUsersWithTrackableMeds(db);
        result.usersChecked = usersWithMeds.length;

        functions.logger.info(`[ConditionReminder] Checking ${usersWithMeds.length} users with trackable medications`);

        const timezoneCache = new Map<string, string>();

        for (const userData of usersWithMeds) {
            let userTimezone = timezoneCache.get(userData.userId);
            if (!userTimezone) {
                userTimezone = await getUserTimezone(db, userData.userId);
                timezoneCache.set(userData.userId, userTimezone);
            }

            if (!isWithinLocalReminderWindow(userTimezone)) {
                continue;
            }

            // Skip if they have a recent log
            if (userData.daysSinceLastLog !== null && userData.daysSinceLastLog < STALE_THRESHOLD_DAYS) {
                result.skippedRecentLog++;
                continue;
            }

            // Skip if they already have a pending condition nudge
            if (userData.hasPendingNudge) {
                result.skippedPendingNudge++;
                continue;
            }

            // Create a reminder nudge
            await createConditionReminderNudge(db, userData);
            result.nudgesCreated++;
        }

        functions.logger.info('[ConditionReminder] Processing complete', result);
        return result;
    } catch (error) {
        functions.logger.error('[ConditionReminder] Error processing reminders:', error);
        throw error;
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find all users with active medications that have trackable conditions.
 */
async function findUsersWithTrackableMeds(db: admin.firestore.Firestore): Promise<UserConditionData[]> {
    // Get all active medications
    const medsSnapshot = await db.collection('medications')
        .where('active', '==', true)
        .get();

    // Group by user and find trackable conditions
    const userConditions = new Map<string, UserConditionData>();

    for (const doc of medsSnapshot.docs) {
        const med = doc.data();
        const medClass = findMedicationClass(med.name);

        if (!medClass || !medClass.trackingType) continue;

        const key = `${med.userId}_${medClass.trackingType}`;

        if (!userConditions.has(key)) {
            userConditions.set(key, {
                userId: med.userId,
                trackingType: medClass.trackingType as 'bp' | 'glucose',
                conditionName: medClass.name,
                medicationNames: [med.name],
                lastLogDate: null,
                daysSinceLastLog: null,
                hasPendingNudge: false,
            });
        } else {
            userConditions.get(key)!.medicationNames.push(med.name);
        }
    }

    // For each user condition, check their last log and pending nudges
    const userDataArray = Array.from(userConditions.values());

    for (const userData of userDataArray) {
        // Check last health log
        const lastLog = await db.collection('healthLogs')
            .where('userId', '==', userData.userId)
            .where('type', '==', userData.trackingType)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (!lastLog.empty) {
            const logData = lastLog.docs[0].data();
            const logDate = logData.createdAt?.toDate();
            if (logDate) {
                userData.lastLogDate = logDate;
                userData.daysSinceLastLog = Math.floor(
                    (Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24)
                );
            }
        }

        // Check for pending condition nudge
        const pendingNudge = await db.collection('nudges')
            .where('userId', '==', userData.userId)
            .where('type', '==', 'condition_tracking')
            .where('status', 'in', ['pending', 'active', 'snoozed'])
            .limit(1)
            .get();

        userData.hasPendingNudge = !pendingNudge.empty;
    }

    return userDataArray;
}

/**
 * Create a condition reminder nudge for a user.
 */
async function createConditionReminderNudge(
    db: admin.firestore.Firestore,
    userData: UserConditionData
): Promise<void> {
    const now = admin.firestore.Timestamp.now();

    // Generate AI message using intelligent nudge generator (full patient context)
    let title: string;
    let message: string;
    let aiGenerated = false;

    try {
        const { getIntelligentNudgeGenerator } = await import('./intelligentNudgeGenerator');
        const generator = getIntelligentNudgeGenerator();
        const aiResult = await generator.generateNudge(userData.userId, {
            type: 'condition_tracking',
            trigger: 'log_reading',
            conditionId: userData.trackingType,
        });
        title = aiResult.title;
        message = aiResult.message;
        aiGenerated = true;
    } catch (error) {
        functions.logger.warn('[ConditionReminder] AI generation failed, using template:', error);
        // Fallback to template
        const daysText = userData.daysSinceLastLog
            ? `It's been ${userData.daysSinceLastLog} days since your last reading.`
            : "It's time for a check-in!";

        if (userData.trackingType === 'bp') {
            title = 'Blood Pressure Check';
            message = `${daysText} A quick reading helps track how your medication is working.`;
        } else {
            title = 'Blood Sugar Check';
            message = `${daysText} Logging your glucose helps keep things on track.`;
        }
    }

    const nudgeData = {
        userId: userData.userId,
        visitId: 'recurring',
        type: 'condition_tracking',
        conditionId: userData.trackingType,
        title,
        message,
        actionType: userData.trackingType === 'bp' ? 'log_bp' : 'log_glucose',
        scheduledFor: now,
        sequenceDay: 0,
        sequenceId: `recurring_${userData.trackingType}_${Date.now()}`,
        status: 'pending',
        aiGenerated,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection('nudges').add(nudgeData);

    functions.logger.info(
        `[ConditionReminder] Created ${userData.trackingType} reminder for user ${userData.userId}`,
        { daysSinceLastLog: userData.daysSinceLastLog }
    );
}
