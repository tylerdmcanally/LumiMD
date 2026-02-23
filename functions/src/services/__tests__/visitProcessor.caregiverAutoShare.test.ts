import * as admin from 'firebase-admin';
import { summarizeVisit } from '../visitProcessor';
import { getOpenAIService } from '../openai';
import { normalizeMedicationSummary, syncMedicationsFromSummary } from '../medicationSync';
import { getAssemblyAIService } from '../assemblyai';
import { analyzeVisitWithDelta } from '../lumibotAnalyzer';
import { getNotificationService } from '../notifications';
import { sendVisitPdfToAllCaregivers } from '../caregiverEmailService';

jest.mock('../openai', () => ({
  getOpenAIService: jest.fn(),
}));

jest.mock('../medicationSync', () => ({
  normalizeMedicationSummary: jest.fn((input: unknown) =>
    input ?? {
      started: [],
      stopped: [],
      changed: [],
    }
  ),
  syncMedicationsFromSummary: jest.fn(async () => undefined),
}));

jest.mock('../assemblyai', () => ({
  getAssemblyAIService: jest.fn(),
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

type RecordMap = Record<string, unknown>;

type HarnessOptions = {
  autoShareWithCaregivers?: boolean;
  existingMedications?: Array<{
    name: string;
    canonicalName?: string;
    nameLower?: string;
    active?: boolean;
    dose?: string;
    frequency?: string;
  }>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function buildHarness(options: HarnessOptions = {}) {
  const existingMedications = options.existingMedications ?? [
    {
      name: 'Metformin',
      canonicalName: 'metformin',
      nameLower: 'metformin',
      active: true,
      dose: '500 mg',
      frequency: 'daily',
    },
  ];
  const medicationRecords = existingMedications.map((item, index) => ({
    id: `med-${index + 1}`,
    ...{
      name: item.name,
      canonicalName: item.canonicalName ?? item.name.toLowerCase(),
      nameLower: item.nameLower ?? item.name.toLowerCase(),
      active: item.active ?? true,
      dose: item.dose,
      frequency: item.frequency,
      deletedAt: null,
      userId: 'user-1',
    },
  }));

  const existingActionDocs: Array<{ ref: RecordMap }> = [];

  const userDoc = {
    exists: true,
    id: 'user-1',
    data: () => ({
      autoShareWithCaregivers: options.autoShareWithCaregivers,
    }),
  };

  const batch = {
    update: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(async () => undefined),
  };

  let actionDocCounter = 0;

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'medications') {
        const buildMedicationQuery = (
          filters: Array<{ field: string; value: unknown }> = [],
          orderByField: string | null = null,
          orderDirection: 'asc' | 'desc' = 'asc',
        ): any => ({
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildMedicationQuery([...filters, { field, value }], orderByField, orderDirection),
          ),
          orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
            buildMedicationQuery(filters, field, direction),
          ),
          get: jest.fn(async () => {
            let records = medicationRecords.filter((record) =>
              filters.every((filter) => (record as Record<string, unknown>)[filter.field] === filter.value),
            );

            if (orderByField) {
              records = records.sort((left, right) => {
                const leftValue = String((left as Record<string, unknown>)[orderByField] ?? '');
                const rightValue = String((right as Record<string, unknown>)[orderByField] ?? '');
                const base = leftValue.localeCompare(rightValue);
                return orderDirection === 'desc' ? -base : base;
              });
            }

            const docs = records.map((record) => ({
              id: record.id,
              data: () => record,
              get: (field: string) => (record as Record<string, unknown>)[field],
            }));
            return {
              docs,
              size: docs.length,
              empty: docs.length === 0,
            };
          }),
        });

        return buildMedicationQuery();
      }

      if (name === 'actions') {
        return {
          where: jest.fn(() => ({
            get: jest.fn(async () => ({ docs: existingActionDocs })),
          })),
          doc: jest.fn(() => ({
            id: `action-${++actionDocCounter}`,
          })),
        };
      }

      if (name === 'users') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(async () => userDoc),
          })),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => batch),
  };

  return {
    db,
    batch,
  };
}

