import * as admin from 'firebase-admin';
import { medicationsRouter } from '../medications';
import { clearMedicationSafetyCacheForUser } from '../../services/medicationSafetyAI';

jest.mock('../../services/medicationSafetyAI', () => ({
  clearMedicationSafetyCacheForUser: jest.fn(async () => undefined),
}));

type RecordMap = Record<string, any>;

type HarnessState = {
  medications: Record<string, RecordMap>;
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
  };

  const buildMedsQuery = (
    filters: Array<{ field: string; value: unknown }> = [],
    startAfterId?: string,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildMedsQuery([...filters, { field, value }], startAfterId, limitValue),
    ),
    orderBy: jest.fn(() => buildMedsQuery(filters, startAfterId, limitValue)),
    startAfter: jest.fn((cursorDoc: { id: string }) =>
      buildMedsQuery(filters, cursorDoc.id, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildMedsQuery(filters, startAfterId, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.medications)
        .filter(([, medication]) =>
          filters.every((filter) => {
            if (filter.value === null) {
              return medication[filter.field] == null;
            }
            return medication[filter.field] === filter.value;
          }),
        )
        .map(([id, medication]) => ({
          id,
          data: () => medication,
        }))
        .sort((left, right) => {
          const leftName = (left.data().name ?? '').toLowerCase();
          const rightName = (right.data().name ?? '').toLowerCase();
          return leftName.localeCompare(rightName);
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
      if (name !== 'medications') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        where: jest.fn((field: string, _operator: string, value: unknown) =>
          buildMedsQuery([{ field, value }]),
        ),
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.medications[id],
            id,
            data: () => state.medications[id],
          })),
        })),
      };
    }),
    batch: jest.fn(() => ({
      delete: jest.fn(),
      commit: jest.fn(async () => undefined),
    })),
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

describe('medications pagination', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedClearMedicationSafetyCacheForUser =
    clearMedicationSafetyCacheForUser as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedClearMedicationSafetyCacheForUser.mockResolvedValue(undefined);
  });

  it('returns all medications when pagination params are absent', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Aspirin',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'med-2': {
          userId: 'user-1',
          name: 'Lisinopril',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'med-3': {
          userId: 'user-1',
          name: 'Metformin',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'med-other-user': {
          userId: 'user-2',
          name: 'Atorvastatin',
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
      'med-1',
      'med-2',
      'med-3',
    ]);
    expect(res.headers['x-has-more']).toBeUndefined();
    expect(res.headers['x-next-cursor']).toBeUndefined();
  });

  it('returns a paginated first page with next-cursor headers', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Aspirin',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'med-2': {
          userId: 'user-1',
          name: 'Lisinopril',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'med-3': {
          userId: 'user-1',
          name: 'Metformin',
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
      'med-1',
      'med-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('med-2');
  });

  it('returns subsequent page when cursor is provided', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Aspirin',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'med-2': {
          userId: 'user-1',
          name: 'Lisinopril',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'med-3': {
          userId: 'user-1',
          name: 'Metformin',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      query: { limit: '2', cursor: 'med-2' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((row) => row.id)).toEqual([
      'med-3',
    ]);
    expect(res.headers['x-has-more']).toBe('false');
    expect(res.headers['x-next-cursor']).toBe('');
  });

  it('rejects invalid cursor and limit values', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Aspirin',
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
