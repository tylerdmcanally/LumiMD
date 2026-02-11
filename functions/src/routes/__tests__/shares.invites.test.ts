import * as admin from 'firebase-admin';
import { sharesRouter } from '../shares';

type RecordMap = Record<string, unknown>;

type AuthUser = {
  uid: string;
  email?: string;
  displayName?: string;
};

type HarnessState = {
  users: Record<string, RecordMap>;
  shareInvites: Record<string, RecordMap>;
  shares: Record<string, RecordMap>;
  authUsers: Record<string, AuthUser>;
};

const SERVER_TIMESTAMP_SENTINEL = Symbol('serverTimestamp');

function makeTimestamp(iso: string) {
  const date = new Date(iso);
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

function isPlainObject(value: unknown): value is RecordMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimestampLike(value: unknown): value is {
  toDate: () => Date;
  toMillis: () => number;
} {
  if (!isPlainObject(value)) return false;
  return (
    typeof (value as { toDate?: unknown }).toDate === 'function' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  );
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

function resolveValue(value: unknown, timestampNow: () => unknown): unknown {
  if (value === SERVER_TIMESTAMP_SENTINEL) {
    return timestampNow();
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, timestampNow));
  }
  if (isTimestampLike(value)) {
    return value;
  }
  if (isPlainObject(value)) {
    const resolvedEntries = Object.entries(value).map(([key, nestedValue]) => [
      key,
      resolveValue(nestedValue, timestampNow),
    ]);
    return Object.fromEntries(resolvedEntries);
  }
  return value;
}

function resolveRecord(record: RecordMap, timestampNow: () => unknown): RecordMap {
  const entries = Object.entries(record).map(([key, value]) => [
    key,
    resolveValue(value, timestampNow),
  ]);
  return Object.fromEntries(entries);
}

