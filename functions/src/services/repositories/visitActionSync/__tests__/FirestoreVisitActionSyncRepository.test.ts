import { FirestoreVisitActionSyncRepository } from '../FirestoreVisitActionSyncRepository';

type RecordMap = Record<string, Record<string, unknown>>;

function buildFirestoreMock(initialActions: RecordMap = {}) {
  const actions: RecordMap = { ...initialActions };
  let generatedActionId = Object.keys(actions).length + 1;

  const batchDeletes: string[] = [];
  const batchSets: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const batch = {
    delete: jest.fn((ref: { id: string }) => {
      batchDeletes.push(ref.id);
    }),
    set: jest.fn((ref: { id: string }, payload: Record<string, unknown>) => {
      batchSets.push({ id: ref.id, payload });
    }),
  } as unknown as FirebaseFirestore.WriteBatch;

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'actions') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        where: jest.fn((field: string, _op: string, value: unknown) => ({
          get: jest.fn(async () => ({
            docs: Object.entries(actions)
              .filter(([, action]) => action[field] === value)
              .map(([id]) => ({
                id,
                ref: { id, path: `actions/${id}` },
              })),
          })),
        })),
        doc: jest.fn(() => ({ id: `action-${generatedActionId++}` })),
      };
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return {
    db,
    batch,
    batchDeletes,
    batchSets,
  };
}

describe('FirestoreVisitActionSyncRepository', () => {
  it('queues existing-action deletes and replacement inserts for a visit', async () => {
    const harness = buildFirestoreMock({
      'action-old-1': { visitId: 'visit-1', description: 'Old action 1' },
      'action-old-2': { visitId: 'visit-1', description: 'Old action 2' },
      'action-other': { visitId: 'visit-2', description: 'Other visit action' },
    });
    const repository = new FirestoreVisitActionSyncRepository(harness.db);

    await repository.replaceForVisit(harness.batch, {
      visitId: 'visit-1',
      payloads: [
        { visitId: 'visit-1', description: 'New action A' },
        { visitId: 'visit-1', description: 'New action B' },
      ],
    });

    expect(harness.batchDeletes).toEqual(['action-old-1', 'action-old-2']);
    expect(harness.batchSets).toEqual([
      {
        id: 'action-4',
        payload: expect.objectContaining({ visitId: 'visit-1', description: 'New action A' }),
      },
      {
        id: 'action-5',
        payload: expect.objectContaining({ visitId: 'visit-1', description: 'New action B' }),
      },
    ]);
  });
});
