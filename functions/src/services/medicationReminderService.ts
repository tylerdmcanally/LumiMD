/**
 * Medication Reminder Notification Service
 * 
 * Processes due medication reminders and sends push notifications.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getNotificationService, PushNotificationPayload } from './notifications';
import {
    FirestoreMaintenanceStateRepository,
    FirestoreMedicationReminderProcessingRepository,
    MaintenanceStateRepository,
    MedicationReminderProcessingRepository,
    MedicationReminderProcessingUpdate,
} from './repositories';
import {
    DEFAULT_REMINDER_TIMEZONE,
    ReminderCriticality,
    ReminderTimingMode,
    resolveReminderTimingPolicy,
    resolveTimezoneOrDefault,
} from '../utils/medicationReminderTiming';

const getDb = () => admin.firestore();

const LOCK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_TIMING_BACKFILL_PAGE_SIZE = 250;
const MAX_TIMING_BACKFILL_PAGE_SIZE = 500;
const TIMING_BACKFILL_STATE_DOC_ID = 'medicationReminderTimingPolicyBackfill';
const TIMING_BACKFILL_RUN_STATUS_RUNNING = 'running';
const TIMING_BACKFILL_RUN_STATUS_SUCCESS = 'success';
const TIMING_BACKFILL_RUN_STATUS_ERROR = 'error';
const TIMING_BACKFILL_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 3 scheduler intervals
const TIMING_BACKFILL_ERROR_MESSAGE_MAX_LENGTH = 500;
const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 90;
const DEFAULT_PURGE_PAGE_SIZE = 250;
const MAX_PURGE_PAGE_SIZE = 500;
const ORPHAN_REMINDER_DELETION_ACTOR = 'system:medication-reminder-processor';

type ReminderDueReason = 'schedule' | 'snooze';

interface DoseSnoozeState {
    snoozeUntilMillis: number;
    loggedAtMillis: number;
}

interface UserReminderCandidate {
    id: string;
    medicationName: string;
    medicationDose?: string;
    medicationId: string;
    times: string[];
    timingMode?: ReminderTimingMode;
    anchorTimezone?: string | null;
    lastSentAt?: admin.firestore.Timestamp;
}

interface DueReminderCandidate {
    id: string;
    medicationName: string;
    medicationDose?: string;
    medicationId: string;
    matchedTime: string;
    evaluationTimezone: string;
    timingMode: ReminderTimingMode;
    anchorTimezone: string | null;
    criticality: ReminderCriticality;
    dueReason: ReminderDueReason;
}

type ReminderTimingMetadata = {
    timingMode: ReminderTimingMode;
    anchorTimezone: string | null;
    criticality: ReminderCriticality;
};

type BackfillRunStatus = 'idle' | 'running' | 'success' | 'error';

type TimingBackfillStateRecord = {
    cursorDocId?: unknown;
    lastProcessedAt?: unknown;
    lastProcessed?: unknown;
    lastUpdated?: unknown;
    completedAt?: unknown;
    lastRunStartedAt?: unknown;
    lastRunFinishedAt?: unknown;
    lastRunStatus?: unknown;
    lastRunErrorAt?: unknown;
    lastRunErrorMessage?: unknown;
};

export type MedicationReminderTimingBackfillStatus = {
    cursorDocId: string | null;
    hasMore: boolean;
    lastProcessedAt: string | null;
    lastProcessedCount: number | null;
    lastUpdatedCount: number | null;
    completedAt: string | null;
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastRunStatus: BackfillRunStatus;
    lastRunErrorAt: string | null;
    lastRunErrorMessage: string | null;
    stale: boolean;
    needsAttention: boolean;
};

type MedicationReminderServiceDependencies = {
    maintenanceStateRepository?: Pick<MaintenanceStateRepository, 'getState' | 'setState'>;
    reminderProcessingRepository?: Pick<
        MedicationReminderProcessingRepository,
        | 'listEnabledReminders'
        | 'listTimingBackfillPage'
        | 'listSoftDeletedByCutoff'
        | 'getUserTimezoneValue'
        | 'getMedicationState'
        | 'acquireReminderSendLock'
        | 'updateReminderById'
        | 'applyReminderUpdates'
        | 'deleteReminderIds'
        | 'listMedicationLogsByUserAndLoggedAtRange'
    >;
};

function buildDefaultDependencies(): Required<MedicationReminderServiceDependencies> {
    return {
        maintenanceStateRepository: new FirestoreMaintenanceStateRepository(getDb()),
        reminderProcessingRepository: new FirestoreMedicationReminderProcessingRepository(getDb()),
    };
}

function resolveDependencies(
    overrides: MedicationReminderServiceDependencies = {},
): Required<MedicationReminderServiceDependencies> {
    const defaults = buildDefaultDependencies();
    return {
        maintenanceStateRepository:
            overrides.maintenanceStateRepository ?? defaults.maintenanceStateRepository,
        reminderProcessingRepository:
            overrides.reminderProcessingRepository ?? defaults.reminderProcessingRepository,
    };
}

/**
 * Get user's timezone from their profile
 */
