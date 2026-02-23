export interface RestoreAuditRepository {
  createEvent(data: FirebaseFirestore.DocumentData): Promise<string>;
}
