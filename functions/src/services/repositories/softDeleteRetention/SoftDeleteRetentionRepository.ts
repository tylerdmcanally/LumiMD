export type SoftDeleteRetentionRecord = {
  id: string;
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

export interface SoftDeleteRetentionRepository {
  listSoftDeleted(
    collectionName: string,
    cutoff: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<SoftDeleteRetentionRecord[]>;
  purgeByRefs(
    refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
  ): Promise<number>;
}
