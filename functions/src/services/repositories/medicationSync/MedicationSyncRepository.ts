export interface MedicationSyncRepository {
  create(data: FirebaseFirestore.DocumentData): Promise<string>;
  updateById(
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void>;
  listByUser(
    userId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  findByUserAndCanonicalName(
    userId: string,
    canonicalName: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null>;
  findByUserAndNameLower(
    userId: string,
    nameLower: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null>;
  listPendingNudgesByMedication(
    userId: string,
    medicationId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  listRemindersByMedication(
    userId: string,
    medicationId: string,
    options?: { limit?: number },
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]>;
  createReminder(data: FirebaseFirestore.DocumentData): Promise<string>;
  deleteByRefs(
    refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
  ): Promise<number>;
}
