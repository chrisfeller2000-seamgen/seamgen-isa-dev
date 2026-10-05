import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { alignmentCases, rubricContract } from './fixtures/rfp-alignment-cases.mjs';
import { createAlignmentAdapter } from './rfp-alignment-adapter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getField(value, field) {
  return field.split('.').reduce((current, key) => current?.[key], value);
}

export function compareCheck(check, observation, observations) {
  const actual = getField(observation, check.field);
  let expected = check.expected;
  let passed;
  if (check.op === 'sameAs') {
    if (!observations.has(check.caseId)) throw new Error(`Unknown control case: ${check.caseId}`);
    expected = getField(observations.get(check.caseId), check.otherField);
    passed = actual !== undefined && expected !== undefined && isDeepStrictEqual(actual, expected);
  } else if (check.op === 'eq') passed = actual !== undefined && isDeepStrictEqual(actual, expected);
  else if (check.op === 'not') passed = actual !== undefined && !isDeepStrictEqual(actual, expected);
  else if (check.op === 'between') passed = typeof actual === 'number' && Number.isFinite(actual) && actual >= expected[0] && actual <= expected[1];
  else throw new Error(`Unknown alignment operator: ${check.op}`);
  return { ...check, expected, actual: actual === undefined ? '[not exposed]' : actual, passed };
}

export async function evaluateAlignment({ workspace = path.join(repoRoot, 'workspace'), cases = alignmentCases, contract = rubricContract } = {}) {
  const adapter = await createAlignmentAdapter(workspace, contract);
  const observations = new Map(cases.map(fixture => [fixture.id, adapter.evaluate(fixture)]));
  const results = cases.map(fixture => {
    const observation = observations.get(fixture.id);
    const checks = [...fixture.checks];
    if (fixture.kind === 'scoring') {
      for (const phase of ['weekly.preliminary', 'weekly.document']) {
        const result = getField(observation, phase);
        if (!result) continue;
        // Jake stops weighted scoring for gate failures and unresolved outcomes.
        // Keep the existing business assertions; the old unconditional numeric
        // invariant must not force a fabricated total on those routes.
        if (result.total === null) {
          checks.push({ field: phase + '.qualification_status', op: 'not', expected: 'qualified', rule: 'A non-finalized score cannot qualify.' });
          checks.push({ field: phase + '.recommendation', op: 'not', expected: 'Strong Pursue', rule: 'A non-finalized score cannot recommend pursuit.' });
        } else checks.push({ field: phase + '.total', op: 'between', expected: [0, 100], rule: 'A calculated total stays in the 0–100 scale.' });
      }
      for (const [category, max] of Object.entries(contract.categories)) checks.push({ field: `secondary.categories.${category}`, op: 'between', expected: [0, max], rule: 'Eight category limits match Jake’s rubric.' });
      if (observation.secondary.total !== null) {
        checks.push({ field: 'secondary.total', op: 'between', expected: [0, 100], rule: 'Secondary total stays in the 0–100 scale.' });
        checks.push({ field: 'secondary.total', op: 'eq', expected: Object.values(observation.secondary.categories).reduce((a, b) => a + b, 0), rule: 'Total equals the eight category scores.' });
      }
    }
    const evaluated = checks.map(check => compareCheck(check, observation, observations));
    return { id: fixture.id, name: fixture.name, kind: fixture.kind, passed: evaluated.every(c => c.passed), checks: evaluated, observation };
  });
  return {
    contract, sourceWorkspace: path.resolve(workspace), sources: adapter.sources,
    runtimeTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    scope: 'Pure calculations on synthetic fixtures. Not a production job, Jake model run, live provider check, or recreation of September 22 counts.',
    summary: { cases: results.length, passingCases: results.filter(r => r.passed).length, failingCases: results.filter(r => !r.passed).length, checks: results.reduce((n, r) => n + r.checks.length, 0), failedChecks: results.reduce((n, r) => n + r.checks.filter(c => !c.passed).length, 0) },
    results,
    coverageGaps: [
      'Jake’s reference is written policy, not an executable scoring function. Expected outcomes are derived, not Jake-approved or model-generated.',
      'The September 22 source batch and reviewed category breakdowns are not included; the 21-versus-88 count discrepancy has not been reproduced.',
      'Weekly observations are intake/preliminary/document calculations only, not scheduler execution, candidate persistence, or final workflow behavior.',
      'Named case-study grounding, conditional/partner decisions, all eight category explanations, and model repeatability need reviewed example outputs and a future model evaluation.',
      'No complete-package/provider integration, credential, report delivery, CRM, or scheduled feature-flag validation is performed.',
    ],
  };
}

