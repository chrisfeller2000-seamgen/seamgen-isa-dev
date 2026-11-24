// scripts/rfp-capability.mjs: the capability check's inputs, row checks, message, saved record
// and recorded answers.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeWorkspace } from './fixtures/rfp-route-workspace.mjs';
import { runDates } from '../workspace/scripts/rfp-dates.mjs';
import { capabilityInputs, checkAnswer, checkCapability, parsePeople, renderCheck, runAnswer, runCheck, savedCapability } from '../workspace/scripts/rfp-capability.mjs';
import { questionInputs } from '../workspace/scripts/rfp-questions.mjs';
import { routeRequest } from '../workspace/scripts/rfp-route.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'workspace', 'scripts', 'rfp-capability.mjs');
const SLUG = 'laguna-beach-website-redesign';
const NOW = new Date('2026-11-24T20:00:00Z');
const notePath = workspace => path.join(workspace, 'RFPs', '2-intermediate-stage', SLUG, `capability-check_${SLUG}.md`);

// The VM's People.txt layout: a heading, notes, then each person's name in capitals.
const PEOPLE = `SEAMGEN PROPOSAL PEOPLE

Current Seamgen staff as of 2026-11-10.


PETE NYSTROM
Role: VP of Engineering
Source: Drive "Proposal - People" deck.

Pete has over 20 years of experience.

Seamgen work on record: built the back end of the Florida Department of Environmental Protection GIS platform, which wrote attributes (not geometry) back into the client's ArcGIS Enterprise.


SETH LUTSKE
Role: Technical Lead (Full Stack Engineer)

GIS note: Seth holds no Esri certification.
`;

const check = () => ({
  name: 'Website Redesign and Replacement Project', number: 'RFP 2026-31', decision: 'whether we bid as prime builder or pass',
  routedTo: [{ name: 'Pete Nystrom', why: 'you built the FDEP GIS back end', rows: [1, 2] }, { name: 'Seth Lutske', why: 'you led the FDEP front end', rows: [3] }],
  rows: [
    { operation: 'Write attributes back to a client ArcGIS feature layer', quote: 'bi-directional communication with GIS', source: 'file 1, page 7, §5C', ifYes: 'Seamgen has written attributes into a state agency\'s ArcGIS Enterprise.' },
    { operation: 'Write parcel geometry back to a client ArcGIS feature layer', quote: 'managing parcel boundaries', source: 'file 1, page 8, §5E', ifYes: 'Seamgen has written parcel geometry into a state agency\'s ArcGIS Enterprise.' },
    { operation: 'Render ArcGIS map layers in a web app', quote: 'Native integration with ESRI ArcGIS software is required for mapping', source: 'file 1, page 8, §5E', ifYes: 'Seamgen has built web apps that render ArcGIS layers.' },
  ],
});

async function workspaceWithPeople() {
  const workspace = await routeWorkspace();
  await fs.mkdir(path.join(workspace, 'resources', 'proposal-sources'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'resources', 'proposal-sources', 'Proposal - People.txt'), PEOPLE);
  return workspace;
}

test('People.txt gives the current staff, their roles and what the record says they built', () => {
  const people = parsePeople(PEOPLE);
  assert.deepEqual(people.map(person => [person.name, person.role]), [['Pete Nystrom', 'VP of Engineering'], ['Seth Lutske', 'Technical Lead (Full Stack Engineer)']]);
  assert.match(people[0].onRecord[0], /^Seamgen work on record: built the back end of the Florida/);
  assert.equal(people[1].onRecord[0], 'GIS note: Seth holds no Esri certification.');
  assert.equal(parsePeople(''), null);
});

