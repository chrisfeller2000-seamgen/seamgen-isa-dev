// scripts/rfp-brief.mjs: the engineering brief's inputs, quote checks, fixed format, PDF and estimates.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeWorkspace } from './fixtures/rfp-route-workspace.mjs';
import { briefHtml, briefInputs, checkBrief, letters, printPdf, quoteFound, renderBrief, runBrief, runEstimate, savedBrief } from '../workspace/scripts/rfp-brief.mjs';
import { runAnswer, runCheck } from '../workspace/scripts/rfp-capability.mjs';
import { runDates } from '../workspace/scripts/rfp-dates.mjs';
import { questionInputs } from '../workspace/scripts/rfp-questions.mjs';
import { routeRequest } from '../workspace/scripts/rfp-route.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'workspace', 'scripts', 'rfp-brief.mjs');
const SLUG = 'laguna-beach-website-redesign';
const NOW = new Date('2026-11-24T20:00:00Z');
const folderOf = workspace => path.join(workspace, 'RFPs', '2-intermediate-stage', SLUG);

// The RFP as its saved text file, with a line break and a hyphenation inside quoted passages.
const RFP = `City of Laguna Beach RFP 2026-31
--- page 5 ---
3. Scope of work
The City seeks a qualified firm to redesign and replace its public website and content
management system, migrate existing content, and train City staff.
3.1 Technical requirements
- WCAG 2.2 AA accessibility across all tem-
plates
- Integration with the City's agenda management system and its online permitting portal
--- page 6 ---
The vendor will migrate approximately 2,400 pages and 6,000 PDF documents.
`;
const PEOPLE = 'SEAMGEN PROPOSAL PEOPLE\n\n\nCHRIS FELLER\nRole: Lead Engineer\n\n\nPETE NYSTROM\nRole: VP of Engineering\n';

const brief = () => ({
  name: 'Website Redesign and Replacement Project', number: 'RFP 2026-31', agency: 'City of Laguna Beach', foundVia: 'PlanetBids',
  preparedBy: 'Jordan', for: ['Chris Feller'], summary: 'Replace the City website and CMS, migrate its content and train staff.',
  sections: {
    scope: [{ label: 'Website and CMS replacement', explain: 'A new public site on a new CMS, with content migration and training.',
      quotes: [{ quote: 'redesign and replace its public website and content management system, migrate existing content', source: 'file 1, page 5, §3' }] }],
    accessibility: [{ label: 'WCAG 2.2 AA', explain: 'Every template must meet WCAG 2.2 AA.', quotes: [{ quote: 'WCAG 2.2 AA accessibility across all templates', source: 'file 1, page 5, §3.1' }] }],
    integrations: [{ label: '⚠ Agenda and permits', explain: 'Two named City systems; the depth isn\'t stated.', flag: true,
      quotes: [{ quote: 'Integration with the City’s agenda management system … online permitting portal', source: 'file 1, page 5, §3.1' }] }],
    migration: [{ label: 'Content volume', explain: 'About 2,400 pages and 6,000 PDFs.', quotes: [{ quote: 'migrate approximately 2,400 pages and 6,000 PDF documents', source: 'file 1, page 6' }] }],
  },
  ambiguities: [
    { question: 'Does the agenda integration need two-way sync, or are links enough?', why: 'Two-way sync adds weeks.', quote: 'Integration with the City\'s agenda management system', source: 'file 1, page 5, §3.1' },
    { question: 'Where must the new site be hosted?', why: 'Hosting changes the infrastructure work.', silent: true, source: '§3, p. 5' },
  ],
  forSales: 'Short window: check Chris has time this week.',
});

async function workspaceWithRfp() {
  const workspace = await routeWorkspace();
  await fs.writeFile(path.join(folderOf(workspace), 'resources', 'RFP 2026-31 Website Redesign.txt'), RFP);
  await fs.mkdir(path.join(workspace, 'resources', 'proposal-sources'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'resources', 'proposal-sources', 'Proposal - People.txt'), PEOPLE);
  return workspace;
}
const noPdf = async () => ({ ok: false, reason: 'no browser in tests' });

test('a quote is found despite line breaks, hyphenation, curly quotes and "…"', () => {
  const corpus = letters(RFP);
  assert.ok(quoteFound('WCAG 2.2 AA accessibility across all templates', corpus));
  assert.ok(quoteFound('Integration with the City’s agenda management system … its online permitting portal', corpus));
  assert.equal(quoteFound('Integration with the City’s ERP system', corpus), false);
  assert.equal(quoteFound('…', corpus), false);
});

