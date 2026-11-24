// scripts/rfp-questions.mjs: the agency questions skill's inputs, checks, email and saved copy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeWorkspace } from './fixtures/rfp-route-workspace.mjs';
import { runDates } from '../workspace/scripts/rfp-dates.mjs';
import { checkQuestions, deadlineOf, planQuestions, questionInputs, renderEmail, runQuestions, savedQuestions } from '../workspace/scripts/rfp-questions.mjs';
import { routeRequest } from '../workspace/scripts/rfp-route.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'workspace', 'scripts', 'rfp-questions.mjs');
const SLUG = 'laguna-beach-website-redesign';
const NOW = new Date('2026-11-24T20:00:00Z');
const folderOf = workspace => path.join(workspace, 'RFPs', '2-intermediate-stage', SLUG);
const notePath = workspace => path.join(folderOf(workspace), `agency-questions_${SLUG}.md`);

const QUOTE = 'The City seeks a qualified firm to redesign and replace its public website and content management system.';
const laguna = () => ({
  name: 'Website Redesign and Replacement Project', number: 'RFP 2026-31', agency: 'City of Laguna Beach',
  contact: { name: 'Jordan Lucas', honorific: 'Mr.', email: 'jlucas@lagunabeachcity.net', source: 'file 1, page 2' },
  submission: 'Email to the contact with "RFP 2026-31 Questions" in the subject line',
  questions: [
    { text: 'Who is the vendor currently supporting the City\'s content management system?', source: 'RFP is silent; nearest context §2, page 4', resolves: 'no incumbent named' },
    { text: 'Has the City established a budget or not-to-exceed amount? If so, please provide the range. If not, please confirm that no budget has been established.', source: 'RFP is silent; nearest context §6, page 9' },
    { text: 'Aside from the requirements starting on page 5, are there content migration volumes we should plan for?', sub: ['Roughly how many pages and documents are on the current site?'], source: `file 1, page 5: "${QUOTE}"` },
    { text: 'Which City staff will maintain content after launch?', source: 'file 1, page 6: "City staff will maintain content."' },
    { text: 'Will the City publish the questions and answers from all bidders?', source: 'file 1, page 2: "Answers will be posted as an addendum."' },
  ],
});
// The key dates the calendar skill would have recorded: questions due December 11, proposals January 14.
const recordDates = (workspace, { questions = 'December 11, 2026', proposal = 'January 14, 2027', now = NOW } = {}) => runDates({ slug: SLUG, workspace, now, input: {
  name: 'Laguna Beach Website Redesign', zone: 'PT',
  milestones: [
    ...(questions ? [{ kind: 'questions', date: questions, time: '5:00 PM', source: 'file 1, page 1' }] : []),
    { kind: 'proposal', date: proposal, time: '2:00 PM', source: 'file 1, page 1' },
  ],
} });

