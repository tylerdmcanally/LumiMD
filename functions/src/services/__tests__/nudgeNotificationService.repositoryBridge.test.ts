import * as admin from 'firebase-admin';
import {
  backfillNotificationSentField,
  processAndNotifyDueNudges,
} from '../nudgeNotificationService';

function makeTimestamp(input: string | Date): FirebaseFirestore.Timestamp {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('nudgeNotificationService repository bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-22T18:00:00.000Z'));
    const firestoreMock = admin.firestore as unknown as jest.Mock;
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp(new Date()),
      fromDate: (value: Date) => makeTimestamp(value),
      fromMillis: (value: number) => makeTimestamp(new Date(value)),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('processes due nudges via injected domain dependencies', async () => {
    const now = makeTimestamp('2026-02-22T18:00:00.000Z');
    const nudgeService = {
      listDuePendingForNotification: jest.fn().mockResolvedValue([
        {
          id: 'nudge-1',
          userId: 'user-1',
          title: 'Check-in',
          message: 'How are you doing?',
          actionType: 'acknowledge',
          type: 'followup',
        },
      ]),
      countByUserNotificationSentBetween: jest.fn().mockResolvedValue(0),
      acquireNotificationSendLock: jest.fn().mockResolvedValue(true),
      markNotificationProcessed: jest.fn().mockResolvedValue(undefined),
      backfillPendingNotificationSentField: jest.fn(),
    };
    const userService = {
      getById: jest.fn().mockResolvedValue({
        id: 'user-1',
        timezone: 'America/Chicago',
      }),
    };
    const notificationService = {
      getUserPushTokens: jest.fn().mockResolvedValue([{ token: 'expo-token-1', platform: 'ios' }]),
      sendNotifications: jest.fn().mockResolvedValue([{ status: 'ok' }]),
      removeInvalidToken: jest.fn().mockResolvedValue(undefined),
    };

    const result = await processAndNotifyDueNudges({
      nudgeService,
      userService,
      notificationService,
      nowTimestampProvider: () => now,
    });

    expect(nudgeService.listDuePendingForNotification).toHaveBeenCalledWith(now, 100);
    expect(userService.getById).toHaveBeenCalledWith('user-1');
    expect(nudgeService.countByUserNotificationSentBetween).toHaveBeenCalledWith(
      'user-1',
      expect.any(Object),
      expect.any(Object),
    );
    expect(nudgeService.acquireNotificationSendLock).toHaveBeenCalledWith('nudge-1', now, 300000);
    expect(nudgeService.markNotificationProcessed).toHaveBeenCalledWith(
      'nudge-1',
      expect.objectContaining({
        now,
        sentAt: now,
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

  it('delegates notificationSent backfill to injected nudge dependency', async () => {
    const nudgeService = {
      listDuePendingForNotification: jest.fn(),
      countByUserNotificationSentBetween: jest.fn(),
      acquireNotificationSendLock: jest.fn(),
      markNotificationProcessed: jest.fn(),
      backfillPendingNotificationSentField: jest.fn().mockResolvedValue(6),
    };

    const result = await backfillNotificationSentField({
      nudgeService,
      userService: { getById: jest.fn() },
      notificationService: {
        getUserPushTokens: jest.fn(),
        sendNotifications: jest.fn(),
        removeInvalidToken: jest.fn(),
      },
      nowTimestampProvider: () => makeTimestamp('2026-02-22T18:00:00.000Z'),
    });

    expect(nudgeService.backfillPendingNotificationSentField).toHaveBeenCalledTimes(1);
    expect(result).toBe(6);
  });
});
