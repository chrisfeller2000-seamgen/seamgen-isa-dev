# ISA / Jake RFP rubric alignment

Status: Local comparison suite implemented; rule mismatches are intentionally failing; no runtime fix or deployment

Task branch: `test/rfp-rubric-alignment`. Integration target: `origin/main`.
Base: `7d39fca`, including the previously deployed deadline correction, which is not yet merged into main. This task does not alter the deadline task's worktree or copy its docs. The commits are inherited through Git history.

## Problem and evidence

The developer's September 22 notes describe different survivor counts and scores between Jake's workflow and ISA. Those totals alone are not a controlled comparison: the exact input batch, filter settings, assessment date, and per-category outputs are not present here.

Jake's supplied archive identifies commit `ccf21a70bc7021c46f5cd393156b757e0a934f51` and contains a July v1.8 scoring skill, preliminary scoring instructions, PowerShell intake helpers, and sample input fixtures. It does not contain a standalone executable weighted scorer. Claude applies the written rubric. Its scoring/preliminary instructions already largely match ISA's runtime skills; ISA's independent Node calculations are the principal alignment gap. Do not blindly overwrite ISA source with this older archive or undo the deployed deadline correction.

The current VM source was downloaded read-only into this task's ignored `.isa-local/candidate/workspace/`. Only its weekly script and document helper differ from the tracked base. They were not imported, overwritten, or deployed. The comparison runner records the hash of every tested source file and can evaluate either copy locally.

## Scope and acceptance

- Build a repeatable, credential-free local baseline against rubric-derived expectations, with an explicit “not yet reviewed by Jake” status.
- Use only invented opportunity, document, reference, and company-capability facts. Hold the assessment date at September 30, 2026, UTC, with a 10-day and $100K scoring policy.
- Compare intake decisions separately from preliminary and document-based calculation outputs. Include category limits, arithmetic, specific gates, incomplete evidence, and word-only changes that must not create capabilities.
- Produce Markdown and JSON reports containing expected versus observed outcomes, calculation route, source hashes, rule provenance, and coverage gaps.
- A business-rule mismatch must make `npm run rfp:alignment` exit 1. Runner/adapter errors exit 2. A pass exits 0. Do not label harness unit-test success as scoring alignment.
- Keep runtime calculations unchanged. Never run/import the weekly business-job entrypoint, contact providers, read credentials, send messages, update CRM/Drive, or advance a watermark.

## Expected-outcome ownership

The fixture expectations come from Jake's six gates and eight categories, the document-fetch skill, and the already approved deadline correction. They are not Jake model outputs or Jake-approved golden cases. The explicit closed-notice check is marked as a project clarification for review, not a newly approved seventh gate.

An unknown value must not automatically fail Gate 5. This suite does not invent a precise price or force a final go decision for that case. It does not pin subjective category totals to historical scores. Metamorphic checks compare an unchanged request with incidental “bid”/“email” wording rather than guessing a new case-study or AI score.

The fixture company profile is synthetic. ISA's current calculations do not consume its verified capability/reference inventory; explicit requirements and facts are also included in the example text. Passing a wording case does not establish actual organizational eligibility.

## Technical boundaries

The weekly file runs `main()` on normal import. The adapter reads selected, named calculation functions from trusted ISA source and runs only those in a context without filesystem, process, shell, or network APIs. The deadline helper is a reviewed pure module. Function extraction is deliberately tied to current top-level declaration formatting and fails on missing/duplicate/invalid functions. It is not a sandbox for arbitrary untrusted code, a replacement scorer, or a production implementation.

Weekly results are calculator observations, not final pipeline decisions. In particular, the calculator is evaluated diagnostically even when the normal weekly job would stop earlier or decline document fetching. The suite does not reproduce scoring thresholds, scheduler state, candidate/report persistence, intake pagination/deduplication, or outbound integrations end to end.

The four intake examples cover the documented prefilter contract. PowerShell is not installed on this machine, so Jake's intake implementation has not been executed. The original September 22 records and category breakdowns are still required to explain the 21-versus-88 discrepancy.

## Baseline results

Both tracked source and the fresh VM snapshot produced 12 passing and 19 failing cases out of 31, with 22 mismatched checks out of 348. These are failing examples, not 19 distinct production bugs or a statistical estimate of real-world accuracy.

Reproduced differences include the secondary $100K gate; weekly rejection of an explicitly uncertain $50K-or-$500K value; generic versus government references; missing certifications; proof-of-insurance wording; material COTS/custom work; question versus proposal dates; misleading `bid`/`email` substrings; and accepting a rating form without the solicitation. The weekly calculator does not expose the eight rubric category scores.

The reports live only in ignored `.isa-local/alignment/tracked/` and `.isa-local/alignment/vm-snapshot/`. No source or documents from customer RFPs were added to the test suite.

Validation: all 44 developer tests passed, including nine new harness tests. Source checks passed for 14 JavaScript/shell scripts, and the new runner/adapter/fixture files passed syntax checks. Both strict alignment runs exited 1 with the business mismatches above; they did not crash. Runtime files under `workspace/` have no changes in this task. No commits were pushed or merged.

The older `devtools/fixtures/highergov-fetch.mjs` still models `document_path` as an opaque ID. The new alignment runner does not use that fixture. Reconcile its request contract with the newer deployed helper before using the old fixture's passing result as evidence of provider correctness.

## Next phase, not implemented here

1. Review the expected cases with Jake; resolve partner/conditional/uncertainty policy rather than inventing it in code.
2. Obtain the exact September 22 input batch and reviewed gate/category outputs in approved storage. Replay the same batch at the same date; explain filters before comparing counts.
3. Choose a shared scoring contract for both phases. Preserve provenance and confidence, and require real company evidence. Fix one demonstrated rule at a time until the strict alignment command passes.
4. Add a separately authorized model evaluation with structured outputs, evidence citations, reviewed score bands, repeated runs, and an approved model credential. A deterministic synthetic suite does not measure model judgment.
5. Add controlled non-production integration/persistence checks before considering a coordinated live release or enabling scheduled document fetching.

## References

- [How to run and interpret the comparison](../../domains/rfp/rubric-alignment.md)
- [Synthetic cases and rule provenance](../../../devtools/fixtures/rfp-alignment-cases.mjs)
- [Calculation adapter](../../../devtools/rfp-alignment-adapter.mjs)
- [Runner](../../../devtools/rfp-alignment.mjs)
- [Document qualification](../../domains/rfp/document-qualification.md)
- [Security boundaries](../../security.md)
