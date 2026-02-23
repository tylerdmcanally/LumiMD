import * as admin from 'firebase-admin';
import { visitsRouter } from '../visits';

type RecordMap = Record<string, any>;

type HarnessState = {
  visits: Record<string, RecordMap>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function toComparable(value: unknown): number | string {
  if (value && typeof value === 'object') {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().getTime();
    }
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return 0;
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    visits: { ...(initial?.visits ?? {}) },
  };

  const buildVisitsQuery = (
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
    startAfterDocId?: string,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildVisitsQuery(
        [...filters, { field, operator, value }],
        orderByField,
        orderDirection,
        limitValue,
        startAfterDocId,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildVisitsQuery(filters, field, direction, limitValue, startAfterDocId),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildVisitsQuery(filters, orderByField, orderDirection, nextLimit, startAfterDocId),
    ),
    startAfter: jest.fn((cursorDoc: { id: string }) =>
      buildVisitsQuery(filters, orderByField, orderDirection, limitValue, cursorDoc.id),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.visits).filter(([, visit]) =>
        filters.every((filter) => {
          const fieldValue = visit[filter.field];
          if (filter.operator === '==') {
            return fieldValue === filter.value;
          }
          if (filter.operator === '!=') {
            return fieldValue !== filter.value && fieldValue !== undefined;
          }
          return false;
        }),
      );

      if (orderByField) {
        docs = docs.sort((left, right) => {
          const leftValue = toComparable(left[1][orderByField]);
          const rightValue = toComparable(right[1][orderByField]);
          if (leftValue === rightValue) return 0;
          const base = leftValue > rightValue ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });
      }

      if (startAfterDocId) {
        const cursorIndex = docs.findIndex(([id]) => id === startAfterDocId);
        if (cursorIndex >= 0) {
          docs = docs.slice(cursorIndex + 1);
        }
      }

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      return {
        docs: docs.map(([id, visit]) => ({
          id,
          data: () => visit,
          ref: {
            id,
            update: jest.fn(async (payload: RecordMap) => {
              const next = { ...state.visits[id] };
              Object.entries(payload).forEach(([key, value]) => {
                if (value && typeof value === 'object' && (value as { __op?: unknown }).__op === 'delete') {
                  delete next[key];
                  return;
                }
                next[key] = value;
              });
              state.visits[id] = next;
            }),
          },
        })),
        size: docs.length,
      };
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'visits') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return {
        where: jest.fn((field: string, operator: string, value: unknown) =>
          buildVisitsQuery([{ field, operator, value }]),
        ),
        doc: jest.fn((visitId: string) => ({
          id: visitId,
          get: jest.fn(async () => ({
            exists: Boolean(state.visits[visitId]),
            id: visitId,
            data: () => state.visits[visitId],
          })),
          update: jest.fn(async (payload: RecordMap) => {
            const next = { ...(state.visits[visitId] ?? {}) };
            Object.entries(payload).forEach(([key, value]) => {
              if (value && typeof value === 'object' && (value as { __op?: unknown }).__op === 'delete') {
                delete next[key];
                return;
              }
              next[key] = value;
            });
            state.visits[visitId] = next;
          }),
        })),
      };
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'operator-1', operator: true },
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

