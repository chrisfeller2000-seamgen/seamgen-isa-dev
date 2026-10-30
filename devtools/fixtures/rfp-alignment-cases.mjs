// Invented opportunities only. These are rubric-derived expectations for review,
// not outputs obtained by running Jake's Claude workflow or approved by Jake.
// Scoring cases run recorded judgments through the real validator/finalizer, so
// they prove the deterministic rules around a judgment, not AI agreement.
export const rubricContract = {
  assessmentDate: '2026-09-30',
  assessmentTimeZone: 'UTC',
  reference: {
    archive: 'jake-seamgen-rfp-system-main (1).zip',
    archiveCommit: 'ccf21a70bc7021c46f5cd393156b757e0a934f51',
    scoringSkillVersion: '1.8 — July 2026',
    scoringSkillSha256: '879c8717c36b83371629025fab66dd9a99d6a3e392fc65a00fc45da8e722be43',
    preliminarySkillSha256: 'b6879c51c41ad8019a138cbfd76fc519690ad9cf45aa9ec7c463b5a713d36725',
    approval: 'Rubric-derived; Jake has not reviewed this test batch.',
  },
  categories: { caseStudy: 25, agencyTypeScore: 15, tech: 15, ai: 10, deal: 10, compliance: 10, competitive: 10, timeline: 5 },
  rules: {
    timeline: 'Scoring skill Gate 1, plus the deployed September 30 deadline correction.',
    custom: 'Scoring skill Gate 2: material custom work can qualify alongside COTS.',
    hardware: 'Scoring skill Gate 3: software with incidental hardware is not hardware-only procurement.',
    submit: 'Scoring skill Gate 4: an unachievable submission path fails.',
    value: 'Scoring skill Gate 5: clearly under $100K fails; an unstated value does not automatically fail.',
    references: 'Scoring skill Gate 6a: three public-sector references require a verified named partner; generic commercial references are not excluded.',
    qualifications: 'Scoring skill Gate 6: evaluate actual held qualifications, not the presence of generic requirement words.',
    caseStudy: 'Scoring skill Category 1: ground the match in a real project, not unrelated substrings.',
    ai: 'Scoring skill Category 4: no AI component belongs in the 0–2 point band.',
    documents: 'Document fetch skill Step 7: ancillary files alone cannot establish a full-text score.',
    intake: 'HigherGov.Common.ps1 Test-HGPrefilter: excluded notice types, denied set-asides, and capture-date timeline; missing fields and a sole-source flag alone do not kill.',
    biddability: 'Project invariant: a notice explicitly inviting no submissions is not a Strong Pursue bid. This is a clarification for review, not a new Jake-approved kill gate.',
    scope: 'Project invariant (October 2026, RI PDMP): a portal cover sheet whose specification is unread is not a full-text score. Not a Jake-approved rule.',
  },
};

const baseScope = 'Custom build an Azure data warehouse with artificial intelligence and reporting. Security and implementation services are included.';
export const syntheticProfile = {
  minDaysToDue: 10,
  setAsideDenyList: ['8(a)', 'HUBZone', 'WOSB', 'SDVOSB'],
  setAsidePassList: ['Small Business', 'None', 'N/A'],
  excludedOppTypes: ['RFI', 'Request for Information', 'Sources Sought', 'Pre-Solicitation'],
  naics: ['541511'],
  // This is an invented company profile, not a current claim about Seamgen.
  governmentReferenceCount: 1,
  heldCertifications: [],
  verifiedPartners: [],
};

function scoringCase(id, name, options = {}, checks = []) {
  const { value = 250000, high = value, due = '2026-10-26', dueText = 'October 26, 2026', scope = baseScope, extra = '', noBudget = false } = options;
  const description = `${scope}\n${extra}`.trim();
  const budget = noBudget ? 'No budget stated; the scope could plausibly be either $50K or $500K.' : `Total project value: $${Number(value).toLocaleString('en-US')}.`;
  const text = `Request for Proposals\nProposal deadline: ${dueText}.\nScope of work: ${scope}\n${budget}\n${extra}`;
  const frontmatter = {
    title: 'Example Software Engagement', agency_name: 'City of Example', agency_type: 'Local',
    due_date: due, captured_date: rubricContract.assessmentDate,
    val_est_low: noBudget ? '' : String(value), val_est_high: noBudget ? '' : String(high),
    description_text: description, ai_summary: description,
  };
  return {
    id, name, kind: 'scoring',
    candidate: { title: frontmatter.title, issuer: frontmatter.agency_name, slug: id, frontmatter, body: description },
    record: {
      title: frontmatter.title, agency: { agency_name: frontmatter.agency_name },
      captured_date: rubricContract.assessmentDate, due_date: due,
      opp_type: { description: 'Solicitation' }, set_aside: '', sole_source_flag: false,
      naics_code: { naics_code: '541511' }, primary_contact_email: { contact_email: 'procurement@example.test' },
      description_text: description, val_est_low: frontmatter.val_est_low, val_est_high: frontmatter.val_est_high,
    },
    companyProfile: structuredClone(syntheticProfile),
    documents: options.documents ?? [{ file: '01-Solicitation.txt', text }],
    checks,
  };
}

