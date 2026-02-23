export type ExternalDrugSafetyCacheRecord = FirebaseFirestore.DocumentData & {
  id: string;
  createdAt?: FirebaseFirestore.Timestamp;
  warnings?: unknown;
};

export interface ExternalDrugSafetyCacheRepository {
  getByUserAndCacheKey(
    userId: string,
    cacheKey: string,
  ): Promise<ExternalDrugSafetyCacheRecord | null>;
  setByUserAndCacheKey(
    userId: string,
    cacheKey: string,
    data: FirebaseFirestore.DocumentData,
  ): Promise<void>;
}
