#!/usr/bin/env node
// Rescores one RFP from this week's report with the current scoring code, and on request
// puts the new result in the week's report. Used when a scoring fix lands mid-week: on
// November 13, City of Laguna Beach's website redesign was held back by a Gate 2a misread
// fixed the next day, and the only way to correct the report was to re-run the whole week.
//
//   node scripts/rfp-rescore.mjs <slug> [--date YYYY-MM-DD] [--drive-folder <link or ID>]
//   node scripts/rfp-rescore.mjs <slug> --apply
//
// Step 1 scores the RFP and saves the result as pending; nothing else changes. Step 2 writes
// that pending result, with no new model call, so what was shown is what is applied.
//
// What it does: the same listing and full-text scoring calls as the Friday job, from the
// listing in candidate.md and the documents already saved in the RFP's resources/ folder.
// What it never does: download documents, read the agency posting, create Drive folders,
// look up HubSpot, or send the pursue email or a Telegram message. The week's email and
// Telegram records are kept as they were.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDocuments, auditRecord } from './rfp-audit.mjs';
import { buildResults, plainOutcome, renderMarkdown, reportEntry } from './rfp-report.mjs';
import { createModelOutageGuard } from './rfp-scoring-judgment.mjs';
import {
  cleanName, driveFolderUrl, extractManifestEvidence, findLocalResourcesDir, incompleteDocumentsState, persistCandidateState,
  preliminaryState, readPortalCandidate, scoreCandidateFromText, scoreMetadataCandidate, shouldFetchDocuments, validatedScoreState,
} from './weekly-rfp-pursue-decision.mjs';

const WORKSPACE = process.env.WORKSPACE_DIR || '/home/azureuser/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'reports', 'new-rfp-qualification');
const CANDIDATES_DIR = path.join(WORKSPACE, 'RFP-pipeline', 'candidates');
const PENDING_DIR = path.join(REPORT_DIR, 'rescore');
const PENDING_VERSION = 1;

class RescoreError extends Error {}

// validatedScoreState()'s full-text fields, emptied.
const STALE_FULL_TEXT = Object.fromEntries(['scored_date', 'scoring_categories', 'scoring_recommendation', 'scoring_reasons', 'scoring_flags',
  'scoring_conditional', 'scoring_judgments', 'scoring_error', 'scoring_error_detail', 'scoring_provenance'].map(key => [key, null]));

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
// Write beside the target and rename, so ISA's chat never reads a half-written report.
async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}

// A folder link or bare folder ID, as the Drive folder URL the report uses.
export function driveFolderLink(value) {
  const text = String(value || '').trim();
  const id = text.match(/\/folders\/([A-Za-z0-9_-]{10,})/)?.[1] || (/^[A-Za-z0-9_-]{10,}$/.test(text) ? text : '');
  if (!id) throw new RescoreError(`"${text}" isn't a Google Drive folder link or ID.`);
  return driveFolderUrl(id);
}

// The Friday job replaces latest.json and clears every candidate file when it starts, so a
// rescore must not run alongside it. Linux only (the VM); elsewhere there is nothing to check.
async function weeklyJobRunning() {
  const ids = await fs.readdir('/proc').catch(() => []);
  for (const id of ids.filter(name => /^\d+$/.test(name) && Number(name) !== process.pid)) {
    const command = await fs.readFile(`/proc/${id}/cmdline`, 'utf8').catch(() => '');
    if (command.includes('weekly-rfp-pursue-decision.mjs') || command.includes('run-new-rfp-qualification-cron.sh')) return true;
  }
  return false;
}

// A pick's score; an RFP that wasn't picked shows none. Its rankScore is only what it could
// reach (Laguna's "78 if the agency says yes"), and printing it read as a real score.
const side = (entry, plain = plainOutcome(entry)) => ({ tier: entry.tier, reason: entry.reason || null, decision: plain.decision,
  score: ['strong', 'worth'].includes(entry.tier) ? entry.score ?? entry.rankScore ?? null : null, why: plain.why });

/**
 * Step 1: score one RFP from the given week's results and save the outcome as pending.
 * `results` is that week's results file. Returns the pending record. Writes only the
 * pending file; scoring errors write nothing.
 */
