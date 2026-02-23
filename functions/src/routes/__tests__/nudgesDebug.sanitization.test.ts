import * as admin from 'firebase-admin';
import { nudgesDebugRouter } from '../nudgesDebug';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  nudges: Record<string, RecordMap>;
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
    nudges: { ...(initial?.nudges ?? {}) },
  };

  let nudgeSequence = 0;

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'nudges') {
        return {
          add: jest.fn(async (payload: RecordMap) => {
            nudgeSequence += 1;
            const id = `nudge-${nudgeSequence}`;
            state.nudges[id] = payload;
            return { id };
          }),
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
  const layer = nudgesDebugRouter.stack.find(
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

describe('nudges debug medication-name sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const originalEnv = {
    FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR,
    NODE_ENV: process.env.NODE_ENV,
    LUMIBOT_DEBUG: process.env.LUMIBOT_DEBUG,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.NODE_ENV = 'production';
    process.env.LUMIBOT_DEBUG = 'false';

    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-24T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  afterEach(() => {
    process.env.FUNCTIONS_EMULATOR = originalEnv.FUNCTIONS_EMULATOR;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.LUMIBOT_DEBUG = originalEnv.LUMIBOT_DEBUG;
  });

  it('sanitizes medication name for debug/create medication check-in nudges', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/debug/create');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        type: 'medication_checkin',
        medicationName: '<script>alert(1)</script><b>Tacrolimus</b>',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    const created = Object.values(harness.state.nudges)[0] as {
      medicationName: string;
      title: string;
      message: string;
    };

    expect(created.medicationName).toBe('Tacrolimus');
    expect(created.title).toContain('Tacrolimus');
    expect(created.message).toContain('Tacrolimus');
    expect(created.title).not.toContain('<');
    expect(created.message).not.toContain('<');
  });

  it('sanitizes medication name for debug/create-sequence payloads', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/debug/create-sequence');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationName: '<img src=x onerror=alert(1)>Metformin',
        intervalSeconds: 30,
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    const created = Object.values(harness.state.nudges) as Array<{
      medicationName: string;
      title: string;
      message: string;
    }>;

    expect(created).toHaveLength(4);
    created.forEach((nudge) => {
      expect(nudge.medicationName).toBe('Metformin');
      expect(nudge.message).toContain('Metformin');
      expect(nudge.title).not.toContain('<');
      expect(nudge.message).not.toContain('<');
    });
  });

  it('uses fallback medication name when sanitized input is empty', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/debug/test-condition');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        condition: 'med',
        medicationName: '<style>noop</style>',
        intervalSeconds: 30,
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    const created = Object.values(harness.state.nudges)[0] as {
      medicationName: string;
    };

    expect(created.medicationName).toBe('Test Medication');
  });
});