async function getUserTimezone(
    userId: string,
    reminderProcessingRepository: Pick<MedicationReminderProcessingRepository, 'getUserTimezoneValue'>,
): Promise<string> {
    try {
        return resolveTimezoneOrDefault(
            await reminderProcessingRepository.getUserTimezoneValue(userId),
            DEFAULT_REMINDER_TIMEZONE,
        );
    } catch (error) {
        functions.logger.warn(`[MedReminders] Could not fetch timezone for user ${userId}:`, error);
    }
    return DEFAULT_REMINDER_TIMEZONE;
}

/**
 * Get current time in HH:MM format (24hr) for a given timezone
 */
function getCurrentTimeHHMM(timezone: string = DEFAULT_REMINDER_TIMEZONE): string {
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

export function resolveDoseDueReason(params: {
    scheduledTime: string;
    currentTime: string;
    lastSentAt?: admin.firestore.Timestamp;
    snoozeState?: DoseSnoozeState;
    nowMillis: number;
}): ReminderDueReason | null {
    const { scheduledTime, currentTime, lastSentAt, snoozeState, nowMillis } = params;

    if (snoozeState) {
        if (snoozeState.snoozeUntilMillis > nowMillis) {
            return null;
        }

        const lastSentMillis = lastSentAt?.toMillis() ?? 0;
        if (lastSentMillis < snoozeState.loggedAtMillis) {
            return 'snooze';
        }
    }

    if (!isTimeWithinWindow(scheduledTime, currentTime)) {
        return null;
    }

    if (wasRecentlySent(lastSentAt)) {
        return null;
    }

    return 'schedule';
}

export function resolveReminderEvaluationTimezone(params: {
    reminderId: string;
    userId: string;
    medicationName: string;
    userTimezone: string;
    timingMode?: ReminderTimingMode;
    anchorTimezone?: string | null;
}): { timezone: string; timingMode: ReminderTimingMode; criticality: ReminderCriticality } {
    const timingMetadata = resolveReminderTimingMetadata({
        medicationName: params.medicationName,
        userTimezone: params.userTimezone,
        requestedTimingMode: params.timingMode,
        requestedAnchorTimezone: params.anchorTimezone,
    });

    if (
        timingMetadata.timingMode === 'anchor' &&
        timingMetadata.anchorTimezone !== params.anchorTimezone &&
        params.anchorTimezone
    ) {
        functions.logger.warn(
            `[MedReminders] Invalid anchor timezone "${params.anchorTimezone}" for reminder ${params.reminderId} (user ${params.userId}); falling back to ${timingMetadata.anchorTimezone}`,
        );
    }

    return {
        timezone:
            timingMetadata.timingMode === 'anchor'
                ? timingMetadata.anchorTimezone ?? params.userTimezone
                : params.userTimezone,
        timingMode: timingMetadata.timingMode,
        criticality: timingMetadata.criticality,
    };
}

export function resolveReminderTimingMetadata(params: {
    medicationName: unknown;
    userTimezone: string;
    requestedTimingMode?: unknown;
    requestedAnchorTimezone?: unknown;
}): ReminderTimingMetadata {
    const timingPolicy = resolveReminderTimingPolicy({
        medicationName: params.medicationName,
        userTimezone: params.userTimezone,
        requestedTimingMode: params.requestedTimingMode,
        requestedAnchorTimezone: params.requestedAnchorTimezone,
    });

    return {
        timingMode: timingPolicy.timingMode,
        anchorTimezone:
            timingPolicy.timingMode === 'anchor'
                ? timingPolicy.anchorTimezone ?? params.userTimezone
                : null,
        criticality: timingPolicy.criticality,
    };
}

export function getReminderTimingMetadataUpdate(params: {
    medicationName: unknown;
    userTimezone: string;
    currentTimingMode?: unknown;
    currentAnchorTimezone?: unknown;
    currentCriticality?: unknown;
}): ReminderTimingMetadata | null {
    const expectedMetadata = resolveReminderTimingMetadata({
        medicationName: params.medicationName,
        userTimezone: params.userTimezone,
        requestedTimingMode: params.currentTimingMode,
        requestedAnchorTimezone: params.currentAnchorTimezone,
    });

    const normalizedCurrentTimingMode: ReminderTimingMode | null =
        params.currentTimingMode === 'anchor' || params.currentTimingMode === 'local'
            ? params.currentTimingMode
            : null;

    const normalizedCurrentCriticality: ReminderCriticality | null =
        params.currentCriticality === 'time_sensitive' || params.currentCriticality === 'standard'
            ? params.currentCriticality
            : null;

    const normalizedCurrentAnchorTimezone =
        typeof params.currentAnchorTimezone === 'string'
            ? params.currentAnchorTimezone
            : params.currentAnchorTimezone === null
              ? null
              : null;

    const isAnchorMatch =
        expectedMetadata.anchorTimezone === null
            ? normalizedCurrentAnchorTimezone === null
            : normalizedCurrentAnchorTimezone === expectedMetadata.anchorTimezone;

    const isAlreadyNormalized =
        normalizedCurrentTimingMode === expectedMetadata.timingMode &&
        normalizedCurrentCriticality === expectedMetadata.criticality &&
        isAnchorMatch;

    return isAlreadyNormalized ? null : expectedMetadata;
}

function toTimestamp(value: unknown): admin.firestore.Timestamp | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    if (typeof (value as { toMillis?: unknown }).toMillis !== 'function') {
        return null;
    }

    return value as admin.firestore.Timestamp;
}

