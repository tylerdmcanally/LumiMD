import type { MedicationSyncRepository } from './MedicationSyncRepository';

const MEDICATIONS_COLLECTION = 'medications';
const NUDGES_COLLECTION = 'nudges';
const REMINDERS_COLLECTION = 'medicationReminders';
const BATCH_DELETE_SIZE = 500;

export class FirestoreMedicationSyncRepository implements MedicationSyncRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async create(data: FirebaseFirestore.DocumentData): Promise<string> {
    const ref = this.db.collection(MEDICATIONS_COLLECTION).doc();
    await ref.set(data);
    return ref.id;
  }

  async updateById(
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void> {
    await this.db.collection(MEDICATIONS_COLLECTION).doc(medicationId).update(updates);
  }

  async listByUser(
    userId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(MEDICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .get();
    return snapshot.docs;
  }

  async findByUserAndCanonicalName(
    userId: string,
    canonicalName: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null> {
    const snapshot = await this.db
      .collection(MEDICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('canonicalName', '==', canonicalName)
      .limit(1)
      .get();

    return snapshot.empty ? null : snapshot.docs[0];
  }

  async findByUserAndNameLower(
    userId: string,
    nameLower: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null> {
    const snapshot = await this.db
      .collection(MEDICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('nameLower', '==', nameLower)
      .limit(1)
      .get();

    return snapshot.empty ? null : snapshot.docs[0];
  }

  async listPendingNudgesByMedication(
    userId: string,
    medicationId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    const snapshot = await this.db
      .collection(NUDGES_COLLECTION)
      .where('userId', '==', userId)
      .where('medicationId', '==', medicationId)
      .where('status', 'in', ['pending', 'active', 'snoozed'])
      .get();

    return snapshot.docs;
  }

  async listRemindersByMedication(
    userId: string,
    medicationId: string,
    options?: { limit?: number },
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection(REMINDERS_COLLECTION)
      .where('userId', '==', userId)
      .where('medicationId', '==', medicationId);

    if (options?.limit && Number.isFinite(options.limit) && options.limit > 0) {
      query = query.limit(Math.floor(options.limit));
    }

    const snapshot = await query.get();
    return snapshot.docs;
  }

  async createReminder(data: FirebaseFirestore.DocumentData): Promise<string> {
    const ref = await this.db.collection(REMINDERS_COLLECTION).add(data);
    return ref.id;
  }

  async deleteByRefs(
    refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
  ): Promise<number> {
    if (refs.length === 0) {
      return 0;
    }

    let deleted = 0;
    for (let start = 0; start < refs.length; start += BATCH_DELETE_SIZE) {
      const chunk = refs.slice(start, start + BATCH_DELETE_SIZE);
      const batch = this.db.batch();
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      deleted += chunk.length;
    }

    return deleted;
  }
}
