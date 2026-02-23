import * as admin from 'firebase-admin';
import {
  careRouter,
  clearCaregiverShareLookupCacheForTests,
} from '../care';

type RecordMap = Record<string, any>;

type HarnessState = {
  users: Record<string, RecordMap>;
  shares: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  visits: Record<string, RecordMap>;
  actions: Record<string, RecordMap>;
  caregiverNotes: Record<string, RecordMap>;
  careTasks: Record<string, RecordMap>;
  healthLogs: Record<string, RecordMap>;
};

type HarnessMetrics = {
  getsByCollection: Record<string, number>;
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
  const metrics: HarnessMetrics = {
    getsByCollection: {},
  };
  const state: HarnessState = {
    users: { ...(initial?.users ?? {}) },
    shares: { ...(initial?.shares ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    visits: { ...(initial?.visits ?? {}) },
    actions: { ...(initial?.actions ?? {}) },
    caregiverNotes: { ...(initial?.caregiverNotes ?? {}) },
    careTasks: { ...(initial?.careTasks ?? {}) },
    healthLogs: { ...(initial?.healthLogs ?? {}) },
  };

  const buildQuery = (
    collectionName: keyof HarnessState,
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    startAfterId?: string,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery(
        collectionName,
        [...filters, { field, operator, value }],
        orderByField,
        orderDirection,
        startAfterId,
        limitValue,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(
        collectionName,
        filters,
        field,
        direction,
        startAfterId,
        limitValue,
      ),
    ),
    startAfter: jest.fn((cursorDoc: { id: string }) =>
      buildQuery(
        collectionName,
        filters,
        orderByField,
        orderDirection,
        cursorDoc.id,
        limitValue,
      ),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(
        collectionName,
        filters,
        orderByField,
        orderDirection,
        startAfterId,
        nextLimit,
      ),
    ),
    get: jest.fn(async () => {
      metrics.getsByCollection[String(collectionName)] =
        (metrics.getsByCollection[String(collectionName)] ?? 0) + 1;
      let docs = Object.entries(state[collectionName])
        .filter(([, data]) =>
          filters.every((filter) => {
            const fieldValue = data[filter.field];
            if (filter.operator === '==') {
              if (filter.value === null) {
                return fieldValue == null;
              }
              return fieldValue === filter.value;
            }
            if (filter.operator === '>=') {
              return (
                (toComparable(fieldValue) as number) >=
                (toComparable(filter.value) as number)
              );
            }
            if (filter.operator === '<=') {
              return (
                (toComparable(fieldValue) as number) <=
                (toComparable(filter.value) as number)
              );
            }
            if (filter.operator === 'in' && Array.isArray(filter.value)) {
              return filter.value.includes(fieldValue);
            }
            return false;
          }),
        )
        .map(([id, data]) => ({
          id,
          data: () => data,
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
      if (name === 'users') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('users', [{ field, operator, value }]),
          ),
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

      if (name === 'medications') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('medications', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.medications[id],
              id,
              data: () => state.medications[id],
            })),
          })),
        };
      }

      if (name === 'visits') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('visits', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.visits[id],
              id,
              data: () => state.visits[id],
            })),
          })),
        };
      }

      if (name === 'actions') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('actions', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.actions[id],
              id,
              data: () => state.actions[id],
            })),
          })),
        };
      }

      if (name === 'caregiverNotes') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('caregiverNotes', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.caregiverNotes[id],
              id,
              data: () => state.caregiverNotes[id],
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
          })),
        };
      }

      if (name === 'healthLogs') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('healthLogs', [{ field, operator, value }]),
          ),
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.healthLogs[id],
              id,
              data: () => state.healthLogs[id],
            })),
          })),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db, metrics };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'caregiver-1' },
    params: { patientId: 'patient-1' },
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

