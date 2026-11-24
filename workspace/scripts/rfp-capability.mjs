#!/usr/bin/env node
// An RFP's capability check: the parts of skills/rfp/capability-check/instructions.md that need
// no judgment. ISA breaks the RFP's technical asks into operations and picks who to ask; this
// gathers what that is decided from, checks the rows, builds the checklist and the message for
// the engineer, records the engineer's answers word for word, and keeps the record in the RFP's
// folder so "what did Pete say?" and later skills have an answer.
//
//   node scripts/rfp-capability.mjs --rfp <slug> --inputs        (what the check is built from)
//   node scripts/rfp-capability.mjs --rfp <slug> --show          (the saved check and its answers)
//   node scripts/rfp-capability.mjs --rfp <slug> <<'RFP_CAPABILITY_END'      (write or rewrite the check)
//   { "name": "...", "decision": "...", "routedTo": [...], "rows": [...] }
//   RFP_CAPABILITY_END
//   node scripts/rfp-capability.mjs --rfp <slug> --answer <<'RFP_CAPABILITY_END'   (record an answer)
//   { "by": "Pete Nystrom", "said": "<their words>", "rows": [ { "n": 2, "answer": "done", "project": "FDEP GIS platform" } ] }
//   RFP_CAPABILITY_END
//
// The rules it enforces are the skill's own, from Suwannee River WMD in July 2026, where a hedge
// was recorded as a yes and written into a brief twice:
// - every row quotes the RFP with its file and page, and says the proposal sentence a yes allows;
// - at most 10 rows, since past that engineers skim;
// - questions go only to people on the current staff list (resources/proposal-sources/
//   Proposal - People.txt), never to someone who has left;
// - "done exactly" needs a named project and "adjacent" a project and what differs, or the answer
//   is refused: no project name, no claim;
// - every answer is kept in the engineer's own words, dated, and unanswered rows stay listed.
//
// It writes one file, capability-check_<slug>.md in the RFP's folder (not resources/, so it isn't
// copied to Drive). ISA never sends the message: the person who asked sends it themselves. It
// never edits Proposal - People.txt or the case studies; record gaps are listed for a person to fix.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rfpDocuments } from './document-text.mjs';
import { recordedDates } from './rfp-dates.mjs';
import { findRfpFolders, workspaceDir } from './rfp-folders.mjs';
import { scoringJudgment } from './rfp-questions.mjs';

const LEDGER = /<!-- rfp-capability-ledger\n([\s\S]*?)\n-->/;
const MOST_ROWS = 10;
const ANSWERS = { done: 'Done exactly', adjacent: 'Adjacent', never: 'Never', unanswered: 'Not answered' };
const PEOPLE_FILE = path.join('resources', 'proposal-sources', 'Proposal - People.txt');
const CASE_STUDIES_FILE = path.join('resources', 'proposal-sources', 'Proposal - Case Studies.txt');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const list = value => (Array.isArray(value) ? value : value ? [value] : []);
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const key = name => clean(name).toLowerCase();
const today = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// ---- The current staff list ---------------------------------------------------------------------

const titleCase = text => text.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (all, before, letter) => before + letter.toUpperCase());

/**
 * Current staff from Proposal - People.txt: each person starts at a line of their name in
 * capitals, with a "Role:" line under it. Lines starting "Seamgen work on record" or "<X> note:"
 * are what the record says they built. Returns [{ name, role, onRecord[] }], or null when the
 * file is missing.
 */
export function parsePeople(text) {
  if (!text) return null;
  const people = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[A-Z][A-Z'.-]+(?: [A-Z][A-Z'.-]+){1,3}$/.test(line) && line !== 'SEAMGEN PROPOSAL PEOPLE') {
      current = { name: titleCase(line), role: '', onRecord: [] };
      people.push(current);
    } else if (current && /^Role:/.test(line) && !current.role) {
      current.role = clean(line.slice(5));
    } else if (current && /^(Seamgen work on record|[A-Za-z ]+ note):/.test(line)) {
      current.onRecord.push(clean(line));
    }
  }
  return people;
}

async function readPeople(workspace) {
  return parsePeople(await fs.readFile(path.join(workspace, PEOPLE_FILE), 'utf8').catch(() => ''));
}

// ---- Checking ISA's input -------------------------------------------------------------------------

