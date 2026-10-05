# ISA task spec: complete alignment with Jake's RFP scoring

**Status: implemented locally; updated October 5, 2026 with the deployed evidence gate and a fix for the preliminary contract. Offline proof passes; not deployed.** A bounded real-model batch, current qualification confirmation, the company-file upload, and release remain pending. See [implementation.md](implementation.md).

**Goal:** ISA must apply Jake's complete scoring policy, in both preliminary and full-text scoring. Keep the implementation focused; do not leave required rules out just to make the patch smaller.

This replaces this folder's earlier partial-correction proposal. The folder retains its original name for existing links.

## Problem and evidence

Jake's system uses an AI agent to apply a written rubric. ISA has copies of that policy, but its scheduled Node scoring paths use separate keyword calculators:

- The weekly `scoreCandidateFromText` adds fit, landscape, and capability heuristics rather than the eight weighted categories.
- The secondary `buildScore` uses category-shaped heuristics, but does not actually ground case-study matches, qualification eligibility, or several judgment calls in the required evidence.
- Demonstrated misreads include a sub-$100K project passing, generic references being treated as government references, “no hardware” failing, and “email” implying AI.
- Document classification/completeness can allow an ancillary form to stand in for the solicitation.
- The secondary also force-includes six historical titles, regardless of the ordinary preliminary selection.

The original synthetic baseline was **12/31 cases passing, with 22 mismatched checks out of 348**, on tracked source and the previously captured VM snapshot. The implemented local scorer now passes all 31 cases using recorded judgments. These are test cases, not a count of production incidents or measured AI answers. The September 22 survivor counts and Jake's actual AI outputs have not been reproduced.

**Complete alignment means the same rules, evidence requirements, category bands, and decision behavior.** It does not promise identical subjective points from different models or different input documents. A controlled same-input evaluation is required before claiming that the automated integration is aligned in practice.

## Policy authority

Use these existing sources, not a new business-policy document:

