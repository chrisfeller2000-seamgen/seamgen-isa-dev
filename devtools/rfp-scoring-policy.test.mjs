import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { alignmentCases } from './fixtures/rfp-alignment-cases.mjs';
import { companySources, fixturePolicies, recordedJudgment, referenceJudgment } from './fixtures/rfp-recorded-judgments.mjs';
import { CATEGORY_BANDS, DOCUMENT_FETCH_THRESHOLD, assessProjectValue, documentEvidence, finalizeRfpScore, intakeText, scoringSources } from '../workspace/scripts/rfp-scoring-policy.mjs';
import { createAssessmentContext } from '../workspace/scripts/rfp-deadline.mjs';
import { createOpenClawJudge, scoreRfp } from '../workspace/scripts/rfp-scoring-judgment.mjs';
import { persistValidatedScore, readPortalCandidate, scoreCandidateFromText, shouldFetchDocuments } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';
import { buildSecondaryReport, resolveSelectedCandidates } from '../workspace/scripts/secondary-fulltext-score.mjs';

const assessment = createAssessmentContext({ runDate: '2026-09-30' });
const policies = await fixturePolicies();
function packet(id = 'clean-custom-build', overrides = {}) {
  const fixture = structuredClone(alignmentCases.find(item => item.id === id));
  return { candidate: fixture.candidate, documents: fixture.documents, companySources, policies, assessment, phase: 'full-text', ...overrides };
}
const finalize = (input, update = () => {}) => {
  const judgment = recordedJudgment(input); update(judgment);
  return finalizeRfpScore(input, judgment);
};
const citation = [{ sourceId: 'doc-1', quote: 'Request for Proposals' }];
const companyCitation = [{ sourceId: 'company-assets', quote: companySources[1].text }];

test('unconfirmed completed-reference availability stays unresolved despite past delivery evidence', async () => {
  const input = packet();
  input.documents[0].text += '\nThree completed client references are required for eligibility.';
  const update = judgment => {
    judgment.gates.gate6.pass = null;
    judgment.gates.gate6.reason = 'Past work is documented; completed and currently usable references have not been confirmed.';
    judgment.subrules.eligibility.meetsMandatoryQualifications = null;
    judgment.subrules.eligibility.requiresCompanyProof = true;
    judgment.subrules.eligibility.companyEvidence = [{ sourceId: 'case-library', quote: companySources[0].text }];
  };
  const result = finalize(input, update);
  assert.equal(result.gate.gate6, null);
  assert.equal(result.recommendation, 'Needs review');
  assert.equal(result.total, null);
  assert.notEqual(result.qualification_status, 'qualified');
  const transported = await scoreRfp(input, { judge: async ({ prompt }) => {
    const judgment = recordedJudgment(input); update(judgment);
    return JSON.stringify(referenceJudgment(judgment, JSON.parse(prompt).sources));
  } });
  assert.equal(transported.scoring_error, undefined);
  assert.equal(transported.gate.gate6, null);
  assert.equal(transported.recommendation, 'Needs review');
  assert.equal(transported.total, null);
});

test('a no-bid judgment cannot retain inaccurate non-decisive supporting citations', () => {
  const input = packet('three-public-references');
  assert.equal(finalize(input).recommendation, 'No-bid');
  assert.throws(() => finalize(input, judgment => {
    judgment.subrules.eligibility.companyEvidence = [{ sourceId: 'company-assets', quote: 'A made-up reference availability statement' }];
  }), /citation does not match/);
  assert.throws(() => finalize(input, judgment => {
    judgment.flags = [{ type: 'ceo-connection', reason: 'Not part of the gate decision', evidence: [{ sourceId: 'missing-record', quote: 'Invented connection' }] }];
  }), /citation does not match/);
});

