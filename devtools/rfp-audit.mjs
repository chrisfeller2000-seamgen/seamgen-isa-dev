#!/usr/bin/env node
// Pulls one weekly RFP audit file from ISA's VM (read-only) and turns it into a spreadsheet.
//
// Usage: npm run rfp:audit -- <run date, e.g. 2026-10-16 | path/to/audit.jsonl>
// With a run date, copies reports/new-rfp-qualification/audit/<run date>.jsonl from the VM
// into .isa-local/audit/. Either way writes a .csv next to it: one row per RFP, for Excel or
// Sheets. The audit holds RFP and contact data, so it stays in the ignored .isa-local/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveConfig, remote } from './isa-live.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATES = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
// Jake's eight categories, keyed as the scorer stores them, with spreadsheet headings.
const CATEGORIES = { caseStudy: 'case study', agencyTypeScore: 'agency type', tech: 'tech stack', ai: 'AI', deal: 'deal size',
  compliance: 'compliance', competitive: 'competitive', timeline: 'timeline' };

// Listing titles come from public postings; a cell starting with = + - or @ would run as a
// spreadsheet formula, so it is kept as text.
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const gateWord = pass => (pass === true ? 'pass' : pass === false ? 'fail' : 'open');

/** One CSV row per audit line, decided stage first: the document scores when there are any. */
export function auditCsv(records) {
  const header = ['run date', 'title', 'agency', 'state', 'listing due', 'tier', 'reason', 'why', 'recommendation', 'score',
    'score if confirmed', 'listing score', 'document score', 'documents', 'documents read', 'scoring error', 'tries',
    ...GATES.map(name => name.replace('gate', 'gate ')), ...Object.values(CATEGORIES), 'HigherGov link', 'agency link', 'HigherGov version'];
  const rows = records.map(record => {
    const decided = record.fullText || record.listing || {};
    const files = record.documents?.files || [];
    const error = record.fullText?.error || record.listing?.error;
    return [
      record.run?.date, record.rfp.title, record.rfp.agency, record.rfp.state, record.rfp.listingDue,
      record.outcome.tier, record.outcome.reason, record.outcome.detail, record.outcome.recommendation, record.outcome.score,
      record.outcome.scoreIfConfirmed, record.listing?.total ?? record.listing?.potentialTotal, record.fullText?.total ?? record.fullText?.potentialTotal,
      record.documents?.status, files.length ? `${files.filter(file => file.read).length} of ${files.length}` : '',
      error ? [error.stage, error.detail].filter(Boolean).join(': ') : '', decided.attempts,
      ...GATES.map(name => (decided.gates ? gateWord(decided.gates[name]?.pass) : '')),
      ...Object.keys(CATEGORIES).map(name => decided.categories?.[name]),
      record.rfp.links?.highergov, record.rfp.links?.posting, record.rfp.versionKey,
    ];
  });
  return `${[header, ...rows].map(row => row.map(cell).join(',')).join('\n')}\n`;
}

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: npm run rfp:audit -- <run date, e.g. 2026-10-16 | path/to/audit.jsonl>');
  let file = target;
  if (/^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(target)) {
    const remotePath = path.posix.join(liveConfig.sourceRoot, 'reports', 'new-rfp-qualification', 'audit', `${target}.jsonl`);
    const { stdout } = await remote(['cat', remotePath]);
    file = path.join(repoRoot, '.isa-local', 'audit', `${target}.jsonl`);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, stdout, { mode: 0o600 });
  }
  const records = (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  const csv = file.replace(/\.jsonl$/, '') + '.csv';
  await fs.writeFile(csv, auditCsv(records), { mode: 0o600 });
  const shown = item => (item.startsWith(repoRoot) ? path.relative(repoRoot, item) : item);
  console.log(`${records.length} RFP(s). Audit: ${shown(file)}  Spreadsheet: ${shown(csv)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
