import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { findLocalResourcesDir, findStage, resourcesDirForFetch } from '../workspace/scripts/rfp-folders.mjs';
import { STAGE_FILE, listStages, moveRfp } from '../workspace/scripts/rfp-stage.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = pathToFileURL(path.join(repoRoot, 'devtools', 'fixtures', 'weekly-run.mjs')).href;
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exists = target => fs.access(target).then(() => true, () => false);

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

// A workspace with one scored RFP: its saved documents in tier 1 and this week's candidate file.
async function scoredWorkspace(slug = 'city-portal') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-stage-'));
  await fs.mkdir(path.join(root, 'RFPs', '1-pre-submission', slug, 'resources'), { recursive: true });
  await fs.writeFile(path.join(root, 'RFPs', '1-pre-submission', slug, 'resources', 'RFP.pdf'), 'pdf');
  await fs.writeFile(path.join(root, 'RFPs', '1-pre-submission', slug, 'resources', '_document-manifest.json'), '{}');
  await fs.mkdir(path.join(root, 'RFP-pipeline', 'candidates', slug), { recursive: true });
  await fs.writeFile(path.join(root, 'RFP-pipeline', 'candidates', slug, 'candidate.md'), '---\ntitle: City Permit Portal\nagency_name: City of Example\n---\n\n## Summary\n');
  return root;
}

test('each tier can be named by number, label, alias or folder', () => {
  for (const [value, dir] of [['2', '2-intermediate-stage'], ['looking closer', '2-intermediate-stage'], ['Building', '3-building'],
    ['3-building', '3-building'], ['writing', '3-building'], ['submitted', '4-submitted'], ['1', '1-pre-submission'], ['scored', '1-pre-submission']]) {
    assert.equal(findStage(value)?.dir, dir, value);
  }
  for (const value of ['', '5', 'won', '../3-building']) assert.equal(findStage(value), null, value);
});

