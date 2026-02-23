import { FirestoreExternalDrugSafetyCacheRepository } from '../FirestoreExternalDrugSafetyCacheRepository';

type CacheState = Record<string, Record<string, unknown>>;

function buildFirestoreMock(initialState: CacheState = {}) {
  const state: CacheState = { ...initialState };

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'medicationSafetyExternalCache') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        doc: jest.fn((id: string) => ({
          get: jest.fn(async () => ({
            exists: Object.prototype.hasOwnProperty.call(state, id),
            id,
            data: () => state[id],
          })),
          set: jest.fn(async (data: Record<string, unknown>) => {
            state[id] = { ...data };
          }),
        })),
      };
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

describe('FirestoreExternalDrugSafetyCacheRepository', () => {
  it('reads user-scoped cache docs by cache key', async () => {
    const harness = buildFirestoreMock({
      'user-1_cache-key': {
        warnings: [{ type: 'drug_interaction' }],
      },
    });
    const repository = new FirestoreExternalDrugSafetyCacheRepository(harness.db);

    const record = await repository.getByUserAndCacheKey('user-1', 'cache-key');

    expect(record?.id).toBe('user-1_cache-key');
    expect(record?.warnings).toEqual([{ type: 'drug_interaction' }]);
  });

  it('writes user-scoped cache docs', async () => {
    const harness = buildFirestoreMock();
    const repository = new FirestoreExternalDrugSafetyCacheRepository(harness.db);

    await repository.setByUserAndCacheKey('user-2', 'cache-key', {
      userId: 'user-2',
      warnings: [{ type: 'drug_interaction' }],
    });

    expect(harness.state['user-2_cache-key']).toEqual({
      userId: 'user-2',
      warnings: [{ type: 'drug_interaction' }],
    });
  });
});