function toIso(value: unknown): string | null {
    const timestamp = toTimestamp(value);
    if (!timestamp) {
        return null;
    }
    return timestamp.toDate().toISOString();
}

function toPositiveIntOrNull(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return null;
    }
    return Math.floor(value);
}

function toBackfillRunStatus(value: unknown): BackfillRunStatus {
    if (
        value === TIMING_BACKFILL_RUN_STATUS_RUNNING ||
        value === TIMING_BACKFILL_RUN_STATUS_SUCCESS ||
        value === TIMING_BACKFILL_RUN_STATUS_ERROR
    ) {
        return value;
    }
    return 'idle';
}

export async function getMedicationReminderTimingBackfillStatus(
    dependencyOverrides: MedicationReminderServiceDependencies = {},
): Promise<MedicationReminderTimingBackfillStatus> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const stateData = (await dependencies.maintenanceStateRepository.getState(
        TIMING_BACKFILL_STATE_DOC_ID,
    )) as TimingBackfillStateRecord | null;
    const state = stateData ?? {};

    const cursorDocId =
        typeof state.cursorDocId === 'string' && state.cursorDocId.trim().length > 0
            ? state.cursorDocId
            : null;
    const hasMore = cursorDocId !== null;

    const lastProcessedAtTimestamp = toTimestamp(state.lastProcessedAt);
    const fallbackActivityTimestamp = toTimestamp(state.lastRunFinishedAt) ?? toTimestamp(state.lastRunStartedAt);
    const lastActivityTimestamp = lastProcessedAtTimestamp ?? fallbackActivityTimestamp;
    const nowMillis = Date.now();
    const stale =
        hasMore &&
        (!lastActivityTimestamp ||
            nowMillis - lastActivityTimestamp.toMillis() > TIMING_BACKFILL_STALE_THRESHOLD_MS);

    const lastRunStatus = toBackfillRunStatus(state.lastRunStatus);
    const needsAttention = stale || lastRunStatus === TIMING_BACKFILL_RUN_STATUS_ERROR;

    const lastRunErrorMessage =
        typeof state.lastRunErrorMessage === 'string' && state.lastRunErrorMessage.trim().length > 0
            ? state.lastRunErrorMessage
            : null;

    return {
        cursorDocId,
        hasMore,
        lastProcessedAt: toIso(state.lastProcessedAt),
        lastProcessedCount: toPositiveIntOrNull(state.lastProcessed),
        lastUpdatedCount: toPositiveIntOrNull(state.lastUpdated),
        completedAt: toIso(state.completedAt),
        lastRunStartedAt: toIso(state.lastRunStartedAt),
        lastRunFinishedAt: toIso(state.lastRunFinishedAt),
        lastRunStatus,
        lastRunErrorAt: toIso(state.lastRunErrorAt),
        lastRunErrorMessage,
        stale,
        needsAttention,
    };
}

