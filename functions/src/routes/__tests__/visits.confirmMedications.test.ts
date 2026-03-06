import * as admin from 'firebase-admin';
import { visitsRouter } from '../visits';
import { syncMedicationsFromSummary } from '../../services/medicationSync';
import {
  runMedicationSafetyChecks,
  addSafetyWarningsToEntry,
} from '../../services/medicationSafety';

jest.mock('../../services/medicationSync', () => ({
  normalizeMedicationSummary: jest.fn((input: unknown) =>
    input ?? { started: [], stopped: [], changed: [] },
  ),
  syncMedicationsFromSummary: jest.fn(async () => undefined),
  computePendingMedicationChanges: jest.fn(async () => undefined),
}));

jest.mock('../../services/medicationSafety', () => ({
  runMedicationSafetyChecks: jest.fn(async () => []),
  addSafetyWarningsToEntry: jest.fn((entry: unknown) => entry),
}));

type RecordMap = Record<string, any>;

type HarnessState = {
  visits: Record<string, RecordMap>;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    visits: { ...(initial?.visits ?? {}) },
  };

  const makeVisitDocRef = (visitId: string) => ({
    id: visitId,
    path: `visits/${visitId}`,
    get: jest.fn(async () => ({
      exists: Boolean(state.visits[visitId]),
      id: visitId,
      data: () => state.visits[visitId],
    })),
    update: jest.fn(async (payload: RecordMap) => {
      const current = state.visits[visitId];
      if (!current) {
        throw new Error(`Visit not found: ${visitId}`);
      }

      const next = { ...current };
      Object.entries(payload).forEach(([key, value]) => {
        if (value && typeof value === 'object' && (value as any).__op === 'delete') {
          delete next[key];
          return;
        }
        next[key] = value;
      });
      state.visits[visitId] = next;
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'visits') {
        return {
          doc: jest.fn((visitId: string) => makeVisitDocRef(visitId)),
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'user-1' },
    body: {},
    params: { id: 'visit-1' },
    headers: {},
    ip: '127.0.0.1',
    query: {},
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
    get(name: string) {
      return this.header(name);
    },
  };

  return {
    ...req,
    ...overrides,
  };
}

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function getRouteHandler(method: 'post', path: string) {
  const layer = visitsRouter.stack.find(
    (stackLayer: any) =>
      stackLayer.route &&
      stackLayer.route.path === path &&
      stackLayer.route.methods &&
      stackLayer.route.methods[method],
  );

  const route = layer?.route;
  if (!route || !Array.isArray(route.stack) || route.stack.length === 0) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  return route.stack[route.stack.length - 1].handle;
}

describe('visits confirm-medications route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedSyncMedicationsFromSummary = syncMedicationsFromSummary as jest.Mock;
  const mockedRunMedicationSafetyChecks = runMedicationSafetyChecks as jest.Mock;
  const mockedAddSafetyWarningsToEntry = addSafetyWarningsToEntry as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
    };
    (firestoreMock as any).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
    };

    mockedRunMedicationSafetyChecks.mockResolvedValue([]);
    mockedAddSafetyWarningsToEntry.mockImplementation((entry: unknown) => entry);
    mockedSyncMedicationsFromSummary.mockResolvedValue(undefined);
  });

  it('confirms pending medication changes and commits to medication list', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          pendingMedicationChanges: {
            started: [{ name: 'Metformin', dose: '500 mg', frequency: 'twice daily' }],
            stopped: [],
            changed: [],
          },
          processedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
      body: {
        medications: {
          started: [{ name: 'Metformin', dose: '500 mg', frequency: 'twice daily', confirmed: true }],
          stopped: [],
          changed: [],
        },
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      confirmedCount: 1,
    });

    // Verify safety checks were run on started entries
    expect(mockedRunMedicationSafetyChecks).toHaveBeenCalledTimes(1);
    expect(mockedRunMedicationSafetyChecks).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Metformin' }),
      { useAI: false },
    );

    // Verify medications were synced
    expect(mockedSyncMedicationsFromSummary).toHaveBeenCalledTimes(1);
    expect(mockedSyncMedicationsFromSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        visitId: 'visit-1',
        medications: expect.objectContaining({
          started: expect.arrayContaining([
            expect.objectContaining({ name: 'Metformin' }),
          ]),
        }),
      }),
    );

    // Verify visit was updated to confirmed
    expect(harness.state.visits['visit-1'].medicationConfirmationStatus).toBe('confirmed');
    expect(harness.state.visits['visit-1'].medicationConfirmedAt).toBeDefined();
    expect(harness.state.visits['visit-1'].confirmedMedicationChanges).toBeDefined();
  });

  it('filters out unconfirmed entries and only commits confirmed ones', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          pendingMedicationChanges: {
            started: [
              { name: 'Metformin', dose: '500 mg', frequency: 'daily' },
              { name: 'Lisinopril', dose: '10 mg', frequency: 'daily' },
            ],
            stopped: [{ name: 'Aspirin' }],
            changed: [],
          },
          processedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
      body: {
        medications: {
          started: [
            { name: 'Metformin', dose: '500 mg', frequency: 'daily', confirmed: true },
            { name: 'Lisinopril', dose: '10 mg', frequency: 'daily', confirmed: false },
          ],
          stopped: [{ name: 'Aspirin', confirmed: false }],
          changed: [],
        },
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.confirmedCount).toBe(1);

    // Only Metformin should have safety checks (Lisinopril was unconfirmed)
    expect(mockedRunMedicationSafetyChecks).toHaveBeenCalledTimes(1);

    // Sync should only include confirmed Metformin
    const syncCall = mockedSyncMedicationsFromSummary.mock.calls[0]?.[0];
    expect(syncCall.medications.started).toHaveLength(1);
    expect(syncCall.medications.started[0].name).toBe('Metformin');
    expect(syncCall.medications.stopped).toHaveLength(0);
  });

  it('skips sync when zero entries are confirmed', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          pendingMedicationChanges: {
            started: [{ name: 'Metformin', dose: '500 mg', frequency: 'daily' }],
            stopped: [],
            changed: [],
          },
          processedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
      body: {
        medications: {
          started: [{ name: 'Metformin', dose: '500 mg', frequency: 'daily', confirmed: false }],
          stopped: [],
          changed: [],
        },
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.confirmedCount).toBe(0);
    // No sync should occur when nothing is confirmed
    expect(mockedSyncMedicationsFromSummary).not.toHaveBeenCalled();
    // Visit should still be marked as confirmed
    expect(harness.state.visits['visit-1'].medicationConfirmationStatus).toBe('confirmed');
  });

  it('returns 404 when visit does not exist', async () => {
    const harness = buildHarness({ visits: {} });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'nonexistent' },
      user: { uid: 'user-1' },
      body: { medications: { started: [], stopped: [], changed: [] } },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('returns 403 when user does not own the visit', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'other-user',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
      body: { medications: { started: [], stopped: [], changed: [] } },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when visit is already confirmed', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'confirmed',
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
      body: { medications: { started: [], stopped: [], changed: [] } },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('not_pending');
    expect(res.body.message).toContain('already been confirmed');
  });

  it('returns 400 for invalid request body', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/confirm-medications');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
      body: { invalid: 'payload' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('visits skip-medication-confirmation route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
    };
    (firestoreMock as any).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
    };
  });

  it('marks visit as skipped without committing medications', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          pendingMedicationChanges: {
            started: [{ name: 'Metformin' }],
            stopped: [],
            changed: [],
          },
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/skip-medication-confirmation');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(harness.state.visits['visit-1'].medicationConfirmationStatus).toBe('skipped');
    expect(harness.state.visits['visit-1'].medicationConfirmedAt).toBeDefined();
    expect(harness.state.visits['visit-1'].confirmedMedicationChanges).toEqual({
      started: [],
      stopped: [],
      changed: [],
    });
  });

  it('returns 404 when visit does not exist', async () => {
    const harness = buildHarness({ visits: {} });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/skip-medication-confirmation');
    const req = createRequest({
      params: { id: 'nonexistent' },
      user: { uid: 'user-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('returns 409 when visit is not in pending state', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'user-1',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'confirmed',
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/skip-medication-confirmation');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('not_pending');
  });

  it('returns 403 when user does not own the visit', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'other-user',
          processingStatus: 'completed',
          medicationConfirmationStatus: 'pending',
          deletedAt: null,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/skip-medication-confirmation');
    const req = createRequest({
      params: { id: 'visit-1' },
      user: { uid: 'user-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
  });
});
