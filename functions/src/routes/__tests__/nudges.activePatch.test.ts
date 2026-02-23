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

type QueryFilter = {
  field: string;
  operator: string;
  value: unknown;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function makeDocSnapshot(
  id: string,
  state: HarnessState,
  data: RecordMap,
) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      id,
      path: `nudges/${id}`,
      update: jest.fn(async (updates: RecordMap) => {
        state.nudges[id] = {
          ...(state.nudges[id] || {}),
          ...updates,
        };
      }),
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

  const makeDocRef = (id: string): any => ({
    id,
    path: `nudges/${id}`,
    get: jest.fn(async () => ({
      exists: !!state.nudges[id],
      id,
      data: () => state.nudges[id],
    })),
    update: jest.fn(async (updates: RecordMap) => {
      if (!state.nudges[id]) {
        return;
      }
      state.nudges[id] = {
        ...state.nudges[id],
        ...updates,
      };
    }),
  });

  const buildQuery = (
    filters: QueryFilter[] = [],
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery([...filters, { field, operator, value }]),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state.nudges)
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
        .map(([id, data]) => makeDocSnapshot(id, state, data));

      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'nudges') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return {
        doc: jest.fn((id: string) => makeDocRef(id)),
        where: jest.fn((field: string, operator: string, value: unknown) =>
          buildQuery([{ field, operator, value }]),
        ),
      };
    }),
    batch: jest.fn(() => {
      const updates: Array<{ ref: { path: string }; payload: RecordMap }> = [];
      return {
        update: jest.fn((ref: { path: string }, payload: RecordMap) => {
          updates.push({ ref, payload });
        }),
        commit: jest.fn(async () => {
          updates.forEach(({ ref, payload }) => {
            const id = ref.path.split('/')[1];
            if (!state.nudges[id]) {
              return;
            }

            const next: RecordMap = {
              ...state.nudges[id],
            };

            Object.entries(payload).forEach(([key, value]) => {
              if (value === '__DELETE__') {
                delete next[key];
                return;
              }

              next[key] = value;
            });

            state.nudges[id] = next;
          });
        }),
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

function getRouteHandler(method: 'get' | 'patch', path: string) {
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

describe('nudges active and patch routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp('2026-02-22T12:00:00.000Z'),
      fromDate: (value: Date) => makeTimestamp(value),
    };
    (firestoreMock as any).FieldValue = {
      delete: () => '__DELETE__',
    };
  });

  it('returns active nudges and activates due pending/snoozed records', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          status: 'pending',
          scheduledFor: makeTimestamp('2026-02-22T11:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T11:00:00.000Z'),
        },
        'nudge-2': {
          userId: 'user-1',
          status: 'active',
          scheduledFor: makeTimestamp('2026-02-22T13:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T13:00:00.000Z'),
        },
        'nudge-3': {
          userId: 'user-1',
          status: 'snoozed',
          scheduledFor: makeTimestamp('2026-02-22T10:00:00.000Z'),
          snoozedUntil: makeTimestamp('2026-02-22T11:30:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
        'nudge-4': {
          userId: 'user-1',
          status: 'snoozed',
          scheduledFor: makeTimestamp('2026-02-22T09:00:00.000Z'),
          snoozedUntil: makeTimestamp('2026-02-22T12:30:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T09:00:00.000Z'),
        },
        'nudge-5': {
          userId: 'user-1',
          status: 'dismissed',
          scheduledFor: makeTimestamp('2026-02-22T08:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T08:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect((res.body as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'nudge-3',
      'nudge-1',
      'nudge-2',
    ]);
    expect(harness.state.nudges['nudge-1']).toMatchObject({
      status: 'active',
    });
    expect(harness.state.nudges['nudge-3']).toMatchObject({
      status: 'active',
    });
    expect(harness.state.nudges['nudge-3'].snoozedUntil).toBeUndefined();
  });

  it('updates status to completed through patch endpoint', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-10': {
          userId: 'user-1',
          status: 'pending',
          scheduledFor: makeTimestamp('2026-02-22T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      params: { id: 'nudge-10' },
      body: {
        status: 'completed',
        responseValue: '  <b>done</b>  ',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-10']).toMatchObject({
      status: 'completed',
      responseValue: 'done',
    });
  });

  it('updates status to snoozed through patch endpoint', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-11': {
          userId: 'user-1',
          status: 'active',
          scheduledFor: makeTimestamp('2026-02-22T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      params: { id: 'nudge-11' },
      body: {
        status: 'snoozed',
        snoozeDays: 2,
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-11']).toMatchObject({
      status: 'snoozed',
    });
    expect(harness.state.nudges['nudge-11'].snoozedUntil).toBeDefined();
  });

  it('updates status to dismissed through patch endpoint', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-12': {
          userId: 'user-1',
          status: 'active',
          scheduledFor: makeTimestamp('2026-02-22T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      params: { id: 'nudge-12' },
      body: {
        status: 'dismissed',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-12']).toMatchObject({
      status: 'dismissed',
    });
  });

  it('returns forbidden when patching another user nudge', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-13': {
          userId: 'other-user',
          status: 'pending',
          scheduledFor: makeTimestamp('2026-02-22T12:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-21T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      params: { id: 'nudge-13' },
      body: {
        status: 'dismissed',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
    });
    expect(harness.state.nudges['nudge-13']).toMatchObject({
      status: 'pending',
    });
  });
});
