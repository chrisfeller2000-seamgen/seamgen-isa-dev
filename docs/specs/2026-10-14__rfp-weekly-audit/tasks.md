# ISA task checklist: weekly RFP audit, one scoring retry, Gate 2 from a listing

- [x] Branch `feat/rfp-weekly-audit` from `main` at `42b1dec`, which equals the VM. The worktree was clean.
- [x] Backfill review (October 14, read-only on the VM).
  - All 91 Gate 2 cuts were read against Jake's rule: about 36 aren't software work, about 50 are product buys, renewals, hardware or support, and 2 are arguable.
  - About 20 reasons cite an unverified Q&A window.
  - 50 of the 57 deadline cuts were judged by the model, with gates but no category points.
  - The 187 candidate files were copied to `.isa-local/backfill-2026-10-14/` before Friday deletes them.
- [x] `rfp-audit.mjs`, hooked into `addEntry()`; `npm run rfp:audit` with CSV.
- [x] One retry for a rejected answer; system rule for `previousAnswerRejected`.
- [x] Gate 2 at preliminary depth: system rule, and the conditional route carries forward.
- [x] Report heading "Not custom software work".
- [x] `run()` handles a missing command; found by the whole-run test, where `mcpjam` was missing and the run crashed.
- [x] Tests: a whole weekly run in preview mode, plus unit tests. Each new test fails with its change removed. `npm test` (168) and `npm run check` pass.
- [x] Docs: RFP README (weekly audit, retry), document qualification (Gate 2 from a listing), commands, data models, specs index.
- [x] Real model, locally on gpt-6.1-sol, with Chris's key (October 14). These are listing-stage re-scores of saved backfill listings with this branch's scorer, 8 RFPs:
  - **Still cut at Gate 2:** a city water rate analysis (consulting, "no custom-build path") and a state Java license renewal (resale).
  - **Now carried forward (Gate 2 open):**
    - a water utility's AI data extraction, Worth a look 69;
    - a state veterans cemetery portal on a low-code platform, Worth a look 55.

    Both would get their documents fetched.
  - **A county website design and build,** scored as of October 9 (on time): Gate 2 passes, Worth a look 71, so documents would be fetched. The late run cut it at Gate 1.
  - **Previously rejected answers:**
    - A college's event and space management software: scored on the first try, as a Watch item.
    - A regional 9-1-1 call handling system: rejected for "Missing scoring evidence.", then scored on the second try (No-bid, 39).
    - A state toll collection system: rejected for "Deal category does not match estimated size.", then scored on the second try (Worth a look 65; documents would be fetched).

  10 model calls, 37–162 seconds per RFP.
- [ ] Release: PR, merge, guarded upload of the changed workspace scripts.
- [ ] After Friday October 16:
  - the audit file's line count equals the report's entries;
  - `cron.log` shows any "asking once more" lines and their outcome;
  - nothing else changed in delivery.
- [ ] Later: let ISA's chat answer "why was X skipped?" from the audit (lookup script plus `workspace/AGENTS.md`).
