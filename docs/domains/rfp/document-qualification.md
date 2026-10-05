# RFP document qualification

## Purpose and entrypoints

`workspace/scripts/weekly-rfp-pursue-decision.mjs` owns the scheduled intake/qualification flow. `workspace/scripts/highergov-document-flow.mjs` rehydrates opportunity records from stable keys, lists HigherGov document records, saves files, and builds manifests. `devtools/rfp-fixture.test.mjs` exercises the script's `--test-mode` with synthetic responses.

## Rules to preserve

- Score metadata first. The default preliminary threshold is 75. Below-threshold candidates do not trigger document download; at/above-threshold candidates remain provisional until evidence is evaluated. `RFP_DOCUMENT_FETCH_ENABLED` defaults off.
- Rehydrate the live HigherGov opportunity using stored identifiers before following `document_path`. Treat zero returned records and portal-gated required files as evidence gaps, not a successful download.
- Save scoring-relevant documents under runtime `RFPs/1-pre-submission/<slug>/resources/`, with a manifest. The candidate file remains under runtime `RFP-pipeline/candidates/<slug>/candidate.md`.
- Reload and extract the saved files before strict gates/final score. Full-text confidence requires an extracted solicitation and no known missing required scoring document. Keep metadata-only, partial-documents, and access-blocked states distinct.
- Normal mode can update candidates/intake state and reach Drive, HubSpot, Gmail, and Telegram. Do not use it as a local smoke test. `--test-mode` branches before intake and uses a temporary resources path; the fixture also mocks HigherGov and uses synthetic candidates.

## Secondary scorer evidence gate

`secondary-fulltext-score.mjs` gives a final score only when the weekly job's `evaluateDocumentCompleteness()` check passes: a downloaded solicitation with readable text, and no missing or unreadable required document. A download alone is not enough; only non-empty extracted text marks a file as extracted. Otherwise the result is **Needs documents**: `fulltext_score: null`, no gate verdicts or category points from the listing text, the preliminary score kept as provisional, and a fixed, plain reason. It is not a no-bid. Reasons never repeat raw provider errors or download links, which can carry keys or signed URLs.

File roles start from file names in `classifyDocumentRecord()`. Underscores, dots, and hyphens count as separators, so `RFP_Final.pdf` is a solicitation. A name containing only "final", an agenda, a rating form, a bid-board export, or an RFP-named addendum or requirements file is not the solicitation. Bidder forms and contract templates (agreements, price or signature forms, certifications, checklists) are not required for scoring: an unreadable one is listed in the report as not read, but does not block it. Agencies often name the RFP after the project or solicitation number, so the secondary scorer also recognizes an otherwise unclassified file as the solicitation when its text names itself one, states a submission deadline, and describes the work (`looksLikeSolicitationText()`). A short notice missing any of these stays unrecognized; deeper content review is not implemented. Retrieving documents HigherGov does not return, for example from the agency's own posting, is separate future work.

## Secondary scorer deadlines

`secondary-fulltext-score.mjs` now uses the pure `rfp-deadline.mjs` helper. It passes separately identified extracted documents to the deadline assessment; candidate notes are not official evidence. Form approval/revision dates and availability strings cannot replace the submission deadline. Written-month dates and explicit submission labels are supported; invalid dates, unresolved two-digit years, and conflicting sources remain provisional.

The timeline score and gate use one assessment. A verified deadline retains the 10-calendar-day minimum and existing timeline bands. An unverified deadline has `gate1: null`, zero timeline points, and `fulltext_score: null`; absent an independent no-bid reason, its recommendation is **Deadline needs review**. Never treat null as a passed gate or describe an unverified timeline as comfortable. The report records the normalized deadline, source, status, assessment date, day count, and timezone fallback.

Normal secondary runs use the current assessment date. `RFP_RUN_DATE=YYYY-MM-DD` is an explicitly labeled historical replay override; `RFP_ASSESSMENT_TIME_ZONE` defaults to UTC and sets the reporting/day-count fallback. Known buyer cutoff timezones take precedence for day counts. The default preliminary input and output names follow the assessment date; use `RFP_PRELIM_REPORT_PATH` to explicitly assess an older input. Do not execute the normal job locally with real integrations merely to test dates.

The weekly job has a different deadline extractor and is not changed by this patch. It currently mixes proposal and question/opening dates when choosing the earliest gate date and discards past matches. Do not assume it follows the secondary deadline policy; alignment needs its own focused tests and review. Broader missing-requirements work beyond the secondary evidence gate is still outstanding.

## Known gaps

The fixture covers complete, empty, and portal-gated document sets, not actual HigherGov behavior from Azure. If a live document lookup returns zero rows, record it as `document-list-empty` (Needs documents); do not infer that no solicitation exists. The skill named `rfp-document-fetch-skill.md` is currently a duplicate of the refresh skill, so it is not a reliable fetch implementation guide. See [RFP overview](README.md), [data contracts](../../data-models.md), and [integrations](../../integrations.md).
