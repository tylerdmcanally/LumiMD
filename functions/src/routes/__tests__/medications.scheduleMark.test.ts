import * as admin from 'firebase-admin';
import { medicationsRouter } from '../medications';

type RecordMap = Record<string, any>;

type HarnessState = {
  users: Record<string, { timezone?: string }>;
  medications: Record<string, { userId: string; name: string }>;
  medicationLogs: Record<string, RecordMap>;
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

function toComparable(value: unknown): unknown {
  if (value && typeof (value as any).toMillis === 'function') {
    return (value as any).toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return value;
}

function matchesWhere(fieldValue: unknown, operator: string, targetValue: unknown): boolean {
  const left = toComparable(fieldValue);
  const right = toComparable(targetValue);

  if (operator === '==') return left === right;
  if (operator === '>=') return typeof left === 'number' && typeof right === 'number' && left >= right;
  if (operator === '<=') return typeof left === 'number' && typeof right === 'number' && left <= right;
  throw new Error(`Unsupported operator in test harness: ${operator}`);
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    medicationLogs: { ...(initial?.medicationLogs ?? {}) },
  };

  const makeMedicationLogDocRef = (logId: string) => ({
    id: logId,
    path: `medicationLogs/${logId}`,
    get: jest.fn(async () => ({
      exists: Boolean(state.medicationLogs[logId]),
      id: logId,
      data: () => state.medicationLogs[logId],
    })),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      if (options?.merge && state.medicationLogs[logId]) {
        state.medicationLogs[logId] = {
          ...state.medicationLogs[logId],
          ...data,
        };
        return;
      }
      state.medicationLogs[logId] = { ...data };
    }),
  });

  const buildMedicationLogsQuery = (
    wheres: Array<{ field: string; operator: string; value: unknown }>,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildMedicationLogsQuery([...wheres, { field, operator, value }]),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state.medicationLogs)
        .filter(([, log]) =>
          wheres.every((clause) =>
            matchesWhere(log[clause.field], clause.operator, clause.value),
          ),
        )
        .map(([id, log]) => ({
          id,
          data: () => log,
          ref: makeMedicationLogDocRef(id),
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const medicationLogsCollectionRef = {
    doc: jest.fn((logId: string) => makeMedicationLogDocRef(logId)),
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildMedicationLogsQuery([{ field, operator, value }]),
    ),
  };

  const medicationsCollectionRef = {
    doc: jest.fn((medicationId: string) => ({
      id: medicationId,
      path: `medications/${medicationId}`,
      get: jest.fn(async () => ({
        exists: Boolean(state.medications[medicationId]),
        id: medicationId,
        data: () => state.medications[medicationId],
      })),
    })),
  };

  const usersCollectionRef = {
    doc: jest.fn((userId: string) => ({
      id: userId,
      path: `users/${userId}`,
      get: jest.fn(async () => ({
        exists: Boolean(state.users[userId]),
        id: userId,
        data: () => state.users[userId],
      })),
    })),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'medicationLogs') return medicationLogsCollectionRef;
      if (name === 'medications') return medicationsCollectionRef;
      if (name === 'users') return usersCollectionRef;
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'user-1' },
    body: {},
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
  const layer = medicationsRouter.stack.find(
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

describe('medications schedule mark idempotency routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-02-11T16:45:00.000Z'));
  const timestampFromDateMock = jest.fn((date: Date) => makeTimestamp(date));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: timestampNowMock,
      fromDate: timestampFromDateMock,
    };
  });

  it('treats repeated mark calls for the same dose/action as idempotent', async () => {
    const harness = buildHarness({
      users: {
        'user-1': { timezone: 'America/Chicago' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Metformin' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/schedule/mark');

    const firstReq = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationId: 'med-1',
        scheduledTime: '08:00',
        action: 'taken',
      },
    });
    const firstRes = createResponse();
    await handler(firstReq, firstRes, jest.fn());

    expect(firstRes.statusCode).toBe(201);
    expect(firstRes.body.status).toBe('created');
    expect(firstRes.body.idempotent).toBe(false);
    expect(Object.keys(harness.state.medicationLogs)).toHaveLength(1);

    const secondReq = createRequest({
      user: { uid: 'user-1' },
      body: {
        medicationId: 'med-1',
        scheduledTime: '08:00',
        action: 'taken',
      },
    });
    const secondRes = createResponse();
    await handler(secondReq, secondRes, jest.fn());

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.body.status).toBe('unchanged');
    expect(secondRes.body.idempotent).toBe(true);
    expect(secondRes.body.id).toBe(firstRes.body.id);
    expect(Object.keys(harness.state.medicationLogs)).toHaveLength(1);
  });

  it('ignores duplicate batch inputs and keeps second identical batch idempotent', async () => {
    const harness = buildHarness({
      users: {
        'user-1': { timezone: 'America/Chicago' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Metformin' },
        'med-2': { userId: 'user-1', name: 'Lisinopril' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/schedule/mark-batch');
    const batchBody = {
      doses: [
        { medicationId: 'med-1', scheduledTime: '08:00' },
        { medicationId: 'med-1', scheduledTime: '08:00' }, // duplicate input
        { medicationId: 'med-2', scheduledTime: '09:00' },
      ],
      action: 'taken',
    };

    const firstReq = createRequest({
      user: { uid: 'user-1' },
      body: batchBody,
    });
    const firstRes = createResponse();
    await handler(firstReq, firstRes, jest.fn());

    expect(firstRes.statusCode).toBe(201);
    expect(firstRes.body.duplicateInputsIgnored).toBe(1);
    expect(firstRes.body.errors).toHaveLength(0);
    expect(firstRes.body.results).toHaveLength(2);
    expect(firstRes.body.results.every((result: any) => result.status === 'created')).toBe(true);
    expect(Object.keys(harness.state.medicationLogs)).toHaveLength(2);

    const secondReq = createRequest({
      user: { uid: 'user-1' },
      body: batchBody,
    });
    const secondRes = createResponse();
    await handler(secondReq, secondRes, jest.fn());

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.body.duplicateInputsIgnored).toBe(1);
    expect(secondRes.body.errors).toHaveLength(0);
    expect(secondRes.body.results).toHaveLength(2);
    expect(secondRes.body.results.every((result: any) => result.status === 'unchanged')).toBe(true);
    expect(secondRes.body.results.every((result: any) => result.idempotent === true)).toBe(true);
    expect(Object.keys(harness.state.medicationLogs)).toHaveLength(2);
  });

  it('returns forbidden errors for doses that do not belong to the caller', async () => {
    const harness = buildHarness({
      users: {
        'user-1': { timezone: 'America/Chicago' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Metformin' },
        'med-2': { userId: 'user-2', name: 'Other User Med' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/schedule/mark-batch');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        doses: [
          { medicationId: 'med-1', scheduledTime: '08:00' },
          { medicationId: 'med-2', scheduledTime: '09:00' },
        ],
        action: 'taken',
      },
    });
    const res = createResponse();
    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].medicationId).toBe('med-1');
    expect(res.body.errors).toContainEqual({
      medicationId: 'med-2',
      scheduledTime: '09:00',
      error: 'forbidden',
    });
  });
});
