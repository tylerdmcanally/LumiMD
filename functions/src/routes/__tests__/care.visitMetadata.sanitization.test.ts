import * as admin from 'firebase-admin';

jest.mock('../../middlewares/caregiverAccess', () => ({
  ensureCaregiverAccessOrReject: jest.fn(async () => true),
}));

import { careRouter } from '../care';

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

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'visits') {
        return {
          doc: jest.fn((id: string) => ({
            id,
            get: jest.fn(async () => ({
              exists: !!state.visits[id],
              id,
              data: () => state.visits[id],
            })),
            update: jest.fn(async (updates: RecordMap) => {
              if (!state.visits[id]) {
                throw new Error(`Visit not found: ${id}`);
              }
              state.visits[id] = {
                ...state.visits[id],
                ...updates,
              };
            }),
          })),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Record<string, unknown>) {
  const req: any = {
    user: { uid: 'caregiver-1' },
    params: { patientId: 'patient-1', visitId: 'visit-1' },
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

function getRouteHandler(method: 'patch', path: string) {
  const layer = careRouter.stack.find(
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

describe('care visit metadata sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).FieldValue = {
      serverTimestamp: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
    };
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-20T12:00:00.000Z')),
      fromDate: (date: Date) => makeTimestamp(date),
    };
  });

  it('sanitizes metadata fields before persisting visit updates', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'patient-1',
          provider: null,
          specialty: null,
          location: null,
          updatedAt: makeTimestamp('2026-02-10T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/:patientId/visits/:visitId');
    const req = createRequest({
      body: {
        provider: '  <script>alert("x")</script>Dr. <b>Smith</b>  ',
        specialty: '  <img src=x onerror=1>Cardiology  ',
        location: '  <div>Main <i>Campus</i></div>  ',
        visitDate: '2026-02-15T09:00:00.000Z',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.visits['visit-1']).toMatchObject({
      provider: 'Dr. Smith',
      specialty: 'Cardiology',
      location: 'Main Campus',
      lastEditedBy: 'caregiver-1',
    });
    expect(res.body).toMatchObject({
      id: 'visit-1',
      provider: 'Dr. Smith',
      specialty: 'Cardiology',
      location: 'Main Campus',
      visitDate: '2026-02-15T09:00:00.000Z',
    });
  });

  it('normalizes empty sanitized metadata to null and enforces max length', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          userId: 'patient-1',
          provider: 'Existing Provider',
          specialty: 'Existing Specialty',
          location: 'Existing Location',
          updatedAt: makeTimestamp('2026-02-10T12:00:00.000Z'),
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const longSpecialty = 'x'.repeat(500);
    const handler = getRouteHandler('patch', '/:patientId/visits/:visitId');
    const req = createRequest({
      body: {
        provider: ' <script>alert(1)</script> ',
        specialty: longSpecialty,
        location: '   <b></b>   ',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.visits['visit-1'].provider).toBeNull();
    expect(harness.state.visits['visit-1'].location).toBeNull();
    expect(harness.state.visits['visit-1'].specialty).toHaveLength(256);
    expect(res.body).toMatchObject({
      provider: null,
      location: null,
      specialty: 'x'.repeat(256),
    });
  });
});
