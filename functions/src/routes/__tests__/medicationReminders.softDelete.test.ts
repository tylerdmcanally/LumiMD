import * as admin from 'firebase-admin';
import { medicationRemindersRouter } from '../medicationReminders';

type RecordMap = Record<string, any>;

type ReminderRecord = {
  userId: string;
  medicationId: string;
  medicationName: string;
  times: string[];
  enabled: boolean;
  createdAt: ReturnType<typeof makeTimestamp>;
  updatedAt: ReturnType<typeof makeTimestamp>;
  deletedAt?: ReturnType<typeof makeTimestamp> | null;
  deletedBy?: string | null;
};

type MedicationRecord = {
  userId: string;
  name: string;
  dosage?: string;
  active?: boolean;
  deletedAt?: ReturnType<typeof makeTimestamp> | null;
};

type UserRecord = {
  timezone?: string;
};

type HarnessState = {
  reminders: Record<string, ReminderRecord>;
  medications: Record<string, MedicationRecord>;
  users: Record<string, UserRecord>;
};

type QueryFilter = {
  field: string;
  value: unknown;
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
    reminders: { ...(initial?.reminders ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    users: { ...(initial?.users ?? {}) },
  };

  let nextReminderId = 1;

  const makeReminderDocRef = (id: string) => ({
    id,
    update: jest.fn(async (updates: RecordMap) => {
      if (!state.reminders[id]) {
        throw new Error(`Reminder not found: ${id}`);
      }
      state.reminders[id] = {
        ...state.reminders[id],
        ...updates,
      };
    }),
  });

  const buildRemindersQuery = (
    filters: QueryFilter[] = [],
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildRemindersQuery([...filters, { field, value }], orderDirection, limitValue),
    ),
    orderBy: jest.fn((_field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildRemindersQuery(filters, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildRemindersQuery(filters, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.reminders)
        .filter(([, reminder]) =>
          filters.every((filter) => {
            const fieldValue = reminder[filter.field as keyof ReminderRecord];
            if (filter.value === null) {
              return fieldValue == null;
            }
            return fieldValue === filter.value;
          }),
        )
        .map(([id, reminder]) => ({
          id,
          data: () => reminder,
          ref: makeReminderDocRef(id),
        }))
        .sort((left, right) => {
          const leftMillis = left.data().createdAt?.toMillis?.() ?? 0;
          const rightMillis = right.data().createdAt?.toMillis?.() ?? 0;
          const base = leftMillis === rightMillis ? 0 : leftMillis > rightMillis ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return makeQuerySnapshot(docs);
    }),
  });

  const batchOperations: Array<() => Promise<void>> = [];
  const batch = {
    update: jest.fn(
      (ref: { update: (payload: RecordMap) => Promise<void> }, payload: RecordMap) => {
        batchOperations.push(() => ref.update(payload));
      },
    ),
    delete: jest.fn(),
    set: jest.fn(),
    commit: jest.fn(async () => {
      for (const operation of batchOperations.splice(0, batchOperations.length)) {
        await operation();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'medicationReminders') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildRemindersQuery([{ field, value }]),
          ),
          add: jest.fn(async (payload: RecordMap) => {
            const id = `rem-new-${nextReminderId++}`;
            state.reminders[id] = payload as ReminderRecord;
            return { id };
          }),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.reminders[id],
              id,
              data: () => state.reminders[id],
              ref: makeReminderDocRef(id),
            })),
            update: jest.fn(async (updates: RecordMap) => {
              if (!state.reminders[id]) {
                throw new Error(`Reminder not found: ${id}`);
              }
              state.reminders[id] = {
                ...state.reminders[id],
                ...updates,
              };
            }),
          })),
        };
      }

      if (name === 'medications') {
        return {
          doc: jest.fn((id: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.medications[id],
              id,
              data: () => state.medications[id],
            })),
          })),
        };
      }

      if (name === 'users') {
        return {
          doc: jest.fn((id: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.users[id],
              id,
              data: () => state.users[id],
            })),
          })),
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
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    get(name: string) {
      return this.headers[name.toLowerCase()];
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

function getRouteHandler(
  method: 'get' | 'post' | 'delete' | 'put',
  path: string,
) {
  const layer = medicationRemindersRouter.stack.find(
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

describe('medication reminders soft delete', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-24T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('soft deletes a reminder and excludes it from list responses', async () => {
    const harness = buildHarness({
      reminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: true,
          deletedAt: null,
          deletedBy: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const deleteHandler = getRouteHandler('delete', '/:id');
    const deleteReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'rem-1' },
    });
    const deleteRes = createResponse();
    await deleteHandler(deleteReq, deleteRes, jest.fn());

    expect(deleteRes.statusCode).toBe(200);
    expect(harness.state.reminders['rem-1']).toMatchObject({
      enabled: false,
      deletedBy: 'user-1',
    });
    expect(harness.state.reminders['rem-1'].deletedAt).toBeDefined();

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({ user: { uid: 'user-1' } });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());

    expect(listRes.statusCode).toBe(200);
    expect(listRes.get('cache-control')).toBe('private, max-age=30');
    expect(listRes.body).toMatchObject({ reminders: [] });
  });

  it('allows creating a reminder when only soft-deleted reminders exist for the medication', async () => {
    const harness = buildHarness({
      reminders: {
        'rem-deleted': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: false,
          deletedAt: makeTimestamp('2026-02-22T10:00:00.000Z'),
          deletedBy: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-22T10:00:00.000Z'),
        },
      },
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Tacrolimus',
          dosage: '1mg',
          active: true,
        },
      },
      users: {
        'user-1': { timezone: 'America/New_York' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const createHandler = getRouteHandler('post', '/');
    const createReq = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationId: 'med-1',
        times: ['09:00'],
      },
    });
    const createRes = createResponse();
    await createHandler(createReq, createRes, jest.fn());

    expect(createRes.statusCode).toBe(201);
    const createdId = createRes.body.id as string;
    expect(harness.state.reminders[createdId]).toMatchObject({
      userId: 'user-1',
      medicationId: 'med-1',
      enabled: true,
      deletedAt: null,
      deletedBy: null,
    });
  });

  it('cleanup-orphans soft deletes active orphaned reminders only', async () => {
    const harness = buildHarness({
      reminders: {
        'rem-orphan-missing': {
          userId: 'user-1',
          medicationId: 'med-missing',
          medicationName: 'Missing med',
          times: ['08:00'],
          enabled: true,
          deletedAt: null,
          deletedBy: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'rem-orphan-inactive': {
          userId: 'user-1',
          medicationId: 'med-inactive',
          medicationName: 'Inactive med',
          times: ['09:00'],
          enabled: true,
          deletedAt: null,
          deletedBy: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'rem-valid': {
          userId: 'user-1',
          medicationId: 'med-valid',
          medicationName: 'Valid med',
          times: ['10:00'],
          enabled: true,
          deletedAt: null,
          deletedBy: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'rem-already-deleted': {
          userId: 'user-1',
          medicationId: 'med-missing',
          medicationName: 'Already deleted',
          times: ['11:00'],
          enabled: false,
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
          deletedBy: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
      medications: {
        'med-valid': {
          userId: 'user-1',
          name: 'Valid med',
          active: true,
        },
        'med-inactive': {
          userId: 'user-1',
          name: 'Inactive med',
          active: false,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const cleanupHandler = getRouteHandler('post', '/cleanup-orphans');
    const cleanupReq = createRequest({
      user: { uid: 'user-1' },
      body: {},
    });
    const cleanupRes = createResponse();
    await cleanupHandler(cleanupReq, cleanupRes, jest.fn());

    expect(cleanupRes.statusCode).toBe(200);
    expect(cleanupRes.body).toMatchObject({
      success: true,
      deleted: 2,
    });

    expect(harness.state.reminders['rem-orphan-missing']).toMatchObject({
      enabled: false,
      deletedBy: 'user-1',
    });
    expect(harness.state.reminders['rem-orphan-missing'].deletedAt).toBeDefined();

    expect(harness.state.reminders['rem-orphan-inactive']).toMatchObject({
      enabled: false,
      deletedBy: 'user-1',
    });
    expect(harness.state.reminders['rem-orphan-inactive'].deletedAt).toBeDefined();

    expect(harness.state.reminders['rem-valid']).toMatchObject({
      enabled: true,
      deletedAt: null,
    });
    expect(harness.state.reminders['rem-already-deleted'].deletedBy).toBe('user-1');
  });

  it('restores a soft-deleted reminder when its medication is active', async () => {
    const deletedAt = makeTimestamp('2026-02-22T10:00:00.000Z');
    const harness = buildHarness({
      reminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: false,
          deletedAt,
          deletedBy: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: deletedAt,
        },
      },
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Tacrolimus',
          active: true,
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const restoreHandler = getRouteHandler('post', '/:id/restore');
    const restoreReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'rem-1' },
      body: {},
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body).toMatchObject({
      success: true,
      id: 'rem-1',
    });
    expect(harness.state.reminders['rem-1']).toMatchObject({
      enabled: true,
      deletedAt: null,
      deletedBy: null,
    });

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({ user: { uid: 'user-1' } });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());

    expect(listRes.statusCode).toBe(200);
    expect((listRes.body.reminders as Array<{ id: string }>).map((reminder) => reminder.id)).toEqual([
      'rem-1',
    ]);
  });
});
