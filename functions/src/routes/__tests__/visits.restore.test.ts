import * as admin from 'firebase-admin';
import { visitsRouter } from '../visits';

type RecordMap = Record<string, any>;

type HarnessState = {
  visits: Record<string, RecordMap>;
  actions: Record<string, RecordMap>;
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
    visits: { ...(initial?.visits ?? {}) },
    actions: { ...(initial?.actions ?? {}) },
  };

  const buildQuery = (
    collectionName: keyof HarnessState,
    filters: Array<{ field: string; value: unknown }> = [],
    orderDirection: 'asc' | 'desc' = 'desc',
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildQuery(collectionName, [...filters, { field, value }], orderDirection),
    ),
    orderBy: jest.fn((_field: string, direction: 'asc' | 'desc' = 'desc') =>
      buildQuery(collectionName, filters, direction),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state[collectionName])
        .filter(([, row]) =>
          filters.every((filter) => {
            if (filter.value === null) {
              return row[filter.field] == null;
            }
            return row[filter.field] === filter.value;
          }),
        )
        .map(([id, row]) => ({
          id,
          data: () => row,
          ref: {
            id,
            update: jest.fn(async (updates: RecordMap) => {
              state[collectionName][id] = {
                ...state[collectionName][id],
                ...updates,
              };
            }),
          },
        }))
        .sort((left, right) => {
          const leftMillis = left.data().createdAt?.toMillis?.() ?? 0;
          const rightMillis = right.data().createdAt?.toMillis?.() ?? 0;
          const base = leftMillis === rightMillis ? 0 : leftMillis > rightMillis ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });
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
      if (name === 'visits') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildQuery('visits', [{ field, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.visits[id],
              id,
              data: () => state.visits[id],
            })),
            update: jest.fn(async (updates: RecordMap) => {
              state.visits[id] = {
                ...state.visits[id],
                ...updates,
              };
            }),
          })),
        };
      }

      if (name === 'actions') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildQuery('actions', [{ field, value }]),
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
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
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

function getRouteHandler(method: 'get' | 'delete' | 'post', path: string) {
  const layer = visitsRouter.stack.find(
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

describe('visits restore', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-25T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('restores a soft-deleted visit and its related action items', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          deletedAt: null,
          deletedBy: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
      },
      actions: {
        'action-1': {
          userId: 'user-1',
          visitId: 'visit-1',
          description: 'Task from visit',
          deletedAt: null,
          deletedBy: null,
          createdAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const deleteHandler = getRouteHandler('delete', '/:id');
    const deleteReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'visit-1' },
    });
    const deleteRes = createResponse();
    await deleteHandler(deleteReq, deleteRes, jest.fn());
    expect(deleteRes.statusCode).toBe(204);

    const restoreHandler = getRouteHandler('post', '/:id/restore');
    const restoreReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'visit-1' },
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body).toMatchObject({
      success: true,
      id: 'visit-1',
      restoredActions: 1,
    });
    expect(harness.state.visits['visit-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });
    expect(harness.state.actions['action-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({
      user: { uid: 'user-1' },
      query: {},
    });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());
    expect(listRes.statusCode).toBe(200);
    expect((listRes.body as Array<{ id: string }>).map((row) => row.id)).toEqual(['visit-1']);
  });

  it('requires reason for operator-initiated cross-user restore', async () => {
    const harness = buildHarness({
      visits: {
        'visit-2': {
          userId: 'patient-2',
          deletedAt: makeTimestamp('2026-02-25T10:00:00.000Z'),
          deletedBy: 'patient-2',
          createdAt: makeTimestamp('2026-02-24T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-25T10:00:00.000Z'),
        },
      },
      actions: {},
    });
    firestoreMock.mockImplementation(() => harness.db);

    const restoreHandler = getRouteHandler('post', '/:id/restore');
    const restoreReq = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      params: { id: 'visit-2' },
      body: {},
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(400);
    expect(restoreRes.body).toMatchObject({
      code: 'reason_required',
    });
  });

  it('allows operator cross-user restore when reason is provided', async () => {
    const harness = buildHarness({
      visits: {
        'visit-3': {
          userId: 'patient-3',
          deletedAt: makeTimestamp('2026-02-25T10:00:00.000Z'),
          deletedBy: 'patient-3',
          createdAt: makeTimestamp('2026-02-24T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-25T10:00:00.000Z'),
        },
      },
      actions: {},
    });
    firestoreMock.mockImplementation(() => harness.db);

    const restoreHandler = getRouteHandler('post', '/:id/restore');
    const restoreReq = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      params: { id: 'visit-3' },
      body: { reason: 'Support recovery after accidental deletion' },
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body).toMatchObject({
      success: true,
      id: 'visit-3',
      restoredBy: 'operator-1',
      restoredFor: 'patient-3',
      reason: 'Support recovery after accidental deletion',
    });
    expect(harness.state.visits['visit-3']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });
  });
});
