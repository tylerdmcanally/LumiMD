import * as admin from 'firebase-admin';
import medicationLogsRouter from '../medicationLogs';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  users: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  medicationLogs: Record<string, RecordMap>;
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
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    medicationLogs: { ...(initial?.medicationLogs ?? {}) },
  };

  let nextLogId = 1;

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn((userId: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.users[userId],
              id: userId,
              data: () => state.users[userId],
            })),
          })),
        };
      }

      if (name === 'medicationLogs') {
        return {
          add: jest.fn(async (payload: RecordMap) => {
            const id = `med-log-${nextLogId++}`;
            state.medicationLogs[id] = payload;
            return { id };
          }),
        };
      }

      if (name === 'medications') {
        return {
          doc: jest.fn((medicationId: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.medications[medicationId],
              id: medicationId,
              data: () => state.medications[medicationId],
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
  const layer = medicationLogsRouter.stack.find(
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

describe('medication logs input sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('sanitizes medicationName before storing compliance logs', async () => {
    const harness = buildHarness({
      users: {
        'user-1': {
          timezone: 'America/New_York',
        },
      },
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Metformin XR',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationId: 'med-1',
        medicationName: ' <script>alert(1)</script> Metformin <b>XR</b> ',
        reminderId: 'rem-1',
        action: 'taken',
        scheduledTime: '09:00',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      medicationName: 'Metformin XR',
    });
    expect(harness.state.medicationLogs['med-log-1']).toMatchObject({
      medicationName: 'Metformin XR',
    });
  });

  it('rejects create requests when medicationName becomes empty after sanitization', async () => {
    const harness = buildHarness({
      users: {
        'user-1': {
          timezone: 'America/New_York',
        },
      },
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Metformin XR',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationId: 'med-1',
        medicationName: '<script>alert(1)</script>',
        reminderId: 'rem-1',
        action: 'taken',
        scheduledTime: '09:00',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: 'Medication name is required',
    });
    expect(harness.state.medicationLogs['med-log-1']).toBeUndefined();
  });

  it('rejects create requests when medication belongs to another user', async () => {
    const harness = buildHarness({
      users: {
        'user-1': {
          timezone: 'America/New_York',
        },
      },
      medications: {
        'med-1': {
          userId: 'user-2',
          name: 'Metformin XR',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationId: 'med-1',
        medicationName: 'Metformin XR',
        reminderId: 'rem-1',
        action: 'taken',
        scheduledTime: '09:00',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      message: 'Cannot log action for another user\'s medication',
    });
    expect(harness.state.medicationLogs['med-log-1']).toBeUndefined();
  });
});
