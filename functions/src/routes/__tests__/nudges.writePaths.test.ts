import * as admin from 'firebase-admin';
import { nudgesRouter } from '../nudges';
import { getLumiBotAIService } from '../../services/lumibotAI';

jest.mock('../../services/lumibotAnalyzer', () => ({
  getActiveNudgesForUser: jest.fn(async () => []),
  completeNudge: jest.fn(async () => undefined),
  snoozeNudge: jest.fn(async () => undefined),
  dismissNudge: jest.fn(async () => undefined),
}));

jest.mock('../../services/lumibotAI', () => ({
  getLumiBotAIService: jest.fn(),
}));

jest.mock('../../services/patientContextAggregator', () => ({
  getPatientContext: jest.fn(async () => null),
}));

jest.mock('../../services/nudgeNotificationService', () => ({
  processAndNotifyDueNudges: jest.fn(async () => ({
    processed: 0,
    notified: 0,
    failed: 0,
  })),
}));

type RecordMap = Record<string, unknown>;

type HarnessState = {
  nudges: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
};

type QueryFilter = {
  field: string;
  operator: string;
  value: unknown;
};

type OrderBy = {
  field: string;
  direction: 'asc' | 'desc';
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function toComparable(value: unknown): number | string {
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  return 0;
}

function makeDocSnapshot(
  collectionName: keyof HarnessState,
  id: string,
  state: HarnessState,
  data: RecordMap,
) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      id,
      path: `${collectionName}/${id}`,
      update: jest.fn(async (updates: RecordMap) => {
        state[collectionName][id] = {
          ...(state[collectionName][id] || {}),
          ...updates,
        };
      }),
    },
  };
}

function makeQuerySnapshot(docs: Array<ReturnType<typeof makeDocSnapshot>>) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
  };
}

