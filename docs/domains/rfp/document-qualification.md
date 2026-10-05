# RFP document qualification

## Purpose and entrypoints

`workspace/scripts/weekly-rfp-pursue-decision.mjs` owns the scheduled intake/qualification flow. `workspace/scripts/highergov-document-flow.mjs` rehydrates opportunity records from stable keys, lists HigherGov document records, saves files, and builds manifests. `devtools/rfp-fixture.test.mjs` exercises the script's `--test-mode` with synthetic responses.

## Rules to preserve

- Score metadata first. The default preliminary threshold is 75. Below-threshold candidates do not trigger document download; at/above-threshold candidates remain provisional until evidence is evaluated. `RFP_DOCUMENT_FETCH_ENABLED` defaults off.
- Rehydrate the live HigherGov opportunity using stored identifiers before following `document_path`. Treat zero returned records and portal-gated required files as evidence gaps, not a successful download.
- Save scoring-relevant documents under runtime `RFPs/1-pre-submission/<slug>/resources/`, with a manifest. The candidate file remains under runtime `RFP-pipeline/candidates/<slug>/candidate.md`.
- Reload and extract the saved files before strict gates/final score. Full-text confidence requires an extracted solicitation and no known missing required scoring document. Keep metadata-only, partial-documents, and access-blocked states distinct.
- Normal mode can update candidates/intake state and reach Drive, HubSpot, Gmail, and Telegram. Do not use it as a local smoke test. `--test-mode` branches before intake and uses a temporary resources path; the fixture also mocks HigherGov and uses synthetic candidates.

## Shared scoring and deadlines

Both scoring callers use `rfp-scoring-judgment.mjs` and the pure `rfp-scoring-policy.mjs` finalizer. They apply the existing policy skills using ISA's existing tools-free model interface. Code validates evidence, gates, bands, and totals; malformed or unavailable judgments stay unscored. There is no keyword-scoring fallback. The real private case-study library is required; missing company facts cannot be invented.

The shared finalizer uses the approved `rfp-deadline.mjs` helper. It passes separately identified extracted documents to the deadline assessment; candidate notes are not official evidence. Form approval/revision dates and availability strings cannot replace the submission deadline. Written-month dates and explicit submission labels are supported; invalid dates, unresolved two-digit years, and conflicting sources remain provisional.

The timeline score and gate use one assessment. A verified deadline retains the 10-calendar-day minimum and existing timeline bands. An unverified deadline has `gate1: null`, zero timeline points, and `fulltext_score: null`; absent an independent no-bid reason, its recommendation is **Deadline needs review**. Never treat null as a passed gate or describe an unverified timeline as comfortable. The report records the normalized deadline, source, status, assessment date, day count, and timezone fallback.

Normal secondary runs use the current assessment date. `RFP_RUN_DATE=YYYY-MM-DD` is an explicitly labeled historical replay override; `RFP_ASSESSMENT_TIME_ZONE` defaults to UTC and sets the reporting/day-count fallback. Known buyer cutoff timezones take precedence for day counts. The default preliminary input and output names follow the assessment date; use `RFP_PRELIM_REPORT_PATH` to explicitly assess an older input. Do not execute the normal job locally with real integrations merely to test dates.

Weekly preliminary scoring can use a valid listing deadline, but remains metadata-only. After document retrieval, both callers recompute the deadline and all categories from the supplied evidence. Only a qualified, document-backed 75+ result belongs in the pursue section. Conditional questions, missing requirements, uncertain eligibility/value, and closed/watch notices remain separate from qualified pursuits.

## Known gaps

The fixture covers complete, empty, and portal-gated document sets, not actual HigherGov behavior from Azure. An empty list is recorded as `document-list-empty`, separately from confirmed access blocking; neither proves no solicitation exists. Full-text requires usable extracted solicitation text and no known missing required scoring attachment. Ancillary/rating forms and bid-board exports pointing to a separate RFP do not establish that.

The fetch skill remains a duplicate of the refresh skill; restoration is not part of scoring alignment. The local scorer is not deployed. Initial isolated real-model checks and their limits are in [model evaluation](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md); they do not establish complete Jake/ISA agreement or scheduled production correctness. See [alignment proof](rubric-alignment.md), [RFP overview](README.md), [data contracts](../../data-models.md), and [integrations](../../integrations.md).
