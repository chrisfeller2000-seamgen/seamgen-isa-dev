# ISA / Jake RFP qualification integration alignment

Status: Draft for review. **Not approved; no implementation started.** This document authorizes no runtime, test, job, configuration, or deployment change.
Created: September 30, 2026
Planning branch: `test/rfp-rubric-alignment`, which also holds the user's uncommitted alignment harness. This spec adds only its own folder.
Integration target: `main`, through normal review.
Base: `7d39fca`. It includes the deployed deadline commits (`e1e288a`, `7d39fca`), which are not yet on `origin/main` (`26c5cdd`).

## Summary

ISA should qualify HigherGov RFPs with Jake's written rubric: six kill gates, eight weighted categories, and the rubric's decision rules. It must apply them as **one policy** across intake, preliminary scoring, document-backed qualification, candidate state, and the sales-facing report.

Today ISA runs two independent keyword calculators. Neither exposes or enforces that policy consistently. Success here does not mean ISA reproduces a historical total. It means that the same evidence produces the same gate states, category bounds, confidence, and recommendation on either route, with the evidence and provenance visible.

## Problem and evidence

### Sources compared

- **Jake reference.** This is archive commit `ccf21a70bc7021c46f5cd393156b757e0a934f51`, read locally for this plan (skills, intake tools, and synthetic fixtures only). It contains written policy, not an executable scorer. The main documents are:
  - scoring skill v1.8
  - preliminary scoring skill
  - the document-fetch, capability-verification, and solution-landscape skills
  - the PowerShell intake: `Test-HGPrefilter` and `Get-HigherGovOpportunities.ps1`

  In Jake's workflow, Claude applies the rubric. Jake's preliminary step runs the **full** gates and categories on metadata and labels the result provisional.
- **ISA runtime skill.** `workspace/skills/rfp-scoring-skill.md` is v1.8 plus the deployed deadline wording (`87dc6d27…ab74`). ISA reads this skill as content, but the scheduled Node path never calls a model.
- **ISA runtime code.** Hashes from the fresh VM snapshot:
  - weekly `0032dd7f…4ed7`
  - document helper `f2fdcd15…1496`
  - secondary `ec0108c1…7187`
  - deadline helper `410a27b2…f238`

  The VM weekly script and document helper are **newer than tracked source** because they carry the provider URL, retry, download, and `document-list-empty` fixes. They must not be overwritten.
