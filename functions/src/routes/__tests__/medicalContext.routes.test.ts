import * as admin from 'firebase-admin';
import { medicalContextRouter } from '../medicalContext';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

jest.mock('../../services/domain/serviceContainer', () => ({
  createDomainServiceContainer: jest.fn(),
}));

type RecordMap = Record<string, any>;

function makeTimestamp(iso: string) {
  const date = new Date(iso);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function createRequest(overrides?: Partial<RecordMap>) {
  const req: any = {
    user: { uid: 'user-1' },
    body: {},
    params: {},
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
  };

  return res;
}

function getRouteHandler(method: 'get' | 'patch', path: string) {
  const layer = medicalContextRouter.stack.find(
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

describe('medicalContext routes', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const createDomainServiceContainerMock =
    createDomainServiceContainer as jest.MockedFunction<typeof createDomainServiceContainer>;

  const patientContextService = {
    getForUser: jest.fn(),
    updateConditionStatusForUser: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    patientContextService.getForUser.mockReset();
    patientContextService.updateConditionStatusForUser.mockReset();
    firestoreMock.mockImplementation(() => ({}) as any);
    createDomainServiceContainerMock.mockReturnValue({
      patientContextService,
    } as any);
  });

  it('returns an empty condition list when no patient context exists', async () => {
    patientContextService.getForUser.mockResolvedValue(null);

    const handler = getRouteHandler('get', '/conditions');
    const req = createRequest({ user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ conditions: [] });
    expect(patientContextService.getForUser).toHaveBeenCalledWith('user-1');
    expect(createDomainServiceContainerMock).toHaveBeenCalledWith({
      db: expect.any(Object),
    });
  });

  it('maps condition timestamps to ISO strings for response payloads', async () => {
    patientContextService.getForUser.mockResolvedValue({
      id: 'user-1',
      userId: 'user-1',
      conditions: [
        {
          id: 'hypertension',
          name: 'Hypertension',
          status: 'active',
          diagnosedAt: makeTimestamp('2026-02-10T08:00:00.000Z'),
          sourceVisitId: 'visit-1',
          notes: 'Monitor weekly',
        },
        {
          id: 'asthma',
          name: 'Asthma',
          status: 'resolved',
        },
      ],
    });

    const handler = getRouteHandler('get', '/conditions');
    const req = createRequest({ user: { uid: 'user-1' } });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      conditions: [
        {
          id: 'hypertension',
          name: 'Hypertension',
          status: 'active',
          diagnosedAt: '2026-02-10T08:00:00.000Z',
          sourceVisitId: 'visit-1',
          notes: 'Monitor weekly',
        },
        {
          id: 'asthma',
          name: 'Asthma',
          status: 'resolved',
          diagnosedAt: null,
          sourceVisitId: undefined,
          notes: undefined,
        },
      ],
    });
  });

  it('rejects invalid status updates', async () => {
    const handler = getRouteHandler('patch', '/conditions/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'hypertension' },
      body: { status: 'invalid-status' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      code: 'invalid_request',
      message: 'Status must be one of: active, resolved, monitoring',
    });
    expect(patientContextService.updateConditionStatusForUser).not.toHaveBeenCalled();
  });

  it('returns 404 when patient context does not exist during updates', async () => {
    patientContextService.updateConditionStatusForUser.mockResolvedValue({
      outcome: 'context_not_found',
    });

    const handler = getRouteHandler('patch', '/conditions/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'hypertension' },
      body: { status: 'resolved' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      code: 'not_found',
      message: 'Patient context not found',
    });
  });

  it('returns 404 when condition is missing during updates', async () => {
    patientContextService.updateConditionStatusForUser.mockResolvedValue({
      outcome: 'condition_not_found',
    });

    const handler = getRouteHandler('patch', '/conditions/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'hypertension' },
      body: { status: 'resolved' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      code: 'not_found',
      message: 'Condition not found',
    });
  });

  it('updates condition status and returns success payload', async () => {
    patientContextService.updateConditionStatusForUser.mockResolvedValue({
      outcome: 'updated',
      condition: {
        id: 'hypertension',
        status: 'monitoring',
      },
    });

    const handler = getRouteHandler('patch', '/conditions/:id');
    const req = createRequest({
      user: { uid: 'user-1' },
      params: { id: 'hypertension' },
      body: { status: 'monitoring' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(patientContextService.updateConditionStatusForUser).toHaveBeenCalledWith(
      'user-1',
      'hypertension',
      'monitoring',
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      condition: {
        id: 'hypertension',
        status: 'monitoring',
      },
    });
  });
});
