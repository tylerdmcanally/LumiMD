import type { CaregiverEmailLogRepository } from './CaregiverEmailLogRepository';

const DEFAULT_COLLECTION = 'caregiverEmailLog';

export class FirestoreCaregiverEmailLogRepository implements CaregiverEmailLogRepository {
  constructor(
    private readonly db: FirebaseFirestore.Firestore,
    private readonly collectionName: string = DEFAULT_COLLECTION,
  ) {}

  async create(payload: FirebaseFirestore.DocumentData): Promise<string> {
    const ref = await this.db.collection(this.collectionName).add(payload);
    return ref.id;
  }
}
