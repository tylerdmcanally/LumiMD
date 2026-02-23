import * as admin from 'firebase-admin';
import { visitsRouter } from '../visits';
import { clearCaregiverShareLookupCacheForTests } from '../../services/shareAccess';

type RecordMap = Record<string, any>;

type HarnessState = {
  visits: Record<string, RecordMap>;
  shares: Record<string, RecordMap>;
  authUsers: Record<string, { uid: string; email?: string }>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function makeQuerySnapshot(docs: any[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    visits: { ...(initial?.visits ?? {}) },
    shares: { ...(initial?.shares ?? {}) },
    authUsers: { ...(initial?.authUsers ?? {}) },
  };

  const makeVisitDocRef = (visitId: string) => ({
    id: visitId,
    path: `visits/${visitId}`,
    get: jest.fn(async () => ({
      exists: Boolean(state.visits[visitId]),
      id: visitId,
      data: () => state.visits[visitId],
    })),
  });

  const makeShareDocRef = (shareId: string) => ({
    id: shareId,
    path: `shares/${shareId}`,
    update: jest.fn(async (payload: RecordMap) => {
      if (!state.shares[shareId]) {
        throw new Error(`Share not found: ${shareId}`);
      }
      state.shares[shareId] = {
        ...state.shares[shareId],
        ...payload,
      };
    }),
  });

  const makeShareDocSnapshot = (shareId: string) => ({
    exists: Boolean(state.shares[shareId]),
    id: shareId,
    data: () => state.shares[shareId],
  });

  const buildSharesQuery = (
    filters: Array<{ field: string; value: unknown }>,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildSharesQuery([...filters, { field, value }]),
    ),
    limit: jest.fn(() => buildSharesQuery(filters)),
    get: jest.fn(async () => {
      const docs = Object.entries(state.shares)
        .filter(([, share]) => filters.every((filter) => share[filter.field] === filter.value))
        .map(([id, share]) => ({
          id,
          data: () => share,
          ref: makeShareDocRef(id),
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'visits') {
        return {
          doc: jest.fn((visitId: string) => makeVisitDocRef(visitId)),
        };
      }

      if (name === 'shares') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildSharesQuery([{ field, value }]),
          ),
          doc: jest.fn((shareId: string) => ({
            get: jest.fn(async () => makeShareDocSnapshot(shareId)),
            set: jest.fn(async (payload: RecordMap, options?: { merge?: boolean }) => {
              if (options?.merge) {
                state.shares[shareId] = {
                  ...(state.shares[shareId] ?? {}),
                  ...payload,
                };
                return;
              }
              state.shares[shareId] = { ...payload };
            }),
            update: jest.fn(async (payload: RecordMap) => {
              if (!state.shares[shareId]) {
                throw new Error(`Share not found: ${shareId}`);
              }
              state.shares[shareId] = {
                ...state.shares[shareId],
                ...payload,
              };
            }),
          })),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  const auth = {
    getUser: jest.fn(async (uid: string) => {
      const user = state.authUsers[uid];
      if (!user) {
        throw new Error(`User not found: ${uid}`);
      }
      return user;
    }),
  };

  return { state, db, auth };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'owner-1' },
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
  };
  return res;
}

function getRouteHandler(method: 'get', path: string) {
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

describe('visits access control', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCaregiverShareLookupCacheForTests();
    (firestoreMock as any).FieldValue = {
      serverTimestamp: jest.fn(() => ({ __op: 'serverTimestamp' })),
    };
  });

  it('allows visit owner to read visit', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'owner-1',
          summary: 'Visit summary',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:05:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/:id');
    const req = createRequest({ user: { uid: 'owner-1' }, params: { id: 'visit-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('visit-1');
  });

  it('allows accepted caregiver to read visit when caregiverUserId matches', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'owner-1',
          summary: 'Visit summary',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:05:00.000Z'),
        },
      },
      shares: {
        'owner-1_caregiver-1': {
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
        },
      },
      authUsers: {
        'caregiver-1': { uid: 'caregiver-1', email: 'caregiver@example.com' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/:id');
    const req = createRequest({ user: { uid: 'caregiver-1' }, params: { id: 'visit-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('visit-1');
  });

  it('allows accepted caregiver via email fallback and backfills caregiverUserId', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'owner-1',
          summary: 'Visit summary',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:05:00.000Z'),
        },
      },
      shares: {
        'legacy-share': {
          ownerId: 'owner-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
          caregiverUserId: null,
        },
      },
      authUsers: {
        'caregiver-1': { uid: 'caregiver-1', email: 'caregiver@example.com' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/:id');
    const req = createRequest({ user: { uid: 'caregiver-1' }, params: { id: 'visit-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.shares['legacy-share'].caregiverUserId).toBe('caregiver-1');
  });

  it('returns forbidden when user is not owner and has no accepted share', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'owner-1',
          summary: 'Visit summary',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:05:00.000Z'),
        },
      },
      shares: {
        'owner-1_caregiver-1': {
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'revoked',
        },
      },
      authUsers: {
        'caregiver-1': { uid: 'caregiver-1', email: 'caregiver@example.com' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/:id');
    const req = createRequest({ user: { uid: 'caregiver-1' }, params: { id: 'visit-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });
});
