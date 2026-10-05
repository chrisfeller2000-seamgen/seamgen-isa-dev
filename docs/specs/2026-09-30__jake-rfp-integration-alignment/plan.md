# Plan: Jake RFP integration alignment

Status: **Unapproved architecture plan.** It lists decisions and insertion points only. There is no implementation, and nothing is deployed. Read [spec.md](spec.md) first. Progress is tracked in [tasks.md](tasks.md).

## Approach and alternatives

**Chosen approach:**
- One small, pure, versioned policy module owns the rubric's rules.
- The weekly (preliminary) route and the secondary (document) route both call it.
- Items that need judgment enter through a structured seam instead of regex.
- Results persist per candidate with provenance.
- Delivery is in thin slices. Each slice is measured by the strict `npm run rfp:alignment` command and must preserve the deployed deadline helper and the newer VM files.

Data shapes the module works with (names are indicative):

```
EvidenceRef    { source: metadata|document|inventory, ref, section?, quote? }
GateResult     { gate, state: pass|fail|needs-review|conditional|n-a,
                 reason, evidence: EvidenceRef[], decidedBy: rule|model|human }
CategoryResult { id, max, points: number|null, reasoning, citations: EvidenceRef[], decidedBy }
Assessment     { policyVersion, assessmentDate, confidence, documentStatus, gates,
                 categories, total: number|null, recommendation, flags, sourceHashes }
```

The module exposes the policy version and rubric provenance (skill version and hash), the category definitions (ids, weights, bounds), and three signatures:

- `evaluateValueGate(valueEvidence) → GateResult`
- `timelineFromDeadline(deadlineAssessment) → { gate1, category8 }`
- `decide({ gates, categories, confidence, documentStatus, notice }) → { total, recommendation, reasons }`

**How the module is built:**
- It performs no filesystem, network, or process access, and imports nothing.
- It accepts the deadline assessment produced by `rfp-deadline.mjs` rather than re-deriving dates, so the deployed helper stays untouched.

