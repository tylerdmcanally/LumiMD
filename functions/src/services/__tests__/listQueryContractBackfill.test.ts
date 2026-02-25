import {
  LIST_QUERY_CONTRACT_BACKFILL_STATE_DOC_ID,
  backfillListQueryContractData,
  buildListQueryContractUpdates,
} from '../listQueryContractBackfill';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  visits: Record<string, RecordMap>;
  actions: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  systemMaintenance: Record<string, RecordMap>;
};

type CollectionName = keyof HarnessState;

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    visits: { ...(initial?.visits ?? {}) },
    actions: { ...(initial?.actions ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    systemMaintenance: { ...(initial?.systemMaintenance ?? {}) },
  };

  const makeDocRef = (collection: CollectionName, id: string) => ({
    id,
    __collection: collection,
  });

  const buildQuery = (
    collection: CollectionName,
    cursorDocId?: string | null,
    limitValue?: number,
  ): any => ({
    orderBy: jest.fn(() => buildQuery(collection, cursorDocId, limitValue)),
    startAfter: jest.fn((cursor: string) => buildQuery(collection, cursor, limitValue)),
    limit: jest.fn((nextLimit: number) => buildQuery(collection, cursorDocId, nextLimit)),
    get: jest.fn(async () => {
      let entries = Object.entries(state[collection]).sort(([leftId], [rightId]) =>
        leftId.localeCompare(rightId),
      );

      if (cursorDocId) {
        entries = entries.filter(([id]) => id > cursorDocId);
      }

      if (typeof limitValue === 'number') {
        entries = entries.slice(0, limitValue);
      }

      const docs = entries.map(([id, row]) => ({
        id,
        data: () => row,
        ref: makeDocRef(collection, id),
      }));

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
      };
    }),
    doc: jest.fn((id: string) => ({
      id,
      __collection: collection,
      get: jest.fn(async () => ({
        exists: Boolean(state[collection][id]),
        id,
        data: () => state[collection][id],
      })),
      set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
        if (options?.merge && state[collection][id]) {
          state[collection][id] = {
            ...state[collection][id],
            ...data,
          };
          return;
        }

        state[collection][id] = { ...data };
      }),
    })),
  });

  const batchOperations: Array<() => void> = [];
  const batch = {
    update: jest.fn((ref: { id: string; __collection: CollectionName }, updates: RecordMap) => {
      batchOperations.push(() => {
        state[ref.__collection][ref.id] = {
          ...state[ref.__collection][ref.id],
          ...updates,
        };
      });
    }),
    commit: jest.fn(async () => {
      for (const operation of batchOperations.splice(0, batchOperations.length)) {
        operation();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name in state) {
        return buildQuery(name as CollectionName);
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => batch),
  } as unknown as FirebaseFirestore.Firestore;

  return {
    state,
    db,
    batch,
  };
}

describe('listQueryContractBackfill', () => {
  it('builds updates for missing list-query fields', () => {
    const now = makeTimestamp('2026-02-24T10:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;

    const visitUpdates = buildListQueryContractUpdates('visits', { userId: 'user-1' }, now);
    expect(visitUpdates).toMatchObject({
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
    });

    const medicationUpdates = buildListQueryContractUpdates(
      'medications',
      { medicationName: '  Metformin  ', deletedAt: null, deletedBy: null },
      now,
    );
    expect(medicationUpdates).toMatchObject({
      name: 'Metformin',
      createdAt: now,
    });
  });

  it('backfills legacy docs and persists completion state', async () => {
    const now = makeTimestamp('2026-02-24T11:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const visitDate = makeTimestamp('2025-05-01T08:30:00.000Z');
    const dueAt = makeTimestamp('2025-05-02T09:00:00.000Z');
    const changedAt = makeTimestamp('2025-05-03T10:00:00.000Z');
    const harness = buildHarness({
      visits: {
        'visit-1': { userId: 'user-1', visitDate },
      },
      actions: {
        'action-1': { userId: 'user-1', dueAt },
      },
      medications: {
        'med-1': { userId: 'user-1', medicationName: 'Lisinopril', changedAt },
      },
    });

    const result = await backfillListQueryContractData({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now,
      pageSize: 10,
    });

    expect(result).toMatchObject({
      processedVisits: 1,
      updatedVisits: 1,
      processedActions: 1,
      updatedActions: 1,
      processedMedications: 1,
      updatedMedications: 1,
      hasMore: false,
      cursors: {
        visitsCursorDocId: null,
        actionsCursorDocId: null,
        medicationsCursorDocId: null,
      },
    });

    expect(harness.state.visits['visit-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
      createdAt: visitDate,
    });
    expect(harness.state.actions['action-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
      createdAt: dueAt,
    });
    expect(harness.state.medications['med-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
      createdAt: changedAt,
      name: 'Lisinopril',
    });

    const stateDoc = harness.state.systemMaintenance[LIST_QUERY_CONTRACT_BACKFILL_STATE_DOC_ID];
    expect(stateDoc).toBeDefined();
    expect(stateDoc.completedAt).toBe(now);
  });

  it('uses cursors to continue paged runs', async () => {
    const now = makeTimestamp('2026-02-24T12:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const later = makeTimestamp('2026-02-24T13:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      visits: {
        'visit-a': { userId: 'user-1' },
        'visit-b': { userId: 'user-1' },
      },
    });

    const firstRun = await backfillListQueryContractData({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now,
      pageSize: 1,
    });

    expect(firstRun.processedVisits).toBe(1);
    expect(firstRun.hasMore).toBe(true);
    expect(firstRun.cursors.visitsCursorDocId).toBe('visit-a');

    const secondRun = await backfillListQueryContractData({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now: later,
      pageSize: 1,
    });

    expect(secondRun.processedVisits).toBe(1);
    expect(secondRun.hasMore).toBe(false);
    expect(secondRun.cursors.visitsCursorDocId).toBeNull();
    expect(harness.state.visits['visit-a'].deletedAt).toBeNull();
    expect(harness.state.visits['visit-b'].deletedAt).toBeNull();
  });

  it('supports dry-run without mutating docs or state cursors', async () => {
    const now = makeTimestamp('2026-02-24T14:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      actions: {
        'action-1': { userId: 'user-1' },
      },
    });

    const result = await backfillListQueryContractData({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now,
      dryRun: true,
      pageSize: 25,
    });

    expect(result.dryRun).toBe(true);
    expect(result.updatedActions).toBe(1);
    expect(harness.state.actions['action-1'].deletedAt).toBeUndefined();
    expect(harness.state.systemMaintenance[LIST_QUERY_CONTRACT_BACKFILL_STATE_DOC_ID]).toBeUndefined();
  });
});
