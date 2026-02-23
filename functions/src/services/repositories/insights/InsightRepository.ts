export type InsightRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId?: string;
  generatedAt?: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
};

export interface InsightRepository {
  hasActiveByUser(userId: string, now: FirebaseFirestore.Timestamp): Promise<boolean>;
  listActiveByUser(
    userId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      limit: number;
    },
  ): Promise<InsightRecord[]>;
  replaceForUser(
    userId: string,
    insights: FirebaseFirestore.DocumentData[],
    now: FirebaseFirestore.Timestamp,
  ): Promise<void>;
}
