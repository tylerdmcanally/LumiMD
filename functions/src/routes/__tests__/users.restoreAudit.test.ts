import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, any>;

type HarnessState = {
  restoreAuditLogs: Record<string, RecordMap>;
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
    size: docs.length,
    empty: docs.length === 0,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    restoreAuditLogs: { ...(initial?.restoreAuditLogs ?? {}) },
  };

  const buildRestoreAuditQuery = (
    startAfterDocId?: string,
    limitValue?: number,
  ): any => ({
    orderBy: jest.fn((_field: string, _direction: 'asc' | 'desc' = 'desc') =>
      buildRestoreAuditQuery(startAfterDocId, limitValue),
    ),
    startAfter: jest.fn((doc: { id: string }) =>
      buildRestoreAuditQuery(doc.id, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildRestoreAuditQuery(startAfterDocId, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.restoreAuditLogs)
        .map(([id, data]) => ({
          id,
          data: () => data,
        }))
        .sort((left, right) => {
          const leftMillis = left.data().createdAt?.toMillis?.() ?? 0;
          const rightMillis = right.data().createdAt?.toMillis?.() ?? 0;
          return rightMillis - leftMillis;
        });

      if (startAfterDocId) {
        const startAfterIndex = docs.findIndex((doc) => doc.id === startAfterDocId);
        if (startAfterIndex >= 0) {
          docs = docs.slice(startAfterIndex + 1);
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
      if (name !== 'restoreAuditLogs') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        orderBy: jest.fn((_field: string, _direction: 'asc' | 'desc' = 'desc') =>
          buildRestoreAuditQuery(),
        ),
        doc: jest.fn((id: string) => ({
          id,
          get: jest.fn(async () => ({
            exists: !!state.restoreAuditLogs[id],
            id,
            data: () => state.restoreAuditLogs[id],
          })),
          update: jest.fn(async (payload: Record<string, unknown>) => {
            if (!state.restoreAuditLogs[id]) {
              throw new Error(`Restore audit log not found: ${id}`);
            }
            state.restoreAuditLogs[id] = {
              ...state.restoreAuditLogs[id],
              ...payload,
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

function getRouteHandler(method: 'get' | 'patch', path: string) {
  const layer = usersRouter.stack.find(
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

describe('users restore audit operator route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-26T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('rejects access for non-operator users', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/restore-audit');
    const req = createRequest({
      user: { uid: 'user-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
    });
  });

  it('returns restore audit events with pagination headers for operator users', async () => {
    const harness = buildHarness({
      restoreAuditLogs: {
        'audit-5': {
          resourceType: 'visit',
          resourceId: 'visit-5',
          ownerUserId: 'owner-1',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          reason: 'Incident-driven restore',
          createdAt: makeTimestamp('2026-02-26T12:00:00.000Z'),
        },
        'audit-4': {
          resourceType: 'medication',
          resourceId: 'med-4',
          ownerUserId: 'owner-2',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          reason: 'Corrected accidental delete',
          createdAt: makeTimestamp('2026-02-26T11:00:00.000Z'),
        },
        'audit-3': {
          resourceType: 'action',
          resourceId: 'action-3',
          ownerUserId: 'owner-3',
          actorUserId: 'owner-3',
          actorCategory: 'owner',
          reason: null,
          createdAt: makeTimestamp('2026-02-26T10:00:00.000Z'),
        },
        'audit-2': {
          resourceType: 'health_log',
          resourceId: 'log-2',
          ownerUserId: 'owner-4',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          reason: 'Recovery after support ticket',
          createdAt: makeTimestamp('2026-02-26T09:00:00.000Z'),
        },
        'audit-1': {
          resourceType: 'visit',
          resourceId: 'visit-1',
          ownerUserId: 'owner-5',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          reason: 'Older entry',
          createdAt: makeTimestamp('2026-02-26T08:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/restore-audit');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      query: { limit: '2' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('audit-2');
    expect(res.body).toMatchObject({
      count: 2,
      limit: 2,
      hasMore: true,
      nextCursor: 'audit-2',
      scanned: 4,
    });
    expect((res.body as { events: Array<{ id: string }> }).events.map((event) => event.id)).toEqual([
      'audit-5',
      'audit-4',
    ]);
    expect((res.body as { events: Array<{ triageStatus: string | null }> }).events[0].triageStatus).toBe(
      'unreviewed',
    );
  });

  it('filters restore audit events by triage status', async () => {
    const harness = buildHarness({
      restoreAuditLogs: {
        'audit-3': {
          resourceType: 'visit',
          resourceId: 'visit-3',
          ownerUserId: 'owner-1',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          triageStatus: 'resolved',
          createdAt: makeTimestamp('2026-02-26T10:00:00.000Z'),
        },
        'audit-2': {
          resourceType: 'visit',
          resourceId: 'visit-2',
          ownerUserId: 'owner-1',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          triageStatus: 'in_review',
          createdAt: makeTimestamp('2026-02-26T09:00:00.000Z'),
        },
        'audit-1': {
          resourceType: 'visit',
          resourceId: 'visit-1',
          ownerUserId: 'owner-1',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          createdAt: makeTimestamp('2026-02-26T08:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/restore-audit');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      query: { triageStatus: 'in_review' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const events = (res.body as { events: Array<{ id: string }> }).events;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('audit-2');
  });

  it('updates triage state for restore audit events', async () => {
    const harness = buildHarness({
      restoreAuditLogs: {
        'audit-1': {
          resourceType: 'visit',
          resourceId: 'visit-1',
          ownerUserId: 'owner-1',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          triageStatus: 'unreviewed',
          triageNote: null,
          createdAt: makeTimestamp('2026-02-26T08:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/ops/restore-audit/:id/triage');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      params: { id: 'audit-1' },
      body: {
        triageStatus: 'resolved',
        triageNote: 'Resolved after operator review',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: 'audit-1',
      triageStatus: 'resolved',
      triageNote: 'Resolved after operator review',
      triageUpdatedBy: 'operator-1',
    });
  });

  it('returns validation error for unknown cursor', async () => {
    const harness = buildHarness({
      restoreAuditLogs: {
        'audit-1': {
          resourceType: 'visit',
          resourceId: 'visit-1',
          ownerUserId: 'owner-1',
          actorUserId: 'operator-1',
          actorCategory: 'operator',
          reason: 'restore',
          createdAt: makeTimestamp('2026-02-26T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/restore-audit');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      query: { cursor: 'missing-cursor' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid cursor',
    });
  });
});
