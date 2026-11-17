// Where an RFP's folder lives. Every RFP whose documents the Friday job saves starts in
// RFPs/1-pre-submission/<slug>/. People then move the ones Seamgen is working on into the later
// tiers through scripts/rfp-stage.mjs, so the folder an RFP sits in records a decision someone
// made. HubSpot's RFP pipeline was checked for this on November 17, 2026 and doesn't record it
// (no deal in "Qualified RFP" or "Response submitted", no deal created since August 20).
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_WORKSPACE = '/home/azureuser/.openclaw/workspace';

// The folder names are the ones the skills and Sync-RfpToDrive.ps1 already use; only the
// labels are new. `aliases` are the words ISA may pass for each tier.
export const STAGES = [
  { dir: '1-pre-submission', label: 'Scored', aliases: ['1', 'scored', 'pre-submission'] },
  { dir: '2-intermediate-stage', label: 'Looking closer', aliases: ['2', 'looking', 'looking-closer', 'intermediate', 'intermediate-stage'] },
  { dir: '3-building', label: 'Building', aliases: ['3', 'building', 'writing'] },
  { dir: '4-submitted', label: 'Submitted', aliases: ['4', 'submitted'] },
];

export const workspaceDir = () => process.env.WORKSPACE_DIR || DEFAULT_WORKSPACE;
export const rfpsDir = (workspace = workspaceDir()) => path.join(workspace, 'RFPs');

// A tier by folder name, label or alias ("3", "building", "3-building"), or null.
export function findStage(value) {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return STAGES.find(stage => stage.dir === key || stage.label.toLowerCase().replace(/\s+/g, '-') === key || stage.aliases.includes(key)) || null;
}

const isDirectory = target => fs.stat(target).then(stat => stat.isDirectory(), () => false);

/**
 * Every tier that holds a folder for this slug, latest tier first. More than one means two
 * copies, which the move script refuses to guess between.
 */
export async function findRfpFolders(slug, { workspace = workspaceDir() } = {}) {
  const found = [];
  for (const stage of [...STAGES].reverse()) {
    const dir = path.join(rfpsDir(workspace), stage.dir, slug);
    if (await isDirectory(dir)) found.push({ stage, dir });
  }
  return found;
}

// The RFP's existing resources/ folder in any tier (latest tier first), or ''.
export async function findLocalResourcesDir(slug, { workspace = workspaceDir() } = {}) {
  for (const { dir } of await findRfpFolders(slug, { workspace })) {
    const resources = path.join(dir, 'resources');
    if (await isDirectory(resources)) return resources;
  }
  return '';
}

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

/**
 * The RFPs someone is working on (Looking closer, Building, Submitted), by HigherGov
 * opp_key: Map<oppKey, { slug, title, stage, dir }>. The Friday job uses it to leave a new
 * version of one of these alone. An amendment is a new HigherGov version, which the Friday
 * intake hasn't seen, so before November 17, 2026 it would have been scored again as a new
 * RFP, re-downloaded under the Friday job's file names, and could reach the pursue email again.
 */
export async function rfpsInProgress({ workspace = workspaceDir() } = {}) {
  return (await scanRfpsInProgress({ workspace })).byOpp;
}

const frontValue = (text, key) => String(text.match(new RegExp(`^${key}:\\s*"?([^"\\n]*?)"?\\s*$`, 'm'))?.[1] || '').trim();

/**
 * The RFPs in tiers 2–4, split by whether a HigherGov key is known. `byOpp` is the map above.
 * `keyless` lists the rest (an RFP a teammate forwarded, say) with the title, agency and
 * solicitation number recorded when it was moved, so the Friday run can recognize its
 * listing if it ever reaches HigherGov. HigherGov's API has no keyword or solicitation-number
 * search (its `source_id` is the posting site's internal ID), so matching happens when the
 * listing arrives.
 */
export async function scanRfpsInProgress({ workspace = workspaceDir() } = {}) {
  const byOpp = new Map();
  const keyless = [];
  for (const stage of STAGES.slice(1)) {
    const tierDir = path.join(rfpsDir(workspace), stage.dir);
    const slugs = (await fs.readdir(tierDir, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory()).map(entry => entry.name);
    for (const slug of slugs) {
      const dir = path.join(tierDir, slug);
      const refresh = await readJson(path.join(dir, '_refresh.json')).catch(() => null);
      const manifest = await readJson(path.join(dir, 'resources', '_document-manifest.json')).catch(() => null);
      const candidate = await fs.readFile(path.join(dir, 'candidate.md'), 'utf8').catch(() => '');
      const record = await readJson(path.join(dir, '_stage.json')).catch(() => null);
      const title = record?.title || manifest?.candidate_title || frontValue(candidate, 'title') || slug;
      const oppKey = String(refresh?.oppKey || manifest?.opp_key || frontValue(candidate, 'opp_key')).trim();
      if (oppKey) byOpp.set(oppKey, { slug, title, stage, dir });
      else keyless.push({ slug, title, agency: record?.agency || frontValue(candidate, 'agency_name'), number: record?.number || '', stage, dir });
    }
  }
  return { byOpp, keyless };
}

/**
 * Records a HigherGov listing found for an RFP that had no key, in its _refresh.json, so the
 * Tuesday check follows it from then on. The agency documents already saved count as known,
 * so only documents HigherGov has that the folder doesn't are downloaded.
 */
export async function adoptHigherGovKeys(dir, { slug, oppKey, versionKey = '', dueDate = '', captured = '', rule, listingTitle = '', at = new Date().toISOString() }) {
  const file = path.join(dir, '_refresh.json');
  const state = await readJson(file).catch(() => null) || { version: 1, slug, history: [] };
  if (!state.documents) {
    const resources = path.join(dir, 'resources');
    const names = (await fs.readdir(resources, { withFileTypes: true }).catch(() => []))
      .filter(entry => entry.isFile() && !entry.name.startsWith('_') && !entry.name.startsWith('.')).map(entry => entry.name);
    state.documents = await Promise.all(names.map(async name => ({ name, size: (await fs.stat(path.join(resources, name))).size, localFile: name })));
  }
  Object.assign(state, { oppKey, versionKey: versionKey || state.versionKey || '', dueDate: dueDate || state.dueDate || null,
    matched: { at, rule, listingTitle, captured: captured || null } });
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temp, file);
  return state;
}

/**
 * The resources/ folder the Friday job saves an RFP's documents into: the RFP's existing folder
 * in whatever tier it has been moved to, else a new one in 1-pre-submission. Without this, a
 * listing that comes back as a new version (an amendment, say) after the RFP was moved to
 * 3-building would get a second folder in 1-pre-submission, and its new documents would land
 * away from the proposal being written.
 */
export async function resourcesDirForFetch(slug, { workspace = workspaceDir() } = {}) {
  const [existing] = await findRfpFolders(slug, { workspace });
  const resources = path.join(existing ? existing.dir : path.join(rfpsDir(workspace), STAGES[0].dir, slug), 'resources');
  await fs.mkdir(resources, { recursive: true });
  return resources;
}
