# ISA RFP deadline selection and scoring

Status: Implemented locally; limited deployment authorized, awaiting live validation  
Created: September 30, 2026  
Task branch: `docs/rfp-deadline-scoring`  
Integration target: `main`  
Scope: Secondary scorer deadline fix. Initial implementation was local only; the user subsequently authorized deploying the three runtime files listed below. No normal production job or schedule changes are authorized.

## Summary

ISA must calculate the time remaining from the actual proposal submission deadline, not an unrelated date printed in the document. It must use the date of the assessment rather than a fixed date in the code.

When the deadline cannot be established, ISA should say **Deadline needs review** instead of guessing or automatically passing the deadline check.

This is the first deadline-specific fix. It is separate from the missing-requirements qualification work. A correct deadline does not prove that the rest of an opportunity is qualified.

## Problem and verified evidence

The integration baseline is `26c5cdd`. Before the local fix, read-only inspection of live ISA source, saved results, and relevant document content on September 30 confirmed:

1. `extractDateFromText()` in `secondary-fulltext-score.mjs` only recognizes numeric deadline dates. If it cannot match a labeled deadline, it returns the first slash-formatted date anywhere in the text.
2. `detectTimeline()` uses that text match before `frontmatter.due_date`. An unrelated form date can therefore replace the correct stored deadline.
3. `parseDate()` prefixes every two-digit year with `20`. It also accepts partially matched strings and can return an invalid JavaScript Date from its numeric branches.
4. `RUN_DATE` is fixed to `2026-09-22`. The secondary report heading and default input/output names also contain that old date.
5. The deadline gate passes when the calculated day count is null. Invalid date calculations can instead produce NaN, which is serialized as null but fails the gate at runtime. Neither case is a clear, reliable deadline result.

### Confirmed MDR incident

The Managed Detection and Response opportunity's candidate record stores `due_date: 2026-10-26`. Its official solicitation also states October 26, 2026, at 4:30 p.m. Atlantic Standard Time.

The first page includes the unrelated form header **Approved 5/7/75**. ISA selects that value and interprets it as May 7, 2075.

The saved September 28 secondary result records:

- Deadline: `5/7/75`.
- Days remaining: `17,759`, calculated using September 22.
- Timeline score: `5` out of `5`.
- Total score: `78`; recommendation: **Strong Pursue**.

In the Telegram group on September 28 at about 4:16 p.m. Pacific time, ISA repeated the score and maximum timeline rating and described the timeline as comfortable. The wrong calculation therefore reached the group, although the incorrect deadline itself was not quoted in that response.

Reproducing the date calculation with an assessment date of September 28 and the correct October 26 deadline gives **28 calendar days** and a timeline score of **4**. Holding every other score component unchanged gives **77**, still **Strong Pursue**. This proves an inaccurate score and explanation, not a changed MDR recommendation or a missed deadline.

Another saved result uses `24/7/365` as a deadline, demonstrating that the date finder also mistakes non-date text for a submission date. Do not treat this as a verified deadline or an ordinary expired opportunity.

These are sanitized incident facts. Raw documents, reports, database contents, and conversation exports must remain outside Git.

## Desired behavior

### 1. Select the proposal submission deadline

- Recognize explicit submission wording, including **Proposals shall be received no later than**, **Submission date**, **Proposals must be received by**, and deadline tables.
- Support written-month dates such as `Monday, October 26, 2026`, ISO dates, and unambiguous numeric dates.
- Never fall back to the first arbitrary date in the text.
- Ignore form approval/revision dates, publication dates, contract start/end dates, bidder meeting dates, question deadlines, and availability wording such as `24/7/365` when selecting the proposal deadline.
- Resolve dates from identified source documents/sections. Do not search one concatenated blob and lose the source of the match.
- Validate the stored HigherGov deadline as a structured source. It may support preliminary screening and corroborate the official submission deadline; it must not be overwritten by an unrelated text match.
- A clearly identified, applicable official amendment may supersede the original submission deadline. Use amendment applicability and sequence, not whichever date is first, latest-looking, or most favorable.
- If official evidence and metadata disagree and no applicable amendment resolves it, record a conflict for review. Do not silently choose one.
- A metadata-only deadline remains labeled as metadata-derived. Establishing a deadline must not upgrade the document or qualification status.

