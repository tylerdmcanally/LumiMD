import * as admin from 'firebase-admin';
import { authRouter } from '../auth';

type RecordMap = Record<string, any>;

type HarnessState = {
  authHandoffs: Record<string, RecordMap>;
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
    authHandoffs: { ...(initial?.authHandoffs ?? {}) },
  };

  const makeHandoffDocRef = (code: string): any => ({
    id: code,
    path: `auth_handoffs/${code}`,
    get: jest.fn(async () => ({
      exists: !!state.authHandoffs[code],
      id: code,
      data: () => state.authHandoffs[code],
    })),
    set: jest.fn(async (payload: RecordMap) => {
      state.authHandoffs[code] = { ...payload };
    }),
    update: jest.fn(async (payload: RecordMap) => {
      const current = state.authHandoffs[code];
      if (!current) {
        throw new Error(`Handoff not found: ${code}`);
      }
      state.authHandoffs[code] = {
        ...current,
        ...payload,
      };
    }),
    delete: jest.fn(async () => {
      delete state.authHandoffs[code];
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'auth_handoffs') {
        return {
          doc: jest.fn((code: string) => makeHandoffDocRef(code)),
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
    runTransaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        get: jest.fn(async (ref: { get: () => Promise<unknown> }) => ref.get()),
        update: jest.fn(async (ref: { update: (payload: RecordMap) => Promise<void> }, payload: RecordMap) =>
          ref.update(payload),
        ),
        delete: jest.fn(async (ref: { delete: () => Promise<void> }) => ref.delete()),
      };
      return callback(tx);
    }),
  };

  const auth = {
    createCustomToken: jest.fn(async (userId: string) => `custom-token-${userId}`),
  };

  return { state, db, auth };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'user-1' },
    body: {},
    params: {},
    query: {},
    headers: {},
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
  };
  return res;
}

function getRouteHandler(method: 'post', path: string) {
  const layer = authRouter.stack.find(
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

describe('auth handoff routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;
  const nowTimestamp = makeTimestamp('2026-02-22T18:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => nowTimestamp),
      fromMillis: (millis: number) => makeTimestamp(new Date(millis).toISOString()),
    };
  });

  it('creates a handoff code for the authenticated user', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('post', '/create-handoff');
    const req = createRequest({ user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(typeof res.body.code).toBe('string');
    expect(res.body.code.length).toBeGreaterThan(10);

    const handoff = harness.state.authHandoffs[res.body.code];
    expect(handoff).toBeDefined();
    expect(handoff.userId).toBe('user-1');
    expect(handoff.used).toBe(false);
    expect(handoff.expiresAt.toMillis() - handoff.createdAt.toMillis()).toBe(5 * 60 * 1000);
  });

  it('exchanges a valid handoff code and marks it used', async () => {
    const harness = buildHarness({
      authHandoffs: {
        'code-1': {
          userId: 'user-1',
          used: false,
          createdAt: makeTimestamp('2026-02-22T17:55:00.000Z'),
          expiresAt: makeTimestamp('2099-02-22T18:05:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('post', '/exchange-handoff');
    const req = createRequest({ body: { code: 'code-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ token: 'custom-token-user-1' });
    expect(harness.state.authHandoffs['code-1'].used).toBe(true);
    expect(typeof harness.state.authHandoffs['code-1'].usedAt?.toDate).toBe('function');
    expect(harness.auth.createCustomToken).toHaveBeenCalledWith('user-1');
  });

  it('returns unauthorized when exchanging a used handoff code', async () => {
    const harness = buildHarness({
      authHandoffs: {
        'code-1': {
          userId: 'user-1',
          used: true,
          createdAt: makeTimestamp('2026-02-22T17:55:00.000Z'),
          expiresAt: makeTimestamp('2099-02-22T18:05:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('post', '/exchange-handoff');
    const req = createRequest({ body: { code: 'code-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      code: 'unauthorized',
      message: 'Code has already been used',
    });
  });

  it('returns unauthorized and deletes expired handoff code', async () => {
    const harness = buildHarness({
      authHandoffs: {
        'code-1': {
          userId: 'user-1',
          used: false,
          createdAt: makeTimestamp('2026-02-22T17:55:00.000Z'),
          expiresAt: makeTimestamp('2000-02-22T18:05:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('post', '/exchange-handoff');
    const req = createRequest({ body: { code: 'code-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      code: 'unauthorized',
      message: 'Code has expired',
    });
    expect(harness.state.authHandoffs['code-1']).toBeUndefined();
  });

  it('returns unauthorized for an invalid handoff code', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('post', '/exchange-handoff');
    const req = createRequest({ body: { code: 'missing-code' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      code: 'unauthorized',
      message: 'Invalid or expired code',
    });
  });
});
