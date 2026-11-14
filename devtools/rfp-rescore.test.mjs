import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { renderMarkdown } from '../workspace/scripts/rfp-report.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = pathToFileURL(path.join(repoRoot, 'devtools', 'fixtures', 'weekly-run.mjs')).href;

// One offline process: the weekly job or the rescore script, with the recorded judge and a
// fetch that fails any request the fixture doesn't serve.
function run(script, workspaceDir, args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', fixture, path.join(repoRoot, 'workspace', 'scripts', script), ...args], {
      cwd: repoRoot,
      env: {
        WORKSPACE_DIR: workspaceDir, HIGHERGOV_API_KEY: 'fixture-key', RFP_RUN_DATE: '2026-10-16',
        RFP_INTAKE_REPLAY: '2026-10-08:2026-10-08', RFP_DOCUMENT_FETCH_ENABLED: '1', RFP_DELIVERY: 'preview',
        NO_TELEGRAM: '1', RFP_EMAIL_TO: 'fixture@example.test', TELEGRAM_TARGET: 'fixture',
        PATH: path.dirname(process.execPath),
        ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function fridayWeek() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-rescore-'));
  const pipeline = path.join(root, 'RFP-pipeline');
  await fs.mkdir(path.join(root, 'tools'), { recursive: true });
  await fs.mkdir(path.join(pipeline, 'candidates'), { recursive: true });
  await fs.writeFile(path.join(root, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled', pageSize: 25, safetyLagDays: 1, seamgenProfile: {} }));
  await fs.writeFile(path.join(pipeline, 'state.json'), `${JSON.stringify({ schemaVersion: 1, searchId: 'fixture-search', highWaterCapturedDate: '2026-10-08', quota: {}, days: {} }, null, 2)}\n`);
  await fs.writeFile(path.join(pipeline, 'seen.csv'), 'version_key,opp_key,captured_date,seen_utc\n');
  const friday = await run('weekly-rfp-pursue-decision.mjs', root);
  assert.equal(friday.code, 0, friday.stderr);
  return root;
}

const reports = root => path.join(root, 'reports', 'new-rfp-qualification');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const snapshot = async root => Object.fromEntries(await Promise.all(['2026-10-16.json', 'latest.json', 'latest.md', 'audit/2026-10-16.jsonl']
  .map(async name => [name, await fs.readFile(path.join(reports(root), name), 'utf8')])));
const DRIVE = 'https://drive.google.com/drive/folders/1hH_TYhu_INlFE9Xa3kruKi6OtscQSZOR';

test('a rescore shows the new result first, and --apply puts exactly that in the week\'s report without sending anything', async () => {
  const root = await fridayWeek();
  try {
    const friday = await readJson(path.join(reports(root), 'latest.json'));
    const portal = friday.entries.find(entry => entry.title === 'Synthetic Case Management Portal');
    const renewal = friday.entries.find(entry => entry.title === 'Synthetic License Renewal');
    assert.deepEqual([portal.tier, renewal.tier], ['strong', 'screened']);
    const fridayFiles = await snapshot(root);
    const candidateFile = path.join(root, 'RFP-pipeline', 'candidates', portal.slug, 'candidate.md');

    // Step 1: the scoring code now fails the portal at Gate 2. The new result is shown and
    // saved as pending; the report, audit and candidate file are untouched.
    const candidateBefore = await fs.readFile(candidateFile, 'utf8');
    const shown = await run('rfp-rescore.mjs', root, [portal.slug, '--date', '2026-10-20'], { ISA_RFP_FIXTURE_GATE2_FAIL: 'renewal,portal' });
    assert.equal(shown.code, 0, shown.stderr);
    assert.match(shown.stdout, /Before \(2026-10-16 report\): Strong pursue, \d+\./);
    assert.match(shown.stdout, /After: Screened out\b/);
    assert.match(shown.stdout, /Nothing has changed yet\. To put this in the report, run: node scripts\/rfp-rescore\.mjs synthetic/);
    assert.deepEqual(await snapshot(root), fridayFiles);
    assert.equal(await fs.readFile(candidateFile, 'utf8'), candidateBefore);

    // Step 2 applies the saved result with no model call.
    const applied = await run('rfp-rescore.mjs', root, [portal.slug, '--apply'], { ISA_RFP_FIXTURE_NO_MODEL: '1' });
    assert.equal(applied.code, 0, applied.stderr);
    assert.match(applied.stdout, /the 2026-10-16 report now shows Screened out/);
    assert.match(applied.stdout, /Nothing was emailed or posted\./);
    const after = await readJson(path.join(reports(root), 'latest.json'));
    assert.deepEqual(after, await readJson(path.join(reports(root), '2026-10-16.json')));
    assert.equal(after.entries.find(entry => entry.slug === portal.slug).tier, 'screened');
    assert.deepEqual(after.counts, { ...friday.counts, strong: friday.counts.strong - 1, screened: friday.counts.screened + 1 });
    // The Friday run's email and Telegram records, and everything else, stay as they were.
    for (const key of ['runDate', 'week', 'intake', 'email', 'telegram']) assert.deepEqual(after[key], friday[key], key);
    assert.deepEqual(after.rescores.map(item => [item.slug, item.scoredOn, item.before.decision, item.after.decision]),
      [[portal.slug, '2026-10-20', 'Strong pursue', 'Screened out']]);
    const markdown = await fs.readFile(path.join(reports(root), 'latest.md'), 'utf8');
    assert.equal(markdown, renderMarkdown(after));
    assert.match(markdown, /## Rescored after the Friday run\n\nThese were rescored after the email and Telegram message went out, so neither mentions the new result\.\n\n- Synthetic Case Management Portal, rescored 2026-10-20: Strong pursue, \d+ → Screened out/);
    // The week's audit keeps one line per listing; the rescore goes in its own file.
    assert.equal(await fs.readFile(path.join(reports(root), 'audit', '2026-10-16.jsonl'), 'utf8'), fridayFiles['audit/2026-10-16.jsonl']);
    const [line] = (await fs.readFile(path.join(reports(root), 'audit', '2026-10-16-rescores.jsonl'), 'utf8')).trim().split('\n').map(text => JSON.parse(text));
    assert.deepEqual([line.rfp.slug, line.outcome.tier, line.rescore.before.tier, line.rescore.scoredOn], [portal.slug, 'screened', 'strong', '2026-10-20']);
    // The candidate file says what the rescore found, and keeps no Friday full-text result.
    assert.match(candidateBefore, /scoring_recommendation: "?Strong Pursue/);
    const candidateAfter = await fs.readFile(candidateFile, 'utf8');
    assert.match(candidateAfter, /preliminary_recommendation: "?No-bid/);
    assert.doesNotMatch(candidateAfter, /scoring_recommendation: "?Strong Pursue/);
    await assert.rejects(fs.access(path.join(reports(root), 'rescore', `${portal.slug}.json`)));
    // Nothing is sent: no email or Telegram files appear, and the Friday preview files are unchanged.
    assert.deepEqual((await fs.readdir(reports(root))).filter(name => /email|telegram/.test(name)).sort(), ['2026-10-16-email.html', '2026-10-16-telegram.md']);

    // Rescored again with today's code, from the saved documents (any download would fail
    // the fixture), with the Drive folder someone made by hand. Deadlines count from the
    // rescore's date, so the Friday run's date gives the Friday score.
    const again = await run('rfp-rescore.mjs', root, [portal.slug, '--date', '2026-10-16', '--drive-folder', DRIVE], { ISA_RFP_FIXTURE_GATE2_FAIL: 'renewal' });
    assert.equal(again.code, 0, again.stderr);
    // An RFP that wasn't picked shows no score, only its decision.
    assert.match(again.stdout, /Before \(2026-10-16 report\): Screened out\. .*\nAfter: Strong pursue, \d+\./);
    assert.equal((await run('rfp-rescore.mjs', root, [portal.slug, '--apply'], { ISA_RFP_FIXTURE_NO_MODEL: '1' })).code, 0);
    const restored = await readJson(path.join(reports(root), 'latest.json'));
    const entry = restored.entries.find(item => item.slug === portal.slug);
    assert.deepEqual([entry.tier, entry.scoredFrom, entry.links.documents], ['strong', 'documents', DRIVE]);
    assert.equal(entry.score, portal.score);
    // One rescore record per RFP (the latest), and an audit line per apply.
    assert.deepEqual(restored.rescores.map(item => [item.slug, item.before.decision, item.after.decision]), [[portal.slug, 'Screened out', 'Strong pursue']]);
    assert.equal((await fs.readFile(path.join(reports(root), 'audit', '2026-10-16-rescores.jsonl'), 'utf8')).trim().split('\n').length, 2);
    assert.deepEqual((await fs.readdir(path.join(reports(root), 'audit'))).sort(), ['2026-10-16-rescores.jsonl', '2026-10-16.jsonl']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a rescore that cannot be done changes nothing and says why', async () => {
  const root = await fridayWeek();
  try {
    const friday = await readJson(path.join(reports(root), 'latest.json'));
    const renewal = friday.entries.find(entry => entry.title === 'Synthetic License Renewal');
    const fridayFiles = await snapshot(root);
    const failed = async (args, env, message) => {
      const result = await run('rfp-rescore.mjs', root, args, env);
      assert.equal(result.code, 1);
      assert.match(result.stderr, message);
      assert.deepEqual(await snapshot(root), fridayFiles);
      await assert.rejects(fs.access(path.join(reports(root), 'rescore', `${args[0]}.json`)));
    };
    // The renewal now passes its listing, but the Friday run never saved its documents.
    await failed([renewal.slug], { ISA_RFP_FIXTURE_GATE2_FAIL: '' }, /has no saved documents, and a rescore doesn't download them\. Nothing changed\./);
    await failed(['not-this-week'], {}, /not-this-week isn't in the 2026-10-16 report\./);
    await failed([renewal.slug, '--apply'], {}, /There is no pending rescore for synthetic-license-renewal\. Run it without --apply first\./);
    await failed([renewal.slug, '--drive-folder', 'my folder'], {}, /isn't a Google Drive folder link or ID/);
    await failed(['../../etc'], {}, /^Usage:/);
    // A scoring failure leaves nothing pending.
    await failed([renewal.slug], { ISA_RFP_FIXTURE_NO_MODEL: '1', ISA_RFP_FIXTURE_GATE2_FAIL: '' }, /The listing scoring failed \(.+\)\. Nothing changed; try again later\./);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
