import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, unknown>;

type PushTokenEntry = {
  id: string;
  data: RecordMap;
};

type UserState = {
  profile: RecordMap;
  pushTokens: PushTokenEntry[];
};

type HarnessState = {
  users: Record<string, UserState>;
  tokenCounter: number;
};

type HarnessOptions = {
  forceCollectionGroupFailure?: boolean;
};

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

function buildHarness(
  initialUsers?: Record<string, Partial<UserState>>,
  options?: HarnessOptions,
) {
  const state: HarnessState = {
    users: {},
    tokenCounter: 0,
  };

  const ensureUser = (userId: string): UserState => {
    if (!state.users[userId]) {
      state.users[userId] = {
        profile: {},
        pushTokens: [],
      };
    }
    return state.users[userId];
  };

  Object.entries(initialUsers ?? {}).forEach(([userId, userValue]) => {
    const user = ensureUser(userId);
    user.profile = userValue.profile ?? {};
    user.pushTokens = (userValue.pushTokens ?? []).map((entry, index) => ({
      id: entry.id ?? `${userId}-token-${index + 1}`,
      data: { ...(entry.data ?? {}) },
    }));
    state.tokenCounter += user.pushTokens.length;
  });

  const getTokenEntry = (userId: string, tokenId: string): PushTokenEntry => {
    const user = ensureUser(userId);
    const existing = user.pushTokens.find((entry) => entry.id === tokenId);
    if (!existing) {
      throw new Error(`Push token doc not found: users/${userId}/pushTokens/${tokenId}`);
    }
    return existing;
  };

  const deleteTokenEntry = (userId: string, tokenId: string) => {
    const user = ensureUser(userId);
    user.pushTokens = user.pushTokens.filter((entry) => entry.id !== tokenId);
  };

  const makeTokenDocRef = (userId: string, tokenId: string) => ({
    id: tokenId,
    path: `users/${userId}/pushTokens/${tokenId}`,
    update: jest.fn(async (updateData: RecordMap) => {
      const entry = getTokenEntry(userId, tokenId);
      entry.data = {
        ...entry.data,
        ...updateData,
      };
    }),
    delete: jest.fn(async () => {
      deleteTokenEntry(userId, tokenId);
    }),
  });

  const makeTokenDocSnapshot = (userId: string, entry: PushTokenEntry) => ({
    id: entry.id,
    data: () => entry.data,
    ref: makeTokenDocRef(userId, entry.id),
  });

  const makePushTokensCollectionRef = (userId: string) => ({
    where: jest.fn((field: string, _operator: string, value: unknown) => {
      const executeQuery = () => {
        const user = ensureUser(userId);
        return user.pushTokens
          .filter((entry) => entry.data[field] === value)
          .map((entry) => makeTokenDocSnapshot(userId, entry));
      };

      return {
        get: jest.fn(async () => makeQuerySnapshot(executeQuery())),
        limit: jest.fn((limitValue: number) => ({
          get: jest.fn(async () => makeQuerySnapshot(executeQuery().slice(0, limitValue))),
        })),
      };
    }),
    add: jest.fn(async (data: RecordMap) => {
      const user = ensureUser(userId);
      state.tokenCounter += 1;
      const id = `token-${state.tokenCounter}`;
      user.pushTokens.push({
        id,
        data: { ...data },
      });
      return makeTokenDocRef(userId, id);
    }),
    get: jest.fn(async () => {
      const user = ensureUser(userId);
      return makeQuerySnapshot(user.pushTokens.map((entry) => makeTokenDocSnapshot(userId, entry)));
    }),
  });

  const makeUserDocRef = (userId: string) => ({
    __kind: 'userDocRef',
    id: userId,
    path: `users/${userId}`,
    get: jest.fn(async () => {
      const user = ensureUser(userId);
      return {
        exists: true,
        id: userId,
        data: () => user.profile,
      };
    }),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      const user = ensureUser(userId);
      if (options?.merge) {
        user.profile = {
          ...user.profile,
          ...data,
        };
        return;
      }
      user.profile = { ...data };
    }),
    collection: jest.fn((name: string) => {
      if (name === 'pushTokens') {
        return makePushTokensCollectionRef(userId);
      }
      throw new Error(`Unknown user subcollection: ${name}`);
    }),
  });

  const usersCollectionRef = {
    doc: jest.fn((userId: string) => makeUserDocRef(userId)),
    limit: jest.fn((limitValue: number) => ({
      get: jest.fn(async () => {
        const userDocs = Object.keys(state.users)
          .slice(0, limitValue)
          .map((userId) => ({
            id: userId,
            ref: makeUserDocRef(userId),
          }));
        return makeQuerySnapshot(userDocs);
      }),
    })),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') return usersCollectionRef;
      throw new Error(`Unknown collection: ${name}`);
    }),
    collectionGroup: jest.fn((name: string) => {
      if (options?.forceCollectionGroupFailure) {
        throw new Error('collectionGroup unavailable');
      }
      if (name !== 'pushTokens') {
        throw new Error(`Unknown collection group: ${name}`);
      }
      return {
        where: jest.fn((field: string, _operator: string, value: unknown) => ({
          get: jest.fn(async () => {
            const docs: any[] = [];
            Object.entries(state.users).forEach(([ownerId, user]) => {
              user.pushTokens
                .filter((entry) => entry.data[field] === value)
                .forEach((entry) => docs.push(makeTokenDocSnapshot(ownerId, entry)));
            });
            return makeQuerySnapshot(docs);
          }),
        })),
      };
    }),
    batch: jest.fn(() => {
      const refs: Array<{ delete: () => Promise<void> }> = [];
      return {
        delete: jest.fn((ref: { delete: () => Promise<void> }) => {
          refs.push(ref);
        }),
        commit: jest.fn(async () => {
          await Promise.all(refs.map((ref) => ref.delete()));
        }),
      };
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'user-1' },
    body: {},
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

function getRouteHandler(method: 'post' | 'delete', path: string) {
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

describe('users push token routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-02-10T22:00:00.000Z'));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = { now: timestampNowMock };
  });

  it('removes stale token ownership from previous users when registering on a new account', async () => {
    const harness = buildHarness({
      'user-a': {
        pushTokens: [
          {
            id: 'token-a-1',
            data: {
              token: 'ExponentPushToken[same-device-token]',
              platform: 'ios',
              deviceId: 'device-1',
            },
          },
        ],
      },
      'user-b': {
        pushTokens: [],
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/push-tokens');
    const req = createRequest({
      user: { uid: 'user-b' },
      body: {
        token: 'ExponentPushToken[same-device-token]',
        platform: 'ios',
        deviceId: 'device-1',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.state.users['user-a'].pushTokens).toHaveLength(0);
    expect(harness.state.users['user-b'].pushTokens).toHaveLength(1);
    expect(harness.state.users['user-b'].pushTokens[0].data.token).toBe(
      'ExponentPushToken[same-device-token]',
    );
  });

  it('falls back to user-scan cleanup when collection-group lookup fails', async () => {
    const harness = buildHarness(
      {
        'user-a': {
          pushTokens: [
            {
              id: 'token-a-1',
              data: {
                token: 'ExponentPushToken[old-token]',
                platform: 'ios',
                deviceId: 'device-1',
              },
            },
          ],
        },
        'user-b': {
          pushTokens: [],
        },
      },
      { forceCollectionGroupFailure: true },
    );
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/push-tokens');
    const req = createRequest({
      user: { uid: 'user-b' },
      body: {
        token: 'ExponentPushToken[new-token]',
        previousToken: 'ExponentPushToken[old-token]',
        platform: 'ios',
        deviceId: 'device-1',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.state.users['user-a'].pushTokens).toHaveLength(0);
    expect(harness.state.users['user-b'].pushTokens).toHaveLength(1);
    expect(harness.state.users['user-b'].pushTokens[0].data.token).toBe(
      'ExponentPushToken[new-token]',
    );
  });

  it('updates existing device token on rotation and cleans previous token from old owner', async () => {
    const harness = buildHarness({
      'user-a': {
        pushTokens: [
          {
            id: 'token-a-old',
            data: {
              token: 'ExponentPushToken[old-token]',
              platform: 'ios',
              deviceId: 'device-1',
            },
          },
        ],
      },
      'user-b': {
        pushTokens: [
          {
            id: 'token-b-existing',
            data: {
              token: 'ExponentPushToken[very-old-token]',
              platform: 'ios',
              deviceId: 'device-1',
            },
          },
        ],
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/push-tokens');
    const req = createRequest({
      user: { uid: 'user-b' },
      body: {
        token: 'ExponentPushToken[new-token]',
        previousToken: 'ExponentPushToken[old-token]',
        platform: 'ios',
        deviceId: 'device-1',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.state.users['user-a'].pushTokens).toHaveLength(0);
    expect(harness.state.users['user-b'].pushTokens).toHaveLength(1);
    expect(harness.state.users['user-b'].pushTokens[0].id).toBe('token-b-existing');
    expect(harness.state.users['user-b'].pushTokens[0].data.token).toBe(
      'ExponentPushToken[new-token]',
    );
  });

  it('deletes all tokens for the authenticated user on logout cleanup', async () => {
    const harness = buildHarness({
      'user-b': {
        pushTokens: [
          {
            id: 'token-b-1',
            data: {
              token: 'ExponentPushToken[user-b-1]',
              platform: 'ios',
            },
          },
          {
            id: 'token-b-2',
            data: {
              token: 'ExponentPushToken[user-b-2]',
              platform: 'ios',
            },
          },
        ],
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('delete', '/push-tokens/all');
    const req = createRequest({
      user: { uid: 'user-b' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(204);
    expect(harness.state.users['user-b'].pushTokens).toHaveLength(0);
  });
});
