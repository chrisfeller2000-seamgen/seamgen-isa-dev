import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A whole Friday run in preview mode where HigherGov has no documents for the portal
// listing, so the job tries its agency posting (devtools/fixtures/weekly-run.mjs).
function weeklyRun(workspaceDir, { scenario, fetchPosting }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import', pathToFileURL(path.join(repoRoot, 'devtools', 'fixtures', 'weekly-run.mjs')).href,
      path.join(repoRoot, 'workspace', 'scripts', 'weekly-rfp-pursue-decision.mjs'),
    ], {
      cwd: repoRoot,
      env: {
        WORKSPACE_DIR: workspaceDir, HIGHERGOV_API_KEY: 'fixture-key', RFP_RUN_DATE: '2026-10-16',
        RFP_INTAKE_REPLAY: '2026-10-08:2026-10-08', RFP_DOCUMENT_FETCH_ENABLED: '1', RFP_DELIVERY: 'preview',
        NO_TELEGRAM: '1', RFP_EMAIL_TO: 'fixture@example.test', TELEGRAM_TARGET: 'fixture',
        ISA_RFP_POSTING_SCENARIO: scenario, ...(fetchPosting ? { RFP_POSTING_FETCH_ENABLED: '1' } : {}),
        PATH: path.dirname(process.execPath),
        ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(stderr) : reject(new Error(stderr || `weekly run exited ${code}`))));
  });
}

async function runScenario(scenario, { fetchPosting = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-posting-run-'));
  try {
    const pipeline = path.join(root, 'RFP-pipeline');
    await fs.mkdir(path.join(root, 'tools'), { recursive: true });
    await fs.mkdir(path.join(pipeline, 'candidates'), { recursive: true });
    await fs.writeFile(path.join(root, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled', pageSize: 25, safetyLagDays: 1, seamgenProfile: {} }));
    await fs.writeFile(path.join(pipeline, 'state.json'), `${JSON.stringify({ schemaVersion: 1, searchId: 'fixture-search', highWaterCapturedDate: '2026-10-08', quota: {}, days: {} }, null, 2)}\n`);
    await fs.writeFile(path.join(pipeline, 'seen.csv'), 'version_key,opp_key,captured_date,seen_utc\n');
    const stderr = await weeklyRun(root, { scenario, fetchPosting });
    const reports = path.join(root, 'reports', 'new-rfp-qualification');
    const results = JSON.parse(await fs.readFile(path.join(reports, '2026-10-16.json'), 'utf8'));
    const markdown = await fs.readFile(path.join(reports, '2026-10-16.md'), 'utf8');
    const audit = (await fs.readFile(path.join(reports, 'audit', '2026-10-16.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const slug = results.entries.find(entry => entry.title === 'Synthetic Case Management Portal').slug;
    const manifest = await fs.readFile(path.join(root, 'RFPs', '1-pre-submission', slug, 'resources', '_document-manifest.json'), 'utf8')
      .then(JSON.parse).catch(() => null);
    return {
      stderr, markdown, manifest,
      entry: results.entries.find(entry => entry.slug === slug),
      line: audit.find(item => item.rfp.slug === slug),
      auditText: JSON.stringify(audit),
    };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("HigherGov has no documents, the agency posting does: the RFP is scored from the posting's solicitation", async () => {
  const { entry, line, manifest, stderr, auditText } = await runScenario('found');
  assert.equal(entry.scoredFrom, 'documents');
  assert.ok(Number.isFinite(entry.score));
  assert.equal(line.documents.status, 'full-text');
  assert.deepEqual(line.documents.files.map(file => [file.name, file.source, file.read, file.match]),
    [['Synthetic RFP Solicitation', 'posting', true, 'matched']]);
  assert.equal(line.documents.posting.outcome, 'documents-found');
  // The price form was dropped before downloading; nothing was fetched twice.
  assert.equal(line.documents.posting.listed, 2);
  assert.equal(line.documents.posting.downloaded, 1);
  // The link's token never reaches the manifest, the audit or the log.
  assert.equal(manifest.documents[0].fetched_from, 'https://example.test/files/Synthetic%20RFP%20Solicitation.txt');
  assert.doesNotMatch(JSON.stringify(manifest), /token=/);
  assert.doesNotMatch(auditText, /token=|example\.test\/files/);
  assert.match(stderr, /\[rfp-posting\] example\.test unlisted documents-found listed=2 saved=1/);
});

test("a file for another RFP on the agency's bid board is kept but never scored", async () => {
  const { entry, line } = await runScenario('unmatched');
  assert.deepEqual([entry.tier, entry.reason], ['check', 'documents']);
  assert.deepEqual(line.documents.files.map(file => [file.source, file.match, file.role]), [['posting', 'unmatched', 'other']]);
  assert.equal(line.documents.posting.skipped.unmatched, 1);
  assert.equal(line.fullText, null);
});

test('documents on a login portal are never requested; the report names the portal in its own group', async () => {
  // The fixture has no handler for publicpurchase.com, so a request would show as posting-unavailable.
  const { entry, line, markdown } = await runScenario('login-portal');
  assert.deepEqual([entry.tier, entry.reason, entry.portal], ['check', 'portal', { name: 'Public Purchase', access: 'free-account', outcome: 'skipped-known-portal' }]);
  assert.equal(line.documents.posting.outcome, 'skipped-known-portal');
  assert.equal(line.outcome.decision, 'Needs a portal login');
  assert.match(markdown, /\*\*Documents need a portal login \(1\)\*\*\n\n- Synthetic Case Management Portal — Example Public Agency: the documents need a free Public Purchase account to download\. Listing score \d+\. Due: .*\[HigherGov listing\]\(https:\/\/example\.test\/synthetic-portal\) · \[Agency posting\]\(https:\/\/www\.publicpurchase\.com\//);
});

test('with posting fetch off, no agency site is requested, and a known login portal is still named', async () => {
  const off = await runScenario('found', { fetchPosting: false });
  assert.deepEqual([off.entry.reason, off.line.documents.posting.outcome], ['documents', 'not-attempted']);
  assert.doesNotMatch(off.stderr, /\[rfp-posting\]/);
  const portal = await runScenario('login-portal', { fetchPosting: false });
  assert.deepEqual([portal.entry.reason, portal.line.documents.posting.outcome], ['portal', 'skipped-known-portal']);
});
