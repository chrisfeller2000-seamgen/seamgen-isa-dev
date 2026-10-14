#!/usr/bin/env node
// Turns one weekly RFP audit file into a workbook with two tabs, same RFPs in the same order:
// - "Sales": plain words, one row per RFP (decision, why, due, budget, score, where it lost
//   points, what they want, links);
// - "Details": what a developer needs to find why something scored the way it did (each
//   gate, points out of their maximum, documents, scoring errors, tries, timing, versions).
// The audit file itself holds the rest: the listing text, the model's full answer and quotes.
//
// Usage: npm run rfp:audit -- <run date, e.g. 2026-10-16 | path/to/audit.jsonl>
// With a run date, copies reports/new-rfp-qualification/audit/<run date>.jsonl from the VM
// (read-only) into .isa-local/audit/. Either way writes a .xlsx next to it. The audit holds
// RFP and contact data, so it stays in the ignored .isa-local/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstSentence } from '../workspace/scripts/rfp-report.mjs';
import { CATEGORY_BANDS } from '../workspace/scripts/rfp-scoring-policy.mjs';
import { timelinePoints } from '../workspace/scripts/rfp-deadline.mjs';
import { liveConfig, remote } from './isa-live.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Jake's six kill gates, named for what passing means.
const GATE_NAMES = { gate1: '10+ days', gate2: 'Custom build', gate3: 'Not hardware', gate4: 'Can submit', gate5: '$100k+', gate6: 'Eligible' };
// Jake's categories and their maximums, from the rubric bands, so the workbook can't drift.
const CATEGORY_NAMES = { caseStudy: 'Case study', agencyTypeScore: 'Agency type', tech: 'Tech stack', ai: 'AI', deal: 'Deal size',
  compliance: 'Compliance', competitive: 'Competitive', timeline: 'Timeline' };
