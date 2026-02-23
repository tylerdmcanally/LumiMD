import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, unknown>;

type HarnessState = {
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

function isPlainObject(value: unknown): value is RecordMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target: RecordMap, source: RecordMap): RecordMap {
  const output: RecordMap = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key] as RecordMap, value);
      continue;
    }
    output[key] = value;
  }
  return output;
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    shares: { ...(initial?.shares ?? {}) },
    shareInvites: { ...(initial?.shareInvites ?? {}) },
  };

  const makeShareDocRef = (id: string) => ({
    id,
    get: jest.fn(async () => ({
      exists: !!state.shares[id],
      id,
      data: () => state.shares[id],
    })),
    set: jest.fn(async (payload: RecordMap, options?: { merge?: boolean }) => {
      if (options?.merge && state.shares[id]) {
        state.shares[id] = deepMerge(state.shares[id], payload);
        return;
      }
      state.shares[id] = payload;
    }),
    update: jest.fn(async (payload: RecordMap) => {
      if (!state.shares[id]) {
        throw new Error(`Share not found: ${id}`);
      }
      state.shares[id] = deepMerge(state.shares[id], payload);
    }),
  });

  const makeInviteDocRef = (id: string) => ({
    id,
    get: jest.fn(async () => ({
      exists: !!state.shareInvites[id],
      id,
      data: () => state.shareInvites[id],
    })),
    update: jest.fn(async (payload: RecordMap) => {
      if (!state.shareInvites[id]) {
        throw new Error(`Invite not found: ${id}`);
      }
      state.shareInvites[id] = deepMerge(state.shareInvites[id], payload);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'shares') {
        return {
          doc: jest.fn((id: string) => makeShareDocRef(id)),
        };
      }

      if (name === 'shareInvites') {
        return {
          doc: jest.fn((id: string) => makeInviteDocRef(id)),
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
    params: { id: 'resource-1' },
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

function getRouteHandler(method: 'delete', path: string) {
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

describe('users caregiver revoke route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-21T10:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('revokes owned share when caregiver id matches a share doc', async () => {
    const harness = buildHarness({
      shares: {
        'share-1': {
          ownerId: 'user-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('delete', '/me/caregivers/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'share-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.state.shares['share-1']).toMatchObject({
      status: 'revoked',
      ownerId: 'user-1',
    });
    expect(typeof (harness.state.shares['share-1'].revokedAt as { toDate?: unknown })?.toDate).toBe(
      'function',
    );
  });

  it('revokes owned invite when caregiver id matches an invite doc', async () => {
    const harness = buildHarness({
      shareInvites: {
        'invite-1': {
          ownerId: 'user-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'pending',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('delete', '/me/caregivers/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'invite-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.state.shareInvites['invite-1']).toMatchObject({
      status: 'revoked',
      ownerId: 'user-1',
    });
  });

  it('returns not_found when caller does not own the caregiver resource', async () => {
    const harness = buildHarness({
      shares: {
        'share-1': {
          ownerId: 'other-user',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('delete', '/me/caregivers/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'share-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      code: 'not_found',
      message: 'Caregiver not found',
    });
    expect(harness.state.shares['share-1']).toMatchObject({
      status: 'accepted',
      ownerId: 'other-user',
    });
  });
});
