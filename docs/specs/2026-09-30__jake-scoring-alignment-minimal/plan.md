# Plan: complete Jake scoring alignment, focused implementation

**Status: shared scorer and caller integration implemented locally; original-recipe model comparison exposed release blockers.** Read [spec.md](spec.md) for the acceptance bar, [model-evaluation.md](model-evaluation.md) for initial tests, and [reference-comparison.md](reference-comparison.md) for the additional same-input checks. Complete practical alignment and release remain pending.

## Shape

Replace divergent scoring, not the surrounding platform. Keep the existing weekly/secondary entry points, intake, document retrieval, candidate folders, and report formats.

Use two focused modules alongside the existing deadline helper:

- `workspace/scripts/rfp-scoring-policy.mjs`: pure validation/finalization of one scoring result. Own fixed constraints, value-evidence checks, category bands/caps, deductions, total arithmetic, and decisions. No filesystem, provider, or business-job side effects.
- `workspace/scripts/rfp-scoring-judgment.mjs`: load the existing policy/company sources, build a source-labeled evidence packet, and obtain bounded structured AI judgments using the existing ISA model setup. Accept an injected model transport for offline tests.

Do not add a separate value engine if the small value checks fit inside the policy module. Do not create an inventory database, new agent service, or generic plugin framework.

The existing `reengagement-outreach-agent.mjs` shows a local OpenClaw invocation pattern, but it is not proof of safe scoring permissions or CLI compatibility. Verify a supported **non-delivering, tools-free** request first; use the existing configured model rather than copying that script's model choice. If the installed transport cannot enforce this, resolve that prerequisite explicitly rather than launching ISA with its normal production tools.

## Shared input and result

Proposed contract; implementation may adapt names to existing consumers, not omit required evidence:

```text
scoreRfp({
  phase: preliminary | full-text,
  opportunity: stable key, metadata, source,
  assessment: current date and reporting timezone,
  documents: [{ id, file, role, text, source }],
  completeness: solicitation + known required scoring attachments,
  companySources: existing case-study and verified capability records,
  landscapeEvidence: available read-only research with sources
}, { judge }) -> validated result
```

The result carries:

- Six gates with subrule reasons, evidence IDs, and uncertainty/conditional handling.
- Eight category judgments with band, points, reasoning, and evidence. Timeline points come from `rfp-deadline.mjs`.
- Value evidence: stated amount/range/ceiling versus an inferred estimate, its basis, and uncertainty.
- Category 7 base points, effort/structural deduction, wired verdict/deduction, and final arithmetic.
- Computed weighted total or null, recommendation, preliminary/final distinction, deadline assessment, confidence, review notes, sensitive-industry/CEO flags.
- Source hashes or identifiers, rubric version, assessment date, and observed model identity sufficient to reproduce this run. Use existing candidate/report files; no new persistence subsystem.

**Pure validation rules:**

- Require six distinct gates and eight distinct categories when weighted scoring is permitted; reject missing, duplicate, unknown, out-of-band, or non-finite values.
- Validate source IDs against the supplied packet; require actual project evidence for case matches and company/partner evidence for eligibility claims. Citation validation cannot prove the interpretation, so evaluation must check it too.
- Distinguish an unknown requirement from a verified absence. Summary-only “no known blocker” is provisional, never proof of qualification.
- A source amount must describe this project. Do not take the first dollar value or silently turn `val_est_low` into an upper bound. Do not use the maximum of conflicting estimates as the project's size.
- A clear current solicitation value governs a listing estimate; conflicting official statements need explicit resolution. Unstated/straddling size invokes grounded judgment, not a default 7 points or automatic rejection.
- Enforce known sub-$100K evidence and the deadline helper independently of AI. Validate inferred-value bands against the supplied estimate; reject unsupported confidence.
- Apply the rubric's bounded deductions once, show the arithmetic, floor Category 7 at zero, and sum all categories in code. Models do not choose the total or override a hard failure.
- Apply the spec's recommendation/confidence precedence. A known gate failure stops weighted scoring; a conditional custom-allowed estimate is labeled separately.

