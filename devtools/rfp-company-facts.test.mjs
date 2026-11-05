import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { alignmentCases } from './fixtures/rfp-alignment-cases.mjs';
import { companySources, fixturePolicies, recordedJudgment } from './fixtures/rfp-recorded-judgments.mjs';
import { summarizeCompanyFacts } from './company-facts.mjs';
import { assertPrivateLocation, diffFacts, uploadDecision } from './company-facts-upload.mjs';
import { COMPANY_FACTS_SOURCE_ID, companyFactsSource, factCurrency, parseCompanyFacts } from '../workspace/scripts/rfp-company-facts.mjs';
import { buildEvidenceCatalog, loadScoringContext } from '../workspace/scripts/rfp-scoring-judgment.mjs';
import { finalizeRfpScore } from '../workspace/scripts/rfp-scoring-policy.mjs';
import { createAssessmentContext } from '../workspace/scripts/rfp-deadline.mjs';

// Invented facts for an invented company; none of these are Seamgen claims.
const held = (id, overrides = {}) => ({ id, type: 'certification', name: 'Example Security Certificate', holder: 'Example Co',
  status: 'held', expires: null, verifiedBy: 'Example Owner', verifiedDate: '2026-09-01', source: 'certificate PDF in the shared drive', ...overrides });
const reference = (id, overrides = {}) => ({ id, type: 'reference', client: 'Example County', clientType: 'government',
  project: 'Example permitting portal', completed: '2025-06', status: 'available', verifiedBy: 'Example Owner',
  verifiedDate: '2026-09-01', source: 'client email agreeing to take calls', ...overrides });
const record = facts => companyFactsSource({ version: 1, facts });

const assessment = createAssessmentContext({ runDate: '2026-09-30' });
const policies = await fixturePolicies();
function packet(facts) {
  const fixture = structuredClone(alignmentCases.find(item => item.id === 'clean-custom-build'));
  return { candidate: fixture.candidate, documents: fixture.documents, policies, assessment, phase: 'full-text',
    companySources: facts ? [...companySources, record(facts)] : companySources };
}
const requirement = [{ sourceId: 'doc-1', quote: 'Request for Proposals' }];
const factCitation = (input, id) => {
  const source = input.companySources.find(item => item.id === COMPANY_FACTS_SOURCE_ID);
  return [{ sourceId: COMPANY_FACTS_SOURCE_ID, quote: source.text.split('\n\n').find(paragraph => paragraph.startsWith(`Company fact ${id} (`)) }];
};
const finalize = (input, update) => { const judgment = recordedJudgment(input); update(judgment); return finalizeRfpScore(input, judgment); };

test('the record is validated strictly: a typo or an unsourced claim stops it loading', () => {
  assert.equal(parseCompanyFacts({ version: 1, facts: [held('a'), reference('b')] }).length, 2);
  for (const [fact, message] of [
    [held('a', { verifiedBy: undefined }), /verifiedBy is required/],
    [held('a', { verifiedDate: '2026-02-30' }), /real YYYY-MM-DD/],
    [held('a', { expiry: '2027-01-01' }), /unknown field expiry/],
    [(({ expires, ...rest }) => rest)(held('a')), /needs expires/],
    [held('a', { type: 'insurance' }), /coverage is required/],
    [held('a', { holder: 'Example\n\nCo' }), /one line/],
    [held('A'), /kebab-case/],
    [reference('b', { completed: undefined }), /needs completed/],
    [reference('b', { clientType: 'public' }), /clientType/],
  ]) assert.throws(() => parseCompanyFacts({ version: 1, facts: [fact] }), message);
  assert.throws(() => parseCompanyFacts({ version: 1, facts: [held('a'), held('a')] }), /appears twice/);
  // An unconfirmed fact is the to-do list: it needs no verifier yet.
  assert.equal(parseCompanyFacts({ version: 1, facts: [{ id: 'c', type: 'registration', name: 'X', holder: 'Y', status: 'unconfirmed' }] })[0].status, 'unconfirmed');
});

test('each fact is one citable excerpt that leads with its id', () => {
  const source = record([held('cert-a'), reference('ref-b', { value: 450000 })]);
  const catalog = buildEvidenceCatalog([source]);
  const quotes = [...catalog.excerpts.values()].map(item => item.quote);
  assert.equal(quotes.length, 3);
  assert.match(quotes[1], /^Company fact cert-a \(certification\): Example Security Certificate\. Holder: Example Co\. Status: held\./);
  assert.match(quotes[2], /Reference status: available\. Verified 2026-09-01 by Example Owner/);
  assert.match(quotes[2], /Contract value: \$450,000\./);
});