function applyFilters(items: Array<[string, RecordMap]>, filters: QueryFilter[]) {
  return items.filter(([, data]) =>
    filters.every((filter) => {
      if (filter.operator === '==') {
        return data[filter.field] === filter.value;
      }

      if (filter.operator === 'in' && Array.isArray(filter.value)) {
        return filter.value.includes(data[filter.field]);
      }

      return true;
    }),
  );
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    nudges: { ...(initial?.nudges ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
  };

  let nudgeSequence = 0;

  const makeDocRef = (collectionName: keyof HarnessState, id: string): any => ({
    id,
    path: `${collectionName}/${id}`,
    get: jest.fn(async () => ({
      exists: !!state[collectionName][id],
      id,
      data: () => state[collectionName][id],
    })),
    update: jest.fn(async (updates: RecordMap) => {
      if (!state[collectionName][id]) {
        return;
      }

      state[collectionName][id] = {
        ...state[collectionName][id],
        ...updates,
      };
    }),
  });

  const buildQuery = (
    collectionName: keyof HarnessState,
    filters: QueryFilter[] = [],
    orderByValue: OrderBy | null = null,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery(collectionName, [...filters, { field, operator, value }], orderByValue, limitValue),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(collectionName, filters, { field, direction }, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(collectionName, filters, orderByValue, nextLimit),
    ),
    get: jest.fn(async () => {
      let entries = applyFilters(Object.entries(state[collectionName]), filters);

      if (orderByValue) {
        entries = entries.sort((left, right) => {
          const leftComparable = toComparable(left[1][orderByValue.field]);
          const rightComparable = toComparable(right[1][orderByValue.field]);

          if (typeof leftComparable === 'string' && typeof rightComparable === 'string') {
            const result = leftComparable.localeCompare(rightComparable);
            return orderByValue.direction === 'asc' ? result : -result;
          }

          const result = Number(leftComparable) - Number(rightComparable);
          return orderByValue.direction === 'asc' ? result : -result;
        });
      }

      if (typeof limitValue === 'number') {
        entries = entries.slice(0, limitValue);
      }

      const docs = entries.map(([id, data]) => makeDocSnapshot(collectionName, id, state, data));
      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'nudges') {
        return {
          doc: jest.fn((id: string) => makeDocRef('nudges', id)),
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('nudges', [{ field, operator, value }]),
          ),
          add: jest.fn(async (payload: RecordMap) => {
            nudgeSequence += 1;
            const id = `nudge-created-${nudgeSequence}`;
            state.nudges[id] = payload;
            return { id };
          }),
        };
      }

      if (name === 'medications') {
        return {
          doc: jest.fn((id: string) => makeDocRef('medications', id)),
          where: jest.fn((field: string, operator: string, value: unknown) =>
            buildQuery('medications', [{ field, operator, value }]),
          ),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => {
      const updates: Array<{ ref: { path: string }; payload: RecordMap }> = [];
      return {
        update: jest.fn((ref: { path: string }, payload: RecordMap) => {
          updates.push({ ref, payload });
        }),
        commit: jest.fn(async () => {
          updates.forEach(({ ref, payload }) => {
            const [collectionName, id] = ref.path.split('/');
            if (
              (collectionName === 'nudges' || collectionName === 'medications') &&
              state[collectionName as keyof HarnessState][id]
            ) {
              state[collectionName as keyof HarnessState][id] = {
                ...(state[collectionName as keyof HarnessState][id] || {}),
                ...payload,
              };
            }
          });
        }),
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

function getRouteHandler(method: 'post', path: string) {
  const layer = nudgesRouter.stack.find(
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

describe('nudges write paths', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetLumiBotAIService = getLumiBotAIService as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp('2026-02-22T12:00:00.000Z'),
      fromDate: (value: Date) => makeTimestamp(value),
    };
    (firestoreMock as any).FieldValue = {
      delete: () => '__DELETE__',
    };
    mockedGetLumiBotAIService.mockReturnValue({
      interpretUserResponse: jest.fn(async () => ({
        sentiment: 'neutral',
        summary: 'neutral',
        followUpNeeded: false,
      })),
    });
  });

  it('dismisses remaining sequence nudges after a positive response', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          status: 'pending',
          sequenceId: 'seq-1',
          medicationName: 'Metformin',
        },
        'nudge-2': {
          userId: 'user-1',
          status: 'pending',
          sequenceId: 'seq-1',
          medicationName: 'Metformin',
        },
        'nudge-3': {
          userId: 'user-1',
          status: 'snoozed',
          sequenceId: 'seq-1',
          medicationName: 'Metformin',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/respond');
    const req = createRequest({
      params: { id: 'nudge-1' },
      body: {
        response: 'taking_it',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-1']).toMatchObject({
      status: 'completed',
      responseValue: {
        response: 'taking_it',
      },
    });
    expect(harness.state.nudges['nudge-2']).toMatchObject({
      status: 'dismissed',
    });
    expect(harness.state.nudges['nudge-3']).toMatchObject({
      status: 'dismissed',
    });
  });

  it('creates a follow-up nudge after a concerning response', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-4': {
          userId: 'user-1',
          status: 'pending',
          type: 'feeling_check',
          medicationName: 'Lisinopril',
          medicationId: 'med-1',
          visitId: 'visit-1',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/respond');
    const req = createRequest({
      params: { id: 'nudge-4' },
      body: {
        response: 'issues',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-4']).toMatchObject({
      status: 'completed',
      responseValue: {
        response: 'issues',
      },
    });

    const followUps = Object.entries(harness.state.nudges)
      .filter(([id, nudge]) => id !== 'nudge-4' && nudge.type === 'followup')
      .map(([, nudge]) => nudge);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      userId: 'user-1',
      type: 'followup',
      medicationName: 'Lisinopril',
      status: 'pending',
      sequenceId: 'followup_nudge-4',
    });
  });

  it('dismisses orphaned medication nudges via domain/repository cleanup', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-10': {
          userId: 'user-1',
          status: 'pending',
          medicationName: 'Metformin',
        },
        'nudge-11': {
          userId: 'user-1',
          status: 'active',
          medicationName: 'Old Drug',
        },
        'nudge-12': {
          userId: 'user-1',
          status: 'snoozed',
        },
      },
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Metformin',
          active: true,
          deletedAt: null,
        },
        'med-2': {
          userId: 'user-1',
          name: 'Old Drug',
          active: false,
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/cleanup-orphans');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      deleted: 1,
    });
    expect(harness.state.nudges['nudge-10']).toMatchObject({
      status: 'pending',
    });
    expect(harness.state.nudges['nudge-11']).toMatchObject({
      status: 'dismissed',
      dismissalReason: 'medication_discontinued',
    });
  });
});
