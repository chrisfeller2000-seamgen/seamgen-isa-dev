import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeRelative, differences, isIncluded } from './isa-live.mjs';

test('only approved source paths are included', () => {
  assert.equal(isIncluded('scripts/weekly-rfp-pursue-decision.mjs'), true);
  assert.equal(isIncluded('skills/rfp-scoring-skill.md'), true);
  assert.equal(isIncluded('RFP-pipeline/candidates/example/candidate.md'), false);
  assert.equal(isIncluded('backups/example/key.pem'), false);
});

test('unsafe and secret-like paths are rejected', () => {
  for (const value of ['../key.pem', '/etc/passwd', 'scripts/.env', 'scripts/key.pem', 'skills/a b.md']) {
    assert.throws(() => assertSafeRelative(value));
  }
  assert.equal(assertSafeRelative('tools/HigherGov.Common.ps1'), 'tools/HigherGov.Common.ps1');
});

// Deploy uploads every approved file under workspace/, and scripts/, skills/ and tools/
// are approved as whole folders, so a note saved there would reach the VM. Markdown
// under workspace/ must be what ISA reads; this repo's docs belong outside it.
test('workspace Markdown is only what ISA reads', async () => {
  const files = await fs.readdir(new URL('../workspace/', import.meta.url), { recursive: true });
  const readByIsa = file => file.startsWith('skills/') || file === 'tools/README.md' || (!file.includes('/') && isIncluded(file));
  const strays = files.map(file => file.replaceAll('\\', '/')).filter(file => file.endsWith('.md') && !readByIsa(file));
  assert.deepEqual(strays, []);
});

test('added, modified, and deleted files are reported', () => {
  const before = new Map([['a', { hash: '1' }], ['b', { hash: '2' }]]);
  const after = new Map([['a', { hash: '3' }], ['c', { hash: '4' }]]);
  assert.deepEqual(differences(before, after), [
    { file: 'a', kind: 'modified' },
    { file: 'b', kind: 'deleted' },
    { file: 'c', kind: 'added' }
  ]);
});
