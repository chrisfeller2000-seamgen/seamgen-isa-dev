import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { alignmentCases, rubricContract } from './fixtures/rfp-alignment-cases.mjs';
import { extractCalculationFunction, createAlignmentAdapter } from './rfp-alignment-adapter.mjs';
import { compareCheck, evaluateAlignment, alignmentMarkdown, getField, parseAlignmentArgs, runAlignmentCli } from './rfp-alignment.mjs';
import { buildScore } from '../workspace/scripts/secondary-fulltext-score.mjs';
import { createAssessmentContext } from '../workspace/scripts/rfp-deadline.mjs';
import { companySources, recordedJudgment } from './fixtures/rfp-recorded-judgments.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['weekly-rfp-pursue-decision.mjs', 'secondary-fulltext-score.mjs', 'highergov-document-flow.mjs', 'rfp-deadline.mjs', 'rfp-scoring-policy.mjs', 'rfp-scoring-judgment.mjs'];

test('alignment fixtures preserve the rubric, boundary cases, and honest approval status', () => {
  assert.equal(Object.values(rubricContract.categories).reduce((a, b) => a + b, 0), 100);
  assert.equal(new Set(alignmentCases.map(c => c.id)).size, alignmentCases.length);
  assert.match(rubricContract.reference.approval, /has not reviewed/);
  for (const fixture of alignmentCases) {
    assert.match(fixture.id, /^[a-z0-9-]+$/);
    assert.ok(['scoring', 'intake', 'documents'].includes(fixture.kind));
    for (const check of fixture.checks) {
      assert.ok(['eq', 'not', 'between', 'sameAs'].includes(check.op));
      assert.ok(check.rule);
      if (check.op === 'sameAs') assert.ok(alignmentCases.some(c => c.id === check.caseId));
    }
  }
  assert.equal(alignmentCases.find(c => c.id === 'value-5000').candidate.frontmatter.val_est_low, '5000');
  assert.equal(alignmentCases.find(c => c.id === 'value-99999').checks[0].expected, false);
  assert.equal(alignmentCases.find(c => c.id === 'value-100000').checks[0].expected, true);
  assert.equal(alignmentCases.find(c => c.id === 'value-unknown').checks[0].expected, true);
});

test('missing outputs never silently pass equality, inequality, or range checks', () => {
  for (const op of ['eq', 'not', 'between']) assert.equal(compareCheck({ field: 'missing.field', op, expected: op === 'between' ? [0, 100] : true }, {}, new Map()).passed, false);
  assert.equal(compareCheck({ field: 'value', op: 'eq', expected: null }, { value: null }, new Map()).passed, true);
  assert.equal(compareCheck({ field: 'value', op: 'between', expected: [0, 100] }, { value: NaN }, new Map()).passed, false);
  assert.equal(getField({ a: [{ b: 5 }] }, 'a.0.b'), 5);
  assert.throws(() => compareCheck({ field: 'value', op: 'mystery' }, {}, new Map()), /Unknown alignment operator/);
});

test('wording comparisons use the frozen control outcome, not a guessed score', () => {
  const check = { field: 'category', op: 'sameAs', caseId: 'control', otherField: 'category' };
  assert.equal(compareCheck(check, { category: 7 }, new Map([['control', { category: 7 }]])).passed, true);
  assert.equal(compareCheck(check, { category: 20 }, new Map([['control', { category: 7 }]])).passed, false);
  assert.throws(() => compareCheck(check, {}, new Map()), /Unknown control case/);
});

