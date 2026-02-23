import { syncMedicationsFromSummary } from '../medicationSync';
import { clearMedicationSafetyCacheForUser } from '../medicationSafetyAI';

jest.mock('../medicationSafety', () => {
  const actual = jest.requireActual('../medicationSafety');
  return {
    ...actual,
    runMedicationSafetyChecks: jest.fn(async () => []),
    addSafetyWarningsToEntry: jest.fn((entry: unknown) => entry),
  };
});

jest.mock('../medicationSafetyAI', () => ({
  clearMedicationSafetyCacheForUser: jest.fn(async () => undefined),
}));

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('medicationSync repository bridge', () => {
  it('warms medication lookup cache through injected repository list calls', async () => {
    const listByUser = jest.fn().mockResolvedValue([
      {
        id: 'med-1',
        data: () => ({
          canonicalName: 'lisinopril',
          nameLower: 'lisinopril',
        }),
      },
    ]);

    await syncMedicationsFromSummary(
      {
        userId: 'user-1',
        visitId: 'visit-1',
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        processedAt: makeTimestamp('2026-02-23T12:00:00.000Z'),
      },
      {
        medicationSyncRepository: {
          create: jest.fn(),
          updateById: jest.fn(),
          listByUser,
          findByUserAndCanonicalName: jest.fn(),
          findByUserAndNameLower: jest.fn(),
          listPendingNudgesByMedication: jest.fn().mockResolvedValue([]),
          listRemindersByMedication: jest.fn().mockResolvedValue([]),
          createReminder: jest.fn(),
          deleteByRefs: jest.fn().mockResolvedValue(0),
        },
      },
    );

    expect(listByUser).toHaveBeenCalledWith('user-1');
    expect(clearMedicationSafetyCacheForUser).toHaveBeenCalledWith('user-1');
  });

  it('routes reminder side-effect reads/writes through injected repository methods', async () => {
    const updateById = jest.fn().mockResolvedValue(undefined);
    const existingDoc = {
      id: 'med-existing',
      get: jest.fn((field: string) => {
        if (field === 'active') return true;
        if (field === 'startedAt') return makeTimestamp('2026-01-01T00:00:00.000Z');
        return null;
      }),
    };

    const listRemindersByMedication = jest
      .fn()
      .mockResolvedValueOnce([]); // existing reminder check (limit:1)
    const createReminder = jest.fn().mockResolvedValue('rem-1');

    await syncMedicationsFromSummary(
      {
        userId: 'user-2',
        visitId: 'visit-2',
        medications: {
          started: [{ name: 'Lisinopril', frequency: 'daily' }],
          stopped: [],
          changed: [],
        },
        processedAt: makeTimestamp('2026-02-23T12:10:00.000Z'),
      },
      {
        medicationSyncRepository: {
          create: jest.fn(),
          updateById,
          listByUser: jest.fn().mockResolvedValue([]),
          findByUserAndCanonicalName: jest.fn().mockResolvedValue(existingDoc),
          findByUserAndNameLower: jest.fn().mockResolvedValue(null),
          listPendingNudgesByMedication: jest.fn().mockResolvedValue([]),
          listRemindersByMedication,
          createReminder,
          deleteByRefs: jest.fn().mockResolvedValue(0),
        },
      },
    );

    expect(updateById).toHaveBeenCalledTimes(1);
    expect(updateById).toHaveBeenCalledWith(
      'med-existing',
      expect.objectContaining({
        userId: 'user-2',
        name: 'Lisinopril',
      }),
    );
    expect(listRemindersByMedication).toHaveBeenCalledWith(
      'user-2',
      'med-existing',
      { limit: 1 },
    );
    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        medicationId: 'med-existing',
        medicationName: 'Lisinopril',
      }),
    );
  });
});
