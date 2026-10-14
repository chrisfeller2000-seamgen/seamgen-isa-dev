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
// Preliminary score at which ISA fetches the documents and scores the full text. Jake
// fetched only at 75+ because his browser-driven fetch was slow and manual; the HigherGov
// API makes it cheap, and listing-only scores of good software RFPs land around 60-70.
// The decision bands are unchanged: 75+ Strong Pursue, 50-74 Worth a look, below 50 No-bid.
export const DOCUMENT_FETCH_THRESHOLD = 50;
const money = value => {
  if (value === '' || value === null || value === undefined || !/^[\d,.\s$]+$/.test(String(value))) return null;
  const result = Number(String(value).replace(/[,$\s]/g, ''));
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const VALUE_CLAUSE = /(?:total project value|project budget|estimated project (?:size|value|cost)|contract value|budget(?: amount)?|not.to.exceed)\s*(?:is|of|:|=)?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk]\b)?/i;
const dollars = (digits, unit = '') => Number(digits.replaceAll(',', '')) * (/^(m|million)$/i.test(unit) ? 1e6 : /^(k|thousand)$/i.test(unit) ? 1e3 : 1);
const PRE_SOLICITATION = /request\s+for\s+information|\bRFI\b|sources?\s+sought|pre-?solicitation|market\s+research/i;

// Completeness of the supplied documents alone, using the shared document check.
export function documentEvidence(documents = []) {
  const manifest = documents.map((doc, i) => {
    const file = doc.file || doc.name || `document-${i + 1}`;
    return { ...classifyDocumentRecord({ file_name: file, text: doc.text }), local_file_name: file, source_file_name: file,
      downloaded: Boolean(doc.text), extracted: Boolean(norm(doc.text)), document_status: doc.text ? 'downloaded and extracted' : 'failed' };
  });
  return evaluateDocumentCompleteness({ manifest });
}

