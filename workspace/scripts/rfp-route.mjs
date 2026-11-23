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

/**
 * Every RFP ISA could mean: each folder in the four phases, plus this week's results (an RFP
 * there may have no folder yet). Titles come from _stage.json, candidate.md or latest.json.
 */
export async function loadRfps({ workspace = workspaceDir() } = {}) {
  const bySlug = new Map();
  for (const [index, stage] of STAGES.entries()) {
    for (const slug of await listDirs(path.join(rfpsDir(workspace), stage.dir))) {
      const dir = path.join(rfpsDir(workspace), stage.dir, slug);
      const record = await readJson(path.join(dir, '_stage.json')).catch(() => null);
      const candidate = record?.title ? '' : await fs.readFile(path.join(dir, 'candidate.md'), 'utf8').catch(() => '');
      const existing = bySlug.get(slug);
      // Two copies of one RFP: the later phase wins here; rfp-stage.mjs refuses to move it anyway.
      if (!existing || existing.phase < index + 1) {
        bySlug.set(slug, { slug, title: record?.title || titleFrom(candidate) || existing?.title || slug, phase: index + 1, folder: true });
      }
    }
  }
  const latest = await readJson(path.join(workspace, 'reports', 'new-rfp-qualification', 'latest.json')).catch(() => null);
  for (const entry of latest?.entries || []) {
    if (!entry?.slug) continue;
    const known = bySlug.get(entry.slug);
    if (known) {
      if (known.title === entry.slug && entry.title) known.title = entry.title;
      known.thisWeek = entry.tier || true;
    } else {
      bySlug.set(entry.slug, { slug: entry.slug, title: entry.title || entry.slug, phase: 1, folder: false, thisWeek: entry.tier || true });
    }
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

/** The RFP the message names: a slug, or the title words that set it apart from the others. */
export function matchRfps(message, rfps) {
  const text = normalize(message);
  const exact = rfps.filter(rfp => containsPhrase(text, normalize(rfp.slug)) || containsPhrase(text, normalize(rfp.title)));
  if (exact.length === 1) return [{ rfp: exact[0], score: 100 }];
  const said = new Set(words(message));
  const frequency = new Map();
  const titleWords = rfps.map(rfp => new Set([...words(rfp.title), ...words(rfp.slug)].filter(word => !GENERIC_TITLE.has(word) && word.length > 2)));
  for (const set of titleWords) for (const word of set) frequency.set(word, (frequency.get(word) || 0) + 1);
  const scored = [];
  rfps.forEach((rfp, index) => {
    let score = 0;
    for (const word of titleWords[index]) if (said.has(word)) score += 1 / frequency.get(word);
    if (score) scored.push({ rfp, score: exact.includes(rfp) ? score + 10 : score });
  });
  return scored.sort((a, b) => b.score - a.score);
}

const STAY = /\b(keep it (where|in|at)|leave it (where|in|at)|dont move|do not move|without moving|stay(s)? (where|in))\b|--stay\b/;
const LIST = /\bworking on\b|\bin progress\b|\bour rfps\b|\blist (the |our |all )?rfps\b|\bwhich rfps (are|did) we\b|\bwhats in (phase|shortlisted|looking|building)\b|\bwhat is in (phase|shortlisted|looking|building)\b/;
// Requests that sound like a skill but aren't one. Taken from real chats on the VM (July–October 2026).
const RETIRED = /\bmeeting brief\b/;
// Asking ISA to write a pursue email. The Friday job writes and sends it, so the chat skill was
// retired on November 23, 2026. Questions about the sent email ("what did the pursue email say")
// don't match and are still answered from its record.
const PURSUE_DRAFT = /\b(write|draft|create|generate|prepare|compose|make|redo|rewrite)( me| us| up)?( a| an| the| another| new| our)* pursue email\b|\bpursue email draft\b/;
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
    const parts = rest.split(/\s+/);
    const last = parts.at(-1) || '';
    const target = findStage(last) ? STAGES.indexOf(findStage(last)) + 1 : null;
    return { kind: 'move', name: target ? parts.slice(0, -1).join(' ') : rest, phase: target };
  }
  const skill = skills.find(item => item.command === verb);
  if (skill) return { kind: 'skill', skill, name: rest, stay };
  return { kind: 'unknown', verb };
}

