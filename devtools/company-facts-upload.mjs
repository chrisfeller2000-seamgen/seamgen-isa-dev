// Uploads the private company-facts record to the VM, where the RFP scorer reads it on
// every run. Nothing restarts; the next scoring run picks it up.
//
//   node devtools/company-facts-upload.mjs <file>            preview: validate and show what changes
//   node devtools/company-facts-upload.mjs <file> --apply    upload
//   node devtools/company-facts-upload.mjs --pull            copy the VM's record to .isa-local/company-facts/
//
// The record is private company data, so inside the repo only a file under the ignored
// .isa-local/ can be uploaded (the starter is a template, never the live record). The VM copy is the source of truth. Before
// replacing it, the tool checks that it is still the copy last uploaded or pulled from
// this machine. If someone else changed it, the upload stops: pull, merge, and retry.
// The replaced copy is kept under workspace/backups/ on the VM.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COMPANY_FACTS_FILE, parseCompanyFacts } from '../workspace/scripts/rfp-company-facts.mjs';
import { summarizeCompanyFacts } from './company-facts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(repoRoot, '.isa-local', 'company-facts');
const stateFile = path.join(stateDir, 'last-known-vm.json');
const LIVE_RELATIVE = `resources/proposal-sources/${COMPANY_FACTS_FILE}`;
const VALIDATOR_RELATIVE = 'scripts/rfp-company-facts.mjs';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

// Field-level comparison by fact id, so the preview says what an upload changes in words.
export function diffFacts(before, after) {
  const old = new Map(before.map(fact => [fact.id, fact]));
  const next = new Map(after.map(fact => [fact.id, fact]));
  const lines = [];
  for (const [id, fact] of next) {
    const was = old.get(id);
    if (!was) { lines.push(`  added    ${id} (${fact.status})`); continue; }
    const fields = [...new Set([...Object.keys(was), ...Object.keys(fact)])]
      .filter(key => JSON.stringify(was[key]) !== JSON.stringify(fact[key]));
    if (!fields.length) continue;
    const status = was.status !== fact.status ? `: ${was.status} -> ${fact.status}` : '';
    lines.push(`  changed  ${id}${status} (${fields.join(', ')})`);
  }
  for (const id of old.keys()) if (!next.has(id)) lines.push(`  removed  ${id}`);
  return lines;
}

// Decides whether the VM copy may be replaced. lastKnown is the hash this machine last
// uploaded or pulled; null means this machine has never seen a VM copy.
export function uploadDecision({ vmHash, lastKnown, localHash }) {
  if (vmHash === localHash) return { ok: false, reason: 'The VM already has this exact record. Nothing to upload.' };
  if (vmHash === null && lastKnown === null) return { ok: true };
  if (vmHash === null) return { ok: false, reason: 'The VM record was deleted since this machine last saw it. Find out why before uploading.' };
  if (vmHash !== lastKnown) {
    return { ok: false, reason: 'The VM record changed since this machine last uploaded or pulled it. Run npm run facts:upload -- --pull, merge your edits into that copy, and upload again.' };
  }
  return { ok: true };
}

