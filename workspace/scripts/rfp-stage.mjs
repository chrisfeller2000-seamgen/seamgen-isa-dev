#!/usr/bin/env node
// Moves one RFP's folder between the stage tiers, and lists the RFPs Seamgen is working on.
// ISA runs it in chat only when someone asks ("move Laguna Beach to building"), so the tier an
// RFP sits in always reflects a person's decision. Nothing moves automatically.
//
//   node scripts/rfp-stage.mjs list
//   node scripts/rfp-stage.mjs <slug> <tier> --by "<name>" [--choice <n>] [--note "<why>"] [--agency ..] [--number ..] [--title ..] --said <<'RFP_REPLY_END'
//   <the person's exact words>
//   RFP_REPLY_END
//   node scripts/rfp-stage.mjs <slug> --agency "<agency>" --number "<solicitation number>" --by "<name>"
//
// A move needs the person's own words (`--said`, on standard input like every message ISA
// passes on) and moves only when they ask for one. In local tests on November 24, 2026, ISA
// answered "2" ("do it and leave it in Phase 1") by building its own `rfp move` command, and the
// RFP moved without anyone's yes (3 of 5 runs). `--choice` is the number of the move choice in
// ISA's own question; a reply that is a different number is refused.
//
// The agency and solicitation number matter for an RFP with no HigherGov key (one a teammate
// forwarded): they are how the Friday run recognizes its listing if it reaches HigherGov.
//
// Tiers: 1 Scored (1-pre-submission), 2 Shortlisted (2-intermediate-stage),
// 3 Building (3-building), 4 Submitted (4-submitted). Moving back to 1 means nobody is working
// on it any more.
//
// A move renames RFPs/<tier>/<slug>/ as a whole, so resources/ and every deliverable travel
// together. It keeps a copy of this week's candidate.md beside them, because the Friday job
// clears RFP-pipeline/candidates/ each week and the scoring would otherwise be lost, and it
// appends the move to the folder's _stage.json. It never deletes documents, touches Drive or
// HubSpot, or sends anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, findRfpFolders, findStage, rfpsDir, workspaceDir } from './rfp-folders.mjs';
import { weeklyJobRunning } from './rfp-rescore.mjs';
import { loadSkills, phaseOffer } from './rfp-route.mjs';
import { cleanName, readPortalCandidate } from './weekly-rfp-pursue-decision.mjs';

export const STAGE_FILE = '_stage.json';
class StageError extends Error {}

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const candidatePath = (slug, workspace) => path.join(workspace, 'RFP-pipeline', 'candidates', slug, 'candidate.md');
const exists = target => fs.access(target).then(() => true, () => false);
async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}

/**
 * Moves the RFP to `to` (a tier from findStage) and records who asked. Returns
 * { title, from, to, dir, created }. `from` is null when the RFP had no folder yet: an RFP whose
 * documents were never saved (a portal login, say) gets one, as long as this week's candidate
 * file exists to say what it is.
 */
// Whether a HigherGov key is known for the RFP in `dir`. Without one, the Friday run can only
// recognize its listing from the agency and solicitation number recorded here.
async function hasHigherGovKey(dir) {
  const refresh = await readJson(path.join(dir, '_refresh.json')).catch(() => null);
  const manifest = await readJson(path.join(dir, 'resources', '_document-manifest.json')).catch(() => null);
  const candidate = await fs.readFile(path.join(dir, 'candidate.md'), 'utf8').catch(() => '');
  return Boolean(refresh?.oppKey || manifest?.opp_key || /^opp_key:\s*"?[^"\s]/m.test(candidate));
}

/**
 * Records an RFP's title, agency and solicitation number in its _stage.json without moving it.
 * They let the Friday run recognize a forwarded RFP's listing if it reaches HigherGov.
 */
