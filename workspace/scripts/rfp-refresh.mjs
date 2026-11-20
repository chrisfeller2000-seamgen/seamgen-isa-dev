#!/usr/bin/env node
// Checks the RFPs Seamgen is working on for new documents and deadline changes, saves new
// documents beside the originals, and uploads them to the RFP's Drive folder.
//
//   node scripts/rfp-refresh.mjs <slug>        one RFP, on request in chat; no Telegram
//   node scripts/rfp-refresh.mjs <slug> --drive  also uploads saved documents Drive lacks,
//                                              such as a file someone sent ISA from a portal
//   node scripts/rfp-refresh.mjs --scheduled   every RFP in Shortlisted and Building;
//                                              Tuesday cron (run-rfp-refresh-cron.sh)
//
// The scheduled run posts one Telegram message to the sales group only when something
// changed: a new or re-issued document, or a moved due date. A quiet week sends nothing.
// RFP_REFRESH_DELIVERY=preview checks and downloads but uploads and sends nothing.
//
// Why: agencies amend RFPs by adding documents to the same listing or by extending the
// deadline. HigherGov records an amendment as a new version of the opportunity (same
// opp_key), and its document list belongs to the opportunity, not the version. Its document
// records have no ID, so documents are matched by file name and size.
//
// Never: overwrites or deletes a saved document, replaces or deletes anything in Drive,
// reads agency portals (a person signs in for those), or emails anyone.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listDocumentRecords, listOpportunityVersions, saveDocumentRecord, writeDocumentManifestJson, writeDocumentManifestMarkdown,
} from './highergov-document-flow.mjs';
import { STAGES, findRfpFolders, rfpsDir, workspaceDir } from './rfp-folders.mjs';
import { weeklyJobRunning } from './rfp-rescore.mjs';
import { cleanName, driveFolderUrl, mirrorLocalResourcesToDrive, readPortalCandidate, resolveRfpFolderId } from './weekly-rfp-pursue-decision.mjs';

export const REFRESH_FILE = '_refresh.json';
const SCHEDULED_STAGES = ['2-intermediate-stage', '3-building'];
const TELEGRAM_TARGET = process.env.TELEGRAM_TARGET || '-1003890997073';
class RefreshError extends Error {}

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exists = target => fs.access(target).then(() => true, () => false);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const docKey = name => clean(name).toLowerCase();
const day = value => clean(value).slice(0, 10);
async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}

