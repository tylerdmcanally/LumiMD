import * as admin from 'firebase-admin';
import { medicationRemindersRouter } from '../medicationReminders';

type PushTokenRecord = { token: string };

type HarnessState = {
  pushTokensByUser: Record<string, PushTokenRecord[]>;
};

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    pushTokensByUser: { ...(initial?.pushTokensByUser ?? {}) },
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn((userId: string) => ({
            collection: jest.fn((subCollection: string) => {
              if (subCollection !== 'pushTokens') {
                throw new Error(`Unknown users subcollection: ${subCollection}`);
              }
              return {
                get: jest.fn(async () => {
                  const tokens = state.pushTokensByUser[userId] ?? [];
                  return {
                    empty: tokens.length === 0,
                    docs: tokens.map((token) => ({
                      data: () => token,
                    })),
                  };
                }),
              };
            }),
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

describe('medication reminders debug notification sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({
      json: async () => ({ data: [{ status: 'ok' }] }),
    })) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sanitizes medication fields before building debug notification payloads', async () => {
    const harness = buildHarness({
      pushTokensByUser: {
        'user-1': [{ token: 'ExponentPushToken[test-token]' }],
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/debug/test-notify');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationName: '<script>alert(1)</script><b>Tacrolimus</b>',
        medicationDose: '<img src=x onerror=alert(1)>1mg',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const fetchMock = global.fetch as unknown as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse((options as { body: string }).body) as Array<{
      body: string;
      data: { medicationName: string; medicationDose: string };
    }>;

    expect(payload[0].body).toBe('Time to take your Tacrolimus (1mg)');
    expect(payload[0].data.medicationName).toBe('Tacrolimus');
    expect(payload[0].data.medicationDose).toBe('1mg');
  });

  it('falls back to defaults when sanitized values are empty', async () => {
    const harness = buildHarness({
      pushTokensByUser: {
        'user-1': [{ token: 'ExponentPushToken[test-token]' }],
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/debug/test-notify');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationName: '<script>alert(1)</script>',
        medicationDose: '<style>bad</style>',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const fetchMock = global.fetch as unknown as jest.Mock;
    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse((options as { body: string }).body) as Array<{
      body: string;
      data: { medicationName: string; medicationDose: string };
    }>;

    expect(payload[0].body).toBe('Time to take your Test Medication (10mg)');
    expect(payload[0].data.medicationName).toBe('Test Medication');
    expect(payload[0].data.medicationDose).toBe('10mg');
  });
});