test('a check needs a quote, a source and an "if yes" sentence on every row, at most 10 rows, and only current staff', () => {
  const people = parsePeople(PEOPLE);
  assert.deepEqual(checkCapability(check(), { people }), []);
  const bad = check();
  bad.rows[0].quote = '';
  bad.rows[1].ifYes = '';
  bad.rows.push({ ...bad.rows[2] });
  bad.routedTo[0].name = 'Adan Aispuro';
  bad.routedTo[1].rows = [];
  const problems = checkCapability(bad, { people }).join('\n');
  assert.match(problems, /Row 1 has no "quote"/);
  assert.match(problems, /Row 2 has no "ifYes"/);
  assert.match(problems, /Row 4 repeats an earlier operation/);
  assert.match(problems, /Adan Aispuro is not on the current staff list .*Route to: Pete Nystrom, Seth Lutske/);
  const many = check();
  many.rows = Array.from({ length: 11 }, (_, index) => ({ ...check().rows[0], operation: `Operation ${index}` }));
  many.routedTo = [{ name: 'Pete Nystrom', why: 'FDEP' }];
  assert.match(checkCapability(many, { people }).join('\n'), /11 rows is too many/);
  const unrouted = check();
  unrouted.routedTo = [{ name: 'Pete Nystrom', why: 'FDEP', rows: [1] }];
  assert.match(checkCapability(unrouted, { people }).join('\n'), /Row 2 isn't routed to anyone/);
});

test('the message for each engineer asks only their rows, shows the claim a yes allows, and quotes the deadline', () => {
  const recorded = { dates: [{ milestone: 'Questions due', when: 'Fri Dec 11, 2026, 5:00 PM PT', passed: false, daysLeft: 17 }] };
  const text = renderCheck(check(), { recorded });
  assert.match(text, /^Capability check: Website Redesign and Replacement Project \(RFP 2026-31\)\nDecides: whether we bid as prime builder or pass\nQuestions to the agency close Fri Dec 11, 2026, 5:00 PM PT \(17 days left\)\./);
  assert.match(text, /Ask Pete Nystrom \(rows 1, 2\): you built the FDEP GIS back end/);
  const pete = text.split('Message for Pete Nystrom')[1].split('Message for Seth Lutske')[0];
  assert.match(pete, /Hey Pete, quick capability check for the Website Redesign and Replacement Project bid\. Two specific things/);
  assert.match(pete, /Asking you because you built the FDEP GIS back end\./);
  assert.match(pete, /2\. Write parcel geometry back to a client ArcGIS feature layer\. RFP says: "managing parcel boundaries" \(file 1, page 8, §5E\)\n {3}If it's "done exactly", we'd write: "Seamgen has written parcel geometry/);
  assert.doesNotMatch(pete, /Render ArcGIS map layers/, 'row 3 is Seth\'s');
  assert.match(pete, /Context: this decides whether we bid as prime builder or pass\. Questions to the agency close Fri Dec 11/);
  assert.match(pete, /A "probably" doesn't help me here: it ends up in a proposal\./);
  assert.match(text.split('Message for Seth Lutske')[1], /Hey Seth[\s\S]*1\. Render ArcGIS map layers/);
});

test('an answer needs their words, a project for "done", and a project and the difference for "adjacent"', () => {
  const people = parsePeople(PEOPLE);
  const rows = check().rows;
  assert.deepEqual(checkAnswer({ by: 'Pete Nystrom', said: 'Yes, FDEP.', rows: [{ n: 1, answer: 'done', project: 'FDEP GIS platform' }] }, { rows, people }), []);
  const problems = checkAnswer({ by: 'Pete', said: '', rows: [
    { n: 1, answer: 'done' }, { n: 2, answer: 'adjacent', project: 'FDEP' }, { n: 3, answer: 'probably' }, { n: 9, answer: 'never' },
  ] }, { rows, people }).join('\n');
  assert.match(problems, /Pete is not on the current staff list/);
  assert.match(problems, /"said" is missing/);
  assert.match(problems, /Row 1 is "done" with no project\. No project name, no claim/);
  assert.match(problems, /Row 2 is "adjacent": it needs the project and "difference"/);
  assert.match(problems, /Row 3: "answer" must be one of done, adjacent, never, unanswered/);
  assert.match(problems, /Row 9 doesn't exist/);
});

test('a check is saved, answers are recorded word for word, and open rows stay listed', async () => {
  const workspace = await workspaceWithPeople();
  try {
    await runDates({ slug: SLUG, workspace, now: NOW, input: { name: 'Laguna Beach', zone: 'PT', milestones: [{ kind: 'questions', date: 'December 11, 2026', time: '5:00 PM', source: 'file 1, page 1' }] } });
    const written = await runCheck({ slug: SLUG, input: check(), workspace, now: NOW });
    assert.equal(written.status, 'ok');
    assert.match(written.text, /^Send them the text between the lines word for word/);
    assert.match(written.text, /Questions to the agency close Fri Dec 11, 2026, 5:00 PM PT \(17 days left\)/);
    assert.match(written.text, /Message for Pete Nystrom, to copy and send yourself \(nothing has been sent\):\n```\nHey Pete/);

    // Seth hedges on row 3; Pete answers rows 1 and 2, the way Suwannee went.
    const seth = await runAnswer({ slug: SLUG, workspace, now: NOW, answer: { by: 'Seth Lutske', said: 'If I understood it correctly, yes. Pete would know more.', rows: [{ n: 3, answer: 'unanswered' }] } });
    assert.equal(seth.status, 'ok');
    assert.match(seth.text, /3\. Render ArcGIS map layers in a web app: Not answered \(they hedged, deferred or answered something else\)\. Seth Lutske, 2026-11-24/);
    assert.match(seth.text, /Rows still unanswered: 1, 2, 3\. Never write these up as done\./);
    const pete = await runAnswer({ slug: SLUG, workspace, now: NOW, answer: { by: 'Pete Nystrom', said: 'Attributes yes, on FDEP. Geometry never.',
      rows: [{ n: 1, answer: 'done', project: 'FDEP GIS platform', client: 'Florida DEP' }, { n: 2, answer: 'never' }],
      recordGaps: ['Pete\'s bio doesn\'t mention the FDEP GIS work'] } });
    assert.match(pete.text, /1\. Write attributes back to a client ArcGIS feature layer: Done exactly, on FDEP GIS platform \(Florida DEP\)\. Pete Nystrom, 2026-11-24/);
    assert.match(pete.text, /2\. Write parcel geometry back to a client ArcGIS feature layer: Never\./);
    assert.match(pete.text, /Rows still unanswered: 3\./);
    assert.match(pete.text, /Seth Lutske, 2026-11-24: "If I understood it correctly, yes\. Pete would know more\."/);
    assert.match(pete.text, /Record gaps to fix .*never on a verbal answer alone\):\n- Pete's bio doesn't mention the FDEP GIS work \(from Pete Nystrom, 2026-11-24\)/);

    const saved = await savedCapability(SLUG, { workspace });
    assert.deepEqual(saved.unanswered, [3]);
    assert.deepEqual(saved.rows.map(row => row.status), ['done', 'never', 'unanswered']);
    assert.match(await fs.readFile(notePath(workspace), 'utf8'), /^# Capability check: Website Redesign/);

    // A rewrite keeps answers to unchanged rows and says which it drops.
    const changed = check();
    changed.rows.splice(1, 1);
    changed.routedTo = [{ name: 'Pete Nystrom', why: 'FDEP', rows: [1, 2] }];
    const rewritten = await runCheck({ slug: SLUG, input: changed, workspace, now: NOW });
    assert.match(rewritten.text, /Answers dropped because their row changed or was removed:\n- Write parcel geometry back to a client ArcGIS feature layer \(Pete Nystrom, 2026-11-24\)/);
    const after = await savedCapability(SLUG, { workspace });
    assert.deepEqual(after.rows.map(row => [row.operation.slice(0, 16), row.status]), [['Write attributes', 'done'], ['Render ArcGIS ma', 'unanswered']]);

    // The agency questions inputs see the open row.
    const inputs = await questionInputs(SLUG, { workspace, now: NOW });
    assert.deepEqual(inputs.capability.rows, [{ n: 2, operation: 'Render ArcGIS map layers in a web app', status: 'unanswered' }]);
    assert.ok(inputs.steps.some(step => /capability check has 1 row answered "never" or still unanswered/.test(step)));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('nothing is saved for a bad check, and an answer needs a saved check', async () => {
  const workspace = await workspaceWithPeople();
  try {
    const bad = check();
    bad.routedTo[0].name = 'Jake';
    assert.equal((await runCheck({ slug: SLUG, input: bad, workspace, now: NOW })).status, 'invalid');
    await assert.rejects(fs.access(notePath(workspace)));
    const orphan = await runAnswer({ slug: SLUG, workspace, now: NOW, answer: { by: 'Pete Nystrom', said: 'yes', rows: [{ n: 1, answer: 'never' }] } });
    assert.match(orphan.problems[0], /No capability check is saved/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('--inputs gives the case-study match, the team and the steps', async () => {
  const workspace = await workspaceWithPeople();
  try {
    const escape = value => JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const judgments = { categories: { caseStudy: { band: 'adjacent', points: 14, project: 'FDEP', reason: 'GIS platform, attributes only.' }, tech: { band: 'mostlyKnown', reason: 'ArcGIS Enterprise.' } } };
    await fs.writeFile(path.join(workspace, 'RFPs', '2-intermediate-stage', SLUG, 'candidate.md'), `---\ntitle: "Laguna"\nscored_date: "2026-11-20"\nscoring_judgments: "${escape(judgments)}"\n---\n`);
    const inputs = await capabilityInputs(SLUG, { workspace, now: NOW });
    assert.deepEqual(inputs.scoring.caseStudy, { band: 'adjacent', project: 'FDEP', reason: 'GIS platform, attributes only.' });
    assert.equal(inputs.scoring.tech.band, 'mostlyKnown');
    assert.deepEqual(inputs.team.map(person => person.name), ['Pete Nystrom', 'Seth Lutske']);
    assert.match(inputs.steps[0], /matched our case studies as "adjacent" \(FDEP\), not a direct match/);
    assert.match(inputs.steps.at(-1), /never send the message to anyone/);
    assert.equal(inputs.sources.people, 'cat "resources/proposal-sources/Proposal - People.txt"');

    await fs.rm(path.join(workspace, 'resources'), { recursive: true });
    const noPeople = await capabilityInputs(SLUG, { workspace, now: NOW });
    assert.equal(noPeople.team, null);
    assert.ok(noPeople.steps.some(step => /Proposal - People\.txt is missing/.test(step)));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the router records a passed-on answer, answers "what did Pete say", and hands the skill its inputs', async () => {
  const workspace = await workspaceWithPeople();
  try {
    const build = await routeRequest('capability check for laguna beach', { workspace, now: NOW });
    assert.equal(build.action, 'run-skill');
    assert.deepEqual(build.inputs.team.map(person => person.name), ['Pete Nystrom', 'Seth Lutske']);

    // An answer for a Phase 1 RFP is recorded, never turned into a move question.
    const report = await routeRequest('Pete answered the Chandler permit portal capability check: rows 1 and 2 done on FDEP, row 3 never', { workspace, now: NOW });
    assert.equal(report.action, 'run-skill');
    assert.equal(report.mode, 'record-answer');
    assert.match(report.note, /--answer/);

    const before = await routeRequest('What did Pete say about the Laguna Beach capability check?', { workspace, now: NOW });
    assert.equal(before.action, 'answer');
    assert.equal(before.about, 'capability');
    assert.equal(before.capability, null);
    await runCheck({ slug: SLUG, input: check(), workspace, now: NOW });
    await runAnswer({ slug: SLUG, workspace, now: NOW, answer: { by: 'Pete Nystrom', said: 'Attributes yes, on FDEP.', rows: [{ n: 1, answer: 'done', project: 'FDEP GIS platform' }] } });
    const after = await routeRequest('Which rows are still open on the Laguna Beach capability check?', { workspace, now: NOW });
    assert.equal(after.about, 'capability');
    assert.deepEqual(after.capability.unanswered, [2, 3]);
    assert.equal(after.capability.answers[0].said, 'Attributes yes, on FDEP.');
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('the command line reads the check on standard input and saves only a good one', async () => {
  const workspace = await workspaceWithPeople();
  try {
    const run = (args, input) => spawnSync(process.execPath, [script, '--rfp', SLUG, ...args], { input, encoding: 'utf8', env: { ...process.env, WORKSPACE_DIR: workspace } });
    const bad = run([], JSON.stringify({ name: 'X $(touch pwned)', rows: [] }));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /Nothing was saved/);
    const good = run([], JSON.stringify(check()));
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /Message for Pete Nystrom/);
    const answered = run(['--answer'], JSON.stringify({ by: 'Pete Nystrom', said: 'Geometry: never.', rows: [{ n: 2, answer: 'never' }] }));
    assert.equal(answered.status, 0, answered.stderr);
    assert.deepEqual(JSON.parse(run(['--show']).stdout).unanswered, [1, 3]);
    await assert.rejects(fs.access(path.join(workspace, 'pwned')));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
