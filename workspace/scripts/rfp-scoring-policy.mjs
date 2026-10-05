import { assessDeadline, createAssessmentContext, parseDeadlineDate, timelinePoints } from './rfp-deadline.mjs';
import { classifyDocumentRecord, evaluateDocumentCompleteness } from './highergov-document-flow.mjs';

export const CATEGORY_BANDS = {
  caseStudy: { clone: [25, 25], sameCapability: [18, 24], adjacent: [12, 17], remote: [6, 11], none: [0, 5] },
  agencyTypeScore: { icp: [15, 15], adjacent: [10, 13], privateProof: [5, 9], none: [0, 4] },
  tech: { proven: [15, 15], mostlyKnown: [10, 14], halfNew: [5, 9], unfamiliar: [0, 4], agnostic: [13, 15] },
  ai: { central: [10, 10], component: [6, 9], potential: [3, 5], none: [0, 2] },
  deal: { sweetSpot: [10, 10], viable: [7, 9], large: [4, 6], veryLarge: [1, 3], uncertain: [0, 0] },
  compliance: { demonstrated: [10, 10], adjacent: [6, 9], standard: [3, 5], unfamiliar: [0, 2] },
  competitive: { favorable: [10, 10], someAdvantages: [7, 9], neutral: [4, 6], unfavorable: [1, 3], closed: [0, 0] },
};
const keys = Object.keys(CATEGORY_BANDS);
const money = value => {
  if (value === '' || value === null || value === undefined || !/^[\d,.\s$]+$/.test(String(value))) return null;
  const result = Number(String(value).replace(/[,$\s]/g, ''));
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const PRE_SOLICITATION = /request\s+for\s+information|\bRFI\b|sources?\s+sought|pre-?solicitation|market\s+research/i;

export function documentEvidence(documents = []) {
  const extractedTextByPath = new Map();
  const manifest = documents.map((doc, i) => {
    const file = doc.file || doc.name || `document-${i + 1}`;
    extractedTextByPath.set(file, String(doc.text || ''));
    return { ...classifyDocumentRecord({ file_name: file, text: doc.text }), local_file_name: file,
      source_file_name: file, downloaded: Boolean(doc.text), extracted: Boolean(norm(doc.text)), document_status: doc.text ? 'downloaded and extracted' : 'failed' };
  });
  return evaluateDocumentCompleteness({ manifest, extractedTextByPath });
}

export function scoringSources(input) {
  const frontmatter = input.candidate?.frontmatter || {};
  // Do not feed a prior run's scores, judgments, or auth-bearing document URLs
  // back to the judge as if they were current opportunity facts.
  const metadataKeys = ['title', 'agency_name', 'agency_type', 'due_date', 'captured_date',
    'val_est_low', 'val_est_high', 'description_text', 'ai_summary', 'opp_type', 'set_aside',
    'naics_code', 'version_key', 'opp_key', 'primary_contact_name', 'primary_contact_email'];
  const metadata = Object.fromEntries(metadataKeys.filter(key => frontmatter[key] !== undefined).map(key => [key, frontmatter[key]]));
  return [
    { id: 'metadata', kind: 'metadata', text: `${JSON.stringify(metadata)}\n${input.candidate?.body || ''}` },
    ...(input.documents || []).map((doc, i) => ({ id: `doc-${i + 1}`, kind: 'document',
      file: doc.file || doc.name || `document-${i + 1}`, text: String(doc.text || '') })),
    ...(input.companySources || []),
    ...(input.landscapeSources || []),
  ];
}

function cite(evidence, sources, { required = true, kind } = {}) {
  if (!Array.isArray(evidence) || (required && !evidence.length)) throw new Error('Missing scoring evidence.');
  for (const item of evidence) {
    const source = sources.get(item.sourceId);
    if (!source || (kind && !(Array.isArray(kind) ? kind : [kind]).includes(source.kind)) || !norm(item.quote) || !norm(source.text).includes(norm(item.quote))) {
      throw new Error('Scoring citation does not match the supplied evidence.');
    }
  }
}

export function assessProjectValue(frontmatter = {}, documents = []) {
  const estimates = [];
  for (const doc of documents) {
    // Match a project-value clause, never an arbitrary first dollar amount.
    for (const clause of String(doc.text || '').split(/[\n;]+/)) {
      if (/no (?:project )?budget (?:is )?stated|insurance|bond|coverage|previous award|prior award/i.test(clause)) continue;
      const match = clause.match(/(?:total project value|project budget|estimated project (?:size|value|cost)|contract value|budget(?: amount)?|not.to.exceed)\s*(?:is|of|:|=)?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk]\b)?/i);
      if (!match) continue;
      const amount = Number(match[1].replaceAll(',', '')) * (/^(m|million)$/i.test(match[2] || '') ? 1e6 : /^(k|thousand)$/i.test(match[2] || '') ? 1e3 : 1);
      const range = clause.slice(match.index + match[0].length).match(/^\s*(?:-|–|—|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk]\b)?/i);
      const high = range ? Number(range[1].replaceAll(',', '')) * (/^(m|million)$/i.test(range[2] || match[2] || '') ? 1e6 : /^(k|thousand)$/i.test(range[2] || match[2] || '') ? 1e3 : 1) : null;
      estimates.push({ amount, high, ceiling: /not.to.exceed/i.test(match[0]), evidence: match[0] + (range?.[0] || '') });
    }
  }
  const unique = [...new Set(estimates.map(item => `${item.amount}:${item.high ?? ''}:${item.ceiling}`))];
  if (unique.length > 1) return { status: 'conflicting', below: false, estimate: null, reason: 'Official project values conflict; do not pick the most favorable amount.' };
  if (unique.length === 1) {
    const { amount, high, ceiling, evidence } = estimates[0];
    if (high !== null && high < amount) return { status: 'conflicting', below: false, estimate: null, reason: 'Official project-value bounds are inconsistent.' };
    return { status: ceiling ? 'ceiling' : high !== null ? 'range' : 'stated', below: (high ?? amount) < 100000,
      estimate: high === null ? amount : null, low: high === null ? null : amount, high: high ?? (ceiling ? amount : null), reason: evidence };
  }
  const low = money(frontmatter.val_est_low), high = money(frontmatter.val_est_high);
  if (low !== null && high !== null && high < low) return { status: 'conflicting', below: false, estimate: null, reason: 'Listing value bounds are inconsistent.' };
  return { status: low === null && high === null ? 'unstated' : 'listing',
    below: high !== null && high < 100000, estimate: low !== null && high === low ? low : null,
    low, high, reason: 'HigherGov estimate, not a confirmed buyer budget. A low-only estimate is not an upper bound.' };
}