async function acquireReminderSendLock(
    reminderId: string,
    now: admin.firestore.Timestamp,
    reminderProcessingRepository: Pick<MedicationReminderProcessingRepository, 'acquireReminderSendLock'>,
): Promise<boolean> {
    const lockUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + LOCK_WINDOW_MS);
    return reminderProcessingRepository.acquireReminderSendLock(reminderId, now, lockUntil);
}

/**
 * Process all due medication reminders and send notifications
 */
export async function processAndNotifyMedicationReminders(
    dependencyOverrides: MedicationReminderServiceDependencies = {},
): Promise<{
    processed: number;
    sent: number;
    errors: number;
}> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const stats = { processed: 0, sent: 0, errors: 0 };

    functions.logger.info('[MedReminders] Starting notification processor');

    // Get all enabled reminders
    const reminders = await dependencies.reminderProcessingRepository.listEnabledReminders();

    if (reminders.length === 0) {
        functions.logger.info('[MedReminders] No enabled reminders found');
        return stats;
    }

    const notificationService = getNotificationService();
    const now = admin.firestore.Timestamp.now();
    const reminderUpdates: MedicationReminderProcessingUpdate[] = [];

    // Group enabled reminders by user. Per-dose due evaluation happens later with logs/snooze state.
    const remindersByUser = new Map<string, UserReminderCandidate[]>();

    // Cache user timezones to avoid repeated Firestore calls
    const userTimezoneCache = new Map<string, string>();

    for (const reminder of reminders) {
        if (reminder.deletedAt) {
            continue;
        }

        // Verify medication is still active - defense against orphaned reminders
        try {
            const medicationState = await dependencies.reminderProcessingRepository.getMedicationState(
                reminder.medicationId,
            );
            if (!medicationState.exists || medicationState.active === false || medicationState.deletedAt) {
                // Orphaned reminder - medication was discontinued or deleted.
                // Soft-disable so we retain auditability and allow retention-based purge.
                functions.logger.warn(
                    `[MedReminders] Soft-disabling orphaned reminder ${reminder.id} - medication ${reminder.medicationName} is no longer active`,
                );
                await dependencies.reminderProcessingRepository.updateReminderById(reminder.id, {
                    enabled: false,
                    deletedAt: now,
                    deletedBy: ORPHAN_REMINDER_DELETION_ACTOR,
                    updatedAt: now,
                });
                continue;
            }
        } catch (medCheckError) {
            functions.logger.error(
                `[MedReminders] Error checking medication status for ${reminder.id}:`,
                medCheckError,
            );
            // Continue anyway to avoid blocking all reminders on one error
        }

        if (!remindersByUser.has(reminder.userId)) {
            remindersByUser.set(reminder.userId, []);
        }

        remindersByUser.get(reminder.userId)!.push({
            id: reminder.id,
            medicationName: reminder.medicationName,
            medicationDose: reminder.medicationDose,
            medicationId: reminder.medicationId,
            times: Array.isArray(reminder.times) ? reminder.times : [],
            timingMode: reminder.timingMode,
            anchorTimezone: reminder.anchorTimezone,
            lastSentAt: reminder.lastSentAt,
        });
    }

    if (remindersByUser.size === 0) {
        functions.logger.info('[MedReminders] No reminders due at this time');
        return { processed: reminders.length, sent: 0, errors: 0 };
    }

    // Process each user's reminders
    for (const [userId, reminders] of remindersByUser) {
        try {
            // Fetch today's logs and evaluate per-dose due state (including snooze windows).
            let userTimezone = userTimezoneCache.get(userId);
            if (!userTimezone) {
                userTimezone = await getUserTimezone(
                    userId,
                    dependencies.reminderProcessingRepository,
                );
                userTimezoneCache.set(userId, userTimezone);
            }

            const remindersByTimezone = new Map<string, UserReminderCandidate[]>();
            reminders.forEach((reminder) => {
                const evaluation = resolveReminderEvaluationTimezone({
                    reminderId: reminder.id,
                    userId,
                    medicationName: reminder.medicationName,
                    userTimezone,
                    timingMode: reminder.timingMode,
                    anchorTimezone: reminder.anchorTimezone,
                });

                const timezoneReminders = remindersByTimezone.get(evaluation.timezone) ?? [];
                timezoneReminders.push(reminder);
                remindersByTimezone.set(evaluation.timezone, timezoneReminders);
            });

            const dueReminders: DueReminderCandidate[] = [];

            for (const [evaluationTimezone, timezoneReminders] of remindersByTimezone) {
                const currentTime = getCurrentTimeHHMM(evaluationTimezone);
                const { startOfDay, endOfDay, todayStr } = getDayBoundariesInTimezone(
                    evaluationTimezone,
                );
                const logs = await dependencies.reminderProcessingRepository
                    .listMedicationLogsByUserAndLoggedAtRange(userId, {
                        start: startOfDay,
                        end: endOfDay,
                    });

                const loggedDoseKeys = new Set<string>();
                const snoozedDoseStates = new Map<string, DoseSnoozeState>();

                logs.forEach((log) => {
                    const scheduledTime = log.scheduledTime;
                    if (!scheduledTime) return;

                    const logDateStr =
                        log.scheduledDate ||
                        (log.loggedAt?.toDate
                            ? log.loggedAt.toDate().toLocaleDateString('en-CA', {
                                  timeZone: evaluationTimezone,
                              })
                            : null);
                    if (logDateStr !== todayStr) return;

                    const doseKey = `${log.medicationId}_${scheduledTime}`;

                    if (log.action === 'taken' || log.action === 'skipped') {
                        loggedDoseKeys.add(doseKey);
                        return;
                    }

                    if (log.action !== 'snoozed') {
                        return;
                    }

                    const snoozeUntilMillis =
                        typeof log.snoozeUntil?.toMillis === 'function'
                            ? log.snoozeUntil.toMillis()
                            : null;
                    const loggedAtMillis =
                        typeof log.loggedAt?.toMillis === 'function'
                            ? log.loggedAt.toMillis()
                            : null;

                    if (snoozeUntilMillis === null || loggedAtMillis === null) {
                        return;
                    }

                    const existingSnooze = snoozedDoseStates.get(doseKey);
                    if (!existingSnooze || loggedAtMillis >= existingSnooze.loggedAtMillis) {
                        snoozedDoseStates.set(doseKey, {
                            snoozeUntilMillis,
                            loggedAtMillis,
                        });
                    }
                });

                for (const reminder of timezoneReminders) {
                    let dueReminderForDoc: DueReminderCandidate | null = null;
                    const evaluation = resolveReminderEvaluationTimezone({
                        reminderId: reminder.id,
                        userId,
                        medicationName: reminder.medicationName,
                        userTimezone,
                        timingMode: reminder.timingMode,
                        anchorTimezone: reminder.anchorTimezone,
                    });
                    const expectedAnchorTimezone =
                        evaluation.timingMode === 'anchor' ? evaluation.timezone : null;

                    for (const scheduledTime of reminder.times) {
                        const doseKey = `${reminder.medicationId}_${scheduledTime}`;
                        if (loggedDoseKeys.has(doseKey)) {
                            continue;
                        }

                        const dueReason = resolveDoseDueReason({
                            scheduledTime,
                            currentTime,
                            lastSentAt: reminder.lastSentAt,
                            snoozeState: snoozedDoseStates.get(doseKey),
                            nowMillis: now.toMillis(),
                        });

                        if (!dueReason) {
                            continue;
                        }

                        const candidate: DueReminderCandidate = {
                            id: reminder.id,
                            medicationName: reminder.medicationName,
                            medicationDose: reminder.medicationDose,
                            medicationId: reminder.medicationId,
                            matchedTime: scheduledTime,
                            evaluationTimezone,
                            timingMode: evaluation.timingMode,
                            anchorTimezone: expectedAnchorTimezone,
                            criticality: evaluation.criticality,
                            dueReason,
                        };

                        // Prioritize explicit snooze expiry sends over schedule-window sends.
                        if (dueReason === 'snooze') {
                            dueReminderForDoc = candidate;
                            break;
                        }

                        if (!dueReminderForDoc) {
                            dueReminderForDoc = candidate;
                        }
                    }

                    if (dueReminderForDoc) {
                        dueReminders.push(dueReminderForDoc);
                    }
                }
            }

            if (dueReminders.length === 0) {
                continue;
            }

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
                    for (const reminder of dueReminders) {
                        reminderUpdates.push({
                            reminderId: reminder.id,
                            updates: {
                                lastSentAt: now,
                                timingMode: reminder.timingMode,
                                anchorTimezone: reminder.anchorTimezone,
                                criticality: reminder.criticality,
                                updatedAt: now,
                            },
                        });
                    }
                    stats.processed += dueReminders.length;
                    continue;
                }

            // Send notification for each due reminder candidate.
            for (const reminder of dueReminders) {
                const lockAcquired = await acquireReminderSendLock(
                    reminder.id,
                    now,
                    dependencies.reminderProcessingRepository,
                );
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
                        scheduledTime: reminder.matchedTime,
                        evaluationTimezone: reminder.evaluationTimezone,
                        dueReason: reminder.dueReason,
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
                reminderUpdates.push({
                    reminderId: reminder.id,
                    updates: {
                        lastSentAt: now,
                        timingMode: reminder.timingMode,
                        anchorTimezone: reminder.anchorTimezone,
                        criticality: reminder.criticality,
                        lastSentLockUntil: admin.firestore.FieldValue.delete(),
                        lastSentLockAt: admin.firestore.FieldValue.delete(),
                        updatedAt: now,
                    },
                });

                stats.processed++;
                if (successCount > 0) {
                    stats.sent++;
                }

                functions.logger.info(`[MedReminders] Sent notification for ${reminder.id}`, {
                    userId,
                    medication: reminder.medicationName,
                    dueReason: reminder.dueReason,
                    scheduledTime: reminder.matchedTime,
                    evaluationTimezone: reminder.evaluationTimezone,
                    successCount,
                });
            }
        } catch (userError) {
            functions.logger.error(`[MedReminders] Error processing user ${userId}:`, userError);
            stats.errors++;
        }
    }

    // Commit all reminder updates
    await dependencies.reminderProcessingRepository.applyReminderUpdates(reminderUpdates);

    functions.logger.info('[MedReminders] Processing complete', stats);
    return stats;
}

