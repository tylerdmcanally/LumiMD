import * as admin from 'firebase-admin';
import { visitsRouter } from '../visits';

type RecordMap = Record<string, any>;

type HarnessState = {
  visits: Record<string, RecordMap>;
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
  };

  const buildVisitsQuery = (
    filters: Array<{ field: string; value: unknown }> = [],
    orderDirection: 'asc' | 'desc' = 'desc',
    startAfterId?: string,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildVisitsQuery([...filters, { field, value }], orderDirection, startAfterId, limitValue),
    ),
    orderBy: jest.fn((_field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildVisitsQuery(filters, direction, startAfterId, limitValue),
    ),
    startAfter: jest.fn((cursorDoc: { id: string }) =>
      buildVisitsQuery(filters, orderDirection, cursorDoc.id, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildVisitsQuery(filters, orderDirection, startAfterId, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.visits)
        .filter(([, visit]) =>
          filters.every((filter) => {
            if (filter.value === null) {
              return visit[filter.field] == null;
            }
            return visit[filter.field] === filter.value;
          }),
        )
        .map(([id, visit]) => ({
          id,
          data: () => visit,
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
      if (name !== 'visits') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        where: jest.fn((field: string, _operator: string, value: unknown) =>
          buildVisitsQuery([{ field, value }]),
        ),
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.visits[id],
            id,
            data: () => state.visits[id],
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

describe('visits pagination', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all visits when pagination params are absent', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'visit-2': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'visit-3': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'visit-other-user': {
          userId: 'user-2',
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
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'visit-1',
      'visit-2',
      'visit-3',
    ]);
    expect(res.headers['x-has-more']).toBeUndefined();
    expect(res.headers['x-next-cursor']).toBeUndefined();
  });

  it('returns a paginated first page with next-cursor headers', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'visit-2': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'visit-3': {
          userId: 'user-1',
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
      'visit-1',
      'visit-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('visit-2');
  });

  it('supports cursor pagination with asc sort', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'visit-2': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'visit-3': {
          userId: 'user-1',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      query: { limit: '2', sort: 'asc', cursor: 'visit-2' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'visit-1',
    ]);
    expect(res.headers['x-has-more']).toBe('false');
    expect(res.headers['x-next-cursor']).toBe('');
  });

  it('rejects invalid cursor and limit values', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
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
