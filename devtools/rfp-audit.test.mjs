import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditDocuments, auditRecord, createAuditLog } from '../workspace/scripts/rfp-audit.mjs';
import { auditCsv } from './rfp-audit.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A whole Friday run in preview mode: intake replays one synthetic HigherGov day, the
// recorded judge scores, documents come from the fixture, and nothing is sent.
function weeklyRun(workspaceDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import', path.join(repoRoot, 'devtools', 'fixtures', 'weekly-run.mjs'),
      path.join(repoRoot, 'workspace', 'scripts', 'weekly-rfp-pursue-decision.mjs'),
    ], {
      cwd: repoRoot,
      env: {
        WORKSPACE_DIR: workspaceDir, HIGHERGOV_API_KEY: 'fixture-key', RFP_RUN_DATE: '2026-10-16',
        RFP_INTAKE_REPLAY: '2026-10-08:2026-10-08', RFP_DOCUMENT_FETCH_ENABLED: '1', RFP_DELIVERY: 'preview',
        NO_TELEGRAM: '1', RFP_EMAIL_TO: 'fixture@example.test', TELEGRAM_TARGET: 'fixture',
        // Only node: the HubSpot duplicate check's mcpjam and every other tool are missing.
        PATH: path.dirname(process.execPath),
        ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(stderr) : reject(new Error(stderr || `weekly run exited ${code}`))));
  });
}

async function syntheticWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-weekly-audit-'));
  const pipeline = path.join(root, 'RFP-pipeline');
  await fs.mkdir(path.join(root, 'tools'), { recursive: true });
  await fs.mkdir(path.join(pipeline, 'candidates'), { recursive: true });
  await fs.writeFile(path.join(root, 'tools', 'highergov-config.json'), JSON.stringify({ searchId: 'fixture-search', sourceType: 'sled', pageSize: 25, safetyLagDays: 1, seamgenProfile: {} }));
  await fs.writeFile(path.join(pipeline, 'state.json'), `${JSON.stringify({ schemaVersion: 1, searchId: 'fixture-search', highWaterCapturedDate: '2026-10-08', quota: {}, days: {} }, null, 2)}\n`);
  await fs.writeFile(path.join(pipeline, 'seen.csv'), 'version_key,opp_key,captured_date,seen_utc\n');
  return root;
}

const readLines = async file => (await fs.readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));

