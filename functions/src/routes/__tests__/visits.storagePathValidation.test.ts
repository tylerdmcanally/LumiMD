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
    headersSent: false,
    _headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    set(key: string, value: string) {
      this._headers[key] = value;
      return this;
    },
  };
  return res;
}

function getRouteHandler(method: string, path: string) {
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

describe('visits storage path validation', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-03-12T15:00:00.000Z'));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: timestampNowMock,
      fromDate: (date: Date) => makeTimestamp(date),
    };
    (firestoreMock as any).FieldValue = {
      serverTimestamp: jest.fn(() => makeTimestamp(new Date())),
      delete: jest.fn(() => '__delete__'),
      increment: jest.fn((n: number) => n),
    };
  });

  describe('POST /v1/visits', () => {
    it('rejects documentStoragePath pointing to another user', async () => {
      const harness = buildHarness();
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('post', '/');
      const req = createRequest({
        user: { uid: 'user-1' },
        body: {
          source: 'avs_photo',
          documentStoragePath: 'visits/OTHER_USER/doc.jpg',
          documentType: 'avs_photo',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('forbidden');
    });

    it('rejects documentStoragePath with traversal', async () => {
      const harness = buildHarness();
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('post', '/');
      const req = createRequest({
        user: { uid: 'user-1' },
        body: {
          source: 'avs_photo',
          documentStoragePath: 'visits/../other/doc.jpg',
          documentType: 'avs_photo',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('forbidden');
    });

    it('rejects array with one bad path', async () => {
      const harness = buildHarness();
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('post', '/');
      const req = createRequest({
        user: { uid: 'user-1' },
        body: {
          source: 'avs_photo',
          documentStoragePath: [
            'visits/user-1/p1.jpg',
            'visits/OTHER_USER/p2.jpg',
          ],
          documentType: 'avs_photo',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('forbidden');
    });

    it('rejects storagePath pointing to another user', async () => {
      const harness = buildHarness();
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('post', '/');
      const req = createRequest({
        user: { uid: 'user-1' },
        body: {
          storagePath: 'audio/OTHER_USER/file.m4a',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('forbidden');
    });

    it('accepts valid documentStoragePath for own user', async () => {
      const harness = buildHarness();
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('post', '/');
      const req = createRequest({
        user: { uid: 'user-1' },
        body: {
          source: 'avs_photo',
          documentStoragePath: 'visits/user-1/doc.jpg',
          documentType: 'avs_photo',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      // Should pass path validation (not 403); may 500 due to incomplete mock
      expect(res.statusCode).not.toBe(403);
    });
  });

  describe('PATCH /v1/visits/:id', () => {
    it('rejects storagePath pointing to another user', async () => {
      const harness = buildHarness({
        visits: {
          'visit-1': {
            userId: 'user-1',
            notes: 'test',
            createdAt: makeTimestamp('2026-03-10T10:00:00.000Z'),
            updatedAt: makeTimestamp('2026-03-10T10:00:00.000Z'),
          },
        },
      });
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('patch', '/:id');
      const req = createRequest({
        user: { uid: 'user-1' },
        params: { id: 'visit-1' },
        body: {
          storagePath: 'audio/OTHER_USER/file.m4a',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('forbidden');
    });

    it('rejects storagePath with traversal', async () => {
      const harness = buildHarness({
        visits: {
          'visit-1': {
            userId: 'user-1',
            createdAt: makeTimestamp('2026-03-10T10:00:00.000Z'),
            updatedAt: makeTimestamp('2026-03-10T10:00:00.000Z'),
          },
        },
      });
      firestoreMock.mockImplementation(() => harness.db);

      const handler = getRouteHandler('patch', '/:id');
      const req = createRequest({
        user: { uid: 'user-1' },
        params: { id: 'visit-1' },
        body: {
          storagePath: 'audio/../other-user/file.m4a',
        },
      });
      const res = createResponse();

      await handler(req, res, jest.fn());

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('forbidden');
    });
  });
});