function rowsOf(input) {
  return list(input?.rows).map(row => ({ operation: clean(row?.operation), quote: clean(row?.quote), source: clean(row?.source), ifYes: clean(row?.ifYes) }));
}
function routesOf(input) {
  return list(input?.routedTo).map(route => ({ name: clean(route?.name), why: clean(route?.why), rows: list(route?.rows).map(Number).filter(Number.isInteger) }));
}

/** Every problem with a check, as sentences ISA can fix. Empty when it is fine. */
export function checkCapability(input, { people = null } = {}) {
  const problems = [];
  const rows = rowsOf(input);
  if (!clean(input?.name)) problems.push('"name" is missing: the RFP\'s name as the documents print it.');
  if (!clean(input?.decision)) problems.push('"decision" is missing: what the answers decide (for example "prime builder or no-bid, before questions close").');
  if (!rows.length) problems.push('"rows" is empty.');
  if (rows.length > MOST_ROWS) problems.push(`${rows.length} rows is too many: past ${MOST_ROWS} engineers skim. Keep the operations that decide the bid.`);
  const seen = new Set();
  rows.forEach((row, index) => {
    const n = index + 1;
    if (!row.operation) problems.push(`Row ${n} has no "operation".`);
    if (!row.quote) problems.push(`Row ${n} has no "quote": the RFP's own words for this operation.`);
    if (!row.source) problems.push(`Row ${n} has no "source": the file and page (and section) of the quote.`);
    if (!row.ifYes) problems.push(`Row ${n} has no "ifYes": the proposal sentence a "done exactly" answer would allow.`);
    if (row.operation && seen.has(key(row.operation))) problems.push(`Row ${n} repeats an earlier operation.`);
    seen.add(key(row.operation));
  });
  const routes = routesOf(input);
  if (!routes.length) problems.push('"routedTo" is empty: name who built the closest real thing.');
  const covered = new Set();
  for (const route of routes) {
    if (!route.name) { problems.push('A "routedTo" entry has no name.'); continue; }
    if (!route.why) problems.push(`Say why ${route.name} is the right person ("why": the project they built).`);
    if (people && !people.some(person => key(person.name) === key(route.name))) {
      problems.push(`${route.name} is not on the current staff list (${PEOPLE_FILE}). Route to: ${people.map(person => person.name).join(', ')}.`);
    }
    const rowsFor = route.rows.length ? route.rows : rows.map((row, index) => index + 1);
    for (const n of rowsFor) {
      if (n < 1 || n > rows.length) problems.push(`${route.name} is given row ${n}, which doesn't exist.`);
      covered.add(n);
    }
  }
  rows.forEach((row, index) => { if (routes.length && !covered.has(index + 1)) problems.push(`Row ${index + 1} isn't routed to anyone.`); });
  return problems;
}

/** Every problem with an answer, as sentences ISA can fix. Empty when it is fine. */
export function checkAnswer(answer, { rows = [], people = null } = {}) {
  const problems = [];
  if (!clean(answer?.by)) problems.push('"by" is missing: who answered.');
  else if (people && !people.some(person => key(person.name) === key(answer.by))) {
    problems.push(`${clean(answer.by)} is not on the current staff list (${PEOPLE_FILE}); use their full name as it is listed there.`);
  }
  if (!clean(answer?.said)) problems.push('"said" is missing: their answer in their own words, as they wrote it. A paraphrase is how a hedge becomes a claim.');
  const given = list(answer?.rows);
  if (!given.length) problems.push('"rows" is empty: say which rows this answer covers.');
  for (const row of given) {
    const n = Number(row?.n);
    const label = `Row ${row?.n}`;
    if (!Number.isInteger(n) || n < 1 || n > rows.length) { problems.push(`${label} doesn't exist; the check has ${rows.length} rows.`); continue; }
    if (!ANSWERS[row?.answer]) { problems.push(`${label}: "answer" must be one of ${Object.keys(ANSWERS).join(', ')}.`); continue; }
    if (row.answer === 'done' && !clean(row.project)) {
      problems.push(`${label} is "done" with no project. No project name, no claim: record it as "unanswered" until they name the project.`);
    }
    if (row.answer === 'adjacent' && (!clean(row.project) || !clean(row.difference))) {
      problems.push(`${label} is "adjacent": it needs the project and "difference", what is different from what the RFP asks.`);
    }
  }
  return problems;
}

