/**
 * Streak Service
 * 
 * Tracks consecutive days of health logging and creates celebration nudges
 * when users hit milestones (3, 5, 7, 14, 30, 60, 90 days).
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const getDb = () => admin.firestore();
const getHealthLogsCollection = () => getDb().collection('healthLogs');
const getNudgesCollection = () => getDb().collection('nudges');

// =============================================================================
// Constants
// =============================================================================

const STREAK_MILESTONES = [3, 5, 7, 14, 30, 60, 90];

const MILESTONE_MESSAGES: Record<number, { emoji: string; message: string }> = {
    3: { emoji: '🔥', message: '3 days in a row! You\'re building a great habit.' },
    5: { emoji: '⭐', message: '5-day streak! Your consistency is paying off.' },
    7: { emoji: '🎉', message: 'One week streak! Keep up the amazing work!' },
    14: { emoji: '💪', message: 'Two weeks of tracking! You\'re on fire!' },
    30: { emoji: '🏆', message: '30-day streak! You\'re a tracking champion!' },
    60: { emoji: '👑', message: '60-day streak! You\'re absolutely crushing it!' },
    90: { emoji: '🌟', message: '90 days! You\'ve made tracking a lifestyle!' },
};

// =============================================================================
// Streak Calculation
// =============================================================================

/**
 * Calculate the current streak for a user.
 * A streak is consecutive days with at least one health log.
 */
export async function calculateStreak(userId: string): Promise<{
    currentStreak: number;
    lastLogDate: Date | null;
}> {
    // Get logs from the last 100 days to check streak
    const hundredDaysAgo = new Date();
    hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100);

    const logsSnapshot = await getHealthLogsCollection()
        .where('userId', '==', userId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(hundredDaysAgo))
        .orderBy('createdAt', 'desc')
        .get();

    if (logsSnapshot.empty) {
        return { currentStreak: 0, lastLogDate: null };
    }

    // Get unique dates with logs (in user's local date, approximated by UTC)
    const datesWithLogs = new Set<string>();
    logsSnapshot.docs.forEach(doc => {
        const createdAt = (doc.data().createdAt as admin.firestore.Timestamp).toDate();
        const dateStr = createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
        datesWithLogs.add(dateStr);
    });

    // Sort dates descending
    const sortedDates = Array.from(datesWithLogs).sort().reverse();

    if (sortedDates.length === 0) {
        return { currentStreak: 0, lastLogDate: null };
    }

    // Count consecutive days starting from today or yesterday
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Start counting if most recent log is today or yesterday
    const mostRecent = sortedDates[0];
    if (mostRecent !== today && mostRecent !== yesterday) {
        // Streak is broken
        return { currentStreak: 0, lastLogDate: new Date(mostRecent) };
    }

    let streak = 0;
    let currentDate = new Date(mostRecent);

    for (let i = 0; i < 100; i++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (datesWithLogs.has(dateStr)) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }

    return {
        currentStreak: streak,
        lastLogDate: new Date(mostRecent),
    };
}

// =============================================================================
// Milestone Detection
// =============================================================================

/**
 * Check if user just hit a streak milestone.
 * Returns the milestone if hit, null otherwise.
 */
export async function checkStreakMilestone(userId: string): Promise<{
    milestone: number | null;
    message: string | null;
    emoji: string | null;
}> {
    const { currentStreak } = await calculateStreak(userId);

    // Check if current streak matches a milestone exactly
    if (STREAK_MILESTONES.includes(currentStreak)) {
        // Check if we already sent a celebration for this milestone
        const recentCelebration = await getNudgesCollection()
            .where('userId', '==', userId)
            .where('type', '==', 'celebration')
            .where('streakMilestone', '==', currentStreak)
            .limit(1)
            .get();

        if (!recentCelebration.empty) {
            // Already celebrated this milestone
            return { milestone: null, message: null, emoji: null };
        }

        const { emoji, message } = MILESTONE_MESSAGES[currentStreak];
        return { milestone: currentStreak, message, emoji };
    }

    return { milestone: null, message: null, emoji: null };
}

// =============================================================================
// Celebration Nudge Creation
// =============================================================================

/**
 * Create a celebration nudge for a streak milestone.
 */
export async function createCelebrationNudge(
    userId: string,
    milestone: number,
    message: string,
    emoji: string
): Promise<void> {
    const now = admin.firestore.Timestamp.now();

    await getNudgesCollection().add({
        userId,
        type: 'celebration',
        title: `${emoji} ${milestone}-Day Streak!`,
        message,
        streakMilestone: milestone,
        actionType: 'acknowledge',
        status: 'active',
        priority: 'low',
        scheduledFor: now,
        notificationSent: false,
        createdAt: now,
        updatedAt: now,
    });

    functions.logger.info(`[StreakService] Created celebration nudge for ${milestone}-day streak`, {
        userId,
        milestone,
    });
}

/**
 * Check for streak milestone after a health log is created and create celebration if applicable.
 * This should be called asynchronously after health log creation.
 */
export async function checkAndCelebrateStreak(userId: string): Promise<void> {
    try {
        const { milestone, message, emoji } = await checkStreakMilestone(userId);

        if (milestone && message && emoji) {
            await createCelebrationNudge(userId, milestone, message, emoji);
        }
    } catch (error) {
        functions.logger.error('[StreakService] Error checking streak:', error);
    }
}
