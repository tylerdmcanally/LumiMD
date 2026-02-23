import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { createApiClient } from '../dist/index.mjs';

const ORIGINAL_FETCH = global.fetch;

function createJsonResponse(body, options = {}) {
  const headers = new Headers({
    'content-type': 'application/json',
    ...(options.headers ?? {}),
  });
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers,
  });
}

function createClient() {
  return createApiClient({
    baseUrl: 'https://api.example.com',
    getAuthToken: async () => 'test-token',
  });
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

after(() => {
  global.fetch = ORIGINAL_FETCH;
});

test('visits.listPage returns header cursor metadata and passes request params', async () => {
  let requestedUrl = '';
  let requestedInit = null;
  global.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;
    return createJsonResponse(
      [{ id: 'visit-2' }, { id: 'visit-1' }],
      {
        headers: {
          'X-Has-More': 'true',
          'X-Next-Cursor': 'visit-1',
        },
      },
    );
  };

  const client = createClient();
  const page = await client.visits.listPage({
    limit: 2,
    sort: 'desc',
    cursor: 'visit-3',
  });

  assert.equal(
    requestedUrl,
    'https://api.example.com/v1/visits?limit=2&sort=desc&cursor=visit-3',
  );
  assert.equal(requestedInit?.method, 'GET');
  assert.equal(requestedInit?.headers?.Authorization, 'Bearer test-token');
  assert.deepEqual(page.items.map((visit) => visit.id), ['visit-2', 'visit-1']);
  assert.equal(page.count, 2);
  assert.equal(page.limit, 2);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, 'visit-1');
});

test('actions.listPage treats missing cursor headers as terminal page boundary', async () => {
  global.fetch = async () => createJsonResponse([{ id: 'action-1' }]);
  const client = createClient();

  const page = await client.actions.listPage({ limit: 10 });

  assert.deepEqual(page.items.map((action) => action.id), ['action-1']);
  assert.equal(page.limit, 10);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});

test('medications.list remains array-compatible and does not leak stale cursor state', async () => {
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    return createJsonResponse([{ id: `med-${requestedUrls.length}` }], {
      headers: {
        'X-Has-More': 'false',
      },
    });
  };
  const client = createClient();

  const firstPage = await client.medications.list({ limit: 1, cursor: 'med-0' });
  const secondPage = await client.medications.list({ limit: 1 });

  assert.deepEqual(firstPage.map((medication) => medication.id), ['med-1']);
  assert.deepEqual(secondPage.map((medication) => medication.id), ['med-2']);
  assert.equal(
    requestedUrls[0],
    'https://api.example.com/v1/meds?limit=1&cursor=med-0',
  );
  assert.equal(requestedUrls[1], 'https://api.example.com/v1/meds?limit=1');
});
