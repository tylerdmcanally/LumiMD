import {
  DENORMALIZATION_BACKFILL_STATE_DOC_ID,
  backfillDenormalizedFields,
} from '../denormalizationSync';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  shares: Record<string, RecordMap>;
  shareInvites: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
  users: Record<string, RecordMap>;
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
    shares: { ...(initial?.shares ?? {}) },
    shareInvites: { ...(initial?.shareInvites ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    systemMaintenance: { ...(initial?.systemMaintenance ?? {}) },
  };

  const makeDocRef = (collection: CollectionName, id: string) => ({
    id,
    __collection: collection,
  });

  const buildQuery = (
    collection: CollectionName,
    filters: Array<{ field: string; value: unknown }> = [],
    cursorDocId?: string | null,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildQuery(collection, [...filters, { field, value }], cursorDocId, limitValue),
    ),
    orderBy: jest.fn((_field: string) =>
      buildQuery(collection, filters, cursorDocId, limitValue),
    ),
    startAfter: jest.fn((cursor: string) =>
      buildQuery(collection, filters, cursor, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(collection, filters, cursorDocId, nextLimit),
    ),
    get: jest.fn(async () => {
      let entries = Object.entries(state[collection]).filter(([, row]) =>
        filters.every((filter) => row[filter.field] === filter.value),
      );

      entries = entries.sort(([leftId], [rightId]) => leftId.localeCompare(rightId));

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
    set: jest.fn(),
    delete: jest.fn(),
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
    getAll: jest.fn(async (...refs: Array<{ id: string; __collection: CollectionName }>) =>
      refs.map((ref) => ({
        id: ref.id,
        exists: Boolean(state[ref.__collection][ref.id]),
        data: () => state[ref.__collection][ref.id],
      })),
    ),
    batch: jest.fn(() => batch),
  } as unknown as FirebaseFirestore.Firestore;

  return {
    state,
    db,
    batch,
  };
}

describe('denormalization backfill', () => {
  it('backfills stale share/invite/reminder fields and records completion state', async () => {
    const now = makeTimestamp('2026-02-22T15:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      users: {
        'user-1': { firstName: 'Updated', lastName: 'Owner', email: 'owner@example.com' },
        'caregiver-1': { firstName: 'Casey', lastName: 'Caregiver', email: 'caregiver@example.com' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Tacrolimus XR', dose: '2mg' },
      },
      shares: {
        'share-1': {
          ownerId: 'user-1',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'old-caregiver@example.com',
          ownerName: 'Old Owner',
          ownerEmail: 'old@example.com',
        },
      },
      shareInvites: {
        'invite-1': {
          ownerId: 'user-1',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'old-caregiver@example.com',
          ownerName: 'Old Owner',
          ownerEmail: 'old@example.com',
        },
      },
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          medicationDose: '1mg',
        },
      },
    });

    const result = await backfillDenormalizedFields({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now,
      pageSize: 10,
    });

    expect(result).toMatchObject({
      processedShares: 1,
      updatedShares: 1,
      processedShareInvites: 1,
      updatedShareInvites: 1,
      processedMedicationReminders: 1,
      updatedMedicationReminders: 1,
      hasMore: false,
      cursors: {
        sharesCursorDocId: null,
        shareInvitesCursorDocId: null,
        medicationRemindersCursorDocId: null,
      },
    });

    expect(harness.state.shares['share-1']).toMatchObject({
      ownerName: 'Updated Owner',
      ownerEmail: 'owner@example.com',
      caregiverEmail: 'caregiver@example.com',
      updatedAt: now,
    });
    expect(harness.state.shareInvites['invite-1']).toMatchObject({
      ownerName: 'Updated Owner',
      ownerEmail: 'owner@example.com',
      caregiverEmail: 'caregiver@example.com',
      updatedAt: now,
    });
    expect(harness.state.medicationReminders['rem-1']).toMatchObject({
      medicationName: 'Tacrolimus XR',
      medicationDose: '2mg',
      updatedAt: now,
    });

    const stateDoc = harness.state.systemMaintenance[DENORMALIZATION_BACKFILL_STATE_DOC_ID];
    expect(stateDoc).toBeDefined();
    expect(stateDoc.completedAt).toBe(now);
  });

  it('uses persisted cursors to continue paged backfill runs', async () => {
    const now = makeTimestamp('2026-02-22T16:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const later = makeTimestamp('2026-02-22T17:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      users: {
        'user-1': { firstName: 'Patient', lastName: 'One', email: 'patient@example.com' },
      },
      shares: {
        'share-a': { ownerId: 'user-1', ownerName: 'Old', ownerEmail: 'old@example.com' },
        'share-b': { ownerId: 'user-1', ownerName: 'Old', ownerEmail: 'old@example.com' },
      },
    });

    const firstRun = await backfillDenormalizedFields({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now,
      pageSize: 1,
    });

    expect(firstRun.processedShares).toBe(1);
    expect(firstRun.hasMore).toBe(true);
    expect(firstRun.cursors.sharesCursorDocId).toBe('share-a');

    const secondRun = await backfillDenormalizedFields({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now: later,
      pageSize: 1,
    });

    expect(secondRun.processedShares).toBe(1);
    expect(secondRun.hasMore).toBe(false);
    expect(secondRun.cursors.sharesCursorDocId).toBeNull();
    expect(harness.state.shares['share-a'].ownerName).toBe('Patient One');
    expect(harness.state.shares['share-b'].ownerName).toBe('Patient One');
  });

  it('supports dry-run metrics without mutating documents or cursors', async () => {
    const now = makeTimestamp('2026-02-22T18:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      users: {
        'user-1': { firstName: 'Patient', lastName: 'One', email: 'patient@example.com' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Tacrolimus XR', dose: '2mg' },
      },
      shares: {
        'share-1': { ownerId: 'user-1', ownerName: 'Old', ownerEmail: 'old@example.com' },
      },
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          medicationDose: '1mg',
        },
      },
    });

    const result = await backfillDenormalizedFields({
      db: harness.db,
      stateCollection: harness.db.collection('systemMaintenance') as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now,
      pageSize: 25,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.pageSize).toBe(25);
    expect(result.updatedShares).toBe(1);
    expect(result.updatedMedicationReminders).toBe(1);
    expect(harness.state.shares['share-1'].ownerName).toBe('Old');
    expect(harness.state.medicationReminders['rem-1'].medicationName).toBe('Tacrolimus');
    expect(harness.state.systemMaintenance[DENORMALIZATION_BACKFILL_STATE_DOC_ID]).toBeUndefined();
  });
});
