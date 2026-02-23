import * as admin from 'firebase-admin';
import { medicationsRouter } from '../medications';

type RecordMap = Record<string, any>;

type HarnessState = {
  users: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
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

function makeQueryCollection(records: Record<string, RecordMap>) {
  const buildQuery = (wheres: Array<{ field: string; operator: string; value: unknown }>): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery([...wheres, { field, operator, value }]),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(records)
        .filter(([, row]) =>
          wheres.every((clause) => matchesWhere(row[clause.field], clause.operator, clause.value)),
        )
        .map(([id, row]) => ({
          id,
          data: () => row,
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  return {
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery([{ field, operator, value }]),
    ),
    doc: jest.fn((id: string) => ({
      id,
      path: `collection/${id}`,
      get: jest.fn(async () => ({
        exists: Boolean(records[id]),
        id,
        data: () => records[id],
      })),
    })),
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
    medicationLogs: { ...(initial?.medicationLogs ?? {}) },
  };

  const usersCollectionRef = makeQueryCollection(state.users);
  const medicationsCollectionRef = makeQueryCollection(state.medications);
  const remindersCollectionRef = makeQueryCollection(state.medicationReminders);
  const logsCollectionRef = makeQueryCollection(state.medicationLogs);

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') return usersCollectionRef;
      if (name === 'medications') return medicationsCollectionRef;
      if (name === 'medicationReminders') return remindersCollectionRef;
      if (name === 'medicationLogs') return logsCollectionRef;
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

function getRouteHandler(method: 'get', path: string) {
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

describe('medications schedule today route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampFromDateMock = jest.fn((date: Date) => makeTimestamp(date));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      fromDate: timestampFromDateMock,
    };
  });

  it('ignores malformed reminder times without failing the entire schedule', async () => {
    const harness = buildHarness({
      users: {
        'user-1': { timezone: 'America/Chicago' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Metformin', dose: '500mg', active: true },
      },
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: true,
          times: '08:00',
        },
        'rem-2': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: true,
          times: ['bad', '09:30', 42],
        },
        'rem-3': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: true,
          times: { unexpected: true },
        },
      },
      medicationLogs: {},
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/schedule/today');
    const req = createRequest({ user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.scheduledDoses).toHaveLength(2);
    expect(res.body.scheduledDoses.map((dose: any) => dose.scheduledTime)).toEqual([
      '08:00',
      '09:30',
    ]);
  });

  it('falls back to default timezone when user profile timezone is invalid', async () => {
    const harness = buildHarness({
      users: {
        'user-1': { timezone: 'Not/A_Real_Zone' },
      },
      medications: {
        'med-1': { userId: 'user-1', name: 'Lisinopril', dose: '10mg', active: true },
      },
      medicationReminders: {
        'rem-1': {
          userId: 'user-1',
          medicationId: 'med-1',
          enabled: true,
          times: ['08:00'],
        },
      },
      medicationLogs: {},
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/schedule/today');
    const req = createRequest({ user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.scheduledDoses).toHaveLength(1);
    expect(res.body.scheduledDoses[0].scheduledTime).toBe('08:00');
  });
});
