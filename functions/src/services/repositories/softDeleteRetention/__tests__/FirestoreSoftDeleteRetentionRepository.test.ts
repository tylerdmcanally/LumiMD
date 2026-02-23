import { FirestoreSoftDeleteRetentionRepository } from '../FirestoreSoftDeleteRetentionRepository';

type RecordMap = Record<string, Record<string, unknown>>;
type Store = Record<string, RecordMap>;

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

function toMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in (value as Record<string, unknown>) &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

function buildFirestoreMock(initialState: Store) {
  const state: Store = Object.fromEntries(
    Object.entries(initialState).map(([collection, records]) => [
      collection,
      { ...(records ?? {}) },
    ]),
  ) as Store;
  const pendingDeletes: Array<{ collection: string; id: string }> = [];

  const db = {
    collection: jest.fn((collectionName: string) => {
      const buildQuery = (
        filters: Array<{ field: string; value: unknown }> = [],
        limitValue?: number,
      ): any => ({
        where: jest.fn((field: string, _op: string, value: unknown) =>
          buildQuery([...filters, { field, value }], limitValue),
        ),
        orderBy: jest.fn(() => buildQuery(filters, limitValue)),
        limit: jest.fn((nextLimit: number) => buildQuery(filters, nextLimit)),
        get: jest.fn(async () => {
          let docs = Object.entries(state[collectionName] ?? {})
            .filter(([, record]) =>
              filters.every((filter) => {
                const left = toMillis(record[filter.field]);
                const right = toMillis(filter.value);
                if (left === null || right === null) {
                  return false;
                }
                return left <= right;
              }),
            )
            .map(([id, record]) => ({
              id,
              data: () => record,
              ref: {
                id,
                path: `${collectionName}/${id}`,
              },
            }))
            .sort((left, right) => {
              const leftMillis = toMillis(left.data().deletedAt) ?? 0;
              const rightMillis = toMillis(right.data().deletedAt) ?? 0;
              return leftMillis - rightMillis;
            });

          if (typeof limitValue === 'number') {
            docs = docs.slice(0, limitValue);
          }

          return {
            docs,
            empty: docs.length === 0,
            size: docs.length,
          };
        }),
      });

      return buildQuery();
    }),
    batch: jest.fn(() => ({
      delete: jest.fn((ref: { id: string; path: string }) => {
        const [collection] = ref.path.split('/');
        pendingDeletes.push({ collection, id: ref.id });
      }),
      commit: jest.fn(async () => {
        pendingDeletes.splice(0, pendingDeletes.length).forEach(({ collection, id }) => {
          if (!state[collection]) {
            return;
          }
          delete state[collection][id];
        });
      }),
    })),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

describe('FirestoreSoftDeleteRetentionRepository', () => {
  it('lists soft-deleted records up to the provided limit', async () => {
    const harness = buildFirestoreMock({
      actions: {
        'action-old': { deletedAt: makeTimestamp('2025-10-01T00:00:00.000Z') },
        'action-recent': { deletedAt: makeTimestamp('2026-03-20T00:00:00.000Z') },
      },
    });
    const repository = new FirestoreSoftDeleteRetentionRepository(harness.db);

    const records = await repository.listSoftDeleted(
      'actions',
      makeTimestamp('2026-01-01T00:00:00.000Z'),
      10,
    );

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('action-old');
  });

  it('purges records by document references', async () => {
    const harness = buildFirestoreMock({
      actions: {
        'action-old-1': { deletedAt: makeTimestamp('2025-10-01T00:00:00.000Z') },
        'action-old-2': { deletedAt: makeTimestamp('2025-10-02T00:00:00.000Z') },
      },
    });
    const repository = new FirestoreSoftDeleteRetentionRepository(harness.db);

    const records = await repository.listSoftDeleted(
      'actions',
      makeTimestamp('2026-01-01T00:00:00.000Z'),
      10,
    );
    const purged = await repository.purgeByRefs(records.map((record) => record.ref));

    expect(purged).toBe(2);
    expect(Object.keys(harness.state.actions)).toHaveLength(0);
  });
});