export async function updateDetails({ slug, by, title = '', agency = '', number = '', at = new Date().toISOString(), workspace = workspaceDir() }) {
  const folders = await findRfpFolders(slug, { workspace });
  if (!folders.length) throw new StageError(`There is no folder for ${slug}. Nothing changed.`);
  if (folders.length > 1) throw new StageError(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them. Nothing changed.`);
  const [{ dir, stage }] = folders;
  const record = await readJson(path.join(dir, STAGE_FILE)).catch(() => ({ slug, history: [] }));
  const updated = { ...record, slug, stage: record.stage || stage.dir, ...(title ? { title } : {}), ...(agency ? { agency } : {}), ...(number ? { number } : {}),
    details: [...(record.details || []), { at, by, ...(title ? { title } : {}), ...(agency ? { agency } : {}), ...(number ? { number } : {}) }] };
  await writeAtomic(path.join(dir, STAGE_FILE), `${JSON.stringify(updated, null, 2)}\n`);
  return { title: updated.title || slug, agency: updated.agency || '', number: updated.number || '', stage, hasKey: await hasHigherGovKey(dir) };
}

export async function moveRfp({ slug, to, by, note = '', title: givenTitle = '', agency = '', number = '', at = new Date().toISOString(), workspace = workspaceDir() }) {
  const folders = await findRfpFolders(slug, { workspace });
  if (folders.length > 1) {
    throw new StageError(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them. Nothing changed.`);
  }
  const [current] = folders;
  if (current?.stage.dir === to.dir) throw new StageError(`${slug} is already in ${to.label} (${to.dir}). Nothing changed.`);

  const candidateFile = candidatePath(slug, workspace);
  const hasCandidate = await exists(candidateFile);
  if (!current && !hasCandidate) {
    throw new StageError(`There is no folder for ${slug} and no candidate file this week. Check the slug in latest.json. Nothing changed.`);
  }

  const target = path.join(rfpsDir(workspace), to.dir, slug);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (current) await fs.rename(current.dir, target);
  else await fs.mkdir(target, { recursive: true });

  // This week's scoring travels with the folder; once the candidate file is cleared, the copy
  // from the last move stays.
  if (hasCandidate) await fs.copyFile(candidateFile, path.join(target, 'candidate.md'));
  const record = await readJson(path.join(target, STAGE_FILE)).catch(() => ({ slug, history: [] }));
  const candidate = hasCandidate ? await readPortalCandidate(candidateFile).catch(() => null) : null;
  const title = givenTitle || cleanName(candidate?.title || '') || record.title || slug;
  const updated = {
    ...record, slug, title, stage: to.dir,
    ...((agency || record.agency || candidate?.issuer) ? { agency: agency || record.agency || cleanName(candidate.issuer) } : {}),
    ...((number || record.number) ? { number: number || record.number } : {}),
    history: [...(record.history || []), { at, from: current?.stage.dir || null, to: to.dir, by, ...(note ? { note } : {}) }],
  };
  await writeAtomic(path.join(target, STAGE_FILE), `${JSON.stringify(updated, null, 2)}\n`);
  return { title, from: current?.stage || null, to, dir: target, created: !current, agency: updated.agency || '', number: updated.number || '',
    hasKey: await hasHigherGovKey(target) };
}