test('the adapter selects reviewed calculations and rejects duplicate/missing/drifted functions', () => {
  const source = 'throw new Error("never execute top level");\nfunction calculation(value) {\n  return value + 1;\n}\nmain();\n';
  const selected = extractCalculationFunction(source, 'calculation');
  assert.doesNotMatch(selected, /main\(|never execute/);
  assert.match(selected, /return value \+ 1/);
  assert.throws(() => extractCalculationFunction(source, 'missing'), /Expected one/);
  assert.throws(() => extractCalculationFunction(source + selected, 'calculation'), /found 2/);
  assert.throws(() => extractCalculationFunction('function calculation(value) {\n  return value;\n', 'calculation'), /closing brace/);
  assert.throws(() => extractCalculationFunction(source, 'calculation;main'), /Invalid calculation/);
});

test('report output cannot be redirected into tracked source or another workspace', () => {
  assert.equal(parseAlignmentArgs([]).workspace, path.join(root, 'workspace'));
  assert.throws(() => parseAlignmentArgs(['--out-dir=docs']), /Output must/);
  assert.throws(() => parseAlignmentArgs(['--out-dir=.isa-local/alignment']), /Output must/);
  assert.throws(() => parseAlignmentArgs(['--apply']), /Use --source/);
  assert.throws(() => parseAlignmentArgs(['--source-workspace=a', '--source-workspace=b']), /once each/);
});

test('secondary adapter outcomes equal the actual pure exported scorer, not a parallel implementation', async () => {
  const adapter = await createAlignmentAdapter(path.join(root, 'workspace'), rubricContract);
  const assessment = createAssessmentContext({ runDate: rubricContract.assessmentDate, reportingTimeZone: 'UTC' });
  for (const fixture of alignmentCases.filter(c => c.kind === 'scoring')) {
    const { gates, ...observed } = adapter.evaluate(fixture).secondary;
    const input = { candidate: fixture.candidate, documents: fixture.documents, assessment, companySources, phase: 'full-text' };
    const direct = buildScore(fixture.candidate, fixture.documents.map(d => d.text).join('\n\n'), { ...input, judgment: recordedJudgment(input) });
    assert.deepEqual(observed, JSON.parse(JSON.stringify(direct)), fixture.id);
    assert.deepEqual(gates, observed.gate);
  }
});

test('calculations are repeatable and do not evaluate business-job top-level code or write runtime state', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-alignment-isolation-'));
  try {
    await fs.mkdir(path.join(temporary, 'scripts'));
    for (const file of files) {
      const source = await fs.readFile(path.join(root, 'workspace', 'scripts', file), 'utf8');
      await fs.writeFile(path.join(temporary, 'scripts', file), ['weekly-rfp-pursue-decision.mjs', 'secondary-fulltext-score.mjs'].includes(file) ? 'throw new Error("business module must not execute");\n' + source : source);
    }
    await fs.mkdir(path.join(temporary, 'RFP-pipeline'));
    const statePath = path.join(temporary, 'RFP-pipeline', 'state.json');
    await fs.writeFile(statePath, '{"watermark":"must-not-advance"}');
    const before = await Promise.all(files.map(file => fs.readFile(path.join(temporary, 'scripts', file), 'utf8')));
    const first = await evaluateAlignment({ workspace: temporary });
    const second = await evaluateAlignment({ workspace: temporary });
    assert.deepEqual(first, second);
    assert.equal(first.summary.cases, alignmentCases.length);
    assert.equal(first.summary.checks, first.results.reduce((n, r) => n + r.checks.length, 0));
    assert.equal(first.summary.failedChecks, first.results.reduce((n, r) => n + r.checks.filter(c => !c.passed).length, 0));
    assert.equal(first.summary.failingCases, first.results.filter(r => !r.passed).length);
    assert.deepEqual(await Promise.all(files.map(file => fs.readFile(path.join(temporary, 'scripts', file), 'utf8'))), before);
    assert.equal(await fs.readFile(statePath, 'utf8'), '{"watermark":"must-not-advance"}');
    await assert.rejects(fs.access(path.join(temporary, 'reports')), { code: 'ENOENT' });
    assert.ok(first.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256)));
    const adapter = await createAlignmentAdapter(temporary, rubricContract);
    assert.equal(adapter.evaluate(alignmentCases.find(c => c.id === 'approval-date')).secondary.timeline.due, '2026-10-26');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('CLI exit code distinguishes business mismatches from runner errors and saves the complete breakdown', async () => {
  const reportDir = path.join(root, '.isa-local', 'alignment', `cli-test-${crypto.randomUUID()}`);
  try {
    const run = spawnSync(process.execPath, [path.join(root, 'devtools/rfp-alignment.mjs'), `--out-dir=${reportDir}`], { cwd: root, env: { TZ: 'Pacific/Auckland' }, encoding: 'utf8', timeout: 15_000 });
    const report = JSON.parse(await fs.readFile(path.join(reportDir, 'report.json'), 'utf8'));
    assert.equal(run.status, report.summary.failedChecks ? 1 : 0, run.stderr);
    assert.equal(report.runtimeTimeZone, 'UTC');
    const markdown = await fs.readFile(path.join(reportDir, 'report.md'), 'utf8');
    assert.equal(markdown, alignmentMarkdown(report));
    assert.match(markdown, /not a production job/i);
    assert.match(markdown, /not Jake-approved/i);
    assert.equal(report.results.length, alignmentCases.length);
    const invalid = spawnSync(process.execPath, [path.join(root, 'devtools/rfp-alignment.mjs'), '--apply'], { cwd: root, env: {}, encoding: 'utf8', timeout: 15_000 });
    assert.equal(invalid.status, 2);
  } finally {
    await fs.rm(reportDir, { recursive: true, force: true });
  }
});

test('an output-parent symlink is rejected before writing reports', { skip: process.platform === 'win32' ? 'Windows symlink permissions vary.' : false }, async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-alignment-symlink-'));
  const link = path.join(root, '.isa-local', 'alignment', `symlink-test-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(outside, link);
    await assert.rejects(runAlignmentCli([`--out-dir=${link}/report`]), /real directories/);
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.unlink(link);
    await fs.rm(outside, { recursive: true, force: true });
  }
});
