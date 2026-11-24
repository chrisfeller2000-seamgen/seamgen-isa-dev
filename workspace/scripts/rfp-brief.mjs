#!/usr/bin/env node
// An RFP's engineering brief: the parts of skills/rfp/engineering-brief/instructions.md that need
// no judgment. ISA picks the passages that matter for a timeline estimate; this gathers what the
// brief is built from, checks every quote against the saved documents, renders the fixed format
// (whose "Ambiguities Requiring Clarification" section the agency questions skill reads), prints
// the PDF, and records the engineers' estimates.
//
//   node scripts/rfp-brief.mjs --rfp <slug> --inputs        (what the brief is built from)
//   node scripts/rfp-brief.mjs --rfp <slug> --show          (the saved brief and its estimates)
//   node scripts/rfp-brief.mjs --rfp <slug> <<'RFP_BRIEF_END'          (write or rewrite the brief)
//   { "name": "...", "for": ["Chris Feller"], "summary": "...", "sections": { ... }, "ambiguities": [ ... ] }
//   RFP_BRIEF_END
//   node scripts/rfp-brief.mjs --rfp <slug> --estimate <<'RFP_BRIEF_END'   (record an estimate)
//   { "by": "Chris Feller", "said": "<their words>", "duration": "12 weeks", "team": "3 engineers" }
//   RFP_BRIEF_END
//
// Engineers price from the brief without reading the RFP, so a paraphrase inside a quote, or a
// quote that isn't in the RFP, becomes an under-priced proposal. Every quote is checked against
// the text of the RFP's saved documents (letters and digits only, so line breaks, hyphenation and
// curly quotes don't matter; "…" may join pieces). The brief also says what the estimate can't
// see: scope documents the scoring found were never saved, and capability check rows answered
// "never" or still unanswered.
//
// It writes engineering-brief_<date>_<slug>.md and, where Chromium or Edge is installed, the same
// brief as a PDF, both in the RFP's folder (not resources/, so neither is copied to Drive). The
// VM's Chromium is a Snap package, which can't write to /tmp or to hidden folders such as
// ~/.openclaw, so the PDF is printed in a plain folder in the home directory and moved into place.
// ISA attaches the PDF with a MEDIA: line; it never sends the brief to anyone.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractDocumentText, rfpDocuments } from './document-text.mjs';
import { parsePeople, savedCapability } from './rfp-capability.mjs';
import { recordedDates } from './rfp-dates.mjs';
import { findRfpFolders, workspaceDir } from './rfp-folders.mjs';
import { scoringJudgment } from './rfp-questions.mjs';

const LEDGER = /<!-- rfp-brief-ledger\n([\s\S]*?)\n-->/;
const PEOPLE_FILE = path.join('resources', 'proposal-sources', 'Proposal - People.txt');
// About 500 words a page; the skill's hard cap is 5 pages.
const WORDS_PER_PAGE = 500;
const MOST_PAGES = 5;
const SUMMARY_WORDS = 25;

