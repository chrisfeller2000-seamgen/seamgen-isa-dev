#!/usr/bin/env node
// Moves one RFP's folder between the stage tiers, and lists the RFPs Seamgen is working on.
// ISA runs it in chat only when someone asks ("move Laguna Beach to building"), so the tier an
// RFP sits in always reflects a person's decision. Nothing moves automatically.
//
//   node scripts/rfp-stage.mjs list
//   node scripts/rfp-stage.mjs <slug> <tier> --by "<name>" [--note "<why>"] [--agency ..] [--number ..] [--title ..]
//   node scripts/rfp-stage.mjs <slug> --agency "<agency>" --number "<solicitation number>" --by "<name>"
//
// The agency and solicitation number matter for an RFP with no HigherGov key (one a teammate
// forwarded): they are how the Friday run recognizes its listing if it reaches HigherGov.
//
// Tiers: 1 Scored (1-pre-submission), 2 Looking closer (2-intermediate-stage),
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

const USAGE = 'Usage: node scripts/rfp-stage.mjs list\n'
  + '       node scripts/rfp-stage.mjs <slug> <1|2|3|4|scored|looking|building|submitted> --by "<name>" [--note "<why>"] [--agency "<agency>"] [--number "<solicitation number>"] [--title "<title>"]\n'
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
  const moved = await moveRfp({ slug, to, by, note, ...details });
  process.stdout.write([
    moved.from
      ? `${moved.title} moved from ${moved.from.label} to ${moved.to.label}.`
      : `${moved.title} is now in ${moved.to.label}. It had no folder yet, so its documents were never saved.`,
    `Recorded as asked by ${by}.`,
    ...(moved.to.dir === STAGES[0].dir ? [] : reminder(moved)),
    'Nothing was deleted, uploaded or sent.',
  ].join('\n') + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof StageError ? error.message : `Move failed: ${error.stack || error}`}\n`);
    process.exitCode = 1;
  });
}
