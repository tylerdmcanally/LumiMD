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
};

type HarnessMetrics = {
  medicationLogsGets: number;
};

const DOC_ID_FIELD = '__name__';

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
  };

  const metrics: HarnessMetrics = {
    medicationLogsGets: 0,
  };

  const makeShareDocRef = (shareId: string): any => ({
    id: shareId,
    path: `shares/${shareId}`,
    update: jest.fn(async (payload: RecordMap) => {
      if (!state.shares[shareId]) {
        throw new Error(`Share not found: ${shareId}`);
      }
      state.shares[shareId] = {
        ...state.shares[shareId],
        ...payload,
      };
    }),
  });

  const makeUsersDocRef = (userId: string): any => ({
    id: userId,
    path: `users/${userId}`,
    get: jest.fn(async () => ({
      exists: !!state.users[userId],
      id: userId,
      data: () => state.users[userId],
    })),
    collection: jest.fn((name: string) => {
      if (name !== 'pushTokens') {
        throw new Error(`Unknown users subcollection: ${name}`);
      }
      return {
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => makeQuerySnapshot([])),
          })),
        })),
      };
    }),
  });

  const makeDocRef = (collection: string, id: string): any => {
    if (collection === 'shares') return makeShareDocRef(id);
    if (collection === 'users') return makeUsersDocRef(id);
    return {
      id,
      path: `${collection}/${id}`,
      get: jest.fn(async () => ({ exists: false, data: () => null })),
      update: jest.fn(async () => undefined),
    };
  };

  const applyFilters = (
    docsById: Record<string, RecordMap>,
    filters: Array<{ field: string; operator: string; value: unknown }>,
  ) =>
    Object.entries(docsById).filter(([id, data]) =>
      filters.every((filter) => {
        const fieldValue = filter.field === DOC_ID_FIELD ? id : data[filter.field];
        if (filter.operator === '==') {
          return fieldValue === filter.value;
        }
        if (filter.operator === 'in') {
          return Array.isArray(filter.value) && filter.value.includes(fieldValue);
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
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery(collectionName, [...filters, { field, operator, value }]),
    ),
    limit: jest.fn((limitValue: number) => ({
      get: jest.fn(async () => {
        if (collectionName === 'medicationLogs') {
          metrics.medicationLogsGets += 1;
        }
        const docs = applyFilters(state[collectionName], filters)
          .slice(0, limitValue)
          .map(([id, data]) => ({
            id,
            data: () => data,
            ref: makeDocRef(collectionName, id),
          }));
        return makeQuerySnapshot(docs);
      }),
    })),
    get: jest.fn(async () => {
      if (collectionName === 'medicationLogs') {
        metrics.medicationLogsGets += 1;
      }
      const docs = applyFilters(state[collectionName], filters).map(([id, data]) => ({
        id,
        data: () => data,
        ref: makeDocRef(collectionName, id),
      }));
      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'shares') return buildQuery('shares');
      if (name === 'users') {
        return {
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('users', [{ field, operator, value }]),
          ),
          doc: jest.fn((userId: string) => makeUsersDocRef(userId)),
        };
      }
      if (name === 'medications') return buildQuery('medications');
      if (name === 'medicationReminders') return buildQuery('medicationReminders');
      if (name === 'medicationLogs') return buildQuery('medicationLogs');
      if (name === 'actions') return buildQuery('actions');
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  const auth = {
    getUser: jest.fn(async () => ({
      uid: 'caregiver-1',
      email: 'caregiver@example.com',
    })),
  };

  return { state, metrics, db, auth };
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

describe('care overview batching', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCaregiverShareLookupCacheForTests();
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T14:00:00.000Z'));
    (firestoreMock as any).FieldPath = {
      documentId: () => DOC_ID_FIELD,
    };
    (firestoreMock as any).Timestamp = MockTimestamp;
    (firestoreMock as any).Timestamp.now = () => makeTimestamp('2026-02-10T14:00:00.000Z');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds overview with batched medication log query for multiple patients', async () => {
    const harness = buildHarness({
      shares: {
        'patient-1_caregiver-1': {
          ownerId: 'patient-1',
          ownerName: 'Patient One',
          ownerEmail: 'patient1@example.com',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
        },
        'patient-2_caregiver-1': {
          ownerId: 'patient-2',
          ownerName: 'Patient Two',
          ownerEmail: 'patient2@example.com',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
        },
      },
      users: {
        'patient-1': {
          preferredName: 'Alice',
          timezone: 'America/New_York',
          lastActive: makeTimestamp('2026-02-10T13:30:00.000Z'),
        },
        'patient-2': {
          firstName: 'Bob',
          timezone: 'America/Los_Angeles',
          lastActive: makeTimestamp('2026-02-10T12:30:00.000Z'),
        },
      },
      medications: {
        med1: { userId: 'patient-1', active: true },
        med2: { userId: 'patient-2', active: true },
      },
      medicationReminders: {
        rem1: { userId: 'patient-1', medicationId: 'med1', enabled: true, times: ['08:00'] },
        rem2: { userId: 'patient-2', medicationId: 'med2', enabled: true, times: ['08:00'] },
      },
      medicationLogs: {
        log1: {
          userId: 'patient-1',
          medicationId: 'med1',
          action: 'taken',
          scheduledTime: '08:00',
          scheduledDate: '2026-02-10',
          loggedAt: makeTimestamp('2026-02-10T13:10:00.000Z'),
        },
      },
      actions: {
        action1: {
          userId: 'patient-1',
          completed: false,
          description: 'Schedule follow-up',
          dueAt: makeTimestamp('2026-02-09T14:00:00.000Z'),
        },
        action2: {
          userId: 'patient-2',
          completed: false,
          description: 'Pick up medication',
          dueAt: makeTimestamp('2026-02-12T14:00:00.000Z'),
        },
      },
    });

    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => harness.auth);

    const handler = getRouteHandler('get', '/overview');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('patients');
    expect(res.body.patients).toHaveLength(2);

    const byId = new Map(
      (res.body.patients as Array<RecordMap>).map((patient) => [patient.userId, patient]),
    );

    expect(byId.get('patient-1')).toMatchObject({
      userId: 'patient-1',
      name: 'Alice',
      email: 'patient1@example.com',
      pendingActions: 1,
      medicationsToday: { total: 1, taken: 1, skipped: 0, pending: 0, missed: 0 },
    });
    expect(byId.get('patient-2')).toMatchObject({
      userId: 'patient-2',
      name: 'Bob',
      email: 'patient2@example.com',
      pendingActions: 1,
      medicationsToday: { total: 1, taken: 0, skipped: 0, pending: 1, missed: 0 },
    });

    const patient1Alerts = byId.get('patient-1')?.alerts as Array<RecordMap>;
    expect(patient1Alerts.some((alert) => alert.type === 'overdue_action')).toBe(true);

    expect(harness.metrics.medicationLogsGets).toBe(1);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
  });
});