async function readState() {
  try { return JSON.parse(await fs.readFile(stateFile, 'utf8')).hash ?? null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeState(hash, how) {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(stateFile, `${JSON.stringify({ hash, how, time: new Date().toISOString() })}\n`);
}

// Inside the repo, only the Git-ignored .isa-local/ may hold the live record. This
// stops the starter template, or a filled copy saved beside it, from replacing it.
export function assertPrivateLocation(file, root = repoRoot) {
  const inside = (dir, target) => { const rel = path.relative(dir, target); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
  const resolved = path.resolve(file);
  if (inside(root, resolved) && !inside(path.join(root, '.isa-local'), resolved)) {
    throw new Error('The live record is private and must stay out of Git. Copy it to .isa-local/company-facts/ (ignored by Git) or outside the repo, fill it in there, and upload that copy.');
  }
}

async function main(args) {
  const live = await import('./isa-live.mjs');
  const { remote, run, sshSettings, liveConfig } = live;
  if (!liveConfig.sourceRoot.startsWith('/home/azureuser/.openclaw/workspace')) throw new Error('Unexpected ISA source root');
  const livePath = path.posix.join(liveConfig.sourceRoot, LIVE_RELATIVE);
  const scp = (from, to) => {
    const { key } = sshSettings();
    return run('scp', ['-p', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-i', key, from, to]);
  };
  const vmPath = remotePath => `${sshSettings().destination}:${remotePath}`;
  async function vmRecord() {
    const result = await remote(['sh', '-c', 'if [ -f "$0" ]; then cat -- "$0"; elif [ -e "$0" ]; then exit 42; else printf __MISSING__; fi', livePath]);
    return result.stdout === '__MISSING__' ? null : result.stdout;
  }

  if (args.length === 1 && args[0] === '--pull') {
    const text = await vmRecord();
    if (text === null) { console.log('The VM has no company-facts record yet.'); return; }
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    const out = path.join(stateDir, `vm-copy-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`);
    await fs.writeFile(out, text, { mode: 0o600 });
    await writeState(sha256(text), 'pull');
    console.log(`Saved the VM record to ${path.relative(repoRoot, out)}. Edit a copy of it, then upload.`);
    return;
  }

  const file = args.find(arg => !arg.startsWith('--'));
  const unknown = args.filter(arg => arg.startsWith('--') && arg !== '--apply');
  if (!file || unknown.length || args.filter(arg => !arg.startsWith('--')).length > 1) {
    throw new Error('Usage: npm run facts:upload -- <file> [--apply], or npm run facts:upload -- --pull');
  }
  assertPrivateLocation(file);
  const text = await fs.readFile(file, 'utf8');
  const facts = parseCompanyFacts(text);
  const localHash = sha256(text);

  const vmText = await vmRecord();
  const vmHash = vmText === null ? null : sha256(vmText);
  console.log(vmText === null ? 'The VM has no record yet; this would be the first upload.' : 'Changes compared with the VM record:');
  if (vmText !== null) {
    let vmFacts = null;
    try { vmFacts = parseCompanyFacts(vmText); } catch { console.log('  (the VM record does not parse; every fact would be replaced)'); }
    if (vmFacts) { const lines = diffFacts(vmFacts, facts); console.log(lines.length ? lines.join('\n') : '  (formatting only)'); }
  }
  console.log('');
  console.log(summarizeCompanyFacts(facts, new Date().toISOString().slice(0, 10)));
  console.log('');

  const decision = uploadDecision({ vmHash, lastKnown: await readState(), localHash });
  if (!decision.ok) throw new Error(decision.reason);
  if (!args.includes('--apply')) { console.log(`Preview only. To upload, run npm run facts:upload -- ${file} --apply`); return; }

  // Stage beside the backups, validate with the VM's own parser (so the upload stops if
  // the scoring code that reads the record isn't deployed yet), then swap in with mv.
  const releaseId = `facts-upload-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
  const backupRoot = path.posix.join(liveConfig.sourceRoot, 'backups', releaseId);
  const stagePath = path.posix.join(backupRoot, 'staged.json');
  const backupPath = path.posix.join(backupRoot, 'original.json');
  await remote(['mkdir', '-p', '--', backupRoot, path.posix.dirname(livePath)]);
  await scp(path.resolve(file), vmPath(stagePath));
  const validator = path.posix.join(liveConfig.sourceRoot, VALIDATOR_RELATIVE);
  const check = `import fs from 'node:fs'; const m = await import(${JSON.stringify(`file://${validator}`)}); ` +
    `console.log(m.parseCompanyFacts(fs.readFileSync(${JSON.stringify(stagePath)}, 'utf8')).length);`;
  const validated = await remote(['node', '--input-type=module', '-e', check], { allowFailure: true });
  if (validated.code !== 0) {
    throw new Error(`The VM could not validate the record. If ${VALIDATOR_RELATIVE} is missing there, deploy the scoring code first. ${validated.stderr.trim().slice(-300)}`);
  }
  const hashOf = async remoteFile => {
    const result = await remote(['sh', '-c', 'if [ -f "$0" ]; then sha256sum -- "$0"; else printf __MISSING__; fi', remoteFile]);
    return result.stdout === '__MISSING__' ? null : result.stdout.trim().split(/\s+/)[0];
  };
  if (await hashOf(stagePath) !== localHash) throw new Error('The staged copy does not match the local file. Nothing was replaced.');
  if (await hashOf(livePath) !== vmHash) throw new Error('The VM record changed during the upload. Nothing was replaced; pull and retry.');
  if (vmHash) await remote(['cp', '-p', '--', livePath, backupPath]);
  await remote(['chmod', '600', '--', stagePath]);
  await remote(['mv', '--', stagePath, livePath]);
  if (await hashOf(livePath) !== localHash) throw new Error(`Uploaded record failed its hash check. The previous copy is at ${backupPath}.`);
  await writeState(localHash, 'upload');
  console.log(`Uploaded ${facts.length} facts. ${vmHash ? `The previous record is backed up at ${backupPath}.` : ''}`.trim());
  console.log('The next RFP scoring run reads it. Nothing was restarted.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
