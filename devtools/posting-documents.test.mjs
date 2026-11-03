import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import {
  USER_AGENT, classifyEmptyPage, classifyPostingPage, createPostingBudget, extractPdfLinks, fetchPostingDocuments, harvestLinks,
  parseRobots, postingRowMatchesRfp, robotsAllows, siteOf, storedUrl,
} from '../workspace/scripts/posting-documents.mjs';
import { ACCESS_VALUES, PORTALS, loginPortal, portalFor } from '../workspace/scripts/rfp-portals.mjs';
import { extractManifestEvidence, postingNeeded } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

// A fake agency site: `routes` maps a URL (or path) to a function returning a Response.
// Every request is recorded, and one with no route fails the test.
function fakeSite(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers || {} });
    const parsed = new URL(String(url));
    const route = routes[parsed.href] || routes[`${parsed.origin}${parsed.pathname}`] || routes[parsed.pathname];
    if (!route) throw new Error(`Unexpected request: ${url}`);
    return route();
  };
  return { calls, fetchImpl };
}
const html = (body, init = {}) => () => new Response(`<html><body>${body}</body></html>`, { headers: { 'content-type': 'text/html' }, ...init });
const file = (body, headers = {}) => () => new Response(body, { headers: { 'content-type': 'application/pdf', ...headers } });
const missing = () => new Response('not found', { status: 404 });
const freeBudget = () => createPostingBudget({ perHostDelayMs: 0, sleep: async () => {} });
const PDF = text => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'isa-posting-'));
}

test('the portal list names hosts by suffix, and every entry is valid', () => {
  assert.equal(portalFor('https://www.publicpurchase.com/gems/x/bid/bidView?bidId=1').name, 'Public Purchase');
  assert.equal(portalFor('https://mbid.ionwave.net/PublicDetail.aspx?bidID=7462').id, 'ionwave');
  assert.equal(portalFor('https://bids.sciquest.com/apps/Router/PublicEvent').adapter, 'jaggaer-summary');
  // A host only ending in a listed name's letters is not that portal.
  assert.equal(portalFor('https://notpublicpurchase.com/x').id, 'unknown');
  assert.deepEqual([portalFor('not a url').id, portalFor('https://www.gilbertaz.gov/rfp').fetch], ['unknown', true]);
  assert.equal(loginPortal(portalFor('https://www.demandstar.com/app')), true);
  assert.equal(loginPortal(portalFor('https://emma.maryland.gov/page')), false);
  for (const portal of PORTALS) {
    assert.ok(ACCESS_VALUES.includes(portal.access), portal.id);
    assert.ok(portal.verified || portal.note || portal.access, portal.id);
    // A site that needs an account, pays, challenges us or only works in a browser is never requested.
    if (['free-account', 'paid', 'bot-check', 'js-only', 'by-request', 'not-a-posting', 'api'].includes(portal.access)) assert.equal(portal.fetch, false, portal.id);
  }
});

test('a posting page is classified by status and challenge markers, and never retried', () => {
  const headers = new Headers();
  assert.equal(classifyPostingPage({ status: 401, headers }), 'login-required');
  assert.equal(classifyPostingPage({ status: 403, headers }), 'login-required');
  assert.equal(classifyPostingPage({ status: 403, headers: new Headers({ 'cf-mitigated': 'challenge' }) }), 'bot-check');
  assert.equal(classifyPostingPage({ status: 200, headers, html: '<title>Just a moment...</title>' }), 'bot-check');
  assert.equal(classifyPostingPage({ status: 404, headers }), 'posting-gone');
  assert.equal(classifyPostingPage({ status: 429, headers }), 'rate-limited');
  assert.equal(classifyPostingPage({ status: 503, headers }), 'posting-unavailable');
  assert.equal(classifyPostingPage({ status: 200, headers, html: '<p>An open RFP</p>' }), null);
  // A readable page with no file links says why.
  assert.equal(classifyEmptyPage('<form><input type="password" name="pw"></form>'), 'login-required');
  assert.equal(classifyEmptyPage('<p>Specifications are available by email request to purchasing@example.gov.</p>'), 'by-request');
  assert.equal(classifyEmptyPage('<noscript>You need to enable JavaScript to run this app.</noscript>'), 'js-only');
  assert.equal(classifyEmptyPage('<p>Attachments</p>', { scriptLinks: 3 }), 'js-only');
  assert.equal(classifyEmptyPage('<p>This bid has no attachments yet.</p>'), 'no-documents-listed');
});

