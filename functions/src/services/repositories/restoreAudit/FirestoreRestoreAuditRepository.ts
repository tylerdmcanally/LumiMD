import type { RestoreAuditRepository } from './RestoreAuditRepository';

const DEFAULT_COLLECTION = 'restoreAuditLogs';

export class FirestoreRestoreAuditRepository implements RestoreAuditRepository {
  constructor(
    private readonly db: FirebaseFirestore.Firestore,
    private readonly collectionName: string = DEFAULT_COLLECTION,
  ) {}

  async createEvent(data: FirebaseFirestore.DocumentData): Promise<string> {
    const ref = await this.db.collection(this.collectionName).add(data);
    return ref.id;
  }
}
