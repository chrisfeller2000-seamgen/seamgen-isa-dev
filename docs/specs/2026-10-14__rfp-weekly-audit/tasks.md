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
- [x] Release, October 14 at 18:09 UTC.
  - **Upload:** PR #19, commit `4defe7b`, a guarded upload of 5 scripts (`rfp-audit`, `rfp-report`, `rfp-scoring-judgment`, `rfp-scoring-policy`, `weekly-rfp-pursue-decision`).
  - **Before:** the VM had not drifted from the accepted baseline, and no RFP job was running.
  - **After:** the post-upload snapshot matched, `live:pull` shows no changes, and all 5 scripts pass `node --check` and import on the VM's Node v24.21.0. The Friday crontab entry is unchanged.
  - **Rollback:** restore from `~/.openclaw/workspace/backups/dev-deploy-2026-10-14T18-09-24-195Z-4defe7b`, and delete `scripts/rfp-audit.mjs`, which is new.
- [x] Follow-up, the same day: Chris's review of the rebuilt backfill audit, from a salesperson's and a developer's point of view. Branch `feat/rfp-audit-workbook`.
  - **Audit lines for every listing pulled.** The 53 intake drops and 2 duplicates were missing. The duplicate check now runs before scoring, saving a model call each.
  - **New fields on each line:**
    - plain decision and why for every line;
    - what they want, budget, due date, blockers and open questions;
    - the listing text the scorer read;
    - why a document set was incomplete;
    - seconds per stage;
    - a hash of the whole prompt.
  - **Workbook replaces the CSV:** a Sales tab and a Details tab, built from the same lines in the same order. Points show out of their maximum. "Lost points on" uses plain reasons and the competitive verdict instead of the model's arithmetic.
  - **`exceljs` 4.4.0** is the repo's first dependency: dev-only, never loaded on the VM. CI runs `npm ci`. `npm audit` reports a moderate `uuid` advisory for v3/v5/v6 with a buffer argument, which exceljs doesn't use.
  - **Fixed in the report too:**
    - with no HigherGov summary, "what they want" was the next heading (29 of 185 RFPs that week);
    - sentences were cut at "No." (Port of Oakland's "(RFP No.").
  - **Backfill audit rebuilt:** 187 lines, the report's 185 plus the 2 duplicates. The 53 intake drops can't be rebuilt, because that run kept nothing about them.
  - `npm test` (170) and `npm run check` pass; the new intake-drop and duplicate checks fail when their hooks are removed.
- [ ] After Friday October 16:
  - the audit file's line count equals the report's entries;
  - `cron.log` shows any "asking once more" lines and their outcome;
  - nothing else changed in delivery.
- [ ] Later: let ISA's chat answer "why was X skipped?" from the audit (lookup script plus `workspace/AGENTS.md`).
