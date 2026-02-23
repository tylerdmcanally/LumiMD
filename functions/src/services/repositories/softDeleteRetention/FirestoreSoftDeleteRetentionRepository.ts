import type {
  SoftDeleteRetentionRecord,
  SoftDeleteRetentionRepository,
} from './SoftDeleteRetentionRepository';

const DELETE_BATCH_SIZE = 500;

function mapDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): SoftDeleteRetentionRecord {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    ref: doc.ref,
    deletedAt: (data.deletedAt as FirebaseFirestore.Timestamp | null | undefined) ?? null,
  };
}

export class FirestoreSoftDeleteRetentionRepository
  implements SoftDeleteRetentionRepository
{
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async listSoftDeleted(
    collectionName: string,
    cutoff: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<SoftDeleteRetentionRecord[]> {
    const snapshot = await this.db
      .collection(collectionName)
      .where('deletedAt', '<=', cutoff)
      .orderBy('deletedAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => mapDoc(doc));
  }

  async purgeByRefs(
    refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
  ): Promise<number> {
    if (refs.length === 0) {
      return 0;
    }

    let purged = 0;
    for (let start = 0; start < refs.length; start += DELETE_BATCH_SIZE) {
      const chunk = refs.slice(start, start + DELETE_BATCH_SIZE);
      const batch = this.db.batch();
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      purged += chunk.length;
    }

    return purged;
  }
}
