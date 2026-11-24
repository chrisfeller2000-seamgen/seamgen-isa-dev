#!/usr/bin/env node
// Decides what an RFP request in chat means: which skill, which RFP, which phase, and what ISA
// must ask before doing anything. ISA runs it first for every RFP message and does what it
// returns, so matching the request is done here in code instead of by the model.
//
//   node scripts/rfp-route.mjs <<'RFP_MESSAGE_END'
//   <the person's message, as written>
//   RFP_MESSAGE_END
//   node scripts/rfp-route.mjs "rfp checklist <slug> --stay"     (only the router's own `route` commands)
//
// Local tests on November 18, 2026 showed the model picks the right skill when a request names
// an RFP task, but not when the wording is open ("yes, move Laguna Beach", "write the email that
// goes with it"): it then acted from memory, made up commands, or once said an RFP had moved
// without running anything.
//
// It understands three kinds of input:
// - the command form ISA's own replies teach: `rfp brief Laguna Beach`, `rfp move Laguna building`,
//   `rfp checklist laguna-beach-website-redesign --stay`, `rfp list`, `rfp skills Laguna`;
// - a Telegram button tap, which reaches ISA as `callback_data: rfp:run:<command>:<slug>` or
//   `callback_data: rfp:move:<phase>:<slug>`;
// - free text, matched against each skill's `asks` list in skills/rfp/<skill>/instructions.md.
//
// It prints one JSON decision. It only reads files: it never moves an RFP, sends anything or
// writes a file. ISA then runs the command it names (rfp-stage.mjs for a move) and follows the
// skill file. A reply of "1", "yes" or "no" carries no meaning on its own; ISA runs the router
// again with the command written next to that choice in its own question.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rfpDocuments } from './document-text.mjs';
import { recordedDates } from './rfp-dates.mjs';
import { capabilityInputs, savedCapability } from './rfp-capability.mjs';
import { questionInputs, savedQuestions } from './rfp-questions.mjs';
import { STAGES, findStage, rfpsDir, workspaceDir } from './rfp-folders.mjs';

const PHASE_NAMES = ['Phase 1: Scored', 'Phase 2: Shortlisted', 'Phase 3: Building', 'Phase 4: Submitted'];
const MOVE_WORDS = ['scored', 'shortlisted', 'building', 'submitted'];
export const phaseName = number => PHASE_NAMES[number - 1] || '';

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const listDirs = async dir => (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory()).map(entry => entry.name);

