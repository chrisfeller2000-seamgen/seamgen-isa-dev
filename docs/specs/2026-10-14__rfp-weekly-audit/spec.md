# ISA task spec: weekly RFP audit, one scoring retry, Gate 2 from a listing

## Problem and evidence

The October 2–8 backfill (run October 14, preview, week 41) scored 185 RFPs and found no Strong Pursue. Checking why needed every RFP's gate reasons. Those live only in the candidate files, and the next Friday run deletes them. The results file keeps one plain line per RFP. The check was possible only because Friday hadn't run yet.

The backfill also showed two scoring gaps:

- **20 RFPs were left unchecked.** The model's answer was rejected (`invalid-judgment`), mostly "Missing scoring evidence.", and nothing retried it.
- **Gate 2 at the listing stage.** 86 of the 91 Gate 2 cuts were made from the listing alone, and about 20 of those gave "the Q&A window is unverified" as a reason. Jake's preliminary skill says a Gate 2 call that could go either way from the listing is carried forward, not killed. A listing never shows the Q&A window. Separately, at preliminary depth the Conditional — Ask the Agency route stopped at Needs review with no score, so it never reached the documents.

## Desired behavior and acceptance

- **Audit file.** Every weekly run appends one line per report entry to `reports/new-rfp-qualification/audit/<run date>.jsonl`, as each RFP finishes:
  - the RFP's HigherGov keys and links, and the reported outcome;
  - listing and full-text scoring: gates with reasons, category points, deadline, error, tries, model, skill hashes, and the model's answer with quotes cut to 300 characters;
  - document names and read status, with no paths or download links.
- **Audit rules.**
  - A same-day re-run writes `-2`.
  - A write failure logs once and never stops the update.
  - `npm run rfp:audit -- <run date>` pulls a week read-only and writes a CSV.
- **One retry.** A rejected answer gets one more model call with the validator's reason (`previousAnswerRejected`); a second rejection stays unscored. Provider failures stay with the outage guard.
- **Gate 2 at preliminary depth.**
  - An unconfirmed Q&A window never fails Gate 2.
  - The model fails Gate 2 only when the listing leaves no custom path; otherwise it sets the gate open.
  - The conditional route is scored like an open gate, so a 50+ listing gets its documents fetched.
  - Full-text Gate 2 is unchanged.
- **Report wording.** The Gate 2 screened-out heading is "Not custom software work", since it also covers non-software work.
- **Crash fix.** A missing command (for example `mcpjam`, used by the HubSpot duplicate check) fails that step instead of crashing the run. Found by the new whole-run test.

## Out of scope

- A database. ISA's chat reading the audit (planned after the first real audit file).
- Keeping downloaded documents.
- Cutting deadline failures before the model call.
- Scheduler, credential or recipient changes.

## Constraints and risks

- The audit holds RFP and contact data: it stays on the VM and in `.isa-local/`, never in Git.
- About 2 MB a week.
- Each retry is one more model call, so about 20 more on a week like October 14.
- More listings may reach the document step. That means more fetches and full-text calls, still bounded by the 50+ threshold.
- Rollback restores the previous scripts from the deploy backup. Audit files can stay.

## References

- `workspace/scripts/rfp-audit.mjs`, `weekly-rfp-pursue-decision.mjs`, `rfp-scoring-judgment.mjs`, `rfp-scoring-policy.mjs`, `rfp-report.mjs`;
- `devtools/rfp-audit.mjs`;
- [RFP workflow](../../domains/rfp/README.md#weekly-audit) and [document qualification](../../domains/rfp/document-qualification.md).
