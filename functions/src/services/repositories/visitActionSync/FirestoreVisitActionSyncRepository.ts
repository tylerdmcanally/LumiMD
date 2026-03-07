import * as admin from 'firebase-admin';
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
    // Only fetch active (non-deleted) actions for this visit
    const existingActions = await this.db
      .collection(ACTIONS_COLLECTION)
      .where('visitId', '==', params.visitId)
      .where('deletedAt', '==', null)
      .get();

    // Soft-delete existing actions instead of hard-deleting them
    const now = admin.firestore.Timestamp.now();
    existingActions.docs.forEach((doc) => {
      batch.update(doc.ref, {
        deletedAt: now,
        deletedBy: 'system:visit-reprocess',
        updatedAt: now,
      });
    });

    params.payloads.forEach((payload) => {
      const actionRef = this.db.collection(ACTIONS_COLLECTION).doc();
      batch.set(actionRef, payload);
    });
  }
}