// The opportunity facts in a candidate.md body: HigherGov's summary and description.
// The rest of the body is not about the RFP. The intake's note to the old chat scorer
// says no attachment text was read, even when the full documents are now attached,
// and people wrote scores into the file (Jake's "KILL GATES … PASS" screens, as HTML
// comments or extra sections). A body without sections is a plain description and is kept.
const INTAKE_SECTIONS = ['## HigherGov AI summary', '## Opportunity description'];
export function intakeText(body) {
  const sections = String(body || '').replace(/<!--[\s\S]*?-->/g, '').split(/^(?=## )/m);
  if (sections.length === 1) return sections[0].trim();
  return sections.filter(section => INTAKE_SECTIONS.some(heading => section.startsWith(heading))).join('').trim();
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
    { id: 'metadata', kind: 'metadata', text: `${JSON.stringify(metadata)}\n${intakeText(input.candidate?.body)}` },
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
      const match = clause.match(VALUE_CLAUSE);
      if (!match) continue;
      const amount = dollars(match[1], match[2]);
      const range = clause.slice(match.index + match[0].length).match(/^\s*(?:-|–|—|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk]\b)?/i);
      const high = range ? dollars(range[1], range[2] || match[2]) : null;
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
  const below = high !== null && high < 100000;
  return { status: low === null && high === null ? 'unstated' : 'listing',
    below, estimate: low !== null && high === low ? low : null, low, high,
    reason: below ? `The HigherGov listing estimate tops out at $${high.toLocaleString('en-US')}, below the $100,000 minimum.`
      : 'HigherGov estimate, not a confirmed buyer budget. A low-only estimate is not an upper bound.' };
}

function timelineFor(input) {
  const phase = input.phase || 'full-text';
  const timeline = assessDeadline({ metadataDueDate: input.candidate?.frontmatter?.due_date,
    documents: phase === 'preliminary' ? [] : (input.documents || []).map(doc => ({ ...doc, name: doc.name || doc.file })), assessment: input.assessment || createAssessmentContext() });
  // Jake used the listing date when nothing else gave one. Before documents it passes;
  // when the documents don't state a deadline, Gate 1 stays open (a blocker to confirm)
  // but still earns its timeline points. A listing date under 10 days or past fails.
  if (timeline.status === 'metadata-only' && Number.isFinite(timeline.days)) {
    const ok = timeline.days >= 10 && !timeline.expired;
    const confirm = phase === 'preliminary' ? 'the solicitation must confirm it' : "the documents don't state one, so confirm it";
    const note = timeline.expired ? 'The listing deadline has passed.'
      : `The listing deadline is ${timeline.days} days away${ok ? `; ${confirm}` : ', below the 10-day minimum'}.`;
    return { ...timeline, pass: ok ? (phase === 'preliminary' || null) : false, score: timelinePoints(timeline.days), note };
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

const GATE_NAMES = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
// Gate 6a standing company fact (rfp-scoring-skill.md): Seamgen has one clean
// government reference, Florida DEP. It is not re-proven per RFP.
const GOVERNMENT_REFERENCES = 1;
const BID_STATUS = { open: null, closed: 'Not an open bid', watch: 'Watch item' };

function sourceMap(input) {
  const list = scoringSources(input);
  if (new Set(list.map(source => source.id)).size !== list.length) throw new Error('Duplicate scoring source IDs.');
  return new Map(list.map(source => [source.id, source]));
}

// Judgments are persisted with the decision. Validate even non-decisive
// citations so a no-bid route cannot retain invented supporting evidence.
function validateAllCitations(judgment, sources) {
  const pending = [judgment], visited = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Object.hasOwn(value, 'sourceId') || Object.hasOwn(value, 'quote')) cite([value], sources);
    pending.push(...Object.values(value));
  }
}

function requireNamedPartner(partner, sources, label) {
  cite(partner.evidence, sources, { kind: 'company' });
  if (!partner.evidence.some(item => norm(item.quote).includes(norm(partner.name)))) throw new Error(`${label} partner is not named in the cited record.`);
}

// Subrules are explicit model judgments, not guesses made by scanning keywords.
// Every assertion must be grounded in the supplied company and buyer records.
function applySubrules(gate, judgment, sources, timeline) {
  if (!judgment.subrules) throw new Error('Missing mandatory subrule assessments.');
  const { product, eligibility, submission } = judgment.subrules;
  if (!product || !eligibility || !submission) throw new Error('Missing Gate 2a, 4, or 6a assessment.');
  // A definite assessment needs evidence. "Unknown" has nothing to cite and never passes a gate.
  cite(product.evidence, sources, { required: product.hardProductObligations !== null });
  cite(submission.evidence, sources, { required: submission.status !== 'unknown' });
  cite(eligibility.evidence, sources);

  // Gate 2a: existing installs or mandatory demos need a real integrator partner or a conditional question.
  if (![true, false, null].includes(product.hardProductObligations)) throw new Error('Invalid product obligations.');
  if (product.partner) {
    if (!norm(product.partner.name) || product.partner.verified !== true || product.partner.sellsThroughIntegrators !== true) {
      throw new Error('Product partner is not verified for integrator delivery.');
    }
    requireNamedPartner(product.partner, sources, 'Product');
  }
  if (product.hardProductObligations === true && !product.partner && !judgment.conditional) gate.gate2 = false;
  if (product.hardProductObligations === null && gate.gate2 !== false) gate.gate2 = null;

  // Gate 4: a buyer's contact email is not an allowed submission method.
  if (!['feasible', 'blocked', 'unknown'].includes(submission.status)) throw new Error('Invalid submission assessment.');
  if (submission.status === 'blocked') gate.gate4 = false;
  if (submission.status === 'unknown') gate.gate4 = null;
  if (submission.status === 'feasible' && !['existing-account', 'feasible-registration', 'allowed-method'].includes(submission.basis)) {
    throw new Error('A contact email alone does not establish submission access.');
  }

  // Gates 6/6a: actual mandatory qualifications and the public-sector reference ceiling.
  if (eligibility.publicReferences !== null && (!Number.isInteger(eligibility.publicReferences) || eligibility.publicReferences < 0)) {
    throw new Error('Invalid public-sector reference count.');
  }
  if (eligibility.partner) {
    if (!norm(eligibility.partner.name) || eligibility.partner.verified !== true || !Number.isInteger(eligibility.partner.governmentReferences)) {
      throw new Error('Unverified reference partner.');
    }
    requireNamedPartner(eligibility.partner, sources, 'Reference');
  }
  if (eligibility.publicReferences >= 3 && (!eligibility.partner || eligibility.partner.governmentReferences < eligibility.publicReferences)) gate.gate6 = false;
  if (eligibility.publicReferences > 0 && eligibility.publicReferences < 3 && !eligibility.partner) {
    cite(eligibility.companyEvidence, sources, { kind: ['company', 'case-study'] });
    // Jake's standing fact covers one; a second needs the model to confirm the RFP accepts it.
    const available = eligibility.availableGovernmentReferences ?? GOVERNMENT_REFERENCES;
    if (!Number.isInteger(available) || available < eligibility.publicReferences) {
      gate.gate6 = eligibility.availableGovernmentReferences === null ? null : false;
    }
  }
  if (![true, false, null].includes(eligibility.meetsMandatoryQualifications)) throw new Error('Invalid qualification assessment.');
  if (eligibility.meetsMandatoryQualifications === false) gate.gate6 = false;
  if (eligibility.meetsMandatoryQualifications === null || eligibility.publicReferences === null) gate.gate6 = gate.gate6 === false ? false : null;
  // The real case-study library is company evidence for past delivery and
  // references. Named/current credentials and partners still need their
  // separate company-record checks, not a project keyword.
  if (eligibility.meetsMandatoryQualifications === true && eligibility.requiresCompanyProof) {
    cite(eligibility.companyEvidence, sources, { kind: ['company', 'case-study'] });
  }
  if (!eligibility.credentials) return;
  if (!Array.isArray(eligibility.credentials)) throw new Error('Invalid credential evidence.');
  for (const claim of eligibility.credentials) {
    cite(claim.requirementEvidence, sources);
    if (!norm(claim.name) || ![true, false, null].includes(claim.held)) throw new Error('Invalid credential claim.');
    if (claim.held !== true) {
      gate.gate6 = claim.held === false || gate.gate6 === false ? false : null;
      continue;
    }
    if (!norm(claim.holder) || parseDeadlineDate(claim.verifiedDate).status !== 'valid' || claim.verifiedDate > timeline.assessmentDate) {
      throw new Error('Held credentials require a named holder and dated company evidence.');
    }
    cite(claim.companyEvidence, sources, { kind: 'company' });
    if (!claim.companyEvidence.some(item => [claim.holder, claim.name, claim.verifiedDate].every(value => norm(item.quote).includes(norm(value))))) {
      throw new Error('Credential holder, credential, or verification date is not in the cited record.');
    }
  }
}

// The judge's six gate answers, overridden by deterministic facts (deadline, value)
// and by the documented subrules. Gate reasons are kept in step with the final gates.
function resolveGates(judgment, sources, timeline, value) {
  if (!judgment.gates || Object.keys(judgment.gates).sort().join() !== GATE_NAMES.join()) throw new Error('Expected exactly six gates.');
  const gate = {}, gateReasons = [];
  for (const name of GATE_NAMES) {
    const item = judgment.gates[name];
    if (!item || ![true, false, null].includes(item.pass) || !norm(item.reason)) throw new Error('Invalid gate judgment.');
    // An unknown gate still needs a reason, but has nothing to cite and never passes.
    cite(item.evidence, sources, { required: item.pass !== null });
    gate[name] = item.pass;
    gateReasons.push({ gate: name.replace('gate', 'Gate '), pass: item.pass, reason: item.reason });
  }
  gate.gate1 = timeline.pass; gate.gate1Due = timeline.due; gate.gate1Days = timeline.days;
  gateReasons[0] = { gate: 'Gate 1', pass: timeline.pass, reason: timeline.note };
  if (value.below) { gate.gate5 = false; gateReasons[4] = { gate: 'Gate 5', pass: false, reason: value.reason }; }
  const estimate = judgment.value?.estimate;
  if (judgment.value?.kind === 'inferred' && Number.isFinite(estimate) && estimate >= 0 && estimate < 100000) {
    if ((value.status === 'stated' && value.estimate !== estimate)
        || (['range', 'ceiling'].includes(value.status) && (estimate > value.high || (value.low !== null && estimate < value.low)))) {
      throw new Error('Tiny-scope inference contradicts the official project value.');
    }
    cite(judgment.value.evidence, sources);
    if (!norm(judgment.value.reason)) throw new Error('A tiny-scope estimate needs its basis.');
    gate.gate5 = false; gateReasons[4] = { gate: 'Gate 5', pass: false, reason: judgment.value.reason };
  }
  applySubrules(gate, judgment, sources, timeline);
  if (judgment.conditional && gate.gate2 === false) gate.gate2 = null;
  if (judgment.conditional?.qaStatus === 'closed' || judgment.conditional?.commercialOnly === true) gate.gate2 = false;
  for (let i = 1; i < gateReasons.length; i++) {
    if (gateReasons[i].pass !== gate[GATE_NAMES[i]]) {
      gateReasons[i] = { ...gateReasons[i], pass: gate[GATE_NAMES[i]], reason: `Gate ${i + 1} is unresolved or not met under its documented subrule; see the recorded evidence.` };
    }
  }
  return { gate, gateReasons };
}

// Closed notices and Jake's light-screen watch items are not open bids.
function closedOrWatch(judgment, sources) {
  if (!Object.hasOwn(BID_STATUS, judgment.bidStatus)) throw new Error('Unknown bid eligibility.');
  if (judgment.bidStatus === 'open') return null;
  cite(judgment.bidEvidence, sources);
  // Watch is Jake's light screen for pre-solicitation notices, not a way to park a live bid.
  if (judgment.bidStatus === 'watch' && !judgment.bidEvidence.some(item => PRE_SOLICITATION.test(item.quote))) {
    throw new Error('A watch item needs evidence of an RFI, Sources Sought, or pre-solicitation notice.');
  }
  return BID_STATUS[judgment.bidStatus];
}

function requiredDocuments(judgment, sources, phase) {
  const missing = judgment.requiredDocuments;
  if (!Array.isArray(missing)) throw new Error('Expected a required-document check.');
  // Before documents are fetched, the judge may name documents to retrieve from the
  // listing. They are notes for the fetch step and never block preliminary selection.
  for (const requirement of missing) {
    cite(requirement.evidence, sources, { kind: phase === 'preliminary' ? 'metadata' : 'document' });
    if (!norm(requirement.name) || !Array.isArray(requirement.documentIds) || requirement.documentIds.some(id => sources.get(id)?.kind !== 'document')) {
      throw new Error('Invalid required-document evidence.');
    }
  }
  return missing;
}

// Validates each category's band and grounding; returns their points.
function categoryPoints(categories, sources) {
  if (!categories || Object.keys(categories).sort().join() !== [...keys, 'timeline'].sort().join()) throw new Error('Expected exactly eight scoring categories.');
  const points = {};
  for (const key of keys) {
    const item = categories[key], band = CATEGORY_BANDS[key][item?.band];
    if (!item || !band || !Number.isInteger(item.points) || item.points < band[0] || item.points > band[1] || !norm(item.reason)) {
      throw new Error(`Invalid ${key} category or rubric band.`);
    }
    cite(item.evidence, sources);
    points[key] = item.points;
  }
  if (points.caseStudy > 5) {
    const match = categories.caseStudy;
    if (!norm(match.project)) throw new Error('A case-study match must name a real project.');
    // A bridge can cite the buyer's ask alongside our actual past work. Only
    // library evidence can establish the named project, never buyer text.
    const libraryEvidence = match.evidence.filter(item => sources.get(item.sourceId)?.kind === 'case-study');
    if (!libraryEvidence.length) throw new Error('Case-study citation needs actual library evidence.');
    cite(libraryEvidence, sources, { kind: 'case-study' });
    if (!libraryEvidence.some(item => norm(item.quote).includes(norm(match.project)))) throw new Error('Case-study project is not in the cited library evidence.');
  }
  for (const [key, bandsNeedingProof] of [['tech', ['proven', 'mostlyKnown', 'agnostic']], ['compliance', ['demonstrated', 'adjacent']]]) {
    if (bandsNeedingProof.includes(categories[key].band) && !categories[key].evidence.some(item => ['case-study', 'company'].includes(sources.get(item.sourceId)?.kind))) {
      throw new Error(`${key} needs actual delivery evidence, not a buyer requirement alone.`);
    }
  }
  if (!categories.timeline || !Number.isInteger(categories.timeline.points)) throw new Error('Missing timeline category.');
  return points;
}

// The judged project size must agree with official value evidence and the deal band.
function validateDealSize(deal, dealBand, points, value, sources, phase, reasons) {
  if (!deal || !['stated', 'inferred', 'uncertain'].includes(deal.kind)) throw new Error('Missing project-value judgment.');
  cite(deal.evidence, sources);
  if (phase === 'full-text' && deal.kind === 'stated') cite(deal.evidence, sources, { kind: 'document' });
  if (deal.kind === 'uncertain') {
    if (points !== 0) throw new Error('Uncertain possibly-tiny scope earns zero deal points.');
    reasons.push('Project value is uncertain; Peter review.');
    return;
  }
  if (!Number.isFinite(deal.estimate) || deal.estimate < 100000 || (value.status === 'stated' && value.estimate !== deal.estimate)
      || (['ceiling', 'range'].includes(value.status) && (deal.estimate > value.high || (value.low !== null && deal.estimate < value.low)))) {
    throw new Error('Project estimate contradicts the value evidence.');
  }
  if (value.low !== null && value.low !== undefined && deal.kind === 'stated' && deal.estimate < value.low) throw new Error('Estimate contradicts listing lower bound.');
  // For overlapping size-band endpoints, the highest applicable band wins.
  const expectedBand = deal.estimate >= 250000 && deal.estimate <= 3000000 ? 'sweetSpot'
    : deal.estimate <= 5000000 ? 'viable' : deal.estimate <= 10000000 ? 'large' : 'veryLarge';
  if (dealBand !== expectedBand) throw new Error('Deal category does not match estimated size.');
  if (deal.kind === 'inferred' && !norm(deal.reason)) throw new Error('Inferred value needs a scope/comparable explanation.');
}

// Category 7: bounded effort/structural and wired-RFP deductions, applied once.
function competitivePosition(position, basePoints, sources, phase, reasons) {
  if (!position || !['Open', 'Leaning wired', 'Wired', 'Insufficient evidence'].includes(position.verdict)) throw new Error('Missing landscape verdict.');
  if (!Number.isInteger(position.effortDeduction) || ![0, -2, -3, -4].includes(position.effortDeduction)) throw new Error('Invalid effort/structural deduction.');
  const wiredBounds = position.verdict === 'Leaning wired' ? [-4, -2] : position.verdict === 'Wired' ? [-8, -5] : [0, 0];
  if (!Number.isInteger(position.wiredDeduction) || position.wiredDeduction < wiredBounds[0] || position.wiredDeduction > wiredBounds[1]) {
    throw new Error('Invalid wired deduction.');
  }
  if (phase === 'preliminary' && (position.verdict !== 'Insufficient evidence' || position.wiredDeduction)) throw new Error('Do not derive a wired verdict from metadata.');
  if (position.verdict !== 'Insufficient evidence') {
    if (!Array.isArray(position.counterEvidence) || !position.counterEvidence.length) throw new Error('A landscape verdict requires counter-evidence checks.');
    cite(position.counterEvidence, sources);
    if (position.verdict !== 'Open') cite(position.tells, sources);
  } else reasons.push('Landscape research insufficient; competitive score remains provisional on this point.');
  if (position.effortDeduction) cite(position.evidence, sources);
  const score = Math.max(0, basePoints + position.effortDeduction + position.wiredDeduction);
  return { score, base: basePoints, ...position, signals: [position.verdict] };
}

function reviewFlags(flags = [], sources) {
  return flags.map(flag => {
    if (!['sensitive-industry', 'ceo-connection'].includes(flag.type) || !norm(flag.reason)) throw new Error('Invalid review flag.');
    cite(flag.evidence, sources);
    return flag;
  });
}

// One sum for the final total, the conditional route's check, and the potential total.
const categoryTotal = categories => Object.values(categories).reduce((a, b) => a + b, 0);

// Gates 2/2a "Conditional — Ask the Agency": product framing must be the sole
// unresolved blocker and the question window must still be open.
function conditionalOutcome(base, judged, { sources, runDate, phase, deal, value }) {
  // The output contract shows the rule as 2|2a, and models answer 2 as a number.
  const conditional = { ...judged, rule: String(judged.rule ?? '') };
  cite(conditional.evidence, sources);
  if (!norm(conditional.question) || !['2', '2a'].includes(conditional.rule)) throw new Error('Invalid conditional route.');
  const noBid = { ...base, recommendation: 'No-bid', qualification_status: 'failed-gate', gate: { ...base.gate, gate2: false } };
  if (conditional.qaStatus === 'closed' || conditional.commercialOnly === true) return noBid;
  if (conditional.qaStatus !== 'open') return { ...base, recommendation: 'Needs review' };
  const review = { ...base, recommendation: 'Needs review', conditional };
  if (phase === 'preliminary') return review;
  // Not a shortcut around unknown submission access, eligibility, or project size.
  if (GATE_NAMES.some(name => name !== 'gate2' && base.gate[name] === null) || deal.kind === 'uncertain' || value.status === 'conflicting') return review;
  if (conditional.qaBasis !== 'confirmed-none-posted') {
    const qa = parseDeadlineDate(conditional.qaDueDate);
    if (qa.status !== 'valid') return review;
    if (qa.date < runDate) return noBid;
    // A date-only assessment cannot prove that today's question cutoff is open.
    if (qa.date === runDate) return review;
  }
  const hypothetical = categoryTotal(base.categories);
  if (conditional.rule === '2' && (hypothetical < 50 || base.categories.caseStudy <= 5)) return noBid;
  return { ...base, recommendation: 'Conditional — Ask the Agency', conditional };
}

export function finalizeRfpScore(input, judgment) {
  if (!judgment || typeof judgment !== 'object' || Array.isArray(judgment)) throw new Error('Expected a structured scoring judgment.');
  const phase = input.phase || 'full-text';
  const sources = sourceMap(input);
  validateAllCitations(judgment, sources);
  const timeline = timelineFor(input);
  const value = assessProjectValue(input.candidate?.frontmatter, input.documents);
  const { gate, gateReasons } = resolveGates(judgment, sources, timeline, value);
  const base = { gate, gateReasons, timeline, value, reasons: gateReasons.map(item => item.reason),
    flags: [], judgments: judgment, cp: null, categories: null, total: null,
    scoring_confidence: phase === 'preliminary' ? 'metadata-only' : 'partial-documents', qualification_status: 'provisional' };

  // A known hard failure wins even when a separate deadline/document is unknown.
  if (GATE_NAMES.some(name => gate[name] === false)) return { ...base, recommendation: 'No-bid', qualification_status: 'failed-gate' };
  const notOpen = closedOrWatch(judgment, sources);
  if (notOpen) return { ...base, recommendation: notOpen };
  // An unconfirmed deadline never passes Gate 1 or earns timeline points, but the rest
  // of the RFP is still scored below, so the team sees what it would score once the
  // date is confirmed. Older answers may have omitted categories on this route.
  if (timeline.pass === null && !judgment.categories) return { ...base, recommendation: 'Deadline needs review' };
  // An incomplete evidence package cannot support weighted scoring. Check this
  // route before demanding categories the model rightly left unscored. A caller
  // can only make completeness stricter than the supplied documents show.
  const missing = requiredDocuments(judgment, sources, phase);
  const completeness = input.completeness?.complete === false ? input.completeness : documentEvidence(input.documents);
  if (phase === 'full-text' && !completeness.complete) return { ...base, recommendation: 'Needs documents', document_status: 'partial-documents' };
  // The solicitation was read, but it refers to a document we don't have (an exhibit, a
  // form). Like Jake, score what we have and list the document as a blocker, unless the
  // model couldn't score the categories without it.
  const unread = phase === 'full-text' ? missing.filter(item => !item.documentIds.length) : [];
  if (unread.length && !judgment.categories) return { ...base, recommendation: 'Needs documents', document_status: 'partial-documents' };
  if (unread.length) base.reasons.push(`Missing referenced document: ${unread.map(item => item.name).join('; ')}.`);
  if (phase === 'preliminary' && missing.length) base.reasons.push(`Documents to retrieve: ${missing.map(item => item.name).join('; ')}.`);

  const categories = categoryPoints(judgment.categories, sources);
  validateDealSize(judgment.value, judgment.categories.deal.band, categories.deal, value, sources, phase, base.reasons);
  if (value.status === 'conflicting') base.reasons.push(value.reason);
  const cp = competitivePosition(judgment.competitive, categories.competitive, sources, phase, base.reasons);
  const scoredCategories = { ...categories, competitive: cp.score, timeline: timeline.score };
  // What the categories add up to before an open gate is settled. A Needs review or
  // conditional result has no total; the weekly update shows this as the score if the
  // team confirms the open question. It never changes a decision.
  const scored = { ...base, cp, categories: scoredCategories, potential_total: categoryTotal(scoredCategories), flags: reviewFlags(judgment.flags, sources) };
  // A listing-only deadline is scored as an open gate; missing or conflicting dates are not.
  if (timeline.pass === null && timeline.status !== 'metadata-only') return { ...scored, recommendation: 'Deadline needs review' };
  if (judgment.conditional) {
    const runDate = input.assessment?.runDate || timeline.assessmentDate;
    return conditionalOutcome(scored, judgment.conditional, { sources, runDate, phase, deal: judgment.value, value });
  }
  // An open gate (null) doesn't stop the score. Jake passed what he couldn't confirm
  // "with a note"; ISA keeps the gate open and the report lists its reason as a blocker.
  // An uncertain or conflicting project value still needs review.
  if ((phase === 'full-text' && judgment.value.kind === 'uncertain') || value.status === 'conflicting') {
    return { ...scored, recommendation: 'Needs review' };
  }
  const total = scored.potential_total;
  return { ...scored, total, recommendation: total >= 75 ? 'Strong Pursue' : total >= 50 ? 'Worth a look' : 'No-bid',
    qualification_status: phase === 'preliminary' ? 'provisional' : total >= 75 ? 'qualified' : 'rejected',
    scoring_confidence: phase === 'preliminary' ? 'metadata-only' : 'full-text',
    document_status: phase === 'preliminary' ? 'metadata-only' : 'full-text' };
}
