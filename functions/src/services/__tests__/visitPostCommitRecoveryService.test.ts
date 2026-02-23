import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { processVisitPostCommitRecoveries } from '../visitPostCommitRecoveryService';
import { getAssemblyAIService } from '../assemblyai';
import { normalizeMedicationSummary, syncMedicationsFromSummary } from '../medicationSync';
import { analyzeVisitWithDelta } from '../lumibotAnalyzer';
import { getNotificationService } from '../notifications';
import { sendVisitPdfToAllCaregivers } from '../caregiverEmailService';

jest.mock('../assemblyai', () => ({
  getAssemblyAIService: jest.fn(),
}));

jest.mock('../medicationSync', () => ({
  normalizeMedicationSummary: jest.fn((input: unknown) =>
    input ?? {
      started: [],
      stopped: [],
      changed: [],
    }),
  syncMedicationsFromSummary: jest.fn(async () => undefined),
}));

jest.mock('../lumibotAnalyzer', () => ({
  analyzeVisitWithDelta: jest.fn(async () => ({
    nudgesCreated: 0,
    reasoning: 'none',
    conditionsAdded: [],
    trackingEnabled: [],
  })),
}));

jest.mock('../notifications', () => ({
  getNotificationService: jest.fn(),
}));

jest.mock('../caregiverEmailService', () => ({
  sendVisitPdfToAllCaregivers: jest.fn(async () => ({ sent: 1, failed: 0 })),
}));

type RecordMap = Record<string, any>;

class MockTimestamp {
  private readonly date: Date;

  constructor(date: Date) {
    this.date = date;
  }

  toDate() {
    return this.date;
  }

  toMillis() {
    return this.date.getTime();
  }

  static fromDate(date: Date) {
    return new MockTimestamp(date);
  }
}

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return new MockTimestamp(date);
}

function toComparable(value: unknown): number | string {
  if (value && typeof value === 'object') {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().getTime();
    }
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return 0;
}

function buildHarness(
  initialVisits: Record<string, RecordMap>,
  options: { users?: Record<string, RecordMap> } = {},
) {
  const derivedUsers = Object.values(initialVisits).reduce<Record<string, RecordMap>>(
    (acc, visit) => {
      if (typeof visit.userId === 'string' && !acc[visit.userId]) {
        acc[visit.userId] = { autoShareWithCaregivers: true };
      }
      return acc;
    },
    {},
  );

  const state = {
    visits: Object.fromEntries(
      Object.entries(initialVisits).map(([id, visit]) => [id, { ...visit }]),
    ) as Record<string, RecordMap>,
    users: { ...derivedUsers, ...(options.users ?? {}) },
  };

  const applyUpdate = (id: string, patch: RecordMap) => {
    const next = { ...(state.visits[id] ?? {}) };
    Object.entries(patch).forEach(([key, value]) => {
      if (value && typeof value === 'object' && (value as { __op?: unknown }).__op === 'delete') {
        delete next[key];
        return;
      }
      if (
        value &&
        typeof value === 'object' &&
        (value as { __op?: unknown }).__op === 'arrayUnion'
      ) {
        const current = Array.isArray(next[key]) ? [...next[key]] : [];
        const unionValues = Array.isArray((value as { values?: unknown }).values)
          ? ((value as { values: unknown[] }).values)
          : [];
        unionValues.forEach((entry) => {
          if (!current.includes(entry)) {
            current.push(entry);
          }
        });
        next[key] = current;
        return;
      }
      next[key] = value;
    });
    state.visits[id] = next;
  };

  const docRefs = new Map<
    string,
    {
      id: string;
      get: jest.Mock<Promise<{ exists: boolean; id: string; data: () => RecordMap | undefined }>, []>;
      update: jest.Mock<Promise<void>, [RecordMap]>;
    }
  >();

  const getDocRef = (id: string) => {
    const existing = docRefs.get(id);
    if (existing) {
      return existing;
    }
    const ref = {
      id,
      get: jest.fn(async () => ({
        exists: Boolean(state.visits[id]),
        id,
        data: () => state.visits[id],
      })),
      update: jest.fn(async (patch: RecordMap) => {
        applyUpdate(id, patch);
      }),
    };
    docRefs.set(id, ref);
    return ref;
  };

  const buildQuery = (
    filters: Array<{ field: string; value: unknown }> = [],
    orderByField: string | null = null,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue: number | null = null,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildQuery([...filters, { field, value }], orderByField, orderDirection, limitValue),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(filters, field, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(filters, orderByField, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.visits).filter(([, data]) =>
        filters.every((filter) => data[filter.field] === filter.value),
      );

      if (orderByField) {
        docs = docs.sort((left, right) => {
          const leftValue = toComparable(left[1][orderByField]);
          const rightValue = toComparable(right[1][orderByField]);
          if (leftValue === rightValue) return 0;
          const base = leftValue > rightValue ? 1 : -1;
          return orderDirection === 'desc' ? -base : base;
        });
      }

      if (typeof limitValue === 'number') {
        docs = docs.slice(0, limitValue);
      }

      const snapshotDocs = docs.map(([id]) => ({
        id,
        data: () => state.visits[id],
        ref: getDocRef(id),
      }));

      return {
        size: snapshotDocs.length,
        docs: snapshotDocs,
      };
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'visits') {
        const query = buildQuery();
        return {
          ...query,
          doc: jest.fn((visitId: string) => getDocRef(visitId)),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn((userId: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.users[userId],
              id: userId,
              data: () => state.users[userId] ?? {},
            })),
          })),
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db, docRefs };
}