export async function rescore({ slug, results, runDate, driveFolder = '', outage = createModelOutageGuard() }) {
  const before = results.entries.find(entry => entry.slug === slug);
  if (!before) throw new RescoreError(`${slug} isn't in the ${results.runDate} report.`);
  const candidatePath = path.join(CANDIDATES_DIR, slug, 'candidate.md');
  const candidate = await readPortalCandidate(candidatePath).catch(() => {
    throw new RescoreError(`${slug} has no candidate file. The Friday job clears them each week, so only this week's RFPs can be rescored.`);
  });
  const named = { ...candidate, title: cleanName(candidate.title || slug), issuer: cleanName(candidate.issuer || '') };

  const preliminary = await scoreMetadataCandidate(candidate, runDate, outage);
  if (preliminary.preview?.scoring_error) {
    throw new RescoreError(`The listing scoring failed (${preliminary.preview.scoring_error}). Nothing changed; try again later.`);
  }
  const updates = [preliminaryState(preliminary)];
  let final = null;
  let documentStatus = 'metadata-only';
  let posting = null;
  let documents = null;
  // The same order as the Friday job: documents only for a listing that would have fetched them.
  if (preliminary.status !== 'insufficient-metadata' && shouldFetchDocuments(preliminary.preview)) {
    const resourcesDir = await findLocalResourcesDir(slug);
    const manifest = resourcesDir
      ? await readJson(path.join(resourcesDir, '_document-manifest.json')).catch(() => null) : null;
    if (!manifest) {
      throw new RescoreError(`${slug} has no saved documents, and a rescore doesn't download them. Nothing changed.`);
    }
    posting = manifest.posting || null;
    const extracted = await extractManifestEvidence(manifest, resourcesDir, { rfp: { number: candidate.frontmatter?.rfp_number || '', title: named.title } });
    if (!extracted.completeness.complete) {
      documentStatus = extracted.completeness.status;
      updates.push(incompleteDocumentsState({ preliminaryScore: preliminary.score, documentStatus, resourcesDir }));
      documents = auditDocuments(documentStatus, extracted.manifest, posting);
    } else {
      final = await scoreCandidateFromText({ candidate, runDate, documents: extracted.documents, completeness: extracted.completeness, outage });
      if (final.scoring_error) throw new RescoreError(`The full-text scoring failed (${final.scoring_error}). Nothing changed; try again later.`);
      documentStatus = 'full-text';
      documents = auditDocuments('full-text', extracted.manifest, posting);
      updates.push(validatedScoreState({ preliminaryScore: preliminary.score, result: final,
        manifestPath: path.join(resourcesDir, '_document-manifest.json'), runDate }));
    }
  }

  // Candidate updates merge into the file. When the rescore stops before the full text, the
  // Friday run's full-text fields would otherwise stay, and ISA's chat reads them.
  if (!final) updates.push(STALE_FULL_TEXT);

  const after = reportEntry({ candidate: named, preliminary, final, documentStatus, posting,
    // Kept from the Friday run: a rescore never creates Drive folders or reads HubSpot.
    hubspotDeal: before.hubspotDeal || '', documentsLink: driveFolder || before.links?.documents || '' });
  const pending = {
    version: PENDING_VERSION, slug, resultsRunDate: results.runDate, week: results.week, scoredOn: runDate, scoredAt: new Date().toISOString(),
    before: side(before), after: side(after), entry: after, candidateUpdates: updates,
    audit: auditRecord({ run: { date: results.runDate, week: results.week }, entry: after, candidate, preliminary: preliminary.preview, final, documents }),
  };
  await fs.mkdir(PENDING_DIR, { recursive: true });
  await writeAtomic(path.join(PENDING_DIR, `${slug}.json`), `${JSON.stringify(pending, null, 2)}\n`);
  return pending;
}

/**
 * Step 2: put a pending rescore in its week's results (JSON and Markdown, and latest.* when
 * that is still the same run), its candidate file, and the week's rescore audit file.
 */
