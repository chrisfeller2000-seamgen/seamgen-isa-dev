#!/usr/bin/env node
// An RFP's questions for the agency's Q&A: the parts of the agency questions skill
// (skills/rfp/agency-questions/instructions.md) that don't need judgment. ISA writes the
// questions; this gathers what they are written from, checks them, builds the email from the
// fixed template, and saves what ISA gave so a later "what did we ask?" has an answer.
//
//   node scripts/rfp-questions.mjs --rfp <slug> --inputs     (what to write the questions from)
//   node scripts/rfp-questions.mjs --rfp <slug> --show       (the questions saved last time)
//   node scripts/rfp-questions.mjs --rfp <slug> [--anyway] <<'RFP_QUESTIONS_END'
//   { "name": "...", "agency": "...", "questions": [ { "text": "...", "source": "file 1, page 5: \"...\"" } ] }
//   RFP_QUESTIONS_END
//
// The email goes to the buyer, so the checks here are the ones a mistake can't be taken back
// from: a HigherGov or Drive link, internal scoring words, a verbatim quote from the sources, a
// pre-filled signature, a question with no source behind it, or a long list with no headers.
// The questions deadline comes from the RFP's key-dates note (scripts/rfp-dates.mjs), the same
// one the calendar skill gives. When that deadline has passed, or there is none and the
// proposal is due within a week, it stops until the person confirms (--anyway).
//
// It writes one file, agency-questions_<slug>.md in the RFP's folder (not in resources/, so it
// isn't copied to Drive), and replaces it on every run. ISA never sends the email or creates a
// draft: the sender pastes it into their own mail. Input arrives on standard input through a
// quoted heredoc, because agency text can hold characters a shell would run.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rfpDocuments } from './document-text.mjs';
import { recordedDates } from './rfp-dates.mjs';
import { findRfpFolders, workspaceDir } from './rfp-folders.mjs';

const LEDGER = /<!-- rfp-questions-ledger\n([\s\S]*?)\n-->/;
// Past this many questions the list needs headers, so the agency can find its way through it
// (the skill's rule 5). Past the hard limit it is too long to be read at all.
const GROUP_AFTER = 8;
const MOST = 15;
// With no questions deadline, questions sent in the last week before proposals are due can't
// be answered in time to shape the proposal.
const TOO_CLOSE_DAYS = 7;
// A quote this long from the sources, pasted into the email, is internal sourcing (rule 6).
const QUOTE_CHARS = 60;

// Words that must never reach the agency. HigherGov is where we found the RFP (rule 7); gates,
// blockers and pursue tiers are our scoring. "Score" alone is left out: asking how proposals
// will be scored is a fair question.
const INTERNAL = [
  [/higher\s?gov/i, 'names HigherGov'],
  [/drive\.google|docs\.google/i, 'has a Google Drive link'],
  [/\bgate\s?\d/i, 'names a scoring gate'],
  [/\bblockers?\b/i, 'says "blocker"'],
  [/\bstrong pursue\b|\bpursue (email|tier|decision)\b/i, 'names a pursue tier'],
  [/\bICP\b/, 'names the ICP'],
  [/\bfound (it |this |the rfp )?(via|on|through)\b/i, 'says where we found the RFP'],
];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const list = value => (Array.isArray(value) ? value : value ? [value] : []);

// ---- Checking ISA's input ---------------------------------------------------------------------

/** The questions as ISA passed them, cleaned: [{ text, sub[], group, source, resolves }]. */
function questionsOf(input) {
  return list(input?.questions).map(item => (typeof item === 'string' ? { text: item } : item || {})).map(item => ({
    text: clean(item.text),
    sub: list(item.sub).map(clean).filter(Boolean),
    group: clean(item.group),
    source: clean(item.source),
    resolves: clean(item.resolves),
  }));
}

