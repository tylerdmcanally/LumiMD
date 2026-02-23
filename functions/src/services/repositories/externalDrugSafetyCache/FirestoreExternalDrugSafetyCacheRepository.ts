import type {
  ExternalDrugSafetyCacheRecord,
  ExternalDrugSafetyCacheRepository,
} from './ExternalDrugSafetyCacheRepository';

const CACHE_COLLECTION = 'medicationSafetyExternalCache';

const buildDocId = (userId: string, cacheKey: string): string => `${userId}_${cacheKey}`;

function mapCacheDoc(
  doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
): ExternalDrugSafetyCacheRecord | null {
  if (!doc.exists) {
    return null;
  }

  return {
    id: doc.id,
    ...(doc.data() ?? {}),
  } as ExternalDrugSafetyCacheRecord;
}

export class FirestoreExternalDrugSafetyCacheRepository
  implements ExternalDrugSafetyCacheRepository
{
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private collection() {
    return this.db.collection(CACHE_COLLECTION);
  }

  async getByUserAndCacheKey(
    userId: string,
    cacheKey: string,
  ): Promise<ExternalDrugSafetyCacheRecord | null> {
    const snapshot = await this.collection().doc(buildDocId(userId, cacheKey)).get();
    return mapCacheDoc(snapshot);
  }

  async setByUserAndCacheKey(
    userId: string,
    cacheKey: string,
    data: FirebaseFirestore.DocumentData,
  ): Promise<void> {
    await this.collection().doc(buildDocId(userId, cacheKey)).set(data);
  }
}
