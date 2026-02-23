import { FirestoreMedicationReminderProcessingRepository } from '../FirestoreMedicationReminderProcessingRepository';

type RecordMap = Record<string, Record<string, unknown>>;

type State = {
  medicationReminders: RecordMap;
  medications: RecordMap;
  users: RecordMap;
  medicationLogs: RecordMap;
};

type QueryFilter = {
  field: string;
  op: '==' | '>=' | '<=';
  value: unknown;
};

function toMillis(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

function matchesFilters(record: Record<string, unknown>, filters: QueryFilter[]): boolean {
  return filters.every((filter) => {
    const fieldValue = record[filter.field];
    if (filter.op === '==') {
      return fieldValue === filter.value;
    }

    const left = toMillis(fieldValue);
    const right = toMillis(filter.value);
    if (left === null || right === null) {
      return false;
    }

    if (filter.op === '>=') {
      return left >= right;
    }
    return left <= right;
  });
}

function buildFirestoreMock(initial: Partial<State> = {}) {
  const state: State = {
    medicationReminders: { ...(initial.medicationReminders ?? {}) },
    medications: { ...(initial.medications ?? {}) },
    users: { ...(initial.users ?? {}) },
    medicationLogs: { ...(initial.medicationLogs ?? {}) },
  };

  const makeDocRef = (collectionName: keyof State, id: string) => ({
    id,
    path: `${collectionName}/${id}`,
    get: jest.fn(async () => ({
      exists: !!state[collectionName][id],
      id,
      data: () => state[collectionName][id],
      get: (field: string) => state[collectionName][id]?.[field],
    })),
    update: jest.fn(async (updates: Record<string, unknown>) => {
      const current = state[collectionName][id];
      if (!current) {
        throw new Error(`Missing document ${collectionName}/${id}`);
      }
      state[collectionName][id] = {
        ...current,
        ...updates,
      };
    }),
  });

  const buildQuery = (
    collectionName: 'medicationReminders' | 'medicationLogs',
    filters: QueryFilter[] = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
    startAfterId?: string,
  ): any => ({
    where: jest.fn((field: string, op: QueryFilter['op'], value: unknown) =>
      buildQuery(
        collectionName,
        [...filters, { field, op, value }],
        orderByField,
        orderDirection,
        limitValue,
        startAfterId,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(collectionName, filters, field, direction, limitValue, startAfterId),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(
        collectionName,
        filters,
        orderByField,
        orderDirection,
        nextLimit,
        startAfterId,
      ),
    ),
    startAfter: jest.fn((cursorId: string) =>
      buildQuery(
        collectionName,
        filters,
        orderByField,
        orderDirection,
        limitValue,
        cursorId,
      ),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state[collectionName])
        .filter(([, record]) => matchesFilters(record, filters))
        .map(([id, record]) => ({
          id,
          data: () => record,
          ref: makeDocRef(collectionName, id),
          get: (field: string) => record[field],
        }));

      if (orderByField) {
        docs = docs.sort((left, right) => {
          let leftValue: number | string = 0;
          let rightValue: number | string = 0;

          if (orderByField === '__name__') {
            leftValue = left.id;
            rightValue = right.id;
          } else {
            leftValue = toMillis(left.get(orderByField)) ?? String(left.get(orderByField) ?? '');
            rightValue =
              toMillis(right.get(orderByField)) ?? String(right.get(orderByField) ?? '');
          }

          const base = leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });
      }

      if (startAfterId) {
        const cursorIndex = docs.findIndex((doc) => doc.id === startAfterId);
        docs = cursorIndex >= 0 ? docs.slice(cursorIndex + 1) : docs;
      }

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

  const pendingBatchUpdates: Array<{ collection: keyof State; id: string; payload: Record<string, unknown> }> = [];
  const pendingBatchDeletes: Array<{ collection: keyof State; id: string }> = [];

  const db = {
    collection: jest.fn((name: string) => {
      if (
        name !== 'medicationReminders' &&
        name !== 'medications' &&
        name !== 'users' &&
        name !== 'medicationLogs'
      ) {
        throw new Error(`Unexpected collection: ${name}`);
      }

      const collectionName = name as keyof State;
      if (collectionName === 'medicationReminders' || collectionName === 'medicationLogs') {
        return {
          ...buildQuery(collectionName),
          doc: jest.fn((id: string) => makeDocRef(collectionName, id)),
        };
      }

      return {
        doc: jest.fn((id: string) => makeDocRef(collectionName, id)),
      };
    }),
    batch: jest.fn(() => ({
      update: jest.fn((ref: { path: string; id: string }, payload: Record<string, unknown>) => {
        const [collection] = ref.path.split('/') as [keyof State, string];
        pendingBatchUpdates.push({ collection, id: ref.id, payload });
      }),
      delete: jest.fn((ref: { path: string; id: string }) => {
        const [collection] = ref.path.split('/') as [keyof State, string];
        pendingBatchDeletes.push({ collection, id: ref.id });
      }),
      commit: jest.fn(async () => {
        pendingBatchUpdates.splice(0, pendingBatchUpdates.length).forEach((entry) => {
          const current = state[entry.collection][entry.id] ?? {};
          state[entry.collection][entry.id] = {
            ...current,
            ...entry.payload,
          };
        });
        pendingBatchDeletes.splice(0, pendingBatchDeletes.length).forEach((entry) => {
          delete state[entry.collection][entry.id];
        });
      }),
    })),
    runTransaction: jest.fn(async (updater: (tx: any) => Promise<boolean>) => {
      const stagedUpdates: Array<{ ref: { update: (payload: Record<string, unknown>) => Promise<void> }; payload: Record<string, unknown> }> = [];
      const tx = {
        get: jest.fn(async (ref: { get: () => Promise<unknown> }) => ref.get()),
        update: jest.fn(
          (
            ref: { update: (payload: Record<string, unknown>) => Promise<void> },
            payload: Record<string, unknown>,
          ) => {
            stagedUpdates.push({ ref, payload });
          },
        ),
      };

      const result = await updater(tx);
      for (const entry of stagedUpdates) {
        await entry.ref.update(entry.payload);
      }

      return result;
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

const makeTimestamp = (input: string): FirebaseFirestore.Timestamp => {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
};

describe('FirestoreMedicationReminderProcessingRepository', () => {
  it('lists enabled reminders, reads user timezone, medication state, and logs by date range', async () => {
    const harness = buildFirestoreMock({
      medicationReminders: {
        'rem-1': { userId: 'user-1', enabled: true, medicationId: 'med-1', medicationName: 'Tacrolimus' },
        'rem-2': { userId: 'user-1', enabled: false, medicationId: 'med-2', medicationName: 'Vitamin D' },
      },
      users: {
        'user-1': { timezone: 'America/New_York' },
      },
      medications: {
        'med-1': { active: true, deletedAt: null },
      },
      medicationLogs: {
        'log-1': { userId: 'user-1', loggedAt: makeTimestamp('2026-02-23T12:00:00.000Z') },
        'log-2': { userId: 'user-1', loggedAt: makeTimestamp('2026-02-25T12:00:00.000Z') },
      },
    });
    const repository = new FirestoreMedicationReminderProcessingRepository(harness.db);

    const reminders = await repository.listEnabledReminders();
    const timezone = await repository.getUserTimezoneValue('user-1');
    const medicationState = await repository.getMedicationState('med-1');
    const missingMedicationState = await repository.getMedicationState('med-404');
    const logs = await repository.listMedicationLogsByUserAndLoggedAtRange('user-1', {
      start: new Date('2026-02-23T00:00:00.000Z'),
      end: new Date('2026-02-24T00:00:00.000Z'),
    });

    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe('rem-1');
    expect(timezone).toBe('America/New_York');
    expect(medicationState).toMatchObject({
      id: 'med-1',
      exists: true,
      active: true,
      deletedAt: null,
    });
    expect(missingMedicationState).toMatchObject({
      id: 'med-404',
      exists: false,
      active: false,
      deletedAt: null,
    });
    expect(logs).toHaveLength(1);
  });

  it('acquires send lock when unlocked and rejects when active lock exists', async () => {
    const harness = buildFirestoreMock({
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          enabled: true,
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          lastSentLockUntil: makeTimestamp('2026-02-23T11:00:00.000Z'),
        },
        'rem-2': {
          userId: 'user-1',
          enabled: true,
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          lastSentLockUntil: makeTimestamp('2026-02-23T13:00:00.000Z'),
        },
      },
    });
    const repository = new FirestoreMedicationReminderProcessingRepository(harness.db);

    const acquired = await repository.acquireReminderSendLock(
      'rem-1',
      makeTimestamp('2026-02-23T12:00:00.000Z'),
      makeTimestamp('2026-02-23T12:10:00.000Z'),
    );
    const rejected = await repository.acquireReminderSendLock(
      'rem-2',
      makeTimestamp('2026-02-23T12:00:00.000Z'),
      makeTimestamp('2026-02-23T12:10:00.000Z'),
    );

    expect(acquired).toBe(true);
    expect(rejected).toBe(false);
    expect(harness.state.medicationReminders['rem-1']).toMatchObject({
      lastSentLockUntil: expect.objectContaining({
        toMillis: expect.any(Function),
      }),
    });
  });

  it('updates one reminder and applies batched reminder updates', async () => {
    const harness = buildFirestoreMock({
      medicationReminders: {
        'rem-1': { userId: 'user-1', enabled: true, medicationId: 'med-1', medicationName: 'Tacrolimus' },
        'rem-2': { userId: 'user-1', enabled: true, medicationId: 'med-1', medicationName: 'Tacrolimus' },
      },
    });
    const repository = new FirestoreMedicationReminderProcessingRepository(harness.db);

    await repository.updateReminderById('rem-1', {
      enabled: false,
      deletedBy: 'system:test',
    });
    const updatedCount = await repository.applyReminderUpdates([
      {
        reminderId: 'rem-1',
        updates: {
          lastSentAt: makeTimestamp('2026-02-23T12:00:00.000Z'),
        },
      },
      {
        reminderId: 'rem-2',
        updates: {
          lastSentAt: makeTimestamp('2026-02-23T12:05:00.000Z'),
        },
      },
    ]);

    expect(updatedCount).toBe(2);
    expect(harness.state.medicationReminders['rem-1']).toMatchObject({
      enabled: false,
      deletedBy: 'system:test',
      lastSentAt: expect.objectContaining({
        toMillis: expect.any(Function),
      }),
    });
    expect(harness.state.medicationReminders['rem-2']).toMatchObject({
      lastSentAt: expect.objectContaining({
        toMillis: expect.any(Function),
      }),
    });
  });

  it('returns ordered timing-backfill pages and cursor metadata', async () => {
    const harness = buildFirestoreMock({
      medicationReminders: {
        'rem-1': { userId: 'user-1', enabled: true, medicationId: 'med-1', medicationName: 'One' },
        'rem-2': { userId: 'user-1', enabled: true, medicationId: 'med-1', medicationName: 'Two' },
        'rem-3': { userId: 'user-1', enabled: true, medicationId: 'med-1', medicationName: 'Three' },
      },
    });
    const repository = new FirestoreMedicationReminderProcessingRepository(harness.db);

    const firstPage = await repository.listTimingBackfillPage({ limit: 2 });
    const secondPage = await repository.listTimingBackfillPage({
      limit: 2,
      cursorDocId: firstPage.nextCursor,
    });

    expect(firstPage.processedCount).toBe(2);
    expect(firstPage.items.map((item) => item.id)).toEqual(['rem-1', 'rem-2']);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBe('rem-2');

    expect(secondPage.processedCount).toBe(1);
    expect(secondPage.items.map((item) => item.id)).toEqual(['rem-3']);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('lists and deletes soft-deleted reminders by cutoff', async () => {
    const harness = buildFirestoreMock({
      medicationReminders: {
        'rem-old-1': {
          userId: 'user-1',
          enabled: false,
          medicationId: 'med-1',
          medicationName: 'One',
          deletedAt: makeTimestamp('2026-01-01T00:00:00.000Z'),
        },
        'rem-old-2': {
          userId: 'user-1',
          enabled: false,
          medicationId: 'med-1',
          medicationName: 'Two',
          deletedAt: makeTimestamp('2026-01-02T00:00:00.000Z'),
        },
        'rem-new': {
          userId: 'user-1',
          enabled: false,
          medicationId: 'med-1',
          medicationName: 'Three',
          deletedAt: makeTimestamp('2026-03-01T00:00:00.000Z'),
        },
      },
    });
    const repository = new FirestoreMedicationReminderProcessingRepository(harness.db);

    const oldReminders = await repository.listSoftDeletedByCutoff(
      makeTimestamp('2026-02-01T00:00:00.000Z'),
      10,
    );
    const deletedCount = await repository.deleteReminderIds(oldReminders.map((item) => item.id));

    expect(oldReminders.map((item) => item.id)).toEqual(['rem-old-1', 'rem-old-2']);
    expect(deletedCount).toBe(2);
    expect(harness.state.medicationReminders['rem-old-1']).toBeUndefined();
    expect(harness.state.medicationReminders['rem-old-2']).toBeUndefined();
    expect(harness.state.medicationReminders['rem-new']).toBeDefined();
  });
});
