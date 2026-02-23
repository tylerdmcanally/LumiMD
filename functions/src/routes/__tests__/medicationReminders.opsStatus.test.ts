import * as admin from 'firebase-admin';
import { medicationRemindersRouter } from '../medicationReminders';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  maintenance: Record<string, RecordMap>;
};

function makeTimestamp(input: Date | string) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    maintenance: { ...(initial?.maintenance ?? {}) },
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'systemMaintenance') {
        return {
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.maintenance[id],
              id,
              data: () => state.maintenance[id],
            })),
          })),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
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

function getRouteHandler(method: 'get', path: string) {
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

describe('medication reminder timing backfill ops status route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-operator requests', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/timing-backfill-status');
    const req = createRequest({
      user: { uid: 'user-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
    });
  });

  it('returns stale status for operators when cursor has not progressed', async () => {
    const staleProcessedAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const harness = buildHarness({
      maintenance: {
        medicationReminderTimingPolicyBackfill: {
          cursorDocId: 'rem-200',
          lastProcessedAt: makeTimestamp(staleProcessedAt),
          lastProcessed: 250,
          lastUpdated: 25,
          completedAt: null,
          lastRunStartedAt: makeTimestamp(new Date(staleProcessedAt.getTime() - 2 * 60 * 1000)),
          lastRunFinishedAt: makeTimestamp(staleProcessedAt),
          lastRunStatus: 'success',
          lastRunErrorAt: null,
          lastRunErrorMessage: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/timing-backfill-status');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.get('cache-control')).toBe('private, max-age=15');
    expect(res.body).toMatchObject({
      cursorDocId: 'rem-200',
      hasMore: true,
      stale: true,
      needsAttention: true,
      lastRunStatus: 'success',
      lastProcessedCount: 250,
      lastUpdatedCount: 25,
    });
    expect((res.body as { lastProcessedAt: string }).lastProcessedAt).toBe(
      staleProcessedAt.toISOString(),
    );
  });

  it('marks failed backfill runs as needing attention', async () => {
    const failedAt = new Date(Date.now() - 30 * 60 * 1000);
    const harness = buildHarness({
      maintenance: {
        medicationReminderTimingPolicyBackfill: {
          cursorDocId: null,
          lastProcessedAt: makeTimestamp(failedAt),
          lastProcessed: 0,
          lastUpdated: 0,
          completedAt: makeTimestamp(failedAt),
          lastRunStartedAt: makeTimestamp(new Date(failedAt.getTime() - 60 * 1000)),
          lastRunFinishedAt: makeTimestamp(failedAt),
          lastRunStatus: 'error',
          lastRunErrorAt: makeTimestamp(failedAt),
          lastRunErrorMessage: 'Firestore unavailable',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/timing-backfill-status');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      hasMore: false,
      stale: false,
      needsAttention: true,
      lastRunStatus: 'error',
      lastRunErrorMessage: 'Firestore unavailable',
    });
  });
});
