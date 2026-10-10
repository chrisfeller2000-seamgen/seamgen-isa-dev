// Offline stand-in for ISA's scoring model. The weekly RFP job reads these hooks instead
// of loading the OpenClaw SDK, the scoring skills, and the real case-study library.
// The judgment is fixed and synthetic; the job's own finalizer still validates it, so a
// change to the output contract or the citation rules fails the fixture test.

const caseStudy = 'Synthetic Portal Project: Seamgen designed and built a custom, accessible case management portal with data migration and API integration for a public agency.';

globalThis[Symbol.for('isa.rfp.testPolicies')] = [
  { name: 'fixture-policy.md', text: 'Synthetic scoring policy for the offline RFP fixture.' },
];
globalThis[Symbol.for('isa.rfp.testCompanySources')] = [
  { id: 'case-library', kind: 'case-study', file: 'synthetic-case-studies.txt', text: caseStudy },
];

globalThis[Symbol.for('isa.rfp.testJudge')] = async ({ prompt }) => {
  const packet = JSON.parse(prompt);
  const firstExcerpt = kind => {
    const source = packet.sources.find(item => item.kind === kind && item.excerpts.length);
    return source ? [{ excerptId: source.excerpts[0].id }] : null;
  };
  const fullText = packet.phase === 'full-text';
  // Listing facts cite the listing; once documents are supplied, buyer facts cite them.
  const buyer = (fullText && firstExcerpt('document')) || firstExcerpt('metadata');
  const delivery = firstExcerpt('case-study');
  const gate = { pass: true, reason: 'Synthetic fixture pass.', evidence: buyer };
  const category = (band, points, evidence = buyer) => ({ band, points, reason: 'Synthetic fixture judgment.', evidence });

  return JSON.stringify({
    gates: Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [`gate${n}`, gate])),
    categories: {
      caseStudy: { ...category('sameCapability', 20, delivery), project: 'Synthetic Portal Project' },
      agencyTypeScore: category('icp', 15),
      tech: category('proven', 15, delivery),
      ai: category('none', 1),
      deal: category('viable', 8),
      compliance: category('standard', 4),
      competitive: category('neutral', 5),
      timeline: { points: 0 },
    },
    // The fixture solicitation states $180,000; before it is fetched, only the listing estimate exists.
    value: { kind: fullText ? 'stated' : 'inferred', estimate: 180000, reason: 'Synthetic fixture value.', evidence: buyer },
    competitive: { verdict: 'Insufficient evidence', effortDeduction: 0, wiredDeduction: 0, tells: [], counterEvidence: [], evidence: [] },
    bidStatus: 'open',
    bidEvidence: [],
    requiredDocuments: [],
    conditional: null,
    subrules: {
      product: { hardProductObligations: false, partner: null, evidence: buyer },
      submission: { status: 'feasible', basis: 'allowed-method', evidence: buyer },
      eligibility: { publicReferences: 0, availableGovernmentReferences: null, meetsMandatoryQualifications: true,
        requiresCompanyProof: false, companyEvidence: [], credentials: [], partner: null, evidence: buyer },
    },
    flags: [],
  });
};
