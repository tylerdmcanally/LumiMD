import * as admin from 'firebase-admin';
import { NudgeDomainService } from '../domain/nudges/NudgeDomainService';
import {
  backfillNotificationSentField,
  processAndNotifyDueNudges,
} from '../nudgeNotificationService';
import { getNotificationService } from '../notifications';

jest.mock('../notifications', () => ({
  getNotificationService: jest.fn(),
}));

type RecordMap = Record<string, unknown>;

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function buildFirestoreHarness(users: Record<string, RecordMap>) {
  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'users') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(async () => ({ exists: false, data: () => null })),
          })),
        };
      }

      return {
        doc: jest.fn((id: string) => ({
          get: jest.fn(async () => ({
            exists: !!users[id],
            data: () => users[id] || null,
          })),
        })),
      };
    }),
  };

  return { db };
}

describe('nudgeNotificationService processing', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetNotificationService = getNotificationService as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-22T18:00:00.000Z'));

    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp(new Date()),
      fromDate: (value: Date) => makeTimestamp(value),
      fromMillis: (value: number) => makeTimestamp(new Date(value)),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('notifies due nudges and marks them sent with cleared lock fields', async () => {
    const harness = buildFirestoreHarness({
      'user-1': { timezone: 'America/Chicago' },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const listDueSpy = jest
      .spyOn(NudgeDomainService.prototype, 'listDuePendingForNotification')
      .mockResolvedValue([
        {
          id: 'nudge-1',
          userId: 'user-1',
          title: 'Check-in',
          message: 'How are you doing?',
          actionType: 'acknowledge',
          type: 'followup',
        } as any,
      ]);
    const countSpy = jest
      .spyOn(NudgeDomainService.prototype, 'countByUserNotificationSentBetween')
      .mockResolvedValue(0);
    const lockSpy = jest
      .spyOn(NudgeDomainService.prototype, 'acquireNotificationSendLock')
      .mockResolvedValue(true);
    const markSpy = jest
      .spyOn(NudgeDomainService.prototype, 'markNotificationProcessed')
      .mockResolvedValue(undefined);

    mockedGetNotificationService.mockReturnValue({
      getUserPushTokens: jest.fn(async () => [{ token: 'expo-token-1' }]),
      sendNotifications: jest.fn(async () => [{ status: 'ok' }]),
      removeInvalidToken: jest.fn(async () => undefined),
    });

    const result = await processAndNotifyDueNudges();

    expect(listDueSpy).toHaveBeenCalledWith(expect.any(Object), 100);
    expect(countSpy).toHaveBeenCalledWith('user-1', expect.any(Object), expect.any(Object));
    expect(lockSpy).toHaveBeenCalledWith('nudge-1', expect.any(Object), 300000);
    expect(markSpy).toHaveBeenCalledWith(
      'nudge-1',
      expect.objectContaining({
        sentAt: expect.any(Object),
        clearLock: true,
      }),
    );
    expect(result).toMatchObject({
      processed: 1,
      notified: 1,
      errors: 0,
      skippedDailyLimit: 0,
      skippedQuietHours: 0,
    });
  });

  it('marks due nudges as skipped when user has no push tokens', async () => {
    const harness = buildFirestoreHarness({
      'user-1': { timezone: 'America/Chicago' },
    });
    firestoreMock.mockImplementation(() => harness.db);

    jest.spyOn(NudgeDomainService.prototype, 'listDuePendingForNotification').mockResolvedValue([
      {
        id: 'nudge-2',
        userId: 'user-1',
        title: 'Check-in',
        message: 'How are you doing?',
        actionType: 'acknowledge',
        type: 'condition_tracking',
      } as any,
    ]);
    jest.spyOn(NudgeDomainService.prototype, 'countByUserNotificationSentBetween').mockResolvedValue(0);
    const lockSpy = jest.spyOn(NudgeDomainService.prototype, 'acquireNotificationSendLock');
    const markSpy = jest
      .spyOn(NudgeDomainService.prototype, 'markNotificationProcessed')
      .mockResolvedValue(undefined);

    mockedGetNotificationService.mockReturnValue({
      getUserPushTokens: jest.fn(async () => []),
      sendNotifications: jest.fn(async () => []),
      removeInvalidToken: jest.fn(async () => undefined),
    });

    const result = await processAndNotifyDueNudges();

    expect(lockSpy).not.toHaveBeenCalled();
    expect(markSpy).toHaveBeenCalledWith(
      'nudge-2',
      expect.objectContaining({
        skippedReason: 'no_push_tokens',
      }),
    );
    expect(result).toMatchObject({
      processed: 1,
      notified: 0,
      errors: 0,
    });
  });

  it('delegates pending notificationSent backfill to domain service', async () => {
    const harness = buildFirestoreHarness({});
    firestoreMock.mockImplementation(() => harness.db);

    const backfillSpy = jest
      .spyOn(NudgeDomainService.prototype, 'backfillPendingNotificationSentField')
      .mockResolvedValue(4);

    const result = await backfillNotificationSentField();

    expect(backfillSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(4);
  });
});
