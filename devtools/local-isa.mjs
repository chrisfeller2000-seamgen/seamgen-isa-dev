#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function resolveLocalRoot(value, root = repoRoot) {
  if (!value) return path.join(root, '.isa-local');
  if (!path.isAbsolute(value)) throw new Error('ISA_LOCAL_DIR must be an absolute path.');
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    if (resolved !== path.join(root, '.isa-local')) {
      throw new Error('ISA_LOCAL_DIR must be outside the repository, or use the default .isa-local directory.');
    }
  }
  return resolved;
}

const localRoot = resolveLocalRoot(process.env.ISA_LOCAL_DIR);
const nodeRoot = path.join(localRoot, 'node24');
const openclawRoot = path.join(localRoot, 'openclaw');
const stateRoot = path.join(localRoot, 'openclaw-state');
const workspace = path.join(stateRoot, 'workspace');
const configPath = path.join(stateRoot, 'openclaw.json');
const sourceManifestPath = path.join(stateRoot, 'source-hashes.json');
const credentialSourcePath = path.join(stateRoot, 'credential-source.json');
const authPlanPath = path.join(repoRoot, 'devtools', 'openai-auth-ref-plan.json');
const nodeVersion = '24.18.0';
const openclawVersion = '2026.9.4';
const gatewayPort = 19001;
const nodePath = path.join(nodeRoot, 'node_modules', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
const openclawPath = path.join(openclawRoot, 'node_modules', 'openclaw', 'openclaw.mjs');
const command = process.argv[2];

async function run(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd || repoRoot,
      stdio: options.stdio || 'inherit',
      env: options.env || process.env,
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0 || (options.allowInterrupt && signal === 'SIGINT')) resolve();
      else reject(new Error(`${path.basename(program)} exited with ${signal || code}`));
    });
  });
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

function npmCli() {
  if (!process.env.npm_execpath) {
    throw new Error('Run this through npm (for example, npm run local:setup).');
  }
  return process.env.npm_execpath;
}