// "2026-11-30" → "November 30, 2026", for the Telegram message.
export function plainDate(value) {
  const match = day(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return clean(value) || 'unknown';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

/**
 * Sorts HigherGov's document list against what is already saved. `known` is
 * [{ name, size }]. A listed file whose name is saved with a different size was re-issued;
 * a size HigherGov leaves out counts as the same file, so nothing is downloaded twice.
 */
export function diffDocuments(known, records) {
  const sizes = new Map();
  for (const doc of known) {
    const key = docKey(doc.name);
    if (key) sizes.set(key, [...(sizes.get(key) || []), Number(doc.size) || 0]);
  }
  const added = [];
  const updated = [];
  const listed = new Set();
  for (const record of records) {
    const key = docKey(record.file_name || record.name || record.title);
    if (!key) continue;
    listed.add(key);
    const size = Number.parseInt(record.file_size || record.size || '0', 10) || 0;
    const saved = sizes.get(key);
    if (!saved) added.push(record);
    else if (size && !saved.includes(size) && !saved.includes(0)) updated.push(record);
  }
  const removed = [...sizes.keys()].filter(key => !listed.has(key))
    .map(key => known.find(doc => docKey(doc.name) === key).name);
  return { added, updated, removed };
}

// A name for a downloaded file that never replaces a saved one. A re-issued document is
// marked with the day it was found, so both versions stay and Drive (which keeps the first
// file of a name) gets the new one too.
export async function freeName(dir, fileName, { reissued = false, on = '' } = {}) {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  const base = reissued ? `${stem}-updated-${on}` : stem;
  for (let n = 1; ; n += 1) {
    const candidate = `${base}${n === 1 ? '' : `-${n}`}${ext}`;
    if (!(await exists(path.join(dir, candidate)))) return candidate;
  }
}

// What the RFP is and how to find it on HigherGov, from the files a move and the Friday job
// leave in its folder.
async function describeRfp(dir, slug) {
  const candidate = await readPortalCandidate(path.join(dir, 'candidate.md')).catch(() => null);
  const manifest = await readJson(path.join(dir, 'resources', '_document-manifest.json')).catch(() => null);
  const stage = await readJson(path.join(dir, '_stage.json')).catch(() => null);
  const front = candidate?.frontmatter || {};
  return {
    title: cleanName(front.title || '') || stage?.title || manifest?.candidate_title || slug,
    issuer: cleanName(front.agency_name || ''),
    oppKey: clean(manifest?.opp_key || front.opp_key),
    versionKey: clean(manifest?.version_key || front.version_key),
    dueDate: day(front.due_date || front.response_deadline || ''),
    manifest,
  };
}

// The RFP's Drive folder: the ID saved by an earlier refresh, else the link a Friday report
// gave it, else found or made by name under Favorable RFP's (the Friday job's rule). The ID
// is then kept, so later uploads don't depend on matching folder names.
async function driveFolderFor({ slug, info, state, workspace, gog }) {
  if (state.driveFolder?.id) return state.driveFolder.id;
  const reports = path.join(workspace, 'reports', 'new-rfp-qualification');
  const files = (await fs.readdir(reports).catch(() => [])).filter(name => /^\d{4}-\d{2}-\d{2}(-\d+)?\.json$/.test(name)).sort().reverse();
  for (const name of files) {
    const results = await readJson(path.join(reports, name)).catch(() => null);
    const link = results?.entries?.find(entry => entry.slug === slug)?.links?.documents || '';
    const id = link.match(/\/folders\/([A-Za-z0-9_-]{10,})/)?.[1];
    if (id) return id;
  }
  return resolveRfpFolderId(info.issuer, info.title, slug, { gog });
}

/**
 * Checks one RFP folder against HigherGov, saves anything new, and (unless `preview`)
 * uploads the agency documents Drive doesn't have. Returns what changed; writes
 * _refresh.json and the document manifest only when the check succeeded.
 */
export async function refreshRfp({ slug, dir, stage, apiKey, workspace = workspaceDir(), gog, preview = false, drive = false, announce = false, now = new Date() }) {
  const today = now.toISOString().slice(0, 10);
  const info = await describeRfp(dir, slug);
  const result = { slug, title: info.title, stage: stage.dir, stageLabel: stage.label, added: [], updated: [], removed: [], notDownloaded: [],
    dueBefore: null, dueAfter: null, newVersion: null, drive: null, error: null };
  // A key can also come from the Friday run matching a forwarded RFP's listing (_refresh.json).
  const statePath = path.join(dir, REFRESH_FILE);
  const saved = await readJson(statePath).catch(() => null);
  const oppKey = info.oppKey || clean(saved?.oppKey);
  if (!oppKey) {
    result.error = 'No HigherGov listing key is saved for this RFP, so it can only be checked by hand. Recording its agency and solicitation number lets the Friday run recognize its listing if it reaches HigherGov.';
    return result;
  }
  const state = saved || {
    version: 1, slug, oppKey, versionKey: info.versionKey, dueDate: info.dueDate || null,
    documents: (info.manifest?.documents || []).filter(row => row.source !== 'posting' && row.downloaded !== false)
      .map(row => ({ name: row.source_file_name || row.local_file_name, size: row.size_bytes || 0, localFile: row.local_file_name || '' })),
    history: [],
  };

  const versions = await listOpportunityVersions({ apiKey, oppKey });
  const latest = versions[0];
  if (!latest) {
    result.error = 'HigherGov no longer lists this opportunity.';
    return result;
  }
  const records = latest.document_path ? await listDocumentRecords({ apiKey, documentPath: latest.document_path }) : [];
  const diff = diffDocuments(state.documents, records);
  result.removed = diff.removed;
  const due = day(latest.due_date);
  if (due && state.dueDate && due !== state.dueDate) Object.assign(result, { dueBefore: state.dueDate, dueAfter: due });
  if (clean(latest.version_key) && clean(latest.version_key) !== state.versionKey) result.newVersion = day(latest.captured_date);

  // A preview is a dry run: it says what it would download and saves, uploads and records nothing.
  if (preview) {
    result.added = diff.added.map(record => clean(record.file_name || record.name || record.title));
    result.updated = diff.updated.map(record => clean(record.file_name || record.name || record.title));
    return result;
  }

  // Download into a working folder, then move each file in under a name that replaces nothing.
  const resourcesDir = path.join(dir, 'resources');
  const staging = path.join(resourcesDir, `.refresh-${process.pid}`);
  const savedRows = [];
  await fs.mkdir(staging, { recursive: true });
  try {
    const pending = [...diff.added.map(record => ({ record, reissued: false })), ...diff.updated.map(record => ({ record, reissued: true }))];
    for (const [i, { record, reissued }] of pending.entries()) {
      const name = clean(record.file_name || record.name || record.title);
      const row = await saveDocumentRecord({ apiKey, record, resourcesDir: staging, index: state.documents.length + i })
        .catch(error => ({ downloaded: false, document_status: 'failed', reason: error?.message }));
      // A file HigherGov lists but won't hand over (portal-gated, say) is tried again each
      // week, but reported only the first time, so it doesn't trigger a message every Tuesday.
      if (!row.downloaded) {
        if (!(state.unavailable || []).includes(docKey(name))) {
          result.notDownloaded.push(name);
          state.unavailable = [...(state.unavailable || []), docKey(name)];
        }
        continue;
      }
      state.unavailable = (state.unavailable || []).filter(key => key !== docKey(name));
      const finalName = await freeName(resourcesDir, path.basename(row.local_path), { reissued, on: today });
      const finalPath = path.join(resourcesDir, finalName);
      await fs.rename(row.local_path, finalPath);
      savedRows.push({ ...row, local_file_name: finalName, local_path: finalPath, added_by_refresh: today, ...(reissued ? { reissued: true } : {}) });
      (reissued ? result.updated : result.added).push(name);
      state.documents.push({ name, size: row.size_bytes || 0, localFile: finalName });
    }
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }

  // The document manifest lists the new files too, so a rescore reads them.
  if (savedRows.length) {
    const manifest = info.manifest || { candidate_slug: slug, candidate_title: info.title, version_key: clean(latest.version_key), opp_key: oppKey,
      captured_date: day(latest.captured_date), highergov_page: clean(latest.path), source_path: clean(latest.source_path), documents: [] };
    manifest.documents = [...(manifest.documents || []), ...savedRows];
    manifest.refreshed_utc = now.toISOString();
    await writeDocumentManifestJson(resourcesDir, manifest);
    await writeDocumentManifestMarkdown(resourcesDir, manifest);
  }

  // Drive gets the new documents straight away; the whole agency set goes up if the folder is new.
  // Uploads that failed last time are tried again, so a Drive outage doesn't leave files behind.
  const lastEntry = (state.history || []).at(-1);
  const retryDrive = Boolean(lastEntry?.driveFailed?.length);
  if (savedRows.length || drive || retryDrive) {
    try {
      const folderId = await driveFolderFor({ slug, info, state, workspace, gog });
      if (!folderId) throw new Error('Could not find or create the Drive folder.');
      state.driveFolder = { id: folderId, url: driveFolderUrl(folderId) };
      const mirror = await mirrorLocalResourcesToDrive(folderId, slug, { gog, resourcesDir, log: '[rfp-refresh]' });
      result.drive = { url: state.driveFolder.url, uploaded: mirror.uploaded, failed: mirror.failed };
    } catch (error) {
      const pendingFiles = savedRows.length ? savedRows.map(row => row.local_file_name) : (lastEntry?.driveFailed || []);
      result.drive = { url: state.driveFolder?.url || null, uploaded: [], failed: pendingFiles, error: error?.message || String(error) };
      process.stderr.write(`[rfp-refresh] ${slug}: Drive upload failed: ${result.drive.error}\n`);
    }
  } else if (state.driveFolder?.url) {
    result.drive = { url: state.driveFolder.url, uploaded: [], failed: [] };
  }

  if (retryDrive && !savedRows.length && result.drive) lastEntry.driveFailed = result.drive.failed;
  state.versionKey = clean(latest.version_key) || state.versionKey;
  state.dueDate = due || state.dueDate;
  state.checkedAt = now.toISOString();
  // A change the scheduled run has to announce stays `notified: false` until the Telegram
  // message has gone out, so a run that dies (or can't reach Telegram) after recording it
  // still announces it on the retry. A check asked for in chat is answered there.
  if (changed(result) || result.newVersion) {
    state.history = [...(state.history || []), { at: now.toISOString(), versionCaptured: day(latest.captured_date), dueBefore: result.dueBefore,
      dueAfter: result.dueAfter, added: result.added, updated: result.updated, removed: result.removed, notDownloaded: result.notDownloaded,
      uploaded: result.drive?.uploaded || [], driveFailed: result.drive?.failed || [], notified: !(announce && changed(result)) }];
  }
  await writeAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return result;
}

// Worth a message: a document someone should read, or a moved deadline.
export const changed = result => Boolean(result.added.length || result.updated.length || result.notDownloaded.length || result.dueAfter);

const list = names => names.join(', ');
/** The Tuesday message, or '' when nothing changed. Built by code; ISA writes none of it. */
export function refreshMessage(results) {
  const updates = results.filter(changed);
  if (!updates.length) return '';
  const lines = ['RFP updates from this morning\'s document check:', ''];
  for (const result of updates) {
    const parts = [];
    if (result.dueAfter) parts.push(`the due date moved from ${plainDate(result.dueBefore)} to ${plainDate(result.dueAfter)}`);
    if (result.added.length) parts.push(`${result.added.length} new document${result.added.length === 1 ? '' : 's'} (${list(result.added)})`);
    if (result.updated.length) parts.push(`re-issued: ${list(result.updated)}`);
    if (result.notDownloaded.length) parts.push(`listed but couldn't be downloaded: ${list(result.notDownloaded)}`);
    let where = '';
    const savedNew = result.added.length + result.updated.length;
    if (savedNew && result.drive?.url && !result.drive.failed?.length) where = ` Documents: ${result.drive.url}`;
    else if (savedNew && result.drive?.url) where = ` Some files didn't upload to Drive (${list(result.drive.failed)}); ask me for them. Folder: ${result.drive.url}`;
    else if (savedNew) where = ' They couldn\'t be uploaded to Drive; ask me for the files.';
    else if (result.drive?.url) where = ` Documents: ${result.drive.url}`;
    lines.push(`• ${result.title} (${result.stageLabel}): ${parts.join('; ')}.${where}`);
  }
  const unchecked = results.filter(result => result.error);
  if (unchecked.length) lines.push('', `Couldn't check: ${list(unchecked.map(result => result.title))}.`);
  lines.push('', 'Ask me to go through any of these.');
  return lines.join('\n');
}

function defaultSend(text) {
  return new Promise((resolve, reject) => {
    execFile('openclaw', ['message', 'send', '--channel', 'telegram', '--target', TELEGRAM_TARGET, '--message', text], { timeout: 45000 },
      error => (error ? reject(error) : resolve()));
  });
}

/**
 * The Tuesday run: every RFP in Shortlisted and Building. Writes
 * reports/rfp-refresh/<date>.json and latest.json, and sends the message only when
 * something changed. One RFP failing to check doesn't stop the others.
 */
// Everything recorded for one RFP and not yet announced, as one message item: the earliest
// due date before and the latest after, and every file named once.
export function pendingItem(state, meta) {
  const entries = (state?.history || []).filter(entry => entry.notified === false);
  if (!entries.length) return null;
  const all = key => [...new Set(entries.flatMap(entry => entry[key] || []))];
  const moves = entries.filter(entry => entry.dueAfter);
  const failed = entries.at(-1).driveFailed || [];
  return { ...meta, added: all('added'), updated: all('updated'), notDownloaded: all('notDownloaded'),
    dueBefore: moves[0]?.dueBefore || null, dueAfter: moves.at(-1)?.dueAfter || null,
    drive: state.driveFolder?.url || failed.length ? { url: state.driveFolder?.url || null, failed } : null };
}

export async function runScheduled({ apiKey, workspace = workspaceDir(), gog, send = defaultSend, preview = false, now = new Date() }) {
  const results = [];
  const checked = [];
  for (const stage of STAGES.filter(item => SCHEDULED_STAGES.includes(item.dir))) {
    const dir = path.join(rfpsDir(workspace), stage.dir);
    const slugs = (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const slug of slugs) {
      const result = await refreshRfp({ slug, dir: path.join(dir, slug), stage, apiKey, workspace, gog, preview, announce: true, now }).catch(error => ({
        slug, title: slug, stage: stage.dir, stageLabel: stage.label, added: [], updated: [], removed: [], notDownloaded: [], error: error?.message || String(error),
      }));
      if (result.error) process.stderr.write(`[rfp-refresh] ${slug}: ${result.error}\n`);
      results.push(result);
      checked.push({ statePath: path.join(dir, slug, REFRESH_FILE), meta: { slug, title: result.title, stageLabel: stage.label } });
    }
  }
  // The message covers every change not yet announced, this week's and any an earlier run
  // recorded but couldn't send.
  const pending = [];
  for (const { statePath, meta } of checked) {
    const state = await readJson(statePath).catch(() => null);
    const item = pendingItem(state, meta);
    if (item) pending.push({ statePath, state, item });
  }
  // A preview records nothing, so its message is built from what it found this run.
  const items = preview ? results.filter(result => !result.error) : pending.map(entry => entry.item);
  const text = refreshMessage([...items, ...results.filter(result => result.error)]);
  const telegram = { status: 'not sent: nothing changed', text: text || null };
  if (text && preview) telegram.status = 'not sent: preview';
  else if (text) {
    try {
      await send(text);
      telegram.status = 'sent';
      for (const { statePath, state } of pending) {
        state.history = state.history.map(entry => (entry.notified === false ? { ...entry, notified: true, notifiedAt: now.toISOString() } : entry));
        await writeAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`);
      }
    } catch (error) {
      telegram.status = 'failed';
      telegram.error = clean(error?.message || error);
    }
  }
  const report = { runDate: now.toISOString().slice(0, 10), checkedAt: now.toISOString(), preview, results, telegram };
  const reportDir = path.join(workspace, 'reports', 'rfp-refresh');
  await fs.mkdir(reportDir, { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeAtomic(path.join(reportDir, `${report.runDate}.json`), json);
  await writeAtomic(path.join(reportDir, 'latest.json'), json);
  return report;
}

function describe(result) {
  if (result.error) return `${result.title}: not checked. ${result.error}`;
  const lines = [`${result.title} (${result.stageLabel}):`];
  if (result.dueAfter) lines.push(`- Due date moved from ${plainDate(result.dueBefore)} to ${plainDate(result.dueAfter)} (HigherGov).`);
  if (result.added.length) lines.push(`- New: ${list(result.added)}`);
  if (result.updated.length) lines.push(`- Re-issued (saved beside the old copy): ${list(result.updated)}`);
  if (result.notDownloaded.length) lines.push(`- Listed but not downloaded: ${list(result.notDownloaded)}`);
  if (result.removed.length) lines.push(`- No longer listed on HigherGov (kept here): ${list(result.removed)}`);
  if (!changed(result)) lines.push('- Nothing new since the last check.');
  if (result.drive?.uploaded?.length) lines.push(`- Uploaded to Drive: ${list(result.drive.uploaded)}`);
  if (result.drive?.failed?.length) lines.push(`- Not uploaded to Drive: ${list(result.drive.failed)}${result.drive.error ? ` (${result.drive.error})` : ''}`);
  if (result.drive?.url) lines.push(`- Drive folder: ${result.drive.url}`);
  return lines.join('\n');
}

async function main(args = process.argv.slice(2)) {
  const apiKey = process.env.HIGHERGOV_API_KEY || '';
  const preview = String(process.env.RFP_REFRESH_DELIVERY || '').toLowerCase() === 'preview';
  if (!apiKey) throw new RefreshError('HIGHERGOV_API_KEY is not set.');
  if (await weeklyJobRunning()) throw new RefreshError('The Friday RFP job is running. Try again when it has finished.');
  if (args.length === 1 && args[0] === '--scheduled') {
    const report = await runScheduled({ apiKey, preview });
    process.stdout.write(`Checked ${report.results.length} RFP${report.results.length === 1 ? '' : 's'}. Telegram: ${report.telegram.status}.\n`);
    // An unsent message fails the run, so the cron wrapper tries again; the changes stay
    // marked as not yet announced until a send works.
    if (report.telegram.status === 'failed') throw new RefreshError(`The Telegram message wasn't sent: ${report.telegram.error}`);
    return;
  }
  const drive = args.includes('--drive');
  const [slug, ...extra] = args.filter(arg => arg !== '--drive');
  if (!slug || extra.length || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new RefreshError('Usage: node scripts/rfp-refresh.mjs <slug> [--drive]\n       node scripts/rfp-refresh.mjs --scheduled');
  }
  const folders = await findRfpFolders(slug);
  if (!folders.length) throw new RefreshError(`There is no folder for ${slug}. Nothing changed.`);
  if (folders.length > 1) throw new RefreshError(`${slug} has folders in ${folders.map(item => item.stage.dir).join(' and ')}. Ask a developer to merge them. Nothing changed.`);
  const [{ stage, dir }] = folders;
  const result = await refreshRfp({ slug, dir, stage, apiKey, preview, drive });
  process.stdout.write(`${describe(result)}\nNothing was posted to Telegram.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof RefreshError ? error.message : `Refresh failed: ${error.stack || error}`}\n`);
    process.exitCode = 1;
  });
}