// ---- Status -----------------------------------------------------------------------------------------

/** Each row's latest answer, in the order the answers were recorded. */
function statusOf(rows, answers) {
  return rows.map((row, index) => {
    const n = index + 1;
    let latest = null;
    for (const answer of answers) {
      const item = list(answer.rows).find(entry => Number(entry.n) === n);
      if (item) latest = { ...item, by: answer.by, date: answer.date };
    }
    return { n, operation: row.operation, status: latest?.answer || 'unanswered', ...(latest ? { by: latest.by, date: latest.date } : {}),
      ...(latest?.project ? { project: clean(latest.project) } : {}), ...(latest?.client ? { client: clean(latest.client) } : {}),
      ...(latest?.difference ? { difference: clean(latest.difference) } : {}), answered: Boolean(latest) };
  });
}

function statusLine(row) {
  if (!row.answered) return `${row.n}. ${row.operation}: not answered yet`;
  const what = row.status === 'done' ? `Done exactly, on ${row.project}${row.client ? ` (${row.client})` : ''}`
    : row.status === 'adjacent' ? `Adjacent, on ${row.project}${row.client ? ` (${row.client})` : ''}; different: ${row.difference}`
      : row.status === 'never' ? 'Never' : 'Not answered (they hedged, deferred or answered something else)';
  return `${row.n}. ${row.operation}: ${what}. ${row.by}, ${row.date}`;
}

// ---- The checklist and the message --------------------------------------------------------------------

/** The deadline line from the key-dates note, or null. */
function deadlineLine(recorded) {
  const dates = recorded?.dates || [];
  const questions = dates.find(item => item.milestone === 'Questions due');
  const proposal = dates.find(item => item.milestone === 'Proposal due');
  const left = item => (item.daysLeft === 0 ? 'today' : `${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left`);
  if (questions && !questions.passed) return `Questions to the agency close ${questions.when} (${left(questions)}).`;
  if (proposal && !proposal.passed) return `Proposals are due ${proposal.when} (${left(proposal)}).`;
  return null;
}

function messageFor(route, rows, input, deadline) {
  const numbers = route.rows.length ? route.rows : rows.map((row, index) => index + 1);
  const first = route.name.split(' ')[0];
  const count = numbers.length;
  const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const lines = [
    `Hey ${first}, quick capability check for the ${clean(input.name)} bid. ${words[count] || count} specific thing${count === 1 ? '' : 's'}, and I need each answered separately rather than as a general "have we done this".`,
    '',
    `Asking you because ${route.why.replace(/^because /i, '')}.`,
    '',
    'For each: have we done exactly this, something adjacent, or never? If not never, which project?',
    '',
  ];
  numbers.forEach((n, index) => {
    const row = rows[n - 1];
    lines.push(`${index + 1}. ${row.operation}. RFP says: "${row.quote}" (${row.source})`);
    lines.push(`   If it's "done exactly", we'd write: "${row.ifYes}"`);
  });
  lines.push('', `Context: this decides ${clean(input.decision).replace(/\.$/, '')}.${deadline ? ` ${deadline}` : ''}`);
  lines.push('', 'If any of these is really someone else\'s area, say so and I\'ll route it. A "probably" doesn\'t help me here: it ends up in a proposal.');
  return lines.join('\n');
}

/** The text for the person who asked: the checklist, then one message per engineer to copy. */
export function renderCheck(input, { recorded = null, answers = [] } = {}) {
  const rows = rowsOf(input);
  const routes = routesOf(input);
  const deadline = deadlineLine(recorded);
  const status = statusOf(rows, answers);
  const out = [`Capability check: ${clean(input.name)}${clean(input.number) ? ` (${clean(input.number)})` : ''}`, `Decides: ${clean(input.decision)}`];
  if (deadline) out.push(deadline);
  out.push(...routes.map(route => `Ask ${route.name}${route.rows.length ? ` (rows ${route.rows.join(', ')})` : ''}: ${route.why}`));
  out.push('', 'Rows:');
  rows.forEach((row, index) => {
    out.push(`${index + 1}. ${row.operation}`, `   RFP: "${row.quote}" (${row.source})`, `   If "done exactly": "${row.ifYes}"`, `   Answer: ${statusLine(status[index]).replace(/^\d+\. [^:]*: /, '')}`);
  });
  for (const route of routes) {
    out.push('', `Message for ${route.name}, to copy and send yourself (nothing has been sent):`, '```', messageFor(route, rows, input, deadline), '```');
  }
  return out.join('\n');
}

