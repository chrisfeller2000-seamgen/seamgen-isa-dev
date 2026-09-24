import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateDocumentCompleteness,
  listDocumentRecords,
} from '../workspace/scripts/highergov-document-flow.mjs';

const documentPath = 'https://www.highergov.com/api-external/document/?api_key=old-key&related_key=opportunity%2F123';

test('document lookup follows document_path instead of using it as related_key', async () => {
  const requests = [];
  const rows = await listDocumentRecords({
    apiKey: 'current-key',
    documentPath,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return new Response(JSON.stringify({
        results: Array.from({ length: 10 }, (_, index) => ({ id: index + 1 })),
        meta: { pagination: { pages: 1 } },
      }), { status: 200 });
    },
  });

  assert.equal(rows.length, 10);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].url.origin, 'https://www.highergov.com');
  assert.equal(requests[0].url.pathname, '/api-external/document/');
  assert.equal(requests[0].url.searchParams.get('related_key'), 'opportunity/123');
  assert.equal(requests[0].url.searchParams.get('api_key'), 'current-key');
  assert.equal(requests[0].url.searchParams.get('page_number'), '1');
  assert.equal(requests[0].url.href.includes('old-key'), false);
});

test('document lookup collects every reported page', async () => {
  const requestedPages = [];
  const rows = await listDocumentRecords({
    apiKey: 'current-key',
    documentPath,
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page_number'));
      requestedPages.push(page);
      return new Response(JSON.stringify({
        results: [{ id: page }],
        meta: { pagination: { pages: 2 } },
      }), { status: 200 });
    },
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
});

test('document lookup rejects unexpected hosts and missing related keys before fetching', async () => {
  const fetchImpl = () => { throw new Error('Unexpected network request'); };
  for (const unsafePath of [
    'https://example.com/api-external/document/?related_key=123',
    'http://www.highergov.com/api-external/document/?related_key=123',
    'https://www.highergov.com/api-external/document/?api_key=old-key',
  ]) {
    await assert.rejects(
      listDocumentRecords({ apiKey: 'current-key', documentPath: unsafePath, fetchImpl }),
      /not an approved document endpoint/,
    );
  }
});

test('unexpected response shape is an error, not an empty document list', async () => {
  await assert.rejects(
    listDocumentRecords({
      apiKey: 'current-key',
      documentPath,
      fetchImpl: async () => new Response(JSON.stringify({ documents: [{ id: 1 }] }), { status: 200 }),
    }),
    /no results array/,
  );
});

test('an empty list is not classified as an access denial', () => {
  assert.equal(
    evaluateDocumentCompleteness({ manifest: [], extractedTextByPath: new Map() }).status,
    'document-list-empty',
  );
  assert.equal(
    evaluateDocumentCompleteness({
      manifest: [{ role: 'solicitation', required: true, downloaded: false, document_status: 'portal-gated' }],
      extractedTextByPath: new Map(),
    }).status,
    'access-blocked',
  );
});