export async function backfillMedicationReminderTimingPolicy(options?: {
    pageSize?: number;
},
dependencyOverrides: MedicationReminderServiceDependencies = {},
): Promise<{
    processed: number;
    updated: number;
    hasMore: boolean;
    nextCursor: string | null;
}> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const stateRepository = dependencies.maintenanceStateRepository;
    const requestedPageSize = options?.pageSize ?? DEFAULT_TIMING_BACKFILL_PAGE_SIZE;
    const pageSize = Math.max(
        1,
        Math.min(MAX_TIMING_BACKFILL_PAGE_SIZE, Math.floor(requestedPageSize)),
    );
    const startedAt = admin.firestore.Timestamp.now();

    await stateRepository.setState(
        TIMING_BACKFILL_STATE_DOC_ID,
        {
            lastRunStartedAt: startedAt,
            lastRunStatus: TIMING_BACKFILL_RUN_STATUS_RUNNING,
        },
        { merge: true },
    );

    try {
        let cursorDocId: string | null = null;
        try {
            const stateData = (await stateRepository.getState(
                TIMING_BACKFILL_STATE_DOC_ID,
            )) as TimingBackfillStateRecord | null;
            if (
                stateData &&
                typeof stateData.cursorDocId === 'string' &&
                stateData.cursorDocId.trim().length > 0
            ) {
                cursorDocId = stateData.cursorDocId;
            }
        } catch (error) {
            functions.logger.warn('[MedReminders] Unable to read timing backfill cursor state', error);
        }

        const page = await dependencies.reminderProcessingRepository.listTimingBackfillPage({
            cursorDocId,
            limit: pageSize,
        });
        const now = admin.firestore.Timestamp.now();

        if (page.processedCount === 0) {
            await stateRepository.setState(
                TIMING_BACKFILL_STATE_DOC_ID,
                {
                    cursorDocId: null,
                    lastProcessedAt: now,
                    lastProcessed: 0,
                    lastUpdated: 0,
                    completedAt: now,
                    lastRunFinishedAt: now,
                    lastRunStatus: TIMING_BACKFILL_RUN_STATUS_SUCCESS,
                    lastRunErrorAt: null,
                    lastRunErrorMessage: null,
                },
                { merge: true },
            );

            return {
                processed: 0,
                updated: 0,
                hasMore: false,
                nextCursor: null,
            };
        }

        const userTimezoneCache = new Map<string, string>();
        const reminderUpdates: MedicationReminderProcessingUpdate[] = [];

        for (const reminder of page.items) {
            if (typeof reminder.userId !== 'string' || reminder.userId.trim().length === 0) {
                continue;
            }

            let userTimezone = userTimezoneCache.get(reminder.userId);
            if (!userTimezone) {
                userTimezone = await getUserTimezone(
                    reminder.userId,
                    dependencies.reminderProcessingRepository,
                );
                userTimezoneCache.set(reminder.userId, userTimezone);
            }

            const timingUpdate = getReminderTimingMetadataUpdate({
                medicationName: reminder.medicationName,
                userTimezone,
                currentTimingMode: reminder.timingMode,
                currentAnchorTimezone: reminder.anchorTimezone,
                currentCriticality: reminder.criticality,
            });

            if (!timingUpdate) {
                continue;
            }

            reminderUpdates.push({
                reminderId: reminder.id,
                updates: {
                    timingMode: timingUpdate.timingMode,
                    anchorTimezone: timingUpdate.anchorTimezone,
                    criticality: timingUpdate.criticality,
                    updatedAt: now,
                },
            });
        }

        const updated = await dependencies.reminderProcessingRepository.applyReminderUpdates(
            reminderUpdates,
        );

        const hasMore = page.hasMore;
        const nextCursor = page.nextCursor;

        await stateRepository.setState(
            TIMING_BACKFILL_STATE_DOC_ID,
            {
                cursorDocId: nextCursor,
                lastProcessedAt: now,
                lastProcessed: page.processedCount,
                lastUpdated: updated,
                completedAt: hasMore ? null : now,
                lastRunFinishedAt: now,
                lastRunStatus: TIMING_BACKFILL_RUN_STATUS_SUCCESS,
                lastRunErrorAt: null,
                lastRunErrorMessage: null,
            },
            { merge: true },
        );

        functions.logger.info('[MedReminders] Timing policy backfill page complete', {
            processed: page.processedCount,
            updated,
            hasMore,
            nextCursor,
        });

        return {
            processed: page.processedCount,
            updated,
            hasMore,
            nextCursor,
        };
    } catch (error) {
        const failedAt = admin.firestore.Timestamp.now();
        const errorMessage =
            error instanceof Error ? error.message : String(error ?? 'Unknown timing backfill error');

        try {
            await stateRepository.setState(
                TIMING_BACKFILL_STATE_DOC_ID,
                {
                    lastRunFinishedAt: failedAt,
                    lastRunStatus: TIMING_BACKFILL_RUN_STATUS_ERROR,
                    lastRunErrorAt: failedAt,
                    lastRunErrorMessage: errorMessage.slice(0, TIMING_BACKFILL_ERROR_MESSAGE_MAX_LENGTH),
                },
                { merge: true },
            );
        } catch (stateError) {
            functions.logger.warn(
                '[MedReminders] Failed to persist timing backfill error state',
                stateError,
            );
        }

        throw error;
    }
}