function renderAnswers(input, answers) {
  const rows = rowsOf(input);
  const status = statusOf(rows, answers);
  const open = status.filter(row => !row.answered || row.status === 'unanswered').map(row => row.n);
  const gaps = answers.flatMap(answer => list(answer.recordGaps).map(gap => `${clean(gap)} (from ${answer.by}, ${answer.date})`));
  const out = [`Capability check: ${clean(input.name)}`, '', 'Where each row stands:', ...status.map(statusLine)];
  out.push('', open.length ? `Rows still unanswered: ${open.join(', ')}. Never write these up as done.` : 'Every row has an answer.');
  out.push('', 'Answers in their own words:', ...answers.map(answer => `${answer.by}, ${answer.date}: "${answer.said}"`));
  if (gaps.length) {
    out.push('', 'Record gaps to fix (a person confirms and edits People.txt or the case studies; never on a verbal answer alone):', ...gaps.map(gap => `- ${gap}`));
  }
  return out.join('\n');
}

// ---- Files -------------------------------------------------------------------------------------------

async function rfpFolder(slug, workspace) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(slug || ''))) throw new Error('That is not an RFP slug.');
  const folders = await findRfpFolders(slug, { workspace });
  if (!folders.length) throw new Error(`${slug} has no folder yet, so its documents aren't saved. Follow skills/rfp/document-fetch/instructions.md first.`);
  if (folders.length > 1) throw new Error(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them.`);
  return folders[0].dir;
}
const notePathOf = (dir, slug) => path.join(dir, `capability-check_${slug}.md`);
const relativeTo = (workspace, file) => path.relative(workspace, file).split(path.sep).join('/');
function readLedger(text) {
  const match = String(text || '').match(LEDGER);
  return match ? parseJson(match[1]) : null;
}
async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}
async function writeNote(file, ledger, recorded) {
  const text = [
    `# Capability check: ${clean(ledger.input.name)}`,
    '',
    `Written by scripts/rfp-capability.mjs; the check was given on ${ledger.given}. Run it again instead of editing this file.`,
    '',
    renderCheck(ledger.input, { recorded, answers: ledger.answers }),
    '',
    renderAnswers(ledger.input, ledger.answers),
    '',
    `<!-- rfp-capability-ledger\n${JSON.stringify(ledger, null, 2).replace(/-->/g, '--\\u003e')}\n-->`,
    '',
  ].join('\n');
  await writeAtomic(file, text);
}

/** The saved check: { given, note, rows: [{ n, operation, status, ... }], unanswered, answers, recordGaps, input }, or null. */
export async function savedCapability(slug, { workspace = workspaceDir() } = {}) {
  let dir;
  try { dir = await rfpFolder(slug, workspace); } catch { return null; }
  const file = notePathOf(dir, slug);
  const ledger = readLedger(await fs.readFile(file, 'utf8').catch(() => ''));
  if (!ledger?.input) return null;
  const rows = statusOf(rowsOf(ledger.input), ledger.answers || []);
  return {
    given: ledger.given,
    note: relativeTo(workspace, file),
    routedTo: routesOf(ledger.input).map(route => route.name),
    rows: rows.map(({ answered, ...row }) => row),
    unanswered: rows.filter(row => !row.answered || row.status === 'unanswered').map(row => row.n),
    answers: (ledger.answers || []).map(answer => ({ by: answer.by, date: answer.date, said: answer.said })),
    recordGaps: (ledger.answers || []).flatMap(answer => list(answer.recordGaps)),
    input: ledger.input,
  };
}

/**
 * Writes or rewrites the check. A rewrite keeps the answers to rows whose operation is unchanged
 * (renumbered to match) and lists the answers it drops. Returns { status, text | problems }.
 */
