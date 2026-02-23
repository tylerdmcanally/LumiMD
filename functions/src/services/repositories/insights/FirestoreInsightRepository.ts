import type { InsightRecord, InsightRepository } from './InsightRepository';

function mapInsightDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): InsightRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as InsightRecord;
}

export class FirestoreInsightRepository implements InsightRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private collectionForUser(
    userId: string,
  ): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData> {
    return this.db.collection('users').doc(userId).collection('insights');
  }

  async hasActiveByUser(userId: string, now: FirebaseFirestore.Timestamp): Promise<boolean> {
    const snapshot = await this.collectionForUser(userId)
      .where('expiresAt', '>', now)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async listActiveByUser(
    userId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      limit: number;
    },
  ): Promise<InsightRecord[]> {
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? Math.floor(params.limit) : 5;
    const snapshot = await this.collectionForUser(userId)
      .where('expiresAt', '>', params.now)
      .orderBy('expiresAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => mapInsightDoc(doc));
  }

  async replaceForUser(
    userId: string,
    insights: FirebaseFirestore.DocumentData[],
    now: FirebaseFirestore.Timestamp,
  ): Promise<void> {
    const insightsRef = this.collectionForUser(userId);
    const oldInsights = await insightsRef.where('expiresAt', '<=', now).get();
    const batch = this.db.batch();

    oldInsights.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    insights.forEach((insight) => {
      const insightRef = insightsRef.doc();
      batch.set(insightRef, insight);
    });

    if (oldInsights.size > 0 || insights.length > 0) {
      await batch.commit();
    }
  }
}