test('a move takes the whole folder, keeps this week\'s scoring and records who asked', async () => {
  const root = await scoredWorkspace();
  try {
    const moved = await moveRfp({ slug: 'city-portal', to: findStage('building'), by: 'Marianne', note: 'Peter approved', at: '2026-11-18T17:00:00.000Z', workspace: root });
    assert.deepEqual([moved.title, moved.from.dir, moved.to.dir, moved.created], ['City Permit Portal', '1-pre-submission', '3-building', false]);
    const dir = path.join(root, 'RFPs', '3-building', 'city-portal');
    assert.equal(await exists(path.join(root, 'RFPs', '1-pre-submission', 'city-portal')), false);
    assert.equal(await fs.readFile(path.join(dir, 'resources', 'RFP.pdf'), 'utf8'), 'pdf');
    assert.match(await fs.readFile(path.join(dir, 'candidate.md'), 'utf8'), /title: City Permit Portal/);
    assert.deepEqual(await readJson(path.join(dir, STAGE_FILE)), {
      slug: 'city-portal', history: [{ at: '2026-11-18T17:00:00.000Z', from: '1-pre-submission', to: '3-building', by: 'Marianne', note: 'Peter approved' }],
      title: 'City Permit Portal', stage: '3-building', agency: 'City of Example',
    });

    // After the Friday job clears the candidate file, a move still works and keeps the copy.
    await fs.rm(path.join(root, 'RFP-pipeline', 'candidates'), { recursive: true });
    await moveRfp({ slug: 'city-portal', to: findStage('4'), by: 'Tina', at: '2026-12-01T17:00:00.000Z', workspace: root });
    const submitted = path.join(root, 'RFPs', '4-submitted', 'city-portal');
    const record = await readJson(path.join(submitted, STAGE_FILE));
    assert.deepEqual(record.history.map(item => [item.from, item.to, item.by]), [['1-pre-submission', '3-building', 'Marianne'], ['3-building', '4-submitted', 'Tina']]);
    assert.equal(record.title, 'City Permit Portal');
    assert.match(await fs.readFile(path.join(submitted, 'candidate.md'), 'utf8'), /City Permit Portal/);

    const listed = await listStages({ workspace: root });
    assert.deepEqual(listed.tiers.map(tier => [tier.stage.dir, tier.rfps.map(rfp => [rfp.slug, rfp.title, rfp.movedBy, rfp.documents])]),
      [['4-submitted', [['city-portal', 'City Permit Portal', 'Tina', 1]]], ['3-building', []], ['2-intermediate-stage', []]]);
    assert.equal(listed.scored, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an RFP with no saved documents gets a folder when this week\'s candidate file says what it is', async () => {
  const root = await scoredWorkspace();
  try {
    await fs.mkdir(path.join(root, 'RFP-pipeline', 'candidates', 'portal-login-rfp'), { recursive: true });
    await fs.writeFile(path.join(root, 'RFP-pipeline', 'candidates', 'portal-login-rfp', 'candidate.md'), '---\ntitle: Needs A Portal Login\n---\n');
    const moved = await moveRfp({ slug: 'portal-login-rfp', to: findStage('looking'), by: 'Marianne', workspace: root });
    assert.deepEqual([moved.from, moved.created, moved.title], [null, true, 'Needs A Portal Login']);
    assert.equal((await readJson(path.join(root, 'RFPs', '2-intermediate-stage', 'portal-login-rfp', STAGE_FILE))).history[0].from, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a move that cannot be done changes nothing and says why', async () => {
  const root = await scoredWorkspace();
  try {
    const tier1 = path.join(root, 'RFPs', '1-pre-submission', 'city-portal');
    await assert.rejects(moveRfp({ slug: 'city-portal', to: findStage('scored'), by: 'Marianne', workspace: root }), /already in Scored \(1-pre-submission\)\. Nothing changed\./);
    await assert.rejects(moveRfp({ slug: 'nobody-knows', to: findStage('building'), by: 'Marianne', workspace: root }), /no folder for nobody-knows and no candidate file this week/);
    // Two copies: refuse rather than pick one.
    await fs.mkdir(path.join(root, 'RFPs', '3-building', 'city-portal'), { recursive: true });
    await assert.rejects(moveRfp({ slug: 'city-portal', to: findStage('submitted'), by: 'Marianne', workspace: root }), /has folders in 3-building and 1-pre-submission\. Ask a developer to merge them\. Nothing changed\./);
    assert.equal(await exists(path.join(tier1, 'resources', 'RFP.pdf')), true);
    assert.equal(await exists(path.join(root, 'RFPs', '4-submitted')), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the Friday job saves documents into the tier the RFP was moved to, and new RFPs into tier 1', async () => {
  const root = await scoredWorkspace();
  try {
    await moveRfp({ slug: 'city-portal', to: findStage('building'), by: 'Marianne', workspace: root });
    const building = path.join(root, 'RFPs', '3-building', 'city-portal', 'resources');
    assert.equal(await resourcesDirForFetch('city-portal', { workspace: root }), building);
    assert.equal(await findLocalResourcesDir('city-portal', { workspace: root }), building);
    assert.equal(await exists(path.join(root, 'RFPs', '1-pre-submission', 'city-portal')), false);
    const fresh = await resourcesDirForFetch('new-listing', { workspace: root });
    assert.equal(fresh, path.join(root, 'RFPs', '1-pre-submission', 'new-listing', 'resources'));
    assert.equal(await exists(fresh), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('from the command line: --by is required, list shows the tiers, and nothing is sent', async () => {
  const root = await scoredWorkspace();
  try {
    const noBy = await run('rfp-stage.mjs', root, ['city-portal', 'building']);
    assert.equal(noBy.code, 1);
    assert.match(noBy.stderr, /Say who asked for the move with --by "<name>"\. Nothing changed\./);
    for (const args of [['city-portal', 'won', '--by', 'x'], ['../etc', 'building', '--by', 'x'], []]) {
      const bad = await run('rfp-stage.mjs', root, args);
      assert.equal(bad.code, 1);
      assert.match(bad.stderr, /^Usage:/);
    }
    const moved = await run('rfp-stage.mjs', root, ['city-portal', 'looking', '--by', 'Marianne Faro']);
    assert.equal(moved.code, 0, moved.stderr);
    // This RFP has no HigherGov key, so the move asks for what lets Friday recognize its listing.
    assert.equal(moved.stdout, ['City Permit Portal moved from Scored to Looking closer.', 'Recorded as asked by Marianne Faro.',
      'It has no HigherGov listing key, so the Friday run can only recognize its listing by agency and solicitation number. Add them from its documents: node scripts/rfp-stage.mjs city-portal --agency "<agency>" --number "<solicitation number>" --by "<name>"',
      'Nothing was deleted, uploaded or sent.', ''].join('\n'));
    const noByDetails = await run('rfp-stage.mjs', root, ['city-portal', '--number', 'RFP 2026-14']);
    assert.match(noByDetails.stderr, /Say who asked for the change with --by/);
    const details = await run('rfp-stage.mjs', root, ['city-portal', '--number', 'RFP 2026-14', '--by', 'Marianne Faro']);
    assert.equal(details.code, 0, details.stderr);
    assert.equal(details.stdout, 'City Permit Portal (Looking closer): agency "City of Example", solicitation number "RFP 2026-14".\nRecorded as asked by Marianne Faro.\n');
    const record = await readJson(path.join(root, 'RFPs', '2-intermediate-stage', 'city-portal', STAGE_FILE));
    assert.deepEqual([record.number, record.agency, record.history.length, record.details.map(item => item.by)], ['RFP 2026-14', 'City of Example', 1, ['Marianne Faro']]);
    const listed = await run('rfp-stage.mjs', root, ['list']);
    assert.equal(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /^Submitted \(4-submitted\): none\nBuilding \(3-building\): none\nLooking closer \(2-intermediate-stage\): 1\n- City Permit Portal \[city-portal\]: moved \d{4}-\d{2}-\d{2} by Marianne Faro; 1 document\nScored \(1-pre-submission\): 0 RFP folders\.\n$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a whole Friday run after a move lists the returning listing once as being worked on: not rescored, re-downloaded or copied to tier 1', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-stage-week-'));
  const pipeline = path.join(root, 'RFP-pipeline');
  try {
    await fs.mkdir(path.join(root, 'tools'), { recursive: true });
    await fs.mkdir(path.join(pipeline, 'candidates'), { recursive: true });
    await fs.writeFile(path.join(root, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled', pageSize: 25, safetyLagDays: 1, seamgenProfile: {} }));
    await fs.writeFile(path.join(pipeline, 'state.json'), `${JSON.stringify({ schemaVersion: 1, searchId: 'fixture-search', highWaterCapturedDate: '2026-10-08', quota: {}, days: {} }, null, 2)}\n`);
    await fs.writeFile(path.join(pipeline, 'seen.csv'), 'version_key,opp_key,captured_date,seen_utc\n');
    const first = await run('weekly-rfp-pursue-decision.mjs', root);
    assert.equal(first.code, 0, first.stderr);
    const week = await readJson(path.join(root, 'reports', 'new-rfp-qualification', 'latest.json'));
    const portal = week.entries.find(entry => entry.title === 'Synthetic Case Management Portal');
    const tier1 = path.join(root, 'RFPs', '1-pre-submission', portal.slug);
    const saved = (await fs.readdir(path.join(tier1, 'resources'))).sort();
    assert.ok(saved.some(name => !name.startsWith('_')), 'the Friday run saved documents');

    const moved = await run('rfp-stage.mjs', root, [portal.slug, 'building', '--by', 'Marianne']);
    assert.equal(moved.code, 0, moved.stderr);
    // A note someone wrote in the folder while building the proposal must survive the next run.
    const building = path.join(root, 'RFPs', '3-building', portal.slug);
    await fs.writeFile(path.join(building, 'proposal-notes.md'), 'draft');

    // The same listing comes back the next week (replayed here; an amendment is a new version
    // with the same opp_key, which the Friday intake would otherwise treat as new).
    const second = await run('weekly-rfp-pursue-decision.mjs', root);
    assert.equal(second.code, 0, second.stderr);
    const next = await readJson(path.join(root, 'reports', 'new-rfp-qualification', 'latest.json'));
    assert.equal(next.entries.some(entry => entry.title === 'Synthetic Case Management Portal'), false, 'not scored or picked again');
    assert.deepEqual(next.inProgress.map(item => [item.slug, item.stage, item.stageLabel, item.title]),
      [[portal.slug, '3-building', 'Building', 'Synthetic Case Management Portal']]);
    assert.equal(next.total, week.total - 1);
    assert.match(await fs.readFile(path.join(root, 'reports', 'new-rfp-qualification', 'latest.md'), 'utf8'),
      /## Updated listings already being worked on\n\n.*\n\n- Synthetic Case Management Portal \(Building\): new version captured /);
    const auditLines = (await fs.readFile(path.join(root, 'reports', 'new-rfp-qualification', 'audit', '2026-10-16-2.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(auditLines.filter(line => line.outcome.reason === 'in-progress').map(line => line.rfp.title), ['Synthetic Case Management Portal']);
    assert.equal(await exists(tier1), false, 'no second copy in tier 1');
    assert.deepEqual((await fs.readdir(path.join(building, 'resources'))).sort(), saved);
    assert.equal(await fs.readFile(path.join(building, 'proposal-notes.md'), 'utf8'), 'draft');
    assert.equal((await readJson(path.join(building, STAGE_FILE))).stage, '3-building');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