function timelineFor(input) {
  const phase = input.phase || 'full-text';
  const timeline = assessDeadline({ metadataDueDate: input.candidate?.frontmatter?.due_date,
    documents: phase === 'preliminary' ? [] : (input.documents || []).map(doc => ({ ...doc, name: doc.name || doc.file })), assessment: input.assessment || createAssessmentContext() });
  // Jake's cheap pass can use a valid listing date, but remains metadata-only.
  if (phase === 'preliminary' && timeline.status === 'metadata-only' && Number.isFinite(timeline.days)) {
    return { ...timeline, pass: timeline.days >= 10 && !timeline.expired, score: timelinePoints(timeline.days) };
  }
  return timeline;
}

// A result without a validated judgment. Only deterministic facts (deadline, known
// sub-$100K value) are recorded, and a known failure still wins; no category is scored.
export function unscoredRfp(input, reason = 'AI scoring is unavailable.', recommendation = null) {
  const timeline = timelineFor(input);
  const value = assessProjectValue(input.candidate?.frontmatter, input.documents);
  const failed = value.below || timeline.pass === false;
  return {
    gate: { gate1: timeline.pass, gate2: null, gate3: null, gate4: null, gate5: value.below ? false : null, gate6: null,
      gate1Due: timeline.due, gate1Days: timeline.days },
    categories: null, cp: null, timeline, value, total: null,
    qualification_status: failed ? 'failed-gate' : 'provisional',
    recommendation: failed ? 'No-bid' : recommendation || (timeline.pass === null ? 'Deadline needs review' : 'Needs review'),
    scoring_confidence: input.phase === 'preliminary' || !input.documents?.length ? 'metadata-only' : 'partial-documents',
    reasons: [reason], flags: [], judgments: null,
  };
}

