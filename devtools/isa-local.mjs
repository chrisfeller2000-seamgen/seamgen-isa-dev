#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep in step with the live VM (docs/runtime.md).
const openclawVersion = '2026.9.4';
const gatewayPort = '19789';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(repoRoot, 'workspace');
// WSL sets ISA_LOCAL_DIR to a Linux-filesystem path; npm installs through /mnt/c are very slow.
const localRoot = process.env.ISA_LOCAL_DIR ? path.resolve(process.env.ISA_LOCAL_DIR) : path.join(repoRoot, '.isa-local');
const installRoot = path.join(localRoot, 'openclaw');
const stateDir = path.join(localRoot, 'state');
const openclawEntry = path.join(installRoot, 'node_modules', 'openclaw', 'openclaw.mjs');

export const providers = [
  { env: 'OPENAI_API_KEY', authChoice: 'openai-api-key' },
  { env: 'ANTHROPIC_API_KEY', authChoice: 'apiKey' }
];

// Local runs never share state with ~/.openclaw and keep the switches the ISA scripts offer turned off.
export function localEnv(base) {
  return {
    ...base,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: path.join(stateDir, 'openclaw.json'),
    NO_TELEGRAM: '1',
    REENGAGEMENT_DRY_RUN: '1'
  };
}

function loadDotEnv() {
  const file = path.join(repoRoot, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

function run(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: 'inherit', env: localEnv(process.env), ...options });
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
}

function installedVersion() {
  const file = path.join(installRoot, 'node_modules', 'openclaw', 'package.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).version : null;
}

async function setup() {
  if (installedVersion() !== openclawVersion) {
    fs.mkdirSync(installRoot, { recursive: true });
    const manifest = path.join(installRoot, 'package.json');
    if (!fs.existsSync(manifest)) fs.writeFileSync(manifest, '{ "private": true }\n');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const code = await run(npm, ['install', '--no-fund', '--no-audit', `openclaw@${openclawVersion}`],
      { cwd: installRoot, shell: process.platform === 'win32' });
    if (code !== 0) throw new Error('OpenClaw install failed.');
  }

  const provider = providers.find(item => process.env[item.env]);
  if (!provider) {
    throw new Error(`Set one of ${providers.map(item => item.env).join(', ')} in the repository's .env file.`);
  }
  // --secret-input-mode ref stores an env reference, so the key stays only in .env.
  const code = await run(process.execPath, [openclawEntry, 'onboard', '--non-interactive', '--accept-risk',
    '--mode', 'local', '--auth-choice', provider.authChoice, '--secret-input-mode', 'ref',
    '--workspace', workspace, '--gateway-bind', 'loopback', '--gateway-port', gatewayPort,
    '--skip-daemon', '--skip-health', '--skip-bootstrap', '--skip-channels', '--skip-skills',
    '--skip-search', '--skip-hooks', '--skip-ui']);
  if (code !== 0) throw new Error('OpenClaw onboarding failed.');
  // The live heartbeat would otherwise wake the local agent every 30 minutes.
  if (await run(process.execPath, [openclawEntry, 'config', 'set', 'agents.defaults.heartbeat.every', '0m']) !== 0) {
    throw new Error('Could not disable the local heartbeat.');
  }
  console.log(`Local ISA is configured in ${stateDir}. Try: npm run isa -- chat`);
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  if (args[0] === 'setup') return setup();
  if (installedVersion() !== openclawVersion) {
    throw new Error(`OpenClaw ${openclawVersion} is not installed locally. Run: npm run local:setup`);
  }
  process.exitCode = await run(process.execPath, [openclawEntry, ...args]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
