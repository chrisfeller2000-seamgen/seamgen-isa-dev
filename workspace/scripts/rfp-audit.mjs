// The weekly RFP audit: one JSON line per listing the Friday job pulled, in
// reports/new-rfp-qualification/audit/<run date>.jsonl. Each run deletes the previous
// week's candidate files, so this is the only lasting record of why an RFP was picked,
// screened out, left unchecked, or skipped before scoring: every gate and category
// decision with its reason, both scores, the listing text the scorer read, the documents
// read and any scoring failure. Lines are written as each RFP finishes, so a run that dies
// partway (as October 9's did) still leaves what it scored. Until ISA has a database this
// file is the record; each line can later be imported as one row keyed on HigherGov's
// version_key.
import fs from 'node:fs/promises';
import path from 'node:path';
import { plainOutcome } from './rfp-report.mjs';
import { intakeText } from './rfp-scoring-policy.mjs';

export const AUDIT_SCHEMA_VERSION = 1;
const GATES = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'];
// Evidence quotes are cut to this length. The model's full answer quotes up to 4,000
// characters per citation, mostly the same listing text again and again; on October 14
// that was 7 MB for 185 RFPs, and about 1.7 MB with quotes cut here.
const QUOTE_CHARS = 300;
// The listing summary and description the scorer read; 170 of October 14's 185 RFPs were
// decided from it alone. Longer descriptions are rare and cut here.
const LISTING_CHARS = 6000;

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
    seconds: finite(provenance.seconds ?? result.scoring_seconds),
    // Which rules scored it, so an audit after a rule change compares like with like. The
    // prompt hash covers the code's own rules too; the skill hashes say which file changed.
    rules: provenance.policyHashes
      ? { rubric: provenance.rubric || null, prompt: provenance.promptSha256?.slice(0, 12) || null,
        skills: Object.fromEntries(provenance.policyHashes.map(item => [item.name, item.sha256.slice(0, 12)])) }
      : null,
    judgment: shortQuotes(result.judgments ?? null),
  };
}

/**
 * What the run did with the RFP's documents: the fetch or extraction status, why the set
 * was incomplete, and per file its name, role and whether its text was read. File names
 * only; the manifest's local paths and download links stay out of the audit.
 */
export function auditDocuments(status, manifest = null) {
  const rows = Array.isArray(manifest?.documents) ? manifest.documents : [];
  return {
    status,
    reasons: Array.isArray(manifest?.completeness?.reasons) ? manifest.completeness.reasons : [],
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
 * One audit line for a scored RFP. `entry` is its report entry (rfp-report.mjs), so the
 * outcome is exactly what the week's report said; `preliminary` and `final` are the
 * scorer's results for the listing and the documents.
 */
export function auditRecord({ run, entry, candidate, preliminary = null, final = null, documents = null }) {
  const frontmatter = candidate?.frontmatter || {};
  const plain = plainOutcome(entry);
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
      listingText: intakeText(candidate?.body).slice(0, LISTING_CHARS) || null,
    },
    outcome: {
      tier: entry.tier,
      reason: entry.reason || null,
      detail: entry.reasonDetail || null,
      decision: plain.decision,
      why: plain.why,
      recommendation: entry.recommendation,
      score: entry.score,
      scoreIfConfirmed: entry.scoreIfYes,
      scoredFrom: entry.scoredFrom,
      need: entry.need || null,
      budget: entry.budget?.text || null,
      due: entry.deadline?.text || null,
      questionsDue: entry.questionsDue?.text || null,
      blockers: (entry.blockers || []).map(item => item.text),
      openQuestions: entry.questions || [],
    },
    listing: stage(preliminary),
    documents,
    fullText: stage(final),
  };
}

// The intake prefilter's reasons (getHigherGovPrefilter), in the same plain words.
function intakeDrop(drop) {
  const days = finite(drop.daysUntilDue);
  if (drop.killReason === 'due-in-under-10-days') {
    return { reason: 'intake-due-soon', why: days !== null && days < 0
      ? 'It was already past due when HigherGov listed it.'
      : `It was due in ${days ?? 'under 10'} ${days === 1 ? 'day' : 'days'} when HigherGov listed it, under the 10-day minimum.` };
  }
  if (drop.killReason === 'set-aside-not-held') {
    return { reason: 'intake-set-aside', why: `It is set aside for ${drop.setAside || 'a category'} Seamgen doesn't hold.` };
  }
  if (drop.killReason === 'excluded-opp-type-rfi-sources-sought') {
    return { reason: 'intake-not-a-bid', why: `It is ${drop.oppType ? `a ${drop.oppType}` : 'an RFI or sources-sought notice'}, not a bid.` };
  }
  return { reason: 'intake-other', why: `The intake filter dropped it (${drop.killReason || 'no reason recorded'}).` };
}

/**
 * One audit line for a listing that never reached scoring: dropped by the intake filter,
 * or the same RFP as one already scored this run. Without these, "why didn't ISA mention
 * the RFP I saw on HigherGov?" had no answer: on October 14, 53 of 240 listings were
 * dropped at intake and 2 were duplicates.
 */
export function auditSkippedRecord({ run, listing, duplicateOf = null }) {
  const plain = duplicateOf
    ? { reason: 'duplicate', why: `Same RFP as "${duplicateOf}", which was scored instead.` }
    : intakeDrop(listing);
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    run: { date: run.date, week: Number(run.week) || null },
    rfp: {
      slug: listing.slug || null,
      versionKey: known(listing.versionKey),
      oppKey: known(listing.oppKey),
      title: listing.title || null,
      agency: listing.agency || null,
      state: listing.state || null,
      captured: known(listing.captured),
      listingDue: known(listing.due),
      links: listing.links || {},
      listingText: listing.listingText || null,
    },
    outcome: { tier: 'skipped', reason: plain.reason, detail: null, decision: 'Skipped before scoring', why: plain.why,
      recommendation: null, score: null, scoreIfConfirmed: null, scoredFrom: null, need: null, budget: null,
      due: null, questionsDue: null, blockers: [], openQuestions: [] },
    listing: null,
    documents: null,
    fullText: null,
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
