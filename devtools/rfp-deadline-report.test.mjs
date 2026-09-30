import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = `synthetic-deadline-scoring-fixture-${process.pid}`;

test('secondary CLI persists corrected deadline, unresolved states, and matching report dates offline', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-deadline-report-'));
  const resources = new Set();
  try {
    const candidateDir = path.join(workspace, 'RFP-pipeline', 'candidates', slug);
    const reportDir = path.join(workspace, 'reports', 'new-rfp-qualification');
    await fs.mkdir(candidateDir, { recursive: true });
    await fs.mkdir(reportDir, { recursive: true });
    await fs.mkdir(path.join(workspace, 'tools'));
    await fs.writeFile(path.join(workspace, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled' }));
    const state = JSON.stringify({ watermark: 'do-not-advance', seen: ['synthetic-only'] });
    const statePath = path.join(workspace, 'RFP-pipeline', 'state.json');
    await fs.writeFile(statePath, state);
    const candidateText = `---
title: Synthetic Analytics Platform
slug: ${slug}
agency_name: State of Example
version_key: synthetic-deadline-version
opp_key: synthetic-deadline-opportunity
captured_date: 2026-09-22
due_date: 2026-10-26
preliminary_score: 80
val_est_low: 180000
---
Custom build a data warehouse on Azure with AI support and security. Incumbent and local vendor preference.
Proposal due date: October 26, 2026. This is a candidate note, not document evidence.
`;
    const candidatePath = path.join(candidateDir, 'candidate.md');
    await fs.writeFile(candidatePath, candidateText);
    const inputReport = path.join(reportDir, '2026-09-22.md');
    await fs.writeFile(inputReport, '### Synthetic Analytics Platform\n- Preliminary score: 80\n');
    for (const scenario of ['complete', 'empty', 'conflict', 'invalid']) {
      const child = spawnSync(process.execPath, ['--import', path.join(root, 'devtools/fixtures/secondary-deadline-fetch.mjs'), path.join(root, 'workspace/scripts/secondary-fulltext-score.mjs')], {
        cwd: root,
        env: {
          WORKSPACE_DIR: workspace, HIGHERGOV_API_KEY: 'fixture-key',
          RFP_RUN_DATE: '2026-09-28', RFP_PRELIM_REPORT_PATH: inputReport,
          ISA_DEADLINE_FIXTURE_SCENARIO: scenario,
          ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
        },
        encoding: 'utf8', timeout: 15_000,
      });
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(await fs.readFile(path.join(reportDir, '2026-09-28-secondary-fulltext.json'), 'utf8'));
      const row = result.results[0];
      if (row.resourcesDir) resources.add(row.resourcesDir);
      assert.equal(result.results.length, 1);
      assert.equal(result.summary.runDate, '2026-09-28');
      assert.equal(result.summary.assessmentOverrideUsed, true);
      assert.equal(row.gate.gate1Days, row.timeline.days);
      assert.equal(row.gate.gate1Due, row.timeline.due);
      const markdown = await fs.readFile(path.join(reportDir, '2026-09-28-secondary-fulltext.md'), 'utf8');
      assert.match(markdown, /Secondary Full-Text Scoring - 2026-09-28/);
      assert.doesNotMatch(markdown, /Secondary Full-Text Scoring - 2026-09-22/);
      if (scenario === 'complete') {
        assert.equal(row.timeline.due, '2026-10-26');
        assert.equal(row.timeline.days, 28);
        assert.equal(row.timeline.score, 4);
        assert.equal(row.timeline.status, 'verified');
        assert.equal(row.fulltext_score, 77);
        assert.equal(row.recommendation, 'Strong Pursue');
        assert.match(row.timeline.source.file, /Synthetic[ _]Solicitation\.txt/);
        assert.match(markdown, /2026-10-26 16:30 -04:00/);
      } else {
        assert.equal(row.fulltext_score, null);
        assert.equal(row.recommendation, 'Deadline needs review');
        assert.equal(result.summary.strongPursue, 0);
        assert.equal(result.summary.deadlineNeedsReview, 1);
        assert.equal(row.timeline.status, scenario === 'empty' ? 'metadata-only' : scenario === 'conflict' ? 'conflicting' : 'invalid');
        assert.equal(row.gate.gate1, null);
        assert.match(markdown, /Full-text: Not finalized/);
        if (scenario === 'empty') assert.equal(row.fetchStatus, 'document-list-empty');
      }
      assert.equal(await fs.readFile(statePath, 'utf8'), state);
      assert.equal(await fs.readFile(candidatePath, 'utf8'), candidateText);
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
    for (const dir of resources) {
      const parent = path.dirname(dir);
      if (path.dirname(parent) === os.tmpdir() && path.basename(parent).startsWith(`secondary-fulltext-${slug}-`)) await fs.rm(parent, { recursive: true, force: true });
    }
    // Empty-list runs create no report resource reference; remove only this test's
    // uniquely named empty scratch directories, never another task's temp files.
    for (const entry of await fs.readdir(os.tmpdir(), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(`secondary-fulltext-${slug}-`)) await fs.rm(path.join(os.tmpdir(), entry.name), { recursive: true, force: true });
    }
  }
});
