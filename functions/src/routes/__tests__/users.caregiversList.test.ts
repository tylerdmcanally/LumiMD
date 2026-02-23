import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  users: Record<string, RecordMap>;
  shares: Record<string, RecordMap>;
  shareInvites: Record<string, RecordMap>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function makeDocSnapshot(id: string, data: RecordMap, path: string) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      id,
      path,
    },
  };
}

function makeQuerySnapshot(docs: Array<ReturnType<typeof makeDocSnapshot>>) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    users: { ...(initial?.users ?? {}) },
    shares: { ...(initial?.shares ?? {}) },
    shareInvites: { ...(initial?.shareInvites ?? {}) },
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.users[id],
              id,
              data: () => state.users[id],
            })),
          })),
        };
      }

      if (name === 'shares' || name === 'shareInvites') {
        const collectionState = name === 'shares' ? state.shares : state.shareInvites;
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) => {
            const filteredDocs = Object.entries(collectionState)
              .filter(([, data]) => data[field] === value)
              .map(([id, data]) => makeDocSnapshot(id, data, `${name}/${id}`));
            return {
              orderBy: jest.fn(() => ({
                get: jest.fn(async () => makeQuerySnapshot(filteredDocs)),
              })),
              get: jest.fn(async () => makeQuerySnapshot(filteredDocs)),
            };
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

function getRouteHandler(method: 'get', path: string) {
  const layer = usersRouter.stack.find(
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

describe('users caregivers list route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists active caregivers and pending invites for the user', async () => {
    const harness = buildHarness({
      users: {
        'user-1': {
          autoShareWithCaregivers: false,
        },
      },
      shares: {
        'share-1': {
          ownerId: 'user-1',
          caregiverEmail: 'amy@example.com',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
          role: 'editor',
          createdAt: makeTimestamp('2026-02-22T10:00:00.000Z'),
        },
        'share-2': {
          ownerId: 'user-1',
          caregiverEmail: 'ignored@example.com',
          status: 'pending',
          createdAt: makeTimestamp('2026-02-22T11:00:00.000Z'),
        },
      },
      shareInvites: {
        'invite-1': {
          ownerId: 'user-1',
          caregiverEmail: 'ben@example.com',
          status: 'pending',
          role: 'viewer',
          createdAt: makeTimestamp('2026-02-22T12:00:00.000Z'),
        },
        'invite-2': {
          ownerId: 'user-1',
          caregiverEmail: 'ignored2@example.com',
          status: 'accepted',
          createdAt: makeTimestamp('2026-02-22T13:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/me/caregivers');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.autoShareWithCaregivers).toBe(false);
    expect(res.body.caregivers).toHaveLength(2);
    expect(res.body.caregivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'share-1',
          email: 'amy@example.com',
          status: 'active',
          relationship: 'editor',
          shareUserId: 'caregiver-1',
          name: 'amy',
        }),
        expect.objectContaining({
          id: 'invite-1',
          email: 'ben@example.com',
          status: 'pending',
          relationship: 'viewer',
          name: 'ben',
        }),
      ]),
    );
  });

  it('falls back to inviteeEmail and defaults autoShareWithCaregivers to true', async () => {
    const harness = buildHarness({
      shareInvites: {
        'invite-1': {
          ownerId: 'user-1',
          inviteeEmail: 'fallback@example.com',
          status: 'pending',
          createdAt: makeTimestamp('2026-02-22T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/me/caregivers');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.autoShareWithCaregivers).toBe(true);
    expect(res.body.caregivers).toHaveLength(1);
    expect(res.body.caregivers[0]).toMatchObject({
      id: 'invite-1',
      email: 'fallback@example.com',
      name: 'fallback',
      status: 'pending',
    });
  });
});
