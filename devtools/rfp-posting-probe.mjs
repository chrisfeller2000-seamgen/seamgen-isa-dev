// What would the Friday job find on the agency postings of a week's RFPs with missing
// documents? Reads a pulled audit file (`npm run rfp:audit -- <run date>` first).
//
// Usage: npm run rfp:posting-probe -- <run date | path/to/audit.jsonl> [--live]
//
// Without --live it makes no request: one row per posting site, with what rfp-portals.mjs
// knows about it. With --live it requests each posting the job would try, with the job's own
// limits and spacing, reading only the first 1 KB of each file and saving nothing. --live
// sends requests to agency sites, so run it only when that has been agreed. Results from a
// home connection can differ from the VM's (bot checks treat cloud addresses differently),
// and HigherGov's own PDFs aren't local here, so a portal summary's links are not followed.
// The result goes to .isa-local/posting-probe/<run date>.json, with no query strings.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostingBudget, fetchPostingDocuments, postingWithoutFetch, storedUrl } from '../workspace/scripts/posting-documents.mjs';
import { DOCUMENT_FETCH_THRESHOLD } from '../workspace/scripts/rfp-scoring-policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The RFPs the job would try: missing documents, listing score at the fetch threshold or above.
export function probeTargets(records) {
  return records.filter(record => ['documents', 'portal'].includes(record.outcome?.reason)
    && Number.isFinite(record.listing?.total) && record.listing.total >= DOCUMENT_FETCH_THRESHOLD);
}

export function hostTable(rows) {
  const byHost = new Map();
  for (const row of rows) {
    const key = row.outcome.host || '(no link)';
    const entry = byHost.get(key) || { host: key, portal: row.outcome.portal || '', access: row.outcome.access, rfps: 0, outcomes: {} };
    entry.rfps += 1;
    entry.outcomes[row.outcome.outcome] = (entry.outcomes[row.outcome.outcome] || 0) + 1;
    byHost.set(key, entry);
  }
  return [...byHost.values()].sort((a, b) => b.rfps - a.rfps || a.host.localeCompare(b.host));
}

async function main() {
  const [target, ...flags] = process.argv.slice(2);
  if (!target) throw new Error('Usage: npm run rfp:posting-probe -- <run date | path/to/audit.jsonl> [--live]');
  const live = flags.includes('--live');
  const file = /^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(target) ? path.join(repoRoot, '.isa-local', 'audit', `${target}.jsonl`) : path.resolve(target);
  const records = (await fs.readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const targets = probeTargets(records);
  const budget = createPostingBudget();
  const rows = [];
  for (const record of targets) {
    const postingUrl = record.rfp.links?.posting || '';
    const { outcome, rows: files } = live
      ? await fetchPostingDocuments({ postingUrl, budget, dryRun: true })
      : { outcome: postingWithoutFetch(postingUrl), rows: [] };
    rows.push({ title: record.rfp.title, listingScore: record.listing.total, documents: record.documents?.status || null, posting: storedUrl(postingUrl),
      outcome, files: files.map(row => ({ name: row.source_file_name, role: row.role, signature: row.signature || null, status: row.document_status, from: row.fetched_from })) });
    if (live) process.stderr.write(`${outcome.host || '-'} ${outcome.outcome} listed=${outcome.listed} ok=${outcome.downloaded}\n`);
  }
  const table = hostTable(rows);
  console.log(`${targets.length} RFP(s) at ${DOCUMENT_FETCH_THRESHOLD}+ with missing documents${live ? ' (live, dry run)' : ' (no requests made)'}:`);
  for (const entry of table) {
    console.log(`  ${String(entry.rfps).padStart(2)}  ${entry.host.padEnd(36)} ${(entry.portal || '-').padEnd(26)} ${entry.access.padEnd(13)} ${Object.entries(entry.outcomes).map(([key, n]) => `${key} ${n}`).join(', ')}`);
  }
  if (live) {
    const out = path.join(repoRoot, '.isa-local', 'posting-probe', `${path.basename(file, '.jsonl')}.json`);
    await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
    await fs.writeFile(out, `${JSON.stringify({ source: path.basename(file), probed: new Date().toISOString(), hosts: table, rfps: rows }, null, 2)}\n`, { mode: 0o600 });
    console.log(`Written: ${path.relative(repoRoot, out)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
