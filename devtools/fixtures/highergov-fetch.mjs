const solicitation = `Request for Proposal: Synthetic Case Management Portal
The agency seeks a custom-built, accessible case management portal with a secure data migration and API integration.
The vendor shall provide implementation services, user research, workflow design, testing, documentation, and support.
Proposals are due November 30, 2026. The estimated project value is $180,000.
`;

const requirements = `Statement of Work and Evaluation Criteria
The solution must support role-based access, audit logs, reporting, API integration, and WCAG accessibility.
Evaluation will consider technical approach, implementation plan, team experience, security, and cost.
`;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/opportunity/') {
    if (url.searchParams.get('api_key') !== 'fixture-key') throw new Error('Unexpected test API key.');
    return Response.json({
      results: [{
        version_key: 'fixture-version-1',
        opp_key: 'fixture-opportunity-1',
        document_path: 'fixture-document-path',
        path: 'https://example.test/synthetic-rfp',
        source_path: 'https://example.test/agency-posting',
      }],
      meta: { pagination: { pages: 1 } },
    });
  }
  if (url.hostname === 'www.highergov.com' && url.pathname === '/api-external/document/') {
    if (url.searchParams.get('related_key') !== 'fixture-document-path') throw new Error('Unexpected test document path.');
    if (process.env.ISA_RFP_FIXTURE_SCENARIO === 'empty') return Response.json({ results: [] });
    const records = [
      { id: 'document-1', file_name: 'Synthetic RFP Solicitation.txt', content_type: 'text/plain', download_url: 'https://fixture.invalid/solicitation.txt' },
      { id: 'document-2', file_name: 'Statement of Work Requirements.txt', content_type: 'text/plain', download_url: 'https://fixture.invalid/requirements.txt' },
    ];
    if (process.env.ISA_RFP_FIXTURE_SCENARIO === 'portal-gated') records[1].download_url = '';
    return Response.json({ results: records });
  }
  if (url.hostname === 'fixture.invalid' && url.pathname === '/solicitation.txt') {
    return new Response(solicitation, { headers: { 'content-type': 'text/plain' } });
  }
  if (url.hostname === 'fixture.invalid' && url.pathname === '/requirements.txt') {
    return new Response(requirements, { headers: { 'content-type': 'text/plain' } });
  }
  throw new Error(`Unexpected network request in local RFP fixture: ${url.origin}${url.pathname}`);
};
