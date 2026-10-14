// The weekly RFP audit: one JSON line per RFP the Friday job scored, in
// reports/new-rfp-qualification/audit/<run date>.jsonl. Each run deletes the previous
// week's candidate files, so this is the only lasting record of why an RFP was picked,
// screened out or left unchecked: every gate and category decision with its reason, both
// scores, the documents read and any scoring failure. Lines are written as each RFP
// finishes, so a run that dies partway (as October 9's did) still leaves what it scored.
// Until ISA has a database this file is the record; each line can later be imported as one
// row keyed on HigherGov's version_key.
import fs from 'node:fs/promises';
import path from 'node:path';

export const AUDIT_SCHEMA_VERSION = 1;
const GATES = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
// Evidence quotes are cut to this length. The model's full answer quotes up to 4,000
// characters per citation, mostly the same listing text again and again; on October 14
// that was 7 MB for 185 RFPs, and about 1.7 MB with quotes cut here.
const QUOTE_CHARS = 300;

const finite = value => (Number.isFinite(value) ? value : null);
// Candidate frontmatter writes "unknown" for an empty field.
const known = value => {
  const text = String(value ?? '').trim();
  return text && text !== 'unknown' ? text : null;
};

function shortQuotes(value) {
  if (Array.isArray(value)) return value.map(shortQuotes);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'quote' && typeof item === 'string' && item.length > QUOTE_CHARS ? `${item.slice(0, QUOTE_CHARS)}…` : shortQuotes(item)]));
}

// One scoring pass (listing or full text): what code decided, and the model's answer it
// decided from.
function stage(result) {
  if (!result) return null;
  const reasons = Object.fromEntries((result.gateReasons || []).map(item => [item.gate.replace('Gate ', 'gate'), item.reason]));
  const timeline = result.timeline || {};
  const provenance = result.provenance || {};
  return {
    recommendation: result.recommendation ?? null,
    total: finite(result.total),
    // What the categories add up to while a gate is open; the report's "score if yes".
    potentialTotal: finite(result.potential_total),
    gates: Object.fromEntries(GATES.map(name => [name, { pass: result.gate?.[name] ?? null, reason: reasons[name] ?? null }])),
    categories: result.categories || null,
    reasons: result.reasons || [],
    deadline: result.timeline ? { status: timeline.status ?? null, due: timeline.due ?? null, time: timeline.time ?? null,
      days: finite(timeline.days), pass: timeline.pass ?? null, note: timeline.note ?? null } : null,
    value: result.value || null,
    error: result.scoring_error ? { stage: result.scoring_error, detail: result.scoring_error_detail || null } : null,
    model: provenance.model || null,
    attempts: provenance.attempts ?? null,
    // Which rules scored it, so an audit after a rule change compares like with like.
    rules: provenance.policyHashes
      ? { rubric: provenance.rubric || null, skills: Object.fromEntries(provenance.policyHashes.map(item => [item.name, item.sha256.slice(0, 12)])) }
      : null,
    judgment: shortQuotes(result.judgments ?? null),
  };
}

/**
 * What the run did with the RFP's documents: the fetch or extraction status and, per file,
 * its name, role and whether its text was read. File names only; the manifest's local
 * paths and download links stay out of the audit.
 */
export function auditDocuments(status, manifest = null) {
  const rows = Array.isArray(manifest?.documents) ? manifest.documents : [];
  return {
    status,
    files: rows.map(row => ({
      name: row.source_file_name || row.local_file_name || null,
      role: row.role || null,
      read: row.extracted === true,
      status: row.document_status || (row.downloaded ? 'downloaded' : 'not downloaded'),
      method: row.extraction_method || null,
    })),
  };
}

/**
 * One audit line. `entry` is the RFP's report entry (rfp-report.mjs), so the outcome is
 * exactly what the week's report said; `preliminary` and `final` are the scorer's results
 * for the listing and the documents.
 */
export function auditRecord({ run, entry, candidate, preliminary = null, final = null, documents = null }) {
  const frontmatter = candidate?.frontmatter || {};
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    // The results file keeps the ISO week as text ("42"); a number here imports cleanly.
    run: { date: run.date, week: Number(run.week) || null },
    rfp: {
      slug: entry.slug,
      versionKey: known(frontmatter.version_key),
      oppKey: known(frontmatter.opp_key),
      title: entry.title,
      agency: entry.agency,
      state: entry.state || null,
      captured: known(frontmatter.captured_date),
      listingDue: known(frontmatter.due_date),
      links: entry.links,
    },
    outcome: {
      tier: entry.tier,
      reason: entry.reason || null,
      detail: entry.reasonDetail || null,
      recommendation: entry.recommendation,
      score: entry.score,
      scoreIfConfirmed: entry.scoreIfYes,
      scoredFrom: entry.scoredFrom,
    },
    listing: stage(preliminary),
    documents,
    fullText: stage(final),
  };
}

/**
 * Opens this run's audit file. A second run on the same date gets its own file
 * (<run date>-2.jsonl), so a re-run never mixes with or replaces an earlier one. The audit
 * must never stop the Friday update: if the file can't be written, the job logs it once
 * and carries on without it.
 */
export async function createAuditLog({ dir, run, log = line => process.stderr.write(`${line}\n`) }) {
  let file = null;
  let failed = false;
  const fail = error => {
    if (!failed) log(`[weekly-rfp] audit file not written: ${error.message}`);
    failed = true;
  };
  try {
    await fs.mkdir(dir, { recursive: true });
    for (let copy = 1; !file; copy += 1) {
      const candidate = path.join(dir, `${run.date}${copy > 1 ? `-${copy}` : ''}.jsonl`);
      try {
        await (await fs.open(candidate, 'wx')).close();
        file = candidate;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  } catch (error) {
    fail(error);
  }
  return {
    file,
    async append(record) {
      if (!file || failed) return;
      await fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8').catch(fail);
    },
  };
}
