import { InsightDomainService } from '../domain/insights/InsightDomainService';
import type { InsightRepository } from '../repositories/insights/InsightRepository';

function makeTimestamp(input: string): FirebaseFirestore.Timestamp {
  const date = new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('InsightDomainService', () => {
  const now = makeTimestamp('2026-02-22T12:00:00.000Z');

  it('forwards has/list/replace operations to the repository', async () => {
    const repository: InsightRepository = {
      hasActiveByUser: jest.fn().mockResolvedValue(true),
      listActiveByUser: jest.fn().mockResolvedValue([
        {
          id: 'insight-1',
          text: 'Trend looks stable',
        },
      ]),
      replaceForUser: jest.fn().mockResolvedValue(undefined),
    };

    const service = new InsightDomainService(repository);

    const hasActive = await service.hasActiveInsights('user-1', now);
    expect(hasActive).toBe(true);
    expect(repository.hasActiveByUser).toHaveBeenCalledWith('user-1', now);

    const insights = await service.listActiveInsights('user-1', {
      now,
      limit: 5,
    });
    expect(insights).toHaveLength(1);
    expect(repository.listActiveByUser).toHaveBeenCalledWith('user-1', {
      now,
      limit: 5,
    });

    await service.replaceInsightsForUser(
      'user-1',
      [
        {
          text: 'Keep up the great work',
          type: 'positive',
        },
      ],
      now,
    );
    expect(repository.replaceForUser).toHaveBeenCalledWith(
      'user-1',
      [
        {
          text: 'Keep up the great work',
          type: 'positive',
        },
      ],
      now,
    );
  });
});