async function installRuntime() {
  await fs.mkdir(localRoot, { recursive: true, mode: 0o700 });
  if (!await exists(nodePath)) {
    await run(process.execPath, [npmCli(), 'install', '--prefix', nodeRoot, '--no-save', '--no-audit', '--no-fund', `node@${nodeVersion}`]);
  }
  const installedNode = await fs.readFile(path.join(nodeRoot, 'node_modules', 'node', 'package.json'), 'utf8');
  if (JSON.parse(installedNode).version !== nodeVersion) throw new Error(`Expected Node ${nodeVersion} in the isolated runtime.`);

  const packagePath = path.join(openclawRoot, 'node_modules', 'openclaw', 'package.json');
  const installedVersion = await exists(packagePath) ? JSON.parse(await fs.readFile(packagePath, 'utf8')).version : null;
  if (installedVersion !== openclawVersion) {
    const env = { ...process.env, PATH: `${path.dirname(nodePath)}${path.delimiter}${process.env.PATH || ''}` };
    await run(nodePath, [npmCli(), 'install', '--prefix', openclawRoot, '--no-save', '--no-audit', '--no-fund', `openclaw@${openclawVersion}`], { env });
  }
  if (!await exists(openclawPath)) throw new Error('OpenClaw installation is incomplete.');
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function trackedSourceFiles() {
  const output = await new Promise((resolve, reject) => {
    const child = spawn('git', ['ls-files', '-z', '--', 'workspace'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(stderr || 'git ls-files failed')));
  });
  return output.toString('utf8').split('\0').filter(Boolean);
}

async function syncSource() {
  const files = await trackedSourceFiles();
  if (!files.length) throw new Error('No tracked ISA workspace files were found.');
  const previous = await exists(sourceManifestPath)
    ? JSON.parse(await fs.readFile(sourceManifestPath, 'utf8')) : {};
  const current = {};
  for (const relative of files) {
    if (!relative.startsWith('workspace/') || relative.split('/').includes('..')) throw new Error(`Unexpected source path: ${relative}`);
    const source = path.join(repoRoot, relative);
    const stat = await fs.lstat(source);
    if (!stat.isFile()) throw new Error(`Tracked source is not a regular file: ${relative}`);
    current[relative] = sha256(await fs.readFile(source));
  }
  for (const [relative, expected] of Object.entries(previous)) {
    if (!(relative in current)) throw new Error(`Tracked source was deleted: ${relative}. Review that change before syncing.`);
    const destination = path.join(stateRoot, relative);
    if (!await exists(destination) || sha256(await fs.readFile(destination)) !== expected) {
      throw new Error(`Local ISA workspace changed outside Git: ${relative}. Review it before syncing.`);
    }
  }
  for (const relative of files) {
    const destination = path.join(stateRoot, relative);
    if (!(relative in previous) && await exists(destination)) {
      throw new Error(`Local ISA workspace already has an untracked source file: ${relative}`);
    }
  }
  for (const relative of files) {
    const destination = path.join(stateRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (previous[relative] !== current[relative]) await fs.copyFile(path.join(repoRoot, relative), destination);
  }
  await fs.writeFile(sourceManifestPath, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  return files.length;
}

function assertSafeConfig(config) {
  if (config.gateway?.mode !== 'local' || config.gateway?.bind !== 'loopback' || config.gateway?.port !== gatewayPort) {
    throw new Error('Local Gateway must stay in local mode on the loopback interface and its dedicated port.');
  }
  if (config.gateway?.auth?.mode !== 'token' || !config.gateway.auth.token) throw new Error('Local Gateway token authentication is required.');
  if (config.logging?.file !== path.join(stateRoot, 'gateway.log')) throw new Error('Local Gateway logs must stay in the isolated state directory.');
  if (config.cron?.enabled !== false || config.agents?.defaults?.heartbeat?.every !== '0m') {
    throw new Error('Local scheduled jobs and heartbeat must remain disabled.');
  }
  if (config.agents?.defaults?.workspace !== workspace || config.agents?.defaults?.skipBootstrap !== true) {
    throw new Error('Local agent must use its isolated workspace without bootstrap writes.');
  }
  if (config.agents?.defaults?.model?.primary !== 'openai/gpt-5.4-mini') {
    throw new Error('Local agent must use the expected development model.');
  }
  if (config.agents?.defaults?.models?.['openai/gpt-5.4-mini']?.agentRuntime?.id !== 'openclaw') {
    throw new Error('Local agent must use the API-key-compatible OpenClaw runtime.');
  }
  if (config.tools?.profile !== 'minimal' || !config.tools?.deny?.includes('gateway')) {
    throw new Error('Local agent tools must remain minimal with Gateway updates denied.');
  }
  if (Object.keys(config.channels || {}).length) throw new Error('Local channels must remain unconfigured.');
  if (Object.keys(config.plugins?.entries || {}).length) throw new Error('Local plugin entries must remain unconfigured.');
  if (config.auth?.profiles?.['openai:isa-local']?.mode !== 'api_key' ||
      config.auth?.profiles?.['openai:isa-local']?.provider !== 'openai' ||
      JSON.stringify(config.auth?.order?.openai) !== JSON.stringify(['openai:isa-local'])) {
    throw new Error('Local agent must use only the dedicated OpenAI API-key profile.');
  }
}

function makeSafeConfig(token) {
  return {
    gateway: {
      mode: 'local', bind: 'loopback', port: gatewayPort,
      auth: { mode: 'token', token },
    },
    cron: { enabled: false },
    logging: { file: path.join(stateRoot, 'gateway.log') },
    agents: { defaults: {
      workspace, skipBootstrap: true,
      model: { primary: 'openai/gpt-5.4-mini' },
      models: { 'openai/gpt-5.4-mini': { agentRuntime: { id: 'openclaw' } } },
      heartbeat: { every: '0m' },
    } },
    tools: { profile: 'minimal', deny: ['gateway'] },
    channels: {},
    auth: {
      profiles: { 'openai:isa-local': { provider: 'openai', mode: 'api_key' } },
      order: { openai: ['openai:isa-local'] },
    },
  };
}

async function setupConfig() {
  await fs.mkdir(stateRoot, { recursive: true, mode: 0o700 });
  if (!await exists(configPath)) {
    const config = makeSafeConfig(randomBytes(32).toString('hex'));
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  assertSafeConfig(config);
  return config;
}

function isolatedEnvironment() {
  const env = {
    PATH: `${path.dirname(nodePath)}${path.delimiter}${process.env.PATH || ''}`,
    HOME: os.homedir(),
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR: stateRoot,
    OPENCLAW_WORKSPACE_DIR: workspace,
    OPENCLAW_SKIP_CHANNELS: '1',
    OPENCLAW_SKIP_CRON: '1',
    OPENCLAW_DISABLE_BONJOUR: '1',
    OPENCLAW_EXEC_SHELL_SNAPSHOT: '0',
    OPENCLAW_NO_RESPAWN: '1',
    OPENCLAW_NO_AUTO_UPDATE: '1',
  };
  for (const name of ['TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TERM', 'USER', 'LOGNAME', 'SYSTEMROOT', 'WINDIR']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

async function readOpenAiKey(sourceFile) {
  const stat = await fs.lstat(sourceFile);
  if (!stat.isFile()) throw new Error('OpenAI key source must be a regular local file.');
  const content = await fs.readFile(sourceFile, 'utf8');
  const matches = [...content.matchAll(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*?)\s*$/gm)];
  if (matches.length !== 1) throw new Error('Expected exactly one OPENAI_API_KEY in the selected local file.');
  let value = matches[0][1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(value)) throw new Error('Selected file does not contain a usable OpenAI API key.');
  return value;
}

async function linkKey() {
  const sourceFile = process.argv[3];
  if (!sourceFile || !path.isAbsolute(sourceFile)) throw new Error('Provide an absolute path to an existing local env file. Do not pass the key itself.');
  const key = await readOpenAiKey(sourceFile);
  await installRuntime();
  await setupConfig();
  const env = { ...isolatedEnvironment(), OPENAI_API_KEY: key };
  await run(nodePath, [openclawPath, 'secrets', 'apply', '--from', authPlanPath, '--dry-run'], { env, stdio: 'ignore' });
  await run(nodePath, [openclawPath, 'secrets', 'apply', '--from', authPlanPath], { env, stdio: 'ignore' });
  await fs.mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await fs.writeFile(credentialSourcePath, `${JSON.stringify({ sourceFile }, null, 2)}\n`, { mode: 0o600 });
  console.log('Local OpenAI key source linked. The key itself was not copied.');
}

async function linkedKey() {
  if (!await exists(credentialSourcePath)) throw new Error('No local OpenAI key source is linked. Run npm run local:link-key -- /absolute/path/to/.env.local.');
  const { sourceFile } = JSON.parse(await fs.readFile(credentialSourcePath, 'utf8'));
  if (typeof sourceFile !== 'string' || !path.isAbsolute(sourceFile)) throw new Error('Invalid local key source path.');
  return readOpenAiKey(sourceFile);
}

async function main() {
  if (!['setup', 'sync', 'start', 'health', 'version', 'link-key', 'chat'].includes(command)) {
    throw new Error('Use setup, sync, start, health, version, link-key, or chat. Start runs in the foreground; no service is installed.');
  }
  if (command === 'link-key') { await linkKey(); return; }
  if (command === 'setup' || command === 'start' || command === 'version') await installRuntime();
  if (command === 'setup' || command === 'sync' || command === 'start') {
    const count = await syncSource();
    await setupConfig();
    console.log(`Isolated ISA workspace ready with ${count} tracked source files. Channels and scheduled jobs are off.`);
    console.log(`Local runtime directory: ${localRoot}`);
  }
  if (command === 'start') {
    console.log(`Starting local OpenClaw ${openclawVersion} on 127.0.0.1:${gatewayPort}. Press Ctrl-C to stop.`);
    const env = { ...isolatedEnvironment(), OPENAI_API_KEY: await linkedKey() };
    await run(nodePath, [openclawPath, 'gateway', 'run'], { env, cwd: stateRoot, allowInterrupt: true });
  } else if (command === 'health') {
    await setupConfig();
    await run(nodePath, [openclawPath, 'gateway', 'health', '--port', String(gatewayPort)], { env: isolatedEnvironment() });
  } else if (command === 'version') {
    await run(nodePath, [openclawPath, '--version'], { env: isolatedEnvironment() });
  } else if (command === 'chat') {
    await setupConfig();
    const message = process.argv.slice(3).join(' ').trim();
    if (!message) throw new Error('Pass a message after --, for example: npm run local:chat -- "Hello Isa"');
    await run(nodePath, [openclawPath, 'agent', '--agent', 'main', '--session-key', 'agent:main:isa-local-dev', '--message', message, '--thinking', 'low', '--timeout', '120'], { env: isolatedEnvironment(), cwd: stateRoot });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

export { assertSafeConfig, makeSafeConfig, resolveLocalRoot };