export async function runCheck({ slug, input, workspace = workspaceDir(), now = new Date() }) {
  const dir = await rfpFolder(slug, workspace);
  const file = notePathOf(dir, slug);
  const people = await readPeople(workspace);
  const problems = checkCapability(input, { people });
  if (problems.length) return { status: 'invalid', problems };
  const previous = readLedger(await fs.readFile(file, 'utf8').catch(() => ''));
  const rows = rowsOf(input);
  const dropped = [];
  let answers = [];
  if (previous?.input) {
    const oldRows = rowsOf(previous.input);
    const renumber = new Map(oldRows.map((row, index) => [index + 1, rows.findIndex(item => key(item.operation) === key(row.operation)) + 1]));
    answers = (previous.answers || []).map(answer => ({ ...answer, rows: list(answer.rows).flatMap((item) => {
      const n = renumber.get(Number(item.n));
      if (n) return [{ ...item, n }];
      dropped.push(`${oldRows[Number(item.n) - 1]?.operation} (${answer.by}, ${answer.date})`);
      return [];
    }) })).filter(answer => answer.rows.length);
  }
  const recorded = await recordedDates(slug, { workspace, now });
  const ledger = { given: today(now), input, answers };
  await writeNote(file, ledger, recorded);
  const chat = [renderCheck(input, { recorded, answers })];
  if (dropped.length) chat.push('', 'Answers dropped because their row changed or was removed:', ...dropped.map(item => `- ${item}`));
  const notes = people ? [] : [`${PEOPLE_FILE} is missing, so who is current couldn't be checked. Ask the person who asked to confirm the names before sending.`];
  return { status: 'ok', text: relay(chat.join('\n'), relativeTo(workspace, file), notes) };
}

/** Records one engineer's answer. Returns { status, text | problems }. */
export async function runAnswer({ slug, answer, workspace = workspaceDir(), now = new Date() }) {
  const dir = await rfpFolder(slug, workspace);
  const file = notePathOf(dir, slug);
  const ledger = readLedger(await fs.readFile(file, 'utf8').catch(() => ''));
  if (!ledger?.input) return { status: 'invalid', problems: [`No capability check is saved for ${slug}. Write the check first; answers attach to its rows.`] };
  const people = await readPeople(workspace);
  const problems = checkAnswer(answer, { rows: rowsOf(ledger.input), people });
  if (problems.length) return { status: 'invalid', problems };
  const entry = {
    by: clean(answer.by), date: clean(answer.date) || today(now), said: String(answer.said).trim(),
    rows: list(answer.rows).map(row => ({ n: Number(row.n), answer: row.answer, ...(clean(row.project) ? { project: clean(row.project) } : {}),
      ...(clean(row.client) ? { client: clean(row.client) } : {}), ...(clean(row.difference) ? { difference: clean(row.difference) } : {}) })),
    ...(list(answer.recordGaps).length ? { recordGaps: list(answer.recordGaps).map(clean).filter(Boolean) } : {}),
  };
  ledger.answers = [...(ledger.answers || []), entry];
  const recorded = await recordedDates(slug, { workspace, now });
  await writeNote(file, ledger, recorded);
  return { status: 'ok', text: relay(renderAnswers(ledger.input, ledger.answers), relativeTo(workspace, file), []) };
}

function relay(chat, note, notes) {
  return ['Send them the text between the lines word for word. They can\'t see this output.', '-----', chat, '-----',
    ...notes.map(item => `(For you, not the chat: ${item})`), `(Saved for later, not for the chat: ${note})`].join('\n');
}

// ---- What the check is built from ----------------------------------------------------------------------

