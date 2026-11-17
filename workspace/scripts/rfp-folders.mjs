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
