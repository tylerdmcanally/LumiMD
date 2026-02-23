import * as admin from 'firebase-admin';
import { healthLogsRouter } from '../healthLogs';
import {
  checkHealthValue,
  screenForEmergencySymptoms,
} from '../../services/safetyChecker';

jest.mock('../../services/safetyChecker', () => ({
  checkHealthValue: jest.fn(() => ({
    alertLevel: 'normal',
    message: 'ok',
    shouldShowAlert: false,
  })),
  screenForEmergencySymptoms: jest.fn(() => ({
    isEmergency: false,
    matchedSymptoms: [],
    message: '',
  })),
}));

jest.mock('../../services/healthLogDedupService', () => ({
  resolveHealthLogDedupAction: jest.fn(() => 'return_existing'),
}));

jest.mock('../../services/lumibotAnalyzer', () => ({
  completeNudge: jest.fn(async () => undefined),
  createFollowUpNudge: jest.fn(async () => undefined),
  createInsightNudge: jest.fn(async () => undefined),
}));

jest.mock('../../services/trendAnalyzer', () => ({
  getPrimaryInsight: jest.fn(() => null),
}));

jest.mock('../../triggers/personalRNEvaluation', () => ({
  escalatePatientFrequency: jest.fn(async () => undefined),
}));

type RecordMap = Record<string, unknown>;

type HarnessState = {
  healthLogs: Record<string, RecordMap>;
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
    healthLogs: { ...(initial?.healthLogs ?? {}) },
  };

  let nextLogId = 1;

  const buildHealthLogsQuery = (
    filters: Array<{ field: string; value: unknown }> = [],
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildHealthLogsQuery([...filters, { field, value }]),
    ),
    limit: jest.fn(() => ({
      get: jest.fn(async () => {
        const docs = Object.entries(state.healthLogs)
          .filter(([, healthLog]) =>
            filters.every((filter) => healthLog[filter.field] === filter.value),
          )
          .map(([id, healthLog]) => ({
            id,
            data: () => healthLog,
            ref: {
              id,
              update: jest.fn(async (updates: RecordMap) => {
                state.healthLogs[id] = {
                  ...state.healthLogs[id],
                  ...updates,
                };
              }),
            },
          }));
        return makeQuerySnapshot(docs);
      }),
    })),
    orderBy: jest.fn(() => buildHealthLogsQuery(filters)),
    get: jest.fn(async () => {
      const docs = Object.entries(state.healthLogs)
        .filter(([, healthLog]) =>
          filters.every((filter) => healthLog[filter.field] === filter.value),
        )
        .map(([id, healthLog]) => ({
          id,
          data: () => healthLog,
        }));
      return makeQuerySnapshot(docs);
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'healthLogs') {
        throw new Error(`Unknown collection: ${name}`);
      }

      return {
        add: jest.fn(async (payload: RecordMap) => {
          const id = `health-log-${nextLogId++}`;
          state.healthLogs[id] = payload;
          return { id };
        }),
        where: jest.fn((field: string, _operator: string, value: unknown) =>
          buildHealthLogsQuery([{ field, value }]),
        ),
      };
    }),
  };

  return { state, db };
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
  const layer = healthLogsRouter.stack.find(
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

describe('health logs input sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedCheckHealthValue = checkHealthValue as unknown as jest.Mock;
  const mockedScreenForEmergencySymptoms =
    screenForEmergencySymptoms as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('sanitizes symptom-check text fields and symptom arrays before safety checks and persistence', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {
        type: 'symptom_check',
        value: {
          breathingDifficulty: 3,
          swelling: 'moderate',
          swellingLocations: [
            '  <b>ankles</b>  ',
            '<script>alert(1)</script>',
            ' feet ',
          ],
          energyLevel: 2,
          cough: true,
          orthopnea: true,
          otherSymptoms: ' <img src=x onerror=alert(1)> dizziness ',
        },
        symptoms: [
          '  chest <b>tightness</b>  ',
          '<script>alert(1)</script>',
          ' shortness <i>of</i> breath ',
        ],
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(mockedCheckHealthValue).toHaveBeenCalledWith(
      'symptom_check',
      expect.objectContaining({
        swellingLocations: ['ankles', 'feet'],
        otherSymptoms: 'dizziness',
      }),
      true,
      ['chest tightness', 'shortness of breath'],
    );
    expect(mockedScreenForEmergencySymptoms).toHaveBeenCalledWith([
      'chest tightness',
      'shortness of breath',
    ]);
    expect(res.body).toMatchObject({
      type: 'symptom_check',
      value: expect.objectContaining({
        swellingLocations: ['ankles', 'feet'],
        otherSymptoms: 'dizziness',
      }),
    });
    expect(harness.state.healthLogs['health-log-1']).toMatchObject({
      type: 'symptom_check',
      value: expect.objectContaining({
        swellingLocations: ['ankles', 'feet'],
        otherSymptoms: 'dizziness',
      }),
    });
  });
});
