import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { auditDocuments, auditRecord, auditSkippedRecord, createAuditLog } from '../workspace/scripts/rfp-audit.mjs';
import { detailRows, salesRows, writeWorkbook } from './rfp-audit.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A whole Friday run in preview mode: intake replays one synthetic HigherGov day, the
// recorded judge scores, documents come from the fixture, and nothing is sent.
function weeklyRun(workspaceDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import', pathToFileURL(path.join(repoRoot, 'devtools', 'fixtures', 'weekly-run.mjs')).href,
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

// The run's audit lines, kept for the workbook test.
let weeklyAudit = null;

test("a weekly run audits every listing it pulled, the report's RFPs line for line, and a re-run never overwrites it", async () => {
  const root = await syntheticWorkspace();
  try {
    const reports = path.join(root, 'reports', 'new-rfp-qualification');
    await weeklyRun(root);
    const results = JSON.parse(await fs.readFile(path.join(reports, '2026-10-16.json'), 'utf8'));
    const audit = await readLines(path.join(reports, 'audit', '2026-10-16.jsonl'));
    weeklyAudit = audit;
    // The audit says exactly what the report said, RFP for RFP.
    const scored = audit.filter(line => line.outcome.tier !== 'skipped');
    assert.deepEqual(scored.map(line => [line.rfp.slug, line.outcome.tier, line.outcome.score]).sort(),
      results.entries.map(entry => [entry.slug, entry.tier, entry.score]).sort());
    for (const line of audit) assert.deepEqual([line.schemaVersion, line.run], [1, { date: '2026-10-16', week: 42 }]);

    // Listings that never reached scoring are there too, with a plain reason.
    const skipped = audit.filter(line => line.outcome.tier === 'skipped');
    const dropped = skipped.find(line => line.rfp.versionKey === 'fixture-rush-v1');
    assert.equal(dropped.outcome.reason, 'intake-due-soon');
    assert.equal(dropped.outcome.why, 'It was due in 4 days when HigherGov listed it, under the 10-day minimum.');
    assert.equal(dropped.rfp.links.highergov, 'https://example.test/synthetic-rush');
    const duplicate = skipped.find(line => line.outcome.reason === 'duplicate');
    assert.equal(duplicate.outcome.why, 'Same RFP as "Synthetic Case Management Portal", which was scored instead.');
    assert.equal(skipped.length, 2);
    assert.equal(results.entries.length, 2);

    const portal = scored.find(line => line.rfp.title === 'Synthetic Case Management Portal');
    assert.equal(portal.outcome.tier, 'strong');
    assert.deepEqual([portal.outcome.decision, portal.outcome.budget], ['Strong pursue', '$180k (from the RFP)']);
    assert.match(portal.outcome.due, /^Nov 30/);
    assert.deepEqual(portal.outcome.blockers, ["Submitting needs a registration on the agency's portal."]);
    assert.match(portal.outcome.need, /custom case management portal/);
    assert.match(portal.rfp.listingText, /^## HigherGov AI summary/);
    assert.ok(Number.isFinite(portal.listing.seconds));
    assert.match(portal.fullText.rules.prompt, /^[0-9a-f]{12}$/);
    assert.deepEqual(portal.documents.reasons, []);
    assert.equal(portal.listing.recommendation, 'Strong Pursue');
    assert.equal(portal.listing.attempts, 1);
    assert.deepEqual(portal.documents.files.map(file => [file.name, file.read]),
      [['Synthetic RFP Solicitation.txt', true], ['Statement of Work Requirements.txt', true]]);
    assert.equal(portal.fullText.total, portal.outcome.score);
    assert.equal(portal.fullText.categories.caseStudy, 20);
    assert.match(portal.fullText.rules.skills['rfp-scoring-skill.md'], /^[0-9a-f]{12}$/);

    // A screened-out RFP keeps the gate that cut it and why; it never reached the documents.
    const renewal = audit.find(line => line.rfp.versionKey === 'fixture-renewal-v1');
    assert.deepEqual([renewal.outcome.tier, renewal.outcome.reason, renewal.outcome.why], ['screened', 'gate2', 'Recorded test judgment.']);
    assert.deepEqual(renewal.listing.gates.gate2, { pass: false, reason: 'Recorded test Gate 2 judgment' });
    assert.deepEqual([renewal.documents, renewal.fullText], [null, null]);

    // Download links and local paths stay in the manifest, out of the audit.
    assert.doesNotMatch(JSON.stringify(audit), /fixture\.invalid|api_key|local_path|isa-weekly-audit-/);

    await weeklyRun(root);
    assert.deepEqual((await fs.readdir(path.join(reports, 'audit'))).sort(), ['2026-10-16-2.jsonl', '2026-10-16.jsonl']);
    assert.equal((await readLines(path.join(reports, 'audit', '2026-10-16.jsonl'))).length, 4);
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
  assert.deepEqual(documents, { status: 'partial-documents', reasons: [], files: [
    { name: 'RFP.pdf', role: 'solicitation', read: true, status: 'downloaded and extracted', method: 'pdftotext' },
    { name: 'Exhibit A.pdf', role: null, read: false, status: 'not downloaded', method: null },
  ] });
});

test("the workbook's two tabs list the same RFPs in the same order: plain words for sales, the why for developers", async () => {
  assert.ok(weeklyAudit, 'runs after the weekly run test');
  const sales = salesRows(weeklyAudit);
  const details = detailRows(weeklyAudit);
  assert.deepEqual(sales.map(row => row.Decision), ['Strong pursue', 'Screened out', 'Skipped before scoring', 'Skipped before scoring']);
  assert.deepEqual(sales.map(row => row.Title), details.map(row => row.Title));
  const [pick, cut, , rush] = sales;
  assert.equal(pick.Why, "Submitting needs a registration on the agency's portal.");
  assert.match(pick.Score, /^\d+$/);
  // Where the points went, worst first, with the scorer's reason.
  assert.match(pick['Lost points on'], /^Case study 20\/25: Recorded comparable Azure portal/);
  assert.deepEqual(pick.HigherGov, { text: 'HigherGov', hyperlink: 'https://example.test/synthetic-portal' });
  assert.equal(cut.Why, 'Recorded test judgment.');
  assert.equal(rush['What they want'], 'The town wants its website refreshed within two weeks.');
  assert.deepEqual([details[1]['Custom build'], details[1]['10+ days']], ['fail', 'pass']);
  assert.match(details[1]['Gate notes'], /^Custom build \(fail\): Recorded test Gate 2 judgment/);
  assert.equal(details[0]['Case study /25'], 20);
  assert.equal(details[0]['Documents read'], '2 of 2');

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'isa-audit-workbook-'));
  try {
    const file = path.join(root, '2026-10-16.xlsx');
    await writeWorkbook(file, weeklyAudit);
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    assert.deepEqual(book.worksheets.map(sheet => [sheet.name, sheet.rowCount]), [['Sales', 5], ['Details', 5]]);
    const sheet = book.getWorksheet('Sales');
    assert.deepEqual(sheet.getRow(1).values.slice(1, 4), ['Decision', 'Why', 'Title']);
    assert.equal(sheet.getCell('K2').value.hyperlink, 'https://example.test/synthetic-portal');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a check row says what was missing, and a score says where it came from', () => {
  const base = { run: { date: '2026-10-14', week: 41 }, rfp: { title: 'T', agency: 'A', links: {} }, listing: null, fullText: null, documents: null };
  const [docs] = salesRows([{ ...base, outcome: { decision: "Couldn't check yet", reason: 'documents', why: "Couldn't get or read the RFP documents.", score: 69, scoredFrom: 'listing' },
    documents: { status: 'partial-documents', reasons: ['No extractable solicitation file was saved.'], files: [] } }]);
  assert.equal(docs.Why, "Couldn't get or read the RFP documents. No extractable solicitation file was saved.");
  assert.equal(docs.Score, '69 (listing only)');
  const [open] = salesRows([{ ...base, outcome: { decision: 'Worth a look', why: 'References unverified.', score: null, scoreIfConfirmed: 71 } }]);
  assert.equal(open.Score, '71 if the open questions check out');
  // Arithmetic isn't a reason; the competitive verdict is. A listing without a summary uses its own first sentence.
  const scored = { ...base, outcome: { decision: 'Worth a look', why: 'x', score: 66 }, rfp: { ...base.rfp, listingText: '## Opportunity description (verbatim from HigherGov)\nThe port wants a passenger app (RFP No. 26-1). It runs two years.' },
    fullText: { categories: { caseStudy: 25, competitive: 0 }, judgment: { competitive: { verdict: 'Insufficient evidence' }, categories: { competitive: { reason: '5 neutral base −3 structural = 2' } } } } };
  const [row] = salesRows([scored]);
  assert.equal(row['Lost points on'], 'Competitive 0/10: no market research yet');
  assert.equal(row['What they want'], 'The port wants a passenger app (RFP No. 26-1).');
  const skipped = auditSkippedRecord({ run: { date: '2026-10-14', week: '41' }, listing: { title: 'X', killReason: 'set-aside-not-held', setAside: 'Service-Disabled Veteran-Owned' } });
  assert.deepEqual([skipped.outcome.decision, skipped.outcome.why], ['Skipped before scoring', "It is set aside for Service-Disabled Veteran-Owned Seamgen doesn't hold."]);
});