/** Everything the skill builds the check from, with the steps this RFP calls for. */
export async function capabilityInputs(slug, { workspace = workspaceDir(), now = new Date() } = {}) {
  await rfpFolder(slug, workspace);
  const docs = await rfpDocuments(slug, { workspace });
  const scoring = await scoringJudgment(slug, { workspace });
  const categories = scoring?.judgments?.categories || {};
  const people = await readPeople(workspace);
  const recorded = await recordedDates(slug, { workspace, now });
  const saved = await savedCapability(slug, { workspace });
  const caseStudy = categories.caseStudy ? { band: categories.caseStudy.band || null, project: categories.caseStudy.project || null, reason: clean(categories.caseStudy.reason) || null } : null;
  const tech = categories.tech ? { band: categories.tech.band || null, reason: clean(categories.tech.reason) || null } : null;

  const steps = [];
  if (saved) {
    steps.push(`A check was given on ${saved.given}; rows ${saved.unanswered.length ? `${saved.unanswered.join(', ')} are` : 'all are answered, none'} still unanswered. To record an engineer's answer use --answer; to change the rows, start from --show's "input".`);
  }
  if (caseStudy && caseStudy.band !== 'clone') {
    steps.push(`The scoring matched our case studies as "${caseStudy.band}"${caseStudy.project ? ` (${caseStudy.project})` : ''}, not a direct match: confirm that claim row by row.`);
  }
  if (!people) steps.push(`${PEOPLE_FILE} is missing, so who is current can't be checked: ask the person who asked who to route to.`);
  steps.push('Route each row to whoever built the closest project (the case studies, and "onRecord" under each person in "team"), not whoever is easiest to reach. Two people who split the work each get their own rows.');
  steps.push('Then pass the rows to rfp-capability.mjs and send its text word for word. Never write the checklist or the message yourself, and never send the message to anyone: the person who asked sends it.');

  return {
    rfp: slug,
    steps,
    documents: { saved: docs.files?.length || 0, readAll: `node scripts/document-text.mjs --rfp ${slug} --file all` },
    keyDates: recorded ? { dates: recorded.dates } : null,
    scoring: scoring ? { from: scoring.from, scored: scoring.scored, recommendation: scoring.recommendation, caseStudy, tech } : null,
    team: people ? people.map(person => ({ name: person.name, role: person.role, onRecord: person.onRecord })) : null,
    sources: { people: `cat "${PEOPLE_FILE.split(path.sep).join('/')}"`, caseStudies: `cat "${CASE_STUDIES_FILE.split(path.sep).join('/')}"` },
    saved: saved ? { given: saved.given, unanswered: saved.unanswered, rows: saved.rows } : null,
  };
}

// ---- Command line -------------------------------------------------------------------------------------

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const USAGE = `Usage: node scripts/rfp-capability.mjs --rfp <slug> --inputs
   or: node scripts/rfp-capability.mjs --rfp <slug> --show
   or: node scripts/rfp-capability.mjs --rfp <slug> <<'RFP_CAPABILITY_END'
{ "name": "<RFP name>", "number": "<RFP number>", "decision": "<what the answers decide>",
  "routedTo": [ { "name": "<full name from Proposal - People.txt>", "why": "<the project they built>", "rows": [1, 2] } ],
  "rows": [ { "operation": "<one operation>", "quote": "<the RFP's words>", "source": "file <n>, page <p>, §<x>", "ifYes": "<the proposal sentence a yes allows>" } ] }
RFP_CAPABILITY_END
   or: node scripts/rfp-capability.mjs --rfp <slug> --answer <<'RFP_CAPABILITY_END'
{ "by": "<full name>", "said": "<their answer, word for word>", "date": "<YYYY-MM-DD, default today>",
  "rows": [ { "n": 1, "answer": "done|adjacent|never|unanswered", "project": "<named project>", "client": "<client>", "difference": "<for adjacent>" } ],
  "recordGaps": ["<what People.txt or the case studies get wrong>"] }
RFP_CAPABILITY_END`;

export async function main(args = process.argv.slice(2), { workspace = workspaceDir(), now = new Date(), stdin = readStdin } = {}) {
  const slug = args[args.indexOf('--rfp') + 1];
  if (!args.includes('--rfp') || !slug || slug.startsWith('--')) { process.stderr.write(`${USAGE}\n`); process.exitCode = 1; return; }
  if (args.includes('--inputs')) { process.stdout.write(`${JSON.stringify(await capabilityInputs(slug, { workspace, now }), null, 2)}\n`); return; }
  if (args.includes('--show')) {
    const saved = await savedCapability(slug, { workspace });
    process.stdout.write(saved ? `${JSON.stringify(saved, null, 2)}\n` : `No capability check is saved for ${slug}.\n`);
    return;
  }
  const input = parseJson((await stdin()).trim());
  if (!input) { process.stderr.write(`The check or answer must be JSON on standard input.\n${USAGE}\n`); process.exitCode = 1; return; }
  const result = args.includes('--answer') ? await runAnswer({ slug, answer: input, workspace, now }) : await runCheck({ slug, input, workspace, now });
  if (result.status === 'invalid') {
    process.stdout.write(`Nothing was saved. Fix these and run it again:\n${result.problems.map(item => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${result.text}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Capability check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
