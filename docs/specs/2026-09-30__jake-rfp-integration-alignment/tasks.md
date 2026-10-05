# Jake RFP integration alignment: task ledger

**Status: UNAPPROVED — NOT STARTED.** Nothing below is authorized yet. Tick items only after the user approves the spec and plan, and only within the slice that was approved. Production actions (items marked **[release]**) each need their own separate authorization.

Owners: **Dev** is the implementing developer. **Jake** owns the rubric. **Peter** makes the product and value-review decisions. **Inventory owner** is not yet named.

## 0. Prerequisites and decisions (no runtime code)

- [ ] Dev: user approves this spec and plan and names the first slice.
- [ ] Dev: the pending alignment harness (`devtools/rfp-alignment*`, fixtures, rubric doc, earlier spec) is committed through normal review. It is the user's work; do not alter it here.
- [ ] Dev: agree how the `7d39fca` deadline commits reach `main`. A normal PR; merging does not deploy.
- [ ] Dev: reconcile the VM weekly script (`0032dd7f…`) and document helper (`f2fdcd15…`) into tracked source as a behavior-neutral commit, with the hashes recorded. Required before any slice edits either file.
- [ ] Jake: review the 31 synthetic cases and record approvals or changes, with the reason for each change.
- [ ] Peter and Jake: confirm the Gate 5 policy in spec §3. Also decide whether an uncertain value may still appear as Strong Pursue with a flag, or must route to review.
- [ ] Peter: product decision on explicit non-procurement or closed single-source notices, with the display wording.
- [ ] Peter and Jake: decide how heuristic scores are displayed while judged categories wait for a model.
- [ ] Name the inventory owner and the approved storage (case studies, public-sector references, certifications, set-asides, partners).
- [ ] Decide the model provider, interface, and credential, or explicitly defer. Blocks slice 6 only.
- [ ] Confirm how and by whom `secondary-fulltext-score.mjs` is invoked in production.
- [ ] Confirm whether deleting candidate folders on every weekly run is intended.
- [ ] Decide what happens to the six hardcoded `requiredNames` titles in the secondary.
- [ ] Agree the boundary with the `docs/rfp-evidence-gating` owner: who owns classifier and completeness fixes, and what the result contract is.

## 1. Shared policy module and Gate 5 (recommended first slice)

Depends on: harness committed; Gate 5 decision; slice 1b also needs the VM reconciliation.

- [ ] 1a. Add failing policy tests first: $5K, $99,999, and $100K; a range straddling $100K; "$50K or $500K"; unstated; incidental amounts (insurance, bond, fee).
- [ ] 1a. Add the pure `workspace/scripts/rfp-policy.mjs` (policy version, category definitions, Gate 5 evaluation, decision mapping), with a side-effect-free import.
- [ ] 1a. Secondary: replace the Gate 5 result from `detectGates()` and the recommendation mapping in `buildScore()` with policy calls. Report the needs-review reason and evidence.
- [ ] 1a. `npm test`, `npm run check`, `npm run rfp:alignment`. Record which mismatches cleared and which remain.
- [ ] 1b. Weekly: `evaluateQualificationGates()` takes Gate 5 from the policy. Stop using the first dollar amount and the one-sided `val_est_low`.
- [ ] 1b. Weekly: Gate 1 uses the deployed deadline helper (proposal deadline only).
- [ ] Update the RFP domain doc with the lasting Gate 5 rule.

## 2. Remaining deterministic corrections

Depends on: slice 1; Jake's case review.

- [ ] Gate 3 "no hardware" negation, in both routes.
- [ ] Gate 2 COTS alongside material custom work goes to `needs-review` or `conditional`, not an automatic fail.
- [ ] Set-aside held/not-held check against the configured list, shared by intake and scoring.
- [ ] Gate 6 generic keyword pass/fail becomes `needs-review` with evidence until slice 5.
- [ ] Word-boundary fixes for "bid" and "email" in the existing heuristics, still labeled heuristic.
- [ ] Closed or non-procurement notice handling, **only if** Peter approves the rule.
- [ ] Weekly exposes the eight-category structure (null where unscored).

## 3. Document eligibility in the secondary

Depends on: VM reconciliation; the evidence-gating boundary agreement.

- [ ] The secondary uses the document helper's lookup, list, save, and `evaluateDocumentCompleteness()` in place of its own fetch path.
- [ ] Remove the metadata-body fallback being scored as full-text. Keep the provisional label and a null final.
- [ ] Classifier cases (rating form, `RFP_EXAMPLE_01`), in whichever spec owns them.
- [ ] Offline tests using the current URL contract, not the old opaque `document_path` fixture.

