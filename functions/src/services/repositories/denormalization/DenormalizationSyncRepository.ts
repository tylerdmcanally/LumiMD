export type DenormalizationSyncUpdate = {
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>;
};

export type DenormalizationBackfillCollection =
  | 'shares'
  | 'shareInvites'
  | 'medicationReminders';

export type DenormalizationLookupCollection = 'users' | 'medications';

export interface DenormalizationSyncRepository {
  listSharesByOwnerId(
    ownerId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  listSharesByCaregiverUserId(
    caregiverUserId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  listShareInvitesByOwnerId(
    ownerId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  listShareInvitesByCaregiverUserId(
    caregiverUserId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  listMedicationRemindersByUserAndMedication(
    userId: string,
    medicationId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  listCollectionPage(
    collectionName: DenormalizationBackfillCollection,
    options: { cursorDocId?: string | null; limit: number },
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  getLookupDocsByIds(
    collectionName: DenormalizationLookupCollection,
    ids: string[],
  ): Promise<Map<string, FirebaseFirestore.DocumentData>>;
  applyUpdates(
    updates: DenormalizationSyncUpdate[],
    options?: { batchLimit?: number },
  ): Promise<number>;
}