// The sections, in the order the brief prints them. `always` ones print "Not addressed in the RFP."
// when empty; the others are left out.
export const SECTIONS = [
  { key: 'scope', title: 'Scope of Work', always: true },
  { key: 'technical', title: 'Technical Requirements' },
  { key: 'deliverables', title: 'Deliverables', always: true },
  { key: 'integrations', title: 'Integrations / Third-party systems' },
  { key: 'compliance', title: 'Compliance and Security' },
  { key: 'accessibility', title: 'Accessibility' },
  { key: 'migration', title: 'Data / Content Migration' },
  { key: 'hosting', title: 'Hosting, Infrastructure, Ownership Constraints' },
  { key: 'timeline', title: 'Timeline and Phases (from the RFP)' },
  { key: 'priority', title: 'Must-Have vs Should-Have language' },
];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const list = value => (Array.isArray(value) ? value : value ? [value] : []);
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const key = name => clean(name).toLowerCase();
const today = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const wordCount = text => (String(text).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;

// ---- Checking quotes against the RFP ------------------------------------------------------------------

/** Letters and digits only, lower case: line breaks, hyphenation and quote marks don't matter. */
export const letters = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/** Whether a quote appears in the documents' text. "…" or "..." may join pieces of one passage. */
export function quoteFound(quote, corpus) {
  const pieces = String(quote).split(/…|\.\.\./).map(letters).filter(piece => piece.length >= 4);
  if (!pieces.length) return false;
  return pieces.every(piece => corpus.includes(piece));
}

async function documentCorpus(slug, workspace) {
  const docs = await rfpDocuments(slug, { workspace });
  const texts = [];
  for (const file of docs.files || []) {
    if (!file.readable) continue;
    const result = await extractDocumentText(file.path).catch(() => null);
    if (result?.text) texts.push(result.text);
  }
  return { corpus: letters(texts.join('\n')), read: texts.length, saved: docs.files?.length || 0 };
}

// ---- Checking ISA's input -------------------------------------------------------------------------------

function itemsOf(section) {
  return list(section).map(item => ({
    label: clean(item?.label), explain: clean(item?.explain), flag: Boolean(item?.flag),
    quotes: list(item?.quotes).map(quote => ({ quote: String(quote?.quote || '').trim(), source: clean(quote?.source) })),
  }));
}
function ambiguitiesOf(input) {
  return list(input?.ambiguities).map(item => ({ question: clean(item?.question), why: clean(item?.why), quote: String(item?.quote || '').trim(),
    source: clean(item?.source), silent: Boolean(item?.silent) }));
}
const hasPage = source => /\b(page|pages|p\.)\s*\d|\bappendix\b|\bexhibit\b|\battachment\b/i.test(source);

/** Every problem with a brief, as sentences ISA can fix. Empty when it is fine. */
export function checkBrief(input, { people = null, corpus = '' } = {}) {
  const problems = [];
  if (!clean(input?.name)) problems.push('"name" is missing: the RFP\'s name as the documents print it.');
  const summary = clean(input?.summary);
  if (!summary) problems.push('"summary" is missing: one sentence on what is being built.');
  else if (wordCount(summary) > SUMMARY_WORDS) problems.push(`"summary" is ${wordCount(summary)} words; keep it to about 20.`);
  const recipients = list(input?.for).map(clean).filter(Boolean);
  if (!recipients.length) problems.push('"for" is empty: name the engineer(s) who will estimate.');
  for (const name of recipients) {
    if (people && !people.some(person => key(person.name) === key(name))) {
      problems.push(`${name} is not on the current staff list (${PEOPLE_FILE}). Current staff: ${people.map(person => person.name).join(', ')}.`);
    }
  }
  const sections = input?.sections || {};
  for (const name of Object.keys(sections)) {
    if (!SECTIONS.some(section => section.key === name)) problems.push(`"sections.${name}" isn't a brief section. Use: ${SECTIONS.map(section => section.key).join(', ')}.`);
  }
  for (const section of SECTIONS) {
    itemsOf(sections[section.key]).forEach((item, index) => {
      const where = `${section.title}, item ${index + 1}`;
      if (!item.label) problems.push(`${where} has no "label".`);
      if (!item.explain) problems.push(`${where} has no "explain": one plain sentence.`);
      if (!item.quotes.length) problems.push(`${where} has no quote. Every item is backed by the RFP's own words.`);
      item.quotes.forEach((quote, number) => {
        const which = item.quotes.length > 1 ? `${where}, quote ${number + 1}` : where;
        if (!quote.quote) problems.push(`${which} has an empty quote.`);
        if (!hasPage(quote.source)) problems.push(`${which} needs a page in "source" (for example "file 1, page 12, §4.03B").`);
        if (quote.quote && corpus && !quoteFound(quote.quote, corpus)) problems.push(`${which}: the quote isn't in the RFP's saved documents. Copy it exactly; never paraphrase inside a quote.`);
      });
    });
  }
  ambiguitiesOf(input).forEach((item, index) => {
    const where = `Ambiguity ${index + 1}`;
    if (!item.question) problems.push(`${where} has no "question", phrased as it would go to the agency.`);
    if (!item.why) problems.push(`${where} has no "why": why it matters for the estimate.`);
    if (!item.silent && !item.quote) problems.push(`${where} needs the "quote" that creates it, or "silent": true when the RFP says nothing.`);
    if (item.quote && !hasPage(item.source)) problems.push(`${where} needs a page in "source".`);
    if (item.quote && corpus && !quoteFound(item.quote, corpus)) problems.push(`${where}: the quote isn't in the RFP's saved documents.`);
  });
  return problems;
}

// ---- The brief ------------------------------------------------------------------------------------------

/** What the estimate can't see, from the inputs: unread scope documents and open capability rows. */
function risksOf(inputs) {
  const risks = [];
  for (const document of inputs?.scope?.missing || []) risks.push(`Scope document not saved: ${document}. The estimate can't cover what it says.`);
  if (inputs?.scope?.read === false) risks.push(`The scoring found the saved documents don't fully describe the work${inputs.scope.reason ? `: ${inputs.scope.reason}` : ''}.`);
  for (const row of inputs?.capability?.rows || []) {
    risks.push(row.status === 'never'
      ? `Capability check row ${row.n}: "${row.operation}" was answered "never". Estimate it as new work.`
      : `Capability check row ${row.n}: "${row.operation}" is still unanswered. Don't assume we've done it.`);
  }
  return risks;
}

const sectionRefs = input => [...new Set([...SECTIONS.flatMap(section => itemsOf(input.sections?.[section.key]).flatMap(item => item.quotes.map(quote => quote.source))),
  ...ambiguitiesOf(input).map(item => item.source)].flatMap(source => source.match(/§\s*[\w.]+|Appendix [A-Z0-9]+|Exhibit [A-Z0-9]+|Attachment [A-Z0-9]+/gi) || []))].join(', ');

/** The brief in the skill's fixed format, as Markdown. */
export function renderBrief(input, { given, inputs = null, folder = '' } = {}) {
  const proposal = inputs?.keyDates?.dates?.find(item => item.milestone === 'Proposal due');
  const out = [
    `# Engineering Scope Brief: ${clean(input.name)}`,
    '',
    `**Source (found via):** ${clean(input.foundVia) || 'not recorded'}`,
    `**Date prepared:** ${given}`,
    `**RFP #:** ${clean(input.number) || 'not stated'}`,
    `**Full RFP location:** ${clean(input.location) || folder}`,
    `**Prepared by:** ${clean(input.preparedBy) || 'ISA'}`,
    `**For:** ${list(input.for).map(clean).join(', ')}`,
    '',
    '---',
    '',
    '## One-line summary',
    '',
    clean(input.summary),
    '',
    '## RFP snapshot',
    '',
    `- **Agency:** ${clean(input.agency) || 'not stated'}`,
    ...(input.pageCount ? [`- **Total RFP page count:** ${clean(input.pageCount)} pages`] : []),
    `- **Proposal due:** ${proposal ? `${proposal.when}${proposal.passed ? ' (passed)' : ''}` : 'not recorded in the key-dates note'}`,
    `- **Sections referenced in this brief:** ${sectionRefs(input) || 'see each quote'}`,
    '',
    '---',
  ];
  for (const section of SECTIONS) {
    const items = itemsOf(input.sections?.[section.key]);
    if (!items.length && !section.always) continue;
    out.push('', `## ${section.title}`, '');
    if (!items.length) { out.push('Not addressed in the RFP.'); continue; }
    for (const item of items) {
      out.push(`- **${item.flag ? '⚠ ' : ''}${item.label}:** ${item.explain}`);
      for (const quote of item.quotes) out.push(`  > "${quote.quote}" — ${quote.source}`);
    }
  }
  const risks = risksOf(inputs);
  out.push('', '## Risks for the estimate', '', ...(risks.length ? risks.map(risk => `- ${risk}`) : ['None found: the scoring read the whole scope, and no capability row is open.']));
  out.push('', '---', '', '## Ambiguities Requiring Clarification', '', '*These items are unclear in the RFP and are candidates for the next clarifying-questions email to the agency contact.*', '');
  const ambiguities = ambiguitiesOf(input);
  if (!ambiguities.length) out.push('None found.');
  ambiguities.forEach((item, index) => {
    out.push(`${index + 1}. ${item.question}`, `   - Why it matters for engineering: ${item.why}`);
    out.push(item.quote ? `   - RFP basis: > "${item.quote}" — ${item.source}` : `   - RFP basis: RFP is silent${item.source ? `; nearest relevant context ${item.source}` : ''}`);
  });
  if (clean(input.forSales)) out.push('', '---', '', '## For the sales team (not for the engineer)', '', clean(input.forSales));
  return out.join('\n');
}

// ---- The PDF ----------------------------------------------------------------------------------------------

const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = text => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

/** HTML for the brief's own Markdown (headings, rules, bullets with quotes, numbered items). */
export function briefHtml(markdown) {
  const body = [];
  let open = null;
  const close = () => { if (open) { body.push(`</${open}>`); open = null; } };
  for (const line of markdown.split('\n')) {
    if (/^# /.test(line)) { close(); body.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (/^## /.test(line)) { close(); body.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line === '---') { close(); body.push('<hr>'); continue; }
    if (/^- /.test(line)) { if (open !== 'ul') { close(); body.push('<ul>'); open = 'ul'; } body.push(`<li>${inline(line.slice(2))}</li>`); continue; }
    if (/^\d+\. /.test(line)) { if (open !== 'ol') { close(); body.push('<ol>'); open = 'ol'; } body.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`); continue; }
    if (/^\s+> /.test(line)) { body.push(`<blockquote>${inline(line.replace(/^\s+> /, ''))}</blockquote>`); continue; }
    if (/^\s+- /.test(line)) { body.push(`<div class="sub">${inline(line.replace(/^\s+- /, ''))}</div>`); continue; }
    if (!line.trim()) continue;
    close();
    body.push(`<p>${inline(line)}</p>`);
  }
  close();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.4;margin:0.6in;color:#111}
h1{font-size:16pt;margin:0 0 8pt}h2{font-size:12pt;margin:14pt 0 4pt;border-bottom:1px solid #ccc}
p{margin:3pt 0}ul,ol{margin:3pt 0 3pt 16pt;padding:0}li{margin:4pt 0}
blockquote{margin:2pt 0 4pt 12pt;padding-left:8pt;border-left:3px solid #999;color:#333;font-size:9.5pt}
.sub{margin:1pt 0 1pt 12pt;font-size:9.5pt}hr{border:0;border-top:1px solid #ddd;margin:10pt 0}
</style></head><body>${body.join('\n')}</body></html>`;
}

const run = (file, args, timeout) => new Promise(resolve => execFile(file, args, { timeout }, (error, stdout, stderr) => resolve({ error, stderr: String(stderr || '') })));

async function browser() {
  const candidates = [process.env.CHROMIUM_PATH, 'chromium', 'chromium-browser', 'google-chrome',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes('/') && candidate.includes(':')) { if (await fs.access(candidate).then(() => true, () => false)) return candidate; continue; }
    const found = await run(process.platform === 'win32' ? 'where' : 'which', [candidate], 10000);
    if (!found.error) return candidate;
  }
  return null;
}

/** Prints the brief to `target` through a plain home folder. Returns { ok } or { ok: false, reason }. */
export async function printPdf(markdown, target) {
  const binary = await browser();
  if (!binary) return { ok: false, reason: 'no Chromium, Chrome or Edge is installed here' };
  const stage = await fs.mkdtemp(path.join(os.homedir(), 'isa-brief-pdf-'));
  try {
    const html = path.join(stage, 'brief.html');
    const pdf = path.join(stage, 'brief.pdf');
    await fs.writeFile(html, briefHtml(markdown), 'utf8');
    const result = await run(binary, ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], 120000);
    const made = await fs.readFile(pdf).catch(() => null);
    if (!made || made.subarray(0, 5).toString() !== '%PDF-') return { ok: false, reason: `${path.basename(binary)} made no PDF${result.error ? ` (${clean(result.error.message).slice(0, 160)})` : ''}` };
    await fs.writeFile(target, made);
    return { ok: true };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

// ---- Files ------------------------------------------------------------------------------------------------

async function rfpFolder(slug, workspace) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(slug || ''))) throw new Error('That is not an RFP slug.');
  const folders = await findRfpFolders(slug, { workspace });
  if (!folders.length) throw new Error(`${slug} has no folder yet, so its documents aren't saved. Follow skills/rfp/document-fetch/instructions.md first.`);
  if (folders.length > 1) throw new Error(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them.`);
  return folders[0].dir;
}
const relativeTo = (workspace, file) => path.relative(workspace, file).split(path.sep).join('/');
function readLedger(text) {
  const match = String(text || '').match(LEDGER);
  return match ? parseJson(match[1]) : null;
}
async function newestBrief(dir, slug) {
  const names = (await fs.readdir(dir).catch(() => [])).filter(name => new RegExp(`^engineering-brief_\\d{4}-\\d{2}-\\d{2}_${slug}\\.md$`).test(name)).sort().reverse();
  if (!names.length) return null;
  const file = path.join(dir, names[0]);
  const text = await fs.readFile(file, 'utf8');
  return { file, text, ledger: readLedger(text) };
}
async function writeAtomic(file, data) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, data);
  await fs.rename(temp, file);
}
const noteText = (markdown, ledger) => `${markdown}\n\n<!-- rfp-brief-ledger\n${JSON.stringify(ledger, null, 2).replace(/-->/g, '--\\u003e')}\n-->\n`;

function estimatesText(estimates) {
  if (!estimates.length) return 'No estimate recorded yet.';
  return estimates.map(item => `${item.by}, ${item.date}${item.brief ? ` (on the brief of ${item.brief})` : ''}: "${item.said}"${item.duration ? ` | duration: ${item.duration}` : ''}${item.team ? ` | team: ${item.team}` : ''}${item.assumptions?.length ? ` | assumptions: ${item.assumptions.join('; ')}` : ''}`).join('\n');
}

/** The saved brief: { given, file, pdf, for, pages, ambiguities, risks, estimates, input }, or null. */
export async function savedBrief(slug, { workspace = workspaceDir() } = {}) {
  let dir;
  try { dir = await rfpFolder(slug, workspace); } catch { return null; }
  const found = await newestBrief(dir, slug);
  if (!found?.ledger?.input) return null;
  const pdf = found.file.replace(/\.md$/, '.pdf');
  return {
    given: found.ledger.given,
    file: relativeTo(workspace, found.file),
    pdf: await fs.access(pdf).then(() => relativeTo(workspace, pdf), () => null),
    for: list(found.ledger.input.for),
    pages: found.ledger.pages,
    ambiguities: ambiguitiesOf(found.ledger.input).length,
    risks: found.ledger.risks || [],
    estimates: found.ledger.estimates || [],
    input: found.ledger.input,
  };
}

/** Writes or rewrites the brief. Returns { status, text | problems }. */
export async function runBrief({ slug, input, workspace = workspaceDir(), now = new Date(), pdf = printPdf }) {
  const dir = await rfpFolder(slug, workspace);
  const people = parsePeople(await fs.readFile(path.join(workspace, PEOPLE_FILE), 'utf8').catch(() => ''));
  const { corpus, read } = await documentCorpus(slug, workspace);
  if (!read) return { status: 'invalid', problems: ['No saved document could be read, so the quotes can\'t be checked. Follow skills/rfp/document-fetch/instructions.md to save the RFP first.'] };
  const problems = checkBrief(input, { people, corpus });
  const inputs = await briefInputs(slug, { workspace, now });
  const given = today(now);
  const markdown = renderBrief(input, { given, inputs, folder: relativeTo(workspace, path.join(dir, 'resources')) });
  const pages = Math.max(1, Math.ceil(wordCount(markdown) / WORDS_PER_PAGE));
  if (pages > MOST_PAGES) problems.push(`The brief runs to about ${pages} pages; the cap is ${MOST_PAGES}. Keep what changes the estimate, and leave out legal, cost and evaluation terms.`);
  if (problems.length) return { status: 'invalid', problems };

  // Estimates from an earlier brief carry over, marked with the brief they were given on.
  const previous = await newestBrief(dir, slug);
  const carried = (previous?.ledger?.estimates || []).map(item => ({ brief: previous.ledger.given, ...item }));
  const file = path.join(dir, `engineering-brief_${given}_${slug}.md`);
  const ledger = { given, input, pages, risks: risksOf(inputs), estimates: carried };
  await writeAtomic(file, noteText(markdown, ledger));
  const pdfFile = file.replace(/\.md$/, '.pdf');
  const printed = await pdf(markdown, pdfFile);

  const recipients = list(input.for).map(clean);
  const first = recipients.map(name => name.split(' ')[0]).join(' and ');
  const proposal = inputs.keyDates?.dates?.find(item => item.milestone === 'Proposal due' && !item.passed);
  const message = [
    `Hey ${first}, here's the engineering brief for the ${clean(input.name)} RFP (attached). It's about ${pages} page${pages === 1 ? '' : 's'}, with the RFP's own words and page for each requirement.`,
    '',
    'Could you give a rough timeline estimate: how long, with how many people, and what you\'re assuming? The "Risks for the estimate" and "Ambiguities" sections are what we don\'t know yet.',
    ...(proposal ? ['', `Proposals are due ${proposal.when}.`] : []),
  ].join('\n');
  const chat = [
    `Engineering brief for ${clean(input.name)}, for ${recipients.join(', ')}: about ${pages} page${pages === 1 ? '' : 's'}, ${ambiguitiesOf(input).length} ambiguit${ambiguitiesOf(input).length === 1 ? 'y' : 'ies'} for the agency questions.`,
    ...(ledger.risks.length ? ['', 'Risks for the estimate:', ...ledger.risks.map(risk => `- ${risk}`)] : []),
    '',
    `Message for ${recipients.join(' and ')}, to copy and send yourself with the PDF (nothing has been sent):`,
    '```',
    message,
    '```',
    ...(carried.length ? ['', 'Estimates given on the earlier brief, which may not fit this one:', estimatesText(carried)] : []),
  ];
  const lines = ['Send them the text between the lines word for word. They can\'t see this output.', '-----', chat.join('\n'), '-----'];
  if (printed.ok) lines.push(`Then put this line on its own, so the PDF is attached:`, `MEDIA:${pdfFile}`);
  else lines.push(`(For you, not the chat: the PDF couldn't be made: ${printed.reason}. Tell them the brief is saved as Markdown and offer to paste it.)`);
  lines.push(`(Saved for later, not for the chat: ${relativeTo(workspace, file)})`);
  return { status: 'ok', text: lines.join('\n'), pdf: printed.ok ? pdfFile : null };
}

/** Records an engineer's estimate against the newest brief. Returns { status, text | problems }. */
export async function runEstimate({ slug, estimate, workspace = workspaceDir(), now = new Date() }) {
  const dir = await rfpFolder(slug, workspace);
  const found = await newestBrief(dir, slug);
  if (!found?.ledger?.input) return { status: 'invalid', problems: [`No engineering brief is saved for ${slug}. Write the brief first; estimates attach to it.`] };
  const people = parsePeople(await fs.readFile(path.join(workspace, PEOPLE_FILE), 'utf8').catch(() => ''));
  const problems = [];
  if (!clean(estimate?.by)) problems.push('"by" is missing: who gave the estimate.');
  else if (people && !people.some(person => key(person.name) === key(estimate.by))) problems.push(`${clean(estimate.by)} is not on the current staff list (${PEOPLE_FILE}); use their full name as it is listed there.`);
  if (!clean(estimate?.said)) problems.push('"said" is missing: their estimate in their own words, as they gave it.');
  if (problems.length) return { status: 'invalid', problems };
  const entry = { by: clean(estimate.by), date: clean(estimate.date) || today(now), said: String(estimate.said).trim(),
    ...(clean(estimate.duration) ? { duration: clean(estimate.duration) } : {}), ...(clean(estimate.team) ? { team: clean(estimate.team) } : {}),
    ...(list(estimate.assumptions).length ? { assumptions: list(estimate.assumptions).map(clean).filter(Boolean) } : {}) };
  const ledger = { ...found.ledger, estimates: [...(found.ledger.estimates || []), entry] };
  const markdown = found.text.replace(/\n*<!-- rfp-brief-ledger[\s\S]*$/, '');
  await writeAtomic(found.file, noteText(markdown, ledger));
  const chat = [`Estimates for ${clean(found.ledger.input.name)} (brief of ${found.ledger.given}):`, estimatesText(ledger.estimates)];
  return { status: 'ok', text: ['Send them the text between the lines word for word. They can\'t see this output.', '-----', chat.join('\n'), '-----',
    `(Saved for later, not for the chat: ${relativeTo(workspace, found.file)})`].join('\n') };
}

// ---- What the brief is built from ----------------------------------------------------------------------

/** Everything the skill builds the brief from, with the steps this RFP calls for. */
export async function briefInputs(slug, { workspace = workspaceDir(), now = new Date() } = {}) {
  await rfpFolder(slug, workspace);
  const docs = await rfpDocuments(slug, { workspace });
  const scoring = await scoringJudgment(slug, { workspace });
  const judgments = scoring?.judgments || {};
  // Scope documents the scoring found named but not saved (no document IDs behind them).
  const missing = list(judgments.requiredDocuments).filter(item => item?.scope && !list(item.documentIds).length).map(item => clean(item.name)).filter(Boolean);
  const scopeRead = judgments.scopeRead && typeof judgments.scopeRead.read === 'boolean' ? judgments.scopeRead : null;
  const capability = await savedCapability(slug, { workspace });
  const openRows = capability ? capability.rows.filter(row => row.status === 'never' || capability.unanswered.includes(row.n))
    .map(row => ({ n: row.n, operation: row.operation, status: capability.unanswered.includes(row.n) ? 'unanswered' : 'never' })) : [];
  const people = parsePeople(await fs.readFile(path.join(workspace, PEOPLE_FILE), 'utf8').catch(() => ''));
  const recorded = await recordedDates(slug, { workspace, now });
  const saved = await savedBrief(slug, { workspace });

  const steps = [];
  if (saved) steps.push(`A brief was written on ${saved.given}${saved.estimates.length ? ` and has ${saved.estimates.length} estimate(s)` : ''}. To revise it (a new addendum, say), start from --show's "input" and change it; to record an estimate, use --estimate.`);
  if (missing.length) steps.push(`The scoring found scope documents that were never saved: ${missing.join('; ')}. Try skills/rfp/document-fetch/instructions.md first; the brief lists any still missing as risks.`);
  if (scopeRead?.read === false) steps.push(`The scoring says the saved documents don't fully describe the work: ${clean(scopeRead.reason)}`);
  if (openRows.length) steps.push(`The capability check has ${openRows.length} row(s) answered "never" or still unanswered; the brief lists them as risks for the estimate.`);
  if (!people) steps.push(`${PEOPLE_FILE} is missing, so who is current can't be checked: ask who should estimate.`);
  steps.push('Quote the RFP exactly, with its page: the script checks every quote against the saved documents and refuses one it can\'t find.');
  steps.push('Then pass the brief to rfp-brief.mjs and send its text word for word, with its MEDIA: line. Never write the brief yourself, and never send it to anyone: the person who asked sends it.');

  return {
    rfp: slug,
    steps,
    documents: { saved: docs.files?.length || 0, readAll: `node scripts/document-text.mjs --rfp ${slug} --file all` },
    keyDates: recorded ? { dates: recorded.dates } : null,
    scope: scoring ? { from: scoring.from, read: scopeRead ? scopeRead.read : null, reason: scopeRead ? clean(scopeRead.reason) : null, missing } : null,
    capability: openRows.length ? { given: capability.given, rows: openRows } : null,
    team: people ? people.map(person => ({ name: person.name, role: person.role })) : null,
    saved: saved ? { given: saved.given, for: saved.for, pdf: saved.pdf, estimates: saved.estimates } : null,
  };
}

// ---- Command line ---------------------------------------------------------------------------------------

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const USAGE = `Usage: node scripts/rfp-brief.mjs --rfp <slug> --inputs
   or: node scripts/rfp-brief.mjs --rfp <slug> --show
   or: node scripts/rfp-brief.mjs --rfp <slug> <<'RFP_BRIEF_END'
{ "name": "<RFP name>", "number": "<RFP number>", "agency": "<agency>", "foundVia": "<where it was found>", "pageCount": <n>,
  "preparedBy": "<who asked>", "for": ["<engineer's full name from People.txt>"], "summary": "<one sentence, about 20 words>",
  "sections": { "<${SECTIONS.map(section => section.key).join('|')}>": [ { "label": "<2-5 words>", "explain": "<one plain sentence>", "flag": false,
    "quotes": [ { "quote": "<the RFP's exact words>", "source": "file <n>, page <p>, §<x>" } ] } ] },
  "ambiguities": [ { "question": "<as it would go to the agency>", "why": "<why it matters for the estimate>", "quote": "<exact words>", "source": "file <n>, page <p>" } ],
  "forSales": "<a note only the person who asked sees>" }
RFP_BRIEF_END
   or: node scripts/rfp-brief.mjs --rfp <slug> --estimate <<'RFP_BRIEF_END'
{ "by": "<full name>", "said": "<their estimate, word for word>", "duration": "<e.g. 12 weeks>", "team": "<e.g. 3 engineers>", "assumptions": ["..."] }
RFP_BRIEF_END`;

export async function main(args = process.argv.slice(2), { workspace = workspaceDir(), now = new Date(), stdin = readStdin } = {}) {
  const slug = args[args.indexOf('--rfp') + 1];
  if (!args.includes('--rfp') || !slug || slug.startsWith('--')) { process.stderr.write(`${USAGE}\n`); process.exitCode = 1; return; }
  if (args.includes('--inputs')) { process.stdout.write(`${JSON.stringify(await briefInputs(slug, { workspace, now }), null, 2)}\n`); return; }
  if (args.includes('--show')) {
    const saved = await savedBrief(slug, { workspace });
    process.stdout.write(saved ? `${JSON.stringify(saved, null, 2)}\n` : `No engineering brief is saved for ${slug}.\n`);
    return;
  }
  const input = parseJson((await stdin()).trim());
  if (!input) { process.stderr.write(`The brief or estimate must be JSON on standard input.\n${USAGE}\n`); process.exitCode = 1; return; }
  const result = args.includes('--estimate') ? await runEstimate({ slug, estimate: input, workspace, now }) : await runBrief({ slug, input, workspace, now });
  if (result.status === 'invalid') {
    process.stdout.write(`Nothing was saved. Fix these and run it again:\n${result.problems.map(item => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${result.text}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Engineering brief failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