/** The RFPs in tiers 2–4, latest tier first, plus how many sit in tier 1. */
export async function listStages({ workspace = workspaceDir() } = {}) {
  const tiers = [];
  for (const stage of STAGES.slice(1).reverse()) {
    const dir = path.join(rfpsDir(workspace), stage.dir);
    const names = (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const rfps = [];
    for (const slug of names) {
      const record = await readJson(path.join(dir, slug, STAGE_FILE)).catch(() => null);
      const last = record?.history?.at(-1) || null;
      const documents = (await fs.readdir(path.join(dir, slug, 'resources')).catch(() => [])).filter(name => !name.startsWith('_')).length;
      rfps.push({ slug, title: record?.title || slug, movedAt: last?.at || null, movedBy: last?.by || null, note: last?.note || null, documents });
    }
    tiers.push({ stage, rfps });
  }
  const scored = (await fs.readdir(path.join(rfpsDir(workspace), STAGES[0].dir), { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory()).length;
  return { tiers, scored };
}

function renderList({ tiers, scored }) {
  const lines = [];
  for (const { stage, rfps } of tiers) {
    lines.push(`${stage.label} (${stage.dir}): ${rfps.length || 'none'}`);
    for (const rfp of rfps) {
      const moved = rfp.movedAt ? `moved ${rfp.movedAt.slice(0, 10)}${rfp.movedBy ? ` by ${rfp.movedBy}` : ''}` : 'no move recorded';
      lines.push(`- ${rfp.title} [${rfp.slug}]: ${moved}; ${rfp.documents} document${rfp.documents === 1 ? '' : 's'}${rfp.note ? `. ${rfp.note}` : ''}`);
    }
  }
  lines.push(`Scored (1-pre-submission): ${scored} RFP folder${scored === 1 ? '' : 's'}.`);
  return `${lines.join('\n')}\n`;
}

const normalizeReply = text => String(text || '').toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const MOVE_WORDS = /\b(move|moving|moved|shortlist|shortlisted|promote|advance|bump|push it|phase [1-4]|scored|building|submitted|looking closer)\b/;
const NOT_MOVE = /\b(dont|do not|not|never|no need to|stop|cancel|hold off on|wait to) (move|moving|shortlist|promote|advance|bump|push)\b|\b(keep|leave) it (where|in|at|as)\b|\bstay(s)? (where|in|put)\b|\b(without|instead of) moving\b/;
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|sounds good|lets do it|correct|absolutely|definitely|y)\b/;
const NO = /^(no|nope|nah|not yet|not now|n)\b/;

/**
 * Whether the person's own words ask for this move. `choice` is the number of the move choice
 * in ISA's question, when it asked one. Returns { ok } or { ok: false, reason } with what ISA
 * should do instead. Pure.
 */
export function replyAllowsMove(said, { choice = null } = {}) {
  const text = normalizeReply(said);
  if (!text) return { ok: false, reason: 'A move needs their exact words on standard input (--said). Nothing moved.' };
  const picked = text.match(/^(?:option |choice |number |the )?([1-9])(?:st|nd|rd|th)?(?: one| option| please)?$/)?.[1]
    || text.match(/^(?:the )?(first|second|third|fourth)(?: one| option)?$/)?.[1];
  if (picked) {
    const number = Number(picked) || ['first', 'second', 'third', 'fourth'].indexOf(picked) + 1;
    if (choice !== null && number === Number(choice)) return { ok: true };
    return { ok: false, reason: choice === null
      ? `They answered "${said.trim()}", a choice number. Run the \`route\` written next to choice ${number} in your own question. Nothing moved.`
      : `They picked choice ${number}, and the move is choice ${choice}. Run the \`route\` written next to choice ${number} in your own question instead. Nothing moved.` };
  }
  if (NOT_MOVE.test(text) || NO.test(text)) return { ok: false, reason: `They said "${said.trim()}", which doesn't ask for a move. Nothing moved.` };
  if (MOVE_WORDS.test(text)) return { ok: true };
  if (YES.test(text) && (choice === null || Number(choice) === 1)) return { ok: true };
  return { ok: false, reason: `"${said.trim()}" doesn't ask for a move. Ask them whether to move it, and move it only on their yes. Nothing moved.` };
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const USAGE = 'Usage: node scripts/rfp-stage.mjs list\n'
  + '       node scripts/rfp-stage.mjs <slug> <1|2|3|4|scored|shortlisted|building|submitted> --by "<name>" [--choice <n>] [--note "<why>"] [--agency "<agency>"] [--number "<solicitation number>"] [--title "<title>"] --said <<\'RFP_REPLY_END\'\n'
  + '       <the person\'s exact words>\n'
  + '       RFP_REPLY_END\n'
  + '       node scripts/rfp-stage.mjs <slug> --agency "<agency>" --number "<solicitation number>" [--title "<title>"] --by "<name>"';

async function main(args = process.argv.slice(2)) {
  const option = name => {
    const index = args.indexOf(name);
    return index === -1 ? '' : args.splice(index, 2)[1] || '';
  };
  if (args.length === 1 && args[0] === 'list') {
    process.stdout.write(renderList(await listStages()));
    return;
  }
  const by = option('--by').trim();
  const note = option('--note').trim();
  const choice = option('--choice').trim() || null;
  const saidAt = args.indexOf('--said');
  if (saidAt !== -1) args.splice(saidAt, 1);
  const details = { title: option('--title').trim(), agency: option('--agency').trim(), number: option('--number').trim() };
  const [slug, tier, ...extra] = args;
  const to = findStage(tier);
  const detailsOnly = !tier && Object.values(details).some(Boolean);
  if (!slug || (!to && !detailsOnly) || extra.length || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new StageError(USAGE);
  if (!by) throw new StageError(`Say who asked for the ${detailsOnly ? 'change' : 'move'} with --by "<name>". Nothing changed.`);
  // The Friday job saves documents into these folders while it runs; a move mid-run could
  // split an RFP's documents between two tiers.
  if (await weeklyJobRunning()) throw new StageError('The Friday RFP job is running. Try again when it has finished.');
  // An RFP with no HigherGov key (a forwarded one) is recognized on Friday only by these.
  const reminder = item => (item.hasKey || (item.agency && item.number) ? []
    : [`It has no HigherGov listing key, so the Friday run can only recognize its listing by agency and solicitation number. Add them from its documents: node scripts/rfp-stage.mjs ${slug} --agency "<agency>" --number "<solicitation number>" --by "<name>"`]);

  if (detailsOnly) {
    const done = await updateDetails({ slug, by, ...details });
    process.stdout.write([`${done.title} (${done.stage.label}): agency "${done.agency || 'not recorded'}", solicitation number "${done.number || 'not recorded'}".`,
      `Recorded as asked by ${by}.`, ...reminder(done)].join('\n') + '\n');
    return;
  }
  const said = saidAt === -1 ? '' : await readStdin();
  const allowed = replyAllowsMove(said, { choice });
  if (!allowed.ok) throw new StageError(allowed.reason);
  const moved = await moveRfp({ slug, to, by, note, ...details });
  process.stdout.write([
    moved.from
      ? `${moved.title} moved from ${moved.from.label} to ${moved.to.label}.`
      : `${moved.title} is now in ${moved.to.label}. It had no folder yet, so its documents were never saved.`,
    `Recorded as asked by ${by}.`,
    ...(moved.to.dir === STAGES[0].dir ? [] : reminder(moved)),
    'Nothing was deleted, uploaded or sent.',
    ...await nextSkills(moved, slug),
  ].join('\n') + '\n');
}

// After a move into Phase 2, 3 or 4, the new phase's skills, which ISA passes on as printed. They
// come from this script rather than the router so ISA can only offer them once a move has really
// happened: in local tests on November 18, 2026 ISA twice sent the router's after-move text
// without running the move. The line before the list is for ISA: in later runs it sometimes sent
// only "Which one?", as if the person could see this output. A workspace without skills/rfp/
// prints nothing more.
export const RELAY_LINE = "Send them the move and this list word for word; they can't see this output:";
async function nextSkills(moved, slug) {
  const phase = STAGES.indexOf(moved.to) + 1;
  if (phase < 2) return [];
  const skills = await loadSkills();
  if (!skills.length) return [];
  return ['', RELAY_LINE, phaseOffer(skills, { slug, title: moved.title }, phase, '')];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof StageError ? error.message : `Move failed: ${error.stack || error}`}\n`);
    process.exitCode = 1;
  });
}
