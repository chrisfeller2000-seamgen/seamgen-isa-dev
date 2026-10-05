# Local implementation record

## October 5, 2026 update

Committed on `test/rfp-rubric-alignment`; not pushed or deployed.

- `91a5c2b` preserves the September 30 work exactly as found.
- `9c7c218` merges `fix/rfp-evidence-gate`, so the branch starts from the code deployed on the VM: the HigherGov lookup/retry helper, the weekly job, and the secondary "Needs documents" gate. A readable solicitation goes to the shared AI scorer; anything else is Needs documents without a model call. The weekly job, secondary scorer, and policy share one file classifier, including content recognition of the solicitation.
- `308c5e7` fixes the preliminary contract behind the failed September 30 batch, where all four preliminary scores were null:
  - Documents to retrieve may cite the listing before any documents exist.
  - The prompt asks for all eight categories at metadata depth.
  - "Watch" needs RFI, Sources Sought, or pre-solicitation evidence.

  Offline replay of the four retained answers: the reference-blocker answer now validates (provisional 92, documents fetched). The answer that omitted categories and the two watch answers stay unscored. A fresh bounded model run is still needed to show that the prompt change works.
- `506847e` and the following documentation commit simplify without changing rules:
  - The finalizer is split into named steps.
  - The model-facing contract is written once.
  - The regex/vm alignment harness and `npm run rfp:alignment` are replaced by `devtools/rfp-alignment.test.mjs`.
  - Unscored and early-return results carry null categories instead of zeros.

Checks: `npm test` 111/111 (including all 31 rubric cases), `npm run check` 16 scripts, `git diff --check` pass. All offline.

Also found on October 5:

- **Keyword No-bids.** With the deployed keyword scorer, all 18 of the 42 real September 30 RFPs that were scored from documents came out No-bid on keyword gates. All 18 failed the hardware keyword. This work replaces that scorer; see the [needs-documents spec](../2026-10-05__rfp-needs-documents/spec.md).
- **Title matching.** The secondary now matches report titles exactly. 131 of 135 current report entries match one candidate; 4 shortened titles go to Needs review instead of being guessed. Adding the slug to weekly report entries would close that gap.

Next steps, each needing separate approval:

1. Upload the reviewed Case Studies/Assets files to the VM.
2. Run a bounded real-model batch on real RFPs, covering preliminary selection and full-text scoring.
3. Release the weekly job, secondary scorer, document helper, policy, and adapter together, coordinated with Sam and Hugo.

## September 30 status and proof

The `npm run rfp:alignment` command named below was replaced on October 5 by `devtools/rfp-alignment.test.mjs`.

Shared scoring is implemented on `test/rfp-rubric-alignment`, based on `7d39fca`. Refreshed `origin/main` remained `26c5cdd`. Existing deadline work and pending task files were preserved. Initial user-authorized model requests and a subsequent original-recipe comparison ran in isolation; see [model-evaluation.md](model-evaluation.md) and [reference-comparison.md](reference-comparison.md). The comparison exposed release blockers, not complete practical alignment. No commit, push, merge, deployment, business job, credential creation, or credential copy was performed.

Final local checks:

| Check | Result | What it proves |
| --- | --- | --- |
| `npm test` | 75/75 pass | Offline policy validation, caller wiring, evidence-reference bounds, temporary persistence/reports, document fixtures, and existing regressions. |
| `npm run rfp:alignment` | 31/31 cases; zero failed checks | Original synthetic policy expectations pass with recorded judgments. Not real AI agreement. |
| `npm run check` | 16 JavaScript/shell scripts checked | Source-boundary and syntax checks; not provider integration. |
| `git diff --check` | Pass | No diff whitespace errors. |

The old keyword-scoring baseline passed 12/31. Business expectations were retained. Legacy frozen total assertions were replaced with valid category arithmetic because the obsolete keyword calculator is no longer the policy authority; the actual deadline/day/timezone assertions remain. Synthetic HigherGov responses were corrected to accept the verified URL-shaped document path and distinguish an empty document list.

## Implemented behavior

- Both weekly phases and secondary scoring call one bounded judgment adapter and one pure finalizer. The divergent keyword calculators are removed as authoritative scoring paths.
- The existing four policy skills govern judgments. Six gates, their subrules, eight category bands, citations, real project/partner/credential evidence, value uncertainty, conditional routes, deductions, and review flags are validated. Totals and decisions are computed in code.
- The approved deadline helper is reused unchanged, including the October 26 / September 30 / 26 days / four points regression.
- Only eligible preliminary 75+ results trigger documents. Secondary selection no longer force-includes six old titles or guesses ambiguous matches.
- Rating forms, bid-board exports, and known missing required attachments cannot establish full-text qualification. Actual extracted text is required.
- Stored candidate state and reports consume validated outcomes. Failed model/context/validation requests stay unscored; no heuristic fallback or automatic repair retry.
- Scoring uses a fresh tools-free completion, not ISA's ordinary agent session. Input/output and request duration are bounded; evidence is not silently truncated.
- The AI selects supplied paragraph IDs, and code resolves original text before strict citation checks. Unknown/unused IDs and generated quote fields fail closed. Project names must literally appear in the selected library evidence. No fuzzy matching, quote repair, or automatic retry; see [response-reliability.md](response-reliability.md).
- A case-match bridge may cite both the buyer's requirements and the company's past work. The named project must still be supported by a case-study citation; a buyer document cannot supply that proof. This fixes an overly strict library-only check without changing scoring bands or weakening project provenance.

