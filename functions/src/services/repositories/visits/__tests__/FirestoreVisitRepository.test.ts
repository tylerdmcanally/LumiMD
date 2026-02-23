import { FirestoreVisitRepository } from '../FirestoreVisitRepository';

function buildListHarness() {
  const query: any = {};
  query.where = jest.fn(() => query);
  query.orderBy = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.startAfter = jest.fn(() => query);
  query.get = jest.fn(async () => ({ docs: [] }));

  const docRef = {
    get: jest.fn(async () => ({ exists: false, data: () => undefined })),
  };

  const collectionRef = {
    where: jest.fn(() => query),
    doc: jest.fn(() => docRef),
    add: jest.fn(),
  };

  const db = {
    collection: jest.fn(() => collectionRef),
  } as unknown as FirebaseFirestore.Firestore;

  return {
    db,
    query,
    collectionRef,
  };
}

function buildCreateHarness() {
  const add = jest.fn(async (payload: FirebaseFirestore.DocumentData) => ({
    get: jest.fn(async () => ({
      id: 'visit-1',
      data: () => payload,
    })),
  }));

  const db = {
    collection: jest.fn(() => ({ add })),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, add };
}

describe('FirestoreVisitRepository', () => {
  it('adds soft-delete defaults when creating visits', async () => {
    const harness = buildCreateHarness();
    const repository = new FirestoreVisitRepository(harness.db);

    await repository.create({
      userId: 'user-1',
      notes: 'Follow-up appointment',
    });

    expect(harness.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        notes: 'Follow-up appointment',
        deletedAt: null,
        deletedBy: null,
      }),
    );
  });

  it('preserves explicit soft-delete fields when provided during create', async () => {
    const harness = buildCreateHarness();
    const repository = new FirestoreVisitRepository(harness.db);
    const deletedAt = { toMillis: () => 123 };

    await repository.create({
      userId: 'user-1',
      notes: 'Archived visit',
      deletedAt,
      deletedBy: 'user-1',
    });

    expect(harness.add).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt,
        deletedBy: 'user-1',
      }),
    );
  });

  it('filters deleted records by default when listing paginated visits', async () => {
    const harness = buildListHarness();
    const repository = new FirestoreVisitRepository(harness.db);

    await repository.listByUser('user-1', { limit: 10 });

    expect(harness.collectionRef.where).toHaveBeenCalledWith('userId', '==', 'user-1');
    expect(harness.query.where).toHaveBeenCalledWith('deletedAt', '==', null);
  });

  it('skips deletedAt filter when includeDeleted is true', async () => {
    const harness = buildListHarness();
    const repository = new FirestoreVisitRepository(harness.db);

    await repository.listByUser('user-1', { limit: 10, includeDeleted: true });

    expect(harness.collectionRef.where).toHaveBeenCalledWith('userId', '==', 'user-1');
    expect(harness.query.where).not.toHaveBeenCalled();
  });
});
