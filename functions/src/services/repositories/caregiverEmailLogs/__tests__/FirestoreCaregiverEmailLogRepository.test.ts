import { FirestoreCaregiverEmailLogRepository } from '../FirestoreCaregiverEmailLogRepository';

function buildFirestoreMock() {
  const writes: Array<Record<string, unknown>> = [];

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'caregiverEmailLog') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        add: jest.fn(async (payload: Record<string, unknown>) => {
          writes.push(payload);
          return { id: `email-log-${writes.length}` };
        }),
      };
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, writes };
}

describe('FirestoreCaregiverEmailLogRepository', () => {
  it('creates caregiver email log events and returns id', async () => {
    const harness = buildFirestoreMock();
    const repository = new FirestoreCaregiverEmailLogRepository(harness.db);

    const id = await repository.create({
      userId: 'user-1',
      caregiverId: 'share-1',
      caregiverEmail: 'caregiver@example.com',
      visitId: 'visit-1',
      status: 'sent',
    });

    expect(id).toBe('email-log-1');
    expect(harness.writes).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        caregiverId: 'share-1',
        caregiverEmail: 'caregiver@example.com',
        visitId: 'visit-1',
        status: 'sent',
      }),
    ]);
  });
});
