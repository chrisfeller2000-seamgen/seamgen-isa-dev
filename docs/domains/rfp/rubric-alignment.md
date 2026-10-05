# RFP rubric alignment tests

The local implementation makes both Node scoring paths use Jake's written rubric through one shared AI-judgment adapter and policy finalizer. The offline suite supplies **synthetic recorded judgments**, not actual Jake or ISA model answers. It proves validation, arithmetic, caller wiring, and storage behavior—not AI interpretation or deployed behavior.

## Run it

```sh
npm test
npm run check
npm run rfp:alignment
```

The strict alignment command writes ignored `.isa-local/alignment/tracked/report.md` and `report.json`. Exit 0 means all included checks pass; exit 1 means a policy mismatch; exit 2 means an input/adapter error. Do not change business expectations to make a report green.

To compare a fresh VM snapshot without modifying it or importing over your branch:

```sh
npm run live:pull
npm run rfp:alignment -- --source-workspace=.isa-local/candidate/workspace --out-dir=.isa-local/alignment/vm-snapshot
```

Reports identify exact source hashes. The runner never pulls automatically, uploads, enables a flag, or runs a business job. A snapshot can be stale and can remain red while local changes await a separate release.

## What is covered

The 31 cases in `devtools/fixtures/rfp-alignment-cases.mjs` retain the original rubric-derived business expectations. Archive provenance and rule references are recorded there; Jake has not yet approved this invented batch. The original keyword-scoring baseline passed 12/31.

`rfp-recorded-judgments.mjs` provides invented evidence-grounded decisions and company records for repeatable tests. These are deliberate fixture inputs, not independently measured model judgments or current Seamgen capability declarations.

The strict suite checks intake prefilters, weekly preliminary/final results, secondary results, six gates, eight category bounds, totals, recommendations, and document roles. Additional `npm test` cases cover:

- Both asynchronous callers using the same injected judge, with no keyword fallback.
- Citation/project/credential grounding, partners, references, value uncertainty, conditional routes, competitive deductions, and flags.
- Temporary candidate persistence, 75+ selection, report classification, and isolated document-fetch/extraction fixtures.
- Approved deadline boundaries, timezones, and exclusion of form-approval dates.
- Malformed judgments, missing private assets, bounded timeouts, and a mocked tools-free SDK request.
- Model evidence references: deterministic paragraph IDs, full substantive source coverage, exact local resolution, invalid/unused IDs, evidence-size/depth bounds, and unchanged company/document source-kind checks.

The AI wire contract now uses flat `{excerptId}` citations. The adapter attaches the original `{sourceId, quote}` before strict domain validation; it does not rewrite or fuzzy-match model quotations. `requiredDocuments.documentIds` still identifies original document sources. Current source hashes and `source-excerpt-ids-v1` provenance identify this format. A valid ID proves the cited text exists, not that the model's interpretation is correct.

The updated weekly module has an entry-point guard. Importing its exported helpers does not run the job. The adapter still extracts named pure functions for older VM snapshots that lack this guard; it is not an untrusted-code sandbox or a duplicate scoring implementation.

## What remains unproven

No real model comparison, HigherGov request, scheduler execution, report delivery, CRM/Drive write, or production job runs in these tests. The original September 22 packets and scoring breakdowns are unavailable; survivor counts have not been reproduced. Synthetic provider fixtures do not establish current portal access.

Private source loading and a controlled original-recipe/ISA model comparison have now run separately from this offline suite. The comparison exposed rejected quotations and a near-75 recommendation difference; it is not proof of complete alignment or reproduction of Jake's historical Claude sessions. Before release, resolve those findings and confirm any mandatory current company facts. Source citations can be mechanically valid but interpreted incorrectly by a model. See the [comparison findings](../../specs/2026-09-30__jake-scoring-alignment-minimal/reference-comparison.md) and [current implementation record](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md).

The subsequent [evidence-ID evaluation](../../specs/2026-09-30__jake-scoring-alignment-minimal/evidence-id-evaluation.md) records improved response handling and two valid fresh final integration requests. It retains earlier failures and distinguishes execution from final replay. Subjective borderline points, company qualification proof, and batch latency remain separate release checks.
