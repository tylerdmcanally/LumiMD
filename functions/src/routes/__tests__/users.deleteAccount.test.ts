import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, unknown>;

function makeQuerySnapshot(docs: Array<{ ref: { path: string } }>) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function buildHarness() {
  const deletedPaths: string[] = [];

  const db = {
    collection: jest.fn((name: string) => ({
      where: jest.fn((_field: string, _operator: string, _value: unknown) => ({
        get: jest.fn(async () => makeQuerySnapshot([])),
      })),
      doc: jest.fn((id: string) => ({
        id,
        path: `${name}/${id}`,
        get: jest.fn(async () => ({
          exists: name === 'users' && id === 'user-1',
          id,
          data: () => ({}),
        })),
        listCollections: jest.fn(async () => []),
      })),
    })),
    batch: jest.fn(() => ({
      delete: jest.fn((docRef: { path: string }) => {
        deletedPaths.push(docRef.path);
      }),
      commit: jest.fn(async () => undefined),
    })),
  };

  return {
    db,
    deletedPaths,
  };
}

function createRequest(overrides?: RecordMap) {
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

describe('users delete account route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes account data and firebase auth user', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);
    const getUser = jest.fn().mockResolvedValue({ email: 'user@example.com' });
    const deleteUser = jest.fn().mockResolvedValue(undefined);
    authMock.mockImplementation(() => ({
      getUser,
      deleteUser,
    }));

    const handler = getRouteHandler('delete', '/me');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      deletedDocuments: 3,
    });
    expect(getUser).toHaveBeenCalledWith('user-1');
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(harness.deletedPaths).toEqual(
      expect.arrayContaining([
        'users/user-1',
        'patientContexts/user-1',
        'patientEvaluations/user-1',
      ]),
    );
  });
});
