import type { MedicationChangeEntry } from '../openai';
import {
  fetchActiveMedicationsForUser,
  runHardcodedSafetyChecks,
} from '../medicationSafety';

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('medicationSafety repository bridge', () => {
  it('fetches medication records through domain dependencies and filters active results', async () => {
    const medicationService = {
      listAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'med-excluded',
          userId: 'user-1',
          name: 'Lisinopril',
          canonicalName: 'lisinopril',
          active: true,
        },
        {
          id: 'med-canonical-excluded',
          userId: 'user-1',
          name: 'Metformin',
          canonicalName: 'metformin',
          active: true,
        },
        {
          id: 'med-inactive',
          userId: 'user-1',
          name: 'Aspirin',
          active: false,
        },
        {
          id: 'med-deleted',
          userId: 'user-1',
          name: 'Atorvastatin',
          active: true,
          deleted: true,
        },
        {
          id: 'med-stopped',
          userId: 'user-1',
          name: 'Losartan',
          active: true,
          stoppedAt: makeTimestamp('2026-02-01T00:00:00.000Z'),
        },
        {
          id: 'med-keep',
          userId: 'user-1',
          name: 'Warfarin',
          canonicalName: 'warfarin',
          active: true,
          dose: '5 mg',
          frequency: 'daily',
        },
      ]),
    };

    const medications = await fetchActiveMedicationsForUser(
      'user-1',
      {
        excludeMedicationId: 'med-excluded',
        excludeCanonicalName: 'Metformin',
      },
      { medicationService },
    );

    expect(medicationService.listAllForUser).toHaveBeenCalledWith('user-1', {
      includeDeleted: true,
    });
    expect(medications).toEqual([
      expect.objectContaining({
        id: 'med-keep',
        name: 'Warfarin',
        canonicalName: 'warfarin',
        dose: '5 mg',
        frequency: 'daily',
      }),
    ]);
  });

  it('runs hardcoded checks with user/medication domain dependencies', async () => {
    const medicationService = {
      listAllForUser: jest.fn().mockResolvedValue([]),
    };
    const userService = {
      getById: jest.fn().mockResolvedValue({
        id: 'user-1',
        allergies: ['penicillin'],
      }),
    };

    const warnings = await runHardcodedSafetyChecks(
      'user-1',
      { name: 'penicillin' } as MedicationChangeEntry,
      undefined,
      { medicationService, userService },
    );

    expect(medicationService.listAllForUser).toHaveBeenCalledWith('user-1', {
      includeDeleted: true,
    });
    expect(userService.getById).toHaveBeenCalledWith('user-1');
    expect(warnings.some((warning) => warning.type === 'allergy_alert')).toBe(true);
  });
});
