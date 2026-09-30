import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeRelative, differences, isIncluded, selectDeployment, expectedDeploymentSnapshot } from './isa-live.mjs';

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

test('added, modified, and deleted files are reported', () => {
  const before = new Map([['a', { hash: '1' }], ['b', { hash: '2' }]]);
  const after = new Map([['a', { hash: '3' }], ['c', { hash: '4' }]]);
  assert.deepEqual(differences(before, after), [
    { file: 'a', kind: 'modified' },
    { file: 'b', kind: 'deleted' },
    { file: 'c', kind: 'added' }
  ]);
});

test('scoped deployment selects exact files without replacing newer unselected VM files', () => {
  const before = new Map([
    ['scripts/secondary-fulltext-score.mjs', { hash: 'old' }],
    ['scripts/highergov-document-flow.mjs', { hash: 'newer-live' }],
  ]);
  const local = new Map([
    ['scripts/secondary-fulltext-score.mjs', { hash: 'fix' }],
    ['scripts/highergov-document-flow.mjs', { hash: 'older-local' }],
    ['scripts/rfp-deadline.mjs', { hash: 'new-helper' }],
  ]);
  const selection = selectDeployment(before, local, ['--files=scripts/secondary-fulltext-score.mjs,scripts/rfp-deadline.mjs']);
  assert.deepEqual(selection.changes.map(item => item.file), ['scripts/rfp-deadline.mjs', 'scripts/secondary-fulltext-score.mjs']);
  assert.deepEqual(selection.excluded.map(item => item.file), ['scripts/highergov-document-flow.mjs']);
  const expected = expectedDeploymentSnapshot(before, local, selection.changes);
  assert.equal(expected.get('scripts/highergov-document-flow.mjs').hash, 'newer-live');
  assert.equal(expected.get('scripts/secondary-fulltext-score.mjs').hash, 'fix');
  assert.equal(expected.get('scripts/rfp-deadline.mjs').hash, 'new-helper');
  const concurrent = new Map(expected);
  concurrent.set('scripts/highergov-document-flow.mjs', { hash: 'concurrent-edit' });
  assert.equal(differences(expected, concurrent).length, 1);
  assert.equal(selectDeployment(before, local, []).changes.length, 3);
});

test('deployment scope rejects unsafe paths, directories, duplicates, unknown flags and empty scopes', () => {
  const files = new Map([['scripts/example.mjs', { hash: 'a' }]]);
  for (const args of [
    ['--files='], ['--files=../secret'], ['--files=scripts'],
    ['--files=RFP-pipeline/private.md'], ['--files=scripts/missing.mjs'],
    ['--files=scripts/example.mjs,scripts/example.mjs'],
    ['--files=scripts/example.mjs', '--files=scripts/example.mjs'],
    ['--files', 'scripts/example.mjs'], ['--file=scripts/example.mjs'],
  ]) assert.throws(() => selectDeployment(files, files, args));
  assert.deepEqual(selectDeployment(files, files, ['--apply', '--files=scripts/example.mjs']).changes, []);
});

test('selected deletions remain visible for deployment refusal', () => {
  const before = new Map([['scripts/example.mjs', { hash: 'a' }]]);
  const local = new Map();
  const { changes } = selectDeployment(before, local, ['--files=scripts/example.mjs']);
  assert.equal(changes[0].kind, 'deleted');
  assert.throws(() => expectedDeploymentSnapshot(before, local, changes));
});
