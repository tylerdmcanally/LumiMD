import {
  buildOwnerDisplayName,
  resolveCaregiverEmailDenormalizationUpdate,
  resolveMedicationReminderDenormalizationUpdate,
  resolveOwnerDenormalizationUpdate,
  syncShareCaregiverDenormalizedFields,
  syncMedicationReminderDenormalizedFields,
  syncShareOwnerDenormalizedFields,
} from '../denormalizationSync';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  shares: Record<string, RecordMap>;
  shareInvites: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
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
  };

  const buildQuery = (
    collection: CollectionName,
    filters: Array<{ field: string; value: unknown }> = [],
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildQuery(collection, [...filters, { field, value }]),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state[collection])
        .filter(([, row]) =>
          filters.every((filter) => row[filter.field] === filter.value),
        )
        .map(([id, row]) => ({
          id,
          data: () => row,
          ref: {
            id,
            __collection: collection,
          },
        }));

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
      };
    }),
  });

  const batchOperations: Array<() => void> = [];
  const batch = {
    update: jest.fn(
      (
        ref: { id: string; __collection: CollectionName },
        updates: RecordMap,
      ) => {
        batchOperations.push(() => {
          state[ref.__collection][ref.id] = {
            ...state[ref.__collection][ref.id],
            ...updates,
          };
        });
      },
    ),
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
      if (name === 'shares') return buildQuery('shares');
      if (name === 'shareInvites') return buildQuery('shareInvites');
      if (name === 'medicationReminders') return buildQuery('medicationReminders');
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

describe('denormalizationSync service', () => {
  it('builds owner display name from displayName, names, then email prefix fallback', () => {
    expect(buildOwnerDisplayName({ displayName: 'Dr. Alice' })).toBe('Dr. Alice');
    expect(buildOwnerDisplayName({ firstName: 'Alice', lastName: 'Ng' })).toBe('Alice Ng');
    expect(buildOwnerDisplayName({ email: 'alice@example.com' })).toBe('alice');
    expect(buildOwnerDisplayName({})).toBeNull();
  });

  it('resolves owner denormalization update only when profile name/email changes', () => {
    expect(
      resolveOwnerDenormalizationUpdate(
        { firstName: 'Alice', lastName: 'Ng', email: 'alice@example.com' },
        { firstName: 'Alice', lastName: 'Ng', email: 'ALICE@example.com' },
      ),
    ).toBeNull();

    expect(
      resolveOwnerDenormalizationUpdate(
        { firstName: 'Alice', lastName: 'Ng', email: 'alice@example.com' },
        { firstName: 'Alicia', lastName: 'Ng', email: 'alice@example.com' },
      ),
    ).toEqual({
      ownerName: 'Alicia Ng',
      ownerEmail: 'alice@example.com',
    });
  });

  it('resolves reminder denormalization update when medication name/dose changes', () => {
    expect(
      resolveMedicationReminderDenormalizationUpdate(
        { name: 'Tacrolimus', dose: '1mg' },
        { name: 'Tacrolimus', dose: '1mg' },
      ),
    ).toBeNull();

    expect(
      resolveMedicationReminderDenormalizationUpdate(
        { name: 'Tacrolimus', dose: '1mg' },
        { name: 'Tacrolimus XR', dose: '2mg' },
      ),
    ).toEqual({
      medicationName: 'Tacrolimus XR',
      medicationDose: '2mg',
    });
  });

  it('resolves caregiver-email denormalization update only when email changes', () => {
    expect(
      resolveCaregiverEmailDenormalizationUpdate(
        { email: 'caregiver@example.com' },
        { email: 'Caregiver@example.com' },
      ),
    ).toBeNull();

    expect(
      resolveCaregiverEmailDenormalizationUpdate(
        { email: 'old-caregiver@example.com' },
        { email: 'new-caregiver@example.com' },
      ),
    ).toEqual({
      caregiverEmail: 'new-caregiver@example.com',
    });
  });

  it('syncs share and invite owner denormalized fields', async () => {
    const now = makeTimestamp('2026-02-22T09:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      shares: {
        'share-1': {
          ownerId: 'user-1',
          ownerName: 'Old Name',
          ownerEmail: 'old@example.com',
        },
        'share-2': {
          ownerId: 'user-1',
          ownerName: 'New Name',
          ownerEmail: 'new@example.com',
        },
      },
      shareInvites: {
        'invite-1': {
          ownerId: 'user-1',
          ownerName: 'Old Name',
          ownerEmail: 'old@example.com',
        },
      },
    });

    const result = await syncShareOwnerDenormalizedFields({
      db: harness.db,
      userId: 'user-1',
      ownerName: 'New Name',
      ownerEmail: 'new@example.com',
      now,
    });

    expect(result).toEqual({
      updatedShares: 1,
      updatedInvites: 1,
    });
    expect(harness.state.shares['share-1']).toMatchObject({
      ownerName: 'New Name',
      ownerEmail: 'new@example.com',
      updatedAt: now,
    });
    expect(harness.state.shares['share-2']).toMatchObject({
      ownerName: 'New Name',
      ownerEmail: 'new@example.com',
    });
    expect(harness.state.shareInvites['invite-1']).toMatchObject({
      ownerName: 'New Name',
      ownerEmail: 'new@example.com',
      updatedAt: now,
    });
  });

  it('syncs medication reminder denormalized name/dose fields', async () => {
    const now = makeTimestamp('2026-02-22T09:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      medicationReminders: {
        'reminder-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Old Name',
          medicationDose: '1mg',
        },
        'reminder-2': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'New Name',
          medicationDose: '2mg',
        },
      },
    });

    const result = await syncMedicationReminderDenormalizedFields({
      db: harness.db,
      userId: 'user-1',
      medicationId: 'med-1',
      medicationName: 'New Name',
      medicationDose: '2mg',
      now,
    });

    expect(result).toEqual({ updatedReminders: 1 });
    expect(harness.state.medicationReminders['reminder-1']).toMatchObject({
      medicationName: 'New Name',
      medicationDose: '2mg',
      updatedAt: now,
    });
    expect(harness.state.medicationReminders['reminder-2']).toMatchObject({
      medicationName: 'New Name',
      medicationDose: '2mg',
    });
  });

  it('syncs share and invite caregiver denormalized email fields', async () => {
    const now = makeTimestamp('2026-02-22T09:00:00.000Z') as unknown as FirebaseFirestore.Timestamp;
    const harness = buildHarness({
      shares: {
        'share-1': {
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'old-caregiver@example.com',
        },
        'share-2': {
          ownerId: 'owner-2',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'new-caregiver@example.com',
        },
      },
      shareInvites: {
        'invite-1': {
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'old-caregiver@example.com',
        },
      },
    });

    const result = await syncShareCaregiverDenormalizedFields({
      db: harness.db,
      userId: 'caregiver-1',
      caregiverEmail: 'new-caregiver@example.com',
      now,
    });

    expect(result).toEqual({
      updatedShares: 1,
      updatedInvites: 1,
    });
    expect(harness.state.shares['share-1']).toMatchObject({
      caregiverEmail: 'new-caregiver@example.com',
      updatedAt: now,
    });
    expect(harness.state.shares['share-2']).toMatchObject({
      caregiverEmail: 'new-caregiver@example.com',
    });
    expect(harness.state.shareInvites['invite-1']).toMatchObject({
      caregiverEmail: 'new-caregiver@example.com',
      updatedAt: now,
    });
  });
});
