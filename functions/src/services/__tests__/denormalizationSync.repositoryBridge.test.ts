import {
  backfillDenormalizedFields,
  syncShareCaregiverDenormalizedFields,
  syncMedicationReminderDenormalizedFields,
  syncShareOwnerDenormalizedFields,
} from '../denormalizationSync';

const makeTimestamp = (input: string): FirebaseFirestore.Timestamp => {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
};

describe('denormalizationSync repository bridge', () => {
  it('routes owner denormalized updates through injected repository methods', async () => {
    const shareDoc = {
      id: 'share-1',
      data: () => ({
        ownerId: 'user-1',
        ownerName: 'Old Name',
        ownerEmail: 'old@example.com',
      }),
      ref: {
        id: 'share-1',
      },
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

    const inviteDoc = {
      id: 'invite-1',
      data: () => ({
        ownerId: 'user-1',
        ownerName: 'Old Name',
        ownerEmail: 'old@example.com',
      }),
      ref: {
        id: 'invite-1',
      },
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

    const listSharesByOwnerId = jest.fn().mockResolvedValue([shareDoc]);
    const listShareInvitesByOwnerId = jest.fn().mockResolvedValue([inviteDoc]);
    const applyUpdates = jest.fn().mockResolvedValue(2);

    const result = await syncShareOwnerDenormalizedFields({
      db: {} as FirebaseFirestore.Firestore,
      userId: 'user-1',
      ownerName: 'New Name',
      ownerEmail: 'new@example.com',
      now: makeTimestamp('2026-02-23T12:00:00.000Z'),
      denormalizationSyncRepository: {
        listSharesByOwnerId,
        listShareInvitesByOwnerId,
        applyUpdates,
      },
    });

    expect(listSharesByOwnerId).toHaveBeenCalledWith('user-1');
    expect(listShareInvitesByOwnerId).toHaveBeenCalledWith('user-1');
    expect(applyUpdates).toHaveBeenCalledWith(
      [
        {
          ref: shareDoc.ref,
          updates: expect.objectContaining({
            ownerName: 'New Name',
            ownerEmail: 'new@example.com',
          }),
        },
        {
          ref: inviteDoc.ref,
          updates: expect.objectContaining({
            ownerName: 'New Name',
            ownerEmail: 'new@example.com',
          }),
        },
      ],
      { batchLimit: 450 },
    );
    expect(result).toEqual({
      updatedShares: 1,
      updatedInvites: 1,
    });
  });

  it('routes reminder denormalized updates through injected repository methods', async () => {
    const reminderDoc = {
      id: 'rem-1',
      data: () => ({
        userId: 'user-1',
        medicationId: 'med-1',
        medicationName: 'Old Name',
        medicationDose: '1mg',
      }),
      ref: {
        id: 'rem-1',
      },
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

    const listMedicationRemindersByUserAndMedication = jest
      .fn()
      .mockResolvedValue([reminderDoc]);
    const applyUpdates = jest.fn().mockResolvedValue(1);

    const result = await syncMedicationReminderDenormalizedFields({
      db: {} as FirebaseFirestore.Firestore,
      userId: 'user-1',
      medicationId: 'med-1',
      medicationName: 'New Name',
      medicationDose: '2mg',
      now: makeTimestamp('2026-02-23T12:00:00.000Z'),
      denormalizationSyncRepository: {
        listMedicationRemindersByUserAndMedication,
        applyUpdates,
      },
    });

    expect(listMedicationRemindersByUserAndMedication).toHaveBeenCalledWith('user-1', 'med-1');
    expect(applyUpdates).toHaveBeenCalledWith(
      [
        {
          ref: reminderDoc.ref,
          updates: expect.objectContaining({
            medicationName: 'New Name',
            medicationDose: '2mg',
          }),
        },
      ],
      { batchLimit: 450 },
    );
    expect(result).toEqual({ updatedReminders: 1 });
  });

  it('routes caregiver-email denormalized updates through injected repository methods', async () => {
    const shareDoc = {
      id: 'share-1',
      data: () => ({
        caregiverUserId: 'caregiver-1',
        caregiverEmail: 'old-caregiver@example.com',
      }),
      ref: {
        id: 'share-1',
      },
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

    const inviteDoc = {
      id: 'invite-1',
      data: () => ({
        caregiverUserId: 'caregiver-1',
        caregiverEmail: 'old-caregiver@example.com',
      }),
      ref: {
        id: 'invite-1',
      },
    } as unknown as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

    const listSharesByCaregiverUserId = jest.fn().mockResolvedValue([shareDoc]);
    const listShareInvitesByCaregiverUserId = jest.fn().mockResolvedValue([inviteDoc]);
    const applyUpdates = jest.fn().mockResolvedValue(2);

    const result = await syncShareCaregiverDenormalizedFields({
      db: {} as FirebaseFirestore.Firestore,
      userId: 'caregiver-1',
      caregiverEmail: 'new-caregiver@example.com',
      now: makeTimestamp('2026-02-23T12:00:00.000Z'),
      denormalizationSyncRepository: {
        listSharesByCaregiverUserId,
        listShareInvitesByCaregiverUserId,
        applyUpdates,
      },
    });

    expect(listSharesByCaregiverUserId).toHaveBeenCalledWith('caregiver-1');
    expect(listShareInvitesByCaregiverUserId).toHaveBeenCalledWith('caregiver-1');
    expect(applyUpdates).toHaveBeenCalledWith(
      [
        {
          ref: shareDoc.ref,
          updates: expect.objectContaining({
            caregiverEmail: 'new-caregiver@example.com',
          }),
        },
        {
          ref: inviteDoc.ref,
          updates: expect.objectContaining({
            caregiverEmail: 'new-caregiver@example.com',
          }),
        },
      ],
      { batchLimit: 450 },
    );
    expect(result).toEqual({
      updatedShares: 1,
      updatedInvites: 1,
    });
  });

  it('routes backfill page reads/lookups through injected repository methods', async () => {
    const listCollectionPage = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'share-1',
          data: () => ({
            ownerId: 'user-1',
            ownerName: 'Old Name',
            ownerEmail: 'old@example.com',
          }),
          ref: { id: 'share-1' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'invite-1',
          data: () => ({
            ownerId: 'user-1',
            ownerName: 'Old Name',
            ownerEmail: 'old@example.com',
          }),
          ref: { id: 'invite-1' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'rem-1',
          data: () => ({
            medicationId: 'med-1',
            medicationName: 'Old Name',
            medicationDose: '1mg',
          }),
          ref: { id: 'rem-1' },
        },
      ]);
    const getLookupDocsByIds = jest
      .fn()
      .mockResolvedValueOnce(
        new Map([
          ['user-1', { firstName: 'Updated', lastName: 'Owner', email: 'owner@example.com' }],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          ['user-1', { firstName: 'Updated', lastName: 'Owner', email: 'owner@example.com' }],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          ['med-1', { name: 'Tacrolimus XR', dose: '2mg' }],
        ]),
      );
    const applyUpdates = jest.fn().mockResolvedValue(3);

    const result = await backfillDenormalizedFields({
      db: {} as FirebaseFirestore.Firestore,
      stateCollection: {
        doc: jest.fn(() => ({
          get: jest.fn(async () => ({ exists: false, data: () => undefined })),
          set: jest.fn(async () => undefined),
        })),
      } as unknown as FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
      now: makeTimestamp('2026-02-23T12:00:00.000Z'),
      pageSize: 10,
      denormalizationSyncRepository: {
        listCollectionPage,
        getLookupDocsByIds,
        applyUpdates,
      },
    });

    expect(listCollectionPage).toHaveBeenNthCalledWith(1, 'shares', {
      cursorDocId: null,
      limit: 11,
    });
    expect(listCollectionPage).toHaveBeenNthCalledWith(2, 'shareInvites', {
      cursorDocId: null,
      limit: 11,
    });
    expect(listCollectionPage).toHaveBeenNthCalledWith(3, 'medicationReminders', {
      cursorDocId: null,
      limit: 11,
    });
    expect(getLookupDocsByIds).toHaveBeenCalledWith('users', ['user-1']);
    expect(getLookupDocsByIds).toHaveBeenCalledWith('medications', ['med-1']);
    expect(applyUpdates).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      processedShares: 1,
      processedShareInvites: 1,
      processedMedicationReminders: 1,
      updatedShares: 1,
      updatedShareInvites: 1,
      updatedMedicationReminders: 1,
      hasMore: false,
    });
  });
});
