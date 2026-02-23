import * as admin from 'firebase-admin';
import { healthLogsRouter } from '../healthLogs';

jest.mock('../../services/safetyChecker', () => ({
  checkHealthValue: jest.fn(() => ({
    alertLevel: 'normal',
    message: 'ok',
    shouldShowAlert: false,
  })),
  screenForEmergencySymptoms: jest.fn(() => ({
    isEmergency: false,
    matchedSymptoms: [],
    message: '',
  })),
}));

jest.mock('../../services/healthLogDedupService', () => ({
  resolveHealthLogDedupAction: jest.fn(() => 'return_existing'),
}));

jest.mock('../../services/lumibotAnalyzer', () => ({
  completeNudge: jest.fn(async () => undefined),
  createFollowUpNudge: jest.fn(async () => undefined),
  createInsightNudge: jest.fn(async () => undefined),
}));

jest.mock('../../services/trendAnalyzer', () => ({
  getPrimaryInsight: jest.fn(() => null),
}));

jest.mock('../../triggers/personalRNEvaluation', () => ({
  escalatePatientFrequency: jest.fn(async () => undefined),
}));

type RecordMap = Record<string, any>;

type HarnessState = {
  healthLogs: Record<string, RecordMap>;
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
    healthLogs: { ...(initial?.healthLogs ?? {}) },
  };

  let nextLogId = 1;

  const buildQuery = (
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery(
        [...filters, { field, operator, value }],
        orderByField,
        orderDirection,
        limitValue,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(filters, field, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(filters, orderByField, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.healthLogs)
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
            return false;
          }),
        )
        .map(([id, data]) => ({
          id,
          data: () => data,
          ref: {
            id,
            update: jest.fn(async (updates: RecordMap) => {
              state.healthLogs[id] = {
                ...state.healthLogs[id],
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

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'healthLogs') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        add: jest.fn(async (payload: RecordMap) => {
          const id = `health-log-${nextLogId++}`;
          state.healthLogs[id] = payload;
          return { id };
        }),
        where: jest.fn((field: string, operator: string, value: unknown) =>
          buildQuery([{ field, operator, value }]),
        ),
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.healthLogs[id],
            id,
            data: () => state.healthLogs[id],
          })),
          update: jest.fn(async (updates: RecordMap) => {
            if (!state.healthLogs[id]) {
              throw new Error(`Health log not found: ${id}`);
            }
            state.healthLogs[id] = {
              ...state.healthLogs[id],
              ...updates,
            };
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

function getRouteHandler(method: 'post' | 'get' | 'delete', path: string) {
  const layer = healthLogsRouter.stack.find(
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

describe('health logs soft delete', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-23T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('soft deletes a health log and excludes it from list responses', async () => {
    const harness = buildHarness({
      healthLogs: {
        'log-1': {
          userId: 'user-1',
          type: 'bp',
          value: { systolic: 121, diastolic: 80 },
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          deletedAt: null,
          deletedBy: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const deleteHandler = getRouteHandler('delete', '/:id');
    const deleteReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'log-1' },
    });
    const deleteRes = createResponse();
    await deleteHandler(deleteReq, deleteRes, jest.fn());

    expect(deleteRes.statusCode).toBe(204);
    expect(harness.state.healthLogs['log-1']).toBeDefined();
    expect(harness.state.healthLogs['log-1'].deletedBy).toBe('user-1');
    expect(harness.state.healthLogs['log-1'].deletedAt).toBeDefined();

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({ user: { uid: 'user-1' }, query: {} });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toEqual([]);
  });

  it('creates a new log when sourceId only matches soft-deleted entries', async () => {
    const harness = buildHarness({
      healthLogs: {
        'deleted-source-log': {
          userId: 'user-1',
          type: 'symptom_check',
          value: {
            breathingDifficulty: 2,
            swelling: 'none',
            energyLevel: 4,
            cough: false,
          },
          source: 'healthkit',
          sourceId: 'hk-123',
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
          deletedBy: 'user-1',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const createHandler = getRouteHandler('post', '/');
    const createReq = createRequest({
      user: { uid: 'user-1' },
      body: {
        type: 'symptom_check',
        value: {
          breathingDifficulty: 3,
          swelling: 'mild',
          energyLevel: 3,
          cough: true,
        },
        source: 'healthkit',
        sourceId: 'hk-123',
      },
    });
    const createRes = createResponse();
    await createHandler(createReq, createRes, jest.fn());

    expect(createRes.statusCode).toBe(201);
    expect(Object.keys(harness.state.healthLogs)).toHaveLength(2);
    expect(harness.state.healthLogs['health-log-1']).toMatchObject({
      userId: 'user-1',
      sourceId: 'hk-123',
      deletedAt: null,
      deletedBy: null,
    });
  });

  it('restores a soft-deleted health log so it reappears in list responses', async () => {
    const harness = buildHarness({
      healthLogs: {
        'log-1': {
          userId: 'user-1',
          type: 'bp',
          value: { systolic: 121, diastolic: 80 },
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
          deletedBy: 'user-1',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const restoreHandler = getRouteHandler('post', '/:id/restore');
    const restoreReq = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'log-1' },
    });
    const restoreRes = createResponse();
    await restoreHandler(restoreReq, restoreRes, jest.fn());

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body).toMatchObject({
      success: true,
      id: 'log-1',
    });
    expect(harness.state.healthLogs['log-1']).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });

    const listHandler = getRouteHandler('get', '/');
    const listReq = createRequest({ user: { uid: 'user-1' }, query: {} });
    const listRes = createResponse();
    await listHandler(listReq, listRes, jest.fn());
    expect(listRes.statusCode).toBe(200);
    expect((listRes.body as Array<{ id: string }>).map((row) => row.id)).toEqual(['log-1']);
  });
});
