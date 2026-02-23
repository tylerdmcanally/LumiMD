import * as admin from 'firebase-admin';
import {
  createPatientMedicalContext,
  enableTracking,
  getPatientMedicalContext,
  recordTrackingLog,
  updatePatientContextFromVisit,
} from '../patientMedicalContext';

type RecordMap = Record<string, unknown>;

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function createPatientContextServiceMock(overrides: Partial<{
  getForUser: jest.Mock;
  setForUser: jest.Mock;
  updateForUser: jest.Mock;
}> = {}) {
  return {
    getForUser: overrides.getForUser ?? jest.fn().mockResolvedValue(null),
    setForUser: overrides.setForUser ?? jest.fn().mockResolvedValue(undefined),
    updateForUser: overrides.updateForUser ?? jest.fn().mockResolvedValue(undefined),
  };
}

describe('patientMedicalContext repository bridge', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    (firestoreMock as unknown as { Timestamp?: unknown }).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-23T12:00:00.000Z')),
      fromDate: jest.fn((date: Date) => makeTimestamp(date)),
    };
    (firestoreMock as unknown as { FieldValue?: unknown }).FieldValue = {
      arrayUnion: jest.fn((...values: unknown[]) => ({ __op: 'arrayUnion', values })),
    };
  });

  it('loads patient context through patient-context domain dependency', async () => {
    const getForUser = jest.fn().mockResolvedValue({
      id: 'user-1',
      userId: 'user-1',
      conditions: [],
      medications: [],
      activeTracking: [],
      visitHistory: [],
    });
    const service = createPatientContextServiceMock({ getForUser });

    const result = await getPatientMedicalContext('user-1', {
      patientContextService: service,
    });

    expect(getForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
      }),
    );
  });

  it('creates initial context through patient-context domain dependency', async () => {
    const setForUser = jest.fn().mockResolvedValue(undefined);
    const service = createPatientContextServiceMock({ setForUser });

    const context = await createPatientMedicalContext('user-2', {
      patientContextService: service,
    });

    expect(setForUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        userId: 'user-2',
        conditions: [],
        medications: [],
        activeTracking: [],
        visitHistory: [],
      }),
    );
    expect(context.userId).toBe('user-2');
  });

  it('updates context from visit through domain-backed set merge write', async () => {
    const existingContext: RecordMap = {
      id: 'user-3',
      userId: 'user-3',
      conditions: [],
      medications: [],
      activeTracking: [],
      visitHistory: [],
      createdAt: makeTimestamp('2026-02-01T10:00:00.000Z'),
      updatedAt: makeTimestamp('2026-02-01T10:00:00.000Z'),
    };
    const getForUser = jest.fn().mockResolvedValue(existingContext);
    const setForUser = jest.fn().mockResolvedValue(undefined);
    const service = createPatientContextServiceMock({ getForUser, setForUser });

    const context = await updatePatientContextFromVisit(
      'user-3',
      {
        visitId: 'visit-123',
        visitDate: new Date('2026-02-23T09:30:00.000Z'),
        diagnoses: ['Hypertension'],
        medicationsStarted: [{ name: 'Lisinopril', dose: '10 mg', frequency: 'daily' }],
        medicationsChanged: [],
        medicationsStopped: [],
      },
      { patientContextService: service },
    );

    expect(getForUser).toHaveBeenCalledWith('user-3');
    expect(setForUser).toHaveBeenCalledWith(
      'user-3',
      expect.objectContaining({
        userId: 'user-3',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            id: 'hypertension',
            name: 'Hypertension',
          }),
        ]),
        medications: expect.arrayContaining([
          expect.objectContaining({
            id: 'visit-123_Lisinopril',
            name: 'Lisinopril',
          }),
        ]),
      }),
      { merge: true },
    );
    expect(context.visitHistory).toHaveLength(1);
  });

  it('enables tracking through domain-backed partial update', async () => {
    const updateForUser = jest.fn().mockResolvedValue(undefined);
    const service = createPatientContextServiceMock({ updateForUser });

    await enableTracking('user-4', 'bp', 'hypertension', {
      patientContextService: service,
    });

    expect(updateForUser).toHaveBeenCalledWith(
      'user-4',
      expect.objectContaining({
        activeTracking: expect.objectContaining({ __op: 'arrayUnion' }),
      }),
    );
  });

  it('records tracking log by updating activeTracking through domain dependency', async () => {
    const updateForUser = jest.fn().mockResolvedValue(undefined);
    const getForUser = jest.fn().mockResolvedValue({
      id: 'user-5',
      userId: 'user-5',
      conditions: [],
      medications: [],
      activeTracking: [{ type: 'bp', enabledAt: makeTimestamp('2026-02-20T10:00:00.000Z') }],
      visitHistory: [],
    });
    const service = createPatientContextServiceMock({ getForUser, updateForUser });

    await recordTrackingLog('user-5', 'bp', {
      patientContextService: service,
    });

    expect(getForUser).toHaveBeenCalledWith('user-5');
    expect(updateForUser).toHaveBeenCalledWith(
      'user-5',
      expect.objectContaining({
        activeTracking: expect.arrayContaining([
          expect.objectContaining({
            type: 'bp',
            lastLoggedAt: expect.objectContaining({
              toDate: expect.any(Function),
            }),
          }),
        ]),
      }),
    );
  });
});
