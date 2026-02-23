import type { InsightRecord, InsightRepository } from '../../repositories/insights/InsightRepository';

export class InsightDomainService {
  constructor(private readonly insightRepository: InsightRepository) {}

  async hasActiveInsights(
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<boolean> {
    return this.insightRepository.hasActiveByUser(userId, now);
  }

  async listActiveInsights(
    userId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      limit: number;
    },
  ): Promise<InsightRecord[]> {
    return this.insightRepository.listActiveByUser(userId, params);
  }

  async replaceInsightsForUser(
    userId: string,
    insights: FirebaseFirestore.DocumentData[],
    now: FirebaseFirestore.Timestamp,
  ): Promise<void> {
    await this.insightRepository.replaceForUser(userId, insights, now);
  }
}