const commandFor = (skill, rfp, extra = '') => `rfp ${skill.command} ${rfp.slug}${extra}`;
const moveCommand = (rfp, phase) => `node scripts/rfp-stage.mjs ${rfp.slug} ${MOVE_WORDS[phase - 1]} --by "<their name>"`;
const rfpOut = rfp => (rfp ? { slug: rfp.slug, title: rfp.title, phase: rfp.phase, phaseName: phaseName(rfp.phase), hasFolder: rfp.folder } : null);
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

function chooseRfp(message, rfps, structuredName) {
  const ranked = matchRfps(structuredName || message, rfps);
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
    say: ['Which RFP do you mean?', ...ambiguous.map((rfp, index) => `${index + 1}. ${rfp.title} (${phaseName(rfp.phase)}): \`${nextCommand(rfp)}\``)].join('\n'),
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
  // An answer carries the key dates already recorded, so ISA doesn't work weekdays out itself.
  if (decision.rfp && decision.action === 'answer') {
    decision.dates = await recordedDates(decision.rfp.slug, { workspace: options.workspace, now: options.now }) || null;
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
    : chooseRfp(message, rfps, structured?.name);
  const rfp = pick.rfp;
  const ranked = structured?.kind === 'skill' ? [] : matchSkills(message, skills);

  // "No, keep it where it is. Just do the checklist." names no RFP: it answers ISA's last question.
  if (!structured && !rfp && !pick.ambiguous.length && (REPLY.test(text) || STAY.test(text))) return needsContext;

  if (!structured) {
    if (RETIRED.test(text)) {
      return { ...base, action: 'retired', rfp: rfpOut(rfp),
        say: 'The meeting brief was retired in October. The Friday pursue email has the summary, fit, blockers and key dates; I can also do an engineering brief or the agency questions. Which would help?' };
    }
    if (PURSUE_DRAFT.test(text)) {
      return { ...base, action: 'retired', rfp: rfpOut(rfp),
        say: "I send the pursue email on my own after Friday's scoring, for that week's Strong Pursue RFPs, and after a rescore once someone confirms it, so there's no draft to write. I can tell you what this week's email said, or do an engineering brief or the agency questions. Which would help?" };
    }
    // "Send me a calendar file" is the calendar skill, not an agency document.
    if (SHARE.test(text) && !/\b(calendar|ics|invites?)\b/.test(text)) {
      return { ...base, action: 'share-documents', rfp: rfpOut(rfp),
        note: 'Attach the saved file from the RFP\'s resources/ folder, as skills/rfp/INDEX.md says under "Documents". If it isn\'t saved yet, follow skills/rfp/document-fetch/instructions.md first.' };
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
        choices: options.map((phase, index) => ({ n: index + 1, phase, command: `rfp move ${rfp.slug} ${MOVE_WORDS[phase - 1]}` })),
        say: [`${rfp.title} is in ${phaseName(rfp.phase)}. Move it to:`, ...options.map((phase, index) => `${index + 1}. ${phaseName(phase)}: \`rfp move ${rfp.slug} ${MOVE_WORDS[phase - 1]}\``)].join('\n') };
    }
    if (target === rfp.phase) return { ...base, action: 'already', rfp: rfpOut(rfp), say: `${rfp.title} is already in ${phaseName(target)}. Nothing moved.` };
    // No after-move text here: rfp-stage.mjs prints the new phase's skills itself, so ISA can only
    // offer them once the move has really happened.
    return { ...base, action: 'move', rfp: rfpOut(rfp), toPhase: target, toPhaseName: phaseName(target), command: moveCommand(rfp, target),
      note: 'Run the command with their name in --by. Pass on what it prints in plain words: that it moved, then any skill list it prints, word for word. If it refuses, pass on its reason. Never say it moved otherwise.' };
  }

  if (skill) {
    if (!rfp) return { ...base, skill: skillOut(skill), ...askWhichRfp(pick.ambiguous, item => commandFor(skill, item)) };
    const stay = structured?.stay || STAY.test(text);
    // The submission email is written before the proposal goes in, so it never asks about a move
    // first; its skill asks about Submitted once the proposal has been sent.
    const later = skill.phase && rfp.phase < skill.phase && skill.id !== 'submission-email';
    if (later && !stay) {
      return { ...base, action: 'ask-move', skill: skillOut(skill), rfp: rfpOut(rfp), toPhase: skill.phase,
        choices: [
          { n: 1, text: `Move it to ${phaseName(skill.phase)}, then do it`, command: `rfp move ${rfp.slug} ${MOVE_WORDS[skill.phase - 1]}`, then: commandFor(skill, rfp) },
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