function getRouteHandler(method: 'get', path: string) {
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

describe('care pagination', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp(new Date())),
      fromDate: (date: Date) => makeTimestamp(date),
    };
    clearCaregiverShareLookupCacheForTests();
  });

  function withAcceptedShare(harness: ReturnType<typeof buildHarness>) {
    harness.state.shares['share-1'] = {
      ownerId: 'patient-1',
      caregiverUserId: 'caregiver-1',
      status: 'accepted',
    };
  }

  it('paginates patient medications and returns cursor headers', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'patient-1',
          name: 'Aspirin',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'med-2': {
          userId: 'patient-1',
          name: 'Lisinopril',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'med-3': {
          userId: 'patient-1',
          name: 'Metformin',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'med-deleted': {
          userId: 'patient-1',
          name: 'Zoloft',
          createdAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/medications');
    const req = createRequest({
      query: { limit: '2' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());
    // eslint-disable-next-line no-console
    console.log('export summary response', res.statusCode, res.body);

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'med-1',
      'med-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('med-2');
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('rejects medication cursor that is missing or mismatched', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'patient-1',
          name: 'Aspirin',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'med-other': {
          userId: 'patient-2',
          name: 'Other',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/medications');
    const req = createRequest({
      query: { cursor: 'med-other' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('rejects medication cursor when cursor document is soft-deleted', async () => {
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'patient-1',
          name: 'Aspirin',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'med-deleted': {
          userId: 'patient-1',
          name: 'Deleted',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/medications');
    const req = createRequest({
      query: { cursor: 'med-deleted' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('paginates patient visits and returns cursor headers', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'visit-2': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'visit-3': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'visit-deleted': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/visits');
    const req = createRequest({
      query: { limit: '2', cursor: 'visit-2' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'visit-3',
    ]);
    expect(res.headers['x-has-more']).toBe('false');
    expect(res.headers['x-next-cursor']).toBe('');
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('rejects visit cursor when cursor document is soft-deleted', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'visit-deleted': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/visits');
    const req = createRequest({
      query: { cursor: 'visit-deleted' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('paginates patient actions and returns cursor headers', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'patient-1',
          description: 'First action',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-2': {
          userId: 'patient-1',
          description: 'Second action',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'action-3': {
          userId: 'patient-1',
          description: 'Third action',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
        'action-deleted': {
          userId: 'patient-1',
          description: 'Deleted action',
          createdAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-17T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/actions');
    const req = createRequest({
      query: { limit: '2' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'action-1',
      'action-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('action-2');
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('rejects action cursor when cursor document is soft-deleted', async () => {
    const harness = buildHarness({
      actions: {
        'action-1': {
          userId: 'patient-1',
          description: 'First action',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'action-deleted': {
          userId: 'patient-1',
          description: 'Deleted action',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/actions');
    const req = createRequest({
      query: { cursor: 'action-deleted' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('paginates caregiver notes and validates cursor ownership', async () => {
    const harness = buildHarness({
      caregiverNotes: {
        'note-1': {
          caregiverId: 'caregiver-1',
          patientId: 'patient-1',
          visitId: 'visit-1',
          note: 'Most recent note',
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-20T09:00:00.000Z'),
        },
        'note-2': {
          caregiverId: 'caregiver-1',
          patientId: 'patient-1',
          visitId: 'visit-2',
          note: 'Older note',
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-19T09:00:00.000Z'),
        },
        'note-other': {
          caregiverId: 'caregiver-1',
          patientId: 'patient-2',
          visitId: 'visit-3',
          note: 'Wrong patient',
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          createdAt: makeTimestamp('2026-02-18T09:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/notes');

    const pagedReq = createRequest({
      query: { limit: '1' },
      params: { patientId: 'patient-1' },
    });
    const pagedRes = createResponse();
    await handler(pagedReq, pagedRes, jest.fn());

    expect(pagedRes.statusCode).toBe(200);
    expect((pagedRes.body as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'note-1',
    ]);
    expect(pagedRes.headers['x-has-more']).toBe('true');
    expect(pagedRes.headers['x-next-cursor']).toBe('note-1');
    expect(pagedRes.headers['cache-control']).toBe('private, max-age=30');

    const invalidCursorReq = createRequest({
      query: { cursor: 'note-other' },
      params: { patientId: 'patient-1' },
    });
    const invalidCursorRes = createResponse();
    await handler(invalidCursorReq, invalidCursorRes, jest.fn());

    expect(invalidCursorRes.statusCode).toBe(400);
    expect(invalidCursorRes.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('paginates care tasks while keeping summary based on the full filtered set', async () => {
    const harness = buildHarness({
      careTasks: {
        'task-1': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          status: 'pending',
          title: 'Task 1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          dueDate: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
        'task-2': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          status: 'in_progress',
          title: 'Task 2',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          dueDate: makeTimestamp('2099-02-22T10:00:00.000Z'),
        },
        'task-3': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          status: 'completed',
          title: 'Task 3',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          dueDate: makeTimestamp('2026-02-18T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/tasks');
    const req = createRequest({
      query: { limit: '2' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body.tasks as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'task-1',
      'task-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('task-2');
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body.summary).toMatchObject({
      pending: 1,
      inProgress: 1,
      completed: 1,
      overdue: 1,
    });
  });

  it('rejects invalid care task cursor values', async () => {
    const harness = buildHarness({
      careTasks: {
        'task-1': {
          patientId: 'patient-1',
          caregiverId: 'caregiver-1',
          status: 'pending',
          title: 'Task 1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'task-other': {
          patientId: 'patient-2',
          caregiverId: 'caregiver-1',
          status: 'pending',
          title: 'Other',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/tasks');
    const req = createRequest({
      query: { cursor: 'task-other' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('paginates patient health logs and returns cursor headers', async () => {
    const nowMs = Date.now();
    const harness = buildHarness({
      healthLogs: {
        'log-1': {
          userId: 'patient-1',
          type: 'bp',
          value: { systolic: 120, diastolic: 80 },
          createdAt: makeTimestamp(new Date(nowMs - 1 * 60 * 60 * 1000)),
        },
        'log-2': {
          userId: 'patient-1',
          type: 'glucose',
          value: { reading: 130 },
          createdAt: makeTimestamp(new Date(nowMs - 2 * 60 * 60 * 1000)),
        },
        'log-3': {
          userId: 'patient-1',
          type: 'weight',
          value: { weight: 180 },
          createdAt: makeTimestamp(new Date(nowMs - 3 * 60 * 60 * 1000)),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/health-logs');
    const req = createRequest({
      query: { limit: '2', days: '30' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body.logs as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'log-1',
      'log-2',
    ]);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('log-2');
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('rejects invalid health-log cursor values', async () => {
    const nowMs = Date.now();
    const harness = buildHarness({
      healthLogs: {
        'log-1': {
          userId: 'patient-1',
          type: 'bp',
          value: { systolic: 120, diastolic: 80 },
          createdAt: makeTimestamp(new Date(nowMs - 1 * 60 * 60 * 1000)),
        },
        'log-other': {
          userId: 'patient-2',
          type: 'bp',
          value: { systolic: 118, diastolic: 79 },
          createdAt: makeTimestamp(new Date(nowMs - 2 * 60 * 60 * 1000)),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/health-logs');
    const req = createRequest({
      query: { cursor: 'log-other', days: '30' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });

  it('exports summary with soft-deleted visits/actions excluded and cache headers', async () => {
    const harness = buildHarness({
      users: {
        'patient-1': {
          preferredName: 'Pat',
        },
      },
      visits: {
        'visit-active': {
          userId: 'patient-1',
          provider: 'Dr. A',
          diagnoses: ['HTN'],
          summary: 'Active visit summary',
          createdAt: makeTimestamp('2026-02-10T10:00:00.000Z'),
        },
        'visit-deleted': {
          userId: 'patient-1',
          provider: 'Dr. B',
          diagnoses: ['DM'],
          summary: 'Deleted visit summary',
          createdAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-10T12:00:00.000Z'),
        },
      },
      medications: {
        'med-active': {
          userId: 'patient-1',
          active: true,
          name: 'Lisinopril',
        },
        'med-inactive': {
          userId: 'patient-1',
          active: false,
          name: 'Metformin',
        },
      },
      actions: {
        'action-active': {
          userId: 'patient-1',
          completed: false,
          description: 'Follow up in two weeks',
          dueAt: '2026-02-20T09:00:00.000Z',
        },
        'action-deleted': {
          userId: 'patient-1',
          completed: false,
          description: 'Deleted pending action',
          dueAt: '2026-02-18T09:00:00.000Z',
          deletedAt: makeTimestamp('2026-02-19T09:00:00.000Z'),
        },
        'action-completed': {
          userId: 'patient-1',
          completed: true,
          description: 'Completed action',
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/export/summary');
    const req = createRequest({
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body).toMatchObject({
      patient: { id: 'patient-1', name: 'Pat' },
      overview: {
        totalVisits: 1,
        activeMedications: 1,
        pendingActions: 1,
      },
    });
    expect((res.body.recentVisits as Array<{ summary: string }>)).toHaveLength(1);
    expect((res.body.pendingActions as Array<{ title: string }>)).toHaveLength(1);
    expect(harness.metrics.getsByCollection.visits).toBe(1);
    expect(harness.metrics.getsByCollection.medications).toBe(1);
    expect(harness.metrics.getsByCollection.actions).toBe(1);
  });

  it('rejects invalid visit limit values', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
      },
    });
    withAcceptedShare(harness);
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/visits');
    const req = createRequest({
      query: { limit: '0' },
      params: { patientId: 'patient-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'limit must be a positive integer',
    });
  });
});