1. [Jake's scoring rubric](../../../workspace/skills/rfp-scoring-skill.md), v1.8, including Gates 2a/6a, decision rules, and flags.
2. [Preliminary scoring](../../../workspace/skills/rfp-preliminary-scoring-skill.md): the same full rubric at metadata depth, not a shortcut score.
3. [Solution landscape](../../../workspace/skills/rfp-solution-landscape-skill.md): the required full-text wired-RFP analysis and counter-evidence.
4. Relevant recorded capability evidence, following [capability verification](../../../workspace/skills/rfp-capability-verification-skill.md). Do not turn hedged or adjacent experience into proven delivery.
5. The already approved September 30 deadline correction in `rfp-deadline.mjs` and the scoring skill.

Jake archive provenance is recorded in `devtools/fixtures/rfp-alignment-cases.mjs`. The normative rubric wins over stale examples: a preliminary example labels 78 “Worth a look,” but the decision table says 75+ “Strong Pursue.” Preserve the approved deadline correction rather than restoring historical date bugs.

## Complete coverage

All six gates, including their subrules, are in scope.

| Gate | Required behavior in both scoring paths |
| --- | --- |
| 1 — Timeline | Use the current assessment date and actual submission deadline; 10 calendar days is the floor. Missing, invalid, ambiguous, or conflicting deadlines need review, not an assumed pass or automatic rejection. An independently verified other failure can still justify No-bid. Capture Q&A separately. |
| 2 / 2a — Custom work and company type | Distinguish pure product procurement from material custom work, roughly 40%+. Apply the real-analog, otherwise-worth-a-look, open-Q&A conditional route. Evaluate existing installs and mandatory product demos, not product adjectives alone. A teaming route requires a named, verified partner that sells through integrators; follow the rubric when Q&A closes or the agency says commercial products only. |
| 3 — Software/services | Fail hardware-only, equipment, construction, or physical infrastructure buys. Do not fail software with incidental hardware or negated hardware wording. |
| 4 — Submittable | Use evidence of an existing account, feasible registration, or an allowed submission method. A procurement contact email is not proof that email submission is allowed. Confirmed registration that cannot finish in time fails. Unknown submission access stays explicit and prevents an unconditional final qualification. |
| 5 — Deal size | Clearly below $100K, including convincingly tiny scope, fails. Use stated project value or a reasoned scope/comparable estimate. Unstated or genuinely uncertain size does not automatically fail; flag Peter review. Insurance, bonds, fees, and prior awards are not this project's budget. |
| 6 / 6a — Eligibility and references | Check actual mandatory qualifications, set-asides, reference wording, and current company/partner evidence. Generic commercial references are not public-sector references. Apply Jake's one-clean-government-reference baseline, tight 1–2-reference handling, and 3+ failure unless a verified named partner covers it. Do not invent credentials or equate an Esri partnership with certification. Verify dated company facts before relying on them. |

The company baseline is evidence to verify, not permission to invent an updated capability profile. If necessary source facts are unavailable, expose the gap rather than certify eligibility.

Both phases also use **all eight categories**.

| Category | Maximum | Required grounding |
| --- | ---: | --- |
| Case Study Match | 25 | Read the actual case-study library; name the real project and transferable capability. Apply near-clone, same-capability, adjacent, remote, and no-match bands. A keyword or the skill's project index is not enough. |
| Agency Type Fit | 15 | Apply Jake's ICP, adjacent, private-sector proof, and no-proof bands to the actual buyer. |
| Tech Stack Alignment | 15 | Compare the requirements with proven delivery; use the proposed proven stack for technology-agnostic scope. Experience is not certification. |
| AI / Agentic Angle | 10 | Distinguish central AI, a named component, a plausible enhancement, and no AI. “Email” alone belongs in no AI, not the named-AI band. |
| Deal Size Fit | 10 | Apply Jake's size bands to a sourced or reasoned estimate. Use 0 for genuinely uncertain, possibly tiny scope that cannot reasonably be inferred above $100K. Do not preserve today's default 7 as a substitute for inference. |
| Compliance Fit | 10 | Directly demonstrated, adjacent, standard, or unfamiliar compliance, supported by real work. A requirement mentioning HIPAA does not prove Seamgen meets it. |
| Competitive Position | 10 | Score favorable/neutral/unfavorable evidence; apply and show effort/structural and wired deductions. Full-text scoring includes the landscape recipe, tells AND counter-evidence. No research means “Insufficient evidence,” no wired deduction, and an explicit provisional note. |
| Timeline Comfort | 5 | Reuse the deadline helper: 30+ days = 5; 21–29 = 4; 16–20 = 3; 11–15 = 2; 10 = 0. |

Use the rubric's bands, not a new set of fixed midpoint defaults. Code validates the bands and computes totals. For overlapping size-band endpoints, use the highest applicable band and document this tie convention; do not merge conflicting source amounts into a fabricated project range.

## Smallest implementation that meets the goal

Use one small shared scoring implementation for both callers:

- **AI reads and judges:** apply the existing skills to the supplied opportunity evidence, real company sources, and available landscape research. Return structured gates, category judgments, reasons, citations, conditional questions, and uncertainty.
- **Code validates and finalizes:** enforce known hard constraints, evidence references, category ranges, arithmetic, deadline handling, recommendation precedence, and document confidence.
- **Both paths consume that same result.** Do not leave the old keyword totals or qualification heuristics as a hidden fallback.

Reuse ISA's existing model configuration and credentials through a bounded, non-delivering, tools-free model request. Do not add a model service, provider account, credential store, general framework, or company inventory database. The exact safe invocation must be verified against the installed runtime before implementation; an unrestricted ISA chat session is not an acceptable scoring adapter.

Read `resources/proposal-sources/Proposal - Case Studies.txt` and existing approved qualification/capability records from the runtime workspace. Keep these private source files outside Git. Missing assets are an explicit scoring/review limitation, not permission to use the skill index, model memory, or fabricated fixed points.

In preliminary scoring, missing requirements in a summary are not proof that they are absent. Carry reasonable custom-work ambiguity and unstated size as provisional, as Jake requires. Unknown deadlines still need review. In full-text scoring, unresolved mandatory eligibility or submission requirements cannot become a qualified pursuit.

## Company evidence setup — local files, no database

Use the existing files from the supplied `jake-seamgen-rfp-system-main (1).zip`, under `jake-seamgen-rfp-system-main/resources/proposal-sources/`. This is a prerequisite for scoring, not a new database or ingestion system.

| File | Purpose | Current loader |
| --- | --- | --- |
| `Proposal - Case Studies.txt` | Real past projects and transferable delivery experience. | Loaded; a nonempty library is required. |
| `Proposal - Assets.txt` | Company/proposal information supporting capability and eligibility judgments. | Loaded when present; unverified claims are not proof. |
| `Proposal - People.txt` | Team background and potential supporting qualification records. | Available in Jake's archive, but not currently loaded. Do not assume it influences scoring without a separately reviewed loader change. |

Setup steps:

1. Review the archive copies before use. Historical project descriptions can support past experience, but current certifications, government references, partner status, and other eligibility claims need current support. Keep unresolved or conflicting claims explicit; do not silently rewrite company facts or treat the archive as verified current.
2. Keep a private local copy under ignored `.isa-local/` and place the reviewed Case Studies/Assets files under `resources/proposal-sources/` in the isolated test workspace. Confirm the actual destination is Git-ignored. Do not add private contents to tracked `workspace/`, fixtures, logs, or specs. Record source/archive identity, hashes, and review status without reproducing private content.
3. Test that `loadScoringContext(testWorkspace)` reads those exact files and returns the real library/company sources. This is a file-loading check, not a model call. Missing or empty case studies must remain `context-unavailable`; missing qualification evidence must not become a claimed capability.
4. On a separately authorized VM upload, first check the exact destination files and directory for existing copies. If identical, leave them alone. If different, compare and resolve the differences; do not overwrite newer or uncertain company material. Back up any approved replacement and record hashes before changing it.
5. Upload only the reviewed Case Studies/Assets files to `/home/azureuser/.openclaw/workspace/resources/proposal-sources/`, with access limited to the runtime user and authorized maintainers. This private-data transfer is separate from the source deployment command; do not widen `devtools/live-files.json` or commit the files to make deployment easier.
6. Verify destination hashes and file loading, then run a separately authorized, isolated AI scoring comparison. Do not run a normal sales/RFP job or change schedules, credentials, or model configuration as part of copying files.

No database, automatic file-sync job, or new credential setup is needed. Record which file versions were actually used so local and VM scoring can be compared on the same evidence. This spec update does not perform or authorize the VM upload.

## Control flow and decisions

1. Preserve Jake-compatible intake exclusions; verify them with identical records and configuration. Recompute scoring deadlines against the assessment date, not capture time.
2. At metadata depth, apply the gates first. A known failure stops weighted scoring. For survivors, apply all eight categories, record the provisional breakdown and uncertainties, then select 75+ for documents.
3. Do not fetch documents for a below-75 result or bypass eligibility using the six hardcoded historical titles. Resolve selected candidates unambiguously; do not silently score a similarly named opportunity.
4. Use the existing document flow and saved files. Reload evidence after extraction; never label candidate summaries as document text.
5. Reapply the complete policy to the actual solicitation and scoring-relevant attachments. Recompute the categories; do not merely adjust a preliminary total.
6. Use the validated result for candidate state and reports. Separate preliminary score, final score, document status, and confidence.

Decision precedence:

- An explicitly closed/non-submittable notice cannot be recommended as an open bid. RFIs/Sources Sought retain Jake's non-scored light-screen/watch handling. This is bid eligibility, not a seventh scoring gate; a sole-source flag alone is not proof that submissions are closed.
- Any independently evidenced gate failure yields **No-bid**, without a weighted total. A legacy `score: 0` sentinel is allowed only with the failed-gate reason, not a fabricated eight-category score.
- Unknown/invalid deadline, missing required scoring documents, unresolved mandatory eligibility, or a failed model request yields a review/provisional result, not a qualified pursuit.
- **Conditional — Ask the Agency** follows Gates 2/2a, with the actual proposed question and Q&A constraint. Any illustrative custom-allowed score is not an approved final bid score.
- Otherwise use **75–100 Strong Pursue**, **50–74 Worth a look**, **0–49 No-bid**. Metadata recommendations remain explicitly provisional and cannot enter the document-backed pursue section.
- CEO connection and sensitive-industry flags do not change points or create new automatic gates. Landscape research gaps remain visible even if the document package itself is full-text.

No automatic agency question, pursue email, CRM write, or proposal is added by this scoring change.

## Evidence and document boundary

Small fixes to the existing document-role/completeness checks are in scope because scoring cannot be aligned while a rating form counts as the RFP:

- Recognize solicitation filenames such as `RFP_Final`; distinguish evaluation/rating forms, bid-board exports, addenda, and the real solicitation by content as well as name.
- Mark extraction success only for actual usable text. Identify known required scoring documents mentioned in the solicitation, even if HigherGov never returned them.
- If the solicitation or a known required scoring attachment is missing, inaccessible, unsupported, or unsuccessfully extracted, keep the outcome provisional. A manifest's “downloaded” flag alone cannot establish full-text.
- Do not claim that checking the returned list proves there are no missing requirements elsewhere.

This does not expand portal automation or promise that HigherGov supplies every package. Preserve the existing URL/document lookup fixes and fetch flag. Broader retrieval, schedulers, and access limitations belong to [document qualification](../../domains/rfp/document-qualification.md).

## Acceptance and proof

Implementation is not complete at “about 20/31.” Required proof:

- All 31 existing reviewed policy cases pass, plus coverage for conditional Gates 2/2a, reference/certification evidence, grounded category bands, value inference, uncertainties, landscape deductions, flags, and both scoring callers.
- Deterministic tests use synthetic company assets and recorded model judgments through the real validator/finalizer. No mirrored scoring implementation in the test adapter.
- Test actual caller wiring, stored outcomes, threshold selection, and report classification in a temporary workspace with all outbound effects blocked.
- Retain the deadline regression: October 26 submission, September 30 assessment, 26 days, 4 timeline points, and “Approved 5/7/75” ignored. Do not freeze a legacy total of 77 if correcting another category legitimately changes it.
- With separately authorized model access, compare Jake's workflow and ISA on identical input packets and dates. Review exact gate/decision agreement and evidence-grounded category bands, repeat runs, and explain differences. Do not compare historical counts from different input batches.
- `npm test` (including all 31 rubric cases), `npm run check`, and `git diff --check` pass on the implemented source.

Unresolved policy ambiguities must be recorded and settled, not hidden by weakened fixtures. A deterministic fixture pass alone is not proof of real-model alignment.

## Scope limits and release

No new database, inventory system, pipeline redesign, search changes, backfill, intake reset, report redesign, autonomous communications, scheduler change, or automatic deployment. No historical reports are rewritten.

Before editing runtime source, reconcile newer VM weekly/document-helper code through normal reviewed Git changes. Preserve the deployed deadline work already on this task branch, and verify the current integration target before publication. A merge to main is not a VM deployment.

A later exact-file release must include all imported helpers, fresh drift checks, backups/hashes, an explicit rollback, and isolated validation. No flag enablement or normal production job is implied.

See [plan.md](plan.md) for insertion points and [tasks.md](tasks.md) for the implementation ledger.
