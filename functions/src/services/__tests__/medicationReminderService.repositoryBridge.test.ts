import * as admin from 'firebase-admin';
import {
  backfillMedicationReminderTimingPolicy,
  processAndNotifyMedicationReminders,
  purgeSoftDeletedMedicationReminders,
} from '../medicationReminderService';
import { getNotificationService } from '../notifications';

jest.mock('../notifications', () => ({
  getNotificationService: jest.fn(),
}));

describe('medicationReminderService repository bridge', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetNotificationService = getNotificationService as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-23T17:00:00.000Z')); // 12:00 PM America/New_York

    (firestoreMock as unknown as { Timestamp?: unknown }).Timestamp = {
      now: jest.fn(() => ({
        toDate: () => new Date(Date.now()),
        toMillis: () => Date.now(),
      })),
      fromDate: jest.fn((date: Date) => ({
        toDate: () => date,
        toMillis: () => date.getTime(),
      })),
      fromMillis: jest.fn((millis: number) => ({
        toDate: () => new Date(millis),
        toMillis: () => millis,
      })),
    };
    (firestoreMock as unknown as { FieldValue?: unknown }).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
    };

    mockedGetNotificationService.mockReturnValue({
      getUserPushTokens: jest.fn(async () => []),
      sendNotifications: jest.fn(async () => []),
      removeInvalidToken: jest.fn(async () => undefined),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('routes process-time reminder reads/writes through injected repository methods', async () => {
    const listEnabledReminders = jest.fn().mockResolvedValue([
      {
        id: 'rem-1',
        userId: 'user-1',
        medicationId: 'med-1',
        medicationName: 'Tacrolimus',
        times: ['12:00'],
        enabled: true,
      },
    ]);
    const getMedicationState = jest.fn().mockResolvedValue({
      id: 'med-1',
      exists: true,
      active: true,
      deletedAt: null,
    });
    const getUserTimezoneValue = jest.fn().mockResolvedValue('America/New_York');
    const listMedicationLogsByUserAndLoggedAtRange = jest.fn().mockResolvedValue([]);
    const applyReminderUpdates = jest.fn().mockResolvedValue(1);

    const result = await processAndNotifyMedicationReminders({
      reminderProcessingRepository: {
        listEnabledReminders,
        listTimingBackfillPage: jest.fn(),
        listSoftDeletedByCutoff: jest.fn(),
        getUserTimezoneValue,
        getMedicationState,
        acquireReminderSendLock: jest.fn(),
        updateReminderById: jest.fn(),
        applyReminderUpdates,
        deleteReminderIds: jest.fn(),
        listMedicationLogsByUserAndLoggedAtRange,
      },
      maintenanceStateRepository: {
        getState: jest.fn(),
        setState: jest.fn(),
      },
    });

    expect(listEnabledReminders).toHaveBeenCalledTimes(1);
    expect(getMedicationState).toHaveBeenCalledWith('med-1');
    expect(getUserTimezoneValue).toHaveBeenCalledWith('user-1');
    expect(listMedicationLogsByUserAndLoggedAtRange).toHaveBeenCalledTimes(1);
    expect(applyReminderUpdates).toHaveBeenCalledWith([
      {
        reminderId: 'rem-1',
        updates: expect.objectContaining({
          lastSentAt: expect.objectContaining({
            toMillis: expect.any(Function),
          }),
          timingMode: 'anchor',
          anchorTimezone: 'America/New_York',
          criticality: 'time_sensitive',
        }),
      },
    ]);
    expect(result).toMatchObject({
      processed: 1,
      sent: 0,
      errors: 0,
    });
  });

  it('soft-disables orphan reminders through repository update path', async () => {
    const updateReminderById = jest.fn().mockResolvedValue(undefined);

    await processAndNotifyMedicationReminders({
      reminderProcessingRepository: {
        listEnabledReminders: jest.fn().mockResolvedValue([
          {
            id: 'rem-orphan',
            userId: 'user-1',
            medicationId: 'missing-med',
            medicationName: 'Unknown med',
            times: ['12:00'],
            enabled: true,
          },
        ]),
        listTimingBackfillPage: jest.fn(),
        listSoftDeletedByCutoff: jest.fn(),
        getUserTimezoneValue: jest.fn().mockResolvedValue('America/New_York'),
        getMedicationState: jest.fn().mockResolvedValue({
          id: 'missing-med',
          exists: false,
          active: false,
          deletedAt: null,
        }),
        acquireReminderSendLock: jest.fn(),
        updateReminderById,
        applyReminderUpdates: jest.fn().mockResolvedValue(0),
        deleteReminderIds: jest.fn(),
        listMedicationLogsByUserAndLoggedAtRange: jest.fn().mockResolvedValue([]),
      },
      maintenanceStateRepository: {
        getState: jest.fn(),
        setState: jest.fn(),
      },
    });

    expect(updateReminderById).toHaveBeenCalledWith(
      'rem-orphan',
      expect.objectContaining({
        enabled: false,
        deletedBy: 'system:medication-reminder-processor',
      }),
    );
  });

  it('routes timing backfill page reads/writes through injected repository methods', async () => {
    const listTimingBackfillPage = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'rem-1',
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          timingMode: undefined,
          anchorTimezone: undefined,
          criticality: undefined,
        },
      ],
      processedCount: 1,
      hasMore: false,
      nextCursor: null,
    });
    const applyReminderUpdates = jest.fn().mockResolvedValue(1);
    const getUserTimezoneValue = jest.fn().mockResolvedValue('America/New_York');

    const result = await backfillMedicationReminderTimingPolicy(
      { pageSize: 10 },
      {
        reminderProcessingRepository: {
          listEnabledReminders: jest.fn(),
          listTimingBackfillPage,
          listSoftDeletedByCutoff: jest.fn(),
          getUserTimezoneValue,
          getMedicationState: jest.fn(),
          acquireReminderSendLock: jest.fn(),
          updateReminderById: jest.fn(),
          applyReminderUpdates,
          deleteReminderIds: jest.fn(),
          listMedicationLogsByUserAndLoggedAtRange: jest.fn(),
        },
        maintenanceStateRepository: {
          getState: jest.fn().mockResolvedValue({ cursorDocId: null }),
          setState: jest.fn().mockResolvedValue(undefined),
        },
      },
    );

    expect(listTimingBackfillPage).toHaveBeenCalledWith({
      cursorDocId: null,
      limit: 10,
    });
    expect(getUserTimezoneValue).toHaveBeenCalledWith('user-1');
    expect(applyReminderUpdates).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      processed: 1,
      updated: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('routes soft-delete purge reads/deletes through injected repository methods', async () => {
    const listSoftDeletedByCutoff = jest.fn().mockResolvedValue([
      { id: 'rem-1' },
      { id: 'rem-2' },
    ]);
    const deleteReminderIds = jest.fn().mockResolvedValue(2);

    const result = await purgeSoftDeletedMedicationReminders(
      { retentionDays: 90, pageSize: 50 },
      {
        reminderProcessingRepository: {
          listEnabledReminders: jest.fn(),
          listTimingBackfillPage: jest.fn(),
          listSoftDeletedByCutoff,
          getUserTimezoneValue: jest.fn(),
          getMedicationState: jest.fn(),
          acquireReminderSendLock: jest.fn(),
          updateReminderById: jest.fn(),
          applyReminderUpdates: jest.fn(),
          deleteReminderIds,
          listMedicationLogsByUserAndLoggedAtRange: jest.fn(),
        },
        maintenanceStateRepository: {
          getState: jest.fn(),
          setState: jest.fn(),
        },
      },
    );

    expect(listSoftDeletedByCutoff).toHaveBeenCalledTimes(1);
    expect(deleteReminderIds).toHaveBeenCalledWith(['rem-1', 'rem-2']);
    expect(result).toMatchObject({
      scanned: 2,
      purged: 2,
      hasMore: false,
    });
  });
});
