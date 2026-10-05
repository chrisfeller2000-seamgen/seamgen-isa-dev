# Original-recipe comparison — September 30, 2026

## Outcome

**Do not release yet.** The deterministic rules and offline caller tests pass, but additional model testing exposed rejected source quotations, category interpretation drift, and a recommendation difference at the 75-point cutoff. Company eligibility facts still need current supporting records where an RFP requires them.

This is a measured comparison with Jake's original recipes, not reproduction of Jake's historical Claude sessions or the September 22 intake batch. The archive contains scoring instructions, not an executable scoring engine. It contains PowerShell intake and delivery utilities, which were not run.

## Method and boundaries

Sixteen isolated completions were made: eight independent reference assessments and eight ISA assessments, across five business scenarios, including repeats and a targeted retest. Both sides used ISA's existing `openai/gpt-6-luna` model/auth, high reasoning, fixed September 30 assessment, identical buyer/company sources, and no tools or delivery. The source-packet hashes matched within every pair.

The reference path received the original four archive recipes plus `CLAUDE.md` and `feedback-log.md`. It used a separate simple output format and computed its own totals. It did not use ISA's scoring contract, category constants, citation validator, or finalizer. ISA used the actual local adapter/finalizer. Both received the same isolation/date/uncertainty notes. Original recipe assessment is an independent model interpretation, **not a trusted golden answer**.

The models differed in instructions/output format, deliberately; opportunity facts, company evidence, date, and model did not. Jake's historical Claude model, session memory, human clarifications, and connector research were not available. Source research was absent and marked insufficient. No claim of identical historical configuration or complete end-to-end workflow parity is made.

Source recipe review found:

- Landscape and capability recipes are byte-identical to the archive.
- Preliminary recipe differs only in the ISA candidate-directory name.
- Scoring recipe retains the original rubric with ISA path names and the already-approved deadline correction. Those differences were reviewed rather than reverted.

Private originals, exact inputs/responses, source hashes, model usage, and diagnostic scripts are kept in ignored `.isa-local/jake-reference-je6KttH2/`. Company records remain in the earlier ignored evidence folder. No private text was added to tracked fixtures or this report.

## Observed results

| Scenario | Original-recipe response | ISA response at execution | Review |
| --- | --- | --- | --- |
| Healthcare portal requiring three completed references | No total; reference availability questioned; recommendation says Deadline needs review despite Gate 1 passing | Unscored: inaccurate citation | Archived past work is not automatic proof of currently usable, completed references. Reference's deadline label is also inconsistent, not a rule to copy. |
| Three government references, no qualified partner | No-bid, Gate 6 fails | First attempt unscored: inaccurate quote; retest No-bid | Final validation now also rejects the retest's inaccurate non-decisive company quote. The earlier initial-test government-reference answer still validates as No-bid. |
| Clear healthcare fit, no reference/certificate eligibility requirement, explicit cutoff times | 95, Strong Pursue | 92, Strong Pursue | Same gates/decision. Reference gave 10 AI points while describing a named component; the written component band is 6–9. Its 95 is not a golden total. |
| County workflow portal, no AI, ten days remaining | 69 then 69, Worth a look | First unscored: cited capability omitted the named project; repeat 67, Worth a look | Validated repeat agrees on the decision. First reference response also included an inaccurate quotation. |
| County portal, optional AI, sixteen days remaining: near cutoff | 75 then 80, Strong Pursue | 74, Worth a look; repeat unscored: inaccurate quote | First difference is one competitive point, within the same neutral band. Reference repeat also changes case, AI, and compliance judgments. Do not change the rubric to force equal totals. |

### Cutoff difference

For the first near-75 pair, all gates passed. Seven category scores matched: case 20, agency 15, stack 12, optional AI 4, deal 10, compliance 5, timeline 3. Competitive position was 6 in the reference and 5 in ISA. Both are permitted within Jake's neutral 4–6 band, but the total crosses the 75 cutoff. This is subjective point selection with a material workflow consequence, not a different cutoff or broken arithmetic.

