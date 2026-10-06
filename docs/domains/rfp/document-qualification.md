# RFP document qualification

## Purpose and entrypoints

`workspace/scripts/weekly-rfp-pursue-decision.mjs` owns the scheduled intake/qualification flow. `workspace/scripts/highergov-document-flow.mjs` rehydrates opportunity records from stable keys, lists HigherGov document records, saves files, and builds manifests. `devtools/rfp-fixture.test.mjs` exercises the script's `--test-mode` with synthetic responses.

## Rules to preserve

- Score metadata first. Documents are fetched at a preliminary score of 50+ (`DOCUMENT_FETCH_THRESHOLD`); the decision bands stay 75+ Strong Pursue, 50–74 Worth a look, below 50 No-bid. Below-threshold candidates do not trigger document download; at/above-threshold candidates remain provisional until evidence is evaluated. `RFP_DOCUMENT_FETCH_ENABLED` defaults off.
- Rehydrate the live HigherGov opportunity using stored identifiers before following `document_path`. Treat zero returned records and portal-gated required files as evidence gaps, not a successful download.
- Save scoring-relevant documents under runtime `RFPs/1-pre-submission/<slug>/resources/`, with a manifest. The candidate file remains under runtime `RFP-pipeline/candidates/<slug>/candidate.md`.
- Reload and extract the saved files before strict gates/final score. Full-text confidence requires an extracted solicitation and no known missing required scoring document. Keep metadata-only, partial-documents, and access-blocked states distinct.
- Normal mode can update candidates/intake state and reach Drive, HubSpot, Gmail, and Telegram. Do not use it as a local smoke test. `--test-mode` branches before intake and uses a temporary resources path; the fixture also mocks HigherGov and uses synthetic candidates.

## Evidence gate before full-text scoring

Both callers score full text only when `evaluateDocumentCompleteness()` passes: a downloaded solicitation with readable text, and no missing or unreadable required document. Only then is the shared AI scorer called. A download alone is not enough; only non-empty extracted text marks a file as extracted. Otherwise the secondary result is **Needs documents**, with no model call: `fulltext_score: null`, no gate verdicts or category points from the listing text, the preliminary score kept as provisional, and a fixed, plain reason. It is not a no-bid. Reasons never repeat raw provider errors or download links, which can carry keys or signed URLs.

File roles start from file names in `classifyDocumentRecord()`. Underscores, dots, and hyphens count as separators, so `RFP_Final.pdf` is a solicitation. A name containing only "final", an agenda, a rating form, a bid-board export, or an RFP-named addendum or requirements file is not the solicitation. Bidder forms and contract templates (agreements, price or signature forms, certifications, checklists) are not required for scoring: an unreadable one is listed in the report as not read, but does not block it. Agencies often name the RFP after the project or solicitation number. Once text is extracted, an otherwise unclassified file counts as the solicitation when its text names itself one, states a submission deadline, and describes the work (`looksLikeSolicitationText()`). The weekly job, the secondary scorer, and the policy all classify through this one function. A short notice missing any of these stays unrecognized; deeper content review is not implemented. Retrieving documents HigherGov does not return, for example from the agency's own posting, is separate future work.

## Shared scoring and deadlines

Both scoring callers use `rfp-scoring-judgment.mjs` and the pure `rfp-scoring-policy.mjs` finalizer. They apply the existing policy skills using ISA's existing tools-free model interface. Code validates evidence, gates, bands, and totals; malformed or unavailable judgments stay unscored. There is no keyword-scoring fallback. The real private case-study library is required; missing company facts cannot be invented.

The shared finalizer uses the approved `rfp-deadline.mjs` helper. It passes separately identified extracted documents to the deadline assessment; candidate notes are not official evidence. Form approval/revision dates and availability strings cannot replace the submission deadline. Written-month dates and explicit submission labels are supported; invalid dates, unresolved two-digit years, and conflicting sources remain provisional.

The timeline score and gate use one assessment. A verified deadline retains the 10-calendar-day minimum and existing timeline bands. An unverified deadline has `gate1: null`, zero timeline points, and `fulltext_score: null`; absent an independent no-bid reason, its recommendation is **Deadline needs review**. Never treat null as a passed gate or describe an unverified timeline as comfortable. The report records the normalized deadline, source, status, assessment date, day count, and timezone fallback.

Normal secondary runs use the current assessment date. `RFP_RUN_DATE=YYYY-MM-DD` is an explicitly labeled historical replay override; `RFP_ASSESSMENT_TIME_ZONE` defaults to UTC and sets the reporting/day-count fallback. Known buyer cutoff timezones take precedence for day counts. The default preliminary input and output names follow the assessment date; use `RFP_PRELIM_REPORT_PATH` to explicitly assess an older input. Do not execute the normal job locally with real integrations merely to test dates.

Weekly preliminary scoring can use a valid listing deadline, but remains metadata-only. After document retrieval, both callers recompute the deadline and all categories from the supplied evidence. Only a qualified, document-backed 75+ result belongs in the pursue section. Conditional questions, missing requirements, uncertain eligibility/value, and closed/watch notices remain separate from qualified pursuits.

## Known gaps

The fixture covers complete, empty, and portal-gated document sets, not actual HigherGov behavior from Azure. An empty list is recorded as `document-list-empty` (Needs documents), separately from confirmed access blocking; neither proves no solicitation exists. Full-text requires usable extracted solicitation text and no known missing required scoring attachment. Ancillary/rating forms and bid-board exports pointing to a separate RFP do not establish that.

The fetch skill remains a duplicate of the refresh skill; restoration is not part of scoring alignment. The VM runs the evidence gate with the old keyword scorer; the shared AI scorer and content recognition are not deployed. Initial isolated real-model checks and their limits are in [model evaluation](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md); they do not establish complete Jake/ISA agreement or scheduled production correctness. See [alignment proof](rubric-alignment.md), [RFP overview](README.md), [data contracts](../../data-models.md), and [integrations](../../integrations.md).