### 2. Validate rather than guess

- Reject invalid calendar dates, trailing junk, availability expressions, and impossible month/day values. Reject rollover dates such as February 30 rather than letting JavaScript normalize them.
- Do not automatically turn a two-digit year into a year in the 2000s. Require a corroborating four-digit year or mark it ambiguous.
- For ambiguous numeric day/month order, use explicit source format evidence or matching unambiguous evidence. Otherwise, request review.
- A deadline far in the future requires corroborating official submission evidence. Do not invent an arbitrary maximum horizon that rejects legitimate long-running procurements.
- Keep missing, invalid, and conflicting deadlines distinct from a verified expired deadline.

### 3. Use an explicit assessment date

- Remove the fixed September 22 scoring date.
- Resolve one assessment timestamp/date at run start and use it consistently for all candidates, gates, scores, and report metadata.
- Normal runs use the current assessment date. An explicit, validated `RFP_RUN_DATE` override may support offline historical replay; report that an override was used.
- Keep the intake/captured date and preliminary report date separate from the assessment date. Reading an older preliminary report does not mean scoring as of that old date.
- Preserve the current rule of at least **10 calendar days** remaining. Do not silently switch it to business days or change scoring bands.
- Compare calendar dates in an explicit reporting/buyer timezone policy, not the developer machine's timezone. Record the policy; a documented fallback must be labeled if the buyer timezone is unavailable.
- Preserve an explicit deadline time and timezone when present. Independently recognize a submission cutoff that has already passed. Do not silently invent a midnight or end-of-day submission time for a date-only deadline.
- Update the report heading, JSON summary, default output name, and day counts to agree with the assessment date. Resolve the default input report for that date, or require an explicit input; never silently select September 22.

### 4. Make the deadline decision visible

Compute one deadline assessment and pass it to both timeline scoring and the deadline gate. They must not select or parse dates independently.

The assessment must retain:

- Status: verified, metadata-only, missing, invalid, or conflicting.
- Normalized date, plus time/timezone when known.
- Assessment timestamp/date, day-count policy, and finite days remaining when calculable.
- Source type and document/section reference, with amendment provenance when relevant.
- Reason for an unresolved deadline or conflicting values.

Reuse existing `timeline`, `gate1Days`, and `gate1Due` consumers where practical. Any new structured fields must have one contract, not different interpretations in reports and chat responses. Never serialize NaN as if it were a meaningful null result.

For a verified deadline, preserve existing scoring bands: 30+ days = 5; 21-29 = 4; 16-20 = 3; 11-15 = 2; 10 = 0. Fewer than 10 days fails the deadline gate.

Missing, invalid, or conflicting deadlines must not automatically pass, earn positive timeline points, or be described as comfortable. They produce **Deadline needs review**, with no final qualified recommendation. Keep a provisional metadata score if useful; do not label the unresolved deadline as a proven no-bid reason. Other independently verified no-bid reasons may still be retained.

Reports and report-backed Telegram answers must use the same assessment. They must not retain a previous confident deadline score after a later assessment discovers a conflict or invalid date. Preserve old reports as dated history rather than rewriting them silently.

## Implementation scope

Primary change: `workspace/scripts/secondary-fulltext-score.mjs`, especially `extractDateFromText()`, `parseDate()`, `daysUntilDue()`, `detectTimeline()`, `detectGates()`, `buildScore()`, and report assembly in `main()`.

- Prefer a small, pure deadline helper that can be imported and tested without launching the business job, reading credentials, fetching documents, or sending messages.
- Retain source identity through document extraction so the helper can distinguish solicitation, amendment, and unrelated attachment evidence.
- Review date-only and unknown-result handling in the JSON/Markdown report consumers before changing return values or gate states.
- Add focused tests under `devtools/` so the existing `npm test` command runs them.
- Update lasting rules in the RFP domain docs alongside implementation.
- Inspect the weekly scorer for a conflicting deadline-selection policy. Reuse the helper wherever the same faulty decision exists; do not assume the entire weekly path has this exact bug or redesign intake in this task.