test('only file links on the agency site or a listed document host are kept', () => {
  const page = `<a href="/files/RFP%2026-1.pdf">RFP 26-1</a> <a href="https://docs.gilbertaz.gov/x.docx">Scope</a>
    <a href="https://evil.example/x.pdf">x</a> <a href="/about.html">About</a> <a href="javascript:downloadFile('7')">Attachment</a>
    <a href='/DocumentCenter/View/123'>Requirements</a> <a href="/files/RFP%2026-1.pdf#page=2">same file</a>`;
  const allowed = url => siteOf(url.hostname) === 'gilbertaz.gov';
  const { links, offDomain, scriptLinks } = harvestLinks(page, new URL('https://www.gilbertaz.gov/rfp/1'), { allowed });
  assert.deepEqual(links.map(link => [link.name, link.url.href]), [
    ['RFP 26-1', 'https://www.gilbertaz.gov/files/RFP%2026-1.pdf'],
    ['Scope', 'https://docs.gilbertaz.gov/x.docx'],
    ['Requirements', 'https://www.gilbertaz.gov/DocumentCenter/View/123'],
  ]);
  assert.deepEqual([offDomain, scriptLinks], [1, 1]);
  assert.deepEqual([siteOf('contracts.ocp.dc.gov'), siteOf('dot.state.mn.us'), siteOf('www.foo.gov.uk')], ['dc.gov', 'dot.state.mn.us', 'foo.gov.uk']);
  assert.equal(storedUrl('https://x.gov/a/b.pdf?token=secret&sig=1#frag'), 'https://x.gov/a/b.pdf');
});