Existing intake, search configuration, schedules, document-fetch flag, integration credentials, and business-delivery behavior were not redesigned. No new research crawler, provider account, database, or model service was added. Available landscape evidence can be supplied; absent research is explicitly insufficient, not a fabricated wired verdict.

## Runtime prerequisites and remaining evaluation

A read-only SSH check succeeded. The VM has Node `v24.18.0`, OpenClaw `2026.9.6`, and the required completion/config/agent SDK exports. The tools-free interface has now completed isolated requests using ISA's existing `openai/gpt-6-luna` model/auth. The production jobs were not invoked.

The following canonical private files were absent on the VM:

- `resources/proposal-sources/Proposal - Case Studies.txt`
- `resources/proposal-sources/Proposal - Assets.txt`

A bounded workspace filename search (excluding backups, dependencies, and Git) found no matching copies. This is not an exhaustive scan of other VM directories. The provided Jake archive contains those files and `Proposal - People.txt`. Case Studies/Assets were extracted into ignored local test storage and reviewed for scoring risks, not certified current. No private content was copied into Git or installed in the VM workspace.

The adapter currently reads Case Studies and Assets at their canonical paths. The real nonempty case-study library is mandatory; without it, scoring stops with `context-unavailable`. Needed qualification records must be approved and available before release. Do not substitute the skill's project index or model memory. Additional named/dated credential records may need explicit source loading after their actual locations and authority are verified.

The agreed setup is file-based, with no database or automatic sync. Local extraction, targeted review, and actual file-loading validation are done; an exact-file VM upload with drift checks/backups/hashes remains separate. See [company evidence setup](spec.md#company-evidence-setup--local-files-no-database) and its [task checklist](tasks.md#company-evidence-setup--local-setup-done-vm-setup-pending). Test inputs were sent in memory for tools-free model requests, not installed in the live workspace.

Initial real-model results and the subsequent same-input original-recipe comparison are recorded separately. The latter found quote failures and a near-cutoff decision difference; it did not reproduce Jake's historical Claude environment. Before release, resolve model-response reliability and category interpretation and confirm needed current qualifications; see [company confirmation](company-confirmation.md). Valid quotes alone do not prove correct interpretation. Historical survivor counts, complete model alignment, and scheduled production correctness remain unproven.

The authorized follow-up replaced generated quotations with excerpt-ID selection and corrected comparison-citation validation. Fifteen bounded diagnostic requests were retained; both fresh final integration requests validated. Five clarified responses validate under final-source replay, including two rejected before the validator correction. Borderline scores of 71/73/74 have the same Worth a look decision but still vary subjectively. This improves the tested response path, not proof of production reliability. See [evidence-ID evaluation](evidence-id-evaluation.md) for exact results and timing.

## Source provenance and separate release

The read-only VM baseline was reconciled before implementation:

- Weekly: `0032dd7feaf153e96cfb4e15d2624ff466e122df9c60a62fa026ce41cc134ed7`
- Document helper: `f2fdcd1520497dc055df40d4c8ea96d7d91c11fef3bc5530b31f7b0f82111496`
- Secondary: `ec0108c12f8e2d25edc1ce5620c502cd25fe9ea663a38469b354be0290ef7187`

Newer URL lookup, stable-key verification, retries, pagination, and safe manifests were preserved. Refresh again before any upload.

Exact changed runtime set and final local SHA-256:

| File under `workspace/scripts/` | SHA-256 |
| --- | --- |
| `rfp-scoring-policy.mjs` — new | `1f81a49bf332d4c28121fea70b675da205a756ee4777f5c543e5fe013aed3a41` |
| `rfp-scoring-judgment.mjs` — new | `11dd9137912e0e245972f1399049f757bbe5722a53219f78e4e44864ca18d0f6` |
| `weekly-rfp-pursue-decision.mjs` | `bfd390708615451e40ff658659fa72818d66ad9ce71225e715c4c4791244f256` |
| `secondary-fulltext-score.mjs` | `2863b7eb6e9ecaed6bd431022d246c084b5a15cc00d0df65b2caa93edfe54147` |
| `highergov-document-flow.mjs` | `d2f1f5fbd9567fd558ef3776a3f9caa2ee15e7a21b1f481715e2e0f52ed1c71a` |

The unchanged approved `rfp-deadline.mjs` dependency is `410a27b202947c6d74ef83ba0b9add5c02126e514b42aa1838b1f37cce3af238`; verify its presence/hash during release. Existing skill policies also require a drift check. The source transfer allowlist already covers `scripts/`; it was not widened to include private assets.

Release is a separate request. First finish evaluation, publish code and docs together, preview exact files against fresh VM state, and back up old files/hashes. Coordinate a cutover with no in-flight job using mixed caller/helper versions. Rollback restores the exact prior caller/helper set; remove new helpers only after callers no longer import them. Do not enable document fetching, alter schedules/model configuration, or run an ordinary report as an implied release test.

The duplicate fetch/refresh skill remains unchanged and is a separate known issue. HigherGov/portal document gaps remain possible; scoring alignment does not make those documents available.
