import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(root, 'workspace/scripts/run-new-rfp-qualification-cron.sh');

// Runs the real cron wrapper against a temporary workspace whose weekly script only exits
// with the given code, and a fake `openclaw` that records each Telegram send.
async function runWrapper({ exitCode = 0, envFile = true, env = {} } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rfp-wrapper-'));
  await fs.mkdir(path.join(dir, 'workspace/scripts'), { recursive: true });
  await fs.mkdir(path.join(dir, 'bin'));
  await fs.writeFile(path.join(dir, 'workspace/scripts/weekly-rfp-pursue-decision.mjs'), `process.exit(${exitCode});\n`);
  if (envFile) await fs.writeFile(path.join(dir, 'gog-session.env'), 'HIGHERGOV_API_KEY=test-key\n');
  const log = path.join(dir, 'openclaw.log');
  await fs.writeFile(path.join(dir, 'bin/openclaw'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n`, { mode: 0o755 });
  const result = spawnSync('bash', [wrapper], { encoding: 'utf8', env: {
    PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, HOME: dir,
    WORKSPACE_DIR: path.join(dir, 'workspace'), HIGHERGOV_ENV_FILE: path.join(dir, 'gog-session.env'),
    TELEGRAM_TARGET: 'test-chat', ...env,
  } });
  const sends = (await fs.readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  await fs.rm(dir, { recursive: true, force: true });
  return { status: result.status, sends };
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