## 4. Candidate state and selection

Depends on: the decisions on candidate deletion and `requiredNames`.

- [ ] Persist policy results (version, gates, categories, confidence, evidence, hashes, run id) with each candidate.
- [ ] The secondary selects from persisted candidate state (slug or `version_key`) instead of parsing report Markdown titles.
- [ ] Apply the approved decision on hardcoded titles and candidate-folder retention.
- [ ] Report sections distinguish metadata leads, needs-review items, and qualified or No-bid results.

## 5. Company evidence inventory

Depends on: the inventory owner and storage decision.

- [ ] A reviewed inventory with stable ids, a version, and a review date.
- [ ] Gate 6/6a deterministic comparison from a structured requirement plus the inventory. Partner passes need a named, verified partner.
- [ ] Category 1 and compliance citations reference inventory ids.

## 6. Judgment interface and model evaluation (acceptance layer B)

Depends on: the approved provider, credential, and interface. **Separately authorized.**

- [ ] A structured judgment contract for the judged gates and categories, with required citations.
- [ ] Recorded-judgment fixtures so that layer A tests the policy without a live model.
- [ ] A frozen evaluation set, with Jake-reviewed expectations and pre-approved tolerances.
- [ ] Repeated same-input runs. Report the results without claiming superiority.

## 7. Intake trace and replay

Depends on: approved storage for any real batch.

- [ ] Write an intake manifest for each run (window, watermark, dedupe, kills, and flags with reasons).
- [ ] Add a `searchId` watermark guard matching the PowerShell tool, or record why not.
- [ ] Offline replay: frozen batch, fixed date, fixed inventory. Output goes to a separate directory, with a diff against historical reports.
- [ ] Explain the September 22 intake counts if the inputs can be recovered; otherwise record that they cannot.

## 8. Integration and dry run (acceptance layers C and D)

- [ ] Offline pipeline fixture covering persistence and report eligibility.
- [ ] An isolated end-to-end dry run in a temporary workspace, with sentinels showing no email, Telegram, HubSpot, Drive, watermark, `seen.csv`, or candidate reset.

## 9. Production release (acceptance layer E)

- [ ] **[release]** Separate authorization naming the exact files.
- [ ] **[release]** `npm run live:pull` and a fresh drift check. The newer VM files are the baseline.
- [ ] **[release]** `live:deploy` preview, then an exact-file apply. Record the backups and hashes.
- [ ] **[release]** Pure-function checks on the VM; no business job.
- [ ] **[release]** Read-only observation of the next scheduled Friday run. Record the results separately from the offline proof.
- [ ] **[release]** Rollback steps written and checked before apply. The fetch flag stays unchanged.

## Codex planning review — September 30, 2026

This records review of the draft, not approval or implementation. Claude's `spec.md` and `plan.md` have not been edited.

- The shared pure policy and staged adoption are a sound starting point. Treat the Gate 5 range/uncertainty rule as proposed until Jake/Peter confirm it; the existing `value-unknown` fixture's boolean `true` means “do not auto-reject,” not a verified value or permission for an unconditional pursue.
- Retention clarification: `clearPortalCandidatesCache()` deletes `RFP-pipeline/candidates/`. Canonical saved resources are under `RFPs/<stage>/<slug>/resources/`, outside that deletion scope. Candidate records and links can be lost, but deletion of those document folders is not established. Do not repeat the draft's broader resource-loss claim without a separate retention test.
- Competitive-position clarification: the secondary already has `detectCompetitivePosition()`, heuristic deductions, and `Open` / `Leaning wired` / `Wired` outputs. The gap is faithful, evidence-grounded rubric judgment and deductions, not complete absence of a wired read. Add tests before replacing or extending it.
- Reviewed all three new documents. Existing tracked diff and hashes of the prior untracked harness/spec files were unchanged by Claude. No runtime source, VM settings, or production workflows changed; no commit, push, or deployment occurred.
- Local checks: `npm test` passed 44/44; `npm run check` passed for 14 scripts; `git diff --check` passed. `npm run rfp:alignment` exited 1 with the same 12/31 passing cases and 22 mismatched checks. Harness success is not business-rule alignment.
- Implementation approval remains outstanding. Model/provider choice, company-inventory ownership, and the unresolved product rules are still review decisions, not defaults to invent during coding.
