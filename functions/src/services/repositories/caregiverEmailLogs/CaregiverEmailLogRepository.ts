export interface CaregiverEmailLogRepository {
  create(payload: FirebaseFirestore.DocumentData): Promise<string>;
}
