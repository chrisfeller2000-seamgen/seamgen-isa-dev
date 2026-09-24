import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'workspace');
const scripts = path.join(root, 'scripts');
let checked = 0;

for (const name of fs.readdirSync(scripts)) {
  const file = path.join(scripts, name);
  if (!fs.statSync(file).isFile()) continue;
  let command;
  let args;
  if (name.endsWith('.mjs') || name.endsWith('.js')) {
    command = 'node';
    args = ['--check', file];
  } else if (name.endsWith('.sh')) {
    if (process.platform === 'win32') {
      console.log(`Skipped local shell syntax check for ${name}; the VM checks it before deployment.`);
      continue;
    }
    command = 'bash';
    args = ['-n', file];
  } else continue;
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = 1;
  checked += 1;
}

console.log(`Checked ${checked} JavaScript and shell scripts.`);
