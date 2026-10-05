// Synthetic recorded model decisions. This is not a scoring engine and does not
// claim to reproduce Jake's subjective points. Tests supply explicit decisions
// to exercise the production validator and both callers, without API calls.
import fs from 'node:fs/promises';

export const companySources = [
  { id: 'case-library', kind: 'case-study', text: 'Example Secure Portal: custom Azure portal, data warehouse, AI analytics, security and HIPAA workflows. This is an invented test project.' },
  { id: 'company-assets', kind: 'company', text: 'Verified test record dated 2026-09-30: one clean government reference; no held Example Security Operations Certificate; required insurance is held. Example Civic Software is a verified teaming partner with three government references and sells through integrators. These are invented test facts, not Seamgen claims.' },
];

export async function fixturePolicies() {
  return Promise.all(['rfp-scoring-skill.md', 'rfp-preliminary-scoring-skill.md', 'rfp-solution-landscape-skill.md', 'rfp-capability-verification-skill.md']
    .map(async name => ({ name, text: await fs.readFile(new URL('../../workspace/skills/' + name, import.meta.url), 'utf8') })));
}

const decisions = {
  'three-public-references': { gate6: false, publicReferences: 3 },
  'verified-reference-partner': { publicReferences: 3, partner: true },
  'unheld-certification': { gate6: false, qualifications: false },
  'submission-blocked': { gate4: false, submission: 'blocked' },
  'closed-notice': { bidStatus: 'closed' },
  'value-unknown': { uncertain: true },
  'case-match-control': { ai: false },
  'case-match-bid': { ai: false },
  'ai-email': { ai: false },
};

export function recordedJudgment(input, overrides = {}) {
  const choice = { ...(decisions[input.candidate.slug || input.candidate.frontmatter.slug] || {}), ...overrides };
  const metadata = [{ sourceId: 'metadata', quote: input.candidate.body || input.candidate.frontmatter.title }];
  const evidence = input.phase !== 'preliminary' && input.documents?.length
    ? [{ sourceId: 'doc-1', quote: input.documents[0].text.split('\n')[0] }] : metadata;
  const company = [{ sourceId: 'company-assets', quote: companySources[1].text }];
  const project = [{ sourceId: 'case-library', quote: companySources[0].text }];
  const points = (band, value, why, citations = evidence) => ({ band, points: value, reason: why, evidence: citations });
  const estimate = Number(input.candidate.frontmatter.val_est_low) || 250000;
  const band = estimate >= 250000 && estimate <= 3000000 ? 'sweetSpot' : estimate <= 5000000 ? 'viable' : estimate <= 10000000 ? 'large' : 'veryLarge';
  const dealPoints = { sweetSpot: 10, viable: 8, large: 5, veryLarge: 2 }[band];
  return {
    gates: Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => ['gate' + n, { pass: choice['gate' + n] ?? true, reason: 'Recorded test Gate ' + n + ' judgment', evidence }])),
    subrules: {
      product: { hardProductObligations: false, partner: null, evidence },
      submission: { status: choice.submission || 'feasible', basis: 'feasible-registration', evidence },
      eligibility: { publicReferences: choice.publicReferences || 0, meetsMandatoryQualifications: choice.qualifications !== false, requiresCompanyProof: false, companyEvidence: company,
        partner: choice.partner ? { name: 'Example Civic Software', verified: true, governmentReferences: 3, evidence: company } : null, evidence },
    },
    categories: {
      caseStudy: { ...points('sameCapability', 20, 'Recorded comparable Azure portal', project), project: 'Example Secure Portal' },
      agencyTypeScore: points('icp', 15, 'Recorded local/state buyer fit', metadata),
      tech: points('proven', 15, 'Recorded proven Azure stack', project),
      ai: choice.ai === false ? points('none', 1, 'No AI requirement in this fixture') : points('component', 8, 'Recorded AI component'),
      deal: choice.uncertain ? points('uncertain', 0, 'Cannot infer above minimum') : points(band, dealPoints, 'Recorded size estimate', metadata),
      compliance: points('adjacent', 6, 'Recorded adjacent compliance delivery', project),
      competitive: points('someAdvantages', 7, 'Recorded base competitive position'),
      timeline: { points: 4 },
    },
    value: { kind: choice.uncertain ? 'uncertain' : 'inferred', estimate: choice.uncertain ? null : estimate, reason: 'Recorded scope and comparable test project basis', evidence: metadata },
    competitive: { verdict: 'Insufficient evidence', effortDeduction: 0, wiredDeduction: 0, tells: [], counterEvidence: [], evidence: [] },
    bidStatus: choice.bidStatus || 'open', bidEvidence: evidence, requiredDocuments: [], flags: [], conditional: null,
  };
}

export async function installRecordedJudge() {
  globalThis[Symbol.for('isa.rfp.testCompanySources')] = companySources;
  globalThis[Symbol.for('isa.rfp.testPolicies')] = await fixturePolicies();
  globalThis[Symbol.for('isa.rfp.testJudge')] = async ({ input, prompt }) => ({ text: JSON.stringify(referenceJudgment(recordedJudgment(input), JSON.parse(prompt).sources)), model: 'synthetic-recorded-judgment' });
}

// Fixture transport only: retain explicit, recorded decisions but select the
// actual excerpt IDs in the prompt. Production never repairs model quotes.
export function referenceJudgment(value, sources) {
  if (Array.isArray(value)) return value.map(item => referenceJudgment(item, sources));
  if (!value || typeof value !== 'object') return value;
  if (Object.hasOwn(value, 'sourceId') && Object.hasOwn(value, 'quote')) {
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const excerpt = sources.find(source => source.id === value.sourceId)?.excerpts.find(item => normalize(item.text).includes(normalize(value.quote)));
    if (!excerpt) throw new Error('Recorded fixture citation has no supplied excerpt.');
    return { excerptId: excerpt.id };
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, referenceJudgment(item, sources)]));
}
