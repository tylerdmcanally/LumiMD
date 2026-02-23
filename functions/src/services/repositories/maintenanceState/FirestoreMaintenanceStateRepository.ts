import type {
  MaintenanceStateRepository,
  MaintenanceStateSetOptions,
} from './MaintenanceStateRepository';

const DEFAULT_COLLECTION = 'systemMaintenance';

export class FirestoreMaintenanceStateRepository
  implements MaintenanceStateRepository
{
  constructor(
    private readonly db: FirebaseFirestore.Firestore,
    private readonly collectionName: string = DEFAULT_COLLECTION,
  ) {}

  private docRef(documentId: string) {
    return this.db.collection(this.collectionName).doc(documentId);
  }

  async getState(documentId: string): Promise<FirebaseFirestore.DocumentData | null> {
    const snapshot = await this.docRef(documentId).get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() ?? null;
  }

  async setState(
    documentId: string,
    data: FirebaseFirestore.DocumentData,
    options: MaintenanceStateSetOptions = {},
  ): Promise<void> {
    const merge = options.merge !== false;
    await this.docRef(documentId).set(data, { merge });
  }
}