const CATEGORY_MAX = {
  ...Object.fromEntries(Object.entries(CATEGORY_BANDS).map(([key, bands]) => [key, Math.max(...Object.values(bands).map(range => range[1]))])),
  timeline: timelinePoints(365),
};
const DECISION_ORDER = ['Strong pursue', 'Worth a look', 'Ask the agency first', "Couldn't check yet", 'Screened out', 'Skipped before scoring'];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const finite = value => (Number.isFinite(value) ? value : null);
// Some category reasons are the model's own arithmetic ("5 neutral base −3 … = 2"), which
// says nothing to a reader; the competitive verdict says it plainly.
const ARITHMETIC = /=|\d\s*[−–-]\s*\d|(?:^|[\s,(])[-−+]\s*\d/;
const COMPETITIVE_PLAIN = { 'Insufficient evidence': 'no market research yet', 'Leaning wired': 'may be written for another vendor',
  Wired: 'looks written for another vendor' };
function categoryReason(stage, key) {
  if (key === 'timeline') return stage.deadline?.note || '';
  const reason = clean(stage.judgment?.categories?.[key]?.reason);
  if (reason && !ARITHMETIC.test(reason)) return reason;
  return key === 'competitive' ? COMPETITIVE_PLAIN[stage.judgment?.competitive?.verdict] || '' : '';
}
// HigherGov's summary when it has one, else the first sentence of the listing text.
const whatTheyWant = record => record.outcome.need || firstSentence(String(record.rfp.listingText || '').replace(/^## .*$/gm, ''), 200)
  || 'HigherGov gave no summary or description.';
// The stage that decided the outcome: the documents when they were read, else the listing.
const decided = record => record.fullText || record.listing || null;
const link = (text, url) => (url ? { text, hyperlink: url } : '');

function scoreText({ outcome }) {
  if (Number.isFinite(outcome.score)) return outcome.scoredFrom === 'listing' ? `${outcome.score} (listing only)` : `${outcome.score}`;
  if (Number.isFinite(outcome.scoreIfConfirmed)) return `${outcome.scoreIfConfirmed} if the open questions check out`;
  return '';
}

// The two categories that cost the most points, each with the scorer's reason.
function lostPoints(record) {
  const stage = decided(record);
  if (!stage?.categories) return '';
  return Object.keys(CATEGORY_NAMES)
    .map(key => ({ key, points: finite(stage.categories[key]), max: CATEGORY_MAX[key] }))
    .filter(item => item.points !== null && item.points < item.max)
    .sort((a, b) => (b.max - b.points) - (a.max - a.points))
    .slice(0, 2)
    .map(({ key, points, max }) => {
      const reason = categoryReason(stage, key);
      return `${CATEGORY_NAMES[key]} ${points}/${max}${reason ? `: ${firstSentence(reason, 110)}` : ''}`;
    })
    .join('\n');
}

function whyText({ outcome, documents }) {
  const extra = outcome.reason === 'documents' && documents?.reasons?.length ? ` ${documents.reasons.join(' ')}` : '';
  return `${outcome.why || ''}${extra}`;
}

const gateWord = pass => (pass === true ? 'pass' : pass === false ? 'fail' : 'open');
const stageScore = stage => finite(stage?.total) ?? finite(stage?.potentialTotal) ?? '';

const SALES = [
  { header: 'Decision', width: 20, value: r => r.outcome.decision },
  { header: 'Why', width: 60, wrap: true, value: whyText },
  { header: 'Title', width: 45, wrap: true, value: r => r.rfp.title },
  { header: 'Agency', width: 28, wrap: true, value: r => r.rfp.agency },
  { header: 'State', width: 7, value: r => r.rfp.state },
  { header: 'Due', width: 22, wrap: true, value: r => r.outcome.due || (r.rfp.listingDue ? `the listing says ${r.rfp.listingDue}` : '') },
  { header: 'Budget', width: 22, wrap: true, value: r => r.outcome.budget },
  { header: 'Score', width: 18, wrap: true, value: scoreText },
  { header: 'Lost points on', width: 55, wrap: true, value: lostPoints },
  { header: 'What they want', width: 60, wrap: true, value: whatTheyWant },
  { header: 'HigherGov', width: 12, value: r => link('HigherGov', r.rfp.links?.highergov) },
  { header: 'Agency posting', width: 14, value: r => link('Posting', r.rfp.links?.posting) },
];

const DETAILS = [
  { header: 'Title', width: 45, wrap: true, value: r => r.rfp.title },
  { header: 'Agency', width: 28, value: r => r.rfp.agency },
  { header: 'Decision', width: 20, value: r => r.outcome.decision },
  { header: 'Reason code', width: 16, value: r => r.outcome.reason },
  { header: 'Scored from', width: 12, value: r => r.outcome.scoredFrom },
  { header: 'Listing score', width: 9, value: r => stageScore(r.listing) },
  { header: 'Listing said', width: 18, value: r => r.listing?.recommendation },
  { header: 'Document score', width: 9, value: r => stageScore(r.fullText) },
  { header: 'Documents said', width: 18, value: r => r.fullText?.recommendation },
  ...Object.entries(GATE_NAMES).map(([key, name]) => ({ header: name, width: 9, value: r => (decided(r) ? gateWord(decided(r).gates?.[key]?.pass) : '') })),
  { header: 'Gate notes', width: 70, wrap: true, value: r => Object.entries(GATE_NAMES)
    .filter(([key]) => decided(r) && decided(r).gates?.[key]?.pass !== true && decided(r).gates?.[key]?.reason)
    .map(([key, name]) => `${name} (${gateWord(decided(r).gates[key].pass)}): ${clean(decided(r).gates[key].reason)}`).join('\n') },
  ...Object.entries(CATEGORY_NAMES).map(([key, name]) => ({ header: `${name} /${CATEGORY_MAX[key]}`, width: 9, value: r => finite(decided(r)?.categories?.[key]) ?? '' })),
  { header: 'Documents', width: 18, value: r => r.documents?.status },
  { header: 'Documents read', width: 10, value: r => (r.documents?.files?.length ? `${r.documents.files.filter(file => file.read).length} of ${r.documents.files.length}` : '') },
  { header: 'Missing documents', width: 40, wrap: true, value: r => (r.documents?.reasons || []).join(' ') },
  { header: 'Scoring error', width: 40, wrap: true, value: r => [r.listing?.error, r.fullText?.error].filter(Boolean)
    .map(error => [error.stage, error.detail].filter(Boolean).join(': ')).join('\n') },
  { header: 'Tries (listing / documents)', width: 12, value: r => [r.listing?.attempts, r.fullText?.attempts].filter(value => value != null).join(' / ') },
  { header: 'Seconds', width: 9, value: r => ([r.listing?.seconds, r.fullText?.seconds].some(Number.isFinite)
    ? [r.listing?.seconds, r.fullText?.seconds].filter(Number.isFinite).reduce((a, b) => a + b, 0) : '') },
  { header: 'Model', width: 22, value: r => decided(r)?.model },
  { header: 'Prompt', width: 14, value: r => decided(r)?.rules?.prompt },
  { header: 'Skills', width: 40, wrap: true, value: r => Object.entries(decided(r)?.rules?.skills || {})
    .map(([name, hash]) => `${name.replace(/-skill\.md$/, '')} ${hash}`).join('\n') },
  { header: 'HigherGov version', width: 34, value: r => r.rfp.versionKey },
  { header: 'Slug', width: 40, value: r => r.rfp.slug },
  { header: 'Run date', width: 11, value: r => r.run?.date },
];

/** Picks first, then by score; both tabs use this order so a row number means the same RFP. */
export function sortRecords(records) {
  const rank = record => DECISION_ORDER.indexOf(record.outcome.decision);
  const score = ({ outcome }) => finite(outcome.score) ?? finite(outcome.scoreIfConfirmed) ?? -1;
  return [...records].sort((a, b) => rank(a) - rank(b) || score(b) - score(a) || clean(a.rfp.title).localeCompare(clean(b.rfp.title)));
}

const rowsFor = (columns, records) => sortRecords(records).map(record => Object.fromEntries(columns.map(column => [column.header, column.value(record) ?? ''])));
export const salesRows = records => rowsFor(SALES, records);
export const detailRows = records => rowsFor(DETAILS, records);

export async function writeWorkbook(file, records) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  for (const [name, columns, rows] of [['Sales', SALES, salesRows(records)], ['Details', DETAILS, detailRows(records)]]) {
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map(column => ({ header: column.header, key: column.header, width: column.width }));
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((column, index) => {
      sheet.getColumn(index + 1).alignment = { vertical: 'top', wrapText: Boolean(column.wrap) };
    });
    sheet.eachRow((row, number) => row.eachCell(cell => {
      if (number > 1 && cell.value?.hyperlink) cell.font = { color: { argb: 'FF1155CC' }, underline: true };
    }));
  }
  await book.xlsx.writeFile(file);
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
  const workbook = `${file.replace(/\.jsonl$/, '')}.xlsx`;
  await writeWorkbook(workbook, records);
  const shown = item => (item.startsWith(repoRoot) ? path.relative(repoRoot, item) : item);
  console.log(`${records.length} RFP(s). Audit: ${shown(file)}  Workbook: ${shown(workbook)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