test("a weekly run keeps one audit line per RFP in the report, and a re-run never overwrites it", async () => {
  const root = await syntheticWorkspace();
  try {
    const reports = path.join(root, 'reports', 'new-rfp-qualification');
    await weeklyRun(root);
    const results = JSON.parse(await fs.readFile(path.join(reports, '2026-10-16.json'), 'utf8'));
    const audit = await readLines(path.join(reports, 'audit', '2026-10-16.jsonl'));
    // The audit says exactly what the report said, RFP for RFP.
    assert.deepEqual(audit.map(line => [line.rfp.slug, line.outcome.tier, line.outcome.score]).sort(),
      results.entries.map(entry => [entry.slug, entry.tier, entry.score]).sort());
    for (const line of audit) assert.deepEqual([line.schemaVersion, line.run], [1, { date: '2026-10-16', week: 42 }]);

    const portal = audit.find(line => line.rfp.versionKey === 'fixture-portal-v1');
    assert.equal(portal.outcome.tier, 'strong');
    assert.equal(portal.listing.recommendation, 'Strong Pursue');
    assert.equal(portal.listing.attempts, 1);
    assert.deepEqual(portal.documents.files.map(file => [file.name, file.read]),
      [['Synthetic RFP Solicitation.txt', true], ['Statement of Work Requirements.txt', true]]);
    assert.equal(portal.fullText.total, portal.outcome.score);
    assert.equal(portal.fullText.categories.caseStudy, 20);
    assert.match(portal.fullText.rules.skills['rfp-scoring-skill.md'], /^[0-9a-f]{12}$/);

    // A screened-out RFP keeps the gate that cut it and why; it never reached the documents.
    const renewal = audit.find(line => line.rfp.versionKey === 'fixture-renewal-v1');
    assert.deepEqual([renewal.outcome.tier, renewal.outcome.reason], ['screened', 'gate2']);
    assert.deepEqual(renewal.listing.gates.gate2, { pass: false, reason: 'Recorded test Gate 2 judgment' });
    assert.deepEqual([renewal.documents, renewal.fullText], [null, null]);

    // Download links and local paths stay in the manifest, out of the audit.
    assert.doesNotMatch(JSON.stringify(audit), /fixture\.invalid|api_key|local_path|isa-weekly-audit-/);

    await weeklyRun(root);
    assert.deepEqual((await fs.readdir(path.join(reports, 'audit'))).sort(), ['2026-10-16-2.jsonl', '2026-10-16.jsonl']);
    assert.equal((await readLines(path.join(reports, 'audit', '2026-10-16.jsonl'))).length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an audit file that cannot be written never stops the run', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-audit-blocked-'));
  try {
    const blocker = path.join(root, 'audit');
    await fs.writeFile(blocker, 'a file where the folder should be');
    const lines = [];
    const audit = await createAuditLog({ dir: path.join(blocker, 'inside'), run: { date: '2026-10-16', week: 42 }, log: line => lines.push(line) });
    assert.equal(audit.file, null);
    await audit.append({ any: 'record' });
    await audit.append({ any: 'record' });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[weekly-rfp\] audit file not written: /);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('audit lines cut long evidence quotes and keep file names, never paths or links', () => {
  const quote = 'x'.repeat(1000);
  const record = auditRecord({
    run: { date: '2026-10-16', week: 42 },
    entry: { slug: 's', title: 'T', agency: 'A', state: '', links: {}, tier: 'screened', reason: 'gate2', reasonDetail: 'Why', recommendation: 'No-bid', score: null, scoreIfYes: null, scoredFrom: 'listing' },
    candidate: { frontmatter: { version_key: 'v1', opp_key: 'unknown', due_date: '2026-11-30' } },
    preliminary: { recommendation: 'No-bid', gate: { gate2: false }, gateReasons: [{ gate: 'Gate 2', pass: false, reason: 'Product buy' }],
      judgments: { gates: { gate2: { pass: false, reason: 'Product buy', evidence: [{ sourceId: 'metadata', quote }] } } } },
  });
  assert.equal(record.rfp.oppKey, null);
  assert.deepEqual(record.listing.gates.gate1, { pass: null, reason: null });
  assert.deepEqual(record.listing.gates.gate2, { pass: false, reason: 'Product buy' });
  assert.equal(record.listing.judgment.gates.gate2.evidence[0].quote, `${'x'.repeat(300)}…`);

  const documents = auditDocuments('partial-documents', { documents: [
    { source_file_name: 'RFP.pdf', local_path: '/home/azureuser/x/RFP.pdf', download_url: 'https://signed.example/RFP.pdf', downloaded: true, extracted: true, role: 'solicitation', document_status: 'downloaded and extracted', extraction_method: 'pdftotext' },
    { source_file_name: 'Exhibit A.pdf', downloaded: false },
  ] });
  assert.deepEqual(documents, { status: 'partial-documents', files: [
    { name: 'RFP.pdf', role: 'solicitation', read: true, status: 'downloaded and extracted', method: 'pdftotext' },
    { name: 'Exhibit A.pdf', role: null, read: false, status: 'not downloaded', method: null },
  ] });
});

test('the audit spreadsheet has one row per RFP and keeps listing text from running as formulas', () => {
  const line = {
    run: { date: '2026-10-16', week: 42 },
    rfp: { title: '=HYPERLINK("x") portal', agency: 'City, State', state: 'CA', listingDue: '2026-11-30', links: { highergov: 'https://www.highergov.com/x', posting: '' }, versionKey: 'v1' },
    outcome: { tier: 'screened', reason: 'gate2', detail: 'Buys "an existing" product.', recommendation: 'No-bid', score: null, scoreIfConfirmed: null },
    listing: { total: null, potentialTotal: 61, gates: { gate1: { pass: true }, gate2: { pass: false }, gate3: { pass: null } }, categories: { caseStudy: 12 }, attempts: 2, error: null },
    documents: null, fullText: null,
  };
  const [header, row, end] = auditCsv([line]).split('\n');
  assert.equal(end, '');
  assert.match(header, /^run date,title,agency,state,listing due,tier,reason,why,recommendation,score,/);
  assert.match(row, /^2026-10-16,"'=HYPERLINK\(""x""\) portal","City, State",CA,2026-11-30,screened,gate2,"Buys ""an existing"" product\.",No-bid,,,61,,,,,2,pass,fail,open,open,open,open,12,/);
});
