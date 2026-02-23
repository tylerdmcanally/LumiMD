import * as admin from 'firebase-admin';
import {
  type HealthInsight,
  InsightGeneratorService,
  type InsightGeneratorServiceDependencies,
} from '../insightGenerator';

function makeTimestamp(input: string | Date): FirebaseFirestore.Timestamp {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

type InsightServiceMock = {
  hasActiveInsights: jest.Mock;
  listActiveInsights: jest.Mock;
  replaceInsightsForUser: jest.Mock;
};

type HealthLogServiceMock = {
  listForUser: jest.Mock;
};

type MedicationServiceMock = {
  listAllForUser: jest.Mock;
};

type NudgeServiceMock = {
  listByUserAndStatuses: jest.Mock;
};

function buildService(overrides?: Partial<{
  insightService: InsightServiceMock;
  healthLogService: HealthLogServiceMock;
  medicationService: MedicationServiceMock;
  nudgeService: NudgeServiceMock;
}>) {
  const insightService: InsightServiceMock = overrides?.insightService ?? {
    hasActiveInsights: jest.fn().mockResolvedValue(false),
    listActiveInsights: jest.fn().mockResolvedValue([]),
    replaceInsightsForUser: jest.fn().mockResolvedValue(undefined),
  };

  const healthLogService: HealthLogServiceMock = overrides?.healthLogService ?? {
    listForUser: jest.fn().mockResolvedValue([]),
  };

  const medicationService: MedicationServiceMock = overrides?.medicationService ?? {
    listAllForUser: jest.fn().mockResolvedValue([]),
  };

  const nudgeService: NudgeServiceMock = overrides?.nudgeService ?? {
    listByUserAndStatuses: jest.fn().mockResolvedValue([]),
  };

  const dependencies: InsightGeneratorServiceDependencies = {
    client: {} as any,
    db: {} as FirebaseFirestore.Firestore,
    insightService: insightService as any,
    healthLogService: healthLogService as any,
    medicationService: medicationService as any,
    nudgeService: nudgeService as any,
  };

  const service = new InsightGeneratorService(dependencies);

  return {
    service,
    insightService,
    healthLogService,
    medicationService,
    nudgeService,
  };
}

describe('InsightGenerator repository bridge', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp('2026-02-22T12:00:00.000Z'),
      fromDate: (value: Date) => makeTimestamp(value),
    };
  });

  it('uses insight domain methods for generation checks and cached reads', async () => {
    const harness = buildService();

    harness.insightService.hasActiveInsights
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    harness.insightService.listActiveInsights.mockResolvedValue([
      {
        id: 'insight-1',
        text: 'Hydration is improving',
        type: 'positive',
      },
    ]);

    await expect(harness.service.needsInsightGeneration('user-1')).resolves.toBe(false);
    await expect(harness.service.needsInsightGeneration('user-1')).resolves.toBe(true);
    await expect(harness.service.getCachedInsights('user-1')).resolves.toEqual([
      {
        id: 'insight-1',
        text: 'Hydration is improving',
        type: 'positive',
      },
    ]);

    expect(harness.insightService.hasActiveInsights).toHaveBeenCalledTimes(2);
    expect(harness.insightService.listActiveInsights).toHaveBeenCalledWith('user-1', {
      now: expect.objectContaining({ toMillis: expect.any(Function) }),
      limit: 5,
    });
  });

  it('uses healthLogs/medications/nudges domain reads and insight replace write', async () => {
    const completedNudges = [
      {
        id: 'nudge-1',
        status: 'completed',
        responseValue: { response: 'having_trouble' },
        medicationName: 'Lisinopril',
        completedAt: makeTimestamp('2026-02-21T08:00:00.000Z'),
      },
      {
        id: 'nudge-2',
        status: 'completed',
        responseValue: { response: 'good' },
        completedAt: makeTimestamp('2026-01-01T08:00:00.000Z'),
      },
    ];

    const dismissedNudges = [
      {
        id: 'nudge-3',
        status: 'dismissed',
        updatedAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
      },
      {
        id: 'nudge-4',
        status: 'dismissed',
        updatedAt: makeTimestamp('2026-01-01T10:00:00.000Z'),
      },
    ];

    const healthLogService: HealthLogServiceMock = {
      listForUser: jest.fn().mockResolvedValue([
        {
          id: 'log-1',
          type: 'bp',
          value: {
            systolic: 132,
            diastolic: 86,
          },
          createdAt: makeTimestamp('2026-02-20T08:00:00.000Z'),
        },
      ]),
    };

    const medicationService: MedicationServiceMock = {
      listAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'med-1',
          name: 'Lisinopril',
          active: true,
          startedAt: makeTimestamp('2026-02-01T08:00:00.000Z'),
        },
        {
          id: 'med-2',
          name: 'Old Med',
          active: false,
        },
      ]),
    };

    const nudgeService: NudgeServiceMock = {
      listByUserAndStatuses: jest.fn().mockImplementation(
        async (_userId: string, statuses: string[]) => {
          if (statuses.includes('completed')) {
            return completedNudges;
          }
          if (statuses.includes('dismissed')) {
            return dismissedNudges;
          }
          return [];
        },
      ),
    };

    const harness = buildService({
      healthLogService,
      medicationService,
      nudgeService,
    });

    const generatedInsights: HealthInsight[] = [
      {
        text: 'You reported trouble recently. Consider sharing details with your provider.',
        type: 'attention',
        category: 'medication',
        generatedAt: makeTimestamp('2026-02-22T12:00:00.000Z'),
        expiresAt: makeTimestamp('2026-02-23T12:00:00.000Z'),
      },
    ];

    const serviceAny = harness.service as unknown as {
      generateInsightsFromContext: jest.Mock;
    };
    serviceAny.generateInsightsFromContext = jest.fn().mockResolvedValue(generatedInsights);

    await expect(harness.service.generateInsightsForUser('user-1')).resolves.toEqual(
      generatedInsights,
    );

    expect(healthLogService.listForUser).toHaveBeenCalledWith('user-1', {
      startDate: expect.any(Date),
      sortDirection: 'desc',
      limit: 50,
    });
    expect(nudgeService.listByUserAndStatuses).toHaveBeenCalledWith('user-1', ['completed']);
    expect(nudgeService.listByUserAndStatuses).toHaveBeenCalledWith('user-1', ['dismissed']);
    expect(medicationService.listAllForUser).toHaveBeenCalledWith('user-1');
    expect(serviceAny.generateInsightsFromContext).toHaveBeenCalledTimes(1);

    const contextArg = serviceAny.generateInsightsFromContext.mock.calls[0][0];
    expect(contextArg.nudgesCompleted).toBe(1);
    expect(contextArg.nudgesDismissed).toBe(1);
    expect(contextArg.nudgeResponses).toHaveLength(1);
    expect(contextArg.activeMedications).toEqual([
      {
        name: 'Lisinopril',
        startedAt: '2026-02-01T08:00:00.000Z',
      },
    ]);

    expect(harness.insightService.replaceInsightsForUser).toHaveBeenCalledWith(
      'user-1',
      generatedInsights,
      expect.objectContaining({ toMillis: expect.any(Function) }),
    );
  });

  it('skips generation and storage when user has insufficient data', async () => {
    const harness = buildService();
    const serviceAny = harness.service as unknown as {
      generateInsightsFromContext: jest.Mock;
    };
    serviceAny.generateInsightsFromContext = jest.fn().mockResolvedValue([
      {
        text: 'fallback',
        type: 'tip',
        category: 'general',
        generatedAt: makeTimestamp('2026-02-22T12:00:00.000Z'),
        expiresAt: makeTimestamp('2026-02-23T12:00:00.000Z'),
      },
    ]);

    await expect(harness.service.generateInsightsForUser('user-1')).resolves.toEqual([]);

    expect(serviceAny.generateInsightsFromContext).not.toHaveBeenCalled();
    expect(harness.insightService.replaceInsightsForUser).not.toHaveBeenCalled();
  });
});
