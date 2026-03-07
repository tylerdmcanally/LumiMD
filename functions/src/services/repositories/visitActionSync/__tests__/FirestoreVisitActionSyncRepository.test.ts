import { FirestoreVisitActionSyncRepository } from '../FirestoreVisitActionSyncRepository';

// Mock firebase-admin Timestamp
jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      now: jest.fn(() => ({ _seconds: 1000000000, _nanoseconds: 0, toDate: () => new Date() })),
    },
  },
}));

type RecordMap = Record<string, Record<string, unknown>>;

function buildFirestoreMock(initialActions: RecordMap = {}) {
  const actions: RecordMap = { ...initialActions };
  let generatedActionId = Object.keys(actions).length + 1;

  const batchUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const batchSets: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const batch = {
    update: jest.fn((ref: { id: string }, data: Record<string, unknown>) => {
      batchUpdates.push({ id: ref.id, data });
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
        where: jest.fn((_field: string, _op: string, _value: unknown) => {
          // Support chained .where() calls by collecting all filters
          const filters: Array<{ field: string; value: unknown }> = [
            { field: _field, value: _value },
          ];

          const chainable: Record<string, unknown> = {
            where: jest.fn((field2: string, _op2: string, value2: unknown) => {
              filters.push({ field: field2, value: value2 });
              return chainable;
            }),
            get: jest.fn(async () => ({
              docs: Object.entries(actions)
                .filter(([, action]) =>
                  filters.every((f) => action[f.field] === f.value),
                )
                .map(([id]) => ({
                  id,
                  ref: { id, path: `actions/${id}` },
                })),
            })),
          };

          return chainable;
        }),
        doc: jest.fn(() => ({ id: `action-${generatedActionId++}` })),
      };
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return {
    db,
    batch,
    batchUpdates,
    batchSets,
  };
}

describe('FirestoreVisitActionSyncRepository', () => {
  it('soft-deletes existing actions and inserts replacements for a visit', async () => {
    const harness = buildFirestoreMock({
      'action-old-1': { visitId: 'visit-1', description: 'Old action 1', deletedAt: null },
      'action-old-2': { visitId: 'visit-1', description: 'Old action 2', deletedAt: null },
      'action-other': { visitId: 'visit-2', description: 'Other visit action', deletedAt: null },
    });
    const repository = new FirestoreVisitActionSyncRepository(harness.db);

    await repository.replaceForVisit(harness.batch, {
      visitId: 'visit-1',
      payloads: [
        { visitId: 'visit-1', description: 'New action A' },
        { visitId: 'visit-1', description: 'New action B' },
      ],
    });

    // Old actions should be soft-deleted (update, not delete)
    expect(harness.batchUpdates).toHaveLength(2);
    expect(harness.batchUpdates[0].id).toBe('action-old-1');
    expect(harness.batchUpdates[0].data).toEqual(
      expect.objectContaining({
        deletedBy: 'system:visit-reprocess',
      }),
    );
    expect(harness.batchUpdates[0].data.deletedAt).toBeDefined();
    expect(harness.batchUpdates[0].data.updatedAt).toBeDefined();

    expect(harness.batchUpdates[1].id).toBe('action-old-2');

    // New actions should be inserted
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

  it('skips already-deleted actions during replacement', async () => {
    const harness = buildFirestoreMock({
      'action-active': { visitId: 'visit-1', description: 'Active action', deletedAt: null },
      'action-deleted': { visitId: 'visit-1', description: 'Deleted action', deletedAt: 'some-timestamp' },
    });
    const repository = new FirestoreVisitActionSyncRepository(harness.db);

    await repository.replaceForVisit(harness.batch, {
      visitId: 'visit-1',
      payloads: [{ visitId: 'visit-1', description: 'Replacement' }],
    });

    // Only the active action should be soft-deleted
    expect(harness.batchUpdates).toHaveLength(1);
    expect(harness.batchUpdates[0].id).toBe('action-active');
  });
});