On the reference repeat, compliance moved from 5 to 8 despite the same standard accessibility/basic-security wording; case and optional-AI points also moved, yielding 80. This requires category interpretation review. Both sides can misapply a written policy; matching an unreviewed reference answer is not correctness.

The real-model cutoff case used complete synthetic buyer text, not a live opportunity. These full-text assessments do not prove live preliminary selection or provider retrieval; those caller paths have separate offline tests.

## Local changes from the findings

1. Clarified serialization: minimal contiguous excerpts, no added punctuation or joined fragments, and both a named-project excerpt and capability evidence for case matches. Did not introduce fuzzy matching, rewrite model quotes, or add automatic repair retries.
2. Clarified that past delivery does not establish current reference availability or a specifically required completion status. Added a regression keeping unconfirmed mandatory reference eligibility at Needs review.
3. Found and closed a validation gap: non-decisive citations could be retained on an early no-bid route without checking them. All citation objects in a judgment are now validated before its decision can be persisted. A regression covers inaccurate supporting evidence even when a gate independently fails.

The prompt clarification did not eliminate quote errors. Four of eight ISA execution results initially failed validation. A fifth previously accepted no-bid answer is rejected by the final all-citation check because an unused supporting quote was inaccurate. This small, evolving diagnostic sample is not a production failure-rate estimate, but it is sufficient to withhold release.

Final offline replay of all eight unchanged comparison responses leaves three valid results: healthcare 92, county 67, and near-cutoff 74. No new API request was made after the final citation-validation change. All six previously successful initial-test answers still validate unchanged, including the $5K No-bid, three-government-reference No-bid, actual MDR No-bid, two healthcare 93 results, and missing-SOW Needs documents.

## Final checks and source identity

- `npm test`: **70/70 pass**.
- `npm run rfp:alignment`: **31/31**, zero failed rule checks.
- `npm run check`: **16 scripts** checked.
- `git diff --check`: pass.
- Policy SHA-256: `f6a801f4f6220216b9fb0af48a472e7aa0c6d4602d17db2873870a88d3386bb4`.
- Judgment adapter SHA-256: `ba71ecb2c13af4e0a62bd3f3607c8abbfaa80611e55b9abcdc6c1f1eeef0acaf`.

Execution results above retain their original validation behavior. Final replay is separately recorded in private `final-source-replay.json`; it does not silently change or discard the original failures. Tests before the quote-instruction edit used the earlier adapter version; near-cutoff and government-reference retest requests used the clarified adapter. The all-citation validation edit followed those requests and was tested offline.

The read-only post-test VM hashes still match the implementation baseline for weekly, secondary, document-flow, and approved deadline files. No source/company file installation, model/scheduler configuration change, ordinary job, message, mail, CRM/Drive write, intake reset, or watermark change was performed. No commit, push, merge, or deployment.

## Remaining work

1. Improve structured evidence response reliability while keeping exact citation validation and failure isolation. This needs more than assuming one successful prompt proves robustness. Any changed model/repair strategy requires a focused design and fresh tests; no production model switch was made.
2. Review borderline category judgments with the rubric owner. Preserve Jake's bands and 75 cutoff; do not invent a normalization or new threshold to make this sample match.
3. Obtain current supporting company facts only where required; see [company confirmation](company-confirmation.md). No human attestation was available, so none was invented or marked complete.
4. Re-run the affected controlled cases, then evaluate preliminary/full-text batch behavior and latency before a separately authorized release. Historical intake counts and Jake's actual Claude workflow remain unreproduced.

This comparison found release blockers; it did not establish complete practical alignment.

The subsequent authorized excerpt-ID follow-up is tracked in [response-reliability.md](response-reliability.md). The failures and source hashes in this report remain historical evidence; they have not been rewritten as successful results.