test('the weekly adapter returns the shared scorer result from one bounded judge request', async () => {
  const input = packet(); let calls = 0;
  const judge = async ({ input: supplied, systemPrompt, prompt, signal }) => {
    calls++;
    assert.match(systemPrompt, /untrusted evidence/);
    assert.match(systemPrompt, /EXACTLY gate1, gate2, gate3, gate4, gate5, gate6/);
    assert.match(systemPrompt, /never generate quotation text/);
    assert.match(systemPrompt, /not nested descriptions/);
    assert.match(prompt, /Example Secure Portal/);
    assert.match(prompt, /Every citation is exactly/);
    assert.match(prompt, /Never emit sourceId or quote fields/);
    assert.match(systemPrompt, /optional AI is potential \(3–5\)/);
    assert.match(systemPrompt, /standard compliance \(3–5\)/);
    assert.match(systemPrompt, /Excerpt IDs are opaque/);
    assert.match(systemPrompt, /not an expanded or combined alias/);
    assert.match(systemPrompt, /still return the eight provisional category judgments/);
    assert.match(systemPrompt, /At preliminary depth only the listing is supplied/);
    // Jake's Gate 6: a minimum Seamgen clearly can't meet fails; it isn't left as an open question.
    assert.match(prompt, /is a known failure: set meetsMandatoryQualifications false/);
    assert.doesNotMatch(prompt, /If required company proof is unavailable, leave eligibility unknown/);
    assert.match(systemPrompt, /An unconfirmed deadline still gets all eight categories/);
    // Jake's Gate 2: an existing product without a material custom share is a fail, not an open question.
    assert.match(systemPrompt, /Gate 2 resolves to pass, fail, or the conditional route/);
    assert.match(systemPrompt, /fails Gate 2 unless the custom portion is clearly material \(about 40%\+ of the effort\)/);
    const suppliedPacket = JSON.parse(prompt);
    // Enumerated fields stay plain lists; a description inside one gets copied as the value.
    assert.equal(suppliedPacket.outputContract.value.kind, 'stated|inferred|uncertain');
    assert.equal(suppliedPacket.outputContract.bidStatus, 'open|closed|watch');
    assert.equal(suppliedPacket.outputContract.subrules.submission.status, 'feasible|blocked|unknown');
    assert.match(systemPrompt, /inferred means a reasoned estimate, including a HigherGov listing estimate/);
    assert.deepEqual(suppliedPacket.allowedExcerptIds, suppliedPacket.sources.flatMap(source => source.excerpts.map(item => item.id)));
    assert.match(prompt, /capability-only excerpt without the project name is insufficient/);
    assert.match(prompt, /for a technology-agnostic buy, cite the proven stack/);
    assert.match(prompt, /null only when kind is uncertain/);
    assert.match(prompt, /Past delivery alone does not confirm current reference availability/);
    assert.equal(signal.aborted, false);
    return { text: JSON.stringify(referenceJudgment(recordedJudgment(supplied), JSON.parse(prompt).sources)), model: 'recorded-fixture' };
  };
  const weekly = await scoreCandidateFromText({ ...input, candidate: input.candidate, runDate: assessment.runDate, judge });
  const shared = await scoreRfp(input, { judge });
  for (const key of ['gate', 'categories', 'total', 'recommendation', 'qualification_status', 'provenance']) assert.deepEqual(weekly[key], shared[key], key);
  assert.equal(weekly.score, shared.total);
  assert.equal(calls, 2);
  assert.equal(weekly.provenance.evidenceFormat, 'source-excerpt-ids-v1');
});

test('a known failure stops weighted scoring even if categories were omitted', () => {
  const input = packet('value-5000'), judgment = recordedJudgment(input);
  delete judgment.categories;
  const result = finalizeRfpScore(input, judgment);
  assert.equal(result.gate.gate5, false);
  assert.equal(result.total, null);
  assert.equal(result.recommendation, 'No-bid');
  assert.equal(result.qualification_status, 'failed-gate');
});

test('all category bands are validated rather than clamped to legal totals', () => {
  for (const [key, bands] of Object.entries(CATEGORY_BANDS)) {
    for (const [band, [low, high]] of Object.entries(bands)) {
      for (const points of [low - 1, high + 1, NaN, 2.5]) {
        assert.throws(() => finalize(packet(), j => { j.categories[key].band = band; j.categories[key].points = points; }), /category|band/);
      }
    }
  }
  assert.throws(() => finalize(packet(), j => { delete j.gates.gate6; }), /six gates/);
  assert.throws(() => finalize(packet(), j => { j.categories.extra = {}; }), /eight/);
});

test('fabricated citations and named projects are rejected', () => {
  assert.throws(() => finalize(packet(), j => { j.categories.caseStudy.project = 'Imaginary Client'; }), /project/);
  assert.throws(() => finalize(packet(), j => { j.categories.caseStudy.evidence = citation; }), /citation/);
  assert.throws(() => finalize(packet(), j => { j.gates.gate3.evidence = [{ sourceId: 'missing', quote: 'claim' }]; }), /citation/);
  assert.throws(() => finalize(packet(), j => { j.categories.tech.evidence = citation; }), /delivery evidence/);
  assert.throws(() => finalize(packet(), j => { j.categories.compliance.evidence = citation; }), /delivery evidence/);
});