test('the email follows Katie\'s template and leaves the signature for the sender', () => {
  const email = renderEmail(laguna());
  assert.match(email, /^Subject: RFP 2026-31 Website Redesign and Replacement Project — Clarifying Questions from Seamgen\n\nDear Mr\. Lucas,\n/);
  assert.match(email, /I am writing on behalf of Seamgen regarding the RFP for the City of Laguna Beach's Website Redesign and Replacement Project\./);
  assert.match(renderEmail({ ...laguna(), name: 'Laguna Beach Website Redesign' }), /regarding the RFP for the Laguna Beach Website Redesign\./);
  assert.match(email, /\n1\. Who is the vendor/);
  assert.match(email, /\n3\. Aside from[^\n]*\n {3}- Roughly how many pages/);
  assert.match(email, /meets the City of Laguna Beach's requirements and objectives\./);
  assert.match(renderEmail({ ...laguna(), agency: 'Yonkers Office for the Aging' }), /meets Yonkers Office for the Aging's requirements/);
  assert.match(email, /Please confirm receipt of these questions\.[\s\S]*Do you have an expected date for when the responses will be shared\?/);
  assert.match(email, /Kind regards,\n\[Your name\]\n\[Title\]\nSeamgen\n\[Phone\]\n\[Email\]$/);
  assert.doesNotMatch(email, /^To:|jlucas@|file 1|RFP is silent/m, 'the email carries no address and no sources');
});

test('the salutation never guesses Mr. or Ms. from a name', () => {
  const input = laguna();
  input.contact = { name: 'Jordan Lucas' };
  assert.match(renderEmail(input), /Dear Jordan Lucas,/);
  delete input.contact;
  assert.match(renderEmail(input), /Dear \[Mr\.\/Ms\.\/Dr\.\] \[Last name\],/);
  input.sender = { name: 'Marianne Faro', title: 'Director of Sales' };
  assert.match(renderEmail(input), /Kind regards,\nMarianne Faro\nDirector of Sales\nSeamgen\n\[Phone\]/);
});

test('past 8 questions every question needs a header, and numbers run on across headers', () => {
  const many = laguna();
  many.questions = Array.from({ length: 9 }, (_, index) => ({ text: `Question ${index + 1}?`, source: `file 1, page ${index + 1}` }));
  assert.match(checkQuestions(many).join(' '), /need a "group" header/);
  many.questions.forEach((item, index) => { item.group = index < 5 ? 'Scope' : 'Technical'; });
  assert.deepEqual(checkQuestions(many), []);
  assert.match(renderEmail(many), /\n\nScope\n1\. Question 1\?[\s\S]*5\. Question 5\?\n\nTechnical\n6\. Question 6\?/);
  many.questions = Array.from({ length: 16 }, (_, index) => ({ text: `Q${index}?`, source: 'file 1', group: 'Scope' }));
  assert.match(checkQuestions(many).join(' '), /16 questions is too many/);
});

test('nothing internal, no pasted quote and no unsourced question reaches the agency', () => {
  const input = laguna();
  input.questions[0].text = 'We found this on HigherGov; who supports the current site?';
  input.questions[1].text = 'Our Gate 2 is open: is this a product buy?';
  input.questions[2].text = `You wrote "${QUOTE}" Does that include the intranet?`;
  input.questions[3].source = '';
  input.questions[4].sub = ['See https://drive.google.com/drive/folders/abc'];
  const problems = checkQuestions(input).join('\n');
  assert.match(problems, /Question 1 names HigherGov/);
  assert.match(problems, /Question 1 says where we found the RFP/);
  assert.match(problems, /Question 2 names a scoring gate/);
  assert.match(problems, /Question 3 pastes the quote from its source/);
  assert.match(problems, /Question 4 has no "source"/);
  assert.match(problems, /A sub-question of question 5 has a Google Drive link/);
  // A fair question about how proposals will be scored is not internal.
  const fair = laguna();
  fair.questions[0].text = 'How will proposals be scored against the evaluation criteria on page 8?';
  assert.deepEqual(checkQuestions(fair), []);
});

test('the deadline line comes from the key-dates note, and a closed window stops', () => {
  const open = { dates: [{ milestone: 'Questions due', when: 'Fri Dec 11, 2026, 5:00 PM PT', passed: false, daysLeft: 17, source: 'file 1, page 1' }] };
  assert.deepEqual(deadlineOf(open, {}).lines, ['Questions due: Fri Dec 11, 2026, 5:00 PM PT (17 days left), per file 1, page 1.']);
  const closed = { dates: [{ milestone: 'Questions due', when: 'Fri Nov 20, 2026, 5:00 PM PT', passed: true, daysLeft: 0 }] };
  assert.match(deadlineOf(closed, {}).stop, /window closed on Fri Nov 20/);
  assert.match(deadlineOf(null, {}).problem, /rfp-dates\.mjs --merge/);
  const soon = { dates: [{ milestone: 'Proposal due', when: 'Mon Nov 30, 2026, 2:00 PM PT', passed: false, daysLeft: 6 }] };
  const none = deadlineOf(soon, { noDeadline: 'The documents give no questions deadline' });
  assert.equal(none.lines[0], 'The documents give no questions deadline.');
  assert.match(none.stop, /proposals are due in 6 days/);
  assert.equal(planQuestions(laguna(), { recorded: closed }).status, 'stop');
  assert.equal(planQuestions(laguna(), { recorded: closed, anyway: true }).status, 'ok');
});

test('a run saves the questions, and the next run says what changed', async () => {
  const workspace = await routeWorkspace();
  try {
    await recordDates(workspace);
    const first = await runQuestions({ slug: SLUG, input: laguna(), workspace, now: NOW });
    assert.equal(first.status, 'ok');
    assert.match(first.text, /^Send them the text between the lines word for word/);
    assert.match(first.text, /Questions due: Fri Dec 11, 2026, 5:00 PM PT \(17 days left\), per file 1, page 1\./);
    assert.match(first.text, /Send to: Mr\. Jordan Lucas, jlucas@lagunabeachcity\.net \(file 1, page 2\)\n/);
    const quoted = laguna();
    quoted.contact.source = 'file 4, page 2: "All questions must be emailed to Jordan Lucas."';
    assert.match(planQuestions(quoted, { recorded: { dates: [{ milestone: 'Questions due', when: 'Fri Dec 11', passed: false, daysLeft: 17 }] } }).chat, /\(file 4, page 2\)\n/);
    assert.match(first.text, /How to submit: Email to the contact/);
    assert.match(first.text, /Sources \(for checking, not for the agency\):\n1\. RFP is silent; nearest context §2, page 4 Settles: no incumbent named/);
    assert.match(first.text, /Email to copy:\n```\nSubject:/);
    assert.doesNotMatch(first.text, /Changed since/);
    const saved = await savedQuestions(SLUG, { workspace });
    assert.equal(saved.given, '2026-11-24');
    assert.equal(saved.questions.length, 5);
    assert.deepEqual(saved.input, laguna());
    assert.match(await fs.readFile(notePath(workspace), 'utf8'), /not necessarily what was sent/);

    const changed = laguna();
    changed.questions.splice(3, 1);
    changed.questions.push({ text: 'Where will the new site be hosted?', source: 'RFP is silent; nearest context §4' });
    const second = await runQuestions({ slug: SLUG, input: changed, workspace, now: NOW });
    assert.match(second.text, /Changed since the questions given on 2026-11-24:\n• Added: Where will the new site be hosted\?\n• Dropped: Which City staff/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('a closed window or a bad input saves nothing', async () => {
  const workspace = await routeWorkspace();
  try {
    await recordDates(workspace, { questions: 'November 20, 2026', now: new Date('2026-11-10T20:00:00Z') });
    const stopped = await runQuestions({ slug: SLUG, input: laguna(), workspace, now: NOW });
    assert.equal(stopped.status, 'stop');
    const bad = laguna();
    bad.questions[0].source = '';
    assert.equal((await runQuestions({ slug: SLUG, input: bad, workspace, now: NOW, anyway: true })).status, 'invalid');
    await assert.rejects(fs.access(notePath(workspace)));
    assert.equal((await runQuestions({ slug: SLUG, input: laguna(), workspace, now: NOW, anyway: true })).status, 'ok');
    await fs.access(notePath(workspace));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('--inputs gathers the scoring notes, the blockers, the brief\'s ambiguities and the key dates', async () => {
  const workspace = await routeWorkspace();
  try {
    const judgments = {
      buyer: { currentSolution: null, objective: 'A new public website the City can maintain.', advantage: null, evidence: [] },
      questions: { due: '2026-12-11', time: '5:00 PM PT', evidence: [{ quote: 'Questions due: December 11, 2026, 5:00 PM PT' }] },
      gates: { gate1: { pass: true, reason: 'Software work.' }, gate4: { pass: null, reason: 'Three public references are required; we list two.' } },
    };
    const escape = value => JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await fs.writeFile(path.join(folderOf(workspace), 'candidate.md'), [
      '---', 'title: "Website Redesign and Replacement Project for Laguna Beach"', 'scored_date: "2026-11-20"',
      'scoring_recommendation: "Strong Pursue"', `scoring_judgments: "${escape(judgments)}"`, 'scoring_conditional: unknown', '---', '',
    ].join('\n'));
    const latest = path.join(workspace, 'reports', 'new-rfp-qualification', 'latest.json');
    const results = JSON.parse(await fs.readFile(latest, 'utf8'));
    results.entries.push({ slug: SLUG, title: 'Website Redesign', agency: 'City of Laguna Beach', number: 'RFP 2026-31',
      blockers: [{ text: 'Three public references are required.', quote: '...' }], questions: ['Whether a nonprofit reference counts.'], agencyQuestion: null });
    await fs.writeFile(latest, JSON.stringify(results));
    await fs.writeFile(path.join(folderOf(workspace), 'engineering-brief_2026-11-21_laguna-beach-website-redesign.md'),
      '# Engineering brief\n\n## Scope\n\nText.\n\n## Ambiguities Requiring Clarification\n\n1. Is hosting included?\n   - RFP basis: RFP is silent\n\n## Notes\n\nInternal.\n');
    await fs.writeFile(path.join(folderOf(workspace), 'engineering-brief_2026-11-01_laguna-beach-website-redesign.md'), '## Ambiguities Requiring Clarification\n\nOld.\n');
    await recordDates(workspace);

    const inputs = await questionInputs(SLUG, { workspace, now: NOW });
    assert.equal(inputs.steps.length, 4);
    assert.match(inputs.steps[3], /pass the questions to rfp-questions\.mjs/);
    assert.match(inputs.steps[0], /who supports the current system/);
    assert.match(inputs.steps[1], /each of the 2 blockers and open questions/);
    assert.match(inputs.steps[2], /engineering brief's ambiguities/);
    assert.equal(inputs.scoring.scored, '2026-11-20');
    assert.equal(inputs.scoring.buyer.noIncumbentNamed, true);
    assert.equal(inputs.scoring.questionsDeadline.due, '2026-12-11');
    assert.equal('unresolvedGates' in inputs.scoring, false, 'the model\'s gate answers are not the decided gates');
    assert.equal(inputs.scoring.askTheAgency, null);
    assert.deepEqual(inputs.results.blockers, ['Three public references are required.']);
    assert.deepEqual(inputs.results.openQuestions, ['Whether a nonprofit reference counts.']);
    assert.equal(inputs.engineeringBrief.file, 'engineering-brief_2026-11-21_laguna-beach-website-redesign.md');
    assert.match(inputs.engineeringBrief.ambiguities, /^## Ambiguities Requiring Clarification\n\n1\. Is hosting included\?/);
    assert.doesNotMatch(inputs.engineeringBrief.ambiguities, /Internal/);
    assert.deepEqual(inputs.keyDates.dates.map(item => item.milestone), ['Questions due', 'Proposal due']);
    assert.equal(inputs.savedQuestions, null);
    assert.equal(inputs.documents.saved, 4);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('an RFP scored in an earlier week gets its blockers from the audit', async () => {
  const workspace = await routeWorkspace();
  try {
    const audit = path.join(workspace, 'reports', 'new-rfp-qualification', 'audit');
    await fs.mkdir(audit, { recursive: true });
    // A Phase 1 RFP whose candidate.md a later Friday run cleared: the audit has the only judgment.
    await fs.rm(path.join(folderOf(workspace), 'candidate.md'));
    const judgment = {
      conditional: { rule: '2a', question: 'May a software-services firm propose a purpose-built municipal website?', qaDueDate: '2026-11-17' },
      buyer: { currentSolution: 'An outdated CMS.', objective: 'An accessible site.', advantage: null },
      questions: { due: '2026-11-17', time: '5:00 PM PST', evidence: [{ quote: 'Questions are due no later than Tuesday, November 17, 2026' }] },
    };
    const line = slug => JSON.stringify({ run: { date: '2026-11-13' }, rfp: { slug, title: 'Website Redesign' }, outcome: { blockers: [`Blocker for ${slug}`], openQuestions: [] },
      listing: { recommendation: 'Watch item', judgment: {} }, fullText: { recommendation: 'Conditional — Ask the Agency', judgment } });
    await fs.writeFile(path.join(audit, '2026-11-06.jsonl'), `${line(SLUG)}\n`);
    await fs.writeFile(path.join(audit, '2026-11-13.jsonl'), `${line('other-rfp')}\n${line(SLUG).replace('Blocker for', 'Newer blocker for')}\n`);
    const inputs = await questionInputs(SLUG, { workspace, now: NOW });
    assert.match(inputs.steps[0], /No questions deadline is recorded/);
    assert.match(inputs.steps[1], /^Ask this first, in your own words if needed: May a software-services firm/);
    assert.equal(inputs.results.from, 'the 2026-11-13 run');
    assert.deepEqual(inputs.results.blockers, [`Newer blocker for ${SLUG}`]);
    assert.equal('scoring' in inputs.results, false);
    assert.equal(inputs.scoring.from, 'the 2026-11-13 run\'s audit line');
    assert.equal(inputs.scoring.recommendation, 'Conditional — Ask the Agency');
    assert.equal(inputs.scoring.askTheAgency.qaDueDate, '2026-11-17');
    assert.equal(inputs.scoring.questionsDeadline.time, '5:00 PM PST');
    assert.equal(inputs.scoring.buyer.noIncumbentNamed, false);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the command line reads the questions on standard input and saves only a good run', async () => {
  const workspace = await routeWorkspace();
  try {
    await recordDates(workspace);
    const run = (args, input) => spawnSync(process.execPath, [script, '--rfp', SLUG, ...args], {
      input, encoding: 'utf8', env: { ...process.env, WORKSPACE_DIR: workspace },
    });
    const bad = run([], JSON.stringify({ name: 'X', agency: 'Y', questions: [{ text: 'Who? $(touch pwned)' }] }));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /Nothing was saved\. Fix these/);
    const good = run([], JSON.stringify(laguna()));
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /Email to copy:/);
    const shown = JSON.parse(run(['--show']).stdout);
    assert.equal(shown.questions.length, 5);
    await assert.rejects(fs.access(path.join(workspace, 'pwned')));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('a request for the questions carries the inputs and their steps', async () => {
  const workspace = await routeWorkspace();
  try {
    const decision = await routeRequest('Draft clarifying questions for the Laguna Beach Q&A', { workspace, now: NOW });
    assert.equal(decision.action, 'run-skill');
    assert.equal(decision.inputs.rfp, SLUG);
    assert.match(decision.inputs.steps[0], /No questions deadline is recorded/);
    assert.match(decision.inputs.steps.at(-1), /Never send questions you wrote without it/);
    const other = await routeRequest('rfp brief laguna-beach-website-redesign', { workspace, now: NOW });
    assert.equal('inputs' in other, false, 'only the agency questions skill gets them');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the router answers "what did we ask" from the saved questions', async () => {
  const workspace = await routeWorkspace();
  try {
    const before = await routeRequest('What questions did we ask the agency for Laguna Beach?', { workspace });
    assert.equal(before.action, 'answer');
    assert.equal(before.about, 'questions');
    assert.equal(before.questions, null);
    assert.match(before.note, /offer `rfp questions laguna-beach-website-redesign`/);
    await recordDates(workspace);
    await runQuestions({ slug: SLUG, input: laguna(), workspace, now: NOW });
    const after = await routeRequest('The city answered our questions for Laguna Beach', { workspace });
    assert.equal(after.about, 'agency-answers');
    assert.equal(after.questions.given, '2026-11-24');
    assert.equal(after.questions.questions[0].n, 1);
    assert.ok(after.documents.saved > 0, 'the answers may be in a saved addendum');
    assert.deepEqual(after.answerFiles, [{ n: 1, read: `node scripts/document-text.mjs --rfp ${SLUG} --file 1` }], 'the addendum is named to read first');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
