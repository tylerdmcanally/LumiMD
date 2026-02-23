import * as admin from 'firebase-admin';
import { medicationsRouter } from '../medications';
import { clearMedicationSafetyCacheForUser } from '../../services/medicationSafetyAI';

jest.mock('../../services/medicationSafetyAI', () => ({
  clearMedicationSafetyCacheForUser: jest.fn(async () => undefined),
}));

type RecordMap = Record<string, unknown>;

type HarnessState = {
  medications: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
  nudges: Record<string, RecordMap>;
};

type QueryFilter = {
  field: string;
  operator: '==' | 'in';
  value: unknown;
};

function makeQuerySnapshot(docs: any[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    medications: { ...(initial?.medications ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    nudges: { ...(initial?.nudges ?? {}) },
  };

  const makeDocRef = (
    collection: keyof HarnessState,
    id: string,
  ): { id: string; __collection: keyof HarnessState } => ({
    id,
    __collection: collection,
  });

  const buildWhereQuery = (
    collection: keyof HarnessState,
    filters: QueryFilter[] = [],
  ): any => ({
    where: jest.fn((field: string, operator: '==', value: unknown) =>
      buildWhereQuery(
        collection,
        [...filters, { field, operator: operator as QueryFilter['operator'], value }],
      ),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state[collection])
        .filter(([, row]) =>
          filters.every((filter) => {
            if (filter.operator === '==') {
              if (filter.value === null) {
                return row[filter.field] == null;
              }
              return row[filter.field] === filter.value;
            }
            if (filter.operator === 'in' && Array.isArray(filter.value)) {
              return filter.value.includes(row[filter.field]);
            }
            return false;
          }),
        )
        .map(([id, row]) => ({
          id,
          data: () => row,
          ref: makeDocRef(collection, id),
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const batchOperations: Array<() => void> = [];
  const batch = {
    delete: jest.fn(),
    set: jest.fn(),
    update: jest.fn(
      (
        ref: { id: string; __collection: keyof HarnessState },
        updates: RecordMap,
      ) => {
        batchOperations.push(() => {
          const collection = ref.__collection;
          if (!state[collection][ref.id]) {
            throw new Error(`Document not found: ${collection}/${ref.id}`);
          }
          state[collection][ref.id] = {
            ...state[collection][ref.id],
            ...updates,
          };
        });
      },
    ),
    commit: jest.fn(async () => {
      for (const operation of batchOperations.splice(0, batchOperations.length)) {
        operation();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'medications') {
        return {
          doc: jest.fn((id: string) => ({
            id,
            __collection: 'medications' as const,
            get: jest.fn(async () => ({
              exists: !!state.medications[id],
              id,
              data: () => state.medications[id],
            })),
          })),
        };
      }

      if (name === 'medicationReminders') {
        return {
          where: jest.fn((field: string, operator: '==' | 'in', value: unknown) =>
            buildWhereQuery(
              'medicationReminders',
              [{ field, operator: operator as QueryFilter['operator'], value }],
            ),
          ),
        };
      }

      if (name === 'nudges') {
        return {
          where: jest.fn((field: string, operator: '==' | 'in', value: unknown) =>
            buildWhereQuery(
              'nudges',
              [{ field, operator: operator as QueryFilter['operator'], value }],
            ),
          ),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => batch),
  };

  return { state, db, batch };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'user-1' },
    params: { id: 'med-1' },
    body: {},
    headers: {},
    ip: '127.0.0.1',
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
    get(name: string) {
      return this.header(name);
    },
  };
  return {
    ...req,
    ...overrides,
  };
}

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function getRouteHandler(method: 'delete', path: string) {
  const layer = medicationsRouter.stack.find(
    (stackLayer: any) =>
      stackLayer.route &&
      stackLayer.route.path === path &&
      stackLayer.route.methods &&
      stackLayer.route.methods[method],
  );

  const route = layer?.route;
  if (!route || !Array.isArray(route.stack) || route.stack.length === 0) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  return route.stack[route.stack.length - 1].handle;
}

describe('medications delete cascade', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedClearMedicationSafetyCacheForUser =
    clearMedicationSafetyCacheForUser as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => ({
        toDate: () => new Date('2026-02-23T12:00:00.000Z'),
        toMillis: () => new Date('2026-02-23T12:00:00.000Z').getTime(),
      })),
    };
  });

  it('soft deletes medication and soft-disables dependent reminders/nudges in one batch commit', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Tacrolimus',
          deletedAt: null,
          deletedBy: null,
          active: true,
        },
      },
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: true,
          deletedAt: null,
          deletedBy: null,
        },
        'rem-2': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: true,
          deletedAt: null,
          deletedBy: null,
        },
      },
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          status: 'pending',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('delete', '/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'med-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.batch.commit).toHaveBeenCalledTimes(1);
    expect(harness.state.medications['med-1']).toMatchObject({
      active: false,
      deletedBy: 'user-1',
    });
    expect(harness.state.medications['med-1'].deletedAt).toBeDefined();
    expect(harness.state.medicationReminders['rem-1']).toMatchObject({
      enabled: false,
      deletedBy: 'user-1',
    });
    expect(harness.state.medicationReminders['rem-1'].deletedAt).toBeDefined();
    expect(harness.state.medicationReminders['rem-2']).toMatchObject({
      enabled: false,
      deletedBy: 'user-1',
    });
    expect(harness.state.medicationReminders['rem-2'].deletedAt).toBeDefined();
    expect(harness.state.nudges['nudge-1']).toMatchObject({
      status: 'dismissed',
      dismissalReason: 'medication_deleted',
    });
    expect(mockedClearMedicationSafetyCacheForUser).toHaveBeenCalledWith('user-1');
  });
});