describe('visit post-commit recovery service', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetAssemblyAIService = getAssemblyAIService as jest.Mock;
  const mockedNormalizeMedicationSummary = normalizeMedicationSummary as jest.Mock;
  const mockedSyncMedicationsFromSummary = syncMedicationsFromSummary as jest.Mock;
  const mockedAnalyzeVisitWithDelta = analyzeVisitWithDelta as jest.Mock;
  const mockedGetNotificationService = getNotificationService as jest.Mock;
  const mockedSendVisitPdfToAllCaregivers = sendVisitPdfToAllCaregivers as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    (firestoreMock as unknown as { Timestamp?: unknown }).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
      fromDate: jest.fn((date: Date) => makeTimestamp(date)),
    };
    (firestoreMock as unknown as { FieldValue?: unknown }).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
      arrayUnion: jest.fn((...values: unknown[]) => ({ __op: 'arrayUnion', values })),
    };

    mockedNormalizeMedicationSummary.mockImplementation((input: unknown) =>
      input ?? {
        started: [],
        stopped: [],
        changed: [],
      },
    );
    mockedSyncMedicationsFromSummary.mockResolvedValue(undefined);
    mockedGetAssemblyAIService.mockReturnValue({
      deleteTranscript: jest.fn(async () => undefined),
    });
    mockedAnalyzeVisitWithDelta.mockResolvedValue({
      nudgesCreated: 0,
      reasoning: 'none',
      conditionsAdded: [],
      trackingEnabled: [],
    });
    mockedGetNotificationService.mockReturnValue({
      notifyVisitReady: jest.fn(async () => undefined),
    });
    mockedSendVisitPdfToAllCaregivers.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it('retries sync+transcript operations and marks visit as completed when all succeed', async () => {
    const harness = buildHarness({
      'visit-1': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-19T12:00:00.000Z'),
        postCommitFailedOperations: ['syncMedications', 'deleteTranscript'],
        userId: 'user-1',
        medications: { started: [{ name: 'Metformin' }], stopped: [], changed: [] },
        processedAt: makeTimestamp('2026-02-19T11:00:00.000Z'),
        transcriptionId: 'tx-1',
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    const deleteTranscript = jest.fn(async () => undefined);
    mockedGetAssemblyAIService.mockReturnValue({ deleteTranscript });

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 1,
      visitsResolved: 1,
      visitsStillFailing: 0,
      operationAttempts: 2,
      operationFailures: 0,
    });
    expect(mockedSyncMedicationsFromSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        visitId: 'visit-1',
      }),
    );
    expect(deleteTranscript).toHaveBeenCalledWith('tx-1');
    expect(harness.state.visits['visit-1'].postCommitStatus).toBe('completed');
    expect(harness.state.visits['visit-1'].postCommitFailedOperations).toBeUndefined();
    expect(harness.state.visits['visit-1'].postCommitRetryEligible).toBeUndefined();
    expect(harness.state.visits['visit-1'].postCommitCompletedOperations).toEqual(
      expect.arrayContaining(['syncMedications', 'deleteTranscript']),
    );
    expect(harness.state.visits['visit-1'].postCommitOperationAttempts).toBeUndefined();
    expect(harness.state.visits['visit-1'].postCommitOperationNextRetryAt).toBeUndefined();
    expect(harness.state.visits['visit-1'].transcriptionId).toBeUndefined();
  });

  it('keeps visit in partial failure when retryable operation still fails', async () => {
    const harness = buildHarness({
      'visit-2': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-19T13:00:00.000Z'),
        postCommitFailedOperations: ['syncMedications'],
        userId: 'user-2',
        medications: { started: [{ name: 'Lisinopril' }], stopped: [], changed: [] },
        processedAt: makeTimestamp('2026-02-19T11:00:00.000Z'),
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    mockedSyncMedicationsFromSummary.mockRejectedValueOnce(new Error('sync failed'));

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 1,
      visitsResolved: 0,
      visitsStillFailing: 1,
      operationAttempts: 1,
      operationFailures: 1,
    });
    expect(mockedSyncMedicationsFromSummary).toHaveBeenCalledTimes(1);
    expect(harness.state.visits['visit-2'].postCommitStatus).toBe('partial_failure');
    expect(harness.state.visits['visit-2'].postCommitFailedOperations).toEqual([
      'syncMedications',
    ]);
    expect(harness.state.visits['visit-2'].postCommitRetryEligible).toBe(true);
    expect(harness.state.visits['visit-2'].postCommitOperationAttempts).toEqual({
      syncMedications: 2,
    });
    expect(harness.state.visits['visit-2'].postCommitOperationNextRetryAt).toEqual(
      expect.objectContaining({
        syncMedications: expect.objectContaining({
          toDate: expect.any(Function),
        }),
      }),
    );
  });

  it('retries lumibot, push notification, and caregiver email operations', async () => {
    const harness = buildHarness({
      'visit-4': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-19T15:00:00.000Z'),
        postCommitFailedOperations: ['lumibotAnalysis', 'pushNotification', 'caregiverEmails'],
        userId: 'user-4',
        summary: 'Follow-up visit completed',
        diagnoses: ['Hypertension'],
        medications: { started: [], stopped: [], changed: [] },
        nextSteps: ['Continue monitoring blood pressure'],
        imaging: [],
        education: { diagnoses: [], medications: [] },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const notifyVisitReady = jest.fn(async () => undefined);
    mockedGetNotificationService.mockReturnValue({ notifyVisitReady });

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 1,
      visitsResolved: 1,
      visitsStillFailing: 0,
      operationAttempts: 3,
      operationFailures: 0,
    });
    expect(mockedAnalyzeVisitWithDelta).toHaveBeenCalledWith(
      'user-4',
      'visit-4',
      expect.objectContaining({ summary: 'Follow-up visit completed' }),
      expect.any(Date),
    );
    expect(notifyVisitReady).toHaveBeenCalledWith('user-4', 'visit-4');
    expect(mockedSendVisitPdfToAllCaregivers).toHaveBeenCalledWith('user-4', 'visit-4');
    expect(harness.state.visits['visit-4'].postCommitStatus).toBe('completed');
    expect(harness.state.visits['visit-4'].postCommitCompletedOperations).toEqual(
      expect.arrayContaining(['lumibotAnalysis', 'pushNotification', 'caregiverEmails']),
    );
  });

  it('treats already-completed failed operations as resolved and skips duplicate retries', async () => {
    const harness = buildHarness({
      'visit-3': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-19T14:00:00.000Z'),
        postCommitFailedOperations: ['pushNotification'],
        postCommitCompletedOperations: ['pushNotification'],
        userId: 'user-3',
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 0,
      visitsResolved: 1,
      visitsStillFailing: 0,
      operationAttempts: 0,
      operationFailures: 0,
    });
    expect(mockedGetNotificationService).not.toHaveBeenCalled();
    expect(harness.state.visits['visit-3'].postCommitStatus).toBe('completed');
    expect(harness.state.visits['visit-3'].postCommitFailedOperations).toBeUndefined();
    expect(harness.state.visits['visit-3'].postCommitRetryEligible).toBeUndefined();
  });

  it('skips retrying operations that are still in backoff window', async () => {
    const futureRetryAt = makeTimestamp('2026-02-20T12:10:00.000Z');
    const harness = buildHarness({
      'visit-5': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-20T11:55:00.000Z'),
        postCommitFailedOperations: ['syncMedications'],
        postCommitOperationAttempts: { syncMedications: 2 },
        postCommitOperationNextRetryAt: { syncMedications: futureRetryAt },
        userId: 'user-5',
        medications: { started: [], stopped: [], changed: [] },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 0,
      visitsResolved: 0,
      visitsStillFailing: 1,
      operationAttempts: 0,
      operationFailures: 0,
    });
    expect(mockedSyncMedicationsFromSummary).not.toHaveBeenCalled();
    expect(harness.state.visits['visit-5'].postCommitRetryEligible).toBe(true);
    expect(harness.state.visits['visit-5'].postCommitOperationNextRetryAt).toEqual({
      syncMedications: futureRetryAt,
    });
  });

  it('disables retry eligibility once max attempts are exhausted', async () => {
    const harness = buildHarness({
      'visit-6': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
        postCommitFailedOperations: ['syncMedications'],
        postCommitOperationAttempts: { syncMedications: 5 },
        userId: 'user-6',
        medications: { started: [], stopped: [], changed: [] },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 0,
      visitsResolved: 0,
      visitsStillFailing: 1,
      operationAttempts: 0,
      operationFailures: 0,
    });
    expect(mockedSyncMedicationsFromSummary).not.toHaveBeenCalled();
    expect(harness.state.visits['visit-6'].postCommitRetryEligible).toBe(false);
  });

  it('escalates alerts after repeated retry failures', async () => {
    const loggerErrorSpy = jest.spyOn(functions.logger, 'error');
    const harness = buildHarness({
      'visit-7': {
        processingStatus: 'completed',
        postCommitStatus: 'partial_failure',
        postCommitRetryEligible: true,
        postCommitLastAttemptAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
        postCommitFailedOperations: ['syncMedications'],
        postCommitOperationAttempts: { syncMedications: 2 },
        userId: 'user-7',
        medications: { started: [{ name: 'Metformin' }], stopped: [], changed: [] },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);
    mockedSyncMedicationsFromSummary.mockRejectedValueOnce(new Error('still failing'));

    const result = await processVisitPostCommitRecoveries({ limit: 10 });

    expect(result).toMatchObject({
      visitsScanned: 1,
      visitsRetried: 1,
      visitsResolved: 0,
      visitsStillFailing: 1,
      operationAttempts: 1,
      operationFailures: 1,
    });
    expect(harness.state.visits['visit-7'].postCommitOperationAttempts).toEqual({
      syncMedications: 3,
    });
    expect(harness.state.visits['visit-7'].postCommitEscalatedAt).toEqual(
      expect.objectContaining({ toDate: expect.any(Function) }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[visitPostCommitRecovery][ALERT] Repeated failure'),
    );
    loggerErrorSpy.mockRestore();
  });
});
