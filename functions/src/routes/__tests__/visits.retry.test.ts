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

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    visits: { ...(initial?.visits ?? {}) },
  };

  const makeVisitDocRef = (visitId: string) => ({
    id: visitId,
    path: `visits/${visitId}`,
    get: jest.fn(async () => ({
      exists: Boolean(state.visits[visitId]),
      id: visitId,
      data: () => state.visits[visitId],
    })),
    update: jest.fn(async (payload: RecordMap) => {
      const current = state.visits[visitId];
      if (!current) {
        throw new Error(`Visit not found: ${visitId}`);
      }

      const next = { ...current };
      Object.entries(payload).forEach(([key, value]) => {
        if (value && typeof value === 'object' && (value as any).__op === 'delete') {
          delete next[key];
          return;
        }
        if (value && typeof value === 'object' && (value as any).__op === 'increment') {
          const amount = Number((value as any).value ?? 0);
          const existing = typeof next[key] === 'number' ? next[key] : 0;
          next[key] = existing + amount;
          return;
        }
        next[key] = value;
      });
      state.visits[visitId] = next;
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'visits') {
        return {
          doc: jest.fn((visitId: string) => makeVisitDocRef(visitId)),
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'user-1' },
    body: {},
    params: { id: 'visit-1' },
    headers: {},
    ip: '127.0.0.1',
    query: {},
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

describe('visits retry route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-11T19:00:00.000Z')),
    };
    (firestoreMock as any).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
      increment: jest.fn((value: number) => ({ __op: 'increment', value })),
    };
  });

  it('returns retry_too_soon when user retries within throttle window', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'failed',
          storagePath: 'visits/user-1/visit-1.m4a',
          lastRetryAt: makeTimestamp(new Date(Date.now() - 10_000)),
          createdAt: makeTimestamp('2026-02-11T18:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-11T18:30:00.000Z'),
          retryCount: 0,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/retry');
    const req = createRequest({ params: { id: 'visit-1' }, user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('retry_too_soon');
  });

  it('retries directly at summarization when transcript already exists', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'failed',
          storagePath: 'visits/user-1/visit-1.m4a',
          transcript: 'Existing transcript text',
          transcriptText: 'Existing transcript text',
          createdAt: makeTimestamp('2026-02-11T17:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-11T17:30:00.000Z'),
          retryCount: 0,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/retry');
    const req = createRequest({ params: { id: 'visit-1' }, user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.visits['visit-1'].processingStatus).toBe('summarizing');
    expect(harness.state.visits['visit-1'].status).toBe('processing');
    expect(harness.state.visits['visit-1'].retryCount).toBe(1);
    expect(res.body.id).toBe('visit-1');
  });
});