Do not silently clamp an invalid model answer into a valid-looking result. This implementation fails closed on the first invalid response or timeout, with an explicit scoring error/review result and no keyword fallback. Automatic schema-repair retries were not added.

## AI judgment and grounding

Use the scoring/preliminary skills as the governing instructions, with the landscape recipe at full-text depth. Put RFP text in a separate untrusted-data section. Instructions embedded in a solicitation cannot grant tools, change policy, or trigger actions.

Read the actual case-study file and available recorded qualification evidence. Preserve “exact,” “adjacent,” and “not answered” distinctions. Old skill assertions such as GSA/SBA status need current support; an unverified Esri relationship cannot score as a credential.

For full-text landscape analysis, inspect the requirements and available primary procurement/product evidence. Seek counter-evidence, not just vendor-shaped tells. Reuse approved read-only research capabilities or existing source material; do not add a new crawling pipeline. If research has not been done or cannot be obtained, emit “Insufficient evidence,” no wired deduction, and a provisional note exactly as Jake allows.

Use a fresh isolated scoring context per opportunity/phase, bounded input/output and timeout, and no delivery or business tools. Keep private prompts/results in ignored runtime/test locations. Do not log credentials. If the evidence exceeds supported context, process document sections with retained source references or stop as provisional; never silently truncate a required attachment and claim it was reviewed.

The authorized response-reliability follow-up supplies paragraph IDs and resolves original quotations locally before the unchanged strict finalizer. All substantive text is retained; unknown IDs are rejected, not repaired. Literal project names and existing category bands remain required. See [response-reliability.md](response-reliability.md) for the scope and fresh proof.

## Owning files and insertion points

| File / current seam | Focused change |
| --- | --- |
| New policy/judgment modules | Shared policy execution and evidence-grounded AI adapter; no entry-point side effects on import. |
| VM-reconciled weekly: `scoreMetadataCandidate`, `scoreCandidateFromText`, `evaluateQualificationGates` | Replace score-producing fit/landscape/capability heuristics with the shared scorer. Make callers await judgment where needed. Narrative helpers may remain, but cannot contribute extra points or override validated eligibility. |
| Weekly: `extractManifestEvidence`, `runIsolatedDocumentFlowTest`, `main` | Pass per-file evidence/roles and completeness; preserve preliminary vs final results, strict gates, review handling, and the 75-point selection. Remove fallback from document evidence to metadata for final scoring. |
| Weekly: `persistCandidateState` and report builders | Persist and display the same validated result and breakdown; distinguish failed-gate zero sentinels from calculated totals, and provisional leads from qualified pursuits. Keep existing files/layout. |
| Secondary: `buildScore` and `detect*` score/gate helpers | Replace authoritative keyword scoring with the shared policy result. Retain pure finalization for tests; production obtains AI judgment before calling it. Do not keep an optional “aligned” path while normal runs use old heuristics. |
| Secondary: `main`, `loadSelectedTitles`, candidate matching | Remove forced historical-title inclusion. Honor validated provisional 75+ selection and known eligibility; match a unique current candidate. Report ambiguous/missing matches instead of guessing. Keep the existing report input where possible; do not redesign intake identity storage. |
| Secondary: `fetchAndExtract`, `buildSecondaryReport` | Record extraction and package completeness; no candidate-body fallback presented as full-text. Reports consume the validated recommendation/confidence. |
| VM-reconciled document helper: `classifyDocumentRecord`, `evaluateDocumentCompleteness` | Narrow scoring-evidence fixes: solicitation vs ancillary documents, `RFP_Final`, known missing required documents, and extraction status. Preserve newer HigherGov lookup behavior. |
| `rfp-deadline.mjs` | Reuse the approved helper unchanged unless a separately demonstrated new defect requires a scoped fix. |
| `devtools/rfp-alignment-adapter.mjs`, fixtures/tests | Exercise the real shared finalizer with recorded judgments and both callers with an injected transport; do not import/run the weekly business job merely to test a function. |
| Focused RFP docs and allowlist | Update enduring rules with the implemented behavior. Add only new source/helper paths needed for controlled transfer; never widen to private assets/state. |

