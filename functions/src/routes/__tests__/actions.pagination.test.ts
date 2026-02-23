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
    startAfterId?: string,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildActionsQuery([...filters, { field, value }], orderDirection, startAfterId, limitValue),
    ),
    orderBy: jest.fn((_field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildActionsQuery(filters, direction, startAfterId, limitValue),
    ),
    startAfter: jest.fn((cursorDoc: { id: string }) =>
      buildActionsQuery(filters, orderDirection, cursorDoc.id, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildActionsQuery(filters, orderDirection, startAfterId, nextLimit),
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

      if (startAfterId) {
        const cursorIndex = docs.findIndex((doc) => doc.id === startAfterId);
        if (cursorIndex >= 0) {
          docs = docs.slice(cursorIndex + 1);
        }
      }

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

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
  };
  return res;
}

function getRouteHandler(method: 'get', path: string) {
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

describe('actions pagination', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all actions when pagination params are absent', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'newest',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-2': {
          userId: 'user-1',
          description: 'middle',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'action-3': {
          userId: 'user-1',
          description: 'oldest',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'action-other-user': {
          userId: 'user-2',
          description: 'ignore',
          createdAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({ user: { uid: 'user-1' }, query: {} });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'action-1',
      'action-2',
      'action-3',
    ]);
    expect(res.headers['x-has-more']).toBeUndefined();
    expect(res.headers['x-next-cursor']).toBeUndefined();
  });

  it('excludes soft-deleted actions when listing without pagination params', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'legacy active',
          deletedAt: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-2': {
          userId: 'user-1',
          description: 'soft deleted',
          deletedAt: makeTimestamp('2026-02-19T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'action-3': {
          userId: 'user-1',
          description: 'explicit active',
          deletedAt: null,
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({ user: { uid: 'user-1' }, query: {} });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'action-1',
      'action-3',
    ]);
  });

  it('paginates correctly when deleted actions are interleaved', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'newest active',
          deletedAt: null,
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-2': {
          userId: 'user-1',
          description: 'deleted',
          deletedAt: makeTimestamp('2026-02-19T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'action-3': {
          userId: 'user-1',
          description: 'middle active',
          deletedAt: null,
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'action-4': {
          userId: 'user-1',
          description: 'oldest active',
          deletedAt: null,
          createdAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      query: { limit: '2' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'action-1',
      'action-3',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('action-3');
  });

  it('returns a paginated first page with next-cursor headers', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'newest',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-2': {
          userId: 'user-1',
          description: 'middle',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'action-3': {
          userId: 'user-1',
          description: 'oldest',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      query: { limit: '2' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'action-1',
      'action-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('action-2');
  });

  it('returns subsequent page when cursor is provided', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'newest',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-2': {
          userId: 'user-1',
          description: 'middle',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'action-3': {
          userId: 'user-1',
          description: 'oldest',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      query: { limit: '2', cursor: 'action-2' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'action-3',
    ]);
    expect(res.headers['x-has-more']).toBe('false');
    expect(res.headers['x-next-cursor']).toBe('');
  });

  it('rejects invalid cursor and limit values', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'newest',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');

    const badLimitReq = createRequest({
      user: { uid: 'user-1' },
      query: { limit: '0' },
    });
    const badLimitRes = createResponse();
    await handler(badLimitReq, badLimitRes, jest.fn());
    expect(badLimitRes.statusCode).toBe(400);
    expect(badLimitRes.body).toMatchObject({
      code: 'validation_failed',
      message: 'limit must be a positive integer',
    });

    const badCursorReq = createRequest({
      user: { uid: 'user-1' },
      query: { cursor: 'missing-cursor' },
    });
    const badCursorRes = createResponse();
    await handler(badCursorReq, badCursorRes, jest.fn());
    expect(badCursorRes.statusCode).toBe(400);
    expect(badCursorRes.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });
});
