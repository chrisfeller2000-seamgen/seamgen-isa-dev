# RFP document qualification

## Purpose and entrypoints

`workspace/scripts/weekly-rfp-pursue-decision.mjs` owns the scheduled intake/qualification flow. `workspace/scripts/highergov-document-flow.mjs` rehydrates opportunity records from stable keys, lists HigherGov document records, saves files, and builds manifests. `devtools/rfp-fixture.test.mjs` exercises the script's `--test-mode` with synthetic responses.

## Rules to preserve

- Score metadata first. The default preliminary threshold is 75. Below-threshold candidates do not trigger document download; at/above-threshold candidates remain provisional until evidence is evaluated. `RFP_DOCUMENT_FETCH_ENABLED` defaults off.
- Rehydrate the live HigherGov opportunity using stored identifiers before following `document_path`. Treat zero returned records and portal-gated required files as evidence gaps, not a successful download.
- Save scoring-relevant documents under runtime `RFPs/1-pre-submission/<slug>/resources/`, with a manifest. The candidate file remains under runtime `RFP-pipeline/candidates/<slug>/candidate.md`.
- Reload and extract the saved files before strict gates/final score. Full-text confidence requires an extracted solicitation and no known missing required scoring document. Keep metadata-only, partial-documents, and access-blocked states distinct.
- Both RFP jobs read file text through `workspace/scripts/document-text.mjs`. A PDF is read from its text layer first; pages with no text are read by OCR (`ocrmypdf` on the VM). Each manifest row records `extraction_method`, `extraction_status`, and `ocr_pages`. OCR text counts as extracted evidence, but it can misread dates and amounts, so do not treat an OCR-derived deadline as verified without the original page.
- Normal mode can update candidates/intake state and reach Drive, HubSpot, Gmail, and Telegram. Do not use it as a local smoke test. `--test-mode` branches before intake and uses a temporary resources path; the fixture also mocks HigherGov and uses synthetic candidates.

## Known gaps

The fixture covers complete, empty, and portal-gated document sets, not actual HigherGov behavior from Azure. `devtools/document-text.test.mjs` replaces `pdftotext` and `ocrmypdf` with stand-ins, so the real OCR path is only exercised on the VM. The RFP report does not yet say when a document was read by OCR, and the deadline rules do not recognise wording such as "qualifications will be accepted no later than". If a live document lookup returns zero rows, record it as blocked/incomplete and investigate; do not infer that no solicitation exists. The skill named `rfp-document-fetch-skill.md` is currently a duplicate of the refresh skill, so it is not a reliable fetch implementation guide. See [RFP overview](README.md), [data contracts](../../data-models.md), and [integrations](../../integrations.md).
