import * as admin from 'firebase-admin';
import { purgeSoftDeletedCollections } from '../softDeleteRetentionService';

function makeTimestamp(input: string | Date): FirebaseFirestore.Timestamp {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('softDeleteRetentionService repository bridge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
    const firestoreMock = admin.firestore as unknown as {
      Timestamp?: { fromDate?: (date: Date) => FirebaseFirestore.Timestamp };
    };
    firestoreMock.Timestamp = {
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses injected repository list/purge methods for retention processing', async () => {
    const actionsRef = {
      id: 'action-1',
      path: 'actions/action-1',
    } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

    const retentionRepository = {
      listSoftDeleted: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'action-1', ref: actionsRef }])
        .mockResolvedValueOnce([]),
      purgeByRefs: jest.fn().mockResolvedValue(1),
    };

    const result = await purgeSoftDeletedCollections(
      {
        collections: ['actions', 'visits'],
        retentionDays: 90,
        pageSize: 50,
      },
      { retentionRepository },
    );

    expect(retentionRepository.listSoftDeleted).toHaveBeenCalledTimes(2);
    expect(retentionRepository.purgeByRefs).toHaveBeenCalledWith([actionsRef]);
    expect(result.totalPurged).toBe(1);
    expect(result.collections).toMatchObject([
      { collection: 'actions', scanned: 1, purged: 1 },
      { collection: 'visits', scanned: 0, purged: 0 },
    ]);
  });
});
