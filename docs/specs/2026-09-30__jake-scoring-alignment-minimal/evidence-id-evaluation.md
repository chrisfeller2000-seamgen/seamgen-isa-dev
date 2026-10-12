# Evidence-ID evaluation — September 30, 2026

## Outcome

The evidence wire format now selects supplied paragraph IDs rather than generating quotations. Fresh testing also found and corrected an overly strict comparison-citation check. Both final integration requests validated. This is local work, not a deployment or proof of scheduled production correctness; current company qualifications and production batch behavior remain release requirements.

Jake's six gates, eight category bands, 75-point cutoff, and deadline rules were not changed. The scoring-policy code change permits a case-match explanation to cite the buyer's requirements alongside library evidence. The named project must still occur in a real case-study citation, not buyer text. All references, including unused ones on no-bid routes, remain validated.

## Method

Reused preserved opportunity/company packets from the earlier tests, with fixed September 30 assessment and matching original source hashes. Used ISA's existing `openai/gpt-6-luna`, high reasoning, tools-free completions through SSH stdin. No VM source or private company file installation, model configuration change, ordinary agent session, business job, or outbound delivery.

This is a bounded diagnostic, not a failure-rate estimate. It does not reproduce Jake's historical Claude sessions. The earlier original-recipe responses remain comparison evidence, not trusted golden totals. No automatic repair/retry was implemented; the explicit diagnostic retests below used recorded input packets.

Private inputs, raw responses, exact source/helper hashes, usage, and timings remain in ignored `.isa-local/rfp-evidence-ids-iJrnnC5R/`, `rfp-evidence-ids-final-dMeLROLj/`, and `rfp-evidence-ids-integration-P3MgkMBQ/`. No source quotations or private records enter these tracked reports.

## First eight requests

Adapter `b0c6faa4e99c5824b4ea4cc9578d5d18cd9e5e5405fb5a26c8b61d40a8a6a891`; policy `f6a801f4f6220216b9fb0af48a472e7aa0c6d4602d17db2873870a88d3386bb4`.

Four validated: three-government-reference No-bid, actual MDR No-bid, missing-SOW Needs documents, and near-cutoff 74 / Worth a look. Four were rejected: two expanded project names absent from the cited paragraph, one nonexistent document excerpt ID, and one unresolved-eligibility answer omitting the eight category judgments expected by the validator. No generated quotation was accepted or repaired.

## Five clarified-format requests

Adapter `11dd9137912e0e245972f1399049f757bbe5722a53219f78e4e44864ca18d0f6`; policy at request execution remained `f6a801f4f6220216b9fb0af48a472e7aa0c6d4602d17db2873870a88d3386bb4`.

Clarified literal project-name copying, listed all allowed IDs, and distinguished provisional category judgments from a finalized eligibility claim. Three validated at execution. Two were initially rejected because their case-match evidence included both a library paragraph and buyer requirements. Review found that rejection to be a validator defect, not unsupported evidence.

The five unchanged responses all validate in offline replay after the comparison-citation correction:

| Same-input case | Final replay | Meaning |
| --- | --- | --- |
| Clear healthcare fit, no reference/certificate eligibility requirement | 92, Strong Pursue | Component AI receives 8, within Jake's 6–9 band; demonstrated compliance receives 10. |
| County portal, no AI, ten days remaining | 64, Worth a look | Timeline is 0 at the ten-day floor; no AI is 0. |
| Optional-AI county portal, sixteen days remaining | 71, Worth a look | Case 18, agency 15, stack 12, AI 4, deal 10, standard compliance 4, competitive 5, timeline 3. |
| Identical optional-AI repeat | 73, Worth a look | Same decision and bands; case-match points move 18 to 20 within the allowed range. |
| Healthcare portal requiring currently usable, completed references | No total, Needs review | Past work is not treated as proof that the mandatory reference requirement is currently met. |

The 64 and 71 totals are **offline replay results**, not successful execution results before the validator fix. Original raw answers and original rejected states are retained. No answer was edited to make it pass.

The cutoff case is now below 75 in both clarified answers, but it still exhibits subjective point variation. Earlier reference answers of 75/80 contained interpretation differences, including inflated standard compliance; forcing ISA to reproduce those totals would not prove alignment. No new midpoint, threshold, or score normalization was introduced.

## Final integration checks

Two fresh requests used the corrected finalizer and unchanged clarified wire prompt, with the same preserved inputs:

- County portal, no AI: **63 / Worth a look**. Case match was assessed as adjacent (17) rather than the previous same-capability 18; other category points matched the clarified result. The explanation treats the healthcare portal as transferable, not a public-benefits clone. This is interpretive variation, not different arithmetic.
- Optional-AI county portal: **74 / Worth a look**. Case 20, agency 15, stack 12, AI 4, deal 10, standard compliance 4, competitive 6, timeline 3. The clarified repeats produced 71 and 73 in final replay. All three remain Worth a look; no score normalization was added.

Both fresh responses validated through the actual adapter/finalizer without repair. Final replay retained all fifteen requests: eleven validate under final source; four first-format responses still fail for genuine structural/provenance reasons. The five clarified responses all validate under final source, but two required the validator correction and are not counted as successful original executions. No failures were removed or edited.

The final two requests took approximately 40 and 47 seconds; the entire sample ranged approximately 34–59 seconds per completion. Batch latency and production volume still need evaluation before release. These fifteen evolving diagnostic requests are not a representative production benchmark.

## Checks and remaining limits

- Offline suite: 75/75 pass; alignment cases: 31/31; source check: 16 scripts; whitespace check passes.
- Final policy hash: `1f81a49bf332d4c28121fea70b675da205a756ee4777f5c543e5fe013aed3a41`.
- Final adapter hash: `11dd9137912e0e245972f1399049f757bbe5722a53219f78e4e44864ca18d0f6`.
- Read-only VM hashes still match the recorded weekly, secondary, document-helper, and approved-deadline baseline. No deployment, commit, push, or merge.

Before release, review threshold-adjacent judgments with the rubric owner, confirm current company proof where required, provision approved private source files separately, and validate preliminary/full-text batch behavior and latency. Model interpretation remains fallible even when citations and arithmetic validate. HigherGov document gaps are unchanged by this scoring work.
