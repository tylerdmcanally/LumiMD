import * as admin from 'firebase-admin';
import {
  careRouter,
  clearCaregiverShareLookupCacheForTests,
} from '../care';

type RecordMap = Record<string, any>;

type HarnessState = {
  shares: Record<string, RecordMap>;
  users: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
  medicationLogs: Record<string, RecordMap>;
  actions: Record<string, RecordMap>;
  healthLogs: Record<string, RecordMap>;
};

type HarnessMetrics = {
  medicationLogsGets: number;
  usersDocGets: number;
  medicationsGets: number;
};

class MockTimestamp {
  private readonly date: Date;

  constructor(date: Date) {
    this.date = date;
  }

  toDate() {
    return this.date;
  }

  toMillis() {
    return this.date.getTime();
  }

  static fromDate(date: Date) {
    return new MockTimestamp(date);
  }
}

function makeTimestamp(iso: string) {
  return new MockTimestamp(new Date(iso));
}

function makeQuerySnapshot(docs: any[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function toComparable(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      const date = (value as { toDate: () => Date }).toDate();
      return date.getTime();
    }
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return value;
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    shares: { ...(initial?.shares ?? {}) },
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    medicationLogs: { ...(initial?.medicationLogs ?? {}) },
    actions: { ...(initial?.actions ?? {}) },
    healthLogs: { ...(initial?.healthLogs ?? {}) },
  };

  const metrics: HarnessMetrics = {
    medicationLogsGets: 0,
    usersDocGets: 0,
    medicationsGets: 0,
  };

  const applyFilters = (
    docsById: Record<string, RecordMap>,
    filters: Array<{ field: string; operator: string; value: unknown }>,
  ) =>
    Object.entries(docsById).filter(([, data]) =>
      filters.every((filter) => {
        const fieldValue = data[filter.field];
        if (filter.operator === '==') {
          return fieldValue === filter.value;
        }
        if (filter.operator === '>=') {
          return (toComparable(fieldValue) as number) >= (toComparable(filter.value) as number);
        }
        if (filter.operator === '<=') {
          return (toComparable(fieldValue) as number) <= (toComparable(filter.value) as number);
        }
        return false;
      }),
    );

  const buildQuery = (
    collectionName: keyof HarnessState,
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery(
        collectionName,
        [...filters, { field, operator, value }],
        orderByField,
        orderDirection,
        limitValue,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(collectionName, filters, field, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(collectionName, filters, orderByField, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      if (collectionName === 'medicationLogs') {
        metrics.medicationLogsGets += 1;
      }
      if (collectionName === 'medications') {
        metrics.medicationsGets += 1;
      }

      let docs = applyFilters(state[collectionName], filters);
      if (orderByField) {
        docs = docs.sort((left, right) => {
          const leftValue = toComparable(left[1][orderByField]) as number | string;
          const rightValue = toComparable(right[1][orderByField]) as number | string;
          if (leftValue === rightValue) return 0;
          const base = leftValue > rightValue ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });
      }
      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return makeQuerySnapshot(
        docs.map(([id, data]) => ({
          id,
          data: () => data,
        })),
      );
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'shares') return buildQuery('shares');
      if (name === 'users') {
        return {
          doc: jest.fn((userId: string) => ({
            id: userId,
            get: jest.fn(async () => {
              metrics.usersDocGets += 1;
              return {
                exists: !!state.users[userId],
                id: userId,
                data: () => state.users[userId],
              };
            }),
            collection: jest.fn((subcollection: string) => {
              if (subcollection !== 'pushTokens') {
                throw new Error(`Unknown users subcollection: ${subcollection}`);
              }
              return {
                orderBy: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    get: jest.fn(async () => makeQuerySnapshot([])),
                  })),
                })),
              };
            }),
          })),
        };
      }
      if (name === 'medications') return buildQuery('medications');
      if (name === 'medicationReminders') return buildQuery('medicationReminders');
      if (name === 'medicationLogs') return buildQuery('medicationLogs');
      if (name === 'actions') return buildQuery('actions');
      if (name === 'healthLogs') return buildQuery('healthLogs');
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, metrics, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'caregiver-1' },
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

describe('care alerts query reuse', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCaregiverShareLookupCacheForTests();
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T14:00:00.000Z'));
    (firestoreMock as any).Timestamp = MockTimestamp;
    (firestoreMock as any).Timestamp.now = () => makeTimestamp('2026-02-10T14:00:00.000Z');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reuses 7-day medication logs snapshot for today missed-dose checks', async () => {
    const harness = buildHarness({
      shares: {
        'patient-1_caregiver-1': {
          ownerId: 'patient-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
      users: {
        'patient-1': { timezone: 'America/New_York' },
      },
      medications: {
        med1: { userId: 'patient-1', active: true, name: 'Med One' },
      },
      medicationReminders: {
        rem1: {
          userId: 'patient-1',
          medicationId: 'med1',
          enabled: true,
          times: ['08:00'],
        },
      },
      medicationLogs: {
        logToday: {
          userId: 'patient-1',
          medicationId: 'med1',
          action: 'taken',
          scheduledTime: '08:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:00:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:00:00.000Z'),
        },
        logRecent: {
          userId: 'patient-1',
          medicationId: 'med1',
          action: 'taken',
          scheduledTime: '08:00',
          scheduledDate: '2026-02-08',
          createdAt: makeTimestamp('2026-02-08T13:00:00.000Z'),
          loggedAt: makeTimestamp('2026-02-08T13:00:00.000Z'),
        },
      },
      actions: {
        action1: {
          userId: 'patient-1',
          completed: false,
          description: 'Call provider',
          dueAt: makeTimestamp('2026-02-09T14:00:00.000Z'),
        },
      },
      healthLogs: {
        hl1: {
          userId: 'patient-1',
          type: 'bp',
          value: { systolic: 170, diastolic: 100 },
          alertLevel: 'warning',
          createdAt: makeTimestamp('2026-02-10T12:00:00.000Z'),
        },
      },
    });

    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/alerts');
    const req = createRequest({ params: { patientId: 'patient-1' }, query: {} });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(harness.metrics.usersDocGets).toBe(1);
    expect(harness.metrics.medicationLogsGets).toBe(1);
    expect(harness.metrics.medicationsGets).toBe(1);
    expect(res.body.summary.total).toBeGreaterThan(0);
  });
});
