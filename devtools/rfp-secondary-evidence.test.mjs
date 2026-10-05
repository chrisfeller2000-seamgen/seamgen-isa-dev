import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { classifyDocumentRecord } from '../workspace/scripts/highergov-document-flow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('file names identify the actual solicitation, not finals, agendas, rating forms, or addenda', () => {
  const roles = {
    'RFP_Final.pdf': 'solicitation',
    'RFP_26-118_Website_Redesign.pdf': 'solicitation',
    'Request_for_Proposals.pdf': 'solicitation',
    'RFP 26-118 Website Redesign.pdf': 'solicitation',
    'Solicitation 26-118.pdf': 'solicitation',
    'RFP 26-118 Addendum 1.pdf': 'addendum',
    'RFP_RATING_FORM.pdf': 'evaluation',
    'Final Rating Form.pdf': 'evaluation',
    'Final Agenda.pdf': 'other',
    'Attachment A - Pricing Form.xlsx': 'requirements',
  };
  for (const [fileName, role] of Object.entries(roles)) {
    assert.equal(classifyDocumentRecord({ file_name: fileName }).role, role, fileName);
  }
});

// [scenario, fetchStatus, reason] — every row except `complete` must stay unscored.
const expectations = [
  ['complete', 'downloaded', null],
  ['empty', 'document-list-empty', /^HigherGov returned no documents\.$/],
  ['hardware-empty', 'document-list-empty', /^HigherGov returned no documents\.$/],
  ['no-text', 'partial-documents', /^No extractable solicitation file was saved\.$/],
  ['agenda-only', 'partial-documents', /^No extractable solicitation file was saved\.$/],
  ['price-sheet-only', 'partial-documents', /^No extractable solicitation file was saved\.$/],
  ['missing-attachment', 'partial-documents', /^Missing or unreadable required document: Attachment A - Scope of Work\.txt$/],
  ['download-error', 'failed', /^Document download failed before any usable file was saved\.$/],
  ['attachment-download-error', 'partial-documents', /^Missing or unreadable required document: Attachment A - Scope of Work\.txt$/],
  ['portal-gated', 'access-blocked', /^The returned documents were portal-gated\.$/],
  ['list-error', 'failed', /^Document retrieval failed\.$/],
  ['no-document-path', 'access-blocked', /^HigherGov listing has no documents link\.$/],
  ['not-found', 'failed', /^Listing could not be found again in HigherGov\.$/],
  ['no-capture', 'metadata-only', /^Listing could not be looked up in HigherGov \(no capture date\)\.$/],
  ['lookup-error', 'failed', /^Document retrieval failed\.$/],
];