export function finalizeRfpScore(input, judgment) {
  if (!judgment || typeof judgment !== 'object' || Array.isArray(judgment)) throw new Error('Expected a structured scoring judgment.');
  const sourceList = scoringSources(input);
  if (new Set(sourceList.map(s => s.id)).size !== sourceList.length) throw new Error('Duplicate scoring source IDs.');
  const sources = new Map(sourceList.map(source => [source.id, source]));
  // Judgments are persisted with the decision. Validate even non-decisive
  // citations so a no-bid route cannot retain invented supporting evidence.
  const pending = [judgment], visited = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Object.hasOwn(value, 'sourceId') || Object.hasOwn(value, 'quote')) cite([value], sources);
    pending.push(...Object.values(value));
  }
  const gate = {}, gateReasons = [];
  const gateNames = [1, 2, 3, 4, 5, 6].map(n => `gate${n}`);
  if (!judgment.gates || Object.keys(judgment.gates).sort().join() !== [...gateNames].sort().join()) throw new Error('Expected exactly six gates.');
  for (const name of gateNames) {
    const item = judgment.gates[name];
    if (!item || ![true, false, null].includes(item.pass) || !norm(item.reason)) throw new Error('Invalid gate judgment.');
    cite(item.evidence, sources);
    gate[name] = item.pass; gateReasons.push({ gate: name.replace('gate', 'Gate '), pass: item.pass, reason: item.reason });
  }
  const timeline = timelineFor(input);
  gate.gate1 = timeline.pass; gate.gate1Due = timeline.due; gate.gate1Days = timeline.days;
  gateReasons[0] = { gate: 'Gate 1', pass: timeline.pass, reason: timeline.note };
  const value = assessProjectValue(input.candidate?.frontmatter, input.documents);
  if (value.below) { gate.gate5 = false; gateReasons[4] = { gate: 'Gate 5', pass: false, reason: value.reason }; }
  if (judgment.value?.kind === 'inferred' && Number.isFinite(judgment.value.estimate) && judgment.value.estimate >= 0 && judgment.value.estimate < 100000) {
    if ((value.status === 'stated' && value.estimate !== judgment.value.estimate)
        || (['range', 'ceiling'].includes(value.status) && (judgment.value.estimate > value.high
          || (value.low !== null && judgment.value.estimate < value.low)))) throw new Error('Tiny-scope inference contradicts the official project value.');
    cite(judgment.value.evidence, sources);
    if (!norm(judgment.value.reason)) throw new Error('A tiny-scope estimate needs its basis.');
    gate.gate5 = false; gateReasons[4] = { gate: 'Gate 5', pass: false, reason: judgment.value.reason };
  }
  const phase = input.phase || 'full-text';
  // Subrules are explicit model judgments, not guesses made by scanning keywords.
  // Every assertion must be grounded in the supplied company and buyer records.
  if (judgment.subrules) {
    const { product, eligibility, submission } = judgment.subrules;
    if (!product || !eligibility || !submission) throw new Error('Missing Gate 2a, 4, or 6a assessment.');
    for (const item of [product, eligibility, submission]) cite(item.evidence, sources);
    if (![true, false, null].includes(product.hardProductObligations)) throw new Error('Invalid product obligations.');
    if (product.partner) {
      if (!norm(product.partner.name) || product.partner.verified !== true || product.partner.sellsThroughIntegrators !== true) throw new Error('Product partner is not verified for integrator delivery.');
      cite(product.partner.evidence, sources, { kind: 'company' });
      if (!product.partner.evidence.some(item => norm(item.quote).includes(norm(product.partner.name)))) throw new Error('Product partner is not named in the cited record.');
    }
    if (product.hardProductObligations === true && !product.partner && !judgment.conditional) gate.gate2 = false;
    if (product.hardProductObligations === null && gate.gate2 !== false) gate.gate2 = null;
    if (!['feasible', 'blocked', 'unknown'].includes(submission.status)) throw new Error('Invalid submission assessment.');
    if (submission.status === 'blocked') gate.gate4 = false;
    if (submission.status === 'unknown') gate.gate4 = null;
    if (submission.status === 'feasible' && !['existing-account', 'feasible-registration', 'allowed-method'].includes(submission.basis)) throw new Error('A contact email alone does not establish submission access.');
    if (eligibility.publicReferences !== null && (!Number.isInteger(eligibility.publicReferences) || eligibility.publicReferences < 0)) throw new Error('Invalid public-sector reference count.');
    if (eligibility.partner) {
      if (!norm(eligibility.partner.name) || eligibility.partner.verified !== true || !Number.isInteger(eligibility.partner.governmentReferences)) throw new Error('Unverified reference partner.');
      cite(eligibility.partner.evidence, sources, { kind: 'company' });
      if (!eligibility.partner.evidence.some(item => norm(item.quote).includes(norm(eligibility.partner.name)))) throw new Error('Reference partner is not named in the cited record.');
    }
    if (eligibility.publicReferences >= 3 && (!eligibility.partner || eligibility.partner.governmentReferences < eligibility.publicReferences)) gate.gate6 = false;
    if (eligibility.publicReferences > 0 && eligibility.publicReferences < 3 && !eligibility.partner) {
      cite(eligibility.companyEvidence, sources, { kind: ['company', 'case-study'] });
      if (!Number.isInteger(eligibility.availableGovernmentReferences) || eligibility.availableGovernmentReferences < eligibility.publicReferences) {
        gate.gate6 = eligibility.availableGovernmentReferences === null ? null : false;
      }
    }
    if (![true, false, null].includes(eligibility.meetsMandatoryQualifications)) throw new Error('Invalid qualification assessment.');
    if (eligibility.meetsMandatoryQualifications === false) gate.gate6 = false;
    if (eligibility.meetsMandatoryQualifications === null || eligibility.publicReferences === null) gate.gate6 = gate.gate6 === false ? false : null;
    // The real case-study library is company evidence for past delivery and
    // references. Named/current credentials and partners still need their
    // separate company-record checks below/above, not a project keyword.
    if (eligibility.meetsMandatoryQualifications === true && eligibility.requiresCompanyProof) cite(eligibility.companyEvidence, sources, { kind: ['company', 'case-study'] });
    if (eligibility.credentials) {
      if (!Array.isArray(eligibility.credentials)) throw new Error('Invalid credential evidence.');
      for (const claim of eligibility.credentials) {
        cite(claim.requirementEvidence, sources);
        if (!norm(claim.name) || ![true, false, null].includes(claim.held)) throw new Error('Invalid credential claim.');
        if (claim.held === true) {
          if (!norm(claim.holder) || parseDeadlineDate(claim.verifiedDate).status !== 'valid' || claim.verifiedDate > timeline.assessmentDate) throw new Error('Held credentials require a named holder and dated company evidence.');
          cite(claim.companyEvidence, sources, { kind: 'company' });
          if (!claim.companyEvidence.some(item => [claim.holder, claim.name, claim.verifiedDate].every(value => norm(item.quote).includes(norm(value))))) throw new Error('Credential holder, credential, or verification date is not in the cited record.');
        } else gate.gate6 = claim.held === false ? false : gate.gate6 === false ? false : null;
      }
    }
  } else throw new Error('Missing mandatory subrule assessments.');
  if (judgment.conditional && gate.gate2 === false) gate.gate2 = null;
  if (judgment.conditional?.qaStatus === 'closed' || judgment.conditional?.commercialOnly === true) gate.gate2 = false;
  for (let i = 1; i < gateReasons.length; i++) {
    const key = gateReasons[i].gate.replace('Gate ', 'gate');
    if (gateReasons[i].pass !== gate[key]) gateReasons[i] = { ...gateReasons[i], pass: gate[key], reason: `Gate ${i + 1} is unresolved or not met under its documented subrule; see the recorded evidence.` };
  }
  const failed = gateNames.find(name => gate[name] === false);
  const base = { gate, gateReasons, timeline, value, reasons: gateReasons.map(item => item.reason),
    flags: [], judgments: judgment, cp: { score: 0, signals: [] },
    categories: Object.fromEntries([...keys, 'timeline'].map(key => [key, 0])), total: null,
    scoring_confidence: phase === 'preliminary' ? 'metadata-only' : 'partial-documents', qualification_status: 'provisional' };

  // A known hard failure wins even when a separate deadline/document is unknown.
  if (failed) return { ...base, recommendation: 'No-bid', qualification_status: 'failed-gate' };
  if (judgment.bidStatus === 'closed' || judgment.bidStatus === 'watch') {
    cite(judgment.bidEvidence, sources);
    // Watch is Jake's light screen for pre-solicitation notices, not a way to park a live bid.
    if (judgment.bidStatus === 'watch' && !judgment.bidEvidence.some(item => PRE_SOLICITATION.test(item.quote))) {
      throw new Error('A watch item needs evidence of an RFI, Sources Sought, or pre-solicitation notice.');
    }
    return { ...base, recommendation: judgment.bidStatus === 'watch' ? 'Watch item' : 'Not an open bid' };
  }
  if (judgment.bidStatus !== 'open') throw new Error('Unknown bid eligibility.');
  if (timeline.pass === null) return { ...base, recommendation: 'Deadline needs review' };
  // An incomplete evidence package cannot support weighted scoring. Validate
  // this route before demanding categories the model rightly left unscored.
  const actualCompleteness = documentEvidence(input.documents);
  const completeness = input.completeness?.complete === false ? input.completeness : actualCompleteness;
  const missing = judgment.requiredDocuments;
  if (!Array.isArray(missing)) throw new Error('Expected a required-document check.');
  // Before documents are fetched, the judge may name documents to retrieve from the
  // listing. They are notes for the fetch step and never block preliminary selection.
  for (const requirement of missing) {
    cite(requirement.evidence, sources, { kind: phase === 'preliminary' ? 'metadata' : 'document' });
    if (!norm(requirement.name) || !Array.isArray(requirement.documentIds) || requirement.documentIds.some(id => sources.get(id)?.kind !== 'document')) throw new Error('Invalid required-document evidence.');
  }
  const incomplete = !completeness.complete || missing.some(item => !item.documentIds.length);
  if (phase === 'full-text' && incomplete) return { ...base, recommendation: 'Needs documents', document_status: 'partial-documents' };
  if (phase === 'preliminary' && missing.length) base.reasons.push(`Documents to retrieve: ${missing.map(item => item.name).join('; ')}.`);
  const categories = judgment.categories;
  if (!categories || Object.keys(categories).sort().join() !== [...keys, 'timeline'].sort().join()) throw new Error('Expected exactly eight scoring categories.');
  for (const key of keys) {
    const item = categories[key], band = CATEGORY_BANDS[key][item?.band];
    if (!item || !band || !Number.isInteger(item.points) || item.points < band[0] || item.points > band[1] || !norm(item.reason)) throw new Error(`Invalid ${key} category or rubric band.`);
    cite(item.evidence, sources);
    base.categories[key] = item.points;
  }
  if (base.categories.caseStudy > 5) {
    const match = categories.caseStudy;
    if (!norm(match.project)) throw new Error('A case-study match must name a real project.');
    // A bridge can cite the buyer's ask alongside our actual past work. Only
    // library evidence can establish the named project, never buyer text.
    const libraryEvidence = match.evidence.filter(item => sources.get(item.sourceId)?.kind === 'case-study');
    if (!libraryEvidence.length) throw new Error('Case-study citation needs actual library evidence.');
    cite(libraryEvidence, sources, { kind: 'case-study' });
    if (!libraryEvidence.some(item => norm(item.quote).includes(norm(match.project)))) throw new Error('Case-study project is not in the cited library evidence.');
  }
  for (const key of ['tech', 'compliance']) {
    const needsDeliveryProof = key === 'tech'
      ? ['proven', 'mostlyKnown', 'agnostic'].includes(categories[key].band)
      : ['demonstrated', 'adjacent'].includes(categories[key].band);
    if (needsDeliveryProof && !categories[key].evidence.some(item => ['case-study', 'company'].includes(sources.get(item.sourceId)?.kind))) throw new Error(`${key} needs actual delivery evidence, not a buyer requirement alone.`);
  }
  const deal = judgment.value;
  if (!deal || !['stated', 'inferred', 'uncertain'].includes(deal.kind)) throw new Error('Missing project-value judgment.');
  cite(deal.evidence, sources);
  if (phase === 'full-text' && deal.kind === 'stated') cite(deal.evidence, sources, { kind: 'document' });
  if (deal.kind === 'uncertain') {
    if (base.categories.deal !== 0) throw new Error('Uncertain possibly-tiny scope earns zero deal points.');
    base.reasons.push('Project value is uncertain; Peter review.');
  } else {
    if (!Number.isFinite(deal.estimate) || deal.estimate < 100000 || (value.status === 'stated' && value.estimate !== deal.estimate)
        || (['ceiling', 'range'].includes(value.status) && (deal.estimate > value.high || (value.low !== null && deal.estimate < value.low)))) throw new Error('Project estimate contradicts the value evidence.');
    if (value.low !== null && value.low !== undefined && deal.kind === 'stated' && deal.estimate < value.low) throw new Error('Estimate contradicts listing lower bound.');
    const expectedBand = deal.estimate >= 250000 && deal.estimate <= 3000000 ? 'sweetSpot'
      : deal.estimate <= 5000000 ? 'viable' : deal.estimate <= 10000000 ? 'large' : 'veryLarge';
    if (categories.deal.band !== expectedBand) throw new Error('Deal category does not match estimated size.');
    if (deal.kind === 'inferred' && !norm(deal.reason)) throw new Error('Inferred value needs a scope/comparable explanation.');
  }
  if (value.status === 'conflicting') base.reasons.push(value.reason);
  const position = judgment.competitive;
  if (!position || !['Open', 'Leaning wired', 'Wired', 'Insufficient evidence'].includes(position.verdict)) throw new Error('Missing landscape verdict.');
  if (!Number.isInteger(position.effortDeduction) || ![0, -2, -3, -4].includes(position.effortDeduction)) throw new Error('Invalid effort/structural deduction.');
  const wiredBounds = position.verdict === 'Leaning wired' ? [-4, -2] : position.verdict === 'Wired' ? [-8, -5] : [0, 0];
  if (!Number.isInteger(position.wiredDeduction) || position.wiredDeduction < wiredBounds[0] || position.wiredDeduction > wiredBounds[1]) throw new Error('Invalid wired deduction.');
  if (phase === 'preliminary' && (position.verdict !== 'Insufficient evidence' || position.wiredDeduction)) throw new Error('Do not derive a wired verdict from metadata.');
  if (position.verdict !== 'Insufficient evidence') {
    if (!Array.isArray(position.counterEvidence) || !position.counterEvidence.length) throw new Error('A landscape verdict requires counter-evidence checks.');
    cite(position.counterEvidence, sources);
    if (position.verdict !== 'Open') cite(position.tells, sources);
  } else base.reasons.push('Landscape research insufficient; competitive score remains provisional on this point.');
  if (position.effortDeduction) cite(position.evidence, sources);
  base.categories.competitive = Math.max(0, base.categories.competitive + position.effortDeduction + position.wiredDeduction);
  base.cp = { score: base.categories.competitive, base: categories.competitive.points, ...position, signals: [position.verdict] };
  base.categories.timeline = timeline.score;
  if (!categories.timeline || !Number.isInteger(categories.timeline.points)) throw new Error('Missing timeline category.');
  base.flags = (judgment.flags || []).map(flag => {
    if (!['sensitive-industry', 'ceo-connection'].includes(flag.type) || !norm(flag.reason)) throw new Error('Invalid review flag.');
    cite(flag.evidence, sources); return flag;
  });
  if (judgment.conditional) {
    const conditional = judgment.conditional;
    cite(conditional.evidence, sources);
    if (!norm(conditional.question) || !['2', '2a'].includes(conditional.rule)) throw new Error('Invalid conditional route.');
    const hypothetical = Object.values(base.categories).reduce((a, b) => a + b, 0);
    if (conditional.qaStatus === 'closed' || conditional.commercialOnly === true) return { ...base, recommendation: 'No-bid', qualification_status: 'failed-gate', gate: { ...gate, gate2: false } };
    if (conditional.qaStatus !== 'open') return { ...base, recommendation: 'Needs review' };
    if (phase === 'preliminary') return { ...base, recommendation: 'Needs review', conditional };
    // Product framing must be the sole unresolved blocker, not a shortcut
    // around unknown submission access, eligibility, or project size.
    if (gateNames.some(name => name !== 'gate2' && gate[name] === null)
        || deal.kind === 'uncertain' || value.status === 'conflicting') {
      return { ...base, recommendation: 'Needs review', conditional };
    }
    if (conditional.qaBasis !== 'confirmed-none-posted') {
      const qa = parseDeadlineDate(conditional.qaDueDate);
      const runDate = input.assessment?.runDate || timeline.assessmentDate;
      if (qa.status !== 'valid') return { ...base, recommendation: 'Needs review', conditional };
      if (qa.date < runDate) return { ...base, recommendation: 'No-bid', qualification_status: 'failed-gate', gate: { ...gate, gate2: false } };
      // A date-only assessment cannot prove that today's question cutoff is open.
      if (qa.date === runDate) return { ...base, recommendation: 'Needs review', conditional };
    }
    if (conditional.rule === '2' && (hypothetical < 50 || base.categories.caseStudy <= 5)) return { ...base, recommendation: 'No-bid', qualification_status: 'failed-gate', gate: { ...gate, gate2: false } };
    return { ...base, recommendation: 'Conditional — Ask the Agency', conditional };
  }
  if ((phase === 'full-text' && (gateNames.some(name => gate[name] === null) || deal.kind === 'uncertain')) || value.status === 'conflicting') return { ...base, recommendation: 'Needs review' };
  const total = Object.values(base.categories).reduce((a, b) => a + b, 0);
  return { ...base, total, recommendation: total >= 75 ? 'Strong Pursue' : total >= 50 ? 'Worth a look' : 'No-bid',
    qualification_status: phase === 'preliminary' ? 'provisional' : total >= 75 ? 'qualified' : 'rejected',
    scoring_confidence: phase === 'preliminary' ? 'metadata-only' : 'full-text',
    document_status: phase === 'preliminary' ? 'metadata-only' : 'full-text' };
}
