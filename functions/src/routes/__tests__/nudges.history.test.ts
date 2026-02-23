import * as admin from 'firebase-admin';
import { nudgesRouter } from '../nudges';

jest.mock('../../services/lumibotAnalyzer', () => ({
  getActiveNudgesForUser: jest.fn(async () => []),
  completeNudge: jest.fn(async () => undefined),
  snoozeNudge: jest.fn(async () => undefined),
  dismissNudge: jest.fn(async () => undefined),
}));

jest.mock('../../services/lumibotAI', () => ({
  getLumiBotAIService: jest.fn(),
}));

jest.mock('../../services/patientContextAggregator', () => ({
  getPatientContext: jest.fn(async () => null),
}));

jest.mock('../../services/nudgeNotificationService', () => ({
  processAndNotifyDueNudges: jest.fn(async () => ({
    processed: 0,
    notified: 0,
    failed: 0,
  })),
}));

type RecordMap = Record<string, unknown>;

type HarnessState = {
  nudges: Record<string, RecordMap>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function makeDocSnapshot(id: string, data: RecordMap, path: string) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      id,
      path,
    },
  };
}

function makeQuerySnapshot(docs: Array<ReturnType<typeof makeDocSnapshot>>) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    nudges: { ...(initial?.nudges ?? {}) },
  };

  const buildNudgeQuery = (
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildNudgeQuery([...filters, { field, operator, value }], limitValue),
    ),
    orderBy: jest.fn((_field: string, _direction: 'asc' | 'desc' = 'desc') =>
      buildNudgeQuery(filters, limitValue),
    ),
    limit: jest.fn((nextLimit: number) => buildNudgeQuery(filters, nextLimit)),
    get: jest.fn(async () => {
      let docs = Object.entries(state.nudges)
        .filter(([, data]) =>
          filters.every((filter) => {
            if (filter.operator === '==') {
              return data[filter.field] === filter.value;
            }
            if (filter.operator === 'in' && Array.isArray(filter.value)) {
              return filter.value.includes(data[filter.field]);
            }
            return true;
          }),
        )
        .map(([id, data]) => makeDocSnapshot(id, data, `nudges/${id}`))
        .sort((left, right) => {
          const leftData = left.data() as any;
          const rightData = right.data() as any;
          const leftMillis = leftData.updatedAt?.toMillis?.() ?? 0;
          const rightMillis = rightData.updatedAt?.toMillis?.() ?? 0;
          return rightMillis - leftMillis;
        });

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'nudges') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return {
        where: jest.fn((field: string, operator: string, value: unknown) =>
          buildNudgeQuery([{ field, operator, value }]),
        ),
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

function getRouteHandler(method: 'get', path: string) {
  const layer = nudgesRouter.stack.find(
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

describe('nudges history route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns completed/dismissed nudge history with private cache headers', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          status: 'dismissed',
          title: 'Dismissed',
          updatedAt: makeTimestamp('2026-02-22T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-20T12:00:00.000Z'),
          scheduledFor: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
        'nudge-2': {
          userId: 'user-1',
          status: 'completed',
          title: 'Completed',
          updatedAt: makeTimestamp('2026-02-22T13:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-20T13:00:00.000Z'),
          scheduledFor: makeTimestamp('2026-02-21T13:00:00.000Z'),
        },
        'nudge-3': {
          userId: 'user-1',
          status: 'pending',
          title: 'Pending',
          updatedAt: makeTimestamp('2026-02-22T14:00:00.000Z'),
        },
        'nudge-4': {
          userId: 'other-user',
          status: 'completed',
          title: 'Other user',
          updatedAt: makeTimestamp('2026-02-22T15:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/history');
    const req = createRequest({
      query: { limit: '10' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body).toHaveLength(2);
    expect((res.body as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'nudge-2',
      'nudge-1',
    ]);
  });

  it('caps requested history limit at 50', async () => {
    const nudges: Record<string, RecordMap> = {};
    for (let index = 0; index < 55; index += 1) {
      nudges[`nudge-${index}`] = {
        userId: 'user-1',
        status: 'completed',
        title: `Nudge ${index}`,
        updatedAt: makeTimestamp(new Date(2026, 1, 22, 12, 0, index).toISOString()),
      };
    }

    const harness = buildHarness({ nudges });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/history');
    const req = createRequest({
      query: { limit: '200' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(50);
  });
});
