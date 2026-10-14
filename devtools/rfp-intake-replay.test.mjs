import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { intakeReplayRange } from '../workspace/scripts/weekly-rfp-pursue-decision.mjs';

const weekly = new URL('../workspace/scripts/weekly-rfp-pursue-decision.mjs', import.meta.url).href;

test('a replay range is two dates, oldest first; anything else stops the run', () => {
  assert.equal(intakeReplayRange(''), null);
  const range = intakeReplayRange('2026-10-02:2026-10-08');
  assert.deepEqual([range.from.toISOString().slice(0, 10), range.to.toISOString().slice(0, 10)], ['2026-10-02', '2026-10-08']);
  for (const bad of ['2026-10-08:2026-10-02', '2026-10-02', 'last week', '2026-10-02:2026-13-40']) assert.throws(() => intakeReplayRange(bad), /RFP_INTAKE_REPLAY/);
});

test("replaying past days writes candidates but leaves the intake state and seen list alone, so Friday's run is unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-intake-replay-'));
  try {
    const pipeline = path.join(root, 'RFP-pipeline');
    await fs.mkdir(path.join(root, 'tools'), { recursive: true });
    await fs.mkdir(path.join(pipeline, 'candidates', 'tonights-batch'), { recursive: true });
    await fs.writeFile(path.join(root, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled', pageSize: 25, safetyLagDays: 1, seamgenProfile: {} }));
    const state = `${JSON.stringify({ schemaVersion: 1, searchId: 'fixture-search', highWaterCapturedDate: '2026-10-08', quota: {}, days: { '2026-10-08': { fetched: 1, count: 1 } } }, null, 2)}\n`;
    // Last week's listing is already in the seen list; a replay must take it again anyway.
    const seen = 'version_key,opp_key,captured_date,seen_utc\n"v-2026-10-02","o-2026-10-02","2026-10-02","2026-10-09T12:00:00.000Z"\n';
    await fs.writeFile(path.join(pipeline, 'state.json'), state);
    await fs.writeFile(path.join(pipeline, 'seen.csv'), seen);

    const script = `
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        const day = url.searchParams.get('captured_date');
        const results = [{ version_key: 'v-' + day, opp_key: 'o-' + day, title: 'Synthetic portal ' + day, captured_date: day, due_date: '2026-12-31' }];
        return new Response(JSON.stringify({ results, meta: { pagination: { count: 1, pages: 1 } } }), { status: 200 });
      };
      const { runHigherGovIntake } = await import(${JSON.stringify(weekly)});
      const intake = await runHigherGovIntake();
      console.log(JSON.stringify({ days: intake.daysFetched, pass: intake.pass }));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { PATH: process.env.PATH, WORKSPACE_DIR: root, HIGHERGOV_API_KEY: 'fixture-key', RFP_INTAKE_REPLAY: '2026-10-02:2026-10-03' },
      encoding: 'utf8', timeout: 20000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout.trim().split('\n').at(-1)), { days: ['2026-10-02', '2026-10-03'], pass: 2 });
    assert.match(child.stderr, /intake replay 2026-10-02 to 2026-10-03: intake state and seen list are left unchanged/);
    assert.equal(await fs.readFile(path.join(pipeline, 'state.json'), 'utf8'), state);
    assert.equal(await fs.readFile(path.join(pipeline, 'seen.csv'), 'utf8'), seen);
    // The candidates folder holds the replayed week, as after any intake.
    assert.deepEqual((await fs.readdir(path.join(pipeline, 'candidates'))).sort(), ['synthetic-portal-2026-10-02', 'synthetic-portal-2026-10-03']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
