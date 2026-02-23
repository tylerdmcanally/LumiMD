import type { MedicationChangeEntry } from '../openai';
import {
  clearMedicationSafetyCacheForUser,
  runAIBasedSafetyChecks,
} from '../medicationSafetyAI';

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('medicationSafetyAI repository bridge', () => {
  it('returns cached warnings through injected cache repository reads', async () => {
    const medicationService = {
      listAllForUser: jest.fn().mockResolvedValue([]),
    };
    const userService = {
      getById: jest.fn().mockResolvedValue({
        id: 'user-1',
        allergies: [],
      }),
    };
    const cacheRepository = {
      getByUserAndCacheKey: jest.fn().mockResolvedValue({
        id: 'user-1_cache-key',
        createdAt: makeTimestamp('2026-02-23T10:00:00.000Z'),
        warnings: [
          {
            type: 'drug_interaction',
            severity: 'high',
            message: 'Potential interaction',
            details: 'Interaction details',
            recommendation: 'Review with prescriber',
          },
        ],
      }),
      setByUserAndCacheKey: jest.fn(),
      listByUser: jest.fn(),
      deleteByIds: jest.fn(),
    };

    const warnings = await runAIBasedSafetyChecks(
      'user-1',
      { name: 'Metformin' } as MedicationChangeEntry,
      undefined,
      { medicationService, userService, cacheRepository },
    );

    expect(medicationService.listAllForUser).toHaveBeenCalledWith('user-1', {
      includeDeleted: true,
    });
    expect(userService.getById).toHaveBeenCalledWith('user-1');
    expect(cacheRepository.getByUserAndCacheKey).toHaveBeenCalledTimes(1);
    expect(cacheRepository.setByUserAndCacheKey).not.toHaveBeenCalled();
    expect(warnings).toEqual([
      {
        type: 'drug_interaction',
        severity: 'high',
        message: 'Potential interaction',
        details: 'Interaction details',
        recommendation: 'Review with prescriber',
      },
    ]);
  });

  it('clears cached docs through injected cache repository write path', async () => {
    const cacheRepository = {
      getByUserAndCacheKey: jest.fn(),
      setByUserAndCacheKey: jest.fn(),
      listByUser: jest.fn().mockResolvedValue([
        { id: 'cache-a' },
        { id: 'cache-b' },
      ]),
      deleteByIds: jest.fn().mockResolvedValue(2),
    };

    await clearMedicationSafetyCacheForUser('user-2', { cacheRepository });

    expect(cacheRepository.listByUser).toHaveBeenCalledWith('user-2');
    expect(cacheRepository.deleteByIds).toHaveBeenCalledWith(['cache-a', 'cache-b']);
  });
});
