import * as admin from 'firebase-admin';
import { resolveDoseDueReason } from '../medicationReminderService';

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
