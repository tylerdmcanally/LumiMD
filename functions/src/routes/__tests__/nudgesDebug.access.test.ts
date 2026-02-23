import { nudgesDebugRouter } from '../nudgesDebug';

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
  const layer = nudgesDebugRouter.stack.find(
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

describe('nudges debug route access controls', () => {
  const originalEnv = {
    FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR,
    NODE_ENV: process.env.NODE_ENV,
    LUMIBOT_DEBUG: process.env.LUMIBOT_DEBUG,
  };

  afterEach(() => {
    process.env.FUNCTIONS_EMULATOR = originalEnv.FUNCTIONS_EMULATOR;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.LUMIBOT_DEBUG = originalEnv.LUMIBOT_DEBUG;
  });

  it('rejects debug writes when debug mode is disabled', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    process.env.NODE_ENV = 'production';
    process.env.LUMIBOT_DEBUG = 'false';

    const handler = getRouteHandler('post', '/debug/create');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: { type: 'introduction' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      message: 'Debug endpoints are only available in development',
    });
  });

  it('requires operator access for debug writes outside emulator', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    process.env.NODE_ENV = 'development';
    process.env.LUMIBOT_DEBUG = 'true';

    const handler = getRouteHandler('post', '/debug/create');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: { type: 'introduction' },
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      message: 'Debug endpoint operator access required',
    });
  });

  it('allows operators to reach validation path outside emulator', async () => {
    process.env.FUNCTIONS_EMULATOR = 'false';
    process.env.NODE_ENV = 'development';
    process.env.LUMIBOT_DEBUG = 'true';

    const handler = getRouteHandler('post', '/debug/create');
    const req = createRequest({
      user: { uid: 'operator-1', roles: ['operator'] },
      body: {},
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid request body',
    });
  });

  it('allows emulator debug writes without operator claims', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.NODE_ENV = 'production';
    process.env.LUMIBOT_DEBUG = 'false';

    const handler = getRouteHandler('post', '/debug/create');
    const req = createRequest({
      user: { uid: 'user-1' },
      body: {},
    });
    const res = createResponse();

    await handler(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      message: 'Invalid request body',
    });
  });
});