Compare fresh live source before implementation. Do not overwrite unrelated VM changes, document-download fixes, or another developer's work with an older snapshot.

## Acceptance tests

Use synthetic offline fixtures; do not commit the real RFP or chat history.

1. **MDR regression:** a document begins with `Approved 5/7/75`, includes revision dates, and explicitly says proposals are due October 26, 2026. With matching metadata and assessment date September 28, select October 26, calculate 28 calendar days, assign timeline 4, and pass the deadline gate. With other categories fixed at 73, total is 77 and remains Strong Pursue.
2. **Stored deadline protection:** valid metadata plus only an unrelated approval date does not replace metadata with 2075 or claim an officially verified deadline.
3. **No arbitrary-date fallback:** revision, publication, contract, meeting, and question dates do not become proposal deadlines.
4. **Availability text:** `24/7/365` is ignored as a date. If there is no submission deadline, status is missing and qualification remains unresolved.
5. **Year ambiguity:** an uncorroborated two-digit submission year is ambiguous; a matching official four-digit date resolves it. No blind `20` prefix.
6. **Calendar validity:** reject impossible dates, invalid leap days, partial matches, and trailing junk; accept a valid leap day. Outputs contain no Invalid Date or NaN.
7. **Format ambiguity:** conflicting month/day interpretations remain unresolved unless explicit source evidence resolves them.
8. **Amendment:** a clearly applicable deadline extension supersedes the original; an unrelated amendment or a question-date change does not.
9. **Unresolved conflict:** conflicting official submission dates or a metadata/document discrepancy remain flagged, with both sources retained.
10. **Clock regression:** for an October 5 deadline, September 28 gives 7 days and fails the 10-day gate, not the old 13-day result. Do not claim the overall recommendation changes if other gates already fail.
11. **Boundary tests:** 9 versus 10 days, 10 versus 11, 15 versus 16, 20 versus 21, and 29 versus 30 preserve the current gate and timeline bands.
12. **Expired cutoff:** a known date/time/timezone already in the past is expired; an unknown deadline is not falsely labeled expired.
13. **Timezone consistency:** the same explicit assessment and deadline inputs give the same result on machines in different timezones. Test a run near midnight and across a daylight-saving transition.
14. **Historical replay:** an explicit assessment override is validated and reported; it does not come from a captured date or filename. Invalid override input fails clearly.
15. **Report consistency:** input selection, headings, filenames, JSON summary, gate days, category points, and report-backed answers use the intended assessment and normalized deadline.
16. **Unknown handling:** missing, invalid, or conflicting dates do not pass via null, gain timeline points, inflate qualified counts, or render as a confident pursue. Null scores render and sort safely.
17. **No scope regression:** correct deadline handling does not bypass the evidence gate, alter other category scores, or change download thresholds.
18. **Isolation:** tests import pure logic or a fully isolated report path. They cannot contact providers, write production candidates, advance watermarks, send email/Telegram, update HubSpot, or upload to Drive.

## Out of scope

- Fixing document availability or implementing the separate requirements-evidence spec.
- Changing other qualification gates, score weights, pursue thresholds, or the 10-calendar-day business rule.
- Adding an AI agent, model upgrade, new portal integration, or background retry job to parse dates.
- Automatically correcting historical reports, sending correction messages, or changing CRM records.
- Changing live schedules, credentials, VM configuration, or deployment infrastructure.
- Running or deploying a production scoring job.

## Verification and release

During implementation, first add failing offline regression tests for the wrong form date and fixed assessment date. Make the smallest source change that passes those tests and the remaining acceptance cases. Run `npm test`, `npm run check`, and diff/link checks; review code and documentation together.

A future production deployment requires separate authorization, a fresh VM comparison, a reviewed commit, one coordinated deployer, and backups of the exact changed files. Rollback restores those files and verifies hashes; it does not restore stale reports as current decisions or resend outbound actions.

