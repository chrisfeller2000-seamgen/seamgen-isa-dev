// Synthetic local integration only. Any unrecognized outbound request is forbidden.
const text = {
  complete: 'Approved 5/7/75\nRevised 3/18/2008\nProposals shall be received no later than Monday, October 26, 2026, at 4:30 p.m. Atlantic Standard Time.',
  conflict: 'Proposal deadline: October 25, 2026.',
  invalid: 'Proposal due date: 24/7/365.',
};
const scenario = process.env.ISA_DEADLINE_FIXTURE_SCENARIO || 'complete';
const documentPath = 'https://www.highergov.com/api-external/document/?related_key=synthetic-deadline-record';

globalThis.fetch = async input => {
  const url = new URL(String(input));
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/opportunity/') {
    if (url.searchParams.get('api_key') !== 'fixture-key') throw new Error('Unexpected fixture API key.');
    return Response.json({ results: [{ version_key: 'synthetic-deadline-version', opp_key: 'synthetic-deadline-opportunity', document_path: documentPath }], meta: { pagination: { pages: 1 } } });
  }
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/document/') {
    if (url.searchParams.get('api_key') !== 'fixture-key') throw new Error('Unexpected fixture API key.');
    // This test covers scoring, not the separately repaired document URL contract.
    // Accept the repository and newer VM helper shapes; neither request leaves the process.
    if (![documentPath, 'synthetic-deadline-record'].includes(url.searchParams.get('related_key'))) throw new Error('Unexpected fixture document record.');
    if (scenario === 'empty') return Response.json({ results: [] });
    return Response.json({ results: [{ id: 'synthetic-deadline-document', file_name: 'Synthetic Solicitation.txt', content_type: 'text/plain', download_url: 'https://fixture.invalid/secondary-deadline.txt' }], meta: { pagination: { pages: 1 } } });
  }
  if (url.hostname === 'fixture.invalid' && url.pathname === '/secondary-deadline.txt' && text[scenario]) {
    return new Response(text[scenario], { headers: { 'content-type': 'text/plain' } });
  }
  throw new Error(`Forbidden request in deadline fixture: ${url.origin}${url.pathname}`);
};
