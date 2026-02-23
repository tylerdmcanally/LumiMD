import * as admin from 'firebase-admin';
import { medicationsRouter } from '../medications';
import { clearMedicationSafetyCacheForUser } from '../../services/medicationSafetyAI';

jest.mock('../../services/medicationSafetyAI', () => ({
  clearMedicationSafetyCacheForUser: jest.fn(async () => undefined),
}));

type RecordMap = Record<string, any>;

type HarnessState = {
  medications: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
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
    medications: { ...(initial?.medications ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
  };

  const buildRemindersQuery = (
    filters: Array<{ field: string; value: unknown }> = [],
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildRemindersQuery([...filters, { field, value }]),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state.medicationReminders)
        .filter(([, reminder]) =>
          filters.every((filter) => reminder[filter.field] === filter.value),
        )
        .map(([id, reminder]) => ({
          id,
          data: () => reminder,
          ref: {
            id,
            update: jest.fn(async (updates: RecordMap) => {
              state.medicationReminders[id] = {
                ...state.medicationReminders[id],
                ...updates,
              };
            }),
          },
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const batchOperations: Array<() => Promise<void>> = [];
  const batch = {
    update: jest.fn(
      (
        ref: { update: (payload: RecordMap) => Promise<void> },
        payload: RecordMap,
      ) => {
        batchOperations.push(() => ref.update(payload));
      },
    ),
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(async () => {
      for (const operation of batchOperations.splice(0, batchOperations.length)) {
        await operation();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'medications') {
        return {
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.medications[id],
              id,
              data: () => state.medications[id],
            })),
            update: jest.fn(async (updates: RecordMap) => {
              state.medications[id] = {
                ...state.medications[id],
                ...updates,
              };
            }),
          })),
        };
      }

      if (name === 'medicationReminders') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildRemindersQuery([{ field, value }]),
          ),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => batch),
  };

  return { state, db };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'user-1' },
    params: {},
    body: {},
    query: {},
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

function getRouteHandler(method: 'post', path: string) {
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

describe('medications restore', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedClearMedicationSafetyCacheForUser =
    clearMedicationSafetyCacheForUser as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-25T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('restores a soft-deleted medication and only reminders from the same delete event', async () => {
    const deletedAt = makeTimestamp('2026-02-24T12:00:00.000Z');
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Tacrolimus',
          active: false,
          deletedAt,
          deletedBy: 'user-1',
        },
      },
      medicationReminders: {
        'rem-restore': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: false,
          deletedAt,
          deletedBy: 'user-1',
        },
        'rem-keep-deleted': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: false,
          deletedAt: makeTimestamp('2026-02-10T12:00:00.000Z'),
          deletedBy: 'user-1',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/restore');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'med-1' },
    });
    const res = createResponse();
    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      id: 'med-1',
      restoredReminders: 1,
    });
    expect(harness.state.medications['med-1']).toMatchObject({
      active: true,
      deletedAt: null,
      deletedBy: null,
    });
    expect(harness.state.medicationReminders['rem-restore']).toMatchObject({
      enabled: true,
      deletedAt: null,
      deletedBy: null,
    });
    expect(harness.state.medicationReminders['rem-keep-deleted']).toMatchObject({
      enabled: false,
    });
    expect(mockedClearMedicationSafetyCacheForUser).toHaveBeenCalledWith('user-1');
  });

  it('requires reason for operator-initiated cross-user medication restore', async () => {
    const deletedAt = makeTimestamp('2026-02-24T12:00:00.000Z');
    const harness = buildHarness({
      medications: {
        'med-2': {
          userId: 'patient-2',
          name: 'Lisinopril',
          active: false,
          deletedAt,
          deletedBy: 'patient-2',
        },
      },
      medicationReminders: {},
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/restore');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      params: { id: 'med-2' },
      body: {},
    });
    const res = createResponse();
    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'reason_required',
    });
  });

  it('allows operator cross-user medication restore when reason is provided', async () => {
    const deletedAt = makeTimestamp('2026-02-24T12:00:00.000Z');
    const harness = buildHarness({
      medications: {
        'med-3': {
          userId: 'patient-3',
          name: 'Metformin',
          active: false,
          deletedAt,
          deletedBy: 'patient-3',
        },
      },
      medicationReminders: {},
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/restore');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      params: { id: 'med-3' },
      body: { reason: 'Support-guided recovery for accidental delete' },
    });
    const res = createResponse();
    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      id: 'med-3',
      restoredBy: 'operator-1',
      restoredFor: 'patient-3',
      reason: 'Support-guided recovery for accidental delete',
    });
    expect(harness.state.medications['med-3']).toMatchObject({
      active: true,
      deletedAt: null,
      deletedBy: null,
    });
    expect(mockedClearMedicationSafetyCacheForUser).toHaveBeenCalledWith('patient-3');
  });
});
