import * as admin from 'firebase-admin';
import { nudgesRouter } from '../nudges';
import { getLumiBotAIService } from '../../services/lumibotAI';

jest.mock('../../services/lumibotAnalyzer', () => ({
  getActiveNudgesForUser: jest.fn(async () => []),
  completeNudge: jest.fn(async () => undefined),
  snoozeNudge: jest.fn(async () => undefined),
  dismissNudge: jest.fn(async () => undefined),
}));

jest.mock('../../services/lumibotAI', () => ({
  getLumiBotAIService: jest.fn(),
}));

jest.mock('../../services/patientContextAggregator', () => ({
  getPatientContext: jest.fn(async () => null),
}));

jest.mock('../../services/nudgeNotificationService', () => ({
  processAndNotifyDueNudges: jest.fn(async () => ({
    processed: 0,
    notified: 0,
    failed: 0,
  })),
}));

type RecordMap = Record<string, unknown>;

type HarnessState = {
  nudges: Record<string, RecordMap>;
};

function buildHarness(initial?: Partial<HarnessState>) {
  const state: HarnessState = {
    nudges: { ...(initial?.nudges ?? {}) },
  };

  const makeNudgeDocRef = (nudgeId: string): any => ({
    id: nudgeId,
    get: jest.fn(async () => ({
      exists: !!state.nudges[nudgeId],
      id: nudgeId,
      data: () => state.nudges[nudgeId],
    })),
    update: jest.fn(async (updates: RecordMap) => {
      if (!state.nudges[nudgeId]) {
        return;
      }
      state.nudges[nudgeId] = {
        ...state.nudges[nudgeId],
        ...updates,
      };
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'nudges') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return {
        doc: jest.fn((nudgeId: string) => makeNudgeDocRef(nudgeId)),
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
  const layer = nudgesRouter.stack.find(
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

describe('nudges input sanitization', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetLumiBotAIService = getLumiBotAIService as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: () => ({
        toDate: () => new Date('2026-02-22T12:00:00.000Z'),
        toMillis: () => new Date('2026-02-22T12:00:00.000Z').getTime(),
      }),
      fromDate: (value: Date) => ({
        toDate: () => value,
        toMillis: () => value.getTime(),
      }),
    };
    mockedGetLumiBotAIService.mockReturnValue({
      interpretUserResponse: jest.fn(async () => ({
        sentiment: 'neutral',
        summary: 'neutral summary',
        followUpNeeded: false,
      })),
    });
  });

  it('sanitizes note and side-effect list on structured nudge responses', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-1': {
          userId: 'user-1',
          type: 'medication_check',
          status: 'pending',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/respond');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'nudge-1' },
      body: {
        response: 'okay',
        note: '  <script>alert(1)</script> feeling <b>off</b> ',
        sideEffects: [
          '  <img src=x onerror=alert(1)> nausea ',
          '<script>alert(2)</script>',
          ' dizziness ',
        ],
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-1']).toMatchObject({
      status: 'completed',
      responseValue: {
        response: 'okay',
        note: 'feeling off',
        sideEffects: ['nausea', 'dizziness'],
      },
    });
  });

  it('sanitizes free-text responses before AI interpretation and completion payloads', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-2': {
          userId: 'user-1',
          type: 'feeling_check',
          status: 'pending',
          message: 'How are you feeling?',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/respond-text');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'nudge-2' },
      body: {
        text: '  <script>alert(1)</script> I feel <b>better</b> today ',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(harness.state.nudges['nudge-2']).toMatchObject({
      status: 'completed',
      responseValue: expect.objectContaining({
        freeTextResponse: 'I feel better today',
        aiInterpretation: expect.objectContaining({
          sentiment: 'neutral',
        }),
      }),
    });
    const aiService = mockedGetLumiBotAIService.mock.results[0]
      .value as { interpretUserResponse: jest.Mock };
    expect(aiService.interpretUserResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        userResponse: 'I feel better today',
      }),
    );
  });

  it('rejects free-text responses when sanitized text is empty', async () => {
    const harness = buildHarness({
      nudges: {
        'nudge-3': {
          userId: 'user-1',
          type: 'feeling_check',
          status: 'pending',
          message: 'How are you feeling?',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/:id/respond-text');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'nudge-3' },
      body: {
        text: '<script>alert(1)</script>',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Response text is required',
    });
    expect(harness.state.nudges['nudge-3']).toMatchObject({
      status: 'pending',
    });
  });
});