export async function purgeSoftDeletedMedicationReminders(options?: {
    retentionDays?: number;
    pageSize?: number;
},
dependencyOverrides: MedicationReminderServiceDependencies = {},
): Promise<{
    scanned: number;
    purged: number;
    hasMore: boolean;
    cutoffIso: string;
}> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const retentionDays = Math.max(
        1,
        Math.floor(options?.retentionDays ?? DEFAULT_SOFT_DELETE_RETENTION_DAYS),
    );
    const requestedPageSize = options?.pageSize ?? DEFAULT_PURGE_PAGE_SIZE;
    const pageSize = Math.max(1, Math.min(MAX_PURGE_PAGE_SIZE, Math.floor(requestedPageSize)));

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);

    const reminders = await dependencies.reminderProcessingRepository.listSoftDeletedByCutoff(
        cutoff,
        pageSize,
    );

    if (reminders.length === 0) {
        return {
            scanned: 0,
            purged: 0,
            hasMore: false,
            cutoffIso: cutoffDate.toISOString(),
        };
    }

    const purged = await dependencies.reminderProcessingRepository.deleteReminderIds(
        reminders.map((reminder) => reminder.id),
    );

    const hasMore = reminders.length === pageSize;
    functions.logger.info('[MedReminders] Purged soft-deleted reminders', {
        scanned: reminders.length,
        purged,
        hasMore,
        retentionDays,
        cutoffIso: cutoffDate.toISOString(),
    });

    return {
        scanned: reminders.length,
        purged,
        hasMore,
        cutoffIso: cutoffDate.toISOString(),
    };
}
