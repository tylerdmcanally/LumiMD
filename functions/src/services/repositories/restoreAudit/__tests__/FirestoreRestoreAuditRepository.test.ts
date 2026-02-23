import { FirestoreRestoreAuditRepository } from '../FirestoreRestoreAuditRepository';

function buildFirestoreMock() {
  const writes: Array<Record<string, unknown>> = [];

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'restoreAuditLogs') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        add: jest.fn(async (payload: Record<string, unknown>) => {
          writes.push(payload);
          return { id: `audit-${writes.length}` };
        }),
      };
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, writes };
}

describe('FirestoreRestoreAuditRepository', () => {
  it('creates restore-audit events and returns created id', async () => {
    const harness = buildFirestoreMock();
    const repository = new FirestoreRestoreAuditRepository(harness.db);

    const id = await repository.createEvent({
      resourceType: 'visit',
      resourceId: 'visit-1',
      ownerUserId: 'owner-1',
    });

    expect(id).toBe('audit-1');
    expect(harness.writes).toEqual([
      expect.objectContaining({
        resourceType: 'visit',
        resourceId: 'visit-1',
        ownerUserId: 'owner-1',
      }),
    ]);
  });
});