// The quoted text in a source line ("file 1, page 5: \"...\""), straight or curly quotes.
const quotesIn = source => [...String(source).matchAll(/["“]([^"”]+)["”]/g)].map(match => clean(match[1])).filter(Boolean);

/** Every problem with ISA's input, as plain sentences ISA can fix. Empty when it is fine. */
export function checkQuestions(input) {
  const problems = [];
  if (!clean(input?.name)) problems.push('"name" is missing: the RFP\'s full name as the documents print it.');
  if (!clean(input?.agency)) problems.push('"agency" is missing: the agency\'s name as the documents print it.');
  const questions = questionsOf(input);
  if (!questions.length) problems.push('"questions" is empty.');
  if (questions.length > MOST) problems.push(`${questions.length} questions is too many for an agency to answer. Cut the ones that don't change the proposal, or fold related ones into "sub" questions, to ${MOST} or fewer.`);
  if (questions.length > GROUP_AFTER && questions.some(item => !item.group)) {
    problems.push(`More than ${GROUP_AFTER} questions need a "group" header on every question (for example Scope, Technical, Budget, Timeline).`);
  }
  questions.forEach((item, index) => {
    const n = index + 1;
    if (!item.text) problems.push(`Question ${n} has no text.`);
    if (!item.source) problems.push(`Question ${n} has no "source": the file and page with the RFP text behind it, or "RFP is silent; nearest context <section>".`);
    for (const quote of quotesIn(item.source)) {
      const long = quote.length >= QUOTE_CHARS && [item.text, ...item.sub].some(part => part.toLowerCase().includes(quote.toLowerCase()));
      if (long) problems.push(`Question ${n} pastes the quote from its source. Ask the question in your own words, with at most a page pointer.`);
    }
  });
  const emailParts = [['the RFP name', input?.name], ['the agency name', input?.agency], ['the RFP number', input?.number],
    ...questions.flatMap((item, index) => [[`question ${index + 1}`, item.text], ...item.sub.map(sub => [`a sub-question of question ${index + 1}`, sub]), [`the header of question ${index + 1}`, item.group]])];
  for (const [where, text] of emailParts) {
    for (const [pattern, what] of INTERNAL) if (pattern.test(String(text || ''))) problems.push(`${cap(where)} ${what}. Nothing internal goes to the agency.`);
  }
  return problems;
}
const cap = text => text.charAt(0).toUpperCase() + text.slice(1);

// ---- The deadline -------------------------------------------------------------------------------

/**
 * Whether the questions can still go, from the RFP's key-dates note. Returns { lines, stop, problem }:
 * `lines` lead the reply; `stop` is why to ask the person before writing anything; `problem` is
 * what ISA must fix first.
 */
export function deadlineOf(recorded, input) {
  const dates = recorded?.dates || [];
  const questions = dates.find(item => item.milestone === 'Questions due');
  const proposal = dates.find(item => item.milestone === 'Proposal due');
  const left = item => (item.daysLeft === 0 ? 'today' : `${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left`);
  const per = item => (item.source ? `, per ${item.source}` : '');
  if (proposal?.passed) {
    return { lines: [`Proposals were due ${proposal.when}${per(proposal)}.`], stop: `Proposals were due ${proposal.when}, so the agency won't answer questions for it now.` };
  }
  if (questions) {
    if (questions.passed) return { lines: [`Questions were due ${questions.when}; the window has closed.`], stop: `The questions window closed on ${questions.when}, so the agency won't answer.` };
    return { lines: [`Questions due: ${questions.when} (${left(questions)})${per(questions)}.`] };
  }
  const none = clean(input?.noDeadline);
  if (!none) {
    return { problem: 'No questions deadline is recorded in the key-dates note. Find it in the documents and record it with rfp-dates.mjs --merge, as the skill says. If the documents give none, add "noDeadline" with what you found (for example "The documents give no questions deadline.").' };
  }
  const lines = [none.endsWith('.') ? none : `${none}.`];
  if (proposal) lines.push(`Proposals are due ${proposal.when} (${left(proposal)})${per(proposal)}, so send the questions early enough for answers to shape the proposal.`);
  if (proposal && proposal.daysLeft < TOO_CLOSE_DAYS) {
    return { lines, stop: `There's no questions deadline and proposals are due in ${proposal.daysLeft} day${proposal.daysLeft === 1 ? '' : 's'}, too late for answers to shape the proposal.` };
  }
  return { lines };
}

// ---- The email ----------------------------------------------------------------------------------

const possessive = name => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
// "City of Laguna Beach" reads as "the City of Laguna Beach" in a sentence, as in Katie's email.
const inSentence = agency => (/^(city|county|town|village|state|port|district|commonwealth) of /i.test(agency) ? `the ${agency}` : agency);
// "the City of Laguna Beach's Website Redesign Project", as Katie wrote it; just "the <name>" when
// the name already says whose it is ("Laguna Beach Website Redesign").
function projectPhrase(name, agency) {
  const place = agency.replace(/^(the )?(city|county|town|village|state|port|district|commonwealth) of /i, '');
  if (!agency || name.toLowerCase().includes(place.toLowerCase())) return /^the /i.test(name) ? name : `the ${name}`;
  return `${possessive(inSentence(agency))} ${name}`;
}
// "file 4, page 2: \"...\"" → "file 4, page 2": the contact line names where, not the whole quote.
const placeOnly = source => clean(String(source || '').split(/:\s*["“]/)[0]);

/** "Dear ..." from the contact the RFP names. Never guesses Mr. or Ms. from a first name. */
function salutation(contact) {
  const name = clean(contact?.name);
  const honorific = clean(contact?.honorific);
  if (name && honorific) return `${honorific} ${name.split(' ').at(-1)}`;
  if (name) return name;
  return '[Mr./Ms./Dr.] [Last name]';
}

/** The numbered list, with a header line wherever the group changes. Numbers run on across groups. */
function numbered(questions) {
  const lines = [];
  let group = null;
  questions.forEach((item, index) => {
    if (item.group && item.group !== group) {
      if (lines.length) lines.push('');
      lines.push(`${item.group}`);
      group = item.group;
    }
    lines.push(`${index + 1}. ${item.text}`);
    for (const sub of item.sub) lines.push(`   - ${sub}`);
  });
  return lines;
}

/** The email to the agency, from Katie's Rancho Palos Verdes email (June 22, 2026). */
export function renderEmail(input) {
  const name = clean(input.name);
  const number = clean(input.number);
  const sender = input.sender || {};
  const signature = [clean(sender.name) || '[Your name]', clean(sender.title) || '[Title]', 'Seamgen', clean(sender.phone) || '[Phone]', clean(sender.email) || '[Email]'];
  return [
    `Subject: ${number && !name.includes(number) ? `${number} ${name}` : name} — Clarifying Questions from Seamgen`,
    '',
    `Dear ${salutation(input.contact)},`,
    '',
    `I am writing on behalf of Seamgen regarding the RFP for ${projectPhrase(name, clean(input.agency))}.`,
    '',
    'I am submitting the following questions for clarification:',
    '',
    ...numbered(questionsOf(input)),
    '',
    'Please confirm receipt of these questions.',
    '',
    `I look forward to reviewing your responses and using this information to develop a comprehensive proposal that meets ${possessive(inSentence(clean(input.agency)))} requirements and objectives.`,
    '',
    'Do you have an expected date for when the responses will be shared?',
    '',
    'Kind regards,',
    ...signature,
  ].join('\n');
}

/** Who to send it to and how, above the email so nothing in it is pre-addressed to the buyer. */
function sendTo(input) {
  const contact = input.contact || {};
  const name = [clean(contact.honorific), clean(contact.name)].filter(Boolean).join(' ');
  const reach = [clean(contact.email), clean(contact.phone)].filter(Boolean).join(', ');
  const lines = [];
  if (name || reach) lines.push(`Send to: ${[name, reach].filter(Boolean).join(', ')}${placeOnly(contact.source) ? ` (${placeOnly(contact.source)})` : ''}`);
  else lines.push('Send to: the documents name no contact for questions. Find out who takes them before sending.');
  if (clean(input.submission)) lines.push(`How to submit: ${clean(input.submission)}`);
  if (input.portalOnly) lines.push('Questions go in through the portal only: paste the numbered questions into its Q&A form instead of emailing them.');
  return lines;
}

/** What changed since the questions saved last time, by question text. */
function changesSince(previous, questions) {
  if (!previous?.input) return [];
  const before = questionsOf(previous.input).map(item => item.text);
  const now = questions.map(item => item.text);
  const added = now.filter(text => !before.includes(text));
  const dropped = before.filter(text => !now.includes(text));
  if (!added.length && !dropped.length) return [`Changed since the questions given on ${previous.given}: nothing, the questions are the same.`];
  return [`Changed since the questions given on ${previous.given}:`,
    ...added.map(text => `• Added: ${text}`), ...dropped.map(text => `• Dropped: ${text}`)];
}

/**
 * The reply ISA sends. Pure: `recorded` is the key-dates note (recordedDates), `previous` the
 * last saved questions. Returns { status: 'ok' | 'stop' | 'invalid', text, problems, chat }.
 */
export function planQuestions(input, { recorded = null, previous = null, anyway = false } = {}) {
  const problems = checkQuestions(input);
  const deadline = deadlineOf(recorded, input);
  if (deadline.problem) problems.push(deadline.problem);
  if (problems.length) return { status: 'invalid', problems };
  if (deadline.stop && !anyway) return { status: 'stop', text: deadline.stop };
  const questions = questionsOf(input);
  const sources = questions.map((item, index) => `${index + 1}. ${item.source}${item.resolves ? ` Settles: ${item.resolves}` : ''}`);
  const chat = [
    ...deadline.lines,
    ...sendTo(input),
    '',
    'Sources (for checking, not for the agency):',
    ...sources,
    '',
    'Email to copy:',
    '```',
    renderEmail(input),
    '```',
  ];
  const changes = changesSince(previous, questions);
  if (changes.length) chat.push('', ...changes);
  return { status: 'ok', chat: chat.join('\n') };
}

// ---- Files --------------------------------------------------------------------------------------

async function rfpFolder(slug, workspace) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(slug || ''))) throw new Error('That is not an RFP slug.');
  const folders = await findRfpFolders(slug, { workspace });
  if (!folders.length) throw new Error(`${slug} has no folder yet, so its documents aren't saved. Follow skills/rfp/document-fetch/instructions.md first.`);
  if (folders.length > 1) throw new Error(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them.`);
  return folders[0].dir;
}
const notePathOf = (dir, slug) => path.join(dir, `agency-questions_${slug}.md`);
const relativeTo = (workspace, file) => path.relative(workspace, file).split(path.sep).join('/');
const today = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

function readLedger(text) {
  const match = String(text || '').match(LEDGER);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}

/** The questions saved last time: { given, note, questions: [{ n, text }], input }, or null. */
export async function savedQuestions(slug, { workspace = workspaceDir() } = {}) {
  let dir;
  try { dir = await rfpFolder(slug, workspace); } catch { return null; }
  const file = notePathOf(dir, slug);
  const ledger = readLedger(await fs.readFile(file, 'utf8').catch(() => ''));
  if (!ledger?.input) return null;
  return {
    given: ledger.given,
    note: relativeTo(workspace, file),
    questions: questionsOf(ledger.input).map((item, index) => ({ n: index + 1, text: item.text, ...(item.sub.length ? { sub: item.sub } : {}) })),
    input: ledger.input,
  };
}

/** Checks, renders and saves. Returns the plan; the note is written only when status is 'ok'. */
export async function runQuestions({ slug, input, workspace = workspaceDir(), now = new Date(), anyway = false }) {
  const dir = await rfpFolder(slug, workspace);
  const file = notePathOf(dir, slug);
  const previous = readLedger(await fs.readFile(file, 'utf8').catch(() => ''));
  const recorded = await recordedDates(slug, { workspace, now });
  const plan = planQuestions(input, { recorded, previous, anyway });
  if (plan.status !== 'ok') return plan;
  const given = today(now);
  const note = [
    `# Agency questions: ${clean(input.agency)}, ${clean(input.name)}`,
    '',
    `Written by scripts/rfp-questions.mjs on ${given}. Run it again instead of editing this file.`,
    'This is what ISA gave, not necessarily what was sent: whoever sent it may have edited it.',
    '',
    plan.chat,
    '',
    `<!-- rfp-questions-ledger\n${JSON.stringify({ given, input }, null, 2).replace(/-->/g, '--\\u003e')}\n-->`,
    '',
  ].join('\n');
  await writeAtomic(file, note);
  plan.text = ['Send them the text between the lines word for word. They can\'t see this output.', '-----', plan.chat, '-----',
    `(Saved for later, not for the chat: ${relativeTo(workspace, file)})`].join('\n');
  return plan;
}

// ---- What the questions are written from --------------------------------------------------------

function frontmatter(text) {
  const match = String(text || '').replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fields = {};
  for (const line of (match?.[1] || '').split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\(["\\])/g, '$1');
    fields[line.slice(0, index).trim()] = value;
  }
  return fields;
}
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const quotesOf = evidence => list(evidence).map(item => clean(item?.quote)).filter(Boolean).slice(0, 2);

/** The parts of the scoring that questions come from, read from candidate.md. */
function scoringOf(text) {
  const fields = frontmatter(text);
  const judgments = parseJson(fields.scoring_judgments) || {};
  return scoringFrom(judgments, {
    conditional: parseJson(fields.scoring_conditional),
    scored: fields.scored_date && fields.scored_date !== 'unknown' ? fields.scored_date : null,
    recommendation: fields.scoring_recommendation && fields.scoring_recommendation !== 'unknown' ? fields.scoring_recommendation : null,
  });
}

/**
 * The same parts from a scoring judgment, which candidate.md and the audit both keep. An RFP
 * still in Phase 1 has no candidate.md after the next Friday run clears it, so its audit line
 * is the only copy (quotes cut to 300 characters).
 */
function scoringFrom(judgments, { conditional = null, scored = null, recommendation = null, from = 'the scoring notes' } = {}) {
  conditional = conditional || judgments.conditional || null;
  const buyer = judgments.buyer || null;
  // No gates here: these are the model's answers, and code decides the gates from them
  // afterwards. The blockers and open questions in the results are the decided ones.
  return {
    from,
    scored,
    recommendation,
    buyer: buyer ? {
      currentSolution: clean(buyer.currentSolution) || null,
      // The scorer found nothing on what the agency uses today: who supports it is a question.
      noIncumbentNamed: buyer.currentSolution === null,
      objective: clean(buyer.objective) || null,
      advantage: clean(buyer.advantage) || null,
    } : null,
    questionsDeadline: judgments.questions?.due ? { due: judgments.questions.due, time: judgments.questions.time || null, quotes: quotesOf(judgments.questions.evidence) } : null,
    askTheAgency: conditional?.question ? { question: clean(conditional.question), rule: conditional.rule ?? null, qaDueDate: conditional.qaDueDate || null } : null,
  };
}

/** The RFP's entry in this week's results, or its latest audit line: the plain blockers and open questions. */
async function resultsOf(slug, workspace) {
  const reports = path.join(workspace, 'reports', 'new-rfp-qualification');
  const latest = parseJson(await fs.readFile(path.join(reports, 'latest.json'), 'utf8').catch(() => ''));
  const entry = (latest?.entries || []).find(item => item?.slug === slug);
  if (entry) {
    return { from: 'this week\'s results', title: entry.title || null, agency: entry.agency || null, number: entry.number || null,
      blockers: list(entry.blockers).map(item => clean(item?.text ?? item)).filter(Boolean), openQuestions: list(entry.questions).map(clean).filter(Boolean),
      askTheAgency: entry.agencyQuestion || null };
  }
  const found = await auditLine(slug, workspace);
  if (!found) return null;
  const { record, run, stage } = found;
  return { from: `the ${run} run`, title: record.rfp.title || null, agency: record.rfp.agency || null, number: null,
    blockers: list(record.outcome?.blockers).map(clean).filter(Boolean), openQuestions: list(record.outcome?.openQuestions).map(clean).filter(Boolean),
    askTheAgency: null,
    scoring: stage ? scoringFrom(stage.judgment, { scored: record.run?.date || run, recommendation: stage.recommendation || null, from: `the ${run} run's audit line` }) : null };
}

/** The RFP's newest audit line: { record, run, stage }, where stage is the full-text scoring when the documents were scored, otherwise the listing's. */
async function auditLine(slug, workspace) {
  const auditDir = path.join(workspace, 'reports', 'new-rfp-qualification', 'audit');
  const files = (await fs.readdir(auditDir).catch(() => [])).filter(name => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort().reverse();
  for (const name of files) {
    const lines = (await fs.readFile(path.join(auditDir, name), 'utf8').catch(() => '')).split('\n');
    for (const line of lines) {
      if (!line.includes(`"${slug}"`)) continue;
      const record = parseJson(line);
      if (record?.rfp?.slug !== slug) continue;
      const stage = record.fullText?.judgment ? record.fullText : record.listing?.judgment ? record.listing : null;
      return { record, run: name.slice(0, 10), stage };
    }
  }
  return null;
}

/**
 * The RFP's scoring judgment, raw: from its scoring notes (candidate.md) when it has them,
 * otherwise from its newest audit line. Returns { judgments, from, scored, recommendation } or
 * null. The capability check reads the case-study and technology judgments from it.
 */
export async function scoringJudgment(slug, { workspace = workspaceDir() } = {}) {
  const docs = await rfpDocuments(slug, { workspace });
  const notes = docs.notes ? await fs.readFile(docs.notes, 'utf8').catch(() => '') : '';
  if (notes) {
    const fields = frontmatter(notes);
    const judgments = parseJson(fields.scoring_judgments);
    if (judgments) {
      return { judgments, from: 'the scoring notes', scored: fields.scored_date && fields.scored_date !== 'unknown' ? fields.scored_date : null,
        recommendation: fields.scoring_recommendation && fields.scoring_recommendation !== 'unknown' ? fields.scoring_recommendation : null };
    }
  }
  const found = await auditLine(slug, workspace);
  if (!found?.stage) return null;
  return { judgments: found.stage.judgment, from: `the ${found.run} run's audit line`, scored: found.record.run?.date || found.run, recommendation: found.stage.recommendation || null };
}

/** The "Ambiguities Requiring Clarification" section of the newest engineering brief's Markdown. */
async function briefOf(dir, slug) {
  const names = (await fs.readdir(dir).catch(() => [])).filter(name => name.startsWith('engineering-brief_'));
  const markdown = names.filter(name => name.endsWith('.md')).sort().reverse();
  const pdf = names.filter(name => name.endsWith('.pdf')).sort().reverse();
  if (!markdown.length) return pdf.length ? { file: pdf[0], ambiguities: null, note: 'Only the PDF is saved, so its ambiguities can\'t be read here. Leave them out, or ask whoever wrote the brief.' } : null;
  const text = await fs.readFile(path.join(dir, markdown[0]), 'utf8');
  const start = text.search(/^#+\s*Ambiguities Requiring Clarification\s*$/m);
  if (start < 0) return { file: markdown[0], ambiguities: null, note: 'The brief has no "Ambiguities Requiring Clarification" section.' };
  const rest = text.slice(start);
  const level = rest.match(/^(#+)/)[1].length;
  // The section ends at the next heading of the same level or higher, after its own heading line.
  const bodyAt = rest.indexOf('\n') + 1;
  const next = bodyAt ? rest.slice(bodyAt).search(new RegExp(`^#{1,${level}}\\s`, 'm')) : -1;
  return { file: markdown[0], ambiguities: (next < 0 ? rest : rest.slice(0, bodyAt + next)).trim() };
}

/** Everything the skill writes the questions from, in one place. */
export async function questionInputs(slug, { workspace = workspaceDir(), now = new Date() } = {}) {
  const dir = await rfpFolder(slug, workspace);
  const docs = await rfpDocuments(slug, { workspace });
  const notes = docs.notes ? await fs.readFile(docs.notes, 'utf8').catch(() => '') : '';
  const recorded = await recordedDates(slug, { workspace, now });
  const saved = await savedQuestions(slug, { workspace });
  const found = await resultsOf(slug, workspace);
  const { scoring: audited = null, ...results } = found || {};
  const scoring = notes ? scoringOf(notes) : audited;
  const brief = await briefOf(dir, slug);
  // What this RFP's inputs call for, spelled out: in local tests on November 24, 2026 ISA
  // skipped the incumbent question that `noIncumbentNamed` called for, and ran the questions
  // before recording the deadline.
  const steps = [];
  if (!recorded?.dates?.some(item => item.milestone === 'Questions due')) {
    steps.push('No questions deadline is recorded. Find it in the documents and record it with rfp-dates.mjs --merge (step 2) before running the questions; if the documents give none, pass "noDeadline".');
  }
  const askFirst = scoring?.askTheAgency?.question || results?.askTheAgency;
  if (askFirst) steps.push(`Ask this first, in your own words if needed: ${askFirst}`);
  if (scoring?.buyer?.noIncumbentNamed) steps.push('The documents name no current vendor or system: include a question asking who supports the current system, unless the documents you read say.');
  const issues = [...(results?.blockers || []), ...(results?.openQuestions || [])].length;
  if (issues) steps.push(`Settle each of the ${issues} blocker${issues === 1 ? '' : 's'} and open question${issues === 1 ? '' : 's'} in "results" that only the agency can answer.`);
  if (brief?.ambiguities) steps.push('Merge the engineering brief\'s ambiguities by topic; keep each distinct one.');
  // The capability check's rows Seamgen has never done, or that no engineer has answered yet, are
  // where a fit question to the agency may belong (rule 11), or where asking would only advertise
  // a gap (rule 8). Imported here, not at the top, because rfp-capability.mjs imports this file.
  const { savedCapability } = await import('./rfp-capability.mjs');
  const capability = await savedCapability(slug, { workspace });
  const gaps = capability ? capability.rows.filter(row => row.status === 'never' || capability.unanswered.includes(row.n)) : [];
  if (gaps.length) {
    steps.push(`The capability check has ${gaps.length} row${gaps.length === 1 ? '' : 's'} answered "never" or still unanswered (see "capability"). Where one decides whether Seamgen is the right kind of firm, ask it plainly (rule 11); otherwise leave it out, so the question doesn't advertise a gap (rule 8). Never present an unanswered row as something we have done.`);
  }
  if (saved) steps.push(`Questions were given on ${saved.given}. To change them, start from --show's "input" and rerun with the change.`);
  steps.push('Then pass the questions to rfp-questions.mjs (step 4) and send its text word for word. Never send questions you wrote without it, not even as a draft.');
  return {
    rfp: slug,
    steps,
    documents: { saved: docs.files?.length || 0, readAll: `node scripts/document-text.mjs --rfp ${slug} --file all` },
    keyDates: recorded ? { recorded: recorded.recorded, dates: recorded.dates } : null,
    scoring,
    results: found ? results : null,
    engineeringBrief: brief,
    savedQuestions: saved ? { given: saved.given, questions: saved.questions } : null,
    capability: gaps.length ? { given: capability.given, rows: gaps.map(row => ({ n: row.n, operation: row.operation, status: capability.unanswered.includes(row.n) ? 'unanswered' : 'never' })) } : null,
  };
}

// ---- Command line -------------------------------------------------------------------------------

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const USAGE = `Usage: node scripts/rfp-questions.mjs --rfp <slug> --inputs
   or: node scripts/rfp-questions.mjs --rfp <slug> --show
   or: node scripts/rfp-questions.mjs --rfp <slug> [--anyway] <<'RFP_QUESTIONS_END'
{ "name": "<full RFP name as printed>", "number": "<RFP number>", "agency": "<agency as printed>",
  "contact": { "name": "...", "honorific": "<Mr./Ms./Dr. only when the RFP prints it>", "email": "...", "phone": "...", "source": "file <n>, page <p>" },
  "submission": "<how questions must be submitted>", "portalOnly": false,
  "noDeadline": "<only when the documents give no questions deadline>",
  "questions": [ { "text": "...", "sub": ["..."], "group": "<header, needed past ${GROUP_AFTER} questions>", "source": "file <n>, page <p>: \\"<quote>\\"", "resolves": "<the open issue it settles, in plain words>" } ],
  "sender": { "name": "...", "title": "...", "phone": "...", "email": "..." } }
RFP_QUESTIONS_END`;

export async function main(args = process.argv.slice(2), { workspace = workspaceDir(), now = new Date(), stdin = readStdin } = {}) {
  const slug = args[args.indexOf('--rfp') + 1];
  if (!args.includes('--rfp') || !slug || slug.startsWith('--')) { process.stderr.write(`${USAGE}\n`); process.exitCode = 1; return; }
  if (args.includes('--inputs')) {
    process.stdout.write(`${JSON.stringify(await questionInputs(slug, { workspace, now }), null, 2)}\n`);
    return;
  }
  if (args.includes('--show')) {
    const saved = await savedQuestions(slug, { workspace });
    process.stdout.write(saved ? `${JSON.stringify(saved, null, 2)}\n` : `No questions are saved for ${slug}.\n`);
    return;
  }
  let input;
  try { input = JSON.parse((await stdin()).trim()); } catch { process.stderr.write(`The questions must be JSON on standard input.\n${USAGE}\n`); process.exitCode = 1; return; }
  const plan = await runQuestions({ slug, input, workspace, now, anyway: args.includes('--anyway') });
  if (plan.status === 'invalid') {
    process.stdout.write(`Nothing was saved. Fix these and run it again:\n${plan.problems.map(item => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  if (plan.status === 'stop') {
    process.stdout.write(`Nothing was saved. ${plan.text} Tell them that, and ask whether they still want the questions (for example, to prepare for an interview). Run it again with --anyway only after they say yes.\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${plan.text}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Questions failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