test('a brief needs the RFP\'s exact words with a page on every item, current staff, and a short summary', () => {
  const people = [{ name: 'Chris Feller' }];
  const corpus = letters(RFP);
  assert.deepEqual(checkBrief(brief(), { people, corpus }), []);
  const bad = brief();
  bad.sections.scope[0].quotes[0].quote = 'The City wants a modern website.';
  bad.sections.accessibility[0].quotes[0].source = 'file 1';
  bad.sections.security = [];
  bad.for = ['Jake'];
  bad.summary = 'word '.repeat(30);
  bad.ambiguities[1].silent = false;
  const problems = checkBrief(bad, { people, corpus }).join('\n');
  assert.match(problems, /Scope of Work, item 1: the quote isn't in the RFP's saved documents\. Copy it exactly; never paraphrase/);
  assert.match(problems, /Accessibility, item 1 needs a page in "source"/);
  assert.match(problems, /"sections\.security" isn't a brief section/);
  assert.match(problems, /Jake is not on the current staff list/);
  assert.match(problems, /"summary" is 30 words/);
  assert.match(problems, /Ambiguity 2 needs the "quote" that creates it, or "silent": true/);
});

test('the brief has the fixed format, the risks, and the heading the agency questions read', () => {
  const inputs = { keyDates: { dates: [{ milestone: 'Proposal due', when: 'Thu Jan 21, 2027, 2:00 PM PT', passed: false }] },
    scope: { read: true, missing: ['Appendix B - Functional Requirements Matrix'] }, capability: { rows: [{ n: 2, operation: 'Two-way agenda sync', status: 'never' }] } };
  const markdown = renderBrief(brief(), { given: '2026-11-24', inputs, folder: 'RFPs/2-intermediate-stage/x/resources' });
  assert.match(markdown, /^# Engineering Scope Brief: Website Redesign and Replacement Project\n\n\*\*Source \(found via\):\*\* PlanetBids\n\*\*Date prepared:\*\* 2026-11-24/);
  assert.match(markdown, /\*\*For:\*\* Chris Feller/);
  assert.match(markdown, /- \*\*Proposal due:\*\* Thu Jan 21, 2027, 2:00 PM PT/);
  assert.match(markdown, /- \*\*Sections referenced in this brief:\*\* §3, §3\.1/);
  assert.match(markdown, /## Scope of Work\n\n- \*\*Website and CMS replacement:\*\* A new public site[^\n]*\n {2}> "redesign and replace/);
  assert.match(markdown, /## Deliverables\n\nNot addressed in the RFP\./);
  assert.doesNotMatch(markdown, /## Technical Requirements/, 'an empty optional section is left out');
  assert.match(markdown, /- \*\*⚠ ⚠ Agenda and permits:\*\*|- \*\*⚠ Agenda and permits:\*\*/);
  assert.match(markdown, /## Risks for the estimate\n\n- Scope document not saved: Appendix B - Functional Requirements Matrix\.[^\n]*\n- Capability check row 2: "Two-way agenda sync" was answered "never"\. Estimate it as new work\./);
  assert.match(markdown, /## Ambiguities Requiring Clarification\n\n\*These items[^\n]*\n\n1\. Does the agenda integration need two-way sync, or are links enough\?\n {3}- Why it matters for engineering: Two-way sync adds weeks\.\n {3}- RFP basis: > "Integration with the City's agenda management system" — file 1, page 5, §3\.1\n2\. Where must the new site be hosted\?/);
  assert.match(markdown, /RFP basis: RFP is silent; nearest relevant context §3, p\. 5/);
  assert.match(markdown, /## For the sales team \(not for the engineer\)\n\nShort window/);
  const html = briefHtml(markdown);
  assert.match(html, /<h2>Scope of Work<\/h2>/);
  assert.match(html, /<blockquote>"redesign and replace/);
  assert.doesNotMatch(html, /<script/);
});

test('a brief is saved, attached with a MEDIA: line, and its ambiguities reach the agency questions', async () => {
  const workspace = await workspaceWithRfp();
  try {
    await runDates({ slug: SLUG, workspace, now: NOW, input: { name: 'Laguna Beach', zone: 'PT', milestones: [{ kind: 'proposal', date: 'January 21, 2027', time: '2:00 PM', source: 'file 1, page 1' }] } });
    let printed = null;
    const fakePdf = async (markdown, target) => { printed = target; await fs.writeFile(target, '%PDF-1.4 test'); return { ok: true }; };
    const done = await runBrief({ slug: SLUG, input: brief(), workspace, now: NOW, pdf: fakePdf });
    assert.equal(done.status, 'ok', done.problems?.join('\n'));
    assert.match(done.text, /^Send them the text between the lines word for word/);
    assert.match(done.text, /Engineering brief for Website Redesign and Replacement Project, for Chris Feller: about 1 page, 2 ambiguities/);
    assert.match(done.text, /Message for Chris Feller, to copy and send yourself with the PDF \(nothing has been sent\):\n```\nHey Chris, here's the engineering brief/);
    assert.match(done.text, /Proposals are due Thu Jan 21, 2027, 2:00 PM PT\./);
    assert.match(done.text, /\nMEDIA:.*engineering-brief_2026-11-24_laguna-beach-website-redesign\.pdf\n/);
    assert.equal(path.basename(printed), 'engineering-brief_2026-11-24_laguna-beach-website-redesign.pdf');
    const inputs = await questionInputs(SLUG, { workspace, now: NOW });
    assert.equal(inputs.engineeringBrief.file, 'engineering-brief_2026-11-24_laguna-beach-website-redesign.md');
    assert.match(inputs.engineeringBrief.ambiguities, /^## Ambiguities Requiring Clarification[\s\S]*two-way sync[\s\S]*Where must the new site be hosted\?/);
    assert.doesNotMatch(inputs.engineeringBrief.ambiguities, /For the sales team|rfp-brief-ledger/);

    const withoutPdf = await runBrief({ slug: SLUG, input: brief(), workspace, now: NOW, pdf: noPdf });
    assert.doesNotMatch(withoutPdf.text, /MEDIA:/);
    assert.match(withoutPdf.text, /the PDF couldn't be made: no browser in tests/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('nothing is saved for a bad or overlong brief, or without readable documents', async () => {
  const workspace = await workspaceWithRfp();
  try {
    const long = brief();
    long.sections.scope = Array.from({ length: 120 }, (_, index) => ({ label: `Item ${index}`, explain: 'A requirement that matters for the estimate and is spelled out here.',
      quotes: [{ quote: 'redesign and replace its public website and content management system, migrate existing content', source: 'file 1, page 5' }] }));
    const refused = await runBrief({ slug: SLUG, input: long, workspace, now: NOW, pdf: noPdf });
    assert.equal(refused.status, 'invalid');
    assert.match(refused.problems.join('\n'), /The brief runs to about \d+ pages; the cap is 5/);
    const files = await fs.readdir(folderOf(workspace));
    assert.equal(files.some(name => name.startsWith('engineering-brief_')), false);
    const empty = await routeWorkspace();
    try {
      const none = await runBrief({ slug: 'chandler-permit-portal', input: brief(), workspace: empty, now: NOW, pdf: noPdf });
      assert.match(none.problems[0], /No saved document could be read/);
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('estimates are recorded word for word and carried onto a revised brief', async () => {
  const workspace = await workspaceWithRfp();
  try {
    assert.match((await runEstimate({ slug: SLUG, workspace, now: NOW, estimate: { by: 'Chris Feller', said: '12 weeks' } })).problems[0], /No engineering brief is saved/);
    await runBrief({ slug: SLUG, input: brief(), workspace, now: NOW, pdf: noPdf });
    const bad = await runEstimate({ slug: SLUG, workspace, now: NOW, estimate: { by: 'Chris', said: '' } });
    assert.match(bad.problems.join('\n'), /Chris is not on the current staff list[\s\S]*"said" is missing/);
    const good = await runEstimate({ slug: SLUG, workspace, now: NOW, estimate: { by: 'Chris Feller', said: 'Roughly 12 weeks with 3 engineers, if the agenda sync is links only.',
      duration: '12 weeks', team: '3 engineers', assumptions: ['agenda integration is links only'] } });
    assert.match(good.text, /Chris Feller, 2026-11-24: "Roughly 12 weeks with 3 engineers, if the agenda sync is links only\." \| duration: 12 weeks \| team: 3 engineers \| assumptions: agenda integration is links only/);
    const saved = await savedBrief(SLUG, { workspace });
    assert.equal(saved.estimates.length, 1);
    assert.match(await fs.readFile(path.join(folderOf(workspace), 'engineering-brief_2026-11-24_laguna-beach-website-redesign.md'), 'utf8'), /^# Engineering Scope Brief/);

    const later = await runBrief({ slug: SLUG, input: brief(), workspace, now: new Date('2026-12-02T20:00:00Z'), pdf: noPdf });
    assert.match(later.text, /Estimates given on the earlier brief, which may not fit this one:\nChris Feller, 2026-11-24 \(on the brief of 2026-11-24\): "Roughly 12 weeks/);
    assert.equal((await savedBrief(SLUG, { workspace })).given, '2026-12-02');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('--inputs gives unread scope documents, open capability rows and the steps', async () => {
  const workspace = await workspaceWithRfp();
  try {
    const escape = value => JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const judgments = { scopeRead: { read: true, reason: 'The RFP describes the work.' }, requiredDocuments: [
      { name: 'Appendix B - Functional Requirements Matrix', scope: true, documentIds: [] }, { name: 'Insurance form', scope: false, documentIds: [] }, { name: 'RFP', scope: true, documentIds: ['doc-1'] }] };
    await fs.writeFile(path.join(folderOf(workspace), 'candidate.md'), `---\ntitle: "Laguna"\nscoring_judgments: "${escape(judgments)}"\n---\n`);
    await runCheck({ slug: SLUG, workspace, now: NOW, input: { name: 'Laguna', decision: 'prime or pass', routedTo: [{ name: 'Pete Nystrom', why: 'FDEP' }],
      rows: [{ operation: 'Two-way agenda sync', quote: 'agenda management system', source: 'file 1, page 5', ifYes: 'We have built two-way agenda sync.' }] } });
    await runAnswer({ slug: SLUG, workspace, now: NOW, answer: { by: 'Pete Nystrom', said: 'Never done that.', rows: [{ n: 1, answer: 'never' }] } });
    const inputs = await briefInputs(SLUG, { workspace, now: NOW });
    assert.deepEqual(inputs.scope.missing, ['Appendix B - Functional Requirements Matrix']);
    assert.deepEqual(inputs.capability.rows, [{ n: 1, operation: 'Two-way agenda sync', status: 'never' }]);
    assert.deepEqual(inputs.team.map(person => person.name), ['Chris Feller', 'Pete Nystrom']);
    assert.ok(inputs.steps.some(step => /scope documents that were never saved: Appendix B/.test(step)));
    assert.ok(inputs.steps.some(step => /capability check has 1 row/.test(step)));
    assert.match(inputs.steps.at(-1), /never send it to anyone/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the router records an estimate, answers "what did Chris estimate", and hands the skill its inputs', async () => {
  const workspace = await workspaceWithRfp();
  try {
    const report = await routeRequest('Chris estimated 12 weeks for Laguna Beach', { workspace, now: NOW });
    assert.equal(report.action, 'run-skill');
    assert.equal(report.skill.id, 'engineering-brief');
    assert.equal(report.mode, 'record-estimate');
    // A Phase 1 RFP: recording an estimate never asks about a move.
    const chandler = await routeRequest('Chris says the Chandler permit portal is about 4 months with 3 engineers', { workspace, now: NOW });
    assert.equal(chandler.mode, 'record-estimate');
    assert.equal(chandler.rfp.slug, 'chandler-permit-portal');
    // A question about time is not an estimate to record.
    assert.notEqual((await routeRequest('Do you think Laguna Beach takes 12 weeks?', { workspace, now: NOW })).mode, 'record-estimate');
    assert.equal((await routeRequest('How long would Laguna Beach take?', { workspace, now: NOW })).skill.id, 'engineering-brief');

    const before = await routeRequest('What did Chris estimate for Laguna Beach?', { workspace, now: NOW });
    assert.equal(before.about, 'estimate');
    assert.equal(before.brief, null);
    await runBrief({ slug: SLUG, input: brief(), workspace, now: NOW, pdf: noPdf });
    await runEstimate({ slug: SLUG, workspace, now: NOW, estimate: { by: 'Chris Feller', said: '12 weeks' } });
    const after = await routeRequest('What did Chris estimate for Laguna Beach?', { workspace, now: NOW });
    assert.equal(after.brief.estimates[0].said, '12 weeks');

    const build = await routeRequest('engineering brief for laguna beach', { workspace, now: NOW });
    assert.equal(build.inputs.saved.given, '2026-11-24');
    assert.equal((await routeRequest('Update the Laguna Beach brief with the new addendum', { workspace, now: NOW })).skill.id, 'engineering-brief');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the command line reads the brief on standard input and saves only a good one', async () => {
  const workspace = await workspaceWithRfp();
  try {
    const run = (args, input) => spawnSync(process.execPath, [script, '--rfp', SLUG, ...args], { input, encoding: 'utf8', env: { ...process.env, WORKSPACE_DIR: workspace, CHROMIUM_PATH: path.join(workspace, 'no-browser') , PATH: path.dirname(process.execPath) } });
    const bad = run([], JSON.stringify({ name: 'X $(touch pwned)' }));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /Nothing was saved/);
    const good = run([], JSON.stringify(brief()));
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /Engineering brief for Website Redesign/);
    assert.equal(JSON.parse(run(['--show']).stdout).for[0], 'Chris Feller');
    await assert.rejects(fs.access(path.join(workspace, 'pwned')));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

// Prints a real PDF where a browser is installed (Edge on Windows, Chromium on the VM).
test('printPdf makes a PDF through a plain home folder when a browser is installed', async (t) => {
  const workspace = await workspaceWithRfp();
  try {
    const target = path.join(workspace, 'brief.pdf');
    const result = await printPdf(renderBrief(brief(), { given: '2026-11-24' }), target);
    if (!result.ok && /no Chromium, Chrome or Edge/.test(result.reason)) { t.skip('no browser here'); return; }
    assert.equal(result.ok, true, result.reason);
    assert.equal((await fs.readFile(target)).subarray(0, 5).toString(), '%PDF-');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
