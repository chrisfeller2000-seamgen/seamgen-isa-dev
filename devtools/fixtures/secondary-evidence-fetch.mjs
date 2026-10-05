// Synthetic local integration only: one HigherGov listing per evidence situation.
// Any request this file does not recognize is refused, so the test cannot reach a real service.
const readable = 'Request for Proposals. The agency seeks a custom web portal build with secure data integration and accessibility.\n'
  + 'Proposals shall be received no later than Monday, October 26, 2026, at 4:30 p.m. Atlantic Standard Time.';
const blank = '      \n\n      ';
// Agencies often name the RFP after the project; the text still says what it is.
const projectNamed = readable + '\nScope of Work: build and support a citywide learning management system.';

// Files HigherGov "returns" for each listing, keyed by the scenario in its version_key.
export const documentsByScenario = {
  complete: [{ file_name: 'RFP_Final.txt', text: readable }],
  'named-by-project': [{ file_name: 'CITYWIDE_LEARNING_MANAGEMENT_SYSTEM.txt', text: projectNamed }],
  'unreadable-agreement': [
    { file_name: 'RFP 26-118 Website Redesign.txt', text: readable },
    { file_name: 'Exhibit A - SaaS Agreement.txt', text: blank },
  ],
  'short-notice': [{ file_name: '36C25227Q0040.txt', text: 'Solicitation Number 36C25227Q0040. Quotes are due October 16, 2026.' }],
  empty: [],
  'hardware-empty': [],
  'no-text': [{ file_name: 'Solicitation.txt', text: blank }],
  'agenda-only': [{ file_name: 'Final Agenda.txt', text: 'Pre-proposal conference agenda and sign-in sheet.' }],
  'price-sheet-only': [{ file_name: 'Price Sheet.txt', text: 'Line item, unit price, extended price.' }],
  'missing-attachment': [
    { file_name: 'RFP 26-118 Website Redesign.txt', text: readable },
    { file_name: 'Attachment A - Scope of Work.txt', text: blank },
  ],
  'download-error': [{ file_name: 'Solicitation.txt', throws: true }],
  'attachment-download-error': [
    { file_name: 'RFP 26-118 Website Redesign.txt', text: readable },
    { file_name: 'Attachment A - Scope of Work.txt', throws: true },
  ],
  'portal-gated': [{ file_name: 'Solicitation.txt', gated: true }],
};

const scenario = (key = '') => key.replace(/^evidence-/, '');
const listedScenarios = [...Object.keys(documentsByScenario), 'list-error', 'no-document-path'];

globalThis.fetch = async input => {
  const url = new URL(String(input));
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/opportunity/') {
    if (url.searchParams.get('api_key') !== 'fixture-key') throw new Error('Unexpected fixture API key.');
    // A server error for one capture date exercises the scorer's own lookup failure path.
    if (url.searchParams.get('captured_date') === '2026-09-21') return new Response('upstream error', { status: 500 });
    return Response.json({
      results: listedScenarios.map(name => ({
        version_key: `evidence-${name}`,
        opp_key: `evidence-${name}-opp`,
        ...(name === 'no-document-path' ? {} : { document_path: `https://www.highergov.com/api-external/document/?related_key=evidence-${name}` }),
      })),
      meta: { pagination: { pages: 1 } },
    });
  }
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/document/') {
    if (url.searchParams.get('api_key') !== 'fixture-key') throw new Error('Unexpected fixture API key.');
    const name = scenario(url.searchParams.get('related_key'));
    // 403 is not retried by the helper, so the failure is immediate.
    if (name === 'list-error') return new Response('forbidden', { status: 403 });
    const files = documentsByScenario[name];
    if (!files) throw new Error('Unexpected fixture document listing.');
    return Response.json({
      results: files.map((file, i) => ({
        id: `${name}-${i}`, file_name: file.file_name, content_type: 'text/plain',
        download_url: file.gated ? '' : `https://fixture.invalid/${name}/${i}?token=secret-token`,
      })),
      meta: { pagination: { pages: 1 } },
    });
  }
  if (url.hostname === 'fixture.invalid') {
    const [, name, index] = url.pathname.split('/');
    const file = documentsByScenario[name]?.[Number(index)];
    // The thrown message carries the signed link on purpose: reports must never repeat it.
    if (file?.throws) throw new Error(`Download failed for ${url.href}`);
    if (file) return new Response(file.text, { headers: { 'content-type': 'text/plain' } });
  }
  throw new Error(`Forbidden request in evidence fixture: ${url.origin}${url.pathname}`);
};
