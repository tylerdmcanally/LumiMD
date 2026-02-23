import * as admin from 'firebase-admin';
import { medicationsRouter } from '../medications';
import {
  runMedicationSafetyChecks,
  normalizeMedicationName,
} from '../../services/medicationSafety';
import { clearMedicationSafetyCacheForUser } from '../../services/medicationSafetyAI';
import { resolveReminderTimingPolicy } from '../../utils/medicationReminderTiming';

jest.mock('../../services/medicationSafety', () => ({
  runMedicationSafetyChecks: jest.fn(async () => []),
  normalizeMedicationName: jest.fn((name: string) => name.toLowerCase()),
}));

jest.mock('../../services/medicationSafetyAI', () => ({
  clearMedicationSafetyCacheForUser: jest.fn(async () => undefined),
}));

jest.mock('../../utils/medicationReminderTiming', () => ({
  resolveReminderTimingPolicy: jest.fn(() => ({
    timingMode: 'fixed',
    anchorTimezone: 'America/Chicago',
    criticality: 'routine',
  })),
}));

type RecordMap = Record<string, any>;

type HarnessState = {
  users: Record<string, RecordMap>;
  medications: Record<string, RecordMap>;
  medicationReminders: Record<string, RecordMap>;
};

type QueryFilter = {
  field: string;
  value: unknown;
};

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function makeQuerySnapshot(docs: any[]) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    users: { ...(initial?.users ?? {}) },
    medications: { ...(initial?.medications ?? {}) },
    medicationReminders: { ...(initial?.medicationReminders ?? {}) },
  };

  const counters = {
    medications: Object.keys(state.medications).length,
    medicationReminders: Object.keys(state.medicationReminders).length,
  };

  const makeDocRef = (
    collection: 'medications' | 'medicationReminders',
    id: string,
  ): any => {
    const docRef: any = {
      id,
      __collection: collection,
      path: `${collection}/${id}`,
    };

    docRef.get = jest.fn(async () => ({
      exists: Boolean(state[collection][id]),
      id,
      data: () => state[collection][id],
      ref: docRef,
    }));

    docRef.update = jest.fn(async (updates: RecordMap) => {
      if (!state[collection][id]) {
        throw new Error(`Document not found: ${collection}/${id}`);
      }
      state[collection][id] = {
        ...state[collection][id],
        ...updates,
      };
    });

    docRef.set = jest.fn(async (value: RecordMap, options?: { merge?: boolean }) => {
      if (options?.merge && state[collection][id]) {
        state[collection][id] = {
          ...state[collection][id],
          ...value,
        };
        return;
      }
      state[collection][id] = { ...value };
    });

    return docRef;
  };

  const buildReminderQuery = (filters: QueryFilter[] = []): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildReminderQuery([...filters, { field, value }]),
    ),
    get: jest.fn(async () => {
      const docs = Object.entries(state.medicationReminders)
        .filter(([, row]) =>
          filters.every((filter) => {
            if (filter.value === null) {
              return row[filter.field] == null;
            }
            return row[filter.field] === filter.value;
          }),
        )
        .map(([id, row]) => ({
          id,
          data: () => row,
          ref: makeDocRef('medicationReminders', id),
        }));

      return makeQuerySnapshot(docs);
    }),
  });

  const batchOperations: Array<() => void> = [];
  const batch = {
    update: jest.fn((ref: { __collection: 'medications' | 'medicationReminders'; id: string }, updates: RecordMap) => {
      batchOperations.push(() => {
        if (!state[ref.__collection][ref.id]) {
          throw new Error(`Document not found: ${ref.__collection}/${ref.id}`);
        }
        state[ref.__collection][ref.id] = {
          ...state[ref.__collection][ref.id],
          ...updates,
        };
      });
    }),
    commit: jest.fn(async () => {
      for (const apply of batchOperations.splice(0, batchOperations.length)) {
        apply();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/${id}`,
            get: jest.fn(async () => ({
              exists: Boolean(state.users[id]),
              id,
              data: () => state.users[id],
            })),
          })),
        };
      }

      if (name === 'medications') {
        return {
          add: jest.fn(async (value: RecordMap) => {
            counters.medications += 1;
            const id = `med-${counters.medications}`;
            state.medications[id] = { ...value };
            return makeDocRef('medications', id);
          }),
          doc: jest.fn((id: string) => makeDocRef('medications', id)),
        };
      }

      if (name === 'medicationReminders') {
        return {
          add: jest.fn(async (value: RecordMap) => {
            counters.medicationReminders += 1;
            const id = `rem-${counters.medicationReminders}`;
            state.medicationReminders[id] = { ...value };
            return makeDocRef('medicationReminders', id);
          }),
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildReminderQuery([{ field, value }]),
          ),
          doc: jest.fn((id: string) => makeDocRef('medicationReminders', id)),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => batch),
  };

  return { state, db, batch };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'user-1' },
    params: {},
    body: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
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
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
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

function getRouteHandler(method: 'post' | 'patch', path: string) {
  const layer = medicationsRouter.stack.find(
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

describe('medications core routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedRunMedicationSafetyChecks = runMedicationSafetyChecks as unknown as jest.Mock;
  const mockedNormalizeMedicationName = normalizeMedicationName as unknown as jest.Mock;
  const mockedClearMedicationSafetyCacheForUser =
    clearMedicationSafetyCacheForUser as unknown as jest.Mock;
  const mockedResolveReminderTimingPolicy =
    resolveReminderTimingPolicy as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-24T09:15:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
    mockedRunMedicationSafetyChecks.mockResolvedValue([]);
    mockedNormalizeMedicationName.mockImplementation((value: string) => value.toLowerCase());
    mockedResolveReminderTimingPolicy.mockReturnValue({
      timingMode: 'fixed',
      anchorTimezone: 'America/Chicago',
      criticality: 'routine',
    });
    mockedClearMedicationSafetyCacheForUser.mockResolvedValue(undefined);
  });

  it('creates medication with sanitized fields and an auto reminder', async () => {
    mockedRunMedicationSafetyChecks.mockResolvedValueOnce([
      {
        type: 'interaction',
        severity: 'high',
        message: 'Potential interaction',
        details: 'Review with clinician',
        recommendation: 'Consult pharmacist',
      },
    ]);

    const harness = buildHarness({
      users: {
        'user-1': { timezone: 'America/New_York' },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/');
    const req = createRequest({
      body: {
        name: '  <script>x</script>Tacrolimus  ',
        dose: '  1mg  ',
        frequency: 'once daily',
        notes: '  <b>night dose</b>  ',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(mockedRunMedicationSafetyChecks).toHaveBeenCalledWith(
      'user-1',
      {
        name: 'Tacrolimus',
        dose: '1mg',
        frequency: 'once daily',
      },
      { useAI: true },
    );

    const medicationIds = Object.keys(harness.state.medications);
    expect(medicationIds).toHaveLength(1);
    const medication = harness.state.medications[medicationIds[0]];
    expect(medication).toMatchObject({
      userId: 'user-1',
      name: 'Tacrolimus',
      dose: '1mg',
      frequency: 'once daily',
      notes: 'night dose',
      needsConfirmation: true,
      medicationStatus: 'pending_review',
    });

    const reminderIds = Object.keys(harness.state.medicationReminders);
    expect(reminderIds).toHaveLength(1);
    expect(harness.state.medicationReminders[reminderIds[0]]).toMatchObject({
      userId: 'user-1',
      medicationName: 'Tacrolimus',
      medicationDose: '1mg',
      times: ['08:00'],
      enabled: true,
      timingMode: 'fixed',
      anchorTimezone: 'America/Chicago',
      criticality: 'routine',
    });

    expect(mockedResolveReminderTimingPolicy).toHaveBeenCalledWith({
      medicationName: 'Tacrolimus',
      userTimezone: 'America/New_York',
    });
    expect(mockedClearMedicationSafetyCacheForUser).toHaveBeenCalledWith('user-1');
  });

  it('patches medication notes without rerunning safety checks', async () => {
    const nowTimestamp = makeTimestamp('2026-02-23T10:00:00.000Z');
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Metformin',
          dose: '500mg',
          frequency: 'daily',
          notes: 'old note',
          source: 'manual',
          sourceVisitId: null,
          createdAt: nowTimestamp,
          updatedAt: nowTimestamp,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:id');
    const req = createRequest({
      params: { id: 'med-1' },
      body: {
        notes: '  <script>bad</script>updated note  ',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.medications['med-1'].notes).toBe('updated note');
    expect(mockedRunMedicationSafetyChecks).not.toHaveBeenCalled();
    expect(mockedClearMedicationSafetyCacheForUser).toHaveBeenCalledWith('user-1');
  });

  it('acknowledges non-critical warnings', async () => {
    const nowTimestamp = makeTimestamp('2026-02-23T10:00:00.000Z');
    const harness = buildHarness({
      medications: {
        'med-1': {
          userId: 'user-1',
          name: 'Lisinopril',
          medicationWarning: [
            {
              severity: 'moderate',
              message: 'Take with food',
            },
          ],
          warningAcknowledgedAt: null,
          createdAt: nowTimestamp,
          updatedAt: nowTimestamp,
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/acknowledge-warnings');
    const req = createRequest({
      params: { id: 'med-1' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ acknowledged: true });
    expect(harness.state.medications['med-1'].warningAcknowledgedAt).toBeDefined();
  });

  it('runs standalone safety-check and returns safe=false for critical/high warnings', async () => {
    mockedRunMedicationSafetyChecks.mockResolvedValueOnce([
      {
        type: 'allergy',
        severity: 'critical',
        message: 'Known allergy conflict',
        details: 'Allergen match',
        recommendation: 'Do not prescribe',
      },
    ]);

    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/safety-check');
    const req = createRequest({
      body: {
        name: ' <b>Penicillin</b> ',
        dose: ' 250mg ',
        frequency: 'daily',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      medication: {
        name: 'Penicillin',
        dose: '250mg',
        frequency: 'daily',
      },
      safe: false,
    });
    expect(mockedRunMedicationSafetyChecks).toHaveBeenCalledWith('user-1', {
      name: 'Penicillin',
      dose: '250mg',
      frequency: 'daily',
    });
  });
});