describe('visitProcessor caregiver auto-share', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetOpenAIService = getOpenAIService as jest.Mock;
  const mockedNormalizeMedicationSummary = normalizeMedicationSummary as jest.Mock;
  const mockedSyncMedicationsFromSummary = syncMedicationsFromSummary as jest.Mock;
  const mockedGetAssemblyAIService = getAssemblyAIService as jest.Mock;
  const mockedAnalyzeVisitWithDelta = analyzeVisitWithDelta as jest.Mock;
  const mockedGetNotificationService = getNotificationService as jest.Mock;
  const mockedSendVisitPdfToAllCaregivers = sendVisitPdfToAllCaregivers as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    (firestoreMock as unknown as { Timestamp?: unknown }).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-11T20:00:00.000Z')),
      fromDate: jest.fn((date: Date) => makeTimestamp(date)),
    };
    (firestoreMock as unknown as { FieldValue?: unknown }).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
      arrayUnion: jest.fn((...values: unknown[]) => ({ __op: 'arrayUnion', values })),
    };

    mockedGetOpenAIService.mockReturnValue({
      summarizeTranscript: jest.fn(async () => ({
        summary: 'Patient follow-up completed.',
        diagnoses: ['Hypertension'],
        diagnosesDetailed: [],
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        imaging: [],
        testsOrdered: [],
        nextSteps: ['Follow up in 2 weeks'],
        followUps: [],
        medicationReview: {
          reviewed: false,
          continued: [],
          continuedReviewed: [],
          adherenceConcerns: [],
          reviewConcerns: [],
          sideEffectsDiscussed: [],
          followUpNeeded: false,
          notes: [],
        },
        education: {
          diagnoses: [],
          medications: [],
        },
        extractionVersion: 'v2_structured',
        promptMeta: {
          promptVersion: 'test',
          schemaVersion: 'test',
          responseFormat: 'json_object',
          model: 'test-model',
        },
      })),
    });

    mockedNormalizeMedicationSummary.mockImplementation((input: unknown) =>
      input ?? {
        started: [],
        stopped: [],
        changed: [],
      }
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

  it('sends caregiver email when auto-share is enabled', async () => {
    const harness = buildHarness({ autoShareWithCaregivers: true });
    firestoreMock.mockImplementation(() => harness.db);

    await summarizeVisit({
      visitRef: {
        id: 'visit-1',
        update: jest.fn(async () => undefined),
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Patient discussed blood pressure and medications.',
        visitDate: makeTimestamp('2026-02-11T19:00:00.000Z'),
      },
    });

    expect(harness.batch.commit).toHaveBeenCalledTimes(1);
    expect(mockedSendVisitPdfToAllCaregivers).toHaveBeenCalledWith('user-1', 'visit-1');
  });

  it('skips caregiver email when auto-share is disabled', async () => {
    const harness = buildHarness({ autoShareWithCaregivers: false });
    firestoreMock.mockImplementation(() => harness.db);

    await summarizeVisit({
      visitRef: {
        id: 'visit-2',
        update: jest.fn(async () => undefined),
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Patient discussed blood pressure and medications.',
        visitDate: makeTimestamp('2026-02-11T19:15:00.000Z'),
      },
    });

    expect(harness.batch.commit).toHaveBeenCalledTimes(1);
    expect(mockedSendVisitPdfToAllCaregivers).not.toHaveBeenCalled();
  });

  it('routes action replacement writes through injected repository dependency', async () => {
    const harness = buildHarness({ autoShareWithCaregivers: false });
    firestoreMock.mockImplementation(() => harness.db);
    const replaceForVisit = jest.fn(async () => undefined);

    await summarizeVisit(
      {
        visitRef: {
          id: 'visit-action-sync',
          update: jest.fn(async () => undefined),
        } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
        visitData: {
          userId: 'user-1',
          transcriptText: 'Patient discussed blood pressure and medications.',
          visitDate: makeTimestamp('2026-02-11T19:20:00.000Z'),
        },
      },
      {
        visitActionSyncRepository: {
          replaceForVisit,
        },
      },
    );

    expect(replaceForVisit).toHaveBeenCalledTimes(1);
    expect(replaceForVisit).toHaveBeenCalledWith(
      harness.batch,
      expect.objectContaining({
        visitId: 'visit-action-sync',
        payloads: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            visitId: 'visit-action-sync',
            description: expect.stringContaining('Follow up in 2 weeks'),
          }),
        ]),
      }),
    );
  });

  it('records completed post-commit status when side effects succeed', async () => {
    const harness = buildHarness({ autoShareWithCaregivers: false });
    firestoreMock.mockImplementation(() => harness.db);

    const visitRefUpdate = jest.fn(async () => undefined);

    await summarizeVisit({
      visitRef: {
        id: 'visit-postcommit-success',
        update: visitRefUpdate,
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Patient discussed blood pressure and medications.',
        visitDate: makeTimestamp('2026-02-11T19:20:00.000Z'),
      },
    });

    const completedUpdate = (visitRefUpdate.mock.calls as unknown[][])
      .map((call) => call[0] as RecordMap)
      .find((payload) => payload.postCommitStatus === 'completed');

    expect(completedUpdate).toBeDefined();
    expect(completedUpdate).toEqual(
      expect.objectContaining({
        postCommitStatus: 'completed',
        postCommitFailedOperations: { __op: 'delete' },
        postCommitRetryEligible: { __op: 'delete' },
        postCommitCompletedOperations: expect.objectContaining({ __op: 'arrayUnion' }),
        postCommitOperationAttempts: { __op: 'delete' },
        postCommitOperationNextRetryAt: { __op: 'delete' },
      }),
    );
    expect(completedUpdate?.postCommitLastAttemptAt).toBeDefined();
    expect(completedUpdate?.postCommitCompletedAt).toBeDefined();
  });

  it('records partial post-commit failures without failing visit summarization', async () => {
    const harness = buildHarness({ autoShareWithCaregivers: false });
    firestoreMock.mockImplementation(() => harness.db);
    mockedSyncMedicationsFromSummary.mockRejectedValueOnce(new Error('sync failed'));

    const visitRefUpdate = jest.fn(async () => undefined);

    await expect(
      summarizeVisit({
        visitRef: {
          id: 'visit-postcommit-partial',
          update: visitRefUpdate,
        } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
        visitData: {
          userId: 'user-1',
          transcriptText: 'Patient discussed blood pressure and medications.',
          visitDate: makeTimestamp('2026-02-11T19:25:00.000Z'),
        },
      }),
    ).resolves.toBeUndefined();

    const partialFailureUpdate = (visitRefUpdate.mock.calls as unknown[][])
      .map((call) => call[0] as RecordMap)
      .find((payload) => payload.postCommitStatus === 'partial_failure');

    expect(partialFailureUpdate).toBeDefined();
    expect(partialFailureUpdate).toEqual(
      expect.objectContaining({
        postCommitStatus: 'partial_failure',
        postCommitFailedOperations: expect.arrayContaining(['syncMedications']),
        postCommitRetryEligible: true,
        postCommitCompletedAt: { __op: 'delete' },
        postCommitCompletedOperations: expect.objectContaining({ __op: 'arrayUnion' }),
        postCommitOperationAttempts: expect.objectContaining({ syncMedications: 1 }),
        postCommitOperationNextRetryAt: expect.objectContaining({
          syncMedications: expect.objectContaining({
            toDate: expect.any(Function),
          }),
        }),
      }),
    );
    expect(partialFailureUpdate?.postCommitLastAttemptAt).toBeDefined();
  });

  it('promotes continued medications into sync payload when missing from extraction arrays', async () => {
    const harness = buildHarness({ autoShareWithCaregivers: false });
    firestoreMock.mockImplementation(() => harness.db);

    mockedGetOpenAIService.mockReturnValue({
      summarizeTranscript: jest.fn(async () => ({
        summary: 'Medication review completed.',
        diagnoses: ['Hypertension'],
        diagnosesDetailed: [],
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        imaging: [],
        testsOrdered: [],
        nextSteps: ['Continue current treatment'],
        followUps: [],
        medicationReview: {
          reviewed: true,
          continued: [
            {
              name: 'Lisinopril',
              dose: '10 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
          continuedReviewed: [],
          adherenceConcerns: [],
          reviewConcerns: [],
          sideEffectsDiscussed: [],
          followUpNeeded: false,
          notes: [],
        },
        education: {
          diagnoses: [],
          medications: [],
        },
        extractionVersion: 'v2_structured',
        promptMeta: {
          promptVersion: 'test',
          schemaVersion: 'test',
          responseFormat: 'json_object',
          model: 'test-model',
        },
      })),
    });

    await summarizeVisit({
      visitRef: {
        id: 'visit-3',
        update: jest.fn(async () => undefined),
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Continue lisinopril 10 mg daily.',
        visitDate: makeTimestamp('2026-02-11T19:30:00.000Z'),
      },
    });

    const syncArg = mockedSyncMedicationsFromSummary.mock.calls[0]?.[0];
    expect(syncArg).toBeDefined();
    expect(syncArg.medications.started).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Lisinopril',
          dose: '10 mg',
          frequency: 'daily',
        }),
      ]),
    );
    expect(syncArg.medications.changed).toEqual([]);
  });

  it('promotes continued medications to changed when existing medication is inactive', async () => {
    const harness = buildHarness({
      autoShareWithCaregivers: false,
      existingMedications: [
        {
          name: 'Lisinopril',
          canonicalName: 'lisinopril',
          nameLower: 'lisinopril',
          active: false,
          dose: '10 mg',
          frequency: 'daily',
        },
      ],
    });
    firestoreMock.mockImplementation(() => harness.db);

    mockedGetOpenAIService.mockReturnValue({
      summarizeTranscript: jest.fn(async () => ({
        summary: 'Medication review completed.',
        diagnoses: ['Hypertension'],
        diagnosesDetailed: [],
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        imaging: [],
        testsOrdered: [],
        nextSteps: ['Continue current treatment'],
        followUps: [],
        medicationReview: {
          reviewed: true,
          continued: [
            {
              name: 'Lisinopril',
              dose: '10 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
          continuedReviewed: [],
          adherenceConcerns: [],
          reviewConcerns: [],
          sideEffectsDiscussed: [],
          followUpNeeded: false,
          notes: [],
        },
        education: {
          diagnoses: [],
          medications: [],
        },
        extractionVersion: 'v2_structured',
        promptMeta: {
          promptVersion: 'test',
          schemaVersion: 'test',
          responseFormat: 'json_object',
          model: 'test-model',
        },
      })),
    });

    await summarizeVisit({
      visitRef: {
        id: 'visit-4',
        update: jest.fn(async () => undefined),
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Restart lisinopril 10 mg daily.',
        visitDate: makeTimestamp('2026-02-11T19:40:00.000Z'),
      },
    });

    const syncArg = mockedSyncMedicationsFromSummary.mock.calls[0]?.[0];
    expect(syncArg).toBeDefined();
    expect(syncArg.medications.started).toEqual([]);
    expect(syncArg.medications.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Lisinopril',
          dose: '10 mg',
          frequency: 'daily',
        }),
      ]),
    );
  });

  it('promotes continued medications to changed when active medication dose changes', async () => {
    const harness = buildHarness({
      autoShareWithCaregivers: false,
      existingMedications: [
        {
          name: 'Metformin',
          canonicalName: 'metformin',
          nameLower: 'metformin',
          active: true,
          dose: '500 mg',
          frequency: 'daily',
        },
      ],
    });
    firestoreMock.mockImplementation(() => harness.db);

    mockedGetOpenAIService.mockReturnValue({
      summarizeTranscript: jest.fn(async () => ({
        summary: 'Medication review completed.',
        diagnoses: ['Diabetes mellitus'],
        diagnosesDetailed: [],
        medications: {
          started: [],
          stopped: [],
          changed: [],
        },
        imaging: [],
        testsOrdered: [],
        nextSteps: ['Continue current treatment'],
        followUps: [],
        medicationReview: {
          reviewed: true,
          continued: [
            {
              name: 'Metformin',
              dose: '1000 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
          continuedReviewed: [],
          adherenceConcerns: [],
          reviewConcerns: [],
          sideEffectsDiscussed: [],
          followUpNeeded: false,
          notes: [],
        },
        education: {
          diagnoses: [],
          medications: [],
        },
        extractionVersion: 'v2_structured',
        promptMeta: {
          promptVersion: 'test',
          schemaVersion: 'test',
          responseFormat: 'json_object',
          model: 'test-model',
        },
      })),
    });

    await summarizeVisit({
      visitRef: {
        id: 'visit-5',
        update: jest.fn(async () => undefined),
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Continue metformin but increase to 1000 mg daily.',
        visitDate: makeTimestamp('2026-02-11T19:50:00.000Z'),
      },
    });

    const syncArg = mockedSyncMedicationsFromSummary.mock.calls[0]?.[0];
    expect(syncArg).toBeDefined();
    expect(syncArg.medications.started).toEqual([]);
    expect(syncArg.medications.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Metformin',
          dose: '1000 mg',
          frequency: 'daily',
        }),
      ]),
    );
  });

  it('handles started/changed/stopped and keeps unchanged continued meds as review-only', async () => {
    const harness = buildHarness({
      autoShareWithCaregivers: false,
      existingMedications: [
        {
          name: 'Metformin',
          canonicalName: 'metformin',
          nameLower: 'metformin',
          active: true,
          dose: '500 mg',
          frequency: 'daily',
        },
      ],
    });
    firestoreMock.mockImplementation(() => harness.db);

    mockedGetOpenAIService.mockReturnValue({
      summarizeTranscript: jest.fn(async () => ({
        summary: 'Medication plan updated.',
        diagnoses: ['Diabetes mellitus', 'Hypertension'],
        diagnosesDetailed: [],
        medications: {
          started: [
            {
              name: 'Jardiance',
              dose: '10 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
          stopped: [
            {
              name: 'Aspirin',
              dose: '81 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
          changed: [
            {
              name: 'Lisinopril',
              dose: '20 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
        },
        imaging: [],
        testsOrdered: [],
        nextSteps: ['Continue medications as discussed'],
        followUps: [],
        medicationReview: {
          reviewed: true,
          continued: [
            {
              name: 'Metformin',
              dose: '500 mg',
              frequency: 'daily',
              needsConfirmation: false,
              status: 'matched',
            },
          ],
          continuedReviewed: [],
          adherenceConcerns: [],
          reviewConcerns: [],
          sideEffectsDiscussed: [],
          followUpNeeded: false,
          notes: [],
        },
        education: {
          diagnoses: [],
          medications: [],
        },
        extractionVersion: 'v2_structured',
        promptMeta: {
          promptVersion: 'test',
          schemaVersion: 'test',
          responseFormat: 'json_object',
          model: 'test-model',
        },
      })),
    });

    await summarizeVisit({
      visitRef: {
        id: 'visit-6',
        update: jest.fn(async () => undefined),
      } as unknown as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
      visitData: {
        userId: 'user-1',
        transcriptText: 'Started Jardiance, increased lisinopril, stopped aspirin, continue metformin.',
        visitDate: makeTimestamp('2026-02-11T20:00:00.000Z'),
      },
    });

    const syncArg = mockedSyncMedicationsFromSummary.mock.calls[0]?.[0];
    expect(syncArg).toBeDefined();
    expect(syncArg.medications.started).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Jardiance',
          dose: '10 mg',
          frequency: 'daily',
        }),
      ]),
    );
    expect(syncArg.medications.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Lisinopril',
          dose: '20 mg',
          frequency: 'daily',
        }),
      ]),
    );
    expect(syncArg.medications.stopped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Aspirin',
          dose: '81 mg',
          frequency: 'daily',
        }),
      ]),
    );
    expect(syncArg.medications.started).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Metformin',
        }),
      ]),
    );
    expect(syncArg.medications.changed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Metformin',
        }),
      ]),
    );
  });
});