export async function applyRescore({ slug, at = new Date().toISOString() }) {
  const pendingFile = path.join(PENDING_DIR, `${slug}.json`);
  const pending = await readJson(pendingFile).catch(() => {
    throw new RescoreError(`There is no pending rescore for ${slug}. Run it without --apply first.`);
  });
  if (pending.version !== PENDING_VERSION) throw new RescoreError(`The pending rescore for ${slug} is from an older version of this script; rescore it again.`);
  const resultsFile = path.join(REPORT_DIR, `${pending.resultsRunDate}.json`);
  const results = await readJson(resultsFile);
  const index = results.entries.findIndex(entry => entry.slug === slug);
  if (index === -1) throw new RescoreError(`${slug} is no longer in the ${pending.resultsRunDate} report. Nothing changed.`);

  const entries = results.entries.map((entry, i) => (i === index ? pending.entry : entry));
  const rebuilt = buildResults({ runDate: results.runDate, week: results.week, entries });
  const rescores = [...(results.rescores || []).filter(item => item.slug !== slug),
    { slug, title: pending.entry.title, at, scoredOn: pending.scoredOn, before: pending.before, after: pending.after }];
  // Everything else in the file, the email and Telegram records included, stays as the Friday run wrote it.
  const updated = { ...results, total: rebuilt.total, counts: rebuilt.counts, entries: rebuilt.entries, rescores };
  const json = `${JSON.stringify(updated, null, 2)}\n`;
  const markdown = renderMarkdown(updated);
  await writeAtomic(resultsFile, json);
  await writeAtomic(path.join(REPORT_DIR, `${results.runDate}.md`), markdown);
  const latest = await readJson(path.join(REPORT_DIR, 'latest.json')).catch(() => null);
  if (latest?.runDate === results.runDate) {
    await writeAtomic(path.join(REPORT_DIR, 'latest.json'), json);
    await writeAtomic(path.join(REPORT_DIR, 'latest.md'), markdown);
  }

  // The candidate file is gone once a later Friday run has started; the report still updates.
  const candidatePath = path.join(CANDIDATES_DIR, slug, 'candidate.md');
  if (await fs.access(candidatePath).then(() => true, () => false)) {
    for (const update of pending.candidateUpdates) await persistCandidateState(candidatePath, update);
  }
  // A separate file, so the week's audit keeps one line per listing as the Friday run wrote it.
  const auditDir = path.join(REPORT_DIR, 'audit');
  await fs.mkdir(auditDir, { recursive: true });
  await fs.appendFile(path.join(auditDir, `${results.runDate}-rescores.jsonl`),
    `${JSON.stringify({ ...pending.audit, rescore: { at, scoredOn: pending.scoredOn, before: pending.before } })}\n`, 'utf8');
  await fs.rm(pendingFile, { force: true });
  return { ...pending, updatedLatest: latest?.runDate === results.runDate };
}

const describe = item => `${item.decision}${Number.isFinite(item.score) ? `, ${item.score}` : ''}. ${item.why}`.trim();

async function main(args = process.argv.slice(2)) {
  const option = name => {
    const index = args.indexOf(name);
    return index === -1 ? '' : args.splice(index, 2)[1] || '';
  };
  const apply = args.includes('--apply');
  if (apply) args.splice(args.indexOf('--apply'), 1);
  const runDate = option('--date') || new Date().toISOString().slice(0, 10);
  const driveFolder = option('--drive-folder');
  const report = option('--report');
  const [slug, ...extra] = args;
  if (!slug || extra.length || !/^[a-z0-9][a-z0-9-]*$/.test(slug) || !/^\d{4}-\d{2}-\d{2}$/.test(runDate) || (report && !/^\d{4}-\d{2}-\d{2}$/.test(report))) {
    throw new RescoreError('Usage: node scripts/rfp-rescore.mjs <slug> [--date YYYY-MM-DD] [--report YYYY-MM-DD] [--drive-folder <link or ID>] [--apply]');
  }
  if (await weeklyJobRunning()) throw new RescoreError('The Friday RFP job is running. Try again when it has finished.');

  if (apply) {
    const done = await applyRescore({ slug });
    process.stdout.write([
      `${done.entry.title}: the ${done.resultsRunDate} report now shows ${describe(done.after)}`,
      `Before: ${describe(done.before)}`,
      done.updatedLatest ? '' : `latest.json is a later week, so only the ${done.resultsRunDate} files changed.`,
      'Nothing was emailed or posted.',
    ].filter(Boolean).join('\n') + '\n');
    return;
  }
  const results = await readJson(path.join(REPORT_DIR, report ? `${report}.json` : 'latest.json')).catch(() => {
    throw new RescoreError(`There is no ${report || 'latest'} results file.`);
  });
  const pending = await rescore({ slug, results, runDate, driveFolder: driveFolder ? driveFolderLink(driveFolder) : '' });
  process.stdout.write([
    `${pending.entry.title}, rescored ${runDate}:`,
    `Before (${results.runDate} report): ${describe(pending.before)}`,
    `After: ${describe(pending.after)}`,
    `Nothing has changed yet. To put this in the report, run: node scripts/rfp-rescore.mjs ${slug} --apply`,
    'Nothing is emailed or posted either way.',
  ].join('\n') + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof RescoreError ? error.message : `Rescore failed: ${error.stack || error}`}\n`);
    process.exitCode = 1;
  });
}