/** Lower case, apostrophes dropped, "&" spelled out, everything else between words a single space. */
export function normalize(text) {
  return String(text || '').toLowerCase().replace(/[‘’']/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Words that say nothing about which skill or RFP is meant.
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'at', 'with', 'by', 'from', 'it', 'its', 'this', 'that',
  'is', 'are', 'be', 'we', 'us', 'our', 'you', 'your', 'me', 'my', 'i', 'can', 'could', 'please', 'pls', 'do', 'does', 'did', 'make', 'get',
  'give', 'put', 'need', 'want', 'would', 'should', 'will', 'just', 'some', 'up', 'out', 'what', 'which', 'how', 'when', 'one', 'isa', 'hey', 'hi']);
// Words too common in RFP titles to tell RFPs apart.
const GENERIC_TITLE = new Set([...STOP, 'rfp', 'rfq', 'rfi', 'request', 'requests', 'proposal', 'proposals', 'project', 'services', 'service',
  'system', 'systems', 'solution', 'solutions', 'new', 'and', 'program', 'support', 'development', 'design', 'management']);
const words = text => normalize(text).split(' ').filter(Boolean);
const contentWords = text => words(text).filter(word => !STOP.has(word));
const containsPhrase = (haystack, phrase) => phrase && ` ${haystack} `.includes(` ${phrase} `);

function frontmatter(text) {
  const match = String(text).match(/^---\n([\s\S]*?)\n---\n/);
  const fields = {};
  for (const line of (match?.[1] || '').split('\n')) {
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return fields;
}

/** The RFP skills, from the header of each skills/rfp/<id>/instructions.md. */
export async function loadSkills({ workspace = workspaceDir() } = {}) {
  const root = path.join(workspace, 'skills', 'rfp');
  const skills = [];
  for (const id of (await listDirs(root)).sort()) {
    const text = await fs.readFile(path.join(root, id, 'instructions.md'), 'utf8').catch(() => null);
    if (text === null) continue;
    const fields = frontmatter(text);
    if (!fields.command) continue;
    skills.push({
      id,
      name: fields.name || id,
      label: fields.label || id,
      command: fields.command,
      phase: /^[1-4]$/.test(fields.phase || '') ? Number(fields.phase) : null,
      when: fields.when || '',
      asks: (fields.asks || '').split('|').map(normalize).filter(Boolean),
      file: `skills/rfp/${id}/instructions.md`,
    });
  }
  return skills;
}

function titleFrom(text) {
  return String(text.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] || '').trim();
}

const agencyFrom = text => String(text.match(/^agency_name:\s*"?(.*?)"?\s*$/m)?.[1] || '').replace(/^unknown$/, '').trim();

/**
 * Each RFP's title and agency from the weekly audit (reports/new-rfp-qualification/audit/*.jsonl),
 * newest run first, for the slugs in `wanted`. On November 24, 2026 none of the VM's 348 RFP
 * folders had a _stage.json or candidate.md, so without this the router knew only their slugs:
 * "the questions for the City of Laguna Beach's website redesign RFP" matched the slug
 * `website-redesign` (a Missouri college) exactly, and the agency counted for nothing. The files
 * are large (27 MB then), so only the `rfp` object near the start of each line is read.
 */
async function auditNames(workspace, wanted) {
  const found = new Map();
  if (!wanted.size) return found;
  const dir = path.join(workspace, 'reports', 'new-rfp-qualification', 'audit');
  const files = (await fs.readdir(dir).catch(() => [])).filter(name => name.endsWith('.jsonl')).sort().reverse();
  const field = (text, key) => {
    const match = text.match(new RegExp(`"${key}":("(?:[^"\\\\]|\\\\.)*")`));
    try { return match ? JSON.parse(match[1]) : ''; } catch { return ''; }
  };
  for (const name of files) {
    const text = await fs.readFile(path.join(dir, name), 'utf8').catch(() => '');
    let at = text.indexOf('"rfp":{');
    while (at !== -1) {
      const head = text.slice(at, at + 1500);
      const slug = field(head, 'slug');
      if (wanted.has(slug) && !found.has(slug)) found.set(slug, { title: field(head, 'title'), agency: field(head, 'agency') });
      at = text.indexOf('"rfp":{', at + 7);
    }
    if (found.size === wanted.size) break;
  }
  return found;
}

/**
 * Every RFP ISA could mean: each folder in the four phases, plus this week's results (an RFP
 * there may have no folder yet). Titles come from _stage.json, candidate.md, the documents
 * manifest, latest.json or the audit; agencies from the same places except the manifest.
 */
export async function loadRfps({ workspace = workspaceDir() } = {}) {
  const bySlug = new Map();
  for (const [index, stage] of STAGES.entries()) {
    for (const slug of await listDirs(path.join(rfpsDir(workspace), stage.dir))) {
      const dir = path.join(rfpsDir(workspace), stage.dir, slug);
      const record = await readJson(path.join(dir, '_stage.json')).catch(() => null);
      const candidate = record?.title && record?.agency ? '' : await fs.readFile(path.join(dir, 'candidate.md'), 'utf8').catch(() => '');
      const manifest = record?.title || titleFrom(candidate) ? null : await readJson(path.join(dir, 'resources', '_document-manifest.json')).catch(() => null);
      const existing = bySlug.get(slug);
      // Two copies of one RFP: the later phase wins here; rfp-stage.mjs refuses to move it anyway.
      if (!existing || existing.phase < index + 1) {
        bySlug.set(slug, {
          slug, title: record?.title || titleFrom(candidate) || String(manifest?.candidate_title || '').trim() || existing?.title || slug,
          agency: record?.agency || agencyFrom(candidate) || existing?.agency || '', phase: index + 1, folder: true,
        });
      }
    }
  }
  const latest = await readJson(path.join(workspace, 'reports', 'new-rfp-qualification', 'latest.json')).catch(() => null);
  for (const entry of latest?.entries || []) {
    if (!entry?.slug) continue;
    const known = bySlug.get(entry.slug);
    if (known) {
      if (known.title === entry.slug && entry.title) known.title = entry.title;
      if (!known.agency && entry.agency) known.agency = entry.agency;
      known.thisWeek = entry.tier || true;
    } else {
      bySlug.set(entry.slug, { slug: entry.slug, title: entry.title || entry.slug, agency: entry.agency || '', phase: 1, folder: false, thisWeek: entry.tier || true });
    }
  }
  const missing = new Set([...bySlug.values()].filter(rfp => !rfp.agency || rfp.title === rfp.slug).map(rfp => rfp.slug));
  for (const [slug, names] of await auditNames(workspace, missing)) {
    const rfp = bySlug.get(slug);
    if (rfp.title === slug && names.title) rfp.title = names.title;
    if (!rfp.agency && names.agency) rfp.agency = names.agency;
  }
  return [...bySlug.values()];
}

/** The skill the message asks for, by its `asks` phrases. Longer phrase matches win. */
export function matchSkills(message, skills) {
  const text = normalize(message);
  const said = new Set(contentWords(message));
  const scored = [];
  for (const skill of skills) {
    let best = 0;
    for (const phrase of skill.asks) {
      const length = phrase.split(' ').length;
      if (containsPhrase(text, phrase)) best = Math.max(best, 10 + 2 * length);
      else {
        const needed = contentWords(phrase);
        if (needed.length >= 2 && needed.every(word => said.has(word))) best = Math.max(best, 6 + needed.length);
      }
    }
    if (best) scored.push({ skill, score: best });
  }
  return scored.sort((a, b) => b.score - a.score);
}

// Words in agency names that don't tell agencies apart.
const GENERIC_AGENCY = new Set([...STOP, 'city', 'county', 'state', 'town', 'village', 'township', 'borough', 'district', 'department', 'dept',
  'office', 'public', 'government', 'agency', 'authority', 'board', 'commission', 'services', 'service', 'unified', 'regional',
  'metropolitan', 'college', 'university', 'school', 'schools', 'community', 'administration', 'division', 'bureau', 'center']);

/**
 * The RFP the message names: its slug or title, its agency, or the title words that set it apart
 * from the others. When the message names an agency ("the City of Laguna Beach"), only that
 * agency's RFPs compete, and a title or slug appearing in the message no longer settles it alone
 * when another RFP's title holds the same words: "website redesign" is in both the Missouri
 * college's "Website Redesign" and Laguna Beach's "Website Redesign and Replacement Project".
 */
export function matchRfps(message, rfps, { ignore = new Set() } = {}) {
  const text = normalize(message);
  // ISA's own commands name the slug: `rfp questions website-redesign-and-replacement-project`.
  const whole = rfps.filter(rfp => text === normalize(rfp.slug) || text === normalize(rfp.title));
  if (whole.length === 1) return [{ rfp: whole[0], score: 100 }];
  // Words that name the task ("agency questions", "engineering brief") say nothing about which
  // RFP: on the VM's list, "agency" matched "Broad Agency Announcement" and "engineering" a
  // Texas DOT engineering office.
  const said = new Set(words(message).filter(word => !ignore.has(word)));
  const agencyWords = rfps.map(rfp => new Set(words(rfp.agency || '').filter(word => !GENERIC_AGENCY.has(word) && word.length > 2)));
  const agencyFrequency = new Map();
  for (const set of agencyWords) for (const word of set) agencyFrequency.set(word, (agencyFrequency.get(word) || 0) + 1);
  const agencyScore = agencyWords.map(set => [...set].filter(word => said.has(word)).reduce((sum, word) => sum + 1 / agencyFrequency.get(word), 0));
  const bestAgency = Math.max(0, ...agencyScore);
  const pool = bestAgency > 0 ? rfps.filter((rfp, index) => agencyScore[index] === bestAgency) : rfps;

  const phrases = rfp => [normalize(rfp.slug), normalize(rfp.title)].filter(Boolean);
  const exact = pool.filter(rfp => phrases(rfp).some(phrase => containsPhrase(text, phrase)));
  if (exact.length === 1) {
    const matched = phrases(exact[0]).filter(phrase => containsPhrase(text, phrase));
    const shared = pool.some(rfp => rfp !== exact[0] && matched.some(phrase => phrases(rfp).some(other => containsPhrase(other, phrase))));
    if (!shared) return [{ rfp: exact[0], score: 100 }];
  }
  if (bestAgency > 0 && pool.length === 1) return [{ rfp: pool[0], score: 100 }];

  const frequency = new Map();
  const titleWords = rfps.map(rfp => new Set([...words(rfp.title), ...words(rfp.slug)].filter(word => !GENERIC_TITLE.has(word) && word.length > 2)));
  for (const set of titleWords) for (const word of set) frequency.set(word, (frequency.get(word) || 0) + 1);
  const scored = [];
  rfps.forEach((rfp, index) => {
    if (!pool.includes(rfp)) return;
    // No bonus for a title or slug in the message here: past the check above, another RFP's
    // title holds the same words, and a bonus would let a short generic slug win the tie.
    let score = 0;
    for (const word of titleWords[index]) if (said.has(word)) score += 1 / frequency.get(word);
    if (score) scored.push({ rfp, score });
  });
  // Within one agency's RFPs, the title words decide: the City of Laguna Beach has both a website
  // redesign and a traffic signal RFP, and an agency score shared by both would hide the title's
  // lead. With no title words at all, every RFP of that agency is a candidate.
  if (!scored.length && bestAgency > 0) return pool.map(rfp => ({ rfp, score: bestAgency }));
  return scored.sort((a, b) => b.score - a.score);
}

const STAY = /\b(keep it (where|in|at)|leave it (where|in|at)|dont move|do not move|without moving|stay(s)? (where|in))\b|--stay\b/;
const LIST = /\bworking on\b|\bin progress\b|\bour rfps\b|\blist (the |our |all )?rfps\b|\bwhich rfps (are|did) we\b|\bwhats in (phase|shortlisted|looking|building)\b|\bwhat is in (phase|shortlisted|looking|building)\b/;
// Requests that sound like a skill but aren't one. Taken from real chats on the VM (July–October 2026).
const RETIRED = /\bmeeting brief\b/;
// Asking ISA to write a pursue email. The Friday job writes and sends it, so the chat skill was
// retired on November 23, 2026. Questions about the sent email ("what did the pursue email say")
// don't match and are still answered from its record. People also ask without saying "pursue
// email" ("email Marianne and Sales that Laguna is a pursue"), which would otherwise reach the
// general answer path, where ISA could improvise a draft from the Workshop's rfp-flow skill.
const PURSUE_DRAFT = /\b(write|draft|create|generate|prepare|compose|make|redo|rewrite)( me| us| up)?( a| an| the| another| new| our)* (pursue|pursuit|pursuing) (email|note|message)\b|\b(pursue|pursuit) email draft\b/;
const PURSUE_NOTICE = /\b(email (marianne|sales)|(write|draft|send|compose)( me| us| up)?( a| an| the)? (email|note|message) to (marianne|sales))\b.*\b(pursue|pursuing|pursuit)\b/;
// A question about an email already sent, or a request to pass on an RFP's documents.
const NOT_PURSUE_NOTICE = /^(did|has|have|was|were|what|when|who|why)\b|\b(documents?|docs?|pdfs?|files?|attachments?)\b/;
const SHARE = /\b(share|send me|email me|attach|forward)\b.*\b(documents?|docs?|pdfs?|files?|rfp|rfq)\b/;
const RESCORE = /\b(rescore|re score|score (this|it|that) (again|rfp|rfq)|score (this|it|that)$|score this (rfp|rfq)|run the scor)/;
const RESULTS = /\bthis week\b|\blatest batch\b|\bworth pursuing\b|\bfriday (email|results|run|message)\b|\bweekly (rfp )?job\b|\bbeen run\b|\bpursue email\b|\bhow did .* score\b|\bscored today\b|\bwhat score\b|\bits score\b|\bscore breakdown\b|\bpoints per\b/;
const OFFER = /\bwhat can you (do|help)\b|\bwhats next\b|\bwhat is next\b|\bnext steps?\b|\bwhat (skills|options)\b|\bwhat else can\b|\bhelp with\b/;
// "shortlist Carlsbad" is a move to Phase 2 (Shortlisted); "is Carlsbad shortlisted?" is not.
const MOVE = /\b(move|moving|moved|promote|push|bump|advance|put|go(es)? to|send it to|shortlist)\b/;
// A question about an RFP's dates ("when is Chandler due?", "is there a pre-bid meeting?") is
// answered, not turned into the calendar skill: in local tests on November 18, 2026 "is there a
// pre-bid meeting for Chandler?" got a "move it to Phase 2 first?" question back. Only a request
// for calendar events (the calendar skill's `asks`) runs the skill.
const DATE_QUESTION = /\bwhen (is|are|s|was|were|do|does|did)\b|\bwhens\b|\b(key|important) dates?\b|\bdue dates?\b|\bdeadlines?\b|\bpre (bid|proposal|submittal)\b|\b(bidders|vendors?) (conference|meeting)\b|\bsite visit\b|\bconference\b|\bwhat (date|day|time)\b/;
// About questions already written for the agency, not a request to write new ones. Each of these
// ran the agency questions skill until November 24, 2026, which wrote a fresh set of questions:
// - the agency's answers ("the city answered our questions", "Q&A answers are posted");
// - what was asked ("what did we ask the agency", "did we already send questions");
// - this week's "ask the agency first" RFPs, which the Friday results list with their question.
const AGENCY_ANSWERS = /\b(agency|city|county|district|state|town|they|buyer|owner)( has| have)? (answered|responded|replied|got back|posted (the |their )?(answers|responses))\b|\b(q and a|qa|question|questions|clarification|clarifications) (answers|responses|replies)\b|\b(answers|responses|replies) (to|on|for) (our|the|my|their) (questions|q and a|qa|clarifications?)\b|\banswers? (are|is|were|was|came) (out|posted|in|back)\b|\b(replied|responded|answered)( yet)?$|\b(respond|answer|reply|replied|responded|answered) to (our|the|my) (questions|q and a|qa)\b|\b(answered|responded to|replied to) (our|my|the|all|both)( of our)? (questions|q and a|qa)\b/;
const QUESTIONS_ASKED = /\b(what|which) (questions )?(did|have) (we|you|i) (ask|asked|send|sent|submit|submitted)\b|\b(did|have) (we|you|i) (already )?(ask|asked|send|sent|submit|submitted|write|written|wrote)( the| any| our)?( agency)?( q and a| clarifying)? questions\b|\b(questions|what) (we|you) (asked|sent|submitted)\b/;
const ASK_FIRST = /\bask (the )?agency first\b/;
// An engineer's answer to a capability check, passed on in chat ("Pete answered the Laguna Beach
// capability check: rows 1 and 2 done on FDEP"). It is recorded against the saved check, not a
// reason to build a new one, and recording it never asks about a move.
const CAPABILITY_REPORT = /\b(answered|replied|responded|said|says|got back|came back|confirmed|wrote back)\b/;
// A question about a capability check already sent: what an engineer said, or what is still open.
const CAPABILITY_ASKED = /\b(capability|capabilities|checklist|check)\b/;
const CAPABILITY_STATUS = /\bwhat did \w+( \w+)? (say|answer|reply|tell us)\b|\b(where are we|status|update) (on|of|with)\b|\b(which|what) rows\b|\b(still )?(open|unanswered)\b|\bhas \w+ (answered|replied|got back)\b|\bdid \w+ (answer|reply|get back)\b/;
const WRITE = /\b(write|draft|prepare|compose|create|generate|redo|rewrite)\b/;
// A request to write or change questions, which goes to the skill even when it mentions
// earlier ones ("redo the questions we sent", "add a question about hosting").
const REWRITE = /^(please )?(write|draft|prepare|compose|create|generate)\b|\b(redo|rewrite|revise|update|change|edit|add|remove|drop|fix)\b/;
const REPLY = /^(yes|yeah|yep|ok|okay|sure|no|nope|nah|go ahead|do it|please do|lets do|the (first|second|third|1st|2nd|3rd)|option \d|number \d|\d\b)/;

// A target phase named in the message: "phase 3", "building", "shortlisted", "submitted", "back to scored".
function phaseIn(text) {
  const number = text.match(/\bphase (\d)\b/)?.[1];
  if (number && Number(number) >= 1 && Number(number) <= 4) return Number(number);
  // "looking closer" and "looking" are Phase 2's old name, still accepted.
  if (/\bshortlist(ed)?\b|\blooking closer\b|\blooking\b|\bintermediate\b/.test(text)) return 2;
  if (/\bbuilding\b|\bbuild phase\b/.test(text)) return 3;
  if (/\bsubmitted\b/.test(text)) return 4;
  if (/\bscored\b|\bback to (phase )?1\b/.test(text)) return 1;
  return null;
}

/** Reads the command form and button taps. Returns null for free text. */
export function parseStructured(message, skills) {
  const raw = String(message || '').trim();
  const tap = raw.match(/callback_data:\s*rfp:(run|move):([a-z0-9-]+):([a-z0-9-]+)/i);
  if (tap) {
    const [, verb, arg, slug] = tap;
    if (verb.toLowerCase() === 'move') return { kind: 'move', slug, phase: findStage(arg) ? STAGES.indexOf(findStage(arg)) + 1 : null };
    return { kind: 'skill', skill: skills.find(skill => skill.command === arg.toLowerCase()) || null, slug, stay: false };
  }
  const command = raw.match(/^\/?rfp\s+([a-z-]+)\b\s*(.*)$/i);
  if (!command) return null;
  const verb = command[1].toLowerCase();
  let rest = command[2];
  const stay = /--stay\b/.test(rest);
  rest = rest.replace(/--stay\b/g, '').trim();
  if (verb === 'list') return { kind: 'list' };
  if (verb === 'skills') return { kind: 'offer', name: rest };
  if (verb === 'move') {
    // `--choice <n>`: the move is choice n of ISA's own question (see rfp-stage.mjs).
    const choice = rest.match(/--choice\s+(\d)\b/)?.[1] || null;
    const parts = rest.replace(/--choice\s+\d\b/g, '').trim().split(/\s+/);
    const last = parts.at(-1) || '';
    const target = findStage(last) ? STAGES.indexOf(findStage(last)) + 1 : null;
    return { kind: 'move', name: target ? parts.slice(0, -1).join(' ') : parts.join(' '), phase: target, choice };
  }
  const skill = skills.find(item => item.command === verb);
  if (skill) return { kind: 'skill', skill, name: rest, stay };
  return { kind: 'unknown', verb };
}

const commandFor = (skill, rfp, extra = '') => `rfp ${skill.command} ${rfp.slug}${extra}`;
// The person's own words go on standard input, never in quotes on the command line, and
// rfp-stage.mjs moves only when they ask for one.
const moveCommand = (rfp, phase, choice = null) => `node scripts/rfp-stage.mjs ${rfp.slug} ${MOVE_WORDS[phase - 1]} --by "<their name>"${choice ? ` --choice ${choice}` : ''} --said <<'RFP_REPLY_END'\n<their exact words, as they wrote them>\nRFP_REPLY_END`;
const rfpOut = rfp => (rfp ? { slug: rfp.slug, title: rfp.title, ...(rfp.agency ? { agency: rfp.agency } : {}), phase: rfp.phase, phaseName: phaseName(rfp.phase), hasFolder: rfp.folder } : null);
const skillOut = skill => (skill ? { id: skill.id, label: skill.label, command: skill.command, phase: skill.phase, file: skill.file } : null);

function skillsOfPhase(skills, phase) {
  return skills.filter(skill => skill.phase === phase);
}

/** The skills of one phase for an RFP, numbered, each with its command. rfp-stage.mjs prints it after a move. */
export function phaseOffer(skills, rfp, phase, lead) {
  const list = skillsOfPhase(skills, phase);
  if (!list.length) return `${lead}Nothing to run in ${phaseName(phase)}: the Friday job already sent its email. Want me to move it to ${phaseName(2)}? Reply \`rfp move ${rfp.slug} shortlisted\`.`;
  return [`${lead}For ${rfp.title} in ${phaseName(phase)} I can do:`,
    ...list.map((skill, index) => `${index + 1}. ${skill.label}: \`${commandFor(skill, rfp)}\``),
    'Which one? Reply with the number or the command.'].join('\n');
}

function chooseRfp(message, rfps, structuredName, ignore) {
  const ranked = matchRfps(structuredName || message, rfps, { ignore });
  if (!ranked.length) return { rfp: null, ambiguous: [] };
  const [first, second] = ranked;
  if (!second || first.score >= second.score * 1.5) return { rfp: first.rfp, ambiguous: [] };
  return { rfp: null, ambiguous: ranked.filter(item => item.score >= first.score / 1.5).slice(0, 4).map(item => item.rfp) };
}

function askWhichRfp(ambiguous, nextCommand) {
  if (!ambiguous.length) return { action: 'ask-which-rfp', say: 'Which RFP do you mean? Give me its name as it appears in the Friday email or the HigherGov listing.' };
  return {
    action: 'ask-which-rfp',
    choices: ambiguous.map((rfp, index) => ({ n: index + 1, rfp: rfpOut(rfp), command: nextCommand(rfp) })),
    say: ['Which RFP do you mean?', ...ambiguous.map((rfp, index) => `${index + 1}. ${rfp.title}${rfp.agency ? `, ${rfp.agency}` : ''} (${phaseName(rfp.phase)}): \`${nextCommand(rfp)}\``)].join('\n'),
  };
}

/**
 * The decision for one message. See the comment at the top for what each action asks of ISA.
 * Each choice carries `route`: the exact router call for that choice, which ISA runs when the
 * person answers with a number, "yes", "no" or "keep it" (and `thenRoute` once a move is done).
 */
export async function routeRequest(message, options = {}) {
  const decision = await decide(message, options);
  if (decision.rfp && DOCUMENT_ACTIONS.has(decision.action)) decision.documents = await documentsOut(decision.rfp.slug, options.workspace);
  // The agency questions skill's inputs, with its `steps`, come with the decision. In a local
  // test on the real Laguna Beach RFP (November 24, 2026), ISA read the skill and the documents
  // and wrote questions freehand without running `--inputs`, so it missed the "ask the agency
  // first" question the scoring had set.
  if (decision.action === 'run-skill' && decision.skill?.id === 'agency-questions' && decision.rfp?.hasFolder) {
    decision.inputs = await questionInputs(decision.rfp.slug, { workspace: options.workspace, now: options.now }).catch(() => null);
  }
  // The same for the capability check: the scoring's case-study match, the current staff list,
  // the questions deadline and the saved check with its open rows.
  if (decision.action === 'run-skill' && decision.skill?.id === 'capability-check' && decision.rfp?.hasFolder) {
    decision.inputs = await capabilityInputs(decision.rfp.slug, { workspace: options.workspace, now: options.now }).catch(() => null);
  }
  if (decision.rfp && decision.action === 'answer' && decision.about === 'capability') {
    const saved = await savedCapability(decision.rfp.slug, { workspace: options.workspace });
    decision.capability = saved ? { given: saved.given, routedTo: saved.routedTo, rows: saved.rows, unanswered: saved.unanswered, answers: saved.answers, recordGaps: saved.recordGaps } : null;
  }
  // The saved documents that look like the agency's answers. In a local test on November 24,
  // 2026, ISA answered "anything we need to know?" from the scoring notes and never opened the
  // saved Q&A addendum.
  if (decision.about === 'agency-answers' && decision.documents?.files) {
    const answers = decision.documents.files.filter(file => file.readable && /q ?& ?a|\bqa\b|question|answer|response|clarif|addend/i.test(file.name));
    decision.answerFiles = answers.map(file => ({ n: file.n, read: `node scripts/document-text.mjs --rfp ${decision.rfp.slug} --file ${file.n}` }));
  }
  // An answer carries the key dates already recorded, so ISA doesn't work weekdays out itself.
  if (decision.rfp && decision.action === 'answer') {
    decision.dates = await recordedDates(decision.rfp.slug, { workspace: options.workspace, now: options.now }) || null;
    // The questions ISA gave last time (scripts/rfp-questions.mjs), for "what did we ask" and the agency's answers.
    if (['questions', 'agency-answers'].includes(decision.about)) {
      const saved = await savedQuestions(decision.rfp.slug, { workspace: options.workspace });
      decision.questions = saved ? { given: saved.given, questions: saved.questions } : null;
    }
  }
  const routeOf = command => `node scripts/rfp-route.mjs "${command}"`;
  if (decision.choices) {
    decision.choices = decision.choices.map(choice => ({ ...choice, route: routeOf(choice.command), ...(choice.then ? { thenRoute: routeOf(choice.then) } : {}) }));
  }
  return decision;
}

// Decisions that work from the RFP's documents carry `documents`: what is saved and the exact
// commands to read it by number. In local tests ISA asked people to send a PDF it already had,
// because nothing told it where an RFP's documents are or how to read them.
const DOCUMENT_ACTIONS = new Set(['run-skill', 'offer', 'answer', 'share-documents', 'rescore']);
async function documentsOut(slug, workspace = workspaceDir()) {
  const docs = await rfpDocuments(slug, { workspace });
  const read = `node scripts/document-text.mjs --rfp ${slug}`;
  if (!docs.folder || !docs.files.length) {
    return { saved: 0, notes: docs.notes ? `${read} --notes` : null,
      note: 'No saved documents. Follow skills/rfp/document-fetch/instructions.md to get them; ask the person only if that fails.' };
  }
  return {
    saved: docs.files.length,
    readable: docs.files.filter(file => file.readable).length,
    files: docs.files.slice(0, 20).map(file => ({ n: file.n, name: file.name, type: file.type, readable: file.readable })),
    list: read,
    readOne: `${read} --file <n>`,
    readAll: `${read} --file all`,
    notes: docs.notes ? `${read} --notes` : null,
  };
}

async function decide(message, { workspace = workspaceDir() } = {}) {
  const skills = await loadSkills({ workspace });
  const rfps = await loadRfps({ workspace });
  const text = normalize(message);
  const structured = parseStructured(message, skills);
  const base = { request: String(message || '').trim() };

  const needsContext = {
    ...base, action: 'needs-context', say: null,
    note: 'A reply to one of your questions. Take the choice they picked from your own last question ("yes" is choice 1; "no", "keep it" or "leave it" is the choice that keeps the RFP where it is) and run its `route` command, for example node scripts/rfp-route.mjs "rfp checklist <slug> --stay".',
  };
  if (/^(yes|yeah|yep|ok|okay|sure|no|nope|nah|\d)$/.test(text)) return needsContext;
  if (structured?.kind === 'unknown') {
    return { ...base, action: 'unknown-command', say: `I don't know \`rfp ${structured.verb}\`. Commands: ${['list', 'skills', 'move', ...skills.map(skill => skill.command)].join(', ')}.` };
  }

  const pick = structured?.slug
    ? { rfp: rfps.find(rfp => rfp.slug === structured.slug) || null, ambiguous: [] }
    : chooseRfp(message, rfps, structured?.name, new Set(skills.flatMap(skill => skill.asks.flatMap(phrase => phrase.split(' ')))));
  const rfp = pick.rfp;
  const ranked = structured?.kind === 'skill' ? [] : matchSkills(message, skills);

  // "No, keep it where it is. Just do the checklist." names no RFP: it answers ISA's last question.
  if (!structured && !rfp && !pick.ambiguous.length && (REPLY.test(text) || STAY.test(text))) return needsContext;

  if (!structured) {
    if (RETIRED.test(text)) {
      return { ...base, action: 'retired', rfp: rfpOut(rfp),
        say: 'The meeting brief was retired in October. The Friday pursue email has the summary, fit, blockers and key dates; I can also do an engineering brief or the agency questions. Which would help?' };
    }
    if (PURSUE_DRAFT.test(text) || (PURSUE_NOTICE.test(text) && !NOT_PURSUE_NOTICE.test(text))) {
      return { ...base, action: 'retired', rfp: rfpOut(rfp),
        say: "I send the pursue email on my own after Friday's scoring, for that week's Strong Pursue RFPs, and after a rescore once someone confirms it, so there's no draft to write. I can tell you what this week's email said, or do an engineering brief or the agency questions. Which would help?" };
    }
    // "Send me a calendar file" is the calendar skill, not an agency document.
    if (SHARE.test(text) && !/\b(calendar|ics|invites?)\b/.test(text)) {
      return { ...base, action: 'share-documents', rfp: rfpOut(rfp),
        note: 'Attach the saved file from the RFP\'s resources/ folder, as skills/rfp/INDEX.md says under "Documents". If it isn\'t saved yet, follow skills/rfp/document-fetch/instructions.md first.' };
    }
    if (AGENCY_ANSWERS.test(text) && !REWRITE.test(text)) {
      return { ...base, action: 'answer', about: 'agency-answers', rfp: rfpOut(rfp),
        note: `The agency's answers to questions. If they pasted or forwarded the answers, use those. Otherwise read every file in "answerFiles" (the saved documents that look like a Q&A or addendum) before answering, never the scoring notes alone; if there are none, follow skills/rfp/document-refresh/instructions.md to check for new ones. When "questions" has what we asked, match the answers to them by number and say which were answered and which weren't. Lead with anything that changes scope, dates, budget or what the proposal must include.${rfp ? ` If a date moved, offer \`rfp dates ${rfp.slug}\`.` : ' Ask which RFP they mean if it is not clear.'}` };
    }
    if (CAPABILITY_ASKED.test(text) && CAPABILITY_STATUS.test(text) && !REWRITE.test(text) && !/^(write|draft|do|make|build|run|create)\b/.test(text)) {
      return { ...base, action: 'answer', about: 'capability', rfp: rfpOut(rfp),
        note: `About a capability check already given. Answer from "capability": each row's latest answer with who gave it and when, the rows still unanswered, and the engineers' words as recorded. Quote their words; never turn "adjacent" or "not answered" into a yes.${rfp ? ` When "capability" is null, say no check was written here and offer \`rfp capability ${rfp.slug}\`. If they are passing on a new answer, follow the skill's "Recording answers" (\`rfp capability ${rfp.slug}\`).` : ' Ask which RFP they mean.'}` };
    }
    if (QUESTIONS_ASKED.test(text) && !REWRITE.test(text)) {
      return { ...base, action: 'answer', about: 'questions', rfp: rfpOut(rfp),
        note: `What was asked of the agency. Answer from "questions": the questions ISA last gave and the day it gave them, word for word. ISA doesn't know whether or when they were sent, or whether the sender edited them, so say "the questions I wrote on <date>", never "we asked" or "we sent".${rfp ? ` When "questions" is null, say none were written here and offer \`rfp questions ${rfp.slug}\`.` : ' Ask which RFP they mean.'}` };
    }
    if (ASK_FIRST.test(text) && !WRITE.test(text)) {
      return { ...base, action: 'answer', rfp: rfpOut(rfp),
        note: "The RFPs this week's results say to ask the agency about before deciding: entries whose `agencyQuestion` is set, with the question and `agencyQuestionBy`, the day to ask by. Answer from this week's results as skills/rfp/INDEX.md says under 'Scoring and filtering'. To write the email with that question, offer `rfp questions <rfp>`." };
    }
    if (RESCORE.test(text)) {
      return { ...base, action: 'rescore', rfp: rfpOut(rfp),
        note: 'Follow "Rescoring one RFP" in skills/rfp/INDEX.md: run rfp-rescore.mjs <slug> first and show the before and after; never run the weekly job.' };
    }
    if (RESULTS.test(text) && !ranked.length) {
      return { ...base, action: 'answer', rfp: rfpOut(rfp),
        note: 'Answer from this week\'s results as skills/rfp/INDEX.md says under "Scoring and filtering". Never run the weekly job to answer.' };
    }
  }

  const kind = structured?.kind || (LIST.test(text) && !ranked.length ? 'list' : null);
  if (kind === 'list') return { ...base, action: 'list', command: 'node scripts/rfp-stage.mjs list', note: 'Answer from its output, using phase names.' };
  const skill = structured?.kind === 'skill' ? structured.skill : ranked[0]?.skill || null;
  const moveAsked = structured?.kind === 'move' || (!structured && MOVE.test(text) && (phaseIn(text) || !skill));

  if (moveAsked) {
    if (!rfp) return { ...base, ...askWhichRfp(pick.ambiguous, item => `rfp move ${item.slug}`) };
    // With no phase named, an RFP in Phase 1 goes to Phase 2: that is the Friday offer.
    const target = (structured?.kind === 'move' ? structured.phase : phaseIn(text)) || (rfp.phase === 1 ? 2 : null);
    if (!target) {
      const options = [1, 2, 3, 4].filter(phase => phase !== rfp.phase);
      return { ...base, action: 'ask-which-phase', rfp: rfpOut(rfp),
        choices: options.map((phase, index) => ({ n: index + 1, phase, command: `rfp move ${rfp.slug} ${MOVE_WORDS[phase - 1]} --choice ${index + 1}` })),
        say: [`${rfp.title} is in ${phaseName(rfp.phase)}. Move it to:`, ...options.map((phase, index) => `${index + 1}. ${phaseName(phase)}: \`rfp move ${rfp.slug} ${MOVE_WORDS[phase - 1]}\``)].join('\n') };
    }
    if (target === rfp.phase) return { ...base, action: 'already', rfp: rfpOut(rfp), say: `${rfp.title} is already in ${phaseName(target)}. Nothing moved.` };
    // No after-move text here: rfp-stage.mjs prints the new phase's skills itself, so ISA can only
    // offer them once the move has really happened.
    return { ...base, action: 'move', rfp: rfpOut(rfp), toPhase: target, toPhaseName: phaseName(target), command: moveCommand(rfp, target, structured?.choice),
      note: 'Run the command with their name in --by and the words of their message that asked for the move between the RFP_REPLY_END lines, exactly as they wrote them (a reply like "1" or "yes" stays just that). It moves only when those words ask for a move. Pass on what it prints in plain words: that it moved, then any skill list it prints, word for word. If it refuses, pass on its reason and do what it says. Never say it moved otherwise.' };
  }

  if (skill) {
    if (!rfp) return { ...base, skill: skillOut(skill), ...askWhichRfp(pick.ambiguous, item => commandFor(skill, item)) };
    const stay = structured?.stay || STAY.test(text);
    // The submission email is written before the proposal goes in, so it never asks about a move
    // first; its skill asks about Submitted once the proposal has been sent.
    const later = skill.phase && rfp.phase < skill.phase && skill.id !== 'submission-email';
    const reportsAnswer = skill.id === 'capability-check' && CAPABILITY_REPORT.test(text);
    if (reportsAnswer) {
      return { ...base, action: 'run-skill', skill: skillOut(skill), rfp: rfpOut(rfp), mode: 'record-answer',
        note: `They are passing on an engineer's answer to a capability check. Record it with the skill's "Recording answers" step (\`node scripts/rfp-capability.mjs --rfp ${rfp.slug} --answer\`), with the engineer's words exactly as given here. Don't build a new check. If no check is saved for this RFP, say so and offer to write one.` };
    }
    if (later && !stay) {
      return { ...base, action: 'ask-move', skill: skillOut(skill), rfp: rfpOut(rfp), toPhase: skill.phase,
        choices: [
          { n: 1, text: `Move it to ${phaseName(skill.phase)}, then do it`, command: `rfp move ${rfp.slug} ${MOVE_WORDS[skill.phase - 1]} --choice 1`, then: commandFor(skill, rfp) },
          { n: 2, text: `Do it and leave it in ${phaseName(rfp.phase)}`, command: commandFor(skill, rfp, ' --stay') },
        ],
        say: [`"${skill.label}" is a ${phaseName(skill.phase)} skill, and ${rfp.title} is in ${phaseName(rfp.phase)}. Want me to move it first?`,
          `1. Move it to ${phaseName(skill.phase)}, then do it: \`rfp move ${rfp.slug} ${MOVE_WORDS[skill.phase - 1]}\``,
          `2. Do it and leave it in ${phaseName(rfp.phase)}: \`${commandFor(skill, rfp, ' --stay')}\``].join('\n') };
    }
    return { ...base, action: 'run-skill', skill: skillOut(skill), rfp: rfpOut(rfp),
      note: `Open ${skill.file} and follow it for this RFP. Don't do it from memory. Read the RFP's saved documents with the commands in "documents" (by number, never by file name), and never ask the person for a document that is already saved.${rfp.folder ? '' : ' The RFP has no folder yet; the skill says where its documents go.'}`,
      alternatives: ranked.slice(1, 3).filter(item => item.score >= ranked[0].score - 2).map(item => skillOut(item.skill)) };
  }

  if (structured?.kind === 'offer' || OFFER.test(text)) {
    if (!rfp) return { ...base, ...askWhichRfp(pick.ambiguous, item => `rfp skills ${item.slug}`) };
    return { ...base, action: 'offer', rfp: rfpOut(rfp), say: phaseOffer(skills, rfp, rfp.phase, '') };
  }
  if (rfp && !structured && DATE_QUESTION.test(text)) {
    return { ...base, action: 'answer', rfp: rfpOut(rfp), about: 'dates',
      note: `A question about dates. Answer from "dates" when it is there: those were read from the documents, with weekdays and time zones already worked out. Otherwise read the documents with the commands in "documents" and answer with the file and page. Never give a date from the HigherGov listing or the scoring metadata. If they want the dates on their calendar, offer \`rfp dates ${rfp.slug}\`.` };
  }
  if (rfp) {
    return { ...base, action: 'answer', rfp: rfpOut(rfp),
      note: 'No skill asked for. Answer from the RFP files as skills/rfp/INDEX.md says under "Scoring and filtering".' };
  }
  return { ...base, action: 'none', note: 'No RFP or RFP skill found in the message. Answer normally, or ask which RFP they mean.' };
}

// A person's message never goes on the command line: quotes, `$(…)` or backticks in it would be
// run by the shell. ISA passes it on standard input through a quoted heredoc, which the shell
// leaves alone. Arguments are only for the commands the router itself writes (`route`), which
// hold nothing but command words and RFP slugs.
async function readStdin() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main(args = process.argv.slice(2)) {
  const message = (args.length ? args.join(' ') : await readStdin()).trim();
  if (!message) {
    process.stderr.write("Usage: node scripts/rfp-route.mjs <<'RFP_MESSAGE_END'\n<the person's message>\nRFP_MESSAGE_END\n   or: node scripts/rfp-route.mjs \"rfp <command> <slug>\"\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(await routeRequest(message), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Routing failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