function getRouteHandler(method: 'get' | 'post', path: string) {
  const layer = visitsRouter.stack.find(
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

describe('visits post-commit escalations operator routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
    };
    (firestoreMock as any).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
    };
  });

  it('rejects escalation listing for non-operator users', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/post-commit-escalations');
    const req = createRequest({ user: { uid: 'user-1' }, query: {} });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
  });

  it('lists escalated visits with pagination headers', async () => {
    const harness = buildHarness({
      visits: {
        'visit-newer': {
          userId: 'patient-1',
          postCommitStatus: 'partial_failure',
          postCommitRetryEligible: true,
          postCommitFailedOperations: ['syncMedications'],
          postCommitOperationAttempts: { syncMedications: 3 },
          postCommitOperationNextRetryAt: {
            syncMedications: makeTimestamp('2026-02-20T12:15:00.000Z'),
          },
          postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T11:35:00.000Z'),
          createdAt: makeTimestamp('2026-02-20T10:00:00.000Z'),
        },
        'visit-older': {
          userId: 'patient-2',
          postCommitStatus: 'partial_failure',
          postCommitRetryEligible: false,
          postCommitFailedOperations: ['syncMedications'],
          postCommitEscalatedAt: makeTimestamp('2026-02-20T09:30:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T09:35:00.000Z'),
          createdAt: makeTimestamp('2026-02-20T08:00:00.000Z'),
        },
        'visit-not-escalated': {
          userId: 'patient-3',
          postCommitStatus: 'partial_failure',
          postCommitRetryEligible: true,
          postCommitFailedOperations: ['syncMedications'],
          updatedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/ops/post-commit-escalations');
    const req = createRequest({ query: { limit: '1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-has-more']).toBe('true');
    expect(res.headers['x-next-cursor']).toBe('visit-newer');
    expect(res.body.escalations).toHaveLength(1);
    expect(res.body.escalations[0]).toMatchObject({
      id: 'visit-newer',
      userId: 'patient-1',
      postCommitStatus: 'partial_failure',
      postCommitFailedOperations: ['syncMedications'],
      postCommitOperationAttempts: { syncMedications: 3 },
    });
    expect(res.body.escalations[0].postCommitOperationNextRetryAt).toMatchObject({
      syncMedications: '2026-02-20T12:15:00.000Z',
    });
  });

  it('acknowledges an escalated visit and records operator metadata', async () => {
    const harness = buildHarness({
      visits: {
        'visit-ack': {
          userId: 'patient-1',
          postCommitStatus: 'partial_failure',
          postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
          updatedAt: makeTimestamp('2026-02-20T11:35:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/ops/post-commit-escalations/:id/acknowledge');
    const req = createRequest({
      params: { id: 'visit-ack' },
      body: { note: 'Reviewed and investigating with on-call engineer.' },
      user: { uid: 'operator-99', operator: true },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      id: 'visit-ack',
      acknowledgedBy: 'operator-99',
      note: 'Reviewed and investigating with on-call engineer.',
    });
    expect(harness.state.visits['visit-ack']).toMatchObject({
      postCommitEscalationAcknowledgedBy: 'operator-99',
      postCommitEscalationNote: 'Reviewed and investigating with on-call engineer.',
    });
  });

  it('returns conflict when acknowledging a non-escalated visit', async () => {
    const harness = buildHarness({
      visits: {
        'visit-no-escalation': {
          userId: 'patient-1',
          postCommitStatus: 'partial_failure',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/ops/post-commit-escalations/:id/acknowledge');
    const req = createRequest({
      params: { id: 'visit-no-escalation' },
      body: {},
      user: { uid: 'operator-1', operator: true },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'not_escalated' });
  });

  it('resolves an escalated visit and records resolution metadata', async () => {
    const harness = buildHarness({
      visits: {
        'visit-resolve': {
          userId: 'patient-1',
          postCommitStatus: 'partial_failure',
          postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/ops/post-commit-escalations/:id/resolve');
    const req = createRequest({
      params: { id: 'visit-resolve' },
      body: { note: 'Issue mitigated after replay and verification.' },
      user: { uid: 'operator-2', operator: true },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      id: 'visit-resolve',
      resolvedBy: 'operator-2',
      note: 'Issue mitigated after replay and verification.',
    });
    expect(harness.state.visits['visit-resolve']).toMatchObject({
      postCommitEscalationResolvedBy: 'operator-2',
      postCommitEscalationResolutionNote: 'Issue mitigated after replay and verification.',
    });
  });

  it('reopens a resolved escalation and clears resolution/ack metadata', async () => {
    const harness = buildHarness({
      visits: {
        'visit-reopen': {
          userId: 'patient-1',
          postCommitStatus: 'partial_failure',
          postCommitEscalatedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
          postCommitEscalationAcknowledgedAt: makeTimestamp('2026-02-20T11:05:00.000Z'),
          postCommitEscalationAcknowledgedBy: 'operator-2',
          postCommitEscalationNote: 'Investigating',
          postCommitEscalationResolvedAt: makeTimestamp('2026-02-20T11:20:00.000Z'),
          postCommitEscalationResolvedBy: 'operator-2',
          postCommitEscalationResolutionNote: 'Mitigated',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/ops/post-commit-escalations/:id/reopen');
    const req = createRequest({
      params: { id: 'visit-reopen' },
      body: {},
      user: { uid: 'operator-3', operator: true },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      id: 'visit-reopen',
      reopenedBy: 'operator-3',
    });
    expect(harness.state.visits['visit-reopen'].postCommitEscalationResolvedAt).toBeUndefined();
    expect(harness.state.visits['visit-reopen'].postCommitEscalationResolvedBy).toBeUndefined();
    expect(harness.state.visits['visit-reopen'].postCommitEscalationResolutionNote).toBeUndefined();
    expect(harness.state.visits['visit-reopen'].postCommitEscalationAcknowledgedAt).toBeUndefined();
    expect(harness.state.visits['visit-reopen'].postCommitEscalationAcknowledgedBy).toBeUndefined();
    expect(harness.state.visits['visit-reopen'].postCommitEscalationNote).toBeUndefined();
  });
});
