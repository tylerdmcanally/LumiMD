import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { escalationIncidentConfig } from '../../config';
import { reportPostCommitEscalations } from '../postCommitEscalationReportingService';

type RecordMap = Record<string, any>;

function makeTimestamp(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
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

function buildHarness(visits: Record<string, RecordMap>) {
  const state = {
    visits: { ...visits },
  };

  const buildQuery = (
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, operator: string, value: unknown) =>
      buildQuery([...filters, { field, operator, value }], orderByField, orderDirection, limitValue),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(filters, field, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(filters, orderByField, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      let docs = Object.entries(state.visits).filter(([, visit]) =>
        filters.every((filter) => {
          const fieldValue = visit[filter.field];
          if (filter.operator === '==') {
            return fieldValue === filter.value;
          }
          if (filter.operator === '!=') {
            return fieldValue !== filter.value && fieldValue !== undefined;
          }
          return false;
        }),
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

      return {
        size: docs.length,
        docs: docs.map(([id, visit]) => ({
          id,
          data: () => visit,
        })),
      };
    }),
  });

  const db = {
    collection: jest.fn((name: string) => {
      if (name !== 'visits') {
        throw new Error(`Unknown collection: ${name}`);
      }
      return buildQuery();
    }),
  };

  return { db };
}

describe('post commit escalation reporting service', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const originalIncidentConfig = { ...escalationIncidentConfig };

  beforeEach(() => {
    jest.clearAllMocks();
    escalationIncidentConfig.webhookUrl = '';
    escalationIncidentConfig.webhookToken = '';
    escalationIncidentConfig.timeoutMs = originalIncidentConfig.timeoutMs;
  });

  afterAll(() => {
    escalationIncidentConfig.webhookUrl = originalIncidentConfig.webhookUrl;
    escalationIncidentConfig.webhookToken = originalIncidentConfig.webhookToken;
    escalationIncidentConfig.timeoutMs = originalIncidentConfig.timeoutMs;
  });

  it('logs alert when unacknowledged escalations are present', async () => {
    const loggerErrorSpy = jest.spyOn(functions.logger, 'error');
    const harness = buildHarness({
      'visit-open': {
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
      },
      'visit-ack': {
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T10:30:00.000Z'),
        postCommitEscalationAcknowledgedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await reportPostCommitEscalations({ limit: 10, sampleSize: 5 });

    expect(result).toMatchObject({
      scanned: 2,
      totalEscalated: 2,
      unacknowledged: 1,
      acknowledged: 1,
      sampleUnacknowledgedVisitIds: ['visit-open'],
    });
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[visitPostCommitEscalationReport][ALERT]'),
      expect.objectContaining({
        scanned: 2,
        sampleVisitIds: ['visit-open'],
      }),
    );
    loggerErrorSpy.mockRestore();
  });

  it('logs info when all escalations are acknowledged', async () => {
    const loggerInfoSpy = jest.spyOn(functions.logger, 'info');
    const harness = buildHarness({
      'visit-ack-1': {
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
        postCommitEscalationAcknowledgedAt: makeTimestamp('2026-02-20T11:45:00.000Z'),
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await reportPostCommitEscalations({ limit: 10 });

    expect(result).toMatchObject({
      scanned: 1,
      totalEscalated: 1,
      unacknowledged: 0,
      acknowledged: 1,
    });
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      '[visitPostCommitEscalationReport] No unacknowledged escalations',
      expect.objectContaining({ scanned: 1 }),
    );
    loggerInfoSpy.mockRestore();
  });

  it('dispatches incident payload when webhook is configured and unacknowledged escalations exist', async () => {
    escalationIncidentConfig.webhookUrl = 'https://incident.example.test/escalations';
    escalationIncidentConfig.webhookToken = 'incident-token';
    escalationIncidentConfig.timeoutMs = 5000;

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 202 } as Response);

    const harness = buildHarness({
      'visit-open': {
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T12:00:00.000Z'),
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await reportPostCommitEscalations({ limit: 10, sampleSize: 5 });
    expect(result.unacknowledged).toBe(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://incident.example.test/escalations');
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer incident-token',
        }),
      }),
    );
    expect(typeof requestInit?.body).toBe('string');
    const payload = JSON.parse(requestInit?.body as string);
    expect(payload).toEqual(
      expect.objectContaining({
        source: 'lumimd-functions',
        eventType: 'visit_post_commit_escalations',
        severity: 'high',
        summary: expect.stringContaining('1 unacknowledged'),
        operatorEndpoint: '/v1/visits/ops/post-commit-escalations',
        operatorDashboardPath: '/ops/escalations',
      }),
    );
    expect(payload.report).toEqual(
      expect.objectContaining({
        unacknowledged: 1,
        sampleUnacknowledgedVisitIds: ['visit-open'],
      }),
    );

    fetchSpy.mockRestore();
  });

  it('does not dispatch incident payload when all escalations are acknowledged', async () => {
    escalationIncidentConfig.webhookUrl = 'https://incident.example.test/escalations';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 202 } as Response);

    const harness = buildHarness({
      'visit-ack': {
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
        postCommitEscalationAcknowledgedAt: makeTimestamp('2026-02-20T11:45:00.000Z'),
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await reportPostCommitEscalations({ limit: 10 });
    expect(result.unacknowledged).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('logs and continues when incident dispatch fails', async () => {
    escalationIncidentConfig.webhookUrl = 'https://incident.example.test/escalations';
    escalationIncidentConfig.timeoutMs = 5000;

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network down'));
    const loggerErrorSpy = jest.spyOn(functions.logger, 'error');

    const harness = buildHarness({
      'visit-open': {
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const result = await reportPostCommitEscalations({ limit: 10, sampleSize: 5 });

    expect(result.unacknowledged).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '[visitPostCommitEscalationReport] Incident dispatch failed',
      expect.objectContaining({
        message: expect.stringContaining('network down'),
      }),
    );

    fetchSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('uses injected visit-domain dependency for escalation reads', async () => {
    const listPostCommitEscalated = jest.fn().mockResolvedValue([
      {
        id: 'visit-open',
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T11:30:00.000Z'),
      },
      {
        id: 'visit-ack',
        postCommitStatus: 'partial_failure',
        postCommitEscalatedAt: makeTimestamp('2026-02-20T10:30:00.000Z'),
        postCommitEscalationAcknowledgedAt: makeTimestamp('2026-02-20T11:00:00.000Z'),
      },
    ]);

    const result = await reportPostCommitEscalations(
      { limit: 25, sampleSize: 10 },
      {
        visitService: {
          listPostCommitEscalated,
        },
      },
    );

    expect(listPostCommitEscalated).toHaveBeenCalledWith(25);
    expect(result).toMatchObject({
      scanned: 2,
      totalEscalated: 2,
      unacknowledged: 1,
      acknowledged: 1,
      sampleUnacknowledgedVisitIds: ['visit-open'],
    });
  });
});