**Alternatives considered:**
- **Patch the regexes in each file.** Rejected. This keeps two diverging policies, and a regex cannot make the judgments in Gate 2/2a, Gate 4, Gate 6, and Categories 1, 3, 4, 6, and 7.
- **Have a model apply the whole skill at runtime** (closest to Jake's workflow). This remains the target for judged items only. It is blocked on an approved provider, credential, and interface, and it is wrong for arithmetic, thresholds, and dates.
- **Merge the weekly and secondary into one script.** Deferred. The secondary's production invocation is unknown, and a shared module gives the same consistency with a much smaller change.
- **Run Jake's PowerShell intake.** Rejected. ISA's Node port is the production intake, so trace its differences instead.

## Source and insertion points

| Area | File · function | Change | Slice |
| --- | --- | --- | --- |
| Policy | new `workspace/scripts/rfp-policy.mjs` | Version, categories, Gate 5, decision mapping; later gates as slices land | 1a+ |
| Secondary gates | `secondary-fulltext-score.mjs` · `detectGates()`, `buildScore()` | Gate 5 and recommendation via the policy, then Gates 2, 3, and 6 | 1a, 2 |
| Secondary documents | same · `fetchAndExtract()`, `main()` | Use the document helper's lookup, list, save, and completeness; no metadata-body scoring as full-text | 3 |
| Secondary selection | same · `loadSelectedTitles()`, `requiredNames` in `main()` | Select from persisted candidate state; apply the hardcoded-title decision | 4 |
| Weekly gates | VM `weekly-rfp-pursue-decision.mjs` · `evaluateQualificationGates()` | Gate 5 via the policy; Gate 1 via the deadline helper, proposal deadline only | 1b |
| Weekly categories | same · `scoreCandidateFromText()` | Return the eight-category structure; unscored categories are null | 2 |
| Weekly state | same · `scoreMetadataCandidate()`, `main()`, `buildHigherGovCandidateContent()` | Persist the Assessment and provenance; separate report sections | 4 |
| Intake | same · `runHigherGovIntake()`, `getHigherGovPrefilter()`, `clearPortalCandidatesCache()` | Intake manifest, `searchId` guard, shared set-aside check, retention decision | 2, 4, 7 |
| Documents | VM `highergov-document-flow.mjs` · `classifyDocumentRecord()`, `evaluateDocumentCompleteness()` | Owner set by the evidence-gating boundary; consumed through its result | 3 |
| Harness | `devtools/rfp-alignment-adapter.mjs`, fixtures | Inject the real policy exports into the extraction context; add a recorded-judgment input | 1a, 6 |
| Tests | new `devtools/rfp-policy.test.mjs`; replay and pipeline fixtures | Pure policy cases; layer C and D fixtures | 1a, 8 |

**How the harness reaches the weekly script.** The weekly script runs `main()` on import. The adapter therefore keeps extracting named functions from it. When an extracted weekly function calls a policy export, the adapter must provide that export from the real module. It must not provide a copy. A mismatch between declarations must keep failing loudly.

**Edit baseline.** Weekly and document-helper edits start from the VM versions only after the behavior-neutral reconciliation commit (tasks §0). The VM hashes are `0032dd7f…` for the weekly script and `f2fdcd15…` for the document helper. The secondary's tracked source equals the deployed version (`ec0108c1…`), so slice 1a has no drift dependency.

## Invariants and side effects

- **Deadline logic.** The deadline correction and its helper are consumed as they are. The 10 calendar days and the timeline bands do not change.
- **Rules that do not change.** Weights, the $100K floor, the 75 fetch threshold, and the six gates stay as they are. The closed-notice rule is added only as an approved product clarification.
- **Gate outcomes.**
  - A `needs-review` gate never counts as a pass.
  - A verified gate fail always gives No-bid.
  - A null total is never shown as a rubric score.
  - A heuristic number is labeled as heuristic.
- **Evidence levels.**
  - A metadata lead never becomes full-text.
  - An incomplete, empty, gated, or ancillary-only set never produces an unconditional pursue.
  - Completeness is judged against the required scoring documents.
- **Value evidence.**
  - No budget is inferred from an incidental dollar amount.
  - Neither side of a range is adopted without the confirmed Gate 5 rule.
  - `sole_source_flag` alone stays a flag.
- **Company evidence.** Capabilities, references, certifications, and partners come from the reviewed inventory. They never come from RFP wording.
- **Side effects of imports and tests.** No new outbound calls. Imports stay side-effect free. Tests use no provider, credential, email, Telegram, HubSpot, Drive, watermark, `seen.csv`, or real-candidate access.
- **Reports.** Historical reports are never rewritten. Replays write to a separate directory and produce a diff.
- **Versioning.** Any rule change bumps the policy version. Persisted results and reports carry the version and source hashes. A fixture expectation changes only with a recorded Jake or Peter decision.
- **Fetch flag.** `RFP_DOCUMENT_FETCH_ENABLED` stays off. Changing it is a separate configuration authorization.

## Context to keep beside code

- The policy module header records the rubric source (skill v1.8 plus the deadline wording, with its hash) and the policy version.
- Short comments sit only where a rule is non-obvious: the Gate 5 range rule, the Gate 6a count comparison, and the `needs-review` semantics. Each links to the decision record.
- At the end of each slice, lasting rules are promoted to `docs/domains/rfp/` (document qualification and rubric alignment). The spec stays task-scoped.

## Staged slices

| Slice | Outcome | Depends on | Baseline rows expected to clear |
| --- | --- | --- | --- |
| 1a | Policy skeleton, Gate 5, and decision mapping in the secondary | Harness committed; Gate 5 rule confirmed | Secondary Gate 5 ($5K, $99,999) |
| 1b | Weekly Gate 5 and Gate 1 | 1a; VM reconciliation | Weekly unstated value; weekly question deadline |
| 2 | Gate 3 negation, Gate 2 material-custom, set-aside, "bid"/"email" boundaries, weekly category structure, closed notice (if approved) | 1a; Jake case review | Secondary Gates 2 and 3, the two category rows, the weekly category count, and closed notice |
| 3 | Secondary consumes document completeness; no metadata-body full-text | VM reconciliation; evidence-gating boundary | Rating-form total; classifier rows (with their owning spec) |
| 4 | Persisted Assessment; selection from candidate state; report sections | Retention and `requiredNames` decisions | None (layer C) |
| 5 | Inventory; Gate 6/6a from a structured requirement plus the inventory; citations | Inventory owner and storage | Gate 6 rows, using recorded requirement judgments |
| 6 | Judgment seam and model evaluation | Approved provider and credential | None (layer B) |
| 7 | Intake manifest, `searchId` guard, frozen replay, and diff | Approved storage for real batches | None (explains counts) |
| 8–9 | Layers C and D, then release E | All prior slices that are in scope | None |

Gate 6 rows stay failing until slice 5. Moving them to `needs-review` in slice 2 is more honest, but it is not a pass.

**Recommended first bounded fix: slice 1a.**
- The defect is demonstrated in both routes.
- Its fail and pass boundaries follow directly from the rubric.
- The code is pure and small, and the secondary has no VM drift.
- It creates the module that every later slice uses.

Dependencies: the harness is committed, and Peter and Jake confirm the uncertain and straddling-range wording. Weekly adoption (1b) waits for reconciliation.

The alternative first fix is slice 3. The rating form produced an 86 and a Strong Pursue, so its sales impact is higher. But it depends on the reconciliation and on the evidence-gating boundary.

## Findings by kind

- **Demonstrated defects** (baseline, spec table):
  - Gate 5 in both routes
  - keyword-based Gate 6/6a
  - secondary Gates 2 and 3
  - weekly Gate 1 date choice
  - the rating form accepted as a solicitation, and the underscore filename
  - "bid" and "email" substring matches
  - the missing weekly category breakdown
  - closed notice scored as Strong Pursue
- **Code-reading findings that need a regression test:**
  - the secondary scoring the metadata body as full-text
  - Markdown and hardcoded-title selection
  - candidate deletion on every run
  - no inventory grounding
  - missing Conditional, 2a, and wired-read outcomes
  - no `searchId` guard in the Node intake
- **Remaining research:**
  - the September 22 batch and counts (the inputs may be unrecoverable)
  - how the secondary is invoked
  - how ISA answers from reports
  - the provider document contract versus the old opaque-ID fixture
  - the PowerShell intake, which has not been executed
- **Proposed policy clarifications (Jake or Peter to confirm):**
  - the Gate 5 range and uncertainty rule
  - the display of a pursue carrying an uncertain value
  - Gate 2 material-custom work as `conditional` or `needs-review`
  - Gate 6 as `needs-review` until the inventory exists
- **Product decisions:**
  - the closed or non-procurement notice rule
  - the interim display of heuristic scores
  - model provider and interface
  - inventory owner and storage
  - candidate retention
  - the hardcoded titles
  - the fetch flag

## Verification and release boundary

- **Every slice:**
  - add the failing tests first
  - run `npm test` and `npm run check`
  - run `npm run rfp:alignment` against tracked source, and with `--source-workspace=.isa-local/candidate/workspace` against the VM snapshot (exit codes: 1 = rule mismatch, 2 = adapter error)
  - record the cleared and remaining rows, and the source hashes
  - review the diff and run a secret scan
- **Layer A.** Strict alignment exits 0 on the Jake-reviewed set, plus the pure policy tests.
- **Layer B.** Separately authorized. A frozen set, Jake-reviewed expectations, pre-approved tolerances, and repeated runs. Results are reported without claiming either system is better.
- **Layer C.** An offline pipeline fixture with a mocked provider:
  - persisted Assessment fields
  - report eligibility (no lead or needs-review item in the pursue section)
  - a diff against historical reports
- **Layer D.** An isolated dry run in a temporary workspace. Sentinels must show no email, Telegram, HubSpot, Drive, watermark, `seen.csv`, or real-candidate change.
- **Layer E.** Separately authorized:
  - `npm run live:pull` and a drift check, with the newer VM files as the baseline
  - an exact-file `live:deploy` preview and apply, with backups and hashes recorded
  - pure-function checks on the VM
  - read-only observation of the next scheduled Friday run
  - a written rollback that restores exact files and never resends messages or restores stale reports
  - the fetch flag unchanged
