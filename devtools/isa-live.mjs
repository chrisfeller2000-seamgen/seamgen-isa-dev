#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(repoRoot, 'workspace');
const stateRoot = path.join(repoRoot, '.isa-local');
const candidateRoot = path.join(stateRoot, 'candidate');
const baselineRoot = path.join(stateRoot, 'baseline');
const config = JSON.parse(await fs.readFile(path.join(repoRoot, 'devtools/live-files.json'), 'utf8'));
const command = process.argv[2];
const flags = new Set(process.argv.slice(3));

const forbiddenName = /(^\.git$|^\.env(?:\..*)?$|^(?:credentials|secrets|sessions|attachments|reports|backups|node_modules)$|\.(?:pem|key|p12|pfx|sqlite|db|log)$)/i;
const literalSecret = /-----BEGIN [^-]*PRIVATE KEY-----|(?:ghp_|github_pat_|xox[baprs]-|sk-)[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}/i;

function assertSafeRelative(value) {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith('/') ||
      value.split('/').some(part => !part || part === '.' || part === '..' || forbiddenName.test(part))) {
    throw new Error(`Unsafe path in live file list: ${value}`);
  }
  return value;
}

function isIncluded(relative) {
  return config.paths.some(item => relative === item || relative.startsWith(`${item}/`));
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function sshSettings() {
  const key = process.env.ISA_SSH_KEY || path.join(os.homedir(), '.ssh', 'seamgen-isa.pem');
  const host = process.env.ISA_SSH_HOST || '172.211.69.6';
  const user = process.env.ISA_SSH_USER || 'azureuser';
  if (!/^[A-Za-z0-9.-]+$/.test(host) || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(user)) {
    throw new Error('Invalid ISA_SSH_HOST or ISA_SSH_USER');
  }
  return { key, destination: `${user}@${host}` };
}

async function run(program, args, options = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  if (result.code !== 0 && !options.allowFailure) {
    throw new Error(`${program} failed (${result.code}): ${result.stderr.trim().slice(-500)}`);
  }
  return result;
}

function sshArgs(remoteCommand) {
  const { key, destination } = sshSettings();
  return ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-i', key, destination, remoteCommand];
}

async function remote(parts, options = {}) {
  return run('ssh', sshArgs(parts.map(quote).join(' ')), options);
}

async function listFiles(root) {
  const files = new Map();
  async function walk(current, relative = '') {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      assertSafeRelative(next);
      const absolute = path.join(current, entry.name);
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${next}`);
      if (stat.isDirectory()) await walk(absolute, next);
      else if (stat.isFile()) {
        if (!isIncluded(next)) throw new Error(`File outside approved live list: ${next}`);
        if (stat.size > 5_000_000) throw new Error(`File is unexpectedly large: ${next}`);
        const content = await fs.readFile(absolute);
        if (content.includes(0)) throw new Error(`Binary file requires review: ${next}`);
        if (literalSecret.test(content.toString('utf8'))) throw new Error(`Possible hard-coded secret requires review: ${next}`);
        files.set(next, { hash: createHash('sha256').update(content).digest('hex'), size: stat.size });
      } else throw new Error(`Unsupported file type: ${next}`);
    }
  }
  await walk(root);
  return files;
}

function differences(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].sort().flatMap(file => {
    const oldFile = before.get(file);
    const newFile = after.get(file);
    if (oldFile?.hash === newFile?.hash) return [];
    return [{ file, kind: !oldFile ? 'added' : !newFile ? 'deleted' : 'modified' }];
  });
}

function printDifferences(label, changes) {
  console.log(`${label}: ${changes.length ? `${changes.length} file(s)` : 'no changes'}`);
  for (const change of changes) console.log(`  ${change.kind.padEnd(8)} ${change.file}`);
}

async function fetchLive() {
  for (const item of config.paths) assertSafeRelative(item);
  if (!config.sourceRoot.startsWith('/home/azureuser/.openclaw/workspace')) {
    throw new Error('Unexpected ISA source root');
  }
  const { key, destination } = sshSettings();
  await fs.access(key);
  await fs.mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const remotePaths = config.paths.map(item => path.posix.join(config.sourceRoot, item));
  const symlinks = await remote(['find', ...remotePaths, '-type', 'l', '-print']);
  if (symlinks.stdout.trim()) throw new Error('Live source contains symbolic links; review before copying');
  const stage = await fs.mkdtemp(path.join(stateRoot, 'pull-'));
  try {
    const stageWorkspace = path.join(stage, 'workspace');
    await fs.mkdir(stageWorkspace, { mode: 0o700 });
    const localDestination = path.relative(repoRoot, stageWorkspace).split(path.sep).join('/');
    const scpArgs = ['-r', '-p', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-i', key,
      ...remotePaths.map(remotePath => `${destination}:${remotePath}`), localDestination];
    await run('scp', scpArgs);
    const files = await listFiles(stageWorkspace);
    await fs.rm(candidateRoot, { recursive: true, force: true });
    await fs.rename(stage, candidateRoot);
    return files;
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function mapIfPresent(root) {
  try { await fs.access(root); } catch { return null; }
  return listFiles(root);
}

async function acceptCandidate() {
  const candidate = path.join(candidateRoot, 'workspace');
  const files = await mapIfPresent(candidate);
  if (!files) throw new Error('No downloaded live candidate. Run live:pull first.');
  const current = path.join(baselineRoot, 'workspace');
  if (await mapIfPresent(current)) {
    const archive = path.join(stateRoot, `baseline-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
    await fs.rename(baselineRoot, archive);
  }
  await fs.cp(candidateRoot, baselineRoot, { recursive: true });
  console.log(`Accepted ${files.size} live files as the local baseline.`);
}

async function pull() {
  const live = await fetchLive();
  const baseline = await mapIfPresent(path.join(baselineRoot, 'workspace'));
  const local = await listFiles(workspace);
  if (baseline) printDifferences('VM changes since accepted baseline', differences(baseline, live));
  else console.log('No accepted baseline yet. Review the initial copy, then run npm run live:accept.');
  printDifferences('Local repo compared with current VM', differences(live, local));
}

async function accept() {
  const candidate = await mapIfPresent(path.join(candidateRoot, 'workspace'));
  if (!candidate) throw new Error('Run live:pull first.');
  const local = await listFiles(workspace);
  const differencesFromLocal = differences(candidate, local);
  if (differencesFromLocal.length && !flags.has('--acknowledge')) {
    printDifferences('Local repo differs from VM', differencesFromLocal);
    throw new Error('Review/reconcile these files first. Then rerun live:accept -- --acknowledge.');
  }
  await acceptCandidate();
}

async function importLive() {
  const baseline = await mapIfPresent(path.join(baselineRoot, 'workspace'));
  if (!baseline) throw new Error('No accepted live baseline. Run live:pull and live:accept first.');
  const status = await run('git', ['status', '--porcelain', '--untracked-files=normal']);
  if (status.stdout.trim()) throw new Error('Commit or review local changes before importing VM files.');
  const local = await listFiles(workspace);
  const localChanges = differences(baseline, local);
  if (localChanges.length) {
    printDifferences('Local source differs from accepted VM baseline', localChanges);
    throw new Error('Reconcile local source changes before importing VM files.');
  }
  const live = await fetchLive();
  const changes = differences(baseline, live);
  printDifferences('VM changes to import', changes);
  if (changes.some(change => change.kind === 'deleted')) {
    throw new Error('A VM source file was deleted. Review that deletion manually before importing.');
  }
  if (!changes.length) return;
  for (const { file } of changes) {
    const destination = path.join(workspace, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(candidateRoot, 'workspace', file), destination);
  }
  const imported = await listFiles(workspace);
  if (differences(live, imported).length) {
    throw new Error('Imported files do not match the downloaded VM snapshot. Review local files.');
  }
  await acceptCandidate();
  console.log('VM changes are now in the working tree. Review the Git diff, test, commit, and push them.');
}

async function remoteHash(relative) {
  const livePath = path.posix.join(config.sourceRoot, relative);
  const statement = `if [ -f ${quote(livePath)} ]; then sha256sum -- ${quote(livePath)}; ` +
    `elif [ -e ${quote(livePath)} ]; then exit 42; else printf '__MISSING__'; fi`;
  const result = await run('ssh', sshArgs(statement));
  if (result.stdout.trim() === '__MISSING__') return null;
  const hash = result.stdout.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Could not verify VM file hash: ${relative}`);
  return hash;
}

async function checkLocalSource(changes) {
  for (const { file } of changes) {
    const absolute = path.join(workspace, file);
    if (file.endsWith('.mjs') || file.endsWith('.js')) await run('node', ['--check', absolute]);
    if (file.endsWith('.sh') && process.platform !== 'win32') await run('bash', ['-n', absolute]);
  }
}

async function deploy() {
  const baseline = await mapIfPresent(path.join(baselineRoot, 'workspace'));
  if (!baseline) throw new Error('No accepted live baseline. Run live:pull and live:accept first.');
  const live = await fetchLive();
  const drift = differences(baseline, live);
  if (drift.length) {
    printDifferences('VM changed since accepted baseline; deployment stopped', drift);
    throw new Error('Review and reconcile the VM changes before deploying.');
  }
  const local = await listFiles(workspace);
  const changes = differences(baseline, local);
  if (changes.some(change => change.kind === 'deleted')) {
    printDifferences('Deletion requires a separate review', changes);
    throw new Error('This first deploy tool does not delete live files.');
  }
  printDifferences('Proposed upload', changes);
  if (!changes.length) return;
  await checkLocalSource(changes);
  if (!flags.has('--apply')) {
    console.log('Preview only. To upload this reviewed commit, run npm run live:deploy -- --apply.');
    return;
  }
  const status = await run('git', ['status', '--porcelain', '--untracked-files=normal']);
  if (status.stdout.trim()) throw new Error('Commit or remove local changes before uploading.');
  const revision = (await run('git', ['rev-parse', '--short', 'HEAD'])).stdout.trim();
  const releaseId = `dev-deploy-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${revision}`;
  const backupRoot = path.posix.join(config.sourceRoot, 'backups', releaseId);
  const staged = [];
  const promoted = [];
  try {
    for (const change of changes) {
      const livePath = path.posix.join(config.sourceRoot, change.file);
      const expected = baseline.get(change.file)?.hash || null;
      const observed = await remoteHash(change.file);
      if (observed !== expected) throw new Error(`VM changed during upload preparation: ${change.file}`);
      const stagePath = path.posix.join(backupRoot, 'staged', change.file);
      const backupPath = path.posix.join(backupRoot, 'original', change.file);
      await remote(['mkdir', '-p', '--', path.posix.dirname(stagePath), path.posix.dirname(backupPath)]);
      if (expected) await remote(['cp', '-p', '--', livePath, backupPath]);
      const { key, destination } = sshSettings();
      const localSource = path.posix.join('workspace', change.file);
      await run('scp', ['-p', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-i', key,
        localSource, `${destination}:${stagePath}`]);
      if (change.file.endsWith('.mjs') || change.file.endsWith('.js')) await remote(['node', '--check', stagePath]);
      if (change.file.endsWith('.sh')) await remote(['bash', '-n', stagePath]);
      staged.push({ ...change, livePath, stagePath, backupPath, expected, desired: local.get(change.file).hash });
    }
    for (const item of staged) {
      if (await remoteHash(item.file) !== item.expected) throw new Error(`VM changed immediately before upload: ${item.file}`);
    }
    for (const item of staged) {
      await remote(['mkdir', '-p', '--', path.posix.dirname(item.livePath)]);
      await remote(['cp', '-p', '--', item.stagePath, item.livePath]);
      promoted.push(item);
      if (await remoteHash(item.file) !== item.desired) throw new Error(`Uploaded file failed hash check: ${item.file}`);
      if (item.file.endsWith('.mjs') || item.file.endsWith('.js')) await remote(['node', '--check', item.livePath]);
      if (item.file.endsWith('.sh')) await remote(['bash', '-n', item.livePath]);
    }
  } catch (error) {
    if (promoted.length) {
      console.error(`Upload failed; attempting to restore ${promoted.length} changed file(s).`);
      for (const item of promoted.reverse()) {
        try {
          if (await remoteHash(item.file) !== item.desired) {
            console.error(`Manual restoration required for ${item.file}: it changed again after upload.`);
            continue;
          }
          if (item.expected) await remote(['cp', '-p', '--', item.backupPath, item.livePath]);
          else await remote(['rm', '--', item.livePath]);
        } catch (restoreError) {
          console.error(`Manual restoration required for ${item.file}: ${restoreError.message}`);
        }
      }
    }
    throw error;
  }
  const after = await fetchLive();
  const postDeployDrift = differences(local, after);
  if (!postDeployDrift.length) await acceptCandidate();
  else printDifferences('Post-upload VM differs from repo; baseline not advanced', postDeployDrift);
  await fs.appendFile(path.join(stateRoot, 'deployments.jsonl'), `${JSON.stringify({ releaseId, revision, files: changes.map(x => x.file), backupRoot, time: new Date().toISOString() })}\n`);
  console.log(`Uploaded commit ${revision}. Original files are backed up at ${backupRoot}.`);
  console.log('Check the affected ISA workflow before considering the release complete. This tool does not restart services or scheduled jobs.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (command === 'pull') await pull();
    else if (command === 'accept') await accept();
    else if (command === 'import') await importLive();
    else if (command === 'deploy') await deploy();
    else throw new Error('Use pull, accept, import, or deploy. Deploy previews by default; --apply uploads.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export { assertSafeRelative, differences, isIncluded };
