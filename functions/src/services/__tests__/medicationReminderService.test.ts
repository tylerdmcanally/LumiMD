import * as admin from 'firebase-admin';
import {
    getMedicationReminderTimingBackfillStatus,
    getReminderTimingMetadataUpdate,
    resolveDoseDueReason,
    resolveReminderEvaluationTimezone,
} from '../medicationReminderService';

const FIXED_NOW = new Date('2026-02-10T12:00:00.000Z').getTime();

const makeTimestamp = (millis: number): admin.firestore.Timestamp =>
    ({
        toMillis: () => millis,
        toDate: () => new Date(millis),
    } as unknown as admin.firestore.Timestamp);

describe('resolveDoseDueReason', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns schedule when a dose is in the current send window', () => {
        const reason = resolveDoseDueReason({
            scheduledTime: '12:00',
            currentTime: '12:04',
            nowMillis: FIXED_NOW,
        });

        expect(reason).toBe('schedule');
    });

    it('suppresses schedule sends when the reminder was sent recently', () => {
        const reason = resolveDoseDueReason({
            scheduledTime: '12:00',
            currentTime: '12:03',
            lastSentAt: makeTimestamp(FIXED_NOW - 10 * 60 * 1000),
            nowMillis: FIXED_NOW,
        });

        expect(reason).toBeNull();
    });

    it('suppresses a dose while snooze window is still active', () => {
        const reason = resolveDoseDueReason({
            scheduledTime: '12:00',
            currentTime: '12:02',
            snoozeState: {
                snoozeUntilMillis: FIXED_NOW + 5 * 60 * 1000,
                loggedAtMillis: FIXED_NOW - 2 * 60 * 1000,
            },
            nowMillis: FIXED_NOW,
        });

        expect(reason).toBeNull();
    });

    it('returns snooze when snooze has elapsed and not yet re-sent after snooze action', () => {
        const reason = resolveDoseDueReason({
            scheduledTime: '07:00',
            currentTime: '12:00',
            lastSentAt: makeTimestamp(FIXED_NOW - 45 * 60 * 1000),
            snoozeState: {
                snoozeUntilMillis: FIXED_NOW - 60 * 1000,
                loggedAtMillis: FIXED_NOW - 15 * 60 * 1000,
            },
            nowMillis: FIXED_NOW,
        });

        expect(reason).toBe('snooze');
    });

    it('does not re-trigger snooze if reminder was already sent after the snooze action', () => {
        const reason = resolveDoseDueReason({
            scheduledTime: '07:00',
            currentTime: '12:00',
            lastSentAt: makeTimestamp(FIXED_NOW - 2 * 60 * 1000),
            snoozeState: {
                snoozeUntilMillis: FIXED_NOW - 5 * 60 * 1000,
                loggedAtMillis: FIXED_NOW - 20 * 60 * 1000,
            },
            nowMillis: FIXED_NOW,
        });

        expect(reason).toBeNull();
    });
});

describe('resolveReminderEvaluationTimezone', () => {
    it('uses user timezone for local reminders', () => {
        const result = resolveReminderEvaluationTimezone({
            reminderId: 'r1',
            userId: 'u1',
            medicationName: 'Vitamin D',
            userTimezone: 'America/Los_Angeles',
            timingMode: 'local',
            anchorTimezone: 'America/New_York',
        });

        expect(result).toMatchObject({
            timezone: 'America/Los_Angeles',
            timingMode: 'local',
            criticality: 'standard',
        });
    });

    it('uses anchor timezone for explicit anchor reminders', () => {
        const result = resolveReminderEvaluationTimezone({
            reminderId: 'r2',
            userId: 'u1',
            medicationName: 'Tacrolimus',
            userTimezone: 'America/Los_Angeles',
            timingMode: 'anchor',
            anchorTimezone: 'America/New_York',
        });

        expect(result).toMatchObject({
            timezone: 'America/New_York',
            timingMode: 'anchor',
            criticality: 'time_sensitive',
        });
    });

    it('falls back to user timezone when anchor timezone is invalid', () => {
        const result = resolveReminderEvaluationTimezone({
            reminderId: 'r3',
            userId: 'u1',
            medicationName: 'Tacrolimus',
            userTimezone: 'America/Chicago',
            timingMode: 'anchor',
            anchorTimezone: 'Not/A_Timezone',
        });

        expect(result).toMatchObject({
            timezone: 'America/Chicago',
            timingMode: 'anchor',
            criticality: 'time_sensitive',
        });
    });
});

describe('getReminderTimingMetadataUpdate', () => {
    it('adds anchor defaults for legacy time-sensitive reminders missing timing metadata', () => {
        const update = getReminderTimingMetadataUpdate({
            medicationName: 'Tacrolimus',
            userTimezone: 'America/New_York',
        });

        expect(update).toEqual({
            timingMode: 'anchor',
            anchorTimezone: 'America/New_York',
            criticality: 'time_sensitive',
        });
    });

    it('returns null when reminder metadata is already normalized', () => {
        const update = getReminderTimingMetadataUpdate({
            medicationName: 'Tacrolimus',
            userTimezone: 'America/New_York',
            currentTimingMode: 'anchor',
            currentAnchorTimezone: 'America/New_York',
            currentCriticality: 'time_sensitive',
        });

        expect(update).toBeNull();
    });

    it('clears stale anchor timezone for local reminders', () => {
        const update = getReminderTimingMetadataUpdate({
            medicationName: 'Vitamin D',
            userTimezone: 'America/Chicago',
            currentTimingMode: 'local',
            currentAnchorTimezone: 'America/New_York',
            currentCriticality: 'standard',
        });

        expect(update).toEqual({
            timingMode: 'local',
            anchorTimezone: null,
            criticality: 'standard',
        });
    });

    it('normalizes invalid anchor timezone to user timezone', () => {
        const update = getReminderTimingMetadataUpdate({
            medicationName: 'Tacrolimus',
            userTimezone: 'America/Chicago',
            currentTimingMode: 'anchor',
            currentAnchorTimezone: 'Not/A_Timezone',
            currentCriticality: 'time_sensitive',
        });

        expect(update).toEqual({
            timingMode: 'anchor',
            anchorTimezone: 'America/Chicago',
            criticality: 'time_sensitive',
        });
    });
});

describe('getMedicationReminderTimingBackfillStatus', () => {
    it('reads timing backfill state via injected maintenance repository', async () => {
        const now = Date.now();
        const getState = jest.fn(async () => ({
            cursorDocId: 'rem-100',
            lastProcessedAt: makeTimestamp(now - 2 * 60 * 1000),
            lastProcessed: 25,
            lastUpdated: 12,
            lastRunStartedAt: makeTimestamp(now - 3 * 60 * 1000),
            lastRunFinishedAt: makeTimestamp(now - 90 * 1000),
            lastRunStatus: 'success',
        }));

        const status = await getMedicationReminderTimingBackfillStatus({
            maintenanceStateRepository: {
                getState,
                setState: jest.fn(),
            },
        });

        expect(getState).toHaveBeenCalledWith('medicationReminderTimingPolicyBackfill');
        expect(status).toMatchObject({
            cursorDocId: 'rem-100',
            hasMore: true,
            lastProcessedCount: 25,
            lastUpdatedCount: 12,
            lastRunStatus: 'success',
            stale: false,
            needsAttention: false,
        });
    });
});
