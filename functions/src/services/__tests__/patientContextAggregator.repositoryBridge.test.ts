import { getPatientContext, getPatientContextLight } from '../patientContextAggregator';

function makeTimestamp(input: string | Date): FirebaseFirestore.Timestamp {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

describe('patientContextAggregator repository bridge', () => {
  it('aggregates context from domain-backed dependencies', async () => {
    const visitService = {
      listAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'visit-1',
          processingStatus: 'completed',
          createdAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
          diagnoses: ['hypertension'],
          medications: {
            started: ['Lisinopril'],
            stopped: [],
          },
          nextSteps: ['check BP'],
        },
        {
          id: 'visit-2',
          processingStatus: 'completed',
          createdAt: makeTimestamp('2026-02-19T10:00:00.000Z'),
          diagnoses: ['diabetes', 'hypertension'],
          medications: {
            started: [],
            stopped: ['Old Med'],
          },
          nextSteps: [],
        },
        {
          id: 'visit-3',
          processingStatus: 'processing',
          createdAt: makeTimestamp('2026-02-18T10:00:00.000Z'),
          diagnoses: ['ignored'],
          medications: {
            started: [],
            stopped: [],
          },
          nextSteps: [],
        },
      ]),
    };

    const medicationService = {
      listAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'med-1',
          name: 'Lisinopril',
          active: true,
          dose: '10mg',
          createdAt: makeTimestamp('2026-01-20T10:00:00.000Z'),
        },
        {
          id: 'med-2',
          name: 'Old Med',
          active: false,
          createdAt: makeTimestamp('2025-12-20T10:00:00.000Z'),
        },
      ]),
    };

    const healthLogService = {
      listForUser: jest.fn().mockResolvedValue([
        {
          id: 'log-1',
          type: 'bp',
          value: { systolic: 140, diastolic: 90 },
          createdAt: makeTimestamp('2026-02-21T08:00:00.000Z'),
        },
        {
          id: 'log-2',
          type: 'bp',
          value: { systolic: 130, diastolic: 84 },
          createdAt: makeTimestamp('2026-02-20T08:00:00.000Z'),
        },
        {
          id: 'log-3',
          type: 'bp',
          value: { systolic: 120, diastolic: 80 },
          createdAt: makeTimestamp('2026-02-19T08:00:00.000Z'),
        },
        {
          id: 'log-4',
          type: 'glucose',
          value: { reading: 160 },
          createdAt: makeTimestamp('2026-02-21T09:00:00.000Z'),
        },
      ]),
    };

    const nudgeService = {
      listByUserAndStatuses: jest.fn().mockResolvedValue([
        {
          id: 'nudge-1',
          status: 'active',
        },
        {
          id: 'nudge-2',
          status: 'pending',
        },
        {
          id: 'nudge-3',
          status: 'completed',
          completedAt: makeTimestamp('2026-02-15T09:00:00.000Z'),
          scheduledFor: makeTimestamp('2026-02-15T07:00:00.000Z'),
          responseValue: { response: 'having_trouble' },
        },
        {
          id: 'nudge-4',
          status: 'dismissed',
          dismissedAt: makeTimestamp('2026-02-14T09:00:00.000Z'),
        },
      ]),
    };

    const context = await getPatientContext('user-1', {
      visitService,
      medicationService,
      healthLogService,
      nudgeService,
      nowProvider: () => new Date('2026-02-22T12:00:00.000Z'),
    });

    expect(visitService.listAllForUser).toHaveBeenCalledWith('user-1', {
      sortDirection: 'desc',
    });
    expect(medicationService.listAllForUser).toHaveBeenCalledWith('user-1');
    expect(healthLogService.listForUser).toHaveBeenCalledWith('user-1', {
      startDate: expect.any(Date),
      sortDirection: 'desc',
    });
    expect(nudgeService.listByUserAndStatuses).toHaveBeenCalledWith('user-1', [
      'pending',
      'active',
      'completed',
      'dismissed',
      'snoozed',
    ]);

    expect(context.recentVisits).toHaveLength(2);
    expect(context.recentDiagnoses).toEqual(expect.arrayContaining(['hypertension', 'diabetes']));
    expect(context.activeMedications).toHaveLength(1);
    expect(context.activeMedications[0]).toEqual(
      expect.objectContaining({
        id: 'med-1',
        name: 'Lisinopril',
        active: true,
      }),
    );
    expect(context.healthLogTrends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'bp',
          trend: 'worsening',
          dataPoints: 3,
        }),
      ]),
    );
    expect(context.nudgeMetrics).toEqual(
      expect.objectContaining({
        activeCount: 2,
        completedLast30Days: 1,
        dismissedLast30Days: 1,
        concerningResponsesLast30Days: 1,
      }),
    );
    expect(context.nudgeMetrics.averageResponseTimeHours).toBe(2);
  });

  it('builds lightweight context with only visits and medications', async () => {
    const visitService = {
      listAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'visit-1',
          processingStatus: 'completed',
          diagnoses: ['hypertension'],
          createdAt: makeTimestamp('2026-02-21T10:00:00.000Z'),
          medications: { started: [], stopped: [] },
          nextSteps: [],
        },
      ]),
    };
    const medicationService = {
      listAllForUser: jest.fn().mockResolvedValue([
        {
          id: 'med-1',
          name: 'Metformin',
          active: true,
          createdAt: makeTimestamp('2026-01-20T10:00:00.000Z'),
        },
      ]),
    };

    const context = await getPatientContextLight('user-2', {
      visitService,
      medicationService,
      healthLogService: { listForUser: jest.fn() },
      nudgeService: { listByUserAndStatuses: jest.fn() },
      nowProvider: () => new Date('2026-02-22T12:00:00.000Z'),
    });

    expect(visitService.listAllForUser).toHaveBeenCalledWith('user-2', {
      sortDirection: 'desc',
    });
    expect(medicationService.listAllForUser).toHaveBeenCalledWith('user-2');
    expect(context).toEqual(
      expect.objectContaining({
        userId: 'user-2',
        recentDiagnoses: ['hypertension'],
      }),
    );
    expect(context.activeMedications).toHaveLength(1);
  });
});
