// Preload for a whole weekly run offline: two synthetic HigherGov listings, their
// documents, a recorded scoring judge, and an email writer that always fails so the
// code-built text is used. Any other network request fails the run.
import { installRecordedJudge, recordedJudgment, referenceJudgment } from './rfp-recorded-judgments.mjs';

await installRecordedJudge();
// The license renewal fails Jake's Gate 2; the portal passes every gate.
globalThis[Symbol.for('isa.rfp.testJudge')] = async ({ input, prompt }) => {
  const choice = /renewal/.test(input.candidate.slug) ? { gate2: false } : {};
  // The recorded judgment cites the whole candidate body; cite the listing's summary line,
  // which the scorer is given (intake writes the file with CRLF line endings).
  const summary = input.candidate.body.match(/## HigherGov AI summary\r?\n(.+)/)[1].trim();
  const judgment = recordedJudgment({ ...input, candidate: { ...input.candidate, body: summary } }, choice);
  return { text: JSON.stringify(referenceJudgment(judgment, JSON.parse(prompt).sources)), model: 'synthetic-recorded-judgment' };
};
globalThis[Symbol.for('isa.rfp.testWriter')] = async () => { throw new Error('No model in the offline weekly run.'); };

const LISTINGS = [
  {
    version_key: 'fixture-portal-v1', opp_key: 'fixture-portal', title: 'Synthetic Case Management Portal',
    agency: { agency_name: 'Example Public Agency' }, captured_date: '2026-10-08', due_date: '2026-11-30', val_est_low: '180000',
    ai_summary: 'The agency wants a custom case management portal with data migration, API integration, accessibility, workflow design, and implementation services.',
    path: 'https://example.test/synthetic-portal', source_path: 'https://example.test/agency-posting',
    document_path: 'https://www.highergov.com/api-external/document/?api_key=fixture-key&related_key=fixture-portal-documents',
  },
  {
    version_key: 'fixture-renewal-v1', opp_key: 'fixture-renewal', title: 'Synthetic License Renewal',
    agency: { agency_name: 'Example Public Agency' }, captured_date: '2026-10-08', due_date: '2026-11-30', val_est_low: '150000',
    ai_summary: 'The agency is renewing annual subscriptions for an existing commercial records product, including hosting and support from the product vendor.',
    path: 'https://example.test/synthetic-renewal', source_path: 'https://example.test/agency-renewal',
  },
  // Due four days after HigherGov listed it, so the intake filter drops it before scoring.
  {
    version_key: 'fixture-rush-v1', opp_key: 'fixture-rush', title: 'Synthetic Rush Website Refresh',
    agency: { agency_name: 'Example Town' }, captured_date: '2026-10-08', due_date: '2026-10-12',
    ai_summary: 'The town wants its website refreshed within two weeks.', path: 'https://example.test/synthetic-rush',
  },
  // The portal again under a new HigherGov version: scored once, the copy is audited as a duplicate.
  {
    version_key: 'fixture-portal-v2', opp_key: 'fixture-portal', title: 'Synthetic Case Management Portal',
    agency: { agency_name: 'Example Public Agency' }, captured_date: '2026-10-08', due_date: '2026-11-30', val_est_low: '180000',
    ai_summary: 'The agency wants a custom case management portal with data migration, API integration, accessibility, workflow design, and implementation services.',
    path: 'https://example.test/synthetic-portal-amended',
  },
];

// ISA_RFP_POSTING_SCENARIO: HigherGov has no documents for the portal listing, and its agency
// posting (example.test) has them ('found'), lists another RFP's file ('unmatched'), or is
// on a login portal the job never requests ('login-portal').
const POSTING_SCENARIO = process.env.ISA_RFP_POSTING_SCENARIO || '';
if (POSTING_SCENARIO === 'login-portal') LISTINGS[0].source_path = 'https://www.publicpurchase.com/gems/example,ca/bid/bidView?bidId=1';
const POSTING_PAGES = {
  found: '<html><body><h1>Synthetic Case Management Portal</h1><a href="/files/Synthetic%20RFP%20Solicitation.txt?token=abc">Synthetic RFP Solicitation</a> <a href="/files/Price%20Form.txt">Price Form</a></body></html>',
  unmatched: '<html><body><a href="/files/Other%20RFP%20Solicitation.txt">Other RFP Solicitation</a></body></html>',
};
const POSTING_FILES = {
  '/files/Synthetic RFP Solicitation.txt': 'solicitation.txt',
  '/files/Other RFP Solicitation.txt': 'other.txt',
};

const DOCUMENTS = {
  '/solicitation.txt': `Request for Proposal: Synthetic Case Management Portal
The agency seeks a custom-built, accessible case management portal with a secure data migration and API integration.
Proposals are due November 30, 2026. The estimated project value is $180,000.
`,
  '/requirements.txt': `Statement of Work and Evaluation Criteria
The solution must support role-based access, audit logs, reporting, API integration, and WCAG accessibility.
`,
  '/other.txt': `Request for Proposal: Synthetic Parking Enforcement Citations
The city seeks a parking citation system. Proposals are due November 30, 2026.
`,
};

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/opportunity/') {
    const results = LISTINGS.filter(item => item.captured_date === url.searchParams.get('captured_date'));
    return Response.json({ results, meta: { pagination: { count: results.length, pages: 1 } } });
  }
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/document/') {
    if (POSTING_SCENARIO) return Response.json({ results: [] });
    return Response.json({ results: [
      { id: 'document-1', file_name: 'Synthetic RFP Solicitation.txt', content_type: 'text/plain', download_url: 'https://fixture.invalid/solicitation.txt' },
      { id: 'document-2', file_name: 'Statement of Work Requirements.txt', content_type: 'text/plain', download_url: 'https://fixture.invalid/requirements.txt' },
    ] });
  }
  if (url.hostname === 'fixture.invalid' && DOCUMENTS[url.pathname]) {
    return new Response(DOCUMENTS[url.pathname], { headers: { 'content-type': 'text/plain' } });
  }
  // The agency posting. Anything but a GET fails the run: the job never posts to an agency.
  if (url.hostname === 'example.test' && POSTING_PAGES[POSTING_SCENARIO]) {
    if ((init.method || 'GET') !== 'GET') throw new Error(`The weekly run sent a ${init.method} to an agency site.`);
    if (url.pathname === '/robots.txt') return new Response('not found', { status: 404 });
    if (url.pathname === '/agency-posting') return new Response(POSTING_PAGES[POSTING_SCENARIO], { headers: { 'content-type': 'text/html' } });
    const file = POSTING_FILES[decodeURIComponent(url.pathname)];
    if (file) return new Response(DOCUMENTS[`/${file}`], { headers: { 'content-type': 'text/plain' } });
    return new Response('not found', { status: 404 });
  }
  throw new Error(`Unexpected network request in the offline weekly run: ${url.origin}${url.pathname}`);
};
