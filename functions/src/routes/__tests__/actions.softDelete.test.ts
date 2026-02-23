import * as admin from 'firebase-admin';
import { actionsRouter } from '../actions';

type RecordMap = Record<string, any>;

type HarnessState = {
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
    actions: { ...(initial?.actions ?? {}) },
  };

  const buildActionsQuery = (
    filters: Array<{ field: string; value: unknown }> = [],
    orderDirection: 'asc' | 'desc' = 'desc',
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildActionsQuery([...filters, { field, value }], orderDirection),
    ),
    orderBy: jest.fn((_field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildActionsQuery(filters, direction),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.actions)
        .filter(([, action]) =>
          filters.every((filter) => {
            if (filter.value === null) {
              return action[filter.field] == null;
            }
            return action[filter.field] === filter.value;
          }),
        )
        .map(([id, action]) => ({
          id,
          data: () => action,
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

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'actions') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        where: jest.fn((field: string, _operator: string, value: unknown) =>
          buildActionsQuery([{ field, value }]),
        ),
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.actions[id],
            id,
            data: () => state.actions[id],
          })),
          update: jest.fn(async (updates: RecordMap) => {
            if (!state.actions[id]) {
              throw new Error(`Action not found: ${id}`);
            }
            state.actions[id] = {
              ...state.actions[id],
              ...updates,
            };
          }),
          delete: jest.fn(async () => {
            delete state.actions[id];
          }),
        })),
      };
    }),
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

function getRouteHandler(method: 'get' | 'patch' | 'delete' | 'post', path: string) {
  const layer = actionsRouter.stack.find(
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

describe('actions soft delete', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-22T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('soft deletes an action and excludes it from list results', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'Follow up with provider',
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
      params: { id: 'action-1' },
    });
    const deleteRes = createResponse();
    await deleteHandler(deleteReq, deleteRes, jest.fn());

    expect(deleteRes.statusCode).toBe(204);
    expect(harness.state.actions['action-1']).toBeDefined();
    expect(harness.state.actions['action-1'].deletedBy).toBe('user-1');
    expect(harness.state.actions['action-1'].deletedAt).toBeDefined();

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({ user: { uid: 'user-1' }, query: {} });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toEqual([]);
  });

  it('returns not_found for get/patch on a soft-deleted action', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'Follow up with provider',
          deletedAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
          deletedBy: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const getHandler = getRouteHandler('get', '/:id');
    const getReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'action-1' },
    });
    const getRes = createResponse();
    await getHandler(getReq, getRes, jest.fn());
    expect(getRes.statusCode).toBe(404);
    expect(getRes.body).toMatchObject({
      code: 'not_found',
      message: 'Action not found',
    });

    const patchHandler = getRouteHandler('patch', '/:id');
    const patchReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'action-1' },
      body: { completed: true },
    });
    const patchRes = createResponse();
    await patchHandler(patchReq, patchRes, jest.fn());
    expect(patchRes.statusCode).toBe(404);
    expect(patchRes.body).toMatchObject({
      code: 'not_found',
      message: 'Action not found',
    });
  });

  it('restores a soft-deleted action so it reappears in list results', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'Follow up with provider',
          deletedAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
          deletedBy: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const restoreHandler = getRouteHandler('post', '/:id/restore');
    const restoreReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'action-1' },
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body).toMatchObject({
      success: true,
      id: 'action-1',
    });
    expect(harness.state.actions['action-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({ user: { uid: 'user-1' }, query: {} });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());
    expect(listRes.statusCode).toBe(200);
    expect((listRes.body as Array<{ id: string }>).map((row) => row.id)).toEqual(['action-1']);
  });
});
