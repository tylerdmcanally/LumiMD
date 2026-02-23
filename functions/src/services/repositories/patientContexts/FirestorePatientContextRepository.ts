import type {
  PatientContextConditionRecord,
  PatientContextRecord,
  PatientContextRepository,
} from './PatientContextRepository';

export class FirestorePatientContextRepository implements PatientContextRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async getByUserId(userId: string): Promise<PatientContextRecord | null> {
    const contextDoc = await this.db.collection('patientContexts').doc(userId).get();

    if (!contextDoc.exists) {
      return null;
    }

    return {
      id: contextDoc.id,
      ...(contextDoc.data() || {}),
    } as PatientContextRecord;
  }

  async updateConditions(
    userId: string,
    conditions: PatientContextConditionRecord[],
    updatedAt: Date,
  ): Promise<void> {
    await this.db.collection('patientContexts').doc(userId).update({
      conditions,
      updatedAt,
    });
  }

  async setByUserId(
    userId: string,
    payload: FirebaseFirestore.DocumentData,
    options: { merge?: boolean } = {},
  ): Promise<void> {
    await this.db.collection('patientContexts').doc(userId).set(payload, {
      merge: options.merge === true,
    });
  }

  async updateByUserId(
    userId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void> {
    await this.db.collection('patientContexts').doc(userId).update(updates);
  }
}