function gate(number, value, rule) {
  return [{ field: `document.gate.gate${number}`, op: 'eq', expected: value, rule }];
}

export const alignmentCases = [
  scoringCase('clean-custom-build', 'Document-backed custom software request', {}, [
    ...[1, 2, 3, 4, 5, 6].flatMap(n => gate(n, true, ['timeline', 'custom', 'hardware', 'submit', 'value', 'qualifications'][n - 1])),
    { field: 'document.categoryCount', op: 'eq', expected: 8, rule: 'Eight weighted categories must be distinguishable, not one keyword-fit total.' },
  ]),
  scoringCase('value-5000', '$5K project is below the minimum', { value: 5000 }, gate(5, false, 'value')),
  scoringCase('value-99999', '$99,999 is still below the minimum', { value: 99999 }, gate(5, false, 'value')),
  scoringCase('value-100000', '$100K meets this gate only', { value: 100000 }, gate(5, true, 'value')),
  scoringCase('value-unknown', 'An unstated project value does not automatically fail', { noBudget: true }, gate(5, true, 'value')),
  scoringCase('hardware-negation', 'No hardware is being purchased', { extra: 'No hardware is being purchased. This is software work only.' }, gate(3, true, 'hardware')),
  scoringCase('commercial-references', 'Three references of any kind are allowed', { extra: 'Provide at least three related project references; commercial projects are accepted.' }, gate(6, true, 'references')),
  scoringCase('three-workshops', 'Three workshops are not a reference requirement', { extra: 'At least three stakeholder workshops are required.' }, gate(6, true, 'references')),
  scoringCase('three-public-references', 'Three public-sector references exceed the fixture profile', { extra: 'Provide 3 public-sector reference letters. The contractor has one government reference and no teaming partner.' }, gate(6, false, 'references')),
  scoringCase('verified-reference-partner', 'A verified named partner can supply three government references', { extra: 'Provide three government references. Named teaming partner Example Civic Software supplies all three, verified for this test.' }, gate(6, true, 'references')),
  scoringCase('unheld-certification', 'A mandatory certification is explicitly not held', { extra: 'Mandatory certification: Example Security Operations Certificate. The contractor does not hold this certificate and has no qualified teaming partner.' }, gate(6, false, 'qualifications')),
  scoringCase('insurance-proof', 'Proof of held insurance is not a missing qualification', { extra: 'Must provide proof of insurance. The contractor holds the required insurance.' }, gate(6, true, 'qualifications')),
  scoringCase('material-custom-cots', 'COTS with 60 percent custom development is not automatically excluded', { extra: 'The scope includes a COTS component, but 60% of the work is custom build and integration; the remaining 40% is licenses.' }, gate(2, true, 'custom')),
  scoringCase('submission-blocked', 'The submission portal is closed to this contractor', { extra: 'Vendor registration closed. The portal account must already be approved. The contractor is unable to submit.' }, gate(4, false, 'submit')),
  scoringCase('nine-days', 'Nine days is below the timeline minimum', { due: '2026-10-09', dueText: 'October 9, 2026' }, gate(1, false, 'timeline')),
  scoringCase('ten-days', 'Ten calendar days meets the timeline gate', { due: '2026-10-10', dueText: 'October 10, 2026' }, gate(1, true, 'timeline')),
  scoringCase('question-versus-proposal', 'A nearby question deadline does not replace the proposal deadline', { extra: 'Questions deadline: October 5, 2026.' }, gate(1, true, 'timeline')),
  scoringCase('approval-date', 'A form approval date does not replace the proposal deadline', { extra: 'Approved 5/7/75.' }, [
    ...gate(1, true, 'timeline'),
    { field: 'document.timeline.due', op: 'eq', expected: '2026-10-26', rule: 'timeline' },
    { field: 'document.categories.timeline', op: 'eq', expected: 4, rule: 'timeline' },
  ]),
  scoringCase('closed-notice', 'An explicit non-procurement notice is not a bid recommendation', { extra: 'This is a single source contract notification. This is not a procurement opportunity. No submissions are solicited.' }, [
    { field: 'document.recommendation', op: 'not', expected: 'Strong Pursue', rule: 'biddability' },
  ]),
  scoringCase('no-documents', 'No extracted documents cannot finalize the secondary score', { documents: [] }, [
    { field: 'document.total', op: 'eq', expected: null, rule: 'documents' },
    { field: 'document.recommendation', op: 'not', expected: 'Strong Pursue', rule: 'documents' },
  ]),
  scoringCase('rating-form-only', 'An evaluation form with a date is not the solicitation', { documents: [{ file: 'RFP COMMITTEE RATING FORM.txt', text: 'Proposal deadline: October 26, 2026. Evaluation form: technical approach 40%, team experience 30%, cost 30%.' }] }, [
    { field: 'document.total', op: 'eq', expected: null, rule: 'documents' },
  ]),
  // The shape of a state bid-board printout: dates, registration, a pointer to the real
  // specification and a list of attachments that HigherGov did not serve.
  scoringCase('portal-cover-sheet', 'A portal cover sheet that points to an unread specification is not the RFP', { documents: [{ file: '01-solicitation-RFP0000_solicitation_doc.pdf',
    text: 'Request for Proposals\nProposal deadline: October 26, 2026.\nSECTION 2. AGENCY SOLICITATION SPECIFICATIONS\nSee the Overview tab of this solicitation for the Agency Solicitation Specifications document.\nDocuments: Agency Solicitation Specification.pdf; Appendix C - Business and Technical Requirements.xlsx; Addendum A - Insurance Requirements.pdf\nVendors must register in the state procurement portal to submit.' }] }, [
    { field: 'document.recommendation', op: 'eq', expected: 'Needs documents', rule: 'scope' },
    { field: 'document.total', op: 'eq', expected: null, rule: 'scope' },
  ]),
  scoringCase('case-match-control', 'Control for incidental bid wording', { scope: 'Custom build a secure internal portal on Azure.' }),
  scoringCase('case-match-bid', 'The word bid does not establish a closer case study', { scope: 'Custom build a secure internal portal on Azure.', extra: 'Submit a bid.' }, [
    { field: 'document.categories.caseStudy', op: 'sameAs', caseId: 'case-match-control', otherField: 'document.categories.caseStudy', rule: 'caseStudy' },
  ]),
  scoringCase('ai-email', 'Email wording does not establish an AI component', { scope: 'Custom build a secure internal portal on Azure.', extra: 'Email the procurement contact for questions.' }, [
    { field: 'document.categories.ai', op: 'between', expected: [0, 2], rule: 'ai' },
  ]),
  ...[
    ['intake-rfi', 'An RFI is separated before full scoring', { opp_type: { description: 'Request for Information' } }, false],
    ['intake-set-aside', 'An unheld 8(a) set-aside is excluded', { set_aside: '8(a)' }, false],
    ['intake-missing-date', 'A missing listing date is flagged, not silently killed at intake', { due_date: '' }, true],
    ['intake-sole-flag', 'A sole-source flag alone is not proof of a closed notice', { sole_source_flag: 'True' }, true],
  ].map(([id, name, record, pass]) => {
    const fixture = scoringCase(id, name);
    return { ...fixture, kind: 'intake', record: { ...fixture.record, ...record }, checks: [{ field: 'intake.pass', op: 'eq', expected: pass, rule: 'intake' }] };
  }),
  { id: 'document-rfp-underscore', name: 'An underscore filename can still identify the RFP', kind: 'documents', records: [{ file_name: 'RFP_EXAMPLE_01.pdf', text: 'Scope of work, submission requirements, and evaluation criteria.' }], checks: [{ field: 'documents.classifications.0.role', op: 'eq', expected: 'solicitation', rule: 'documents' }] },
  { id: 'document-rating-only', name: 'A rating form alone is not a complete requirements package', kind: 'documents', records: [{ file_name: 'RFP COMMITTEE RATING FORM.pdf', text: 'Technical approach 40%, team experience 30%, cost 30%.' }], checks: [
    { field: 'documents.classifications.0.role', op: 'not', expected: 'solicitation', rule: 'documents' },
    { field: 'documents.completeness.complete', op: 'eq', expected: false, rule: 'documents' },
  ] },
  { id: 'document-required-missing', name: 'An unreadable required SOW keeps qualification incomplete', kind: 'documents', records: [
    { file_name: 'Solicitation.pdf', text: 'Scope, submission requirements, and evaluation criteria.' },
    { file_name: 'Statement of Work Requirements.pdf', text: '', downloaded: false, status: 'portal-gated' },
  ], checks: [{ field: 'documents.completeness.complete', op: 'eq', expected: false, rule: 'documents' }] },
];

alignmentCases.find(c => c.id === 'verified-reference-partner').companyProfile.verifiedPartners = [{ name: 'Example Civic Software', governmentReferenceCount: 3, verified: true }];
