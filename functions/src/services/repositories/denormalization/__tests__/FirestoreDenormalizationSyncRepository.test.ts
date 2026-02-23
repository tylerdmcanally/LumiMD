import { FirestoreDenormalizationSyncRepository } from '../FirestoreDenormalizationSyncRepository';

type RecordMap = Record<string, Record<string, unknown>>;

type State = {
  shares: RecordMap;
  shareInvites: RecordMap;
  medicationReminders: RecordMap;
  users: RecordMap;
  medications: RecordMap;
};

function buildFirestoreMock(initial?: Partial<State>) {
  const state: State = {
    shares: { ...(initial?.shares ?? {}) },
    shareInvites: { ...(initial?.shareInvites ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
  };

  const makeDoc = (collection: keyof State, id: string, row: Record<string, unknown>) => ({
    id,
    data: () => row,
    ref: {
      id,
      path: `${collection}/${id}`,
    },
    get: (field: string) => row[field],
  });

  const buildQuery = (
    collection: keyof State,
    filters: Array<{ field: string; value: unknown }> = [],
    cursorDocId?: string | null,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _op: string, value: unknown) =>
      buildQuery(collection, [...filters, { field, value }], cursorDocId, limitValue),
    ),
    orderBy: jest.fn((_field: string) => buildQuery(collection, filters, cursorDocId, limitValue)),
    startAfter: jest.fn((cursor: string) => buildQuery(collection, filters, cursor, limitValue)),
    limit: jest.fn((nextLimit: number) => buildQuery(collection, filters, cursorDocId, nextLimit)),
    doc: jest.fn((id: string) => ({
      id,
      path: `${collection}/${id}`,
      __collection: collection,
      get: jest.fn(async () => ({
        exists: Boolean(state[collection][id]),
        id,
        data: () => state[collection][id],
      })),
    })),
    get: jest.fn(async () => {
      let entries = Object.entries(state[collection])
        .filter(([, row]) =>
          filters.every((filter) => row[filter.field] === filter.value),
        );

      entries = entries.sort(([leftId], [rightId]) => leftId.localeCompare(rightId));
      if (cursorDocId) {
        entries = entries.filter(([id]) => id > cursorDocId);
      }
      if (typeof limitValue === 'number') {
        entries = entries.slice(0, limitValue);
      }

      const docs = entries.map(([id, row]) => makeDoc(collection, id, row));

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
      };
    }),
  });

  const pendingUpdates: Array<{ collection: keyof State; id: string; payload: Record<string, unknown> }> = [];
  const db = {
    collection: jest.fn((name: string) => {
      if (
        name !== 'shares' &&
        name !== 'shareInvites' &&
        name !== 'medicationReminders' &&
        name !== 'users' &&
        name !== 'medications'
      ) {
        throw new Error(`Unexpected collection: ${name}`);
      }
      const collection = name as keyof State;
      return buildQuery(collection);
    }),
    getAll: jest.fn(async (...refs: Array<{ id: string; __collection: keyof State }>) =>
      refs.map((ref) => ({
        id: ref.id,
        exists: Boolean(state[ref.__collection][ref.id]),
        data: () => state[ref.__collection][ref.id],
      })),
    ),
    batch: jest.fn(() => ({
      update: jest.fn((ref: { path: string; id: string }, payload: Record<string, unknown>) => {
        const [collection] = ref.path.split('/') as [keyof State, string];
        pendingUpdates.push({ collection, id: ref.id, payload });
      }),
      commit: jest.fn(async () => {
        pendingUpdates.splice(0, pendingUpdates.length).forEach((entry) => {
          state[entry.collection][entry.id] = {
            ...state[entry.collection][entry.id],
            ...entry.payload,
          };
        });
      }),
    })),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

describe('FirestoreDenormalizationSyncRepository', () => {
  it('lists share/share-invite/reminder records via owner and medication filters', async () => {
    const harness = buildFirestoreMock({
      shares: {
        'share-1': { ownerId: 'user-1', ownerName: 'Owner' },
        'share-2': { ownerId: 'user-2', ownerName: 'Other', caregiverUserId: 'caregiver-1' },
        'share-3': { ownerId: 'user-3', ownerName: 'Third', caregiverUserId: 'caregiver-1' },
      },
      shareInvites: {
        'invite-1': { ownerId: 'user-1', ownerName: 'Owner' },
        'invite-2': { ownerId: 'user-2', caregiverUserId: 'caregiver-1' },
      },
      medicationReminders: {
        'rem-1': { userId: 'user-1', medicationId: 'med-1' },
        'rem-2': { userId: 'user-1', medicationId: 'med-2' },
      },
    });
    const repository = new FirestoreDenormalizationSyncRepository(harness.db);

    const shares = await repository.listSharesByOwnerId('user-1');
    const caregiverShares = await repository.listSharesByCaregiverUserId('caregiver-1');
    const invites = await repository.listShareInvitesByOwnerId('user-1');
    const caregiverInvites = await repository.listShareInvitesByCaregiverUserId('caregiver-1');
    const reminders = await repository.listMedicationRemindersByUserAndMedication('user-1', 'med-1');

    expect(shares).toHaveLength(1);
    expect(shares[0].id).toBe('share-1');
    expect(caregiverShares).toHaveLength(2);
    expect(caregiverShares.map((doc) => doc.id)).toEqual(['share-2', 'share-3']);
    expect(invites).toHaveLength(1);
    expect(invites[0].id).toBe('invite-1');
    expect(caregiverInvites).toHaveLength(1);
    expect(caregiverInvites[0].id).toBe('invite-2');
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe('rem-1');
  });

  it('applies updates in batches and returns applied count', async () => {
    const harness = buildFirestoreMock({
      shares: {
        'share-1': { ownerId: 'user-1', ownerName: 'Old' },
      },
      shareInvites: {
        'invite-1': { ownerId: 'user-1', ownerName: 'Old' },
      },
      medicationReminders: {},
    });
    const repository = new FirestoreDenormalizationSyncRepository(harness.db);

    const shareDoc = (await repository.listSharesByOwnerId('user-1'))[0];
    const inviteDoc = (await repository.listShareInvitesByOwnerId('user-1'))[0];
    const applied = await repository.applyUpdates(
      [
        { ref: shareDoc.ref, updates: { ownerName: 'New' } },
        { ref: inviteDoc.ref, updates: { ownerName: 'New' } },
      ],
      { batchLimit: 1 },
    );

    expect(applied).toBe(2);
    expect(harness.state.shares['share-1']).toMatchObject({ ownerName: 'New' });
    expect(harness.state.shareInvites['invite-1']).toMatchObject({ ownerName: 'New' });
  });

  it('returns ordered page reads and lookup-doc maps for backfill helpers', async () => {
    const harness = buildFirestoreMock({
      shares: {
        'share-a': { ownerId: 'user-1' },
        'share-b': { ownerId: 'user-2' },
        'share-c': { ownerId: 'user-3' },
      },
      users: {
        'user-1': { displayName: 'Owner One' },
        'user-2': { displayName: 'Owner Two' },
      },
      medications: {
        'med-1': { name: 'Tacrolimus', dose: '1mg' },
      },
    });
    const repository = new FirestoreDenormalizationSyncRepository(harness.db);

    const firstPage = await repository.listCollectionPage('shares', {
      limit: 2,
    });
    const secondPage = await repository.listCollectionPage('shares', {
      limit: 2,
      cursorDocId: firstPage[firstPage.length - 1]?.id ?? null,
    });
    const usersById = await repository.getLookupDocsByIds('users', [
      'user-1',
      'user-2',
      'user-missing',
    ]);
    const medicationsById = await repository.getLookupDocsByIds('medications', ['med-1']);

    expect(firstPage.map((doc) => doc.id)).toEqual(['share-a', 'share-b']);
    expect(secondPage.map((doc) => doc.id)).toEqual(['share-c']);
    expect(usersById.get('user-1')).toMatchObject({ displayName: 'Owner One' });
    expect(usersById.get('user-2')).toMatchObject({ displayName: 'Owner Two' });
    expect(usersById.has('user-missing')).toBe(false);
    expect(medicationsById.get('med-1')).toMatchObject({ name: 'Tacrolimus', dose: '1mg' });
  });
});
