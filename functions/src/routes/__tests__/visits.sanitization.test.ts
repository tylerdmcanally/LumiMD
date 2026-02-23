import * as admin from 'firebase-admin';
import { visitsRouter } from '../visits';

type RecordMap = Record<string, unknown>;

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

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'visits') {
        return {
          doc: jest.fn((_id: string) => ({
            get: jest.fn(async () => ({ exists: false, data: () => undefined })),
            update: jest.fn(async () => undefined),
            set: jest.fn(async () => undefined),
          })),
          where: jest.fn(() => ({
            where: jest.fn(),
            orderBy: jest.fn(),
            limit: jest.fn(),
            get: jest.fn(async () => ({ docs: [], empty: true, size: 0 })),
          })),
        };
      }

      return {
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.visits[id],
            id,
            data: () => state.visits[id],
          })),
          update: jest.fn(async (updates: RecordMap) => {
            if (!state.visits[id]) {
              throw new Error(`Visit not found: ${id}`);
            }
            state.visits[id] = {
              ...state.visits[id],
              ...updates,
            };
          }),
          set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
            if (options?.merge) {
              state.visits[id] = {
                ...(state.visits[id] ?? {}),
                ...data,
              };
              return;
            }
            state.visits[id] = { ...data };
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

function getRouteHandler(method: 'patch', path: string) {
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

describe('visits input sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-02-23T15:00:00.000Z'));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: timestampNowMock,
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('sanitizes patch array fields before persisting visit updates', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          notes: 'Existing note',
          diagnoses: [],
          imaging: [],
          nextSteps: [],
          tags: [],
          folders: [],
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'visit-1' },
      body: {
        diagnoses: ['<b>Hypertension</b>', '  ', '<b>Hypertension</b>'],
        imaging: ['<script>alert(1)</script>MRI'],
        nextSteps: [' <img src=x onerror=1>Follow-up in 2 weeks '],
        tags: ['<i>Cardio</i>', '<i>Cardio</i>'],
        folders: ['  <u>Primary Care</u>  '],
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.visits['visit-1']).toMatchObject({
      diagnoses: ['Hypertension'],
      imaging: ['MRI'],
      nextSteps: ['Follow-up in 2 weeks'],
      tags: ['Cardio'],
      folders: ['Primary Care'],
    });
  });
});