- **Local comparison baseline** (`../2026-09-30__rfp-rubric-alignment/spec.md`, the user's pending work). 12 of 31 synthetic cases pass, with 22 of 348 checks mismatched on both tracked and VM source. The expectations are derived from the rubric. They are not Jake-approved golden outputs. The 19 failing cases are not a count of distinct defects, and they are not an accuracy estimate.

### How the pipeline runs today

1. **Intake.** The weekly job runs Friday 12:00 America/Los_Angeles; the cron wrapper runs only the weekly script.
   - `runHigherGovIntake()` reads the saved search by exact `captured_date`. The window runs from the watermark +1 (or the last 7 days) to yesterday UTC.
   - It dedupes against `seen.csv` and applies `getHigherGovPrefilter()`, a port of `Test-HGPrefilter`. It then writes `candidate.md`.
   - Before writing, it deletes every folder under `RFP-pipeline/candidates/` (`clearPortalCandidatesCache()`).
   - Unlike the PowerShell tool, it does not refuse a watermark that was built for a different `searchId`.
2. **Preliminary.** `scoreCandidateFromText()` combines keyword fit, landscape and capability heuristics, and penalties into one 0–100 number. It returns no category breakdown. A score of 75 or more is provisional; lower scores are `preliminary-below-threshold`.
3. **Document stage.** This is off in production (`RFP_DOCUMENT_FETCH_ENABLED`). Every candidate at 75 or above is written to the report's *Manual review* section. The weekly job's own document branch (completeness check, then keyword score plus `evaluateQualificationGates()`) is not the production path.
4. **Secondary full-text** (`secondary-fulltext-score.mjs`). The cron wrapper does not invoke it and no tracked skill names it, so how it is invoked is unknown.
   - It picks candidates by parsing weekly report Markdown titles scored 75 or more, uses fuzzy title matching, and **force-includes six hardcoded historical titles**.
   - It fetches through its own lookup and does **not** apply document classification or completeness.
   - If nothing downloads, it scores the candidate's metadata body instead.
   - It computes regex gates and eight regex categories, and writes only a dated report. Candidate state is not updated.
5. **Reports.** The weekly report is dated, and `latest` is overwritten. It is emailed and sent to Telegram. The scoring skill tells ISA to repeat the secondary report's deadline status when answering.

### Demonstrated rule defects (reproduced by the baseline)

| Area | Route | Observed |
| --- | --- | --- |
| Gate 5 | secondary | Never fails: $5K and $99,999 pass because the deal-size detector never returns 0. |
| Gate 5 | weekly | Fails "$50K or $500K" by taking the first dollar amount. `val_est_low` adopts one side of a range. |
| Gate 6 / 6a | both | Keyword-based. The secondary fails generic "three references", "three workshops", and a verified named partner. Both routes pass three public-sector references against a one-reference profile, and both pass an explicitly unheld certification. The weekly fails proof of held insurance. |
| Gate 2 | secondary | Fails 60% custom work alongside COTS. |
| Gate 3 | secondary | Fails "No hardware is being purchased." |
| Gate 1 | weekly | Uses the earliest labeled date, including a question deadline. Only the secondary uses the deployed deadline helper. |
| Documents | helper → secondary | "RFP COMMITTEE RATING FORM" is classified as the solicitation and marked complete, and the secondary scores 86 from it. `RFP_EXAMPLE_01` is classified as `other`. |
| Categories | secondary | Substring matches: "bid" raises case study from 7 to 20, and "email" gives AI 7. |
| Categories | weekly | No eight-category breakdown exists. |
| Closed notice | secondary | A notice inviting no submissions gets Strong Pursue. This is a project clarification, not a Jake gate. |

### Found by code reading, not yet reproduced by a test

- Neither route implements these rubric outcomes:
  - Conditional — Ask the Agency
  - Gate 2a
  - the wired-RFP deduction
  - the sensitive-industry flag
  - the CEO wildcard
  - Deadline needs review (weekly)
- Neither route reads the case-study library, the public-sector reference count, held certifications or set-asides, or verified partners. As a result, Category 1 and Gate 6/6a cannot be grounded or cited.
- The secondary's fallback to the metadata body can report a "full" total for a metadata lead whenever the metadata deadline resolves.
- The secondary's selection depends on Markdown formatting and a stale title list.
- Candidate folders are deleted on every run, and `seen.csv` stops those opportunities from being taken in again. Preliminary state, fetched resources, and provenance therefore do not survive to later review. Whether that is intended is unknown.
- `candidate.md` says "Score it with `skills/rfp-scoring-skill.md`", but the scheduled report shows the keyword score.
- `devtools/fixtures/highergov-fetch.mjs` models `document_path` as an opaque ID. Passing it does not prove the provider API contract.

### Not established

- **The September 22 count discrepancy.** No frozen batch, date window, seen-state, or category breakdown is available, so it has not been reproduced. The static intake settings match Jake's: same `searchId`, `sourceType`, `safetyLagDays`, `minDaysToDue`, and NAICS list. The runtime window, watermark, and dedupe state have not been traced. Because candidate folders are deleted, ISA's September 22 inputs may no longer be recoverable.
- **Model comparison.** No same-input Jake-vs-ISA model evaluation has been run. Nothing here shows that Jake's AI workflow is more accurate.
- **PowerShell intake.** It has not been executed in this environment.

## Desired behavior

### 1. One policy, two routes

- One versioned policy owns:
  - gate definitions and states
  - category ids, weights (25/15/15/10/10/10/10/5), and bounds
  - total arithmetic
  - decision rules: ≥75 Strong Pursue; 50–74 Worth a look; <50 No-bid; any verified gate fail → No-bid; Conditional — Ask the Agency; Deadline needs review
  - confidence labels
  - thresholds: 10 calendar days, $100K, and the 75 fetch threshold
- The preliminary and document routes call the same policy. They differ only in their evidence and confidence, not in their rules.
- Gate states are `pass`, `fail`, `needs-review`, `conditional` (Gate 2/2a, per the rubric), and `n-a` (6a when no public-sector reference count is required).
  - Each gate result carries a reason, evidence references (document and section, or metadata field), and who decided it: rule, model, or human.
  - A `needs-review` gate never counts as a pass. A verified fail elsewhere still yields No-bid.
- Each category result carries points within its bounds, or `null`, plus its reasoning, evidence or citations, and who decided it.
  - The total is the sum only when all eight categories are scored. Otherwise it is `null`, and the unscored categories are listed.
  - A null total is never replaced by a heuristic number presented as a rubric score.
- The sensitive-industry flag and CEO wildcard are surfaced notes. They never change the score.

### 2. Deterministic checks versus judged items

- **Deterministic (pure code, tested):**
  - Gate 1, through the deployed deadline helper on both routes.
  - Gate 5 thresholds, when an estimate is stated in a structured field or an explicit budget statement.
  - Category 5 bands for a given estimate.
  - Set-aside held/not-held.
  - The Gate 6a count comparison, once the required count and the reference inventory are both known.
  - Category 8 bands.
  - Bounds, arithmetic, and the decision mapping.
  - Consumption of document completeness.
  - Q&A-window status for Conditional.
- **Judged (model or human, structured, with citations):**
  - Gate 2/2a.
  - Gate 3, when not explicit.
  - Gate 4.
  - Matching qualification requirements for Gate 6.
  - Gate 5 scope inference when no value is stated.
  - Categories 1–4, 6, and 7, including the solution-landscape verdict.
  - Extracting requirements such as "three governmental references" or "certification X" from text.
- Until an approved judgment interface exists, judged items are `needs-review` or unscored. They are never filled with broad regex. Narrow word-boundary corrections to existing heuristics are allowed only if those numbers stay labeled as heuristic.

### 3. Gate 5 estimated value (proposed policy for confirmation)

- The gate uses the estimated deal or project value. It never uses incidental amounts such as insurance limits, bonds, fees, penalties, or prior awards.
- Outcomes:
  - **Fail:** the stated estimate is clearly below $100K (the top of the range is under $100K).
  - **Pass:** the whole stated range is $100K or more.
  - **Needs review:** the value is unstated, the range straddles $100K, or it is plausibly either (for example, $50K or $500K). This routes to Peter with the uncertainty stated, and is never an automatic rejection. Scoring may continue, as the rubric's edge case says, but this state is not recorded as a verified pass.
- HigherGov `val_est_low` and `val_est_high` are labeled as metadata-derived estimates. Neither bound is adopted on its own.

### 4. Evidence, completeness, and state

- Confidence stays `metadata-only`, `partial-documents`, or `full-text`.
  - `full-text` requires the actual required scoring documents to be extracted: the solicitation plus the required attachments it identifies. What HigherGov happened to return, or a filename guess, is not enough.
  - Empty, gated, failed, unreadable, or ancillary-only sets (such as a rating form) are never full-text and never produce an unconditional pursue.
- A document route must never substitute metadata for documents and label the result full-text.
- An explicit non-procurement notice or closed single-source notice is not presented as an open bid. `sole_source_flag` alone is only a flag. The extra rule is a pending product decision, not a seventh gate.
- Candidate state persists the following for each assessment:
  - policy version and assessment date
  - gate and category results
  - confidence and document status
  - evidence references and source hashes
  - run id
- Reruns write new dated outputs and a diff. Historical reports are never rewritten.
- A metadata lead and a qualified bid stay distinct in the report, email, and Telegram wording.

### 5. Company evidence

- Category 1, Gate 6/6a, compliance, and certification checks cite a **reviewed, versioned company evidence inventory**. It holds:
  - case-study ids
  - the public-sector reference list (the rubric currently says one clean reference)
  - held certifications and set-asides
  - verified named partners, with integrator confirmation for Gate 2a
- Capability is never inferred from the RFP's own wording. The inventory's owner and storage location are open. Customer or proposal content does not enter Git without approval.

### 6. Intake traced separately from scoring

- Each run records an intake manifest:
  - search id and source types
  - captured-date window
  - watermark before and after
  - dedupe counts
  - prefilter kills and flags with reasons
- Replays use a frozen batch, a fixed assessment date, and a fixed inventory version, offline. Survivor counts are explained at intake before any score comparison.

## Acceptance layers

Each layer is a separate gate. Passing one does not imply the next.

- **A. Deterministic policy regressions.** `npm run rfp:alignment` exits 0 on the Jake-reviewed case set for both routes, and the new pure policy tests pass in `npm test`. Expected outcomes change only through a recorded policy decision.
- **B. Same-input model evaluation.** Separately authorized, with an approved credential.
  - It uses a frozen approved set, with real items kept in private storage, and Jake-reviewed expected gate states and category bands.
  - Tolerances are approved before the run: gate state exact, category within band, total within an agreed margin, and recommendation exact on unambiguous items.
  - Runs are repeated for stability.
  - Nothing is claimed until the evaluation has run.
- **C. Pipeline persistence and report eligibility.** An offline fixture runs intake → preliminary → documents → qualification → report against a mocked provider. It must show:
  - correct persisted state
  - no metadata lead, incomplete set, or needs-review item in the pursue section
  - historical reports untouched
  - a diff produced
- **D. Isolated end-to-end dry run.** It runs in a temporary workspace with sentinels proving there was no email, Telegram, HubSpot, Drive, watermark or `seen.csv` change, and no reset of real candidates.
- **E. Coordinated production release.** Separately authorized:
  - fresh VM drift check
  - exact-file scope
  - backups and hashes
  - a written rollback
  - read-only observation of the next scheduled run

  The fetch flag stays unchanged unless separately authorized.

## Out of scope

- Proposal writing, outreach, or email templates, beyond wording that keeps leads and qualified bids distinct.
- Blanket rewrites, restoring Jake's archive files over ISA source, or blindly restoring the fetch skill.
- Enabling `RFP_DOCUMENT_FETCH_ENABLED`; changing schedules, credentials, or VM configuration; any production run.
- The requirements-evidence work in the separate `docs/rfp-evidence-gating` worktree. It is consumed through its contract and not edited or copied here.
- Changing weights, thresholds, or the 10-day rule, or adding a seventh gate.
- Rewriting historical reports, CRM records, or sent messages.

## Constraints and risks

- **Code to preserve.** The deployed deadline correction, and the newer VM weekly script and document helper (identified by hash). Any edit to those two files starts from the VM version, after it has been reconciled into Git.
- **Integration order.** The deadline commits reach `main` through normal review, and merging to main does not deploy. The alignment harness is the user's uncommitted work and must be committed before implementation starts.
- **Import side effects.** The weekly script runs `main()` on import. New shared code must stay side-effect free.
- **Expected count changes.** A stricter policy will add needs-review items and lower confident-pursue counts. That is expected, and it must be communicated as such.
- **Model judgment** can vary between runs. Structured outputs, citations, tolerances, and repetition mitigate this.
- **The inventory can go stale** (compare the July Esri correction). It needs a named owner and a review date.
- **Data handling.** No RFP text, credentials, raw reports, or customer records go into Git or tests.

## References

- [Jake-rubric comparison spec (evidence only; do not edit)](../2026-09-30__rfp-rubric-alignment/spec.md)
- [Deadline scoring spec](../2026-09-30__rfp-deadline-scoring/spec.md)
- [RFP workflow](../../domains/rfp/README.md) · [Document qualification](../../domains/rfp/document-qualification.md) · [Rubric alignment](../../domains/rfp/rubric-alignment.md)
- [Scoring skill](../../../workspace/skills/rfp-scoring-skill.md) · [Preliminary skill](../../../workspace/skills/rfp-preliminary-scoring-skill.md)
- [Weekly job](../../../workspace/scripts/weekly-rfp-pursue-decision.mjs) · [Secondary scorer](../../../workspace/scripts/secondary-fulltext-score.mjs) · [Deadline helper](../../../workspace/scripts/rfp-deadline.mjs) · [Document helper](../../../workspace/scripts/highergov-document-flow.mjs)
- [Deployment](../../deployment.md) · [Security](../../security.md) · [Live jobs](../../live-jobs.md)
