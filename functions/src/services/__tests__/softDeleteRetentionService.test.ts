import * as admin from 'firebase-admin';
import { purgeSoftDeletedCollections } from '../softDeleteRetentionService';

type RecordMap = Record<string, any>;

type HarnessState = {
  actions: Record<string, RecordMap>;
  visits: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  healthLogs: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
  careTasks: Record<string, RecordMap>;
};

type QueryFilter = {
  field: string;
  operator: '<=';
  value: unknown;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
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

function makeQuerySnapshot(docs: any[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    actions: { ...(initial?.actions ?? {}) },
    visits: { ...(initial?.visits ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    healthLogs: { ...(initial?.healthLogs ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    careTasks: { ...(initial?.careTasks ?? {}) },
  };

  const buildQuery = (
    collectionName: keyof HarnessState,
    filters: QueryFilter[] = [],
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: '<=', value: unknown) =>
      buildQuery(
        collectionName,
        [...filters, { field, operator, value }],
        orderDirection,
        limitValue,
      ),
    ),
    orderBy: jest.fn((_field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(collectionName, filters, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(collectionName, filters, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state[collectionName])
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
          const base = leftMillis === rightMillis ? 0 : leftMillis > rightMillis ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return makeQuerySnapshot(docs);
    }),
  });

  const batchOperations: Array<() => void> = [];
  const batch = {
    delete: jest.fn((ref: { id: string; path: string }) => {
      batchOperations.push(() => {
        const [collectionName] = ref.path.split('/') as [keyof HarnessState, string];
        delete state[collectionName][ref.id];
      });
    }),
    update: jest.fn(),
    set: jest.fn(),
    commit: jest.fn(async () => {
      for (const operation of batchOperations.splice(0, batchOperations.length)) {
        operation();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: keyof HarnessState) => ({
      where: jest.fn((field: string, operator: '<=', value: unknown) =>
        buildQuery(name, [{ field, operator, value }]),
      ),
    })),
    batch: jest.fn(() => batch),
  };

  return { state, db, batch };
}

describe('purgeSoftDeletedCollections', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
    (firestoreMock as any).Timestamp = {
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('purges only records older than retention across configured collections', async () => {
    const harness = buildHarness({
      actions: {
        'action-old': { deletedAt: makeTimestamp('2025-10-01T12:00:00.000Z') },
        'action-recent': { deletedAt: makeTimestamp('2026-03-15T12:00:00.000Z') },
        'action-active': { deletedAt: null },
      },
      visits: {
        'visit-old': { deletedAt: makeTimestamp('2025-09-01T12:00:00.000Z') },
      },
      medications: {},
      healthLogs: {},
      medicationReminders: {
        'rem-old': { deletedAt: makeTimestamp('2025-11-01T12:00:00.000Z') },
      },
      careTasks: {
        'task-recent': { deletedAt: makeTimestamp('2026-03-20T12:00:00.000Z') },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await purgeSoftDeletedCollections({
      retentionDays: 90,
      pageSize: 10,
    });

    expect(result.totalPurged).toBe(3);
    expect(result.totalScanned).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(harness.state.actions['action-old']).toBeUndefined();
    expect(harness.state.visits['visit-old']).toBeUndefined();
    expect(harness.state.medicationReminders['rem-old']).toBeUndefined();
    expect(harness.state.actions['action-recent']).toBeDefined();
    expect(harness.state.actions['action-active']).toBeDefined();
    expect(harness.state.careTasks['task-recent']).toBeDefined();
  });

  it('respects page size and reports hasMore when additional records remain', async () => {
    const harness = buildHarness({
      actions: {
        'action-old-1': { deletedAt: makeTimestamp('2025-10-01T12:00:00.000Z') },
        'action-old-2': { deletedAt: makeTimestamp('2025-10-02T12:00:00.000Z') },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await purgeSoftDeletedCollections({
      retentionDays: 90,
      pageSize: 1,
      collections: ['actions'],
    });

    expect(result.totalPurged).toBe(1);
    expect(result.totalScanned).toBe(1);
    expect(result.hasMore).toBe(true);
    expect(Object.keys(harness.state.actions)).toHaveLength(1);
  });
});