function cell(value) {
  return JSON.stringify(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function alignmentMarkdown(report) {
  const { summary } = report;
  return [
    '# ISA / Jake rubric alignment — local baseline', '',
    `Assessment date: ${report.contract.assessmentDate} (${report.contract.assessmentTimeZone}); calculation runtime timezone: ${report.runtimeTimeZone}. All opportunities and company-profile facts are invented.`, '',
    `**${summary.passingCases}/${summary.cases} cases pass; ${summary.failingCases} cases fail, with ${summary.failedChecks} failed checks out of ${summary.checks}.**`, '',
    report.scope, '', `Expected-outcome status: ${report.contract.reference.approval}`, '',
    '## Rule mismatches', '', '| Case | Calculation / field | Expected | Observed | Rule |', '| --- | --- | --- | --- | --- |',
    ...report.results.flatMap(r => r.checks.filter(c => !c.passed).map(c => `| ${r.name} | ${c.field} | ${c.op === 'not' ? 'not ' : ''}${cell(c.expected)} | ${cell(c.actual)} | ${report.contract.rules[c.rule] || c.rule} |`)), '',
    '## Cases', '', '| Case | Result | Weekly preliminary | Weekly document calculation | Secondary calculation |', '| --- | --- | --- | --- | --- |',
    ...report.results.map(r => `| ${r.name} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.observation.weekly?.preliminary?.total ?? 'n/a'} | ${r.observation.weekly?.document?.total ?? 'n/a'} | ${r.observation.secondary ? `${r.observation.secondary.total ?? 'not finalized'} / ${r.observation.secondary.recommendation}` : 'n/a'} |`), '',
    '## Exact source tested', '', `Workspace: ${report.sourceWorkspace}`, '',
    ...report.sources.map(s => `- ${s.file}: ${s.sha256}`), '',
    `Jake archive commit: ${report.contract.reference.archiveCommit}; scoring skill SHA-256: ${report.contract.reference.scoringSkillSha256}.`, '',
    '## What this does not prove', '', ...report.coverageGaps.map(g => `- ${g}`), '',
    'Do not upload these files or enable document fetching based on this baseline. The alignment command intentionally exits nonzero while business-rule checks fail.', '',
  ].join('\n');
}

export function parseAlignmentArgs(args) {
  let workspace = path.join(repoRoot, 'workspace');
  let outDir = path.join(repoRoot, '.isa-local', 'alignment', 'tracked');
  const seen = new Set();
  for (const arg of args) {
    const match = arg.match(/^--(source-workspace|out-dir)=(.+)$/);
    if (!match || seen.has(match[1])) throw new Error('Use --source-workspace=path and/or --out-dir=path once each.');
    seen.add(match[1]);
    if (match[1] === 'source-workspace') workspace = path.resolve(match[2]);
    else outDir = path.resolve(match[2]);
  }
  // Reports are runtime output: never overwrite tracked docs/source or write into
  // an externally supplied workspace. Only ignored local alignment output is allowed.
  const allowed = path.join(repoRoot, '.isa-local', 'alignment');
  const relative = path.relative(allowed, outDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must be a subfolder of this worktree’s .isa-local/alignment/.');
  return { workspace, outDir };
}

async function ensureReportDirectory(outDir) {
  // Check every parent before mkdir/write: a symlink inside the ignored tree
  // must not redirect a generated report into source or another workspace.
  const parts = path.relative(repoRoot, outDir).split(path.sep);
  let current = repoRoot;
  for (const part of parts) {
    current = path.join(current, part);
    const existing = await fs.lstat(current).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('Report directory must contain only real directories.');
    if (!existing) await fs.mkdir(current, { mode: 0o700 });
  }
}

export async function runAlignmentCli(args = process.argv.slice(2)) {
  const { workspace, outDir } = parseAlignmentArgs(args);
  // Only this local CLI process is configured. No VM/environment file is changed.
  // Weekly date parsing depends on the host timezone, so fix that input too.
  process.env.TZ = 'UTC';
  const report = await evaluateAlignment({ workspace });
  await ensureReportDirectory(outDir);
  for (const [name, content] of [['report.json', JSON.stringify(report, null, 2) + '\n'], ['report.md', alignmentMarkdown(report)]]) {
    const target = path.join(outDir, name);
    const existing = await fs.lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing?.isSymbolicLink()) throw new Error('Refusing a report symlink.');
    await fs.writeFile(target, content, { mode: 0o600 });
  }
  console.log(`${report.summary.passingCases}/${report.summary.cases} cases pass; ${report.summary.failedChecks} rule checks fail. Reports: ${outDir}`);
  return report.summary.failedChecks ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAlignmentCli().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 2; });
}
