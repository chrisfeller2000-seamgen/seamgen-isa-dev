import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testSlug = 'synthetic-case-management-portal';

async function runFixture(workspaceDir, scenario = 'complete') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import', path.join(repoRoot, 'devtools', 'fixtures', 'highergov-fetch.mjs'),
      path.join(repoRoot, 'workspace', 'scripts', 'weekly-rfp-pursue-decision.mjs'),
      '--test-mode', '--candidate-slug', testSlug,
    ], {
      cwd: repoRoot,
      env: {
        WORKSPACE_DIR: workspaceDir,
        HIGHERGOV_API_KEY: 'fixture-key',
        RFP_RUN_DATE: '2026-09-24',
        RFP_DOCUMENT_FETCH_ENABLED: '1',
        NO_TELEGRAM: '1',
        REPORT_TO: 'fixture@example.test',
        TELEGRAM_TARGET: 'fixture',
        ISA_RFP_FIXTURE_SCENARIO: scenario,
        PATH: process.env.PATH || '',
        ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr || `Fixture exited ${code}`)));
  });
}

test('RFP document flow can fetch, extract, and score synthetic documents offline', async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-rfp-fixture-'));
  const tempDirs = [];
  try {
    await fs.mkdir(path.join(testRoot, 'tools'), { recursive: true });
    await fs.writeFile(path.join(testRoot, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled' }));
    const candidateDir = path.join(testRoot, 'RFP-pipeline', 'candidates', testSlug);
    await fs.mkdir(candidateDir, { recursive: true });
    await fs.writeFile(path.join(candidateDir, 'candidate.md'), `---
title: Synthetic Case Management Portal
agency_name: Example Public Agency
version_key: fixture-version-1
opp_key: fixture-opportunity-1
captured_date: 2026-09-24
due_date: 2026-11-30
val_est_low: 180000
source_url: https://example.test/synthetic-rfp
ai_summary: The agency wants a custom case management portal with data migration, API integration, accessibility, workflow design, and implementation services.
---
Synthetic fixture for an RFP processing test. No customer or production data is used.
`);
    const result = await runFixture(testRoot);
    tempDirs.push(result.tempDir);
    assert.equal(result.documentFlow.status, 'downloaded');
    assert.equal(result.documentFlow.documentRecords.length, 2);
    assert.equal(result.extracted.completeness.status, 'full-text');
    assert.equal(result.extracted.manifest.extracted_docs, 2);
    assert.equal(typeof result.final.score, 'number');
    assert.ok(result.final.score >= 0 && result.final.score <= 100);

    const empty = await runFixture(testRoot, 'empty');
    tempDirs.push(empty.tempDir);
    assert.equal(empty.documentFlow.status, 'access-blocked');
    assert.equal(empty.final, null);

    const gated = await runFixture(testRoot, 'portal-gated');
    tempDirs.push(gated.tempDir);
    assert.equal(gated.documentFlow.status, 'downloaded');
    assert.equal(gated.extracted.completeness.status, 'partial-documents');
    assert.equal(gated.final, null);
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
    for (const tempDir of tempDirs) {
      if (path.dirname(tempDir) === os.tmpdir() && path.basename(tempDir).startsWith(`rfp-test-${testSlug}-`)) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }
});
