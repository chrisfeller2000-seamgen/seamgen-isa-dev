import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDocumentCompleteness, listDocumentRecords, lookupOpportunityRecord } from '../workspace/scripts/highergov-document-flow.mjs';

const base = { apiKey: 'test-key', searchId: 'search-1', sourceType: 'sled,sam', capturedDate: '2026-09-22', retryDelayMs: 0 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const badGateway = () => new Response('<html><title>502 Bad Gateway</title></html>', { status: 502 });

// A fetch stand-in that serves a queue of canned responses and records each requested URL.
function mockFetch(responses) {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(new URL(url));
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request: ${url}`);
    return next();
  };
  return { requests, fetchImpl };
}

test('lookup finds the record by version_key without running the saved search', async () => {
  const record = { version_key: 'v1', opp_key: 'o1', document_path: 'doc-1' };
  const { requests, fetchImpl } = mockFetch([() => json({ results: [record] })]);

  const lookup = await lookupOpportunityRecord({ ...base, versionKey: 'v1', oppKey: 'o1', fetchImpl });

  assert.deepEqual(lookup.record, record);
  assert.equal(lookup.method, 'version_key');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('version_key'), 'v1');
  assert.equal(requests[0].searchParams.has('search_id'), false);
});

test('lookup falls back to opp_key when the version_key query misses', async () => {
  const record = { version_key: 'v2', opp_key: 'o1' };
  const { requests, fetchImpl } = mockFetch([() => json({ results: [] }), () => json({ results: [record] })]);

  const lookup = await lookupOpportunityRecord({ ...base, versionKey: 'v1', oppKey: 'o1', fetchImpl });

  assert.deepEqual(lookup.record, record);
  assert.equal(lookup.method, 'opp_key');
  assert.equal(requests[1].searchParams.get('opp_key'), 'o1');
});

test('lookup ignores unrelated records and falls back to paging the saved search', async () => {
  // An ignored filter returns unrelated records, which must not be accepted as a match.
  const unrelated = { version_key: 'other', opp_key: 'other' };
  const record = { version_key: 'v1', opp_key: 'o1' };
  const { requests, fetchImpl } = mockFetch([
    () => json({ results: [unrelated] }),
    () => json({ results: [unrelated] }),
    () => json({ results: [unrelated], meta: { pagination: { pages: 2 } } }),
    () => json({ results: [record], meta: { pagination: { pages: 2 } } })
  ]);

  const lookup = await lookupOpportunityRecord({ ...base, versionKey: 'v1', oppKey: 'o1', fetchImpl });

  assert.deepEqual(lookup.record, record);
  assert.equal(lookup.method, 'search');
  assert.equal(lookup.pageNumber, 2);
  assert.equal(requests[2].searchParams.get('search_id'), 'search-1');
  assert.equal(requests[3].searchParams.get('page_number'), '2');
});

test('lookup returns no record when nothing matches and no saved search is given', async () => {
  const { fetchImpl } = mockFetch([() => json({ results: [] })]);
  const lookup = await lookupOpportunityRecord({ ...base, searchId: '', versionKey: 'v1', fetchImpl });
  assert.equal(lookup.record, null);
});

test('lookup requires a version_key or opp_key', async () => {
  await assert.rejects(lookupOpportunityRecord({ ...base }), /versionKey or oppKey is required/);
});

test('a 502 from HigherGov is retried until the request succeeds', async () => {
  const record = { version_key: 'v1' };
  const { requests, fetchImpl } = mockFetch([badGateway, badGateway, () => json({ results: [record] })]);

  const lookup = await lookupOpportunityRecord({ ...base, versionKey: 'v1', fetchImpl });

  assert.deepEqual(lookup.record, record);
  assert.equal(requests.length, 3);
});

test('a persistent 502 fails after three attempts with the status attached', async () => {
  const { requests, fetchImpl } = mockFetch([badGateway, badGateway, badGateway]);

  await assert.rejects(lookupOpportunityRecord({ ...base, versionKey: 'v1', fetchImpl }), (error) => {
    assert.equal(error.status, 502);
    assert.match(error.message, /opportunity lookup failed \(HTTP 502\)/);
    return true;
  });
  assert.equal(requests.length, 3);
});

test('client errors such as 401 are not retried', async () => {
  const { requests, fetchImpl } = mockFetch([() => json({ detail: 'Invalid key' }, 401)]);
  await assert.rejects(lookupOpportunityRecord({ ...base, versionKey: 'v1', fetchImpl }), { status: 401 });
  assert.equal(requests.length, 1);
});

test('network failures are retried', async () => {
  const { requests, fetchImpl } = mockFetch([
    () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); },
    () => json({ results: [{ version_key: 'v1' }] })
  ]);
  const lookup = await lookupOpportunityRecord({ ...base, versionKey: 'v1', fetchImpl });
  assert.equal(lookup.method, 'version_key');
  assert.equal(requests.length, 2);
});

test('document listing retries a 503 and returns the records', async () => {
  const documentPath = 'https://www.highergov.com/api-external/document/?api_key=old-key&related_key=doc-1';
  const documents = [{ file_name: 'RFP.pdf' }];
  const { requests, fetchImpl } = mockFetch([() => new Response('', { status: 503 }), () => json({ results: documents, meta: { pagination: { pages: 1 } } })]);

  const records = await listDocumentRecords({ apiKey: 'test-key', documentPath, fetchImpl, retryDelayMs: 0 });

  assert.deepEqual(records, documents);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('related_key'), 'doc-1');
  assert.equal(requests[1].searchParams.get('api_key'), 'test-key');
});

// Manifest rows as the weekly job leaves them after extraction.
const read = (name, extra = {}) => ({ source_file_name: name, local_file_name: name, role: 'solicitation', required: true, downloaded: true, extracted: true, document_status: 'downloaded and extracted', ...extra });
const unread = (name, extra = {}) => ({ ...read(name), extracted: false, document_status: 'downloaded but unsupported', ...extra });

test('an unreadable file is covered by a read copy of the same document in another format', () => {
  // Shaped like Our415 on SF City Partner, October 30: the event as .xml and .pdf, plus the RFP.
  const completeness = evaluateDocumentCompleteness({ manifest: [
    unread('CHF___2027_Our415_Request_for_Proposals.xml'),
    read('DCYF_2027_Our415_RFP_10.26.26.pdf'),
    read('CHF___2027_Our415_Request_for_Proposals.pdf'),
  ] });
  assert.deepEqual(completeness, { complete: true, status: 'full-text', reasons: [] });

  // Without a source name, the local "NN-role-" prefix is ignored, even when the roles differ.
  const local = evaluateDocumentCompleteness({ manifest: [
    unread('', { local_file_name: '01-solicitation-Scope_of_Work.doc' }),
    read('', { local_file_name: '02-requirements-Scope of Work.pdf' }),
  ] });
  assert.equal(local.complete, true);
});

test('a different readable file never stands in for an unreadable or missing required one', () => {
  const unreadable = evaluateDocumentCompleteness({ manifest: [
    read('RFP_2027.pdf'),
    unread('Appendix C - Business and Technical Requirements.xls', { role: 'requirements' }),
  ] });
  assert.equal(unreadable.complete, false);
  assert.deepEqual(unreadable.reasons, ['Missing or unreadable required document: Appendix C - Business and Technical Requirements.xls']);

  const gated = evaluateDocumentCompleteness({ manifest: [
    read('RFP_2027.pdf'),
    { ...unread('Agency Solicitation Specification.pdf', { role: 'requirements' }), downloaded: false, document_status: 'portal-gated' },
  ] });
  assert.equal(gated.complete, false);
  assert.match(gated.reasons[0], /Agency Solicitation Specification\.pdf$/);
});