Intake prefilter parity remains covered by the existing four synthetic record cases. Fix a demonstrated scoring-policy exclusion mismatch if one appears, but do not change saved searches, pagination, quotas, resets, or watermark mechanics to force September 22 counts.

## Implementation sequence

1. **Establish the baseline and shared scorer.** Refresh read-only VM comparison, reconcile newer approved source through normal Git review, preserve deadline fixes, verify the safe model transport, and add policy/structured-judgment tests. Implement all gates and category rules in the shared modules.
2. **Connect both real callers.** Replace preliminary and full-text scoring in the weekly and secondary paths. Add the narrow document-evidence fixes, eliminate forced selection/fallback scoring, and connect existing persistence/reporting to the validated result.
3. **Prove alignment and hand off.** Run all reviewed policy cases and isolated caller/report tests. With separately authorized model usage, perform repeated same-input Jake/ISA evaluation, review discrepancies, and document remaining data/portal limitations. Prepare, but do not perform, a separate exact-file release.

Small reviewable commits are useful; a separate user approval for every internal function is not a technical requirement. Do not call any incomplete stage “complete alignment.”

## Test strategy

**Offline, no providers or business effects:**

- All existing policy cases; add conditional gates, real-analog grounding, verified partner/certification evidence, portal feasibility, scope-inferred and uncertain value, category bands, deductions, and flags.
- Strict validator tests for fabricated citations/projects, omitted gates/categories, invalid points, unsupported value claims, and malformed model responses.
- Same complete evidence + same recorded judgment produces identical gate/category/decision results in both callers. Different evidence phases are allowed to change the score, with reasons.
- Temporary-workspace integration proves gate-first behavior, no below-75 fetch, no forced six-title inclusion, threshold selection, correct stored scores, incomplete-document review, and report grouping.
- Assert no email/Telegram/CRM/Drive writes, no provider calls, no intake reset/watermark advance, and no production paths.
- Retain deadline/date/timezone/approval-date tests. Replace only policy-obsolete heuristic total assertions, recording why; never weaken the deadline or document assertions to preserve 77.

**Controlled real-model evaluation, separately authorized:**

- Give Jake's reference workflow and ISA identical rubric, company evidence, opportunity packets, source research, and assessment date. Use synthetic or approved sanitized inputs.
- Review exact fixed-rule/gate/recommendation agreement and judgment categories against source-backed expected bands. Repeat runs, especially near 50/75, and investigate recommendation flips.
- Record actual models, source hashes, missing inputs, costs, and discrepancies. Historical six-RFP totals and 21-vs-88 survivor counts are not a golden dataset without the original records/config.
- Model tests are part of the alignment proof, not a reason to silently spend quota or run production jobs now.

## Source/release safety

Implementation branch: `test/rfp-rubric-alignment`, based on `7d39fca`, with pending source/tests/docs. `origin/main` remained `26c5cdd` when refreshed September 30. The task includes the deployed deadline commits, not yet integrated into main.

The read-only VM snapshot was refreshed before implementation. Newer weekly `0032dd7f…` and document helper `f2fdcd15…` source were reviewed and reconciled locally; secondary `ec0108c1…` matched tracked source. Preserve this baseline and refresh again before any release; these hashes are not permission to overwrite current VM files.

A separately authorized release must preview exact changed files and all imported helpers, check live drift, retain backups/hashes, define rollback, and run isolated non-delivering checks. Publish code/docs together through Git. No main merge auto-deploys; no fetch flag, cron, model configuration, or ordinary business job changes are implied.
