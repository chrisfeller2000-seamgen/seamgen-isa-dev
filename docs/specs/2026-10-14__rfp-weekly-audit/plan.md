# ISA implementation plan: weekly RFP audit, one scoring retry, Gate 2 from a listing

## Approach and alternatives

**Audit format.** One JSON Lines file per run, beside the results file. Each line is built from the same report entry the week's report uses, so the two can't disagree.

Alternatives rejected:
- **Keeping old candidate folders** mixes in documents and an awkward frontmatter format.
- **SQLite now** would design tables twice, before the real backend.
- **A Google Sheet** adds auth and syncing, and Jake keeps only agency documents on Drive.

**Spreadsheet.** Made on demand from the file, so there is one stored format.

## Source and insertion points

- `rfp-audit.mjs`:
  - `auditRecord()` builds a line;
  - `auditDocuments()` keeps names and read status;
  - `createAuditLog()` picks a free file name and appends.
- `weekly-rfp-pursue-decision.mjs`:
  - `addEntry()` is the one place every RFP becomes a report entry; it now also appends its audit line;
  - `run()` handles spawn errors.
- `rfp-scoring-judgment.mjs`: `scoreRfp()` retries a rejected answer once; the system rules cover `previousAnswerRejected` and Gate 2 at preliminary depth.
- `rfp-scoring-policy.mjs`: `conditionalOutcome()` returns null at preliminary depth (carry forward), unless the listing shows closed or commercial-only.
- `devtools/rfp-audit.mjs`: pull and CSV. `isa-live.mjs` exports `remote` and its config for it.

## Invariants and side effects

- The audit never blocks delivery.
- No paths, links or keys in the audit.
- Intake state and the seen list are untouched by audit code.
- Full-text Gate 2 and the conditional route are unchanged.
- The retry adds no provider-error retries.

## Context to keep beside code

- Why the audit exists: the next run deletes candidate files.
- Why quotes are cut.
- Why the retry is once and safe to send back.
- Why a preliminary conditional carries forward.

## Verification and release boundary

**Offline checks:**
- A whole weekly run in preview mode, with intake replay, recorded judge, fixture documents, and nothing sent. Its audit matches the report entry for entry, and a re-run writes `-2`.
- Unit tests for an unwritable audit, quote cutting, document fields and the CSV.
- Retry tests: a rejected-then-fixed answer, rejected twice, a provider down.
- Gate 2 preliminary carry-forward.
- Each new test was checked to fail without its change.

**Real model, locally on gpt-6.1-sol:** listing-stage re-scores of saved backfill listings; results are in tasks.md.

**Live:** a guarded upload of the changed workspace scripts. Then check Friday's audit file, its line count against the report, and `cron.log` retry lines.
