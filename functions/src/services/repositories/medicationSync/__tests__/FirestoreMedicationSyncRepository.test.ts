import { FirestoreMedicationSyncRepository } from '../FirestoreMedicationSyncRepository';

type RecordMap = Record<string, Record<string, unknown>>;
type State = {
  medications: RecordMap;
  nudges: RecordMap;
  medicationReminders: RecordMap;
};

function buildFirestoreMock(initial?: Partial<State>) {
  const state: State = {
    medications: { ...(initial?.medications ?? {}) },
    nudges: { ...(initial?.nudges ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
  };
  const idPrefixByCollection: Record<keyof State, string> = {
    medications: 'med',
    nudges: 'nudge',
    medicationReminders: 'rem',
  };

  const buildQuery = (
    collectionName: keyof State,
    filters: Array<{ field: string; op: string; value: unknown }> = [],
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, op: string, value: unknown) =>
      buildQuery(collectionName, [...filters, { field, op, value }], limitValue),
    ),
    limit: jest.fn((nextLimit: number) => buildQuery(collectionName, filters, nextLimit)),
    get: jest.fn(async () => {
      let docs = Object.entries(state[collectionName])
        .filter(([, record]) =>
          filters.every((filter) => {
            const fieldValue = record[filter.field];
            if (filter.op === '==') {
              return fieldValue === filter.value;
            }
            if (filter.op === 'in') {
              return Array.isArray(filter.value) && filter.value.includes(fieldValue);
            }
            throw new Error(`Unsupported operator: ${filter.op}`);
          }),
        )
        .map(([id, record]) => ({
          id,
          data: () => record,
          ref: {
            id,
            path: `${collectionName}/${id}`,
          },
          get: (field: string) => record[field],
        }));

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return {
        docs,
        empty: docs.length === 0,
      };
    }),
  });

  const existingReminderNumbers = Object.keys(state.medicationReminders)
    .map((id) => Number.parseInt(id.replace(/^rem-/, ''), 10))
    .filter((value) => Number.isFinite(value));
  let generatedReminderId =
    existingReminderNumbers.length > 0 ? Math.max(...existingReminderNumbers) + 1 : 1;

  const existingMedicationNumbers = Object.keys(state.medications)
    .map((id) => Number.parseInt(id.replace(/^med-/, ''), 10))
    .filter((value) => Number.isFinite(value));
  let generatedMedicationId =
    existingMedicationNumbers.length > 0 ? Math.max(...existingMedicationNumbers) + 1 : 1;

  const getNextDocId = (collectionName: keyof State): string => {
    if (collectionName === 'medicationReminders') {
      return `rem-${generatedReminderId++}`;
    }
    if (collectionName === 'medications') {
      return `med-${generatedMedicationId++}`;
    }
    const prefix = idPrefixByCollection[collectionName];
    const size = Object.keys(state[collectionName]).length + 1;
    return `${prefix}-${size}`;
  };

  const buildDocRef = (collectionName: keyof State, id?: string) => {
    const resolvedId = id ?? getNextDocId(collectionName);
    return {
      id: resolvedId,
      path: `${collectionName}/${resolvedId}`,
      set: jest.fn(async (data: Record<string, unknown>) => {
        state[collectionName][resolvedId] = { ...data };
      }),
      update: jest.fn(async (updates: Record<string, unknown>) => {
        const current = state[collectionName][resolvedId] ?? {};
        state[collectionName][resolvedId] = {
          ...current,
          ...updates,
        };
      }),
    };
  };
  const pendingDeletes: Array<{ collection: keyof State; id: string }> = [];

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'medications' && name !== 'nudges' && name !== 'medicationReminders') {
        throw new Error(`Unexpected collection: ${name}`);
      }
      const collectionName = name as keyof State;
      return {
        ...buildQuery(collectionName),
        doc: jest.fn((id?: string) => buildDocRef(collectionName, id)),
        add: jest.fn(async (data: Record<string, unknown>) => {
          const id = getNextDocId(collectionName);
          state[collectionName][id] = { ...data };
          return { id };
        }),
      };
    }),
    batch: jest.fn(() => ({
      delete: jest.fn((ref: { id: string; path: string }) => {
        const [collection] = ref.path.split('/') as [keyof State, string];
        pendingDeletes.push({ collection, id: ref.id });
      }),
      commit: jest.fn(async () => {
        pendingDeletes.splice(0, pendingDeletes.length).forEach(({ collection, id }) => {
          delete state[collection][id];
        });
      }),
    })),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, state };
}

describe('FirestoreMedicationSyncRepository', () => {
  it('lists medications by user and finds by canonical/nameLower', async () => {
    const harness = buildFirestoreMock({
      medications: {
        'med-1': {
          userId: 'user-1',
          canonicalName: 'lisinopril',
          nameLower: 'lisinopril',
        },
        'med-2': {
          userId: 'user-1',
          canonicalName: 'metformin',
          nameLower: 'metformin',
        },
        'med-3': {
          userId: 'user-2',
          canonicalName: 'atorvastatin',
          nameLower: 'atorvastatin',
        },
      },
    });
    const repository = new FirestoreMedicationSyncRepository(harness.db);

    const list = await repository.listByUser('user-1');
    const canonical = await repository.findByUserAndCanonicalName('user-1', 'metformin');
    const nameLower = await repository.findByUserAndNameLower('user-1', 'lisinopril');
    const missing = await repository.findByUserAndCanonicalName('user-1', 'missing');
    const createdId = await repository.create({
      userId: 'user-3',
      canonicalName: 'amlodipine',
      nameLower: 'amlodipine',
      active: true,
    });
    await repository.updateById(createdId, { active: false });

    expect(list).toHaveLength(2);
    expect(canonical?.id).toBe('med-2');
    expect(nameLower?.id).toBe('med-1');
    expect(missing).toBeNull();
    expect(createdId).toBe('med-4');
    expect(harness.state.medications[createdId]).toMatchObject({
      userId: 'user-3',
      canonicalName: 'amlodipine',
      nameLower: 'amlodipine',
      active: false,
    });
  });

  it('lists/deletes pending nudges and list/creates reminders', async () => {
    const harness = buildFirestoreMock({
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          status: 'pending',
        },
        'nudge-2': {
          userId: 'user-1',
          medicationId: 'med-1',
          status: 'active',
        },
        'nudge-3': {
          userId: 'user-1',
          medicationId: 'med-1',
          status: 'completed',
        },
      },
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
        },
      },
    });
    const repository = new FirestoreMedicationSyncRepository(harness.db);

    const pendingNudges = await repository.listPendingNudgesByMedication('user-1', 'med-1');
    const reminders = await repository.listRemindersByMedication('user-1', 'med-1');
    const reminderId = await repository.createReminder({
      userId: 'user-1',
      medicationId: 'med-2',
      medicationName: 'Lisinopril',
    });
    const deleted = await repository.deleteByRefs(pendingNudges.map((doc) => doc.ref));

    expect(pendingNudges).toHaveLength(2);
    expect(reminders).toHaveLength(1);
    expect(reminderId).toBe('rem-2');
    expect(deleted).toBe(2);
    expect(harness.state.nudges['nudge-1']).toBeUndefined();
    expect(harness.state.nudges['nudge-2']).toBeUndefined();
    expect(harness.state.nudges['nudge-3']).toBeDefined();
    expect(harness.state.medicationReminders['rem-1']).toBeDefined();
  });
});
