export interface VisitActionSyncRepository {
  replaceForVisit(
    batch: FirebaseFirestore.WriteBatch,
    params: {
      visitId: string;
      payloads: FirebaseFirestore.DocumentData[];
    },
  ): Promise<void>;
}
