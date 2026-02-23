import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  userId: string;
  userDoc: RecordMap;
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
    userId: 'user-1',
    userDoc: {
      firstName: 'Existing',
      lastName: 'User',
      dateOfBirth: '1990-01-01',
      allergies: [],
      medicalHistory: [],
      tags: [],
      folders: [],
      createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
      updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
    },
    ...initial,
  };

  const userDocRef = {
    id: state.userId,
    path: `users/${state.userId}`,
    get: jest.fn(async () => ({
      exists: true,
      id: state.userId,
      data: () => state.userDoc,
    })),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      if (options?.merge) {
        state.userDoc = deepMerge(state.userDoc, data);
        return;
      }
      state.userDoc = data;
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'users') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return {
        doc: jest.fn((userId: string) => ({
          ...userDocRef,
          id: userId,
          path: `users/${userId}`,
          get: jest.fn(async () => ({
            exists: true,
            id: userId,
            data: () => (userId === state.userId ? state.userDoc : {}),
          })),
        })),
      };
    }),
    runTransaction: jest.fn(async () => {
      throw new Error('runTransaction should not be called in these tests');
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'user-1' },
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

describe('users profile sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-21T10:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('sanitizes profile text and arrays on patch /me', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/me');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        firstName: ' <script>alert(1)</script> Jane ',
        lastName: ' <b>Doe</b> ',
        dateOfBirth: ' <b>1990-03-01</b> ',
        allergies: [' penicillin ', '<script>x</script>', ' pollen <b>high</b> '],
        medicalHistory: [' asthma ', '<style>body{}</style>', ' diabetes '],
        tags: [' cardio ', ' cardio ', '<script>dup</script>'],
        folders: [' Primary Care ', ' <i>Follow up</i> '],
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1990-03-01',
      allergies: ['penicillin', 'pollen high'],
      medicalHistory: ['asthma', 'diabetes'],
      tags: ['cardio'],
      folders: ['Primary Care', 'Follow up'],
    });
  });

  it('writes empty strings/arrays when sanitized profile inputs become empty', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/me');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        firstName: '<script>alert(1)</script>',
        allergies: ['<script>x</script>'],
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      firstName: '',
      allergies: [],
    });
    expect(harness.state.userDoc.firstName).toBe('');
    expect(harness.state.userDoc.allergies).toEqual([]);
  });
});
