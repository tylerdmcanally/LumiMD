export type MedicationSafetyCacheRecord = FirebaseFirestore.DocumentData & {
  id: string;
  createdAt?: FirebaseFirestore.Timestamp;
  warnings?: unknown;
};

export interface MedicationSafetyCacheRepository {
  getByUserAndCacheKey(
    userId: string,
    cacheKey: string,
  ): Promise<MedicationSafetyCacheRecord | null>;
  setByUserAndCacheKey(
    userId: string,
    cacheKey: string,
    data: FirebaseFirestore.DocumentData,
  ): Promise<void>;
  listByUser(userId: string): Promise<MedicationSafetyCacheRecord[]>;
  deleteByIds(ids: string[]): Promise<number>;
}
