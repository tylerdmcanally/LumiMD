import * as admin from 'firebase-admin';
import { processConditionReminders } from '../conditionReminderService';

jest.mock('../intelligentNudgeGenerator', () => ({
  getIntelligentNudgeGenerator: jest.fn(() => ({
    generateNudge: jest.fn(async () => ({
      title: 'AI Condition Check',
      message: 'Please log a reading today.',
    })),
  })),
}));

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('conditionReminderService repository bridge', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp('2026-02-22T12:00:00.000Z'),
      fromDate: (value: Date) => makeTimestamp(value.toISOString()),
    };
  });

  it('builds trackable user conditions from active meds and creates stale reminders', async () => {
    const medicationService = {
      listActive: jest.fn().mockResolvedValue([
        { id: 'med-1', userId: 'user-1', name: 'Lisinopril', active: true },
        { id: 'med-2', userId: 'user-2', name: 'Metformin', active: true },
        { id: 'med-3', userId: 'user-3', name: 'Atorvastatin', active: true }, // non-trackable
      ]),
    };
    const healthLogService = {
      listForUser: jest.fn().mockImplementation(async (userId: string) => {
        if (userId === 'user-1') {
          return [
            {
              id: 'log-1',
              createdAt: makeTimestamp('2026-02-10T09:00:00.000Z'),
            },
          ];
        }
        if (userId === 'user-2') {
          return [
            {
              id: 'log-2',
              createdAt: makeTimestamp('2026-02-21T09:00:00.000Z'),
            },
          ];
        }
        return [];
      }),
    };
    const nudgeService = {
      listByUserAndStatuses: jest.fn().mockResolvedValue([]),
      createRecord: jest.fn().mockResolvedValue({ id: 'nudge-created-1' }),
    };
    const userService = {
      getById: jest.fn().mockResolvedValue({ id: 'user-1', timezone: 'America/Chicago' }),
    };

    const result = await processConditionReminders({
      medicationService,
      healthLogService,
      nudgeService,
      userService,
      isWithinReminderWindow: () => true,
    });

    expect(medicationService.listActive).toHaveBeenCalledTimes(1);
    expect(healthLogService.listForUser).toHaveBeenCalledWith('user-1', {
      type: 'bp',
      sortDirection: 'desc',
      limit: 1,
    });
    expect(healthLogService.listForUser).toHaveBeenCalledWith('user-2', {
      type: 'glucose',
      sortDirection: 'desc',
      limit: 1,
    });
    expect(nudgeService.listByUserAndStatuses).toHaveBeenCalledWith('user-1', [
      'pending',
      'active',
      'snoozed',
    ]);
    expect(nudgeService.createRecord).toHaveBeenCalledTimes(1);
    expect(nudgeService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'condition_tracking',
        conditionId: 'bp',
      }),
    );
    expect(result).toMatchObject({
      usersChecked: 2,
      nudgesCreated: 1,
      skippedRecentLog: 1,
      skippedPendingNudge: 0,
    });
  });

  it('skips reminder creation when an active condition nudge already exists', async () => {
    const medicationService = {
      listActive: jest.fn().mockResolvedValue([
        { id: 'med-1', userId: 'user-1', name: 'Lisinopril', active: true },
      ]),
    };
    const healthLogService = {
      listForUser: jest.fn().mockResolvedValue([]),
    };
    const nudgeService = {
      listByUserAndStatuses: jest.fn().mockResolvedValue([
        { id: 'nudge-1', type: 'condition_tracking', status: 'pending' },
      ]),
      createRecord: jest.fn().mockResolvedValue({ id: 'nudge-created-2' }),
    };
    const userService = {
      getById: jest.fn().mockResolvedValue({ id: 'user-1', timezone: 'America/Chicago' }),
    };

    const result = await processConditionReminders({
      medicationService,
      healthLogService,
      nudgeService,
      userService,
      isWithinReminderWindow: () => true,
    });

    expect(nudgeService.createRecord).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      usersChecked: 1,
      nudgesCreated: 0,
      skippedRecentLog: 0,
      skippedPendingNudge: 1,
    });
  });

  it('skips users outside the reminder-time window', async () => {
    const medicationService = {
      listActive: jest.fn().mockResolvedValue([
        { id: 'med-1', userId: 'user-1', name: 'Metformin', active: true },
      ]),
    };
    const healthLogService = {
      listForUser: jest.fn().mockResolvedValue([]),
    };
    const nudgeService = {
      listByUserAndStatuses: jest.fn().mockResolvedValue([]),
      createRecord: jest.fn().mockResolvedValue({ id: 'nudge-created-3' }),
    };
    const userService = {
      getById: jest.fn().mockResolvedValue({ id: 'user-1', timezone: 'America/Los_Angeles' }),
    };

    const result = await processConditionReminders({
      medicationService,
      healthLogService,
      nudgeService,
      userService,
      isWithinReminderWindow: () => false,
    });

    expect(userService.getById).toHaveBeenCalledWith('user-1');
    expect(nudgeService.createRecord).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      usersChecked: 1,
      nudgesCreated: 0,
      skippedRecentLog: 0,
      skippedPendingNudge: 0,
    });
  });
});
