import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(root, 'workspace/scripts/run-new-rfp-qualification-cron.sh');
const refreshWrapper = path.join(root, 'workspace/scripts/run-rfp-refresh-cron.sh');

// Runs a real cron wrapper against a temporary workspace whose job script only exits
// with the given code, and a fake `openclaw` that records each Telegram send.
// `exitCodes` gives one exit code per run of the job, for wrappers that try again; the
// result then also says how many times the job ran.
async function runWrapper({ exitCode = 0, exitCodes = null, envFile = true, env = {}, script = wrapper, job = 'weekly-rfp-pursue-decision.mjs' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rfp-wrapper-'));
  await fs.mkdir(path.join(dir, 'workspace/scripts'), { recursive: true });
  await fs.mkdir(path.join(dir, 'bin'));
  const runs = path.join(dir, 'runs.txt');
  await fs.writeFile(path.join(dir, 'workspace/scripts', job), exitCodes
    ? `import fs from 'node:fs';\nconst n = fs.existsSync(${JSON.stringify(runs)}) ? Number(fs.readFileSync(${JSON.stringify(runs)}, 'utf8')) : 0;\nfs.writeFileSync(${JSON.stringify(runs)}, String(n + 1));\nprocess.exit(${JSON.stringify(exitCodes)}[n] ?? 0);\n`
    : `process.exit(${exitCode});\n`);
  if (envFile) await fs.writeFile(path.join(dir, 'gog-session.env'), 'HIGHERGOV_API_KEY=test-key\n');
  const log = path.join(dir, 'openclaw.log');
  await fs.writeFile(path.join(dir, 'bin/openclaw'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n`, { mode: 0o755 });
  const result = spawnSync('bash', [script], { encoding: 'utf8', env: {
    PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, HOME: dir,
    WORKSPACE_DIR: path.join(dir, 'workspace'), HIGHERGOV_ENV_FILE: path.join(dir, 'gog-session.env'),
    TELEGRAM_TARGET: 'test-chat', ...env,
  } });
  const sends = (await fs.readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  const ran = exitCodes ? Number(await fs.readFile(runs, 'utf8').catch(() => '0')) : undefined;
  await fs.rm(dir, { recursive: true, force: true });
  return exitCodes ? { status: result.status, sends, runs: ran } : { status: result.status, sends };
}

test('a failed Friday run tells the group once and keeps its exit status', async () => {
  const { status, sends } = await runWrapper({ exitCode: 3 });
  assert.equal(status, 3);
  assert.equal(sends.length, 1);
  assert.match(sends[0], /^message send --channel telegram --target test-chat --message Heads up: this morning's RFP run didn't finish, so there's no RFP report today\. Chris, the details are in the job log\.$/);
});

test('a failure before Node starts, such as a missing HigherGov env file, also sends the notice', async () => {
  const { status, sends } = await runWrapper({ envFile: false });
  assert.equal(status, 1);
  assert.equal(sends.length, 1);
});

test('a successful run or NO_TELEGRAM sends no failure notice', async () => {
  assert.deepEqual(await runWrapper({ exitCode: 0 }), { status: 0, sends: [] });
  assert.deepEqual(await runWrapper({ exitCode: 3, env: { NO_TELEGRAM: '1' } }), { status: 3, sends: [] });
});

const refresh = ({ env = {}, ...options } = {}) => runWrapper({ script: refreshWrapper, job: 'rfp-refresh.mjs',
  env: { RFP_REFRESH_RETRY_DELAY_SECONDS: '0', ...env }, ...options });

test('the Tuesday document check tries once more before telling the group it failed', async () => {
  // Fails, then works on the retry: no notice.
  assert.deepEqual(await refresh({ exitCodes: [2, 0] }), { status: 0, sends: [], runs: 2 });
  // Fails twice: one notice, with the retry's exit status.
  const failed = await refresh({ exitCodes: [2, 3] });
  assert.deepEqual([failed.status, failed.runs, failed.sends.length], [3, 2, 1]);
  assert.match(failed.sends[0], /--message Heads up: this morning's check for new RFP documents didn't finish/);
  // Works first time: no retry, no notice.
  assert.deepEqual(await refresh({ exitCodes: [0] }), { status: 0, sends: [], runs: 1 });
  // A failure before Node starts isn't retried, and still sends the notice.
  assert.equal((await refresh({ envFile: false })).sends.length, 1);
  assert.deepEqual(await refresh({ exitCodes: [2, 2], env: { NO_TELEGRAM: '1' } }), { status: 2, sends: [], runs: 2 });
});
