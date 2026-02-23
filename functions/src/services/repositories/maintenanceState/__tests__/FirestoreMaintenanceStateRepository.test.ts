import { FirestoreMaintenanceStateRepository } from '../FirestoreMaintenanceStateRepository';

type StateMap = Record<string, Record<string, unknown>>;

function buildFirestoreMock(initialState: StateMap = {}) {
  const state: StateMap = { ...initialState };

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'systemMaintenance') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        doc: jest.fn((id: string) => ({
          get: jest.fn(async () => ({
            exists: Object.prototype.hasOwnProperty.call(state, id),
            data: () => state[id],
          })),
          set: jest.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            if (options?.merge === false) {
              state[id] = { ...data };
              return;
            }

            state[id] = {
              ...(state[id] ?? {}),
              ...data,
            };
          }),
        })),
      };
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

describe('FirestoreMaintenanceStateRepository', () => {
  it('returns null for missing state documents', async () => {
    const harness = buildFirestoreMock();
    const repository = new FirestoreMaintenanceStateRepository(harness.db);

    const state = await repository.getState('missing-doc');

    expect(state).toBeNull();
  });

  it('merges by default when writing state', async () => {
    const harness = buildFirestoreMock({
      'state-doc': { cursorDocId: 'cursor-1', processed: 10 },
    });
    const repository = new FirestoreMaintenanceStateRepository(harness.db);

    await repository.setState('state-doc', { processed: 20 });

    expect(harness.state['state-doc']).toEqual({
      cursorDocId: 'cursor-1',
      processed: 20,
    });
  });

  it('replaces data when merge=false is provided', async () => {
    const harness = buildFirestoreMock({
      'state-doc': { cursorDocId: 'cursor-1', processed: 10 },
    });
    const repository = new FirestoreMaintenanceStateRepository(harness.db);

    await repository.setState('state-doc', { processed: 0 }, { merge: false });

    expect(harness.state['state-doc']).toEqual({
      processed: 0,
    });
  });
});
