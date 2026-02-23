process.env.AUDIT_LOG_HASH_SALT = 'test-audit-salt';

import * as admin from 'firebase-admin';
import { usersRouter } from '../users';

type RecordMap = Record<string, unknown>;

type AuditRecord = {
  id: string;
  data: RecordMap;
};

type HarnessState = {
  userId: string;
  userDoc: RecordMap;
  visits: RecordMap[];
  actions: RecordMap[];
  medications: RecordMap[];
  shares: RecordMap[];
  auditLogs: AuditRecord[];
};

function makeTimestamp(iso: string) {
  return {
    toDate: () => new Date(iso),
  };
}

function makeDocSnapshot(id: string, data: RecordMap, path: string) {
  return {
    id,
    exists: true,
    data: () => data,
    ref: {
      id,
      path,
    },
  };
}

function makeQuerySnapshot(docs: Array<ReturnType<typeof makeDocSnapshot>>) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

function isPlainObject(value: unknown): value is RecordMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target: RecordMap, source: RecordMap): RecordMap {
  const output: RecordMap = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key] as RecordMap, value);
      continue;
    }
    output[key] = value;
  }
  return output;
}

function buildHarness(initialState?: Partial<HarnessState>) {
  const state: HarnessState = {
    userId: 'user-1',
    userDoc: {
      firstName: 'Test',
      createdAt: makeTimestamp('2026-02-10T21:00:00.000Z'),
      updatedAt: makeTimestamp('2026-02-10T21:00:00.000Z'),
      privacy: {
        analyticsConsent: {
          granted: false,
          source: null,
          policyVersion: null,
          updatedAt: makeTimestamp('2026-02-10T21:00:00.000Z'),
        },
      },
    },
    visits: [],
    actions: [],
    medications: [],
    shares: [],
    auditLogs: [],
    ...initialState,
  };

  let auditCounter = state.auditLogs.length;

  const privacyAuditCollectionRef = {
    doc: jest.fn(() => {
      auditCounter += 1;
      return {
        __kind: 'auditDocRef',
        id: `audit-${auditCounter}`,
        path: `users/${state.userId}/privacyAuditLogs/audit-${auditCounter}`,
      };
    }),
    orderBy: jest.fn(() => ({
      limit: jest.fn((limitValue: number) => ({
        get: jest.fn(async () =>
          makeQuerySnapshot(
            state.auditLogs
              .slice(0, limitValue)
              .map((entry) =>
                makeDocSnapshot(
                  entry.id,
                  entry.data,
                  `users/${state.userId}/privacyAuditLogs/${entry.id}`,
                ),
              ),
          ),
        ),
      })),
    })),
  };

  const userDocRef = {
    __kind: 'userDocRef',
    id: state.userId,
    path: `users/${state.userId}`,
    get: jest.fn(async () =>
      ({
        exists: true,
        id: state.userId,
        data: () => state.userDoc,
      })),
    set: jest.fn(async (data: RecordMap, options?: { merge?: boolean }) => {
      if (options?.merge) {
        state.userDoc = deepMerge(state.userDoc, data);
        return;
      }
      state.userDoc = data;
    }),
    collection: jest.fn((name: string) => {
      if (name === 'privacyAuditLogs') {
        return privacyAuditCollectionRef;
      }
      throw new Error(`Unknown user subcollection: ${name}`);
    }),
  };

  const usersCollectionRef = {
    doc: jest.fn((docId: string) => {
      if (docId !== state.userId) {
        return {
          ...userDocRef,
          id: docId,
          path: `users/${docId}`,
        };
      }
      return userDocRef;
    }),
  };

  function makeCollectionQuery(name: 'visits' | 'actions' | 'medications' | 'shares') {
    const collectionData = state[name];
    return {
      where: jest.fn((field: string, _operator: string, value: unknown) => ({
        get: jest.fn(async () =>
          makeQuerySnapshot(
            collectionData
              .filter((entry) => entry[field] === value)
              .map((entry, index) => makeDocSnapshot(`${name}-${index}`, entry, `${name}/${index}`)),
          ),
        ),
      })),
    };
  }

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'users') return usersCollectionRef;
      if (name === 'visits') return makeCollectionQuery('visits');
      if (name === 'actions') return makeCollectionQuery('actions');
      if (name === 'medications') return makeCollectionQuery('medications');
      if (name === 'shares') return makeCollectionQuery('shares');
      throw new Error(`Unknown collection: ${name}`);
    }),
    runTransaction: jest.fn(async (callback: (transaction: any) => Promise<any>) => {
      const transaction = {
        get: jest.fn(async (docRef: { __kind?: string }) => {
          if (docRef.__kind === 'userDocRef') {
            return {
              exists: true,
              id: state.userId,
              data: () => state.userDoc,
            };
          }
          throw new Error('Unsupported transaction.get target');
        }),
        set: jest.fn((docRef: any, data: RecordMap, options?: { merge?: boolean }) => {
          if (docRef.__kind === 'userDocRef') {
            if (options?.merge) {
              state.userDoc = deepMerge(state.userDoc, data);
            } else {
              state.userDoc = data;
            }
            return;
          }

          if (docRef.__kind === 'auditDocRef') {
            state.auditLogs.unshift({
              id: docRef.id,
              data,
            });
            return;
          }

          throw new Error('Unsupported transaction.set target');
        }),
      };

      return callback(transaction);
    }),
  };

  return { state, db };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const baseReq: any = {
    user: { uid: 'user-1' },
    body: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    header(name: string) {
      const key = name.toLowerCase();
      return this.headers[key];
    },
    get(name: string) {
      return this.header(name);
    },
  };

  return {
    ...baseReq,
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

function getRouteHandler(method: 'get' | 'post' | 'patch', path: string) {
  const layer = usersRouter.stack.find(
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

  const routeStack = route.stack;
  return routeStack[routeStack.length - 1].handle;
}

describe('users analytics consent routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const timestampNowMock = jest.fn(() => makeTimestamp('2026-02-10T21:15:00.000Z'));

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = { now: timestampNowMock };
  });

  it('creates consent and audit log entry on first consent update', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/privacy/analytics-consent');
    const req = createRequest({
      body: {
        granted: true,
        source: 'settings_toggle',
        policyVersion: '2026-02-10',
        platform: 'ios',
        appVersion: '1.4.0',
      },
      headers: {
        'x-cloud-trace-context': 'trace-id/123;o=1',
        'user-agent': 'JestTest/1.0',
        origin: 'https://lumimd.app',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      granted: true,
      changed: true,
      source: 'settings_toggle',
      policyVersion: '2026-02-10',
    });
    expect(harness.state.auditLogs).toHaveLength(1);
    expect(harness.state.auditLogs[0].data).toMatchObject({
      eventType: 'analytics_consent_changed',
      granted: true,
      previousGranted: false,
      source: 'settings_toggle',
      policyVersion: '2026-02-10',
      platform: 'ios',
      appVersion: '1.4.0',
    });
  });

  it('records legal assent metadata and writes an audit event via profile patch', async () => {
    const harness = buildHarness();
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('patch', '/me');
    const req = createRequest({
      body: {
        firstName: 'Taylor',
        legalAssent: {
          accepted: true,
          termsVersion: '1.0-2026-02-17',
          privacyVersion: '1.0-2026-02-17',
          source: 'signup_web',
          platform: 'web',
          appVersion: 'portal-1.0.0',
        },
      },
      headers: {
        'x-cloud-trace-context': 'trace-id/123;o=1',
        'user-agent': 'JestTest/1.0',
        origin: 'https://lumimd.app',
      },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.firstName).toBe('Taylor');
    expect(res.body.legalAssent).toMatchObject({
      accepted: true,
      termsVersion: '1.0-2026-02-17',
      privacyVersion: '1.0-2026-02-17',
      source: 'signup_web',
      platform: 'web',
      appVersion: 'portal-1.0.0',
    });
    expect(harness.state.auditLogs).toHaveLength(1);
    expect(harness.state.auditLogs[0].data).toMatchObject({
      eventType: 'legal_documents_accepted',
      accepted: true,
      termsVersion: '1.0-2026-02-17',
      privacyVersion: '1.0-2026-02-17',
      source: 'signup_web',
      platform: 'web',
      appVersion: 'portal-1.0.0',
    });
  });

  it('does not create a new audit log when consent payload is unchanged', async () => {
    const harness = buildHarness({
      userDoc: {
        privacy: {
          analyticsConsent: {
            granted: true,
            source: 'settings_toggle',
            policyVersion: '2026-02-10',
            updatedAt: makeTimestamp('2026-02-10T21:10:00.000Z'),
          },
        },
      },
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('post', '/privacy/analytics-consent');
    const req = createRequest({
      body: {
        granted: true,
        source: 'settings_toggle',
        policyVersion: '2026-02-10',
      },
      headers: {},
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      granted: true,
      changed: false,
    });
    expect(harness.state.auditLogs).toHaveLength(0);
  });

  it('lists analytics consent audit events ordered by most recent', async () => {
    const harness = buildHarness({
      auditLogs: [
        {
          id: 'audit-2',
          data: {
            eventType: 'analytics_consent_changed',
            granted: false,
            previousGranted: true,
            source: 'settings_toggle',
            policyVersion: '2026-02-10',
            platform: 'ios',
            appVersion: '1.4.0',
            occurredAt: makeTimestamp('2026-02-10T21:20:00.000Z'),
          },
        },
        {
          id: 'audit-1',
          data: {
            eventType: 'analytics_consent_changed',
            granted: true,
            previousGranted: false,
            source: 'settings_toggle',
            policyVersion: '2026-02-10',
            platform: 'ios',
            appVersion: '1.4.0',
            occurredAt: makeTimestamp('2026-02-10T21:15:00.000Z'),
          },
        },
      ],
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/privacy/analytics-consent/audit');
    const req = createRequest({
      query: { limit: '10' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.events[0]).toMatchObject({
      id: 'audit-2',
      granted: false,
      previousGranted: true,
    });
    expect(res.body.events[1]).toMatchObject({
      id: 'audit-1',
      granted: true,
      previousGranted: false,
    });
  });

  it('includes consent and audit history in user export payload', async () => {
    const harness = buildHarness({
      userDoc: {
        createdAt: makeTimestamp('2026-02-01T10:00:00.000Z'),
        updatedAt: makeTimestamp('2026-02-10T21:20:00.000Z'),
        privacy: {
          analyticsConsent: {
            granted: false,
            source: 'settings_toggle',
            policyVersion: '2026-02-10',
            updatedAt: makeTimestamp('2026-02-10T21:20:00.000Z'),
          },
          legalAssent: {
            accepted: true,
            termsVersion: '1.0-2026-02-17',
            privacyVersion: '1.0-2026-02-17',
            source: 'signup_web',
            platform: 'web',
            appVersion: 'portal-1.0.0',
            acceptedAt: makeTimestamp('2026-02-10T21:19:00.000Z'),
            updatedAt: makeTimestamp('2026-02-10T21:19:00.000Z'),
          },
        },
      },
      auditLogs: [
        {
          id: 'audit-2',
          data: {
            eventType: 'legal_documents_accepted',
            accepted: true,
            termsVersion: '1.0-2026-02-17',
            privacyVersion: '1.0-2026-02-17',
            source: 'signup_web',
            platform: 'web',
            appVersion: 'portal-1.0.0',
            occurredAt: makeTimestamp('2026-02-10T21:19:00.000Z'),
          },
        },
        {
          id: 'audit-1',
          data: {
            eventType: 'analytics_consent_changed',
            granted: false,
            previousGranted: true,
            source: 'settings_toggle',
            policyVersion: '2026-02-10',
            platform: 'ios',
            appVersion: '1.4.0',
            occurredAt: makeTimestamp('2026-02-10T21:20:00.000Z'),
          },
        },
      ],
    });
    firestoreMock.mockImplementation(() => harness.db);

    const handler = getRouteHandler('get', '/me/export');
    const req = createRequest();
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.privacy.analyticsConsent).toMatchObject({
      granted: false,
      source: 'settings_toggle',
      policyVersion: '2026-02-10',
    });
    expect(res.body.privacy.analyticsConsentAudit).toHaveLength(1);
    expect(res.body.privacy.analyticsConsentAudit[0]).toMatchObject({
      id: 'audit-1',
      eventType: 'analytics_consent_changed',
      granted: false,
      previousGranted: true,
    });
    expect(res.body.privacy.legalAssent).toMatchObject({
      accepted: true,
      termsVersion: '1.0-2026-02-17',
      privacyVersion: '1.0-2026-02-17',
      source: 'signup_web',
      platform: 'web',
      appVersion: 'portal-1.0.0',
    });
    expect(res.body.privacy.legalAssentAudit).toHaveLength(1);
    expect(res.body.privacy.legalAssentAudit[0]).toMatchObject({
      id: 'audit-2',
      eventType: 'legal_documents_accepted',
      accepted: true,
      termsVersion: '1.0-2026-02-17',
      privacyVersion: '1.0-2026-02-17',
    });
  });
});