test("only HigherGov's sections of a candidate body reach the judge, not notes or earlier scores", () => {
  // Shaped like a real candidate.md: CRLF, a scoring note in an HTML comment, the intake's
  // note to the old chat scorer, and a score section someone added under the intake's own.
  const body = [
    '<!--', 'FULL-TEXT SCORE - 2026-07-21', 'KILL GATES', 'Gate 6 (Eligibility): PASS', '-->', '',
    '# Permit Portal', '',
    '> **For Claude.** This is a HigherGov intake record, not the full solicitation.',
    '> **`scoring_confidence: metadata-only`** - no attachment text was available.', '',
    '## HigherGov AI summary', 'The city wants an online permit portal.', '',
    '## Opportunity description (verbatim from HigherGov)', 'Build and host the portal.', '',
    '## Attachments', '_No attachment text retrieved._', '',
    '## Full-text score — 2026-07-21', 'Gate 6: PASS. Strong Pursue.', '',
    '## Links', '- HigherGov page: https://www.highergov.com/opportunity/example', '',
  ].join('\r\n');
  const input = packet();
  input.candidate.body = body;
  const metadata = scoringSources(input).find(source => source.id === 'metadata').text;
  assert.match(metadata, /online permit portal/);
  assert.match(metadata, /Build and host the portal/);
  assert.doesNotMatch(metadata, /KILL GATES|Gate 6|For Claude|attachment text|Strong Pursue|highergov\.com/i);
});

