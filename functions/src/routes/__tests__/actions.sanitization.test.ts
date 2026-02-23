import * as admin from 'firebase-admin';
import { actionsRouter } from '../actions';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  actions: Record<string, RecordMap>;
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
    actions: { ...(initial?.actions ?? {}) },
  };

  let actionCounter = 0;

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'actions') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        add: jest.fn(async (payload: RecordMap) => {
          const id = `action-${++actionCounter}`;
          state.actions[id] = payload;
          return {
            id,
            get: jest.fn(async () => ({
              exists: true,
              id,
              data: () => state.actions[id],
            })),
          };
        }),
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.actions[id],
            id,
            data: () => state.actions[id],
          })),
          update: jest.fn(async (updates: RecordMap) => {
            if (!state.actions[id]) {
              throw new Error(`Action not found: ${id}`);
            }
            state.actions[id] = {
              ...state.actions[id],
              ...updates,
            };
          }),
          delete: jest.fn(async () => {
            delete state.actions[id];
          }),
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

function getRouteHandler(method: 'post' | 'patch', path: string) {
  const layer = actionsRouter.stack.find(
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

describe('actions input sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z'));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: timestampNowMock,
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('sanitizes action description and notes on create', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        description: '<script>alert(1)</script>  Call <b>Dr.</b>',
        notes: ' <img src=x onerror=alert(1)> bring forms ',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      description: 'Call Dr.',
      notes: 'bring forms',
    });
  });

  it('rejects update when sanitized description becomes empty', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'user-1',
          description: 'Existing action',
          notes: 'Existing notes',
          completed: false,
          createdAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'action-1' },
      body: {
        description: '<script>alert(1)</script>',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Description is required',
    });
    expect(harness.state.actions['action-1'].description).toBe('Existing action');
  });
});
