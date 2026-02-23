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
  visits: Record<string, RecordMap>;
};

type HarnessMetrics = {
  getsByCollection: Record<keyof HarnessState, number>;
};

type HarnessOptions = {
  failCreatedAtMedicationLogQuery?: boolean;
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

function buildHarness(initial?: Partial<HarnessState>, options: HarnessOptions = {}) {
  const state: HarnessState = {
    shares: { ...(initial?.shares ?? {}) },
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    medicationLogs: { ...(initial?.medicationLogs ?? {}) },
    actions: { ...(initial?.actions ?? {}) },
    healthLogs: { ...(initial?.healthLogs ?? {}) },
    visits: { ...(initial?.visits ?? {}) },
  };

  const metrics: HarnessMetrics = {
    getsByCollection: {
      shares: 0,
      users: 0,
      medications: 0,
      medicationReminders: 0,
      medicationLogs: 0,
      actions: 0,
      healthLogs: 0,
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

      if (
        collectionName === 'medicationLogs' &&
        options.failCreatedAtMedicationLogQuery &&
        filters.some((filter) => filter.field === 'createdAt')
      ) {
        throw new Error('Missing index for createdAt medicationLogs query');
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
            get: jest.fn(async () => ({
              exists: !!state.users[userId],
              id: userId,
              data: () => state.users[userId],
            })),
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
      if (name === 'visits') return buildQuery('visits');
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db, metrics };
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

describe('care aggregate endpoints soft-delete filters', () => {
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

  it('excludes deleted medications from med-changes results', async () => {
    const harness = buildHarness({
      shares: {
        'patient-1_caregiver-1': {
          ownerId: 'patient-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
      medications: {
        medActive: {
          userId: 'patient-1',
          name: 'Active Med',
          startedAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
        },
        medDeleted: {
          userId: 'patient-1',
          name: 'Deleted Med',
          startedAt: makeTimestamp('2026-02-09T11:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-10T00:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/med-changes');
    const req = createRequest({ params: { patientId: 'patient-1' }, query: { days: '30' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    expect(res.body.changes).toHaveLength(1);
    expect(res.body.changes[0].name).toBe('Active Med');
    expect(harness.metrics.getsByCollection.shares).toBe(1);
    expect(harness.metrics.getsByCollection.medications).toBe(1);
  });

  it('excludes deleted actions from upcoming-actions results and summary', async () => {
    const harness = buildHarness({
      shares: {
        'patient-1_caregiver-1': {
          ownerId: 'patient-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
      actions: {
        activeAction: {
          userId: 'patient-1',
          completed: false,
          description: 'Call provider',
          dueAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
        },
        deletedAction: {
          userId: 'patient-1',
          completed: false,
          description: 'Deleted task',
          dueAt: makeTimestamp('2026-02-08T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-09T00:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/upcoming-actions');
    const req = createRequest({ params: { patientId: 'patient-1' }, query: { limit: '10' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0].description).toBe('Call provider');
    expect(res.body.summary.overdue).toBe(1);
    expect(harness.metrics.getsByCollection.shares).toBe(1);
    expect(harness.metrics.getsByCollection.actions).toBe(1);
  });

  it('excludes deleted actions/visits from trends aggregate metrics', async () => {
    const harness = buildHarness({
      shares: {
        'patient-1_caregiver-1': {
          ownerId: 'patient-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
      healthLogs: {
        hl1: {
          userId: 'patient-1',
          type: 'bp',
          value: { systolic: 130, diastolic: 82 },
          createdAt: makeTimestamp('2026-02-10T12:00:00.000Z'),
        },
      },
      medicationLogs: {
        ml1: {
          userId: 'patient-1',
          action: 'taken',
          createdAt: makeTimestamp('2026-02-10T11:00:00.000Z'),
        },
      },
      actions: {
        pendingActive: {
          userId: 'patient-1',
          completed: false,
          dueAt: makeTimestamp('2026-02-11T10:00:00.000Z'),
        },
        pendingDeleted: {
          userId: 'patient-1',
          completed: false,
          dueAt: makeTimestamp('2026-02-09T10:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-09T12:00:00.000Z'),
        },
      },
      visits: {
        latestDeleted: {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-10T09:00:00.000Z'),
          deletedAt: makeTimestamp('2026-02-10T10:00:00.000Z'),
        },
        olderActive: {
          userId: 'patient-1',
          createdAt: makeTimestamp('2026-02-08T09:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/trends');
    const req = createRequest({ params: { patientId: 'patient-1' }, query: { days: '30' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    expect(res.body.actions.pending).toBe(1);
    expect(res.body.coverage.lastVisitDate).toBe('2026-02-08T09:00:00.000Z');
    expect(harness.metrics.getsByCollection.healthLogs).toBe(1);
    expect(harness.metrics.getsByCollection.actions).toBe(1);
    expect(harness.metrics.getsByCollection.visits).toBe(1);
    expect(harness.metrics.getsByCollection.medicationLogs).toBe(1);
  });

  it('uses bounded reads for medication-adherence primary query path', async () => {
    const harness = buildHarness({
      shares: {
        'patient-1_caregiver-1': {
          ownerId: 'patient-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      },
      medications: {
        med1: {
          userId: 'patient-1',
          active: true,
          name: 'Metformin',
        },
      },
      medicationReminders: {
        reminder1: {
          userId: 'patient-1',
          enabled: true,
          medicationId: 'med1',
          times: ['09:00'],
        },
      },
      medicationLogs: {
        log1: {
          userId: 'patient-1',
          medicationId: 'med1',
          medicationName: 'Metformin',
          action: 'taken',
          scheduledDate: '2026-02-10',
          createdAt: makeTimestamp('2026-02-10T08:30:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/medication-adherence');
    const req = createRequest({ params: { patientId: 'patient-1' }, query: { days: '30' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body.overall.takenDoses).toBe(1);
    expect(harness.metrics.getsByCollection.shares).toBe(1);
    expect(harness.metrics.getsByCollection.medicationLogs).toBe(1);
    expect(harness.metrics.getsByCollection.medications).toBe(1);
    expect(harness.metrics.getsByCollection.medicationReminders).toBe(1);
  });

  it('falls back to loggedAt medication logs query when createdAt query fails', async () => {
    const harness = buildHarness(
      {
        shares: {
          'patient-1_caregiver-1': {
            ownerId: 'patient-1',
            caregiverUserId: 'caregiver-1',
            status: 'accepted',
          },
        },
        medications: {
          med1: {
            userId: 'patient-1',
            active: true,
            name: 'Metformin',
          },
        },
        medicationReminders: {
          reminder1: {
            userId: 'patient-1',
            enabled: true,
            medicationId: 'med1',
            times: ['09:00'],
          },
        },
        medicationLogs: {
          log1: {
            userId: 'patient-1',
            medicationId: 'med1',
            medicationName: 'Metformin',
            action: 'taken',
            scheduledDate: '2026-02-10',
            loggedAt: makeTimestamp('2026-02-10T08:30:00.000Z'),
          },
        },
      },
      { failCreatedAtMedicationLogQuery: true },
    );
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/:patientId/medication-adherence');
    const req = createRequest({ params: { patientId: 'patient-1' }, query: { days: '30' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    expect(res.body.overall.takenDoses).toBe(1);
    expect(harness.metrics.getsByCollection.shares).toBe(1);
    expect(harness.metrics.getsByCollection.medicationLogs).toBe(2);
    expect(harness.metrics.getsByCollection.medications).toBe(1);
    expect(harness.metrics.getsByCollection.medicationReminders).toBe(1);
  });
});