test("candidate files from Jake's PowerShell tools keep their header despite the byte-order mark", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-bom-'));
  try {
    const file = path.join(dir, 'candidate.md');
    await fs.writeFile(file, '\uFEFF---\ntitle: "Example AI services"\nagency_name: "Example Metroparks"\ndue_date: "2026-08-11"\nscore: 83\n---\n## HigherGov AI summary\nBody.\n');
    const candidate = await readPortalCandidate(file);
    assert.deepEqual([candidate.title, candidate.issuer, candidate.frontmatter.due_date], ['Example AI services', 'Example Metroparks', '2026-08-11']);
    assert.equal(intakeText(candidate.body), '## HigherGov AI summary\nBody.');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('project size excludes incidental amounts and preserves uncertain/ranged estimates', () => {
  assert.equal(assessProjectValue({}, [{ text: 'Insurance coverage $5,000,000. Bond $100,000. Previous award $25,000.' }]).estimate, null);
  assert.equal(assessProjectValue({ val_est_low: '5000' }).below, false);
  assert.equal(assessProjectValue({ val_est_low: '5000', val_est_high: '50000' }).below, true);
  assert.equal(assessProjectValue({}, [{ text: 'Project budget: $50,000.' }]).below, true);
  const range = assessProjectValue({}, [{ text: 'Project budget: $75,000 to $250,000.' }]);
  assert.equal(range.status, 'range');
  assert.equal(range.below, false);
  assert.equal(range.high, 250000);
  assert.equal(range.estimate, null);
  assert.equal(assessProjectValue({}, [{ text: 'Project budget: $250,000.\nContract value: $400,000.' }]).status, 'conflicting');
  const uncertain = finalize(packet('value-unknown'));
  assert.equal(uncertain.gate.gate5, true);
  assert.equal(uncertain.categories.deal, 0);
  assert.equal(uncertain.total, null);
  assert.equal(uncertain.recommendation, 'Needs review');
  assert.match(uncertain.reasons.join(' '), /Peter review/);
  const tiny = packet('value-unknown');
  const tinyResult = finalize(tiny, j => { j.value = { ...j.value, kind: 'inferred', estimate: 5000, reason: 'Two short workshops, recorded tiny scope' }; });
  assert.equal(tinyResult.gate.gate5, false);
  assert.equal(tinyResult.recommendation, 'No-bid');
  const bounded = packet('value-unknown');
  bounded.documents[0].text += '\nProject budget: $200,000 to $300,000.';
  assert.equal(assessProjectValue({}, bounded.documents).status, 'range');
  assert.throws(() => finalize(bounded, j => { j.value = { ...j.value, kind: 'inferred', estimate: 5000, reason: 'Unsupported tiny-scope guess' }; }), /contradicts/);
});

test('official value wins over listing estimates and conflicting amounts cannot be cherry-picked', () => {
  const input = packet(); input.candidate.frontmatter.val_est_low = '5000'; input.candidate.frontmatter.val_est_high = '5000';
  const result = finalize(input, j => { j.value.estimate = 250000; j.categories.deal.band = 'sweetSpot'; j.categories.deal.points = 10; });
  assert.equal(result.gate.gate5, true);
  assert.equal(result.value.estimate, 250000);
  const conflict = packet(); conflict.documents[0].text += '\nProject budget: $400,000.';
  const conflictResult = finalize(conflict);
  assert.equal(conflictResult.total, null);
  assert.equal(conflictResult.recommendation, 'Needs review');
});

test('unknown metadata requirements may score provisionally but never certify a full-text pursuit', () => {
  const modify = j => {
    j.gates.gate6.pass = null;
    j.subrules.eligibility.publicReferences = null;
    j.subrules.eligibility.meetsMandatoryQualifications = null;
    j.subrules.submission.status = 'unknown';
  };
  const preliminary = finalize(packet('clean-custom-build', { phase: 'preliminary', documents: [] }), modify);
  assert.ok(Number.isFinite(preliminary.total));
  assert.equal(preliminary.scoring_confidence, 'metadata-only');
  assert.equal(preliminary.qualification_status, 'provisional');
  const full = finalize(packet(), modify);
  assert.equal(full.total, null);
  assert.equal(full.recommendation, 'Needs review');
});

test('before documents exist, documents to retrieve cite the listing and never block selection', () => {
  const input = packet('clean-custom-build', { phase: 'preliminary', documents: [] });
  const listing = [{ sourceId: 'metadata', quote: input.candidate.body }];
  const toRetrieve = j => {
    j.gates.gate6.pass = null;
    j.subrules.eligibility.meetsMandatoryQualifications = null;
    j.requiredDocuments = [{ name: 'Official solicitation and attachments', evidence: listing, documentIds: [] }];
  };
  const preliminary = finalize(input, toRetrieve);
  assert.ok(Number.isFinite(preliminary.total));
  assert.equal(preliminary.qualification_status, 'provisional');
  assert.equal(shouldFetchDocuments(preliminary), true);
  assert.match(preliminary.reasons.join(' '), /Documents to retrieve: Official solicitation and attachments/);
  // No document exists yet to point at, and full-text requirements still need document evidence.
  assert.throws(() => finalize(input, j => { toRetrieve(j); j.requiredDocuments[0].documentIds = ['doc-1']; }), /required-document evidence/);
  assert.throws(() => finalize(packet(), toRetrieve), /citation does not match/);
});

test('potential_total is the category sum: the score if an open question checks out, never a decision', () => {
  const scored = finalize(packet());
  assert.equal(scored.potential_total, scored.total);
  const open = finalize(packet(), j => {
    j.gates.gate6 = { pass: null, reason: 'Two completed similar projects are required; our records do not show them.', evidence: [] };
    j.subrules.eligibility.meetsMandatoryQualifications = null;
  });
  assert.equal(open.recommendation, 'Needs review');
  assert.equal(open.total, null);
  assert.equal(open.potential_total, Object.values(open.categories).reduce((a, b) => a + b, 0));
  assert.notEqual(open.qualification_status, 'qualified');
});

test('an unknown gate or submission route needs no citation; a definite one still does', () => {
  const unknown = finalize(packet(), j => {
    j.gates.gate4 = { pass: null, reason: 'The listing does not say how to submit.', evidence: [] };
    j.subrules.submission = { status: 'unknown', basis: 'unknown', evidence: [] };
  });
  assert.equal(unknown.gate.gate4, null);
  assert.equal(unknown.recommendation, 'Needs review');
  assert.throws(() => finalize(packet(), j => { j.subrules.submission.evidence = []; }), /Missing scoring evidence/);
  assert.throws(() => finalize(packet(), j => { j.gates.gate3.evidence = []; }), /Missing scoring evidence/);
});

test('preliminary deadline and value reasons state the actual listing facts', () => {
  const nine = finalize(packet('nine-days', { phase: 'preliminary', documents: [] }));
  assert.equal(nine.gate.gate1, false);
  assert.match(nine.gateReasons[0].reason, /9 days away, below the 10-day minimum/);
  // Without the judge's own small-scope estimate, the listing fact supplies the reason.
  const tiny = finalize(packet('value-5000', { phase: 'preliminary', documents: [] }), j => { j.value = { kind: 'uncertain', estimate: null, reason: 'Unclear scope', evidence: j.value.evidence }; });
  assert.equal(tiny.gate.gate5, false);
  assert.match(tiny.gateReasons[4].reason, /\$5,000, below the \$100,000 minimum/);
});

test('reference counts distinguish generic work, strict two references, and verified partners', () => {
  assert.equal(finalize(packet('commercial-references')).gate.gate6, true);
  assert.equal(finalize(packet('three-public-references')).gate.gate6, false);
  assert.equal(finalize(packet('verified-reference-partner')).gate.gate6, true);
  assert.equal(finalize(packet(), j => {
    j.subrules.eligibility.publicReferences = 2;
    j.subrules.eligibility.availableGovernmentReferences = 1;
    j.subrules.eligibility.companyEvidence = companyCitation;
  }).gate.gate6, false);
  assert.throws(() => finalize(packet('verified-reference-partner'), j => { j.subrules.eligibility.partner.name = 'Invented Partner'; }), /not named/);
});

test("one government reference is covered by Jake's standing fact; a second still needs the RFP's wording", () => {
  const gate6 = (required, available) => finalize(packet(), j => {
    j.subrules.eligibility.publicReferences = required;
    j.subrules.eligibility.availableGovernmentReferences = available;
    j.subrules.eligibility.companyEvidence = companyCitation;
  }).gate.gate6;
  assert.equal(gate6(1, null), true);
  assert.equal(gate6(2, null), null);
  assert.equal(gate6(2, 2), true);
  assert.equal(gate6(2, 1), false);
});

test('an unconfirmed deadline never passes, but the rest of the RFP is still scored', () => {
  const input = packet();
  input.documents[0].text = input.documents[0].text.replace(/Proposal deadline: [^\n]*\n/, '');
  const result = finalize(input);
  assert.deepEqual([result.recommendation, result.gate.gate1, result.total, result.categories.timeline],
    ['Deadline needs review', null, null, 0]);
  assert.equal(result.potential_total, Object.values(result.categories).reduce((a, b) => a + b, 0));
  // An answer that left the categories out still gets the same outcome.
  const older = finalize(input, j => { delete j.categories; });
  assert.deepEqual([older.recommendation, older.categories, older.potential_total], ['Deadline needs review', null, undefined]);
});

test('credentials need a named holder, dated proof, and an actual credential record', () => {
  const credential = { name: 'Example Security Operations Certificate', held: true, holder: '', verifiedDate: '2026-09-30', companyEvidence: companyCitation, requirementEvidence: citation };
  assert.throws(() => finalize(packet(), j => { j.subrules.eligibility.credentials = [credential]; }), /named holder/);
  assert.throws(() => finalize(packet(), j => { j.subrules.eligibility.credentials = [{ ...credential, holder: 'Invented Person' }]; }), /not in the cited record/);
  assert.equal(finalize(packet(), j => { j.subrules.eligibility.credentials = [{ ...credential, held: false }]; }).gate.gate6, false);
});

test('real case studies support delivery/reference eligibility, not held credential attestations', () => {
  const projectEvidence = [{ sourceId: 'case-library', quote: companySources[0].text }];
  const result = finalize(packet(), j => {
    j.subrules.eligibility.requiresCompanyProof = true;
    j.subrules.eligibility.companyEvidence = projectEvidence;
  });
  assert.equal(result.gate.gate6, true);
  assert.equal(result.qualification_status, 'qualified');
  const input = packet();
  input.companySources = [...companySources, { id:'case-credential',kind:'case-study',text:'Example Holder holds Example Certificate, verified 2026-09-30.' }];
  assert.throws(() => finalize(input, j => {
    j.subrules.eligibility.credentials = [{ name:'Example Certificate',held:true,holder:'Example Holder',verifiedDate:'2026-09-30',requirementEvidence:citation,companyEvidence:[{sourceId:'case-credential',quote:input.companySources[2].text}] }];
  }), /citation/);
});

function conditional(j, rule = '2') {
  j.gates.gate2.pass = false;
  j.conditional = { rule, question: 'Would you accept a purpose-built solution?', qaStatus: 'open', qaDueDate: '2026-10-05', qaBasis: 'deadline', commercialOnly: false, evidence: citation };
}
test('Gate 2 conditional needs a real analog and an open verified question window', () => {
  const result = finalize(packet(), conditional);
  assert.equal(result.recommendation, 'Conditional — Ask the Agency');
  assert.equal(result.total, null);
  assert.equal(result.gate.gate2, null);
  assert.equal(finalize(packet(), j => { conditional(j); j.conditional.qaStatus = 'closed'; delete j.categories; }).recommendation, 'No-bid');
  assert.equal(finalize(packet(), j => { conditional(j); j.conditional.commercialOnly = true; }).recommendation, 'No-bid');
  assert.equal(finalize(packet(), j => { conditional(j); j.conditional.qaDueDate = '2026-09-29'; }).recommendation, 'No-bid');
  assert.equal(finalize(packet(), j => { conditional(j); j.conditional.qaDueDate = '2026-09-30'; }).recommendation, 'Needs review');
  assert.equal(finalize(packet(), j => { conditional(j); j.categories.caseStudy = { band: 'none', points: 5, reason: 'No analog', evidence: citation }; }).recommendation, 'No-bid');
});

test('Gate 2a product obligations require a real integrator partner or a conditional question', () => {
  const makeProduct = j => { j.subrules.product.hardProductObligations = true; };
  assert.equal(finalize(packet(), makeProduct).gate.gate2, false);
  assert.equal(finalize(packet(), j => { makeProduct(j); conditional(j, '2a'); }).recommendation, 'Conditional — Ask the Agency');
  const partner = { name: 'Example Civic Software', verified: true, sellsThroughIntegrators: true, evidence: companyCitation };
  assert.equal(finalize(packet(), j => { makeProduct(j); j.subrules.product.partner = partner; }).gate.gate2, true);
  assert.throws(() => finalize(packet(), j => { makeProduct(j); j.subrules.product.partner = { ...partner, sellsThroughIntegrators: false }; }), /integrator/);
  const unknown = finalize(packet(), j => { j.subrules.product.hardProductObligations = null; });
  assert.equal(unknown.gate.gate2, null);
  assert.equal(unknown.recommendation, 'Needs review');
});

test('a conditional product question cannot bypass a second unresolved blocker', () => {
  assert.equal(finalize(packet(), j => { conditional(j); j.subrules.submission.status = 'unknown'; }).recommendation, 'Needs review');
  assert.equal(finalize(packet('value-unknown'), conditional).recommendation, 'Needs review');
});

test('landscape deductions are bounded, additive once, and require counter-evidence', () => {
  const result = finalize(packet(), j => {
    j.competitive = { verdict: 'Leaning wired', effortDeduction: -2, wiredDeduction: -3, tells: citation, counterEvidence: citation, evidence: citation };
  });
  assert.equal(result.categories.competitive, 2);
  assert.equal(result.cp.base, 7);
  assert.equal(result.total, Object.values(result.categories).reduce((a, b) => a + b, 0));
  assert.throws(() => finalize(packet(), j => { j.competitive.verdict = 'Wired'; j.competitive.wiredDeduction = -9; }), /wired deduction/);
  assert.throws(() => finalize(packet(), j => { j.competitive.verdict = 'Open'; }), /counter-evidence/);
  assert.throws(() => finalize(packet('clean-custom-build', { phase: 'preliminary', documents: [] }), j => { j.competitive.verdict = 'Open'; }), /metadata/);
});

test('review flags never add points and closed notices never receive an open-bid total', () => {
  const baseline = finalize(packet());
  const flagged = finalize(packet(), j => { j.flags = [{ type: 'ceo-connection', reason: 'Recorded relationship flag', evidence: citation }]; });
  assert.equal(flagged.total, baseline.total);
  assert.equal(flagged.flags.length, 1);
  const closed = finalize(packet('closed-notice'));
  assert.equal(closed.recommendation, 'Not an open bid');
  assert.equal(closed.total, null);
  // A live solicitation cannot be parked as a watch item without pre-solicitation evidence.
  assert.throws(() => finalize(packet(), j => { j.bidStatus = 'watch'; }), /watch item needs evidence/);
  const noDate = packet(); delete noDate.candidate.frontmatter.due_date;
  noDate.documents[0].text = 'Request for Proposals. This is a market research notice only.';
  const watch = finalize(noDate, j => { j.bidStatus = 'watch'; j.bidEvidence = [{ sourceId: 'doc-1', quote: 'This is a market research notice only.' }]; });
  assert.equal(watch.recommendation, 'Watch item');
  assert.equal(watch.total, null);
});

test('full-text cannot be established by an ancillary document, a flag, or a missing required attachment', () => {
  assert.equal(documentEvidence([{ file: 'RFP_RATING_FORM.pdf', text: 'Technical approach 40%' }]).complete, false);
  assert.equal(documentEvidence([{ file: 'RFP_Final.txt', text: 'Actual proposal requirements.' }]).complete, true);
  const rating = packet('rating-form-only', { completeness: { complete: true } });
  assert.equal(finalize(rating).total, null);
  const missing = finalize(packet(), j => { j.requiredDocuments = [{ name: 'Required Statement of Work', evidence: citation, documentIds: [] }]; });
  assert.equal(missing.recommendation, 'Needs documents');
  assert.equal(missing.scoring_confidence, 'partial-documents');
  assert.equal(missing.total, null);
  const unweighted = finalize(packet(), j => {
    j.requiredDocuments = [{ name: 'Required Statement of Work', evidence: citation, documentIds: [] }];
    j.categories = null;
  });
  assert.equal(unweighted.recommendation, 'Needs documents');
  assert.equal(unweighted.total, null);
});

test('documents are fetched at a preliminary 50+, never for a non-finalizable or gate-failed result', () => {
  assert.equal(DOCUMENT_FETCH_THRESHOLD, 50);
  for (const total of [null, NaN, 0, 49]) assert.equal(shouldFetchDocuments({ total, recommendation: 'No-bid', qualification_status: 'provisional' }), false);
  assert.equal(shouldFetchDocuments({ total: 50, recommendation: 'Worth a look', qualification_status: 'provisional' }), true);
  assert.equal(shouldFetchDocuments({ total: 75, recommendation: 'Strong Pursue', qualification_status: 'provisional' }), true);
  assert.equal(shouldFetchDocuments({ total: 99, recommendation: 'No-bid', qualification_status: 'failed-gate' }), false);
  assert.equal(shouldFetchDocuments({ total: 60, recommendation: 'Worth a look', qualification_status: 'provisional' }, 75), false);
});

test('secondary selection has no forced historical titles and never guesses ambiguous matches', () => {
  const candidate = { dir: 'unique', frontmatter: { title: 'Data Warehouse', agency_name: 'City A', slug: 'a' } };
  assert.deepEqual(resolveSelectedCandidates([], [candidate]).selection, []);
  assert.equal(resolveSelectedCandidates([{ title: 'Data Warehouse', score: 49 }], [candidate]).selection.length, 0);
  assert.equal(resolveSelectedCandidates([{ title: 'Data Warehouse', score: 60 }], [candidate]).selection.length, 1);
  assert.equal(resolveSelectedCandidates([{ title: 'Warehouse', score: 80 }], [candidate]).reviews.length, 1);
  assert.equal(resolveSelectedCandidates([{ title: 'Data Warehouse', score: 80 }], [candidate, { ...candidate, dir: 'other' }]).reviews.length, 1);
  assert.equal(resolveSelectedCandidates([{ title: 'Data Warehouse — City A', score: 80 }], [candidate]).selection.length, 1);
});

test('actual candidate persistence retains the validated score, review state, and source evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-score-persistence-'));
  try {
    const file = path.join(root, 'candidate.md');
    await fs.writeFile(file, '---\ntitle: Synthetic\nuser_owned: preserved\n---\nKeep this body.\n');
    const result = finalize(packet());
    await persistValidatedScore(file, { preliminaryScore: 80, result, manifestPath: path.join(root, 'resources/manifest.json'), runDate: assessment.runDate });
    const saved = await fs.readFile(file, 'utf8');
    assert.match(saved, /user_owned: "preserved"/);
    assert.match(saved, /Keep this body/);
    assert.match(saved, new RegExp('final_score: "' + result.total + '"'));
    assert.match(saved, /qualification_status: "qualified"/);
    assert.match(saved, /scoring_categories:/);
    assert.match(saved, /scoring_judgments:/);
    const partial = finalize(packet(), j => { j.requiredDocuments = [{ name: 'SOW', evidence: citation, documentIds: [] }]; });
    await persistValidatedScore(file, { preliminaryScore: 80, result: partial, manifestPath: '', runDate: assessment.runDate });
    const next = await fs.readFile(file, 'utf8');
    assert.match(next, /final_score: unknown/);
    assert.match(next, /qualification_status: "provisional"/);
    assert.match(next, /scoring_recommendation: "Needs documents"/);
    assert.deepEqual(await fs.readdir(root), ['candidate.md']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('reports only count a validated document-backed qualification as Strong Pursue', () => {
  const result = finalize(packet());
  const row = { title: 'Synthetic', agency: 'Example', preliminary_score: 80, fulltext_score: result.total, ...result, competitive: result.cp, fetchStatus: 'downloaded' };
  assert.equal(buildSecondaryReport([row], assessment).summary.strongPursue, 1);
  assert.equal(buildSecondaryReport([{ ...row, qualification_status: 'provisional' }], assessment).summary.strongPursue, 0);
});

test('model failures, invalid JSON, unsupported citations, and timeouts stay unscored', async () => {
  for (const judge of [
    async () => { throw new Error('Sensitive provider error'); },
    async () => '{not json}',
    async ({ prompt }) => { const j = recordedJudgment(packet()); j.categories.ai.points = 1000; return JSON.stringify(referenceJudgment(j, JSON.parse(prompt).sources)); },
    async () => new Promise(() => {}),
  ]) {
    const result = await scoreRfp(packet(), { judge, timeoutMs: 10 });
    assert.equal(result.total, null);
    assert.notEqual(result.qualification_status, 'qualified');
    assert.notEqual(result.recommendation, 'Strong Pursue');
    assert.doesNotMatch(JSON.stringify(result), /Sensitive provider error/);
  }
});

test('missing private company assets are a context limitation, not an invented score', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-score-assets-'));
  try {
    await fs.mkdir(path.join(root, 'skills'));
    for (const policy of policies) await fs.writeFile(path.join(root, 'skills', policy.name), policy.text);
    let called = false;
    const input = packet(); delete input.companySources; delete input.policies;
    const result = await scoreRfp(input, { workspace: root, judge: async () => { called = true; return '{}'; } });
    assert.equal(called, false);
    assert.equal(result.scoring_error, 'context-unavailable');
    assert.equal(result.total, null);
    await fs.mkdir(path.join(root, 'resources', 'proposal-sources'), { recursive: true });
    await fs.writeFile(path.join(root, 'resources', 'proposal-sources', 'Proposal - Case Studies.txt'), '  \n');
    const empty = await scoreRfp(input, { workspace: root, judge: async () => { called = true; return '{}'; } });
    assert.equal(called, false);
    assert.equal(empty.scoring_error, 'context-unavailable');
    assert.equal(empty.total, null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('the SDK request has no tools, agent session, delivery, or production edits', async () => {
  let observed, prepares = 0;
  const sdk = {
    loadConfig: () => ({ fixture: true }), resolveDefaultAgentId: () => 'main', resolveThinkingDefault: () => 'high',
    prepareSimpleCompletionModelForAgent: async () => { prepares++; return { model: { provider: 'fixture', id: 'existing-model' }, auth: { fixture: true } }; },
    completeWithPreparedSimpleCompletionModel: async args => { observed = args; return { stopReason: 'stop', content: [{ type: 'text', text: '{}' }] }; },
  };
  const judge = await createOpenClawJudge({ sdk });
  await judge({ systemPrompt: 'policy', prompt: 'untrusted evidence', signal: new AbortController().signal });
  assert.equal(prepares, 1);
  assert.deepEqual(observed.context.tools, []);
  assert.equal(observed.context.messages.length, 1);
  assert.equal(observed.options.reasoning, 'high');
  assert.equal(observed.options.maxTokens, 32000);
  assert.equal(observed.session, undefined);
  sdk.completeWithPreparedSimpleCompletionModel = async () => ({ stopReason: 'toolUse', content: [{ type: 'toolCall' }] });
  await assert.rejects(judge({ systemPrompt: '', prompt: '' }), /tool request/);
  sdk.completeWithPreparedSimpleCompletionModel = async () => ({ stopReason: 'length', content: [{ type: 'thinking' }] });
  await assert.rejects(judge({ systemPrompt: '', prompt: '' }), /truncated/);
});
