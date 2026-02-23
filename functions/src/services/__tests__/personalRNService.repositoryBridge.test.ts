import * as admin from 'firebase-admin';
import {
  buildPatientState,
  createReactiveNudge,
  evaluatePatient,
} from '../personalRNService';
import { getPatientContext } from '../patientContextAggregator';
import { getLumiBotAIService } from '../lumibotAI';

jest.mock('../patientContextAggregator', () => ({
  getPatientContext: jest.fn(),
}));

jest.mock('../lumibotAI', () => ({
  getLumiBotAIService: jest.fn(),
}));

function makeTimestamp(input: string | Date): FirebaseFirestore.Timestamp {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    activeMedications: [],
    recentVisits: [],
    nudgeMetrics: {
      concerningResponsesLast30Days: 0,
    },
    healthLogTrends: [],
    recentDiagnoses: [],
    ...overrides,
  } as any;
}

describe('personalRNService repository bridge', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetPatientContext = getPatientContext as jest.Mock;
  const mockedGetLumiBotAIService = getLumiBotAIService as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => makeTimestamp('2026-02-22T12:00:00.000Z'),
      fromDate: (value: Date) => makeTimestamp(value),
    };
    mockedGetLumiBotAIService.mockReturnValue({
      generateCheckInMessage: jest.fn(async () => ({
        title: 'AI Check-in',
        message: 'How are you feeling today?',
      })),
    });
  });

  it('builds patient state and derives recent dismissals from nudges domain reads', async () => {
    mockedGetPatientContext.mockResolvedValue(
      buildContext({
        healthLogTrends: [
          {
            type: 'bp',
            lastValue: { systolic: 120, diastolic: 78 },
            lastLoggedAt: new Date('2026-02-20T10:00:00.000Z'),
          },
        ],
      }),
    );

    const nudgeService = {
      listByUserAndStatuses: jest.fn().mockResolvedValue([
        { id: 'dismissed-1', status: 'dismissed', dismissedAt: makeTimestamp('2026-02-21T08:00:00.000Z') },
        { id: 'dismissed-2', status: 'dismissed', dismissedAt: makeTimestamp('2026-01-01T08:00:00.000Z') },
      ]),
      createRecord: jest.fn(),
    };

    const state = await buildPatientState('user-1', { nudgeService });

    expect(nudgeService.listByUserAndStatuses).toHaveBeenCalledWith('user-1', ['dismissed']);
    expect(state.recentDismissals).toBe(1);
    expect(state.daysSinceLastLog).toBeGreaterThanOrEqual(0);
  });

  it('skips nudging when an active nudge already exists', async () => {
    mockedGetPatientContext.mockResolvedValue(
      buildContext({
        activeMedications: [
          {
            name: 'Lisinopril',
            startedAt: new Date('2026-01-01T10:00:00.000Z'),
          },
        ],
      }),
    );

    const nudgeService = {
      listByUserAndStatuses: jest.fn().mockImplementation(async (_userId: string, statuses: string[]) => {
        if (statuses.includes('dismissed')) {
          return [];
        }
        return [{ id: 'active-1', status: 'active' }];
      }),
      createRecord: jest.fn(),
    };

    const result = await evaluatePatient('user-1', { nudgeService });

    expect(result.shouldNudge).toBe(false);
    expect(result.reason).toBe('Already has active nudge');
    expect(nudgeService.listByUserAndStatuses).toHaveBeenCalledWith('user-1', [
      'pending',
      'active',
      'snoozed',
    ]);
  });

  it('creates reactive follow-up nudges via nudge domain writes for elevated readings', async () => {
    mockedGetPatientContext.mockResolvedValue(
      buildContext({
        healthLogTrends: [
          {
            type: 'bp',
            lastValue: { systolic: 150, diastolic: 95 },
            lastLoggedAt: new Date('2026-02-22T08:00:00.000Z'),
          },
        ],
      }),
    );

    const nudgeService = {
      listByUserAndStatuses: jest.fn(),
      createRecord: jest.fn().mockResolvedValue({ id: 'reactive-1' }),
    };

    await createReactiveNudge(
      'user-1',
      'bp',
      { systolic: 150, diastolic: 95 },
      { nudgeService },
    );

    expect(nudgeService.createRecord).toHaveBeenCalledTimes(1);
    expect(nudgeService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'followup',
        reactiveTriggered: true,
        triggerReason: 'Elevated bp reading',
      }),
    );
  });
});