test('robots.txt rules for this job or for everyone are honored', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: Googlebot\nDisallow: /');
  assert.deepEqual([robotsAllows(rules, '/private/x'), robotsAllows(rules, '/private/ok/1'), robotsAllows(rules, '/bids')], [false, true, true]);
  const ours = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: SeamgenISA\nDisallow: /bids');
  assert.equal(robotsAllows(ours, '/bids/1'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /*.pdf$'), '/x.pdf'), false);
});

test('a PDF summary\'s attachment links are read from the file, including compressed object streams', () => {
  assert.deepEqual(extractPdfLinks(PDF('1 0 obj << /S /URI /URI (https://bids01.jaggaer.com/apps/Router/PublicEventDownload?id=1) >> endobj')).links,
    ['https://bids01.jaggaer.com/apps/Router/PublicEventDownload?id=1']);
  assert.deepEqual(extractPdfLinks(PDF('<< /URI (https://x.gov/a\\(1\\).pdf) >> << /URI <68747470733A2F2F782E676F762F622E706466> >>')).links,
    ['https://x.gov/a(1).pdf', 'https://x.gov/b.pdf']);
  const compressed = Buffer.concat([Buffer.from('%PDF-1.5\n2 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream\n'),
    zlib.deflateSync(Buffer.from('<< /A << /S /URI /URI (https://x.gov/c.pdf) >> >> << /URI (mailto:buyer@x.gov) >>')), Buffer.from('\nendstream\nendobj\n%%EOF')]);
  assert.deepEqual(extractPdfLinks(compressed).links, ['https://x.gov/c.pdf']);
  assert.deepEqual(extractPdfLinks(PDF('/Encrypt 5 0 R << /URI (https://x.gov/d.pdf) >>')), { links: [], encrypted: true });
  // A stream that isn't valid Flate data is skipped, not fatal.
  assert.deepEqual(extractPdfLinks(Buffer.from('%PDF-1.5\n<< /Filter /FlateDecode >>\nstream\nnot deflate\nendstream')).links, []);
});

test('a posting file counts for this RFP only when it names the RFP number or the title', () => {
  const rfp = { number: 'RFP 26-104', title: 'Recreation and Event Management Software' };
  assert.equal(postingRowMatchesRfp('Solicitation No. 26-104 for recreation software', rfp), true);
  assert.equal(postingRowMatchesRfp('The town seeks recreation and event registration software.', rfp), true);
  assert.equal(postingRowMatchesRfp('Request for Proposals: Parking Citation Management Software', rfp), false);
  assert.equal(postingRowMatchesRfp('anything', { number: '', title: '' }), false);
});

test('the budget spaces requests to a host and stops the run at its limits', async () => {
  let clock = 0;
  const slept = [];
  const budget = createPostingBudget({ perHostDelayMs: 2000, maxRfps: 2, totalMs: 60000, now: () => clock, sleep: async ms => { slept.push(ms); clock += ms; } });
  await budget.wait('a.gov');
  clock += 500;
  await budget.wait('a.gov');
  await budget.wait('b.gov');
  assert.deepEqual(slept, [1500]);
  assert.deepEqual([budget.startRfp(), budget.startRfp(), budget.startRfp()], [true, true, false]);
  const timed = createPostingBudget({ totalMs: 1000, now: () => clock });
  clock += 1000;
  assert.equal(timed.startRfp(), false);
});

test("a posting's solicitation is saved, forms and other sites' files are skipped, and nothing but GET is sent", async () => {
  const dir = await tempDir();
  try {
    const site = fakeSite({
      '/robots.txt': missing,
      '/bids/26-104': html(`<a href="/files/RFP%2026-104.pdf?token=secret">RFP 26-104</a> <a href="/files/Price%20Form.pdf">Price Form</a>
        <a href="https://other.example/rfp.pdf">Mirror</a> <a href="/files/Locked%20Addendum.pdf">Addendum 1</a> <a href="/files/Gone%20Exhibit.pdf">Exhibit A</a>`),
      '/files/RFP%2026-104.pdf': file(PDF('the RFP')),
      '/files/Locked%20Addendum.pdf': html('<form><input type="password"></form>'),
      '/files/Gone%20Exhibit.pdf': missing,
    });
    const { outcome, rows } = await fetchPostingDocuments({ postingUrl: 'https://www.gilbertaz.gov/bids/26-104', resourcesDir: dir, startIndex: 2,
      budget: freeBudget(), fetchImpl: site.fetchImpl });
    assert.equal(outcome.outcome, 'documents-found');
    assert.deepEqual([outcome.host, outcome.portal, outcome.listed, outcome.downloaded, outcome.skipped.offDomain], ['gilbertaz.gov', '', 4, 1, 1]);
    const saved = rows.find(row => row.downloaded);
    assert.deepEqual([saved.source, saved.role, saved.match_required, saved.local_file_name], ['posting', 'solicitation', true, '03-solicitation-RFP 26-104.pdf']);
    assert.equal(saved.fetched_from, 'https://www.gilbertaz.gov/files/RFP%2026-104.pdf');
    assert.equal((await fs.readFile(saved.local_path)).subarray(0, 4).toString(), '%PDF');
    // A sign-in page served for the addendum is not saved; a missing exhibit is a failed row.
    assert.deepEqual(rows.filter(row => !row.downloaded).map(row => [row.source_file_name, row.document_status, row.http_status, row.required]),
      [['Exhibit A', 'failed', 404, false]]);
    assert.doesNotMatch(JSON.stringify(rows), /token=secret/);
    assert.ok(site.calls.every(call => call.method === 'GET' && call.headers['user-agent'] === USER_AGENT));
    assert.ok(!site.calls.some(call => /Price|other\.example/.test(call.url)));
    assert.equal(site.calls.find(call => call.url.includes('/files/RFP')).headers.referer, 'https://www.gilbertaz.gov/');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("a portal the job never requests, robots.txt, and sign-in or challenge answers each stop without a workaround", async () => {
  const none = fakeSite({});
  const known = await fetchPostingDocuments({ postingUrl: 'https://www.publicpurchase.com/gems/x/bid/bidView?bidId=1', budget: freeBudget(), fetchImpl: none.fetchImpl });
  assert.deepEqual([known.outcome.outcome, known.outcome.reason, none.calls.length], ['skipped-known-portal', 'The documents need a free Public Purchase account to download.', 0]);
  assert.equal((await fetchPostingDocuments({ postingUrl: 'https://www.highergov.com/x', budget: freeBudget(), fetchImpl: none.fetchImpl })).outcome.outcome, 'no-posting-url');

  const robots = fakeSite({ '/robots.txt': () => new Response('User-agent: *\nDisallow: /bids') });
  const disallowed = await fetchPostingDocuments({ postingUrl: 'https://city.example.gov/bids/1', budget: freeBudget(), fetchImpl: robots.fetchImpl });
  assert.deepEqual([disallowed.outcome.outcome, robots.calls.length], ['robots-disallowed', 1]);

  const budget = freeBudget();
  const challenge = fakeSite({ '/robots.txt': missing, '/bid/1': () => new Response('Just a moment...', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) });
  const first = await fetchPostingDocuments({ postingUrl: 'https://bids.example.org/bid/1', budget, fetchImpl: challenge.fetchImpl });
  const second = await fetchPostingDocuments({ postingUrl: 'https://bids.example.org/bid/2', budget, fetchImpl: challenge.fetchImpl });
  assert.deepEqual([first.outcome.outcome, second.outcome.outcome, challenge.calls.length], ['bot-check', 'bot-check', 2]);

  const login = fakeSite({ '/robots.txt': missing, '/bid/1': () => new Response(null, { status: 302, headers: { location: '/Account/Login?returnUrl=/bid/1' } }) });
  assert.equal((await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid/1', budget: freeBudget(), fetchImpl: login.fetchImpl })).outcome.outcome, 'login-required');
  const away = fakeSite({ '/robots.txt': missing, '/bid/1': () => new Response(null, { status: 301, headers: { location: 'https://elsewhere.example.com/bid/1' } }) });
  const moved = await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid/1', budget: freeBudget(), fetchImpl: away.fetchImpl });
  assert.deepEqual([moved.outcome.outcome, away.calls.length], ['posting-unavailable', 2]);
  const empty = fakeSite({ '/robots.txt': missing, '/bid/1': html('<p>Specifications are available by email request.</p>') });
  assert.equal((await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid/1', budget: freeBudget(), fetchImpl: empty.fetchImpl })).outcome.outcome, 'by-request');

  const tight = createPostingBudget({ maxRfps: 0, perHostDelayMs: 0 });
  assert.equal((await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid/1', budget: tight, fetchImpl: none.fetchImpl })).outcome.outcome, 'budget-exhausted');
});

test("a Jaggaer summary's attachment links lead to its open download endpoint; HigherGov's files are not fetched again", async () => {
  const dir = await tempDir();
  try {
    const summary = path.join(dir, '01-other-Summary.pdf');
    await fs.writeFile(summary, PDF('Buyer Attachments << /URI (https://bids01.jaggaer.com/apps/Router/PublicEventDownload?AttachmentId=9) >> << /URI (https://tracker.example.com/x.pdf) >>'));
    const highergovRows = [{ source_file_name: 'CAMA System Summary.pdf', downloaded: true, local_path: summary, signature: 'pdf', role: 'other', hash: 'known' }];
    const site = fakeSite({
      '/robots.txt': missing,
      'https://bids.sciquest.com/apps/Router/PublicEvent': html('<p>Event summary</p>'),
      'https://bids01.jaggaer.com/apps/Router/PublicEventDownload': file(PDF('CAMA RFP'), { 'content-disposition': 'attachment; filename="CAMA RFP 26-01.pdf"' }),
    });
    const { outcome, rows } = await fetchPostingDocuments({ postingUrl: 'https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=StateOfMontana',
      highergovRows, resourcesDir: dir, startIndex: 1, budget: freeBudget(), fetchImpl: site.fetchImpl });
    assert.deepEqual([outcome.outcome, outcome.portal, outcome.downloaded, outcome.skipped.offDomain], ['documents-found', 'Jaggaer', 1, 1]);
    assert.deepEqual([rows[0].source_file_name, rows[0].role, rows[0].fetched_from],
      ['CAMA RFP 26-01.pdf', 'solicitation', 'https://bids01.jaggaer.com/apps/Router/PublicEventDownload']);

    // The same file under the same name as HigherGov's is not downloaded again.
    const again = fakeSite({ '/robots.txt': missing, '/bid': html('<a href="/f/CAMA%20System%20Summary.pdf">CAMA System Summary</a>') });
    const duplicate = await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid', highergovRows: [{ ...highergovRows[0], signature: 'other' }],
      resourcesDir: dir, budget: freeBudget(), fetchImpl: again.fetchImpl });
    assert.deepEqual([duplicate.outcome.outcome, duplicate.outcome.skipped.duplicate, again.calls.length], ['no-documents-listed', 1, 2]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a connection cut off partway through is a failed download, not a crash', async () => {
  const dir = await tempDir();
  try {
    const broken = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('%PDF-1.4 part')); controller.error(new Error('socket hang up')); } }));
    const site = fakeSite({ '/robots.txt': missing, '/bid': html('<a href="/f/RFP%201.pdf">RFP 1</a>'), '/f/RFP%201.pdf': broken });
    const { outcome, rows } = await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid', resourcesDir: dir, budget: freeBudget(), fetchImpl: site.fetchImpl });
    assert.equal(outcome.outcome, 'no-documents-listed');
    assert.deepEqual(rows.map(row => [row.document_status, row.downloaded]), [['failed', false]]);
    const cut = fakeSite({ '/robots.txt': missing, '/bid': broken });
    assert.equal((await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid', resourcesDir: dir, budget: freeBudget(), fetchImpl: cut.fetchImpl })).outcome.outcome, 'posting-unavailable');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('oversized files are not saved, and a dry run saves nothing at all', async () => {
  const dir = await tempDir();
  try {
    const site = fakeSite({
      '/robots.txt': missing,
      '/bid': html('<a href="/f/RFP%20Big.pdf">RFP Big</a> <a href="/f/RFP%20Small.pdf">RFP Small</a>'),
      '/f/RFP%20Big.pdf': file(PDF('big'), { 'content-length': String(26 * 1024 * 1024) }),
      '/f/RFP%20Small.pdf': file(PDF('small')),
    });
    const sized = await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid', resourcesDir: dir, budget: freeBudget(), fetchImpl: site.fetchImpl });
    assert.deepEqual([sized.outcome.downloaded, sized.outcome.skipped.overCap, sized.rows.length], [1, 1, 1]);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir);
    const probe = await fetchPostingDocuments({ postingUrl: 'https://bids.example.net/bid', resourcesDir: dir, dryRun: true, budget: freeBudget(), fetchImpl: site.fetchImpl });
    assert.equal(probe.outcome.outcome, 'documents-found');
    assert.deepEqual(probe.rows.map(row => [row.document_status, row.signature, row.downloaded]), [['probed', 'pdf', false], ['probed', 'pdf', false]]);
    assert.deepEqual(await fs.readdir(dir), []);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('the posting is tried when HigherGov has no documents or no solicitation, not after an outage', () => {
  const read = (status, primary) => ({ completeness: { complete: false, status }, manifest: { primary_document: primary } });
  assert.equal(postingNeeded('document-list-empty', null), true);
  assert.equal(postingNeeded('access-blocked', null), true);
  assert.equal(postingNeeded('failed', null), false);
  assert.equal(postingNeeded('downloaded', read('partial-documents', null)), true);
  assert.equal(postingNeeded('downloaded', read('access-blocked', null)), true);
  // The solicitation was read; a missing scope file is a different gap.
  assert.equal(postingNeeded('downloaded', read('partial-documents', { role: 'solicitation' })), false);
  assert.equal(postingNeeded('downloaded', { completeness: { complete: true, status: 'full-text' }, manifest: {} }), false);
});

test("reading the set again reuses each file's extraction, and a posting file for another RFP is never scored", async () => {
  const dir = await tempDir();
  try {
    const highergov = path.join(dir, '01-other-notice.txt');
    const posting = path.join(dir, '02-solicitation-other.txt');
    await fs.writeFile(highergov, 'text on disk');
    await fs.writeFile(posting, 'Request for Proposals: Parking Citation Software. Proposals are due December 1.');
    const cache = new Map([[`${highergov}\nh1`, { text: 'Cached notice text', method: 'cached', status: 'ok', ocrPages: 0 }]]);
    const manifest = { documents: [
      { source_file_name: 'notice.txt', local_file_name: '01-other-notice.txt', local_path: highergov, downloaded: true, hash: 'h1', source: 'highergov' },
      { source_file_name: 'Other RFP Solicitation', local_file_name: '02-solicitation-other.txt', local_path: posting, downloaded: true, hash: 'h2',
        source: 'posting', match_required: true },
    ] };
    const extracted = await extractManifestEvidence(manifest, dir, { cache, rfp: { number: '', title: 'Recreation and Event Management Software' } });
    assert.equal(extracted.documents[0].text, 'Cached notice text');
    assert.equal(extracted.manifest.documents[0].extraction_method, 'cached');
    assert.deepEqual(extracted.documents.map(doc => doc.file), ['01-other-notice.txt']);
    assert.deepEqual([extracted.manifest.documents[1].match, extracted.manifest.documents[1].role, extracted.manifest.documents[1].required], ['unmatched', 'other', false]);
    assert.equal(extracted.manifest.primary_document, null);
    assert.equal(cache.size, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
