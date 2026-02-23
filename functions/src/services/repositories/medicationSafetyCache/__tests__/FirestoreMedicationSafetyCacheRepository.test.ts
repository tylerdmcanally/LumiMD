import { FirestoreMedicationSafetyCacheRepository } from '../FirestoreMedicationSafetyCacheRepository';

type CacheState = Record<string, Record<string, unknown>>;

function buildFirestoreMock(initialState: CacheState = {}) {
  const state: CacheState = { ...initialState };
  const pendingDeletes: string[] = [];

  const createDocRef = (id: string) => ({
    id,
    get: jest.fn(async () => ({
      exists: Object.prototype.hasOwnProperty.call(state, id),
      id,
      data: () => state[id],
    })),
    set: jest.fn(async (data: Record<string, unknown>) => {
      state[id] = { ...data };
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'medicationSafetyCache') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        doc: jest.fn((id: string) => createDocRef(id)),
        where: jest.fn((field: string, op: string, value: unknown) => ({
          get: jest.fn(async () => {
            if (field !== 'userId' || op !== '==') {
              throw new Error(`Unexpected where clause: ${field} ${op}`);
            }

            const docs = Object.entries(state)
              .filter(([, data]) => data.userId === value)
              .map(([id, data]) => ({
                id,
                data: () => data,
              }));

            return {
              docs,
              empty: docs.length === 0,
              size: docs.length,
            };
          }),
        })),
      };
    }),
    batch: jest.fn(() => ({
      delete: jest.fn((ref: { id: string }) => {
        pendingDeletes.push(ref.id);
      }),
      commit: jest.fn(async () => {
        pendingDeletes.splice(0, pendingDeletes.length).forEach((id) => {
          delete state[id];
        });
      }),
    })),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

describe('FirestoreMedicationSafetyCacheRepository', () => {
  it('prefers user-scoped cache docs and falls back to legacy keys', async () => {
    const harness = buildFirestoreMock({
      'user-1_cache-key': { warnings: [{ message: 'scoped' }] },
      'cache-key': { warnings: [{ message: 'legacy' }] },
    });
    const repository = new FirestoreMedicationSafetyCacheRepository(harness.db);

    const scoped = await repository.getByUserAndCacheKey('user-1', 'cache-key');
    const legacy = await repository.getByUserAndCacheKey('user-2', 'cache-key');

    expect(scoped?.id).toBe('user-1_cache-key');
    expect(scoped?.warnings).toEqual([{ message: 'scoped' }]);
    expect(legacy?.id).toBe('cache-key');
    expect(legacy?.warnings).toEqual([{ message: 'legacy' }]);
  });

  it('writes user-scoped cache docs with setByUserAndCacheKey', async () => {
    const harness = buildFirestoreMock();
    const repository = new FirestoreMedicationSafetyCacheRepository(harness.db);

    await repository.setByUserAndCacheKey('user-3', 'key-1', {
      warnings: [{ severity: 'low' }],
      userId: 'user-3',
    });

    expect(harness.state['user-3_key-1']).toEqual({
      warnings: [{ severity: 'low' }],
      userId: 'user-3',
    });
  });

  it('lists and deletes all cache docs for a user', async () => {
    const harness = buildFirestoreMock({
      'doc-1': { userId: 'user-4', warnings: [] },
      'doc-2': { userId: 'user-4', warnings: [] },
      'doc-3': { userId: 'user-5', warnings: [] },
    });
    const repository = new FirestoreMedicationSafetyCacheRepository(harness.db);

    const records = await repository.listByUser('user-4');
    const deleted = await repository.deleteByIds(records.map((record) => record.id));

    expect(records.map((record) => record.id).sort()).toEqual(['doc-1', 'doc-2']);
    expect(deleted).toBe(2);
    expect(harness.state['doc-1']).toBeUndefined();
    expect(harness.state['doc-2']).toBeUndefined();
    expect(harness.state['doc-3']).toBeDefined();
  });
});
