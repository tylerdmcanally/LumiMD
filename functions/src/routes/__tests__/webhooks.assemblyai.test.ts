import * as admin from 'firebase-admin';
import { webhooksRouter } from '../webhooks';
import { getAssemblyAIService } from '../../services/assemblyai';

jest.mock('../../services/assemblyai', () => ({
  getAssemblyAIService: jest.fn(),
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

  const buildVisitsQuery = (
    filters: Array<{ field: string; value: unknown }>,
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, _operator: string, value: unknown) =>
      buildVisitsQuery([...filters, { field, value }], limitValue),
    ),
    limit: jest.fn((nextLimit: number) => buildVisitsQuery(filters, nextLimit)),
    get: jest.fn(async () => {
      const docs = Object.entries(state.visits)
        .filter(([, visit]) =>
          filters.every((filter) => visit[filter.field] === filter.value),
        )
        .slice(0, limitValue ?? Number.MAX_SAFE_INTEGER)
        .map(([id, visit]) => ({
          id,
          data: () => visit,
          ref: makeVisitDocRef(id),
        }));
      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
      };
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'visits') {
        return {
          where: jest.fn((field: string, _operator: string, value: unknown) =>
            buildVisitsQuery([{ field, value }]),
          ),
        };
      }
      throw new Error(`Unknown collection: ${name}`);
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    body: {},
    headers: {},
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
  const layer = webhooksRouter.stack.find(
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

describe('assemblyai webhook route', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-11T20:00:00.000Z')),
    };
    (firestoreMock as any).FieldValue = {
      delete: jest.fn(() => ({ __op: 'delete' })),
    };
  });

  it('moves matching transcribing visit to summarizing on completed webhook', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          transcriptionId: 'transcript-abc',
          processingStatus: 'transcribing',
          userId: 'user-1',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    (getAssemblyAIService as jest.Mock).mockReturnValue({
      getTranscript: jest.fn(async () => ({
        status: 'completed',
        text: 'Webhook transcript text',
        utterances: [],
      })),
      formatTranscript: jest.fn(() => 'Speaker 1: Webhook transcript text'),
    });

    const handler = getRouteHandler('post', '/assemblyai/transcription-complete');
    const req = createRequest({
      body: {
        transcript_id: 'transcript-abc',
        status: 'completed',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(harness.state.visits['visit-1'].processingStatus).toBe('summarizing');
    expect(harness.state.visits['visit-1'].webhookTriggered).toBe(true);
    expect(harness.state.visits['visit-1'].transcript).toBe(
      'Speaker 1: Webhook transcript text',
    );
  });

  it('returns already-processed response when no matching transcribing visit exists', async () => {
    const harness = buildHarness({
      visits: {
        'visit-1': {
          transcriptionId: 'transcript-abc',
          processingStatus: 'completed',
          userId: 'user-1',
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/assemblyai/transcription-complete');
    const req = createRequest({
      body: {
        transcript_id: 'transcript-abc',
        status: 'completed',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Already processed or not found',
    });
  });
});
