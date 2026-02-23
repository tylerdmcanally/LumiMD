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
  healthLogs: Record<string, RecordMap>;
  actions: Record<string, RecordMap>;
  visits: Record<string, RecordMap>;
};

type HarnessMetrics = {
  medicationLogsGets: number;
  usersDocGets: number;
  getsByCollection: Record<keyof HarnessState, number>;
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
    healthLogs: { ...(initial?.healthLogs ?? {}) },
    actions: { ...(initial?.actions ?? {}) },
    visits: { ...(initial?.visits ?? {}) },
  };

  const metrics: HarnessMetrics = {
    medicationLogsGets: 0,
    usersDocGets: 0,
    getsByCollection: {
      shares: 0,
      users: 0,
      medications: 0,
      medicationReminders: 0,
      medicationLogs: 0,
      healthLogs: 0,
      actions: 0,
      visits: 0,
    },
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
      metrics.getsByCollection[collectionName] += 1;
      if (collectionName === 'medicationLogs') {
        metrics.medicationLogsGets += 1;
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
              metrics.getsByCollection.users += 1;
              return {
                exists: !!state.users[userId],
                id: userId,
                data: () => state.users[userId],
              };
            }),
          })),
        };
      }
      if (name === 'medications') return buildQuery('medications');
      if (name === 'medicationReminders') return buildQuery('medicationReminders');
      if (name === 'medicationLogs') return buildQuery('medicationLogs');
      if (name === 'healthLogs') return buildQuery('healthLogs');
      if (name === 'actions') return buildQuery('actions');
      if (name === 'visits') return buildQuery('visits');
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

describe('care quick-overview medication log query optimization', () => {
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

  it('uses only today medication log query when enough activity exists', async () => {
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
        med1: {
          userId: 'patient-1',
          active: true,
          name: 'Med One',
          startedAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
        },
        medDeleted: {
          userId: 'patient-1',
          active: false,
          name: 'Deleted Med',
          startedAt: makeTimestamp('2026-02-09T11:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-10T00:00:00.000Z'),
        },
      },
      medicationReminders: {
        rem1: {
          userId: 'patient-1',
          medicationId: 'med1',
          enabled: true,
          times: ['08:00', '09:00', '10:00', '11:00', '12:00'],
        },
      },
      medicationLogs: {
        log1: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Med One',
          action: 'taken',
          scheduledTime: '08:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:00:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:00:00.000Z'),
        },
        log2: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Med One',
          action: 'taken',
          scheduledTime: '09:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:10:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:10:00.000Z'),
        },
        log3: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Med One',
          action: 'taken',
          scheduledTime: '10:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:20:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:20:00.000Z'),
        },
        log4: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Med One',
          action: 'taken',
          scheduledTime: '11:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:30:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:30:00.000Z'),
        },
        log5: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Med One',
          action: 'taken',
          scheduledTime: '12:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:40:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:40:00.000Z'),
        },
      },
      healthLogs: {},
      actions: {
        activeAction: {
          userId: 'patient-1',
          completed: false,
          description: 'Call provider',
          dueAt: makeTimestamp('2026-02-09T14:00:00.000Z'),
        },
        deletedAction: {
          userId: 'patient-1',
          completed: false,
          description: 'Deleted task',
          dueAt: makeTimestamp('2026-02-08T14:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-09T00:00:00.000Z'),
        },
      },
      visits: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/quick-overview');
    const req = createRequest({ params: { patientId: 'patient-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.metrics.usersDocGets).toBe(1);
    expect(harness.metrics.medicationLogsGets).toBe(1);
    expect(harness.metrics.getsByCollection.shares).toBe(1);
    expect(harness.metrics.getsByCollection.users).toBe(1);
    expect(harness.metrics.getsByCollection.medications).toBe(1);
    expect(harness.metrics.getsByCollection.medicationReminders).toBe(1);
    expect(harness.metrics.getsByCollection.medicationLogs).toBe(1);
    expect(harness.metrics.getsByCollection.healthLogs).toBe(1);
    expect(harness.metrics.getsByCollection.actions).toBe(1);
    expect(harness.metrics.getsByCollection.visits).toBe(1);
    expect(res.body).toMatchObject({
      date: '2026-02-10',
      todaysMeds: { total: 5, taken: 5, skipped: 0, pending: 0, missed: 0 },
    });
    expect(res.body.upcomingActions.actions).toHaveLength(1);
    expect(res.body.upcomingActions.summary.overdue).toBe(1);
    const medChangeNames = (res.body.recentMedicationChanges.changes as Array<RecordMap>).map(
      (item) => item.name,
    );
    expect(medChangeNames).toContain('Med One');
    expect(medChangeNames).not.toContain('Deleted Med');
  });

  it('falls back to week logs when today activity has fewer than five items', async () => {
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
          medicationName: 'Med One',
          action: 'taken',
          scheduledTime: '08:00',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T13:00:00.000Z'),
          loggedAt: makeTimestamp('2026-02-10T13:00:00.000Z'),
        },
        logOlder: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Med One',
          action: 'skipped',
          scheduledTime: '08:00',
          scheduledDate: '2026-02-08',
          createdAt: makeTimestamp('2026-02-08T13:00:00.000Z'),
          loggedAt: makeTimestamp('2026-02-08T13:00:00.000Z'),
        },
      },
      healthLogs: {},
      actions: {},
      visits: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/quick-overview');
    const req = createRequest({ params: { patientId: 'patient-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.metrics.medicationLogsGets).toBe(2);
    expect(harness.metrics.getsByCollection.shares).toBe(1);
    expect(harness.metrics.getsByCollection.users).toBe(1);
    expect(harness.metrics.getsByCollection.medications).toBe(1);
    expect(harness.metrics.getsByCollection.medicationReminders).toBe(1);
    expect(harness.metrics.getsByCollection.medicationLogs).toBe(2);
    expect(harness.metrics.getsByCollection.healthLogs).toBe(1);
    expect(harness.metrics.getsByCollection.actions).toBe(1);
    expect(harness.metrics.getsByCollection.visits).toBe(1);
    const medActivity = (res.body.recentActivity as Array<RecordMap>).filter(
      (item) => item.type === 'med_taken' || item.type === 'med_skipped',
    );
    expect(medActivity.length).toBeGreaterThanOrEqual(2);
  });
});
