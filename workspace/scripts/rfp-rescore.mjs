#!/usr/bin/env node
// Rescores one RFP from this week's report with the current scoring code, and on request
// puts the new result in the week's report. Used when a scoring fix lands mid-week: on
// November 13, City of Laguna Beach's website redesign was held back by a Gate 2a misread
// fixed the next day, and the only way to correct the report was to re-run the whole week.
//
//   node scripts/rfp-rescore.mjs <slug> [--date YYYY-MM-DD] [--drive-folder <link or ID>]
//   node scripts/rfp-rescore.mjs <slug> --apply
//   node scripts/rfp-rescore.mjs <slug> --email
//   node scripts/rfp-rescore.mjs <slug> --send-email [--retry]
//
// Step 1 scores the RFP and saves the result as pending; nothing else changes. Step 2 writes
// that pending result, with no new model call, so what was shown is what is applied.
//
// A rescore can create a Strong Pursue after Friday's email has gone out. For one of those,
// --email writes the normal pursue email and saves it without sending, and --send-email sends
// exactly that saved email once a person has seen it and said yes. An RFP is emailed at most
// once, and the Friday email and Telegram records are never changed.
//
// What it does: the same listing and full-text scoring calls as the Friday job, from the
// listing in candidate.md and the documents already saved in the RFP's resources/ folder.
// What it never does: download documents, read the agency posting, create Drive folders,
// look up HubSpot, or post to Telegram.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDocuments, auditRecord } from './rfp-audit.mjs';
import {
  buildResults, plainOutcome, pursueFacts, renderMarkdown, renderPursueEmail, reportEntry, vibeFrom, writePursueEmail,
} from './rfp-report.mjs';
import { createModelOutageGuard, createOpenClawJudge } from './rfp-scoring-judgment.mjs';
import {
  cleanName, driveFolderUrl, extractManifestEvidence, findLocalResourcesDir, incompleteDocumentsState, persistCandidateState,
  preliminaryState, readPortalCandidate, scoreCandidateFromText, scoreMetadataCandidate, sendPursueMessage, shouldFetchDocuments,
  validatedScoreState,
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
// rescore must not run alongside it on the same workspace. Linux only (the VM); elsewhere
// there is no /proc and nothing to check. Only a job on this workspace counts: a test run
// starts weekly jobs on their own temporary workspaces in parallel, and on November 14 an
// unscoped check refused every rescore test in CI.
export async function weeklyJobRunning({ proc = '/proc', workspace = WORKSPACE, self = process.pid } = {}) {
  const ids = await fs.readdir(proc).catch(() => []);
  for (const id of ids.filter(name => /^\d+$/.test(name) && Number(name) !== self)) {
    const command = await fs.readFile(path.join(proc, id, 'cmdline'), 'utf8').catch(() => '');
    if (!command.includes('weekly-rfp-pursue-decision.mjs') && !command.includes('run-new-rfp-qualification-cron.sh')) continue;
    // Its workspace, as it resolves its own: WORKSPACE_DIR, else the VM default. A process
    // whose environment can't be read counts as running, to be safe.
    const environ = await fs.readFile(path.join(proc, id, 'environ'), 'utf8').catch(() => null);
    if (environ === null) return true;
    const dir = environ.split('\0').find(item => item.startsWith('WORKSPACE_DIR='))?.slice('WORKSPACE_DIR='.length)
      || '/home/azureuser/.openclaw/workspace';
    if (path.resolve(dir) === path.resolve(workspace)) return true;
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

// Replaces the model's opening line, which is written for a Friday email about "this week".
const RESCORE_EMAIL_INTRO = 'One RFP is newly worth pursuing after a rescore on the full RFP documents.';
const CRON_WRAPPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-new-rfp-qualification-cron.sh');
const emailPendingFile = (reportDir, slug) => path.join(reportDir, 'rescore', `${slug}.email.json`);
// Exists from just before the Gmail call until the send is recorded. A timed-out call may still
// have delivered, so a leftover marker stops a second send until someone has checked the inbox.
const emailSendingFile = (reportDir, slug) => path.join(reportDir, 'rescore', `${slug}.email.sending`);
const splitAddresses = value => String(value || '').split(',').map(address => address.trim()).filter(Boolean);

/**
 * The Friday email's recipients. ISA's chat doesn't get the cron wrapper's environment, so they
 * are read from the wrapper itself rather than kept in a second list that could drift.
 */
export async function pursueRecipients({ env = process.env, wrapper = CRON_WRAPPER } = {}) {
  const text = await fs.readFile(wrapper, 'utf8').catch(() => '');
  const fromWrapper = name => {
    const line = text.split('\n').find(item => item.startsWith(`export ${name}="`)) || '';
    const start = line.indexOf(':-');
    const end = line.lastIndexOf('}"');
    return start === -1 || end === -1 ? '' : line.slice(start + 2, end);
  };
  const to = splitAddresses(env.RFP_EMAIL_TO || fromWrapper('RFP_EMAIL_TO'));
  if (!to.length) throw new RescoreError('No pursue email recipients are set. Nothing was sent.');
  return { to, cc: splitAddresses(env.RFP_EMAIL_CC || fromWrapper('RFP_EMAIL_CC')) };
}

// The RFP's entry in the current report, or a refusal saying why it can't be emailed.
async function emailableEntry(slug, reportDir, { retry = false } = {}) {
  const results = await readJson(path.join(reportDir, 'latest.json')).catch(() => {
    throw new RescoreError('There is no latest results file.');
  });
  const entry = results.entries.find(item => item.slug === slug);
  if (!entry) throw new RescoreError(`${slug} isn't in the current report (${results.runDate}). Nothing was sent.`);
  if (!(results.rescores || []).some(item => item.slug === slug)) throw new RescoreError(`${slug} hasn't been rescored, so the Friday email covers it. Nothing was sent.`);
  if (entry.tier !== 'strong') throw new RescoreError(`${entry.title} isn't a Strong Pursue. Nothing was sent.`);
  if ((results.rescoreEmails || []).some(item => item.slug === slug)) throw new RescoreError(`The pursue email for ${entry.title} already went out. Nothing was sent.`);
  if (['sent', 'already-sent'].includes(results.email?.status) && String(results.email.text || '').includes(entry.title)) {
    throw new RescoreError(`${entry.title} was already in Friday's pursue email. Nothing was sent.`);
  }
  if (!retry && await fs.access(emailSendingFile(reportDir, slug)).then(() => true, () => false)) {
    throw new RescoreError(`An earlier send for ${entry.title} didn't finish and may have gone out. Check the Sales inbox before trying again. Nothing was sent.`);
  }
  return { results, entry };
}

/** Writes the normal pursue email for one rescored Strong Pursue and saves it. Sends nothing. */
export async function prepareRescoreEmail({ slug, complete, vibe, reportDir = REPORT_DIR, recipients = pursueRecipients }) {
  const { results, entry } = await emailableEntry(slug, reportDir);
  const { to, cc } = await recipients();
  const facts = pursueFacts({ ...results, entries: [entry], total: 1 });
  const written = await writePursueEmail(facts, complete, { vibe });
  const message = renderPursueEmail(facts, { ...written.sentences, intro: RESCORE_EMAIL_INTRO });
  const pending = { version: PENDING_VERSION, slug, resultsRunDate: results.runDate, entryJson: JSON.stringify(entry), to, cc,
    writtenBy: written.source, subject: message.subject, text: message.text, html: message.html };
  await fs.mkdir(path.dirname(emailPendingFile(reportDir, slug)), { recursive: true });
  await writeAtomic(emailPendingFile(reportDir, slug), `${JSON.stringify(pending, null, 2)}\n`);
  return pending;
}

/** Sends exactly the saved email, once, and records it in the week's results. */
export async function sendRescoreEmail({ slug, retry = false, preview = false, run, reportDir = REPORT_DIR, at = new Date().toISOString() }) {
  const pending = await readJson(emailPendingFile(reportDir, slug)).catch(() => {
    throw new RescoreError(`There is no saved email for ${slug}. Run it with --email first. Nothing was sent.`);
  });
  const { results, entry } = await emailableEntry(slug, reportDir, { retry });
  if (pending.resultsRunDate !== results.runDate || pending.entryJson !== JSON.stringify(entry)) {
    throw new RescoreError(`${entry.title} changed since this email was written. Run --email again. Nothing was sent.`);
  }
  if (preview) return { ...pending, status: 'preview' };
  const marker = emailSendingFile(reportDir, slug);
  await fs.writeFile(marker, at, { encoding: 'utf8', flag: retry ? 'w' : 'wx' }).catch((error) => {
    if (error.code === 'EEXIST') throw new RescoreError(`Another send for ${entry.title} is in progress or didn't finish. Nothing was sent.`);
    throw error;
  });
  const sent = await sendPursueMessage({ subject: pending.subject, html: pending.html }, { to: pending.to, cc: pending.cc, ...(run ? { run } : {}) });
  if (!sent) {
    throw new RescoreError(`Gmail reported a failure for ${entry.title}, but the email may still have gone out. Check the Sales inbox. Only if it isn't there, run this again with --retry.`);
  }
  const record = { slug, title: entry.title, status: 'sent', sentAt: at, subject: pending.subject, to: pending.to, cc: pending.cc,
    writtenBy: pending.writtenBy, text: pending.text };
  const json = `${JSON.stringify({ ...results, rescoreEmails: [...(results.rescoreEmails || []), record] }, null, 2)}\n`;
  await writeAtomic(path.join(reportDir, `${results.runDate}.json`), json);
  await writeAtomic(path.join(reportDir, 'latest.json'), json);
  await fs.rm(emailPendingFile(reportDir, slug), { force: true });
  await fs.rm(marker, { force: true });
  return { ...pending, status: 'sent' };
}

const describe = item => `${item.decision}${Number.isFinite(item.score) ? `, ${item.score}` : ''}. ${item.why}`.trim();

async function main(args = process.argv.slice(2)) {
  const option = name => {
    const index = args.indexOf(name);
    return index === -1 ? '' : args.splice(index, 2)[1] || '';
  };
  const apply = args.includes('--apply');
  if (apply) args.splice(args.indexOf('--apply'), 1);
  const flag = name => {
    const index = args.indexOf(name);
    if (index === -1) return false;
    args.splice(index, 1);
    return true;
  };
  const prepareEmail = flag('--email');
  const sendEmail = flag('--send-email');
  const retry = flag('--retry');
  const runDate = option('--date') || new Date().toISOString().slice(0, 10);
  const driveFolder = option('--drive-folder');
  const report = option('--report');
  const [slug, ...extra] = args;
  const modes = [apply, prepareEmail, sendEmail].filter(Boolean).length;
  if (!slug || extra.length || modes > 1 || (retry && !sendEmail) || !/^[a-z0-9][a-z0-9-]*$/.test(slug) || !/^\d{4}-\d{2}-\d{2}$/.test(runDate) || (report && !/^\d{4}-\d{2}-\d{2}$/.test(report))) {
    throw new RescoreError('Usage: node scripts/rfp-rescore.mjs <slug> [--date YYYY-MM-DD] [--report YYYY-MM-DD] [--drive-folder <link or ID>] [--apply | --email | --send-email [--retry]]');
  }
  if (await weeklyJobRunning()) throw new RescoreError('The Friday RFP job is running. Try again when it has finished.');

  if (prepareEmail) {
    const complete = globalThis[Symbol.for('isa.rfp.testWriter')] || await createOpenClawJudge().catch(() => null);
    const vibe = vibeFrom(await fs.readFile(path.join(WORKSPACE, 'IDENTITY.md'), 'utf8').catch(() => ''));
    const email = await prepareRescoreEmail({ slug, complete, vibe });
    process.stdout.write([
      'This email is ready. Nothing has been sent.',
      `To: ${email.to.join(', ')}`,
      ...(email.cc.length ? [`Cc: ${email.cc.join(', ')}`] : []),
      `Subject: ${email.subject}`,
      '',
      email.text,
      '',
      `After the person says yes to this email, run: node scripts/rfp-rescore.mjs ${slug} --send-email`,
    ].join('\n') + '\n');
    return;
  }
  if (sendEmail) {
    const preview = String(process.env.RFP_DELIVERY || '').toLowerCase() === 'preview';
    const email = await sendRescoreEmail({ slug, retry, preview });
    process.stdout.write(email.status === 'sent'
      ? `Sent the pursue email to ${email.to.join(', ')}: ${email.subject}\n`
      : `Preview mode: nothing was sent. It would go to ${email.to.join(', ')}: ${email.subject}\n`);
    return;
  }
  if (apply) {
    const done = await applyRescore({ slug });
    const canEmail = await emailableEntry(slug, REPORT_DIR).then(() => true, () => false);
    process.stdout.write([
      `${done.entry.title}: the ${done.resultsRunDate} report now shows ${describe(done.after)}`,
      `Before: ${describe(done.before)}`,
      done.updatedLatest ? '' : `latest.json is a later week, so only the ${done.resultsRunDate} files changed.`,
      'Nothing was emailed or posted.',
      canEmail ? `This is a Strong Pursue that hasn't been emailed. To write its pursue email without sending it, run: node scripts/rfp-rescore.mjs ${slug} --email` : '',
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