test('a fact is current only when held or available, under a year old, and unexpired', () => {
  assert.equal(factCurrency(held('a'), '2026-09-30').current, true);
  assert.match(factCurrency(held('a', { verifiedDate: '2025-09-01' }), '2026-09-30').reason, /over 365 days ago/);
  assert.match(factCurrency(held('a', { expires: '2026-09-29' }), '2026-09-30').reason, /expired 2026-09-29/);
  assert.match(factCurrency(held('a', { verifiedDate: '2026-10-01' }), '2026-09-30').reason, /after the assessment/);
  assert.match(factCurrency({ ...held('a'), status: 'unconfirmed' }, '2026-09-30').reason, /unconfirmed/);
});

test('the loader reads the record beside the case studies, and a malformed one stops scoring', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-company-facts-'));
  try {
    const sources = path.join(workspace, 'resources', 'proposal-sources');
    await fs.mkdir(path.join(workspace, 'skills'), { recursive: true });
    await fs.mkdir(sources, { recursive: true });
    for (const policy of policies) await fs.writeFile(path.join(workspace, 'skills', policy.name), policy.text);
    await fs.writeFile(path.join(sources, 'Proposal - Case Studies.txt'), companySources[0].text);
    assert.equal((await loadScoringContext(workspace)).companySources.some(item => item.id === COMPANY_FACTS_SOURCE_ID), false);
    await fs.writeFile(path.join(sources, 'company-facts.json'), JSON.stringify({ version: 1, facts: [held('cert-a')] }));
    const loaded = (await loadScoringContext(workspace)).companySources.find(item => item.id === COMPANY_FACTS_SOURCE_ID);
    assert.deepEqual([loaded.kind, loaded.facts.length], ['company', 1]);
    await fs.writeFile(path.join(sources, 'company-facts.json'), JSON.stringify({ version: 1, facts: [held('cert-a', { source: '' })] }));
    await assert.rejects(loadScoringContext(workspace), /source must be one line/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('a held credential must cite a current held entry in the record, not Assets', () => {
  const claim = (input, overrides = {}) => j => {
    j.subrules.eligibility.credentials = [{ name: 'Example Security Certificate', held: true, holder: 'Example Co', verifiedDate: '2026-09-01',
      requirementEvidence: requirement, companyEvidence: factCitation(input, 'cert-a'), ...overrides }];
  };
  const current = packet([held('cert-a')]);
  assert.equal(finalize(current, claim(current)).gate.gate6, true);

  // Assets text that happens to contain the holder, name and date is not a current record.
  const assets = packet([held('cert-a')]);
  const assetsText = 'Example Co holds Example Security Certificate, verified 2026-09-01.';
  assets.companySources.push({ id: 'assets-credential', kind: 'company', text: assetsText });
  assert.throws(() => finalize(assets, claim(assets, { companyEvidence: [{ sourceId: 'assets-credential', quote: assetsText }] })),
    /must cite its held entry in the company facts record/);

  // A stale or lapsed entry keeps the gate open and names what to reconfirm.
  for (const [fact, why] of [[held('cert-a', { verifiedDate: '2025-08-01' }), /last confirmed 2025-08-01/], [held('cert-a', { expires: '2026-09-15' }), /expired 2026-09-15/]]) {
    const input = packet([fact]);
    const result = finalize(input, claim(input, { verifiedDate: fact.verifiedDate }));
    assert.equal(result.gate.gate6, null);
    assert.match(result.gateReasons[5].reason, why);
    assert.ok(Number.isFinite(result.total), 'an open gate is scored with a note, as Jake did');
  }

  // A confirmed not-held entry fails the gate.
  const missing = packet([held('cert-a', { status: 'not-held' })]);
  assert.equal(finalize(missing, claim(missing, { held: false })).gate.gate6, false);
});

test('with the record, only confirmed public-sector references count toward Gate 6a', () => {
  const gate6 = (facts, required, claimed = null) => {
    const input = packet(facts);
    return finalize(input, j => {
      j.subrules.eligibility.publicReferences = required;
      j.subrules.eligibility.availableGovernmentReferences = claimed;
      j.subrules.eligibility.companyEvidence = factCitation(input, facts[0].id);
    });
  };
  // Without the record, Jake's standing one-reference fact still applies (unchanged).
  const standing = packet();
  assert.equal(finalize(standing, j => {
    j.subrules.eligibility.publicReferences = 1;
    j.subrules.eligibility.companyEvidence = [{ sourceId: 'company-assets', quote: companySources[1].text }];
  }).gate.gate6, true);

  assert.equal(gate6([reference('ref-a')], 1).gate.gate6, true);
  // Listed but not reconfirmed: open, with the client to call named.
  const stale = gate6([reference('ref-a', { verifiedDate: '2025-06-01' })], 1);
  assert.equal(stale.gate.gate6, null);
  assert.match(stale.gateReasons[5].reason, /references to reconfirm: Example County reference was last confirmed 2025-06-01/);
  // The model cannot claim more than the record confirms...
  const nonprofit = reference('ref-b', { client: 'Example Foundation', clientType: 'nonprofit', status: 'unconfirmed', completed: null, verifiedBy: undefined, verifiedDate: undefined, source: undefined });
  assert.equal(gate6([reference('ref-a'), nonprofit], 2, 2).gate.gate6, null);
  assert.equal(gate6([reference('ref-a'), { ...nonprofit, status: 'unavailable', verifiedBy: 'Example Owner', verifiedDate: '2026-09-01', source: 'client declined' }], 2, 2).gate.gate6, false);
  // ...and two confirmed public-sector references cover a two-reference requirement the RFP words to admit them.
  assert.equal(gate6([reference('ref-a'), { ...nonprofit, status: 'available', completed: '2024', verifiedBy: 'Example Owner', verifiedDate: '2026-09-01', source: 'client email' }], 2, 2).gate.gate6, true);
  // Commercial clients never count as public-sector references.
  assert.equal(gate6([reference('ref-c', { clientType: 'commercial' })], 1, 1).gate.gate6, false);
});

test('the starter record is valid, holds only checked facts as current, and lists who to ask', async () => {
  const facts = parseCompanyFacts(await fs.readFile(new URL('./company-facts.starter.json', import.meta.url), 'utf8'));
  // Only the GSA MAS contract is current: it was checked on GSA eLibrary. The other checked facts are not-held.
  const currentOn = date => facts.filter(fact => factCurrency(fact, date).current).map(fact => fact.id);
  assert.deepEqual(currentOn('2026-11-10'), ['gsa-mas-it']);
  assert.deepEqual(currentOn('2026-11-09'), [], 'not current before it was checked');
  const gsa = { ...facts.find(fact => fact.id === 'gsa-mas-it'), verifiedDate: '2029-06-01' };
  assert.equal(factCurrency(gsa, '2029-06-17').current, true);
  assert.equal(factCurrency(gsa, '2029-06-18').current, false, 'lapses after the option period ends, even when recently reconfirmed');
  const summary = summarizeCompanyFacts(facts, '2026-11-10');
  assert.match(summary, /1 current/);
  assert.match(summary, /Small business size status under NAICS 541511 \(not-held, confirmed 2026-11-10 by J Garibay\)/);
  assert.match(summary, /Tina:\n {4}- SAM\.gov entity registration \(UEI\) is unconfirmed/);
  assert.match(summary, /Marianne:\n(?: {4}- .+\n)*? {4}- Florida Department of Environmental Protection reference is unconfirmed/);
  assert.match(summary, /Esri technical certification \(not-held, confirmed 2026-07-27 by Seth Lutske\)/);
  assert.doesNotMatch(summary, /gsaelibrary|Seth's confirmation, recorded/, 'proof locations stay out of the shareable summary');
});

test('upload replaces the VM record only when it is the copy this machine last saw', () => {
  assert.equal(uploadDecision({ vmHash: null, lastKnown: null, localHash: 'b' }).ok, true, 'first upload');
  assert.equal(uploadDecision({ vmHash: 'a', lastKnown: 'a', localHash: 'b' }).ok, true, 'ordinary update');
  assert.match(uploadDecision({ vmHash: 'b', lastKnown: 'a', localHash: 'b' }).reason, /already has this exact record/);
  assert.match(uploadDecision({ vmHash: 'c', lastKnown: 'a', localHash: 'b' }).reason, /changed since this machine/);
  assert.match(uploadDecision({ vmHash: 'c', lastKnown: null, localHash: 'b' }).reason, /--pull/, 'a VM copy this machine never saw');
  assert.match(uploadDecision({ vmHash: null, lastKnown: 'a', localHash: 'b' }).reason, /deleted/);
});

test('upload preview names each added, changed and removed fact', () => {
  const before = [held('kept'), held('renewed', { status: 'unconfirmed' }), held('dropped')];
  const after = [held('kept'), held('renewed', { notes: 'Renewed.' }), held('new-one')];
  assert.deepEqual(diffFacts(before, after), [
    '  changed  renewed: unconfirmed -> held (status, notes)',
    '  added    new-one (held)',
    '  removed  dropped',
  ]);
});

test('upload accepts only a private copy, never the starter or another file in the repo', () => {
  const root = path.resolve('/repo');
  assert.throws(() => assertPrivateLocation(path.join(root, 'devtools/company-facts.starter.json'), root), /must stay out of Git/);
  assert.throws(() => assertPrivateLocation(path.join(root, 'company-facts.json'), root), /must stay out of Git/);
  assert.doesNotThrow(() => assertPrivateLocation(path.join(root, '.isa-local/company-facts/company-facts.json'), root));
  assert.doesNotThrow(() => assertPrivateLocation(path.resolve('/elsewhere/company-facts.json'), root));
});