function buildHarness(initialState?: Partial<HarnessState>, timestampNow?: () => unknown) {
  const nowResolver = timestampNow ?? (() => makeTimestamp('2026-02-10T22:30:00.000Z'));
  const state: HarnessState = {
    users: {},
    shareInvites: {},
    shares: {},
    authUsers: {},
    ...initialState,
  };

  const ensureUser = (userId: string): RecordMap => {
    if (!state.users[userId]) {
      state.users[userId] = {};
    }
    return state.users[userId];
  };

  const makeUserDocRef = (userId: string): any => ({
    __kind: 'userDocRef',
    id: userId,
    path: `users/${userId}`,
    get: jest.fn(async () => ({
      exists: !!state.users[userId],
      id: userId,
      data: () => state.users[userId],
    })),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      const resolved = resolveRecord(data, nowResolver);
      if (options?.merge) {
        state.users[userId] = deepMerge(ensureUser(userId), resolved);
        return;
      }
      state.users[userId] = resolved;
    }),
  });

  const makeShareInviteDocRef = (inviteId: string): any => ({
    __kind: 'shareInviteDocRef',
    id: inviteId,
    path: `shareInvites/${inviteId}`,
    get: jest.fn(async () => ({
      exists: !!state.shareInvites[inviteId],
      id: inviteId,
      data: () => state.shareInvites[inviteId],
      ref: makeShareInviteDocRef(inviteId),
    })),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      const resolved = resolveRecord(data, nowResolver);
      if (options?.merge) {
        state.shareInvites[inviteId] = deepMerge(state.shareInvites[inviteId] ?? {}, resolved);
        return;
      }
      state.shareInvites[inviteId] = resolved;
    }),
    update: jest.fn(async (updateData: RecordMap) => {
      if (!state.shareInvites[inviteId]) {
        throw new Error(`Invite doc not found: shareInvites/${inviteId}`);
      }
      const resolved = resolveRecord(updateData, nowResolver);
      state.shareInvites[inviteId] = deepMerge(state.shareInvites[inviteId], resolved);
    }),
  });

  const makeShareDocRef = (shareId: string): any => ({
    __kind: 'shareDocRef',
    id: shareId,
    path: `shares/${shareId}`,
    get: jest.fn(async () => ({
      exists: !!state.shares[shareId],
      id: shareId,
      data: () => state.shares[shareId],
      ref: makeShareDocRef(shareId),
    })),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      const resolved = resolveRecord(data, nowResolver);
      if (options?.merge) {
        state.shares[shareId] = deepMerge(state.shares[shareId] ?? {}, resolved);
        return;
      }
      state.shares[shareId] = resolved;
    }),
    update: jest.fn(async (updateData: RecordMap) => {
      if (!state.shares[shareId]) {
        throw new Error(`Share doc not found: shares/${shareId}`);
      }
      const resolved = resolveRecord(updateData, nowResolver);
      state.shares[shareId] = deepMerge(state.shares[shareId], resolved);
    }),
  });

  const toOrderableValue = (value: unknown): number | string => {
    if (isTimestampLike(value)) {
      return value.toMillis();
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return value;
    }
    return 0;
  };

  const buildQueryDocs = (
    docsById: Record<string, RecordMap>,
    docRefFactory: (id: string) => any,
    filters: Array<{ field: string; value: unknown }>,
    orderBy?:
      | {
          field: string;
          direction: 'asc' | 'desc';
        }
      | undefined,
  ) => {
    const filtered = Object.entries(docsById).filter(([, data]) =>
      filters.every((filter) => data[filter.field] === filter.value),
    );

    if (orderBy) {
      filtered.sort((left, right) => {
        const leftValue = toOrderableValue(left[1][orderBy.field]);
        const rightValue = toOrderableValue(right[1][orderBy.field]);
        if (leftValue === rightValue) return 0;
        const base = leftValue > rightValue ? 1 : -1;
        return orderBy.direction === 'desc' ? -base : base;
      });
    }

    return filtered.map(([id, data]) => ({
      id,
      data: () => data,
      ref: docRefFactory(id),
    }));
  };

  const makeWhereChain = (
    docsById: Record<string, RecordMap>,
    docRefFactory: (id: string) => any,
    filters: Array<{ field: string; value: unknown }> = [],
    orderBy?:
      | {
          field: string;
          direction: 'asc' | 'desc';
        }
      | undefined,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      makeWhereChain(docsById, docRefFactory, [...filters, { field, value }], orderBy),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      makeWhereChain(docsById, docRefFactory, filters, { field, direction }),
    ),
    limit: jest.fn((limitValue: number) => ({
      get: jest.fn(async () =>
        makeQuerySnapshot(buildQueryDocs(docsById, docRefFactory, filters, orderBy).slice(0, limitValue)),
      ),
    })),
    get: jest.fn(async () => makeQuerySnapshot(buildQueryDocs(docsById, docRefFactory, filters, orderBy))),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn((userId: string) => makeUserDocRef(userId)),
        };
      }

      if (name === 'shareInvites') {
        return {
          doc: jest.fn((inviteId: string) => makeShareInviteDocRef(inviteId)),
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            makeWhereChain(state.shareInvites, makeShareInviteDocRef, [{ field, value }]),
          ),
        };
      }

      if (name === 'shares') {
        return {
          doc: jest.fn((shareId: string) => makeShareDocRef(shareId)),
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            makeWhereChain(state.shares, makeShareDocRef, [{ field, value }]),
          ),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  const auth = {
    getUser: jest.fn(async (userId: string) => {
      const user = state.authUsers[userId];
      if (!user) {
        throw new Error(`Auth user not found: ${userId}`);
      }
      return user;
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      const normalized = email.toLowerCase().trim();
      const user = Object.values(state.authUsers).find(
        (entry) => entry.email?.toLowerCase().trim() === normalized,
      );
      if (!user) {
        throw new Error(`Auth user not found by email: ${email}`);
      }
      return user;
    }),
  };

  return { state, db, auth };
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

function getRouteHandler(method: 'get' | 'post' | 'patch', path: string) {
  const layer = sharesRouter.stack.find(
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

describe('shares invite compatibility routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-02-10T22:45:00.000Z'));
  const serverTimestampMock = jest.fn(() => SERVER_TIMESTAMP_SENTINEL);

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: timestampNowMock,
      fromMillis: (millis: number) => makeTimestamp(new Date(millis).toISOString()),
    };
    (firestoreMock as any).FieldValue = {
      serverTimestamp: serverTimestampMock,
    };
  });

  it('serializes acceptedAt as ISO strings when listing shares', async () => {
    const harness = buildHarness(
      {
        shares: {
          'caregiver_other': {
            ownerId: 'caregiver',
            caregiverUserId: 'other',
            caregiverEmail: 'other@example.com',
            role: 'viewer',
            status: 'accepted',
            createdAt: makeTimestamp('2026-02-09T08:00:00.000Z'),
            updatedAt: makeTimestamp('2026-02-09T08:30:00.000Z'),
            acceptedAt: makeTimestamp('2026-02-09T08:15:00.000Z'),
          },
          'owner_caregiver': {
            ownerId: 'owner',
            caregiverUserId: 'caregiver',
            caregiverEmail: 'caregiver@example.com',
            role: 'viewer',
            status: 'accepted',
            createdAt: makeTimestamp('2026-02-09T09:00:00.000Z'),
            updatedAt: makeTimestamp('2026-02-09T09:30:00.000Z'),
            acceptedAt: makeTimestamp('2026-02-09T09:15:00.000Z'),
          },
        },
      },
      timestampNowMock,
    );

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/');
    const req = createRequest({
      user: { uid: 'caregiver' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const outgoing = (res.body as Array<RecordMap>).find((item) => item.id === 'caregiver_other');
    const incoming = (res.body as Array<RecordMap>).find((item) => item.id === 'owner_caregiver');

    expect(outgoing).toMatchObject({
      id: 'caregiver_other',
      type: 'outgoing',
      acceptedAt: '2026-02-09T08:15:00.000Z',
    });
    expect(incoming).toMatchObject({
      id: 'owner_caregiver',
      type: 'incoming',
      acceptedAt: '2026-02-09T09:15:00.000Z',
    });
  });

  it('returns pending invites from legacy and caregiver email fields without duplicates', async () => {
    const harness = buildHarness(
      {
        authUsers: {
          caregiver: { uid: 'caregiver', email: 'Caregiver@Example.com' },
        },
        shareInvites: {
          'invite-legacy': {
            ownerId: 'owner-1',
            inviteeEmail: 'caregiver@example.com',
            status: 'pending',
            createdAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-16T10:00:00.000Z'),
          },
          'invite-current': {
            ownerId: 'owner-2',
            caregiverEmail: 'caregiver@example.com',
            status: 'pending',
            createdAt: makeTimestamp('2026-02-09T11:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-16T11:00:00.000Z'),
          },
          'invite-duplicate': {
            ownerId: 'owner-3',
            caregiverEmail: 'caregiver@example.com',
            inviteeEmail: 'caregiver@example.com',
            status: 'pending',
            createdAt: makeTimestamp('2026-02-09T12:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-16T12:00:00.000Z'),
          },
        },
      },
      timestampNowMock,
    );

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/invites');
    const req = createRequest({
      user: { uid: 'caregiver' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const invites = res.body as Array<RecordMap>;
    expect(invites).toHaveLength(3);
    expect(invites.filter((invite) => invite.id === 'invite-duplicate')).toHaveLength(1);

    const legacyInvite = invites.find((invite) => invite.id === 'invite-legacy');
    expect(legacyInvite).toMatchObject({
      caregiverEmail: 'caregiver@example.com',
      inviteeEmail: 'caregiver@example.com',
      status: 'pending',
    });
  });

  it('delegates reserved my-invites slug from /:id route to the next handler', async () => {
    const harness = buildHarness(
      {
        authUsers: {
          owner: { uid: 'owner', email: 'owner@example.com' },
        },
      },
      timestampNowMock,
    );

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/:id');
    const req = createRequest({
      user: { uid: 'owner' },
      params: { id: 'my-invites' },
    });
    const res = createResponse();
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.body).toBeUndefined();
  });

  it('returns invites list for /my-invites sorted by newest first', async () => {
    const harness = buildHarness(
      {
        authUsers: {
          owner: { uid: 'owner', email: 'owner@example.com' },
        },
        shareInvites: {
          'invite-older': {
            ownerId: 'owner',
            caregiverEmail: 'older@example.com',
            status: 'pending',
            createdAt: makeTimestamp('2026-02-09T08:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-16T08:00:00.000Z'),
          },
          'invite-newer': {
            ownerId: 'owner',
            caregiverEmail: 'newer@example.com',
            status: 'pending',
            createdAt: makeTimestamp('2026-02-09T09:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-16T09:00:00.000Z'),
          },
        },
      },
      timestampNowMock,
    );

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/my-invites');
    const req = createRequest({
      user: { uid: 'owner' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('invite-newer');
    expect(res.body[1].id).toBe('invite-older');
  });

  it('accepts legacy inviteeEmail invites and writes canonical share + caregiver role', async () => {
    const harness = buildHarness(
      {
        authUsers: {
          caregiver: { uid: 'caregiver', email: 'Legacy@Example.com' },
        },
        users: {
          caregiver: {
            roles: ['member'],
          },
        },
        shareInvites: {
          'legacy-token': {
            ownerId: 'owner-1',
            ownerName: 'Owner',
            ownerEmail: 'owner@example.com',
            inviteeEmail: 'legacy@example.com',
            status: 'pending',
            role: 'viewer',
            message: 'Please help manage care',
            createdAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          },
        },
      },
      timestampNowMock,
    );

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('post', '/accept/:token');
    const req = createRequest({
      user: { uid: 'caregiver' },
      params: { token: 'legacy-token' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.shareInvites['legacy-token']).toMatchObject({
      status: 'accepted',
      caregiverUserId: 'caregiver',
      caregiverEmail: 'legacy@example.com',
    });
    expect(harness.state.shares['owner-1_caregiver']).toMatchObject({
      ownerId: 'owner-1',
      caregiverUserId: 'caregiver',
      caregiverEmail: 'legacy@example.com',
      status: 'accepted',
    });
    expect(harness.state.users.caregiver.roles).toEqual(expect.arrayContaining(['member', 'caregiver']));
    expect(harness.state.users.caregiver.primaryRole).toBe('caregiver');
  });

  it('revokes canonical share when owner revokes an already-accepted invite', async () => {
    const harness = buildHarness(
      {
        authUsers: {
          owner: { uid: 'owner', email: 'owner@example.com' },
        },
        shareInvites: {
          'accepted-token': {
            ownerId: 'owner',
            caregiverUserId: 'caregiver',
            caregiverEmail: 'caregiver@example.com',
            status: 'accepted',
            createdAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
            expiresAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          },
        },
        shares: {
          owner_caregiver: {
            ownerId: 'owner',
            caregiverUserId: 'caregiver',
            caregiverEmail: 'caregiver@example.com',
            status: 'accepted',
            createdAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
          },
        },
      },
      timestampNowMock,
    );

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('patch', '/revoke/:token');
    const req = createRequest({
      user: { uid: 'owner' },
      params: { token: 'accepted-token' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(harness.state.shareInvites['accepted-token'].status).toBe('revoked');
    expect(harness.state.shares.owner_caregiver.status).toBe('revoked');
    expect(
      typeof (harness.state.shares.owner_caregiver.updatedAt as { toDate?: unknown })?.toDate,
    ).toBe('function');
  });
});