A controlled post-deployment check must verify the persisted deadline source, assessment date, day count, score, and report wording. Offline tests and syntax checks alone do not prove the live workflow is fixed.

## Local implementation and remaining boundaries

- Added a pure deadline helper and connected it to the secondary scorer's gate, timeline points, and report.
- Added synthetic regression tests and an isolated CLI fixture for corrected, empty, conflicting, and invalid deadline cases. Imports do not launch the production job. Fixture requests are intercepted in-process and no real provider credentials are used.
- Retained document-level source identity for deadline evidence while preserving the existing normalized text used by other scoring categories.
- Removed fixed September 22 assessment/report defaults and added validated assessment date/timezone context.
- Updated report-backed ISA guidance and the domain/data-contract docs for unknown deadlines and null final scores.
- `npm run live:pull` downloaded approved VM source read-only. The live secondary scorer differed only in its newer `document-list-empty` status; that behavior is preserved in this patch. The newer live document helper and weekly script also contain download/retry fixes. They were not imported, changed, or reverted by this task. Reconcile their source drift before any future deployment rather than uploading older repository files over them.
- The weekly scorer was inspected. It uses its own current-run date but chooses the earliest of proposal/question/opening dates and drops past matches. That is a different path from the confirmed MDR bug. This patch does not alter weekly intake or qualification; shared-policy alignment remains a separate follow-up with its own regression coverage.
- Deadline extraction is deliberately conservative: unsupported wording, uncertain date formats, unresolved amendments, and conflicting cutoff times need review. This is not a promise to parse every procurement document automatically.
- The broader missing-requirements evidence gate remains separate. A verified submission date alone cannot prove that all qualification requirements were available and checked.
- Nothing was deployed, no live job was run, and no historical report, Telegram message, or CRM record was changed.

Local verification on September 30:

- Before the fix, all three initial regression tests failed: form approval selected as the deadline, outdated day count, and availability text selected as a date.
- After the fix, `npm test` passes all 32 tests, including 25 new deadline/report tests. The CLI fixture exercises the real secondary entrypoint with in-process network mocks and temporary candidates/reports; it leaves its candidate and watermark sentinel unchanged.
- `npm run check` passes syntax checks for 14 JavaScript/shell scripts. This is not a provider or production integration check.
- A separate private local check against the original MDR PDF, using the whole extracted document and a visually verified first page, selects October 26, 2026 at 16:30 AST, calculates 28 days as of September 28, assigns 4 timeline points, and passes the 10-day gate. The actual PDF is not included in Git.
- No real HigherGov request was made during the offline tests. The broader document URL/download contract still needs the newer VM/source changes reconciled before deployment.

## Authorized limited release

The September 30 follow-up request authorizes only `scripts/rfp-deadline.mjs`, `scripts/secondary-fulltext-score.mjs`, and `skills/rfp-scoring-skill.md` on the VM. A fresh approved-source comparison confirmed the newer live `highergov-document-flow.mjs` and `weekly-rfp-pursue-decision.mjs` remain separate differences; they must not be uploaded from this older repository snapshot.

The local upload tool now supports exact-file selection while retaining its full-snapshot VM drift check, staged validation, original-file backups, hash checks, and failure rollback. Three focused tooling tests bring `npm test` to 35 passing tests. Deployment must use the explicit three-file scope. Post-deployment checks may import pure functions and verify hashes, but must not run the normal scoring job, contact providers, alter candidates/reports, change schedules, or send outbound messages. Record observed deployment results separately from scheduled-workflow proof.

## References

- [Secondary scoring script](../../../workspace/scripts/secondary-fulltext-score.mjs)
- [Weekly qualification script](../../../workspace/scripts/weekly-rfp-pursue-decision.mjs)
- [RFP workflow](../../domains/rfp/README.md)
- [Document qualification](../../domains/rfp/document-qualification.md)
- [Development workflow](../../workflows/agentic-development.md)
- [Deployment boundaries](../../deployment.md)
- [Security and data boundaries](../../security.md)

Private incident evidence remains in the live September 28 secondary report, the corresponding MDR candidate/resources, and the Telegram session records. This specification records their sanitized conclusions, not their raw contents.
