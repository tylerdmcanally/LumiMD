import * as admin from 'firebase-admin';
import {
  careRouter,
  clearCaregiverShareLookupCacheForTests,
} from '../care';

type RecordMap = Record<string, any>;

type HarnessState = {
  shares: Record<string, RecordMap>;
  careTasks: Record<string, RecordMap>;
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

function toComparable(value: unknown): number | string {
  if (value && typeof value === 'object') {
    const timestampLike = value as { toMillis?: unknown; toDate?: unknown };
    if (typeof timestampLike.toMillis === 'function') {
      return (timestampLike.toMillis as () => number)();
    }
    if (typeof timestampLike.toDate === 'function') {
      return (timestampLike.toDate as () => Date)().getTime();
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return 0;
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    shares: { ...(initial?.shares ?? {}) },
    careTasks: { ...(initial?.careTasks ?? {}) },
  };

  const buildQuery = (
    collection: keyof HarnessState,
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    startAfterId?: string,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery(
        collection,
        [...filters, { field, operator, value }],
        orderByField,
        orderDirection,
        startAfterId,
        limitValue,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(
        collection,
        filters,
        field,
        direction,
        startAfterId,
        limitValue,
      ),
    ),
    startAfter: jest.fn((cursorDoc: { id: string }) =>
      buildQuery(
        collection,
        filters,
        orderByField,
        orderDirection,
        cursorDoc.id,
        limitValue,
      ),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(
        collection,
        filters,
        orderByField,
        orderDirection,
        startAfterId,
        nextLimit,
      ),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state[collection])
        .filter(([, data]) =>
          filters.every((filter) => {
            const fieldValue = data[filter.field];
            if (filter.operator === '==') {
              if (filter.value === null) {
                return fieldValue == null;
              }
              return fieldValue === filter.value;
            }
            return false;
          }),
        )
        .map(([id, data]) => ({
          id,
          data: () => data,
          ref: {
            id,
            update: jest.fn(async (updates: RecordMap) => {
              state[collection][id] = {
                ...state[collection][id],
                ...updates,
              };
            }),
          },
        }));

      if (orderByField) {
        docs = docs.sort((left, right) => {
          const leftValue = toComparable(left.data()[orderByField]);
          const rightValue = toComparable(right.data()[orderByField]);
          if (leftValue === rightValue) return 0;
          const base = leftValue > rightValue ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });
      }

      if (startAfterId) {
        const cursorIndex = docs.findIndex((doc) => doc.id === startAfterId);
        if (cursorIndex >= 0) {
          docs = docs.slice(cursorIndex + 1);
        }
      }

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'shares') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('shares', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.shares[id],
              id,
              data: () => state.shares[id],
            })),
          })),
        };
      }

      if (name === 'careTasks') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('careTasks', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.careTasks[id],
              id,
              data: () => state.careTasks[id],
            })),
            update: jest.fn(async (updates: RecordMap) => {
              if (!state.careTasks[id]) {
                throw new Error(`Task not found: ${id}`);
              }
              state.careTasks[id] = {
                ...state.careTasks[id],
                ...updates,
              };
            }),
          })),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  const auth = {
    getUser: jest.fn(async (uid: string) => ({
      uid,
      email: `${uid}@example.com`,
    })),
  };

  return { state, db, auth };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'caregiver-1' },
    params: { patientId: 'patient-1', taskId: 'task-1' },
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
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
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

function getRouteHandler(
  method: 'get' | 'patch' | 'delete' | 'post',
  path: string,
) {
  const layer = careRouter.stack.find(
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

function withAcceptedShare(harness: ReturnType<typeof buildHarness>) {
  harness.state.shares['patient-1_caregiver-1'] = {
    ownerId: 'patient-1',
    caregiverUserId: 'caregiver-1',
    status: 'accepted',
  };
}

describe('care tasks soft delete', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCaregiverShareLookupCacheForTests();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-24T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
    (firestoreMock as any).FieldValue = {
      serverTimestamp: jest.fn(() => makeTimestamp('2026-02-24T12:00:00.000Z')),
    };
  });

  it('soft deletes a task and excludes it from caregiver task lists', async () => {
    const harness = buildHarness({
      careTasks: {
        'task-1': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          title: 'Check blood pressure trends',
          status: 'pending',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          deletedAt: null,
          deletedBy: null,
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const deleteHandler = getRouteHandler('delete', '/:patientId/tasks/:taskId');
    const deleteReq = createRequest({
      user: { uid: 'caregiver-1' },
      params: { patientId: 'patient-1', taskId: 'task-1' },
    });
    const deleteRes = createResponse();
    await deleteHandler(deleteReq, deleteRes, jest.fn());

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body).toMatchObject({ success: true });
    expect(harness.state.careTasks['task-1']).toBeDefined();
    expect(harness.state.careTasks['task-1'].deletedAt).toBeDefined();
    expect(harness.state.careTasks['task-1'].deletedBy).toBe('caregiver-1');

    const listHandler = getRouteHandler('get', '/:patientId/tasks');
    const listReq = createRequest({
      user: { uid: 'caregiver-1' },
      params: { patientId: 'patient-1' },
      query: {},
    });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toMatchObject({
      tasks: [],
      summary: {
        pending: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
      },
    });
  });

  it('returns not_found when patching a soft-deleted task', async () => {
    const harness = buildHarness({
      careTasks: {
        'task-1': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          title: 'Follow up on medication refill',
          status: 'pending',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-23T10:00:00.000Z'),
          deletedBy: 'caregiver-1',
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const patchHandler = getRouteHandler('patch', '/:patientId/tasks/:taskId');
    const patchReq = createRequest({
      user: { uid: 'caregiver-1' },
      params: { patientId: 'patient-1', taskId: 'task-1' },
      body: { status: 'completed' },
    });
    const patchRes = createResponse();
    await patchHandler(patchReq, patchRes, jest.fn());

    expect(patchRes.statusCode).toBe(404);
    expect(patchRes.body).toMatchObject({
      code: 'not_found',
      message: 'Task not found',
    });
  });

  it('restores a soft-deleted task so it reappears in caregiver task lists', async () => {
    const harness = buildHarness({
      careTasks: {
        'task-1': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          title: 'Follow up on medication refill',
          status: 'pending',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-23T10:00:00.000Z'),
          deletedBy: 'caregiver-1',
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const restoreHandler = getRouteHandler('post', '/:patientId/tasks/:taskId/restore');
    const restoreReq = createRequest({
      user: { uid: 'caregiver-1' },
      params: { patientId: 'patient-1', taskId: 'task-1' },
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body).toMatchObject({
      success: true,
      id: 'task-1',
    });
    expect(harness.state.careTasks['task-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });

    const listHandler = getRouteHandler('get', '/:patientId/tasks');
    const listReq = createRequest({
      user: { uid: 'caregiver-1' },
      params: { patientId: 'patient-1' },
      query: {},
    });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());

    expect(listRes.statusCode).toBe(200);
    expect((listRes.body.tasks as Array<{ id: string }>).map((task) => task.id)).toEqual([
      'task-1',
    ]);
  });
});
