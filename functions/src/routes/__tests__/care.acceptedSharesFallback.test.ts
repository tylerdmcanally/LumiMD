import * as admin from 'firebase-admin';
import { getAcceptedSharesForCaregiver } from '../care';

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

  const makeShareDocRef = (shareId: string) => ({
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

  const buildSharesQuery = (
    filters: Array<{ field: string; value: unknown }>,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildSharesQuery([...filters, { field, value }]),
    ),
    get: jest.fn(async () => {
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
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db };
}

describe('care accepted shares fallback', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const authMock = admin.auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
