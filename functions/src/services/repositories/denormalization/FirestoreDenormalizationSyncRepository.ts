import type {
  DenormalizationBackfillCollection,
  DenormalizationLookupCollection,
  DenormalizationSyncRepository,
  DenormalizationSyncUpdate,
} from './DenormalizationSyncRepository';

const SHARES_COLLECTION = 'shares';
const SHARE_INVITES_COLLECTION = 'shareInvites';
const MEDICATION_REMINDERS_COLLECTION = 'medicationReminders';
const DEFAULT_BATCH_LIMIT = 450;
const LOOKUP_DOC_CHUNK_SIZE = 250;

export class FirestoreDenormalizationSyncRepository implements DenormalizationSyncRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async listSharesByOwnerId(
    ownerId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(SHARES_COLLECTION)
      .where('ownerId', '==', ownerId)
      .get();
    return snapshot.docs;
  }

  async listSharesByCaregiverUserId(
    caregiverUserId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(SHARES_COLLECTION)
      .where('caregiverUserId', '==', caregiverUserId)
      .get();
    return snapshot.docs;
  }

  async listShareInvitesByOwnerId(
    ownerId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(SHARE_INVITES_COLLECTION)
      .where('ownerId', '==', ownerId)
      .get();
    return snapshot.docs;
  }

  async listShareInvitesByCaregiverUserId(
    caregiverUserId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(SHARE_INVITES_COLLECTION)
      .where('caregiverUserId', '==', caregiverUserId)
      .get();
    return snapshot.docs;
  }

  async listMedicationRemindersByUserAndMedication(
    userId: string,
    medicationId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(MEDICATION_REMINDERS_COLLECTION)
      .where('userId', '==', userId)
      .where('medicationId', '==', medicationId)
      .get();
    return snapshot.docs;
  }

  async listCollectionPage(
    collectionName: DenormalizationBackfillCollection,
    options: { cursorDocId?: string | null; limit: number },
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const limit = Math.max(1, Math.floor(options.limit));
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection(collectionName)
      .orderBy('__name__')
      .limit(limit);

    const cursorDocId =
      typeof options.cursorDocId === 'string' && options.cursorDocId.trim().length > 0
        ? options.cursorDocId.trim()
        : null;
    if (cursorDocId) {
      query = query.startAfter(cursorDocId);
    }

    const snapshot = await query.get();
    return snapshot.docs;
  }

  async getLookupDocsByIds(
    collectionName: DenormalizationLookupCollection,
    ids: string[],
  ): Promise<Map<string, FirebaseFirestore.DocumentData>> {
    const result = new Map<string, FirebaseFirestore.DocumentData>();
    const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));

    for (let index = 0; index < uniqueIds.length; index += LOOKUP_DOC_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(index, index + LOOKUP_DOC_CHUNK_SIZE);
      const refs = chunk.map((id) => this.db.collection(collectionName).doc(id));
      const snapshots = await this.db.getAll(...refs);
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists) {
          return;
        }
        result.set(snapshot.id, snapshot.data() ?? {});
      });
    }

    return result;
  }

  async applyUpdates(
    updates: DenormalizationSyncUpdate[],
    options?: { batchLimit?: number },
  ): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    const batchLimit = Math.max(1, Math.floor(options?.batchLimit ?? DEFAULT_BATCH_LIMIT));
    let applied = 0;

    for (let start = 0; start < updates.length; start += batchLimit) {
      const chunk = updates.slice(start, start + batchLimit);
      const batch = this.db.batch();
      chunk.forEach((entry) => batch.update(entry.ref, entry.updates));
      await batch.commit();
      applied += chunk.length;
    }

    return applied;
  }
}
