import * as admin from 'firebase-admin';
import {
  completeNudge,
  createFollowUpNudge,
  dismissNudge,
  getActiveNudgesForUser,
  snoozeNudge,
} from '../lumibotAnalyzer';

type RecordMap = Record<string, unknown>;

type HarnessState = {
  nudges: Record<string, RecordMap>;
};

type QueryFilter = {
  field: string;
  operator: string;
  value: unknown;
};

const DELETE_SENTINEL = '__DELETE__';

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
    nudges: { ...(initial?.nudges ?? {}) },
  };

  let createdCounter = 0;

  const makeDocRef = (id: string): any => ({
    id,
    path: `nudges/${id}`,
    get: jest.fn(async () => ({
      exists: !!state.nudges[id],
      id,
      data: () => state.nudges[id],
    })),
    update: jest.fn(async (updates: RecordMap) => {
      if (!state.nudges[id]) {
        return;
      }

      const next: RecordMap = {
        ...state.nudges[id],
      };

      Object.entries(updates).forEach(([key, value]) => {
        if (value === DELETE_SENTINEL) {
          delete next[key];
          return;
        }
        next[key] = value;
      });

      state.nudges[id] = next;
    }),
  });

  const buildQuery = (filters: QueryFilter[] = []): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery([...filters, { field, operator, value }]),
    ),
    limit: jest.fn((count: number) => ({
      get: jest.fn(async () => {
        const docs = Object.entries(state.nudges)
          .filter(([, nudge]) =>
            filters.every((filter) => {
              if (filter.operator === '==') {
                return nudge[filter.field] === filter.value;
              }
              if (filter.operator === 'in' && Array.isArray(filter.value)) {
                return filter.value.includes(nudge[filter.field]);
              }
              if (filter.operator === '>') {
                const left = nudge[filter.field] as { toMillis?: () => number } | undefined;
                const right = filter.value as { toMillis?: () => number } | undefined;
                if (typeof left?.toMillis !== 'function' || typeof right?.toMillis !== 'function') {
                  return false;
                }
                return left.toMillis() > right.toMillis();
              }
              return false;
            }),
          )
          .slice(0, count)
          .map(([id, nudge]) => ({
            id,
            data: () => nudge,
            ref: makeDocRef(id),
          }));
        return makeQuerySnapshot(docs);
      }),
    })),
    get: jest.fn(async () => {
      const docs = Object.entries(state.nudges)
        .filter(([, nudge]) =>
          filters.every((filter) => {
            if (filter.operator === '==') {
              return nudge[filter.field] === filter.value;
            }
            if (filter.operator === 'in' && Array.isArray(filter.value)) {
              return filter.value.includes(nudge[filter.field]);
            }
            if (filter.operator === '>') {
              const left = nudge[filter.field] as { toMillis?: () => number } | undefined;
              const right = filter.value as { toMillis?: () => number } | undefined;
              if (typeof left?.toMillis !== 'function' || typeof right?.toMillis !== 'function') {
                return false;
              }
              return left.toMillis() > right.toMillis();
            }
            return false;
          }),
        )
        .map(([id, nudge]) => ({
          id,
          data: () => nudge,
          ref: makeDocRef(id),
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'nudges') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return {
        add: jest.fn(async (payload: RecordMap) => {
          createdCounter += 1;
          const id = `created-nudge-${createdCounter}`;
          state.nudges[id] = payload;
          return { id };
        }),
        doc: jest.fn((id: string) => makeDocRef(id)),
        where: jest.fn((field: string, operator: string, value: unknown) =>
          buildQuery([{ field, operator, value }]),
        ),
      };
    }),
    batch: jest.fn(() => {
      const updates: Array<{ ref: { path: string; id: string }; payload: RecordMap }> = [];
      return {
        update: jest.fn((ref: { path: string; id: string }, payload: RecordMap) => {
          updates.push({ ref, payload });
        }),
        commit: jest.fn(async () => {
          updates.forEach(({ ref, payload }) => {
            const id = ref.id;
            if (!state.nudges[id]) {
              return;
            }
            const next: RecordMap = {
              ...state.nudges[id],
            };
            Object.entries(payload).forEach(([key, value]) => {
              if (value === DELETE_SENTINEL) {
                delete next[key];
                return;
              }
              next[key] = value;
            });
            state.nudges[id] = next;
          });
        }),
      };
    }),
  };

  return { state, db };
}

describe('lumibotAnalyzer repository bridge', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp('2026-02-22T12:00:00.000Z'),
      fromDate: (value: Date) => makeTimestamp(value),
    };
    (firestoreMock as any).FieldValue = {
      delete: () => DELETE_SENTINEL,
    };
  });

  it('activates due nudges and returns sorted active nudges', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          status: 'pending',
          scheduledFor: makeTimestamp('2026-02-22T10:00:00.000Z'),
        },
        'nudge-2': {
          userId: 'user-1',
          status: 'active',
          scheduledFor: makeTimestamp('2026-02-22T13:00:00.000Z'),
        },
        'nudge-3': {
          userId: 'user-1',
          status: 'snoozed',
          scheduledFor: makeTimestamp('2026-02-22T09:00:00.000Z'),
          snoozedUntil: makeTimestamp('2026-02-22T11:00:00.000Z'),
        },
        'nudge-4': {
          userId: 'user-1',
          status: 'dismissed',
          scheduledFor: makeTimestamp('2026-02-22T08:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await getActiveNudgesForUser('user-1');

    expect(result.map((item) => item.id)).toEqual(['nudge-3', 'nudge-1', 'nudge-2']);
    expect(harness.state.nudges['nudge-1']).toMatchObject({
      status: 'active',
    });
    expect(harness.state.nudges['nudge-3']).toMatchObject({
      status: 'active',
    });
    expect(harness.state.nudges['nudge-3'].snoozedUntil).toBeUndefined();
  });

  it('completes, snoozes, and dismisses nudges through repository methods', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-10': {
          userId: 'user-1',
          status: 'pending',
          scheduledFor: makeTimestamp('2026-02-22T10:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    await completeNudge('nudge-10', {
      response: 'okay',
      note: undefined,
    });
    expect(harness.state.nudges['nudge-10']).toMatchObject({
      status: 'completed',
      responseValue: {
        response: 'okay',
      },
    });

    await snoozeNudge('nudge-10', 2);
    expect(harness.state.nudges['nudge-10']).toMatchObject({
      status: 'snoozed',
    });
    expect(harness.state.nudges['nudge-10'].snoozedUntil).toBeDefined();

    await dismissNudge('nudge-10');
    expect(harness.state.nudges['nudge-10']).toMatchObject({
      status: 'dismissed',
    });
  });

  it('creates follow-up nudges through repository-backed create', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const createdId = await createFollowUpNudge({
      userId: 'user-1',
      trackingType: 'bp',
      alertLevel: 'warning',
    });

    expect(createdId).toBe('created-nudge-1');
    expect(harness.state.nudges['created-nudge-1']).toMatchObject({
      userId: 'user-1',
      type: 'condition_tracking',
      actionType: 'log_bp',
      status: 'pending',
    });
  });
});
