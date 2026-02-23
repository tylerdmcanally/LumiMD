import type {
  MedicationSafetyCacheRecord,
  MedicationSafetyCacheRepository,
} from './MedicationSafetyCacheRepository';

const CACHE_COLLECTION = 'medicationSafetyCache';
const BATCH_DELETE_SIZE = 450;

const buildDocId = (userId: string, cacheKey: string): string => `${userId}_${cacheKey}`;

function mapCacheDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> |
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
): MedicationSafetyCacheRecord | null {
  if (!doc.exists) {
    return null;
  }

  return {
    id: doc.id,
    ...(doc.data() ?? {}),
  } as MedicationSafetyCacheRecord;
}

export class FirestoreMedicationSafetyCacheRepository
  implements MedicationSafetyCacheRepository
{
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private collection() {
    return this.db.collection(CACHE_COLLECTION);
  }

  async getByUserAndCacheKey(
    userId: string,
    cacheKey: string,
  ): Promise<MedicationSafetyCacheRecord | null> {
    const docId = buildDocId(userId, cacheKey);
    const userScopedDoc = await this.collection().doc(docId).get();
    const mappedUserDoc = mapCacheDoc(userScopedDoc);
    if (mappedUserDoc) {
      return mappedUserDoc;
    }

    const legacyDoc = await this.collection().doc(cacheKey).get();
    return mapCacheDoc(legacyDoc);
  }

  async setByUserAndCacheKey(
    userId: string,
    cacheKey: string,
    data: FirebaseFirestore.DocumentData,
  ): Promise<void> {
    const docId = buildDocId(userId, cacheKey);
    await this.collection().doc(docId).set(data);
  }

  async listByUser(userId: string): Promise<MedicationSafetyCacheRecord[]> {
    const snapshot = await this.collection().where('userId', '==', userId).get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() ?? {}),
    })) as MedicationSafetyCacheRecord[];
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    let deleted = 0;
    for (let index = 0; index < ids.length; index += BATCH_DELETE_SIZE) {
      const chunk = ids.slice(index, index + BATCH_DELETE_SIZE);
      const batch = this.db.batch();
      chunk.forEach((id) => {
        batch.delete(this.collection().doc(id));
      });
      await batch.commit();
      deleted += chunk.length;
    }

    return deleted;
  }
}