test('secondary scorer gives no final score or verdict without a readable solicitation', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-secondary-evidence-'));
  const slugPrefix = `synthetic-evidence-${process.pid}-`;
  try {
    const reportDir = path.join(workspace, 'reports', 'new-rfp-qualification');
    await fs.mkdir(reportDir, { recursive: true });
    await fs.mkdir(path.join(workspace, 'tools'));
    await fs.writeFile(path.join(workspace, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled' }));
    const state = JSON.stringify({ watermark: 'do-not-advance' });
    const statePath = path.join(workspace, 'RFP-pipeline', 'state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, state);

    const candidateTexts = new Map();
    const reportLines = [];
    for (const [index, [name]] of expectations.entries()) {
      const title = `Synthetic Evidence ${name}`;
      const preliminary = 75 + (index * 3) % 20;
      const captured = name === 'no-capture' ? '' : `captured_date: ${name === 'lookup-error' ? '2026-09-21' : '2026-09-22'}\n`;
      // A listing that mentions hardware would fail keyword Gate 3; without documents that must not become a No-bid.
      const body = name === 'hardware-empty'
        ? 'Custom web portal build. The listing also mentions hardware refresh.\n'
        : 'Custom web portal build with secure data integration and accessibility.\n';
      const text = `---\ntitle: ${title}\nslug: ${slugPrefix}${name}\nagency_name: State of Example\nversion_key: evidence-${name}\nopp_key: evidence-${name}-opp\n${captured}due_date: 2026-10-26\npreliminary_score: ${preliminary}\nval_est_low: 180000\n---\n${body}`;
      const dir = path.join(workspace, 'RFP-pipeline', 'candidates', `${slugPrefix}${name}`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'candidate.md'), text);
      candidateTexts.set(path.join(dir, 'candidate.md'), text);
      reportLines.push(`### ${title}\n- Preliminary score: ${preliminary}\n`);
    }
    const inputReport = path.join(reportDir, '2026-09-28.md');
    await fs.writeFile(inputReport, reportLines.join('\n'));

    const child = spawnSync(process.execPath, ['--import', path.join(root, 'devtools/fixtures/secondary-evidence-fetch.mjs'), path.join(root, 'workspace/scripts/secondary-fulltext-score.mjs')], {
      cwd: root,
      env: {
        WORKSPACE_DIR: workspace, HIGHERGOV_API_KEY: 'fixture-key',
        RFP_RUN_DATE: '2026-09-28', RFP_PRELIM_REPORT_PATH: inputReport,
        ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      },
      encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);

    const jsonText = await fs.readFile(path.join(reportDir, '2026-09-28-secondary-fulltext.json'), 'utf8');
    const markdown = await fs.readFile(path.join(reportDir, '2026-09-28-secondary-fulltext.md'), 'utf8');
    const { summary, results } = JSON.parse(jsonText);
    assert.equal(results.length, expectations.length);

    for (const [name, fetchStatus, reason] of expectations) {
      const row = results.find(item => item.title === `Synthetic Evidence ${name}`);
      assert.ok(row, name);
      assert.equal(row.fetchStatus, fetchStatus, name);
      if (name === 'complete') {
        assert.equal(typeof row.fulltext_score, 'number', name);
        assert.notEqual(row.recommendation, 'Needs documents', name);
        assert.equal(row.timeline.status, 'verified', name);
        continue;
      }
      assert.equal(row.recommendation, 'Needs documents', name);
      assert.equal(row.fulltext_score, null, name);
      assert.equal(row.categories, null, name);
      assert.ok([1, 2, 3, 4, 5, 6].every(n => row.gate[`gate${n}`] === null), `${name}: no gate verdict from listing text`);
      assert.match(row.fetchReason, reason, name);
      assert.ok(Number.isFinite(row.preliminary_score) && row.preliminary_score >= 75, `${name}: preliminary score kept`);
      // The listing deadline stays visible but is never treated as verified.
      assert.equal(row.timeline.status, 'metadata-only', name);
      assert.equal(row.gate.gate1Days, row.timeline.days, name);
    }

    const needsDocuments = expectations.length - 1;
    assert.equal(summary.needsDocuments, needsDocuments);
    assert.equal(summary.strongPursue + summary.worthALook + summary.noBid + summary.deadlineNeedsReview + summary.needsDocuments, summary.total);

    // Scored rows first; then Needs documents, highest preliminary score first.
    const firstNeeds = results.findIndex(row => row.recommendation === 'Needs documents');
    assert.ok(results.slice(firstNeeds).every(row => row.recommendation === 'Needs documents'));
    const needsScores = results.slice(firstNeeds).map(row => row.preliminary_score);
    assert.deepEqual(needsScores, [...needsScores].sort((a, b) => b - a));

    assert.match(markdown, new RegExp(`^- Needs documents: ${needsDocuments}$`, 'm'));
    assert.ok(markdown.indexOf('### Synthetic Evidence complete') < markdown.indexOf('## Needs documents'));
    // Provider errors and download links can carry keys or signed URLs; reports must not repeat them.
    for (const output of [jsonText, markdown]) {
      assert.doesNotMatch(output, /secret-token|fixture-key|fixture\.invalid|api_key/);
    }

    for (const [candidatePath, text] of candidateTexts) assert.equal(await fs.readFile(candidatePath, 'utf8'), text);
    assert.equal(await fs.readFile(statePath, 'utf8'), state);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
    // The scorer saves downloads under uniquely named temp folders; remove only this test's.
    for (const entry of await fs.readdir(os.tmpdir(), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(`secondary-fulltext-${slugPrefix}`)) {
        await fs.rm(path.join(os.tmpdir(), entry.name), { recursive: true, force: true });
      }
    }
  }
});
