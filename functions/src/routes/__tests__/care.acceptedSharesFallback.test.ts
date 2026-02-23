import * as admin from 'firebase-admin';
import {
  clearCaregiverShareLookupCacheForTests,
  getAcceptedSharesForCaregiver,
  invalidateCaregiverShareLookupCache,
} from '../care';

type RecordMap = Record<string, any>;

type HarnessState = {
  shares: Record<string, RecordMap>;
};

function makeQuerySnapshot(docs: any[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    shares: { ...(initial?.shares ?? {}) },
  };
  const metrics = {
    shareQueryGets: 0,
  };

  const makeShareDocRef = (shareId: string) => ({
    id: shareId,
    path: `shares/${shareId}`,
    get: jest.fn(async () => ({
      exists: Boolean(state.shares[shareId]),
      id: shareId,
      data: () => state.shares[shareId],
    })),
    set: jest.fn(async (payload: RecordMap, options?: { merge?: boolean }) => {
      if (options?.merge) {
        state.shares[shareId] = {
          ...(state.shares[shareId] ?? {}),
          ...payload,
        };
        return;
      }
      state.shares[shareId] = { ...payload };
    }),
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

  const buildSharesQuery = (
    filters: Array<{ field: string; value: unknown }>,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildSharesQuery([...filters, { field, value }]),
    ),
    get: jest.fn(async () => {
      metrics.shareQueryGets += 1;
      const docs = Object.entries(state.shares)
        .filter(([, share]) =>
          filters.every((filter) => share[filter.field] === filter.value),
        )
        .map(([id, share]) => ({
          id,
          data: () => share,
          ref: makeShareDocRef(id),
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'shares') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildSharesQuery([{ field, value }]),
          ),
          doc: jest.fn((shareId: string) => makeShareDocRef(shareId)),
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db, metrics };
}

describe('care accepted shares fallback', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCaregiverShareLookupCacheForTests();
    (firestoreMock as any).FieldValue = {
      serverTimestamp: jest.fn(() => ({ __op: 'serverTimestamp' })),
    };
  });

  it('includes accepted shares matched by caregiverEmail and backfills caregiverUserId', async () => {
    const harness = buildHarness({
      shares: {
        'share-legacy': {
          ownerId: 'patient-1',
          ownerName: 'Patient One',
          ownerEmail: 'patient1@example.com',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
          // Legacy doc intentionally missing caregiverUserId.
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => ({
      getUser: jest.fn(async () => ({
        uid: 'caregiver-1',
        email: 'caregiver@example.com',
      })),
    }));

    const result = await getAcceptedSharesForCaregiver('caregiver-1');

    expect(result).toEqual([
      {
        id: 'share-legacy',
        ownerId: 'patient-1',
        ownerName: 'Patient One',
        ownerEmail: 'patient1@example.com',
      },
    ]);
    expect(harness.state.shares['share-legacy'].caregiverUserId).toBe('caregiver-1');
  });

  it('returns cached accepted shares for repeated caregiver lookups within ttl', async () => {
    const harness = buildHarness({
      shares: {
        'share-1': {
          ownerId: 'patient-1',
          ownerName: 'Patient One',
          ownerEmail: 'patient1@example.com',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => ({
      getUser: jest.fn(async () => ({
        uid: 'caregiver-1',
        email: 'caregiver@example.com',
      })),
    }));

    const firstResult = await getAcceptedSharesForCaregiver('caregiver-1');
    const firstQueryCount = harness.metrics.shareQueryGets;

    const secondResult = await getAcceptedSharesForCaregiver('caregiver-1');

    expect(firstResult).toEqual(secondResult);
    expect(firstQueryCount).toBeGreaterThan(0);
    expect(harness.metrics.shareQueryGets).toBe(firstQueryCount);
  });

  it('drops cached share lookups when invalidation is requested', async () => {
    const harness = buildHarness({
      shares: {
        'share-1': {
          ownerId: 'patient-1',
          ownerName: 'Patient One',
          ownerEmail: 'patient1@example.com',
          caregiverUserId: 'caregiver-1',
          caregiverEmail: 'caregiver@example.com',
          status: 'accepted',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    authMock.mockImplementation(() => ({
      getUser: jest.fn(async () => ({
        uid: 'caregiver-1',
        email: 'caregiver@example.com',
      })),
    }));

    const initial = await getAcceptedSharesForCaregiver('caregiver-1');
    expect(initial).toHaveLength(1);
    expect(harness.metrics.shareQueryGets).toBeGreaterThan(0);

    harness.state.shares['share-1'].status = 'revoked';

    const stillCached = await getAcceptedSharesForCaregiver('caregiver-1');
    expect(stillCached).toHaveLength(1);
    const cachedQueryCount = harness.metrics.shareQueryGets;

    invalidateCaregiverShareLookupCache('caregiver-1', 'patient-1');
    const refreshed = await getAcceptedSharesForCaregiver('caregiver-1');

    expect(refreshed).toHaveLength(0);
    expect(harness.metrics.shareQueryGets).toBeGreaterThan(cachedQueryCount);
  });
});
