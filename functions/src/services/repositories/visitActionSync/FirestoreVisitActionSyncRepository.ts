import type { VisitActionSyncRepository } from './VisitActionSyncRepository';

const ACTIONS_COLLECTION = 'actions';

export class FirestoreVisitActionSyncRepository implements VisitActionSyncRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async replaceForVisit(
    batch: FirebaseFirestore.WriteBatch,
    params: {
      visitId: string;
      payloads: FirebaseFirestore.DocumentData[];
    },
  ): Promise<void> {
    const existingActions = await this.db
      .collection(ACTIONS_COLLECTION)
      .where('visitId', '==', params.visitId)
      .get();

    existingActions.docs.forEach((doc) => batch.delete(doc.ref));

    params.payloads.forEach((payload) => {
      const actionRef = this.db.collection(ACTIONS_COLLECTION).doc();
      batch.set(actionRef, payload);
    });
  }
}
