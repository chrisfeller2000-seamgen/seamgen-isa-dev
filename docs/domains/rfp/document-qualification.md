# RFP document qualification

## Purpose and entrypoints

`workspace/scripts/weekly-rfp-pursue-decision.mjs` owns the scheduled intake/qualification flow. `workspace/scripts/highergov-document-flow.mjs` rehydrates opportunity records from stable keys, lists HigherGov document records, saves files, and builds manifests. `devtools/rfp-fixture.test.mjs` exercises the script's `--test-mode` with synthetic responses.

## Rules to preserve

- Score metadata first. Documents are fetched at a preliminary score of 50+ (`DOCUMENT_FETCH_THRESHOLD`); the decision bands stay 75+ Strong Pursue, 50–74 Worth a look, below 50 No-bid. Below-threshold candidates do not trigger document download; at/above-threshold candidates remain provisional until evidence is evaluated. `RFP_DOCUMENT_FETCH_ENABLED` defaults off in the script; the Friday cron wrapper `run-new-rfp-qualification-cron.sh` turns it on, and nothing else runs full-text scoring on a schedule.
- Rehydrate the live HigherGov opportunity using stored identifiers before following `document_path`. Treat zero returned records and portal-gated required files as evidence gaps, not a successful download.
- Save scoring-relevant documents under runtime `RFPs/1-pre-submission/<slug>/resources/`, with a manifest. The candidate file remains under runtime `RFP-pipeline/candidates/<slug>/candidate.md`.
- Reload and extract the saved files before strict gates/final score. Full-text confidence requires an extracted solicitation and no known missing required scoring document. Keep metadata-only, partial-documents, and access-blocked states distinct.
- Both RFP jobs read file text through `workspace/scripts/document-text.mjs`. A PDF is read from its text layer first; pages with no text are read by OCR (`ocrmypdf` on the VM). Each manifest row records `extraction_method`, `extraction_status`, and `ocr_pages`. OCR text counts as extracted evidence, but it can misread dates and amounts, so do not treat an OCR-derived deadline as verified without the original page.
- Normal mode can update candidates/intake state and reach Drive, HubSpot, Gmail, and Telegram. Do not use it as a local smoke test. `--test-mode` branches before intake and uses a temporary resources path; the fixture also mocks HigherGov and uses synthetic candidates.

## Evidence gate before full-text scoring

Both callers score full text only when `evaluateDocumentCompleteness()` passes: a downloaded solicitation with readable text, and no missing or unreadable required document. An unreadable required file counts as read when a copy with the same name in another format was read, such as the `.xml` and `.pdf` that SF City Partner posts for one event (October 30); a different readable file never stands in for it. Only then is the shared AI scorer called. A download alone is not enough; only non-empty extracted text marks a file as extracted. Otherwise the secondary result is **Needs documents**, with no model call: `fulltext_score: null`, no gate verdicts or category points from the listing text, the preliminary score kept as provisional, and a fixed, plain reason. It is not a no-bid. Reasons never repeat raw provider errors or download links, which can carry keys or signed URLs.

File roles start from file names in `classifyDocumentRecord()`. Underscores, dots, and hyphens count as separators, so `RFP_Final.pdf` is a solicitation. "RFO" and "RFA" (Request for Offers, Request for Application) count like "RFP". A name containing only "final", an agenda, a rating form, a bid-board export, or an RFP-named addendum or requirements file is not the solicitation. Bidder forms and contract templates (agreements, price or signature forms, certifications, checklists) are not required for scoring: an unreadable one is listed in the report as not read, but does not block it. Agencies often name the RFP after the project or solicitation number. Once text is extracted, an otherwise unclassified file counts as the solicitation when its text names itself one, states a submission deadline, and describes the work (`looksLikeSolicitationText()`). The weekly job, the secondary scorer, and the policy all classify through this one function. A federal Area of Interest counts when it names the Commercial Solutions Opening it is issued under and says what vendors must submit; "area of interest" alone does not, because GIS documents use it for a place on a map. The same text check applies to a requirements-named file such as "Scope of Work", unless its name marks it as an attachment, exhibit, appendix, schedule, or workbook. A file whose text points to the "actual" or "separate" RFP is a bid-board export, not the RFP; "download the RFP document" alone does not make it one, because real RFPs say that too. A short notice missing any of these stays unrecognized; deeper content review is not implemented. Documents HigherGov does not return can come from the agency's own posting; see "Agency posting" below.

## Shared scoring and deadlines

Both scoring callers use `rfp-scoring-judgment.mjs` and the pure `rfp-scoring-policy.mjs` finalizer. They apply the existing policy skills using ISA's existing tools-free model interface. Code validates evidence, gates, bands, and totals; malformed or unavailable judgments stay unscored. There is no keyword-scoring fallback. The real private case-study library is required; missing company facts cannot be invented.

The shared finalizer uses the approved `rfp-deadline.mjs` helper. It passes separately identified extracted documents to the deadline assessment; candidate notes are not official evidence. Form approval/revision dates and availability strings cannot replace the submission deadline. Written-month dates and explicit submission labels are supported; invalid dates, unresolved two-digit years, and conflicting sources remain provisional.

The timeline score and gate use one assessment. A verified deadline retains the 10-calendar-day minimum and existing timeline bands. When the documents state no deadline, the listing date is used, as Jake did: under 10 days or past still fails Gate 1; otherwise Gate 1 stays open (`gate1: null`, "confirm it"), and the timeline category is scored from the listing date. A missing, invalid, or conflicting deadline has zero timeline points and no total. Absent an independent no-bid reason, its recommendation is **Deadline needs review**, and the other categories are recorded as `potential_total`. Never treat null as a passed gate. The report records the normalized deadline, source, status, assessment date, day count, and timezone fallback.

Normal secondary runs use the current assessment date. `RFP_RUN_DATE=YYYY-MM-DD` is an explicitly labeled historical replay override; `RFP_ASSESSMENT_TIME_ZONE` defaults to UTC and sets the reporting/day-count fallback. Known buyer cutoff timezones take precedence for day counts. The default preliminary input and output names follow the assessment date; use `RFP_PRELIM_REPORT_PATH` to explicitly assess an older input. Do not execute the normal job locally with real integrations merely to test dates.

Weekly preliminary scoring can use a valid listing deadline, but remains metadata-only. After document retrieval, both callers recompute the deadline and all categories from the supplied evidence. Only a qualified, document-backed 75+ result belongs in the pursue section.

**Open gates (October 12).** A gate the scorer can't confirm stays open (`null`) but no longer withholds the total. Examples are an unverified portal account, current references, or a listing-only deadline. Jake passed these "with a note"; ISA keeps the gate open, and the report lists its reason as a blocker. The same applies when the solicitation was read but refers to a document we don't have, such as an exhibit or a form. That RFP is scored, and its reasons say `Missing referenced document: …`. It is **Needs documents** only when the model couldn't score the categories without it. Known gate failures stay No-bid. Conditional questions, uncertain or conflicting value, and closed or watch notices remain separate from qualified pursuits. October 26 narrowed the missing-document rule; see below.

**Scope documents (October 26).** Rhode Island's PDMP RFP went to the team as a 75 Strong Pursue on October 23. HigherGov had served only the state bid board's cover sheet: dates, registration rules, and a list of attachments, with the scope in a separate "Agency Solicitation Specifications" document. The file check passed because the cover sheet is a solicitation with text. The model listed the 12 missing attachments, scored all eight categories from the cover sheet, and left Gates 2 and 6 open. The specification, downloaded by hand from the bid board behind a captcha, asks for an "out of the box" product, at least 70% configurable, replacing incumbent Bamboo Health, with prior-PDMP evidence required.

From October 26 to November 13, any unread document the model labelled `scope: true` made the result **Needs documents**. The model applied that label to amendments, Q&A answers, state IT policies, diagrams and requirement matrices. On November 13, seven RFPs whose solicitation had been read were held back that way, among them the week's top listing score (MA DHE Student Portal, 84, Gate 2 already passed), and the week had no Strong Pursue.

**Scope read (November 13).** At full-text depth the model answers `scopeRead: { read, reason, evidence }`: do the supplied buyer documents describe the work well enough to judge Gate 2, Gate 3 and the categories? `read: true` must cite a buyer-document excerpt; the listing can't vouch for the scope. A portal cover sheet, a summary that points to a separate specification, or forms and terms alone are `read: false`. The policy decides:

- `read: false`: **Needs documents**, with the reasons `Scope not read: …` and `Missing scope document: …` for any listed scope document. This still stops the Rhode Island cover sheet.
- `read: true` with an unread `scope: true` document: scored as usual, Strong Pursue included. The result carries `missing_scope`, its reasons say `Part of the scope wasn't read: …. Confirm it before bidding.`, and the report puts that blocker first. Capping these at Worth a look was considered and rejected, so that a real pursue missing one appendix still reaches the team.
- `read: true` with other unread documents: scored, with a `Missing referenced document` note.

Each `requiredDocuments` entry still carries `scope: true|false`, now narrowed. `true` is only for a specification, statement of work, or functional or technical requirements the work description depends on. The following are `false`:

- amendments, addenda and Q&A answers, unless one replaces the scope;
- external standards, policies, codes and laws;
- figures and diagrams;
- forms, insurance, terms and templates.

A full-text answer without `scope` or `scopeRead`, or with `read: true` and no buyer-document citation, is rejected and retried once. The weekly audit keeps `scopeRead` in each full-text judgment, and the `rfp:audit` Details tab shows it as **Scope read**. See the [task spec](../../specs/2026-11-13__rfp-scope-read/spec.md) for the evidence.

A missing document can be known only from the HigherGov listing ("see Attachment B, Statement of Work"). Since November 3 such an entry cites the listing, with empty `documentIds`, and is handled like any other missing document under the rules above. Before that, only a buyer-document citation was accepted, so the answer was rejected and the RFP left unscored. A document that was supplied is still cited from the buyer documents. In the same way, a project figure found only on the listing, even the buyer's own, is scored as `inferred`, not `stated`, because `stated` needs a buyer-document citation.

Open Gates 2 and 6 are unchanged: after the documents are read, they pass with a note like any other open gate. October 26 briefly made them **Needs review** (never a Strong Pursue); that was withdrawn on October 30 because it would also hold back a real Strong Pursue whose full specification was read but whose eligibility question was still unanswered. The scope-document rule above already stops the Rhode Island case.

Some state portals, including Rhode Island's Ocean State Procures, publish the full package only behind a captcha. The scheduled job does not try to pass one; a person downloads the files into the RFP's `resources/` folder.

**Agency posting (November 3, anonymous only).**

**Why.** On October 30, 20 of the 48 RFPs scoring 50+ on their listing got no full-text score for missing documents. HigherGov never refused a download; it just didn't have the files, and most were on agency portals behind a vendor login.

**When the job tries.** When HigherGov returns no documents (`document-list-empty`, `access-blocked`), or files without a readable solicitation, the Friday job tries the RFP's agency posting (`solicitation_url`) with `posting-documents.mjs`. It never tries after a HigherGov outage (`failed`), or for a set that has its solicitation but is missing a scope file.

**What it reads.** Only what is public:
- file links on the posting page;
- links inside HigherGov's own PDFs, such as a Jaggaer event summary's "Buyer Attachments";
- the posting itself, when it is a file.

**Limits.** Only GETs, with no cookies. robots.txt is honored. Linked web pages are not followed.

| Scope | Limit |
|---|---|
| Per site | 2 s between requests |
| Per RFP | 10 files and 60 MB |
| Per run | 30 RFPs and 15 minutes |

**Never done.** It never logs in, registers, accepts terms, submits a form, pays, or works around a bot check. Each of those is recorded as an outcome instead.

**Sites never requested.** `rfp-portals.mjs` lists the known sites. Those that need an account, charge, challenge, list documents only in a browser, or send them by email are `fetch: false`. These include Public Purchase, DemandStar (terms ban robots), RAMP LA, NYSCR, Bonfire, OpenGov, BidNet, PlanetBids, eMMA, NC eVP and Vermont.

**How fetched files are used.**
- They go through the same reading, classification and completeness rules as HigherGov's.
- A web page served for a file link is a sign-in or error page and is never saved.
- A file whose text doesn't name the RFP's number or two distinctive title words is kept with `match: 'unmatched'` but never scored, because a city's bid board lists every open bid's files.
- Only a link's origin and path are stored (`fetched_from`), since a query string can be a token.

**The flag.** `RFP_POSTING_FETCH_ENABLED` turns the requests on; the cron wrapper exports it as 0 until a measured run. With it off, a listed site is still named in the report. `npm run rfp:posting-probe -- <run date>` shows, per site, what a week's missing-document RFPs would meet; `--live` makes the same dry-run requests and needs agreement first. See the [posting spec](../../specs/2026-11-03__rfp-posting-documents/spec.md).

**Gate 2 from a listing (October 14).** Jake's preliminary skill says a Gate 2 call that could go either way from the listing is carried forward, not killed. In the October 2–8 backfill, 86 of the 91 Gate 2 cuts were made from the listing alone. About 20 gave "the Q&A window is unverified" as a reason, which a listing can never show. Now an unconfirmed Q&A window never fails Gate 2 at preliminary depth; the model fails it there only when the listing leaves no custom path. At that depth the Conditional — Ask the Agency route is scored like an open gate, so a 50+ listing gets its documents fetched; it used to stop at Needs review with no score. After the documents are read, Gate 2 and the conditional route are decided exactly as before.

**Jessica's review against Jake's system (October 14).** Three of her points were deviations in ISA's own code, not in Jake's rubric:

- **Compliance.** Jake's Category 6 lists Section 508, ADA, HIPAA, GDPR and NIST/FISMA/FITARA as demonstrated, and his example scored a website accessibility policy 8/10. ISA's prompt sent accessibility without a named standard to 3–5; Madison County's accessible website scored 4.
  - A required accessibility standard (508, ADA, WCAG) or a listed regime is now demonstrated (10), citing the company's 508 work or the HCP HIPAA case.
  - Accessibility without a named standard is 8–9.
  - 3–5 is only for generic requirements.
- **Deal size.** A value range that crosses a size-band edge may be scored in any band it touches. Jake gave 8–9 to ranges straddling the sweet spot, where the policy used to demand the estimate's own band.
- **Product buys.** When the documents show one, the model takes the ask-the-agency route. The policy returns Needs review if another gate is also open, and the report counted a Needs review with a could-reach score as Worth a look: Raleigh's fire records system, an existing-product install, showed at 71. Now any result with a conditional route is "ask the agency first" in the report, never a pick.

## Known gaps

The fixture covers complete, empty, and portal-gated document sets, not actual HigherGov behavior from Azure. `devtools/document-text.test.mjs` replaces `pdftotext` and `ocrmypdf` with stand-ins, so the real OCR path is only exercised on the VM. The RFP report does not yet say when a document was read by OCR, and the deadline rules do not recognise wording such as "qualifications will be accepted no later than". An empty list is recorded as `document-list-empty` (Needs documents), separately from confirmed access blocking; neither proves no solicitation exists. The agency-posting step has offline fixtures only. Whether COMMBUYS, IonWave, Oracle abstracts and Jaggaer's download endpoint answer the job from Azure is unchecked until the live probe or a flagged run. It doesn't follow JavaScript-only links, open ZIP packages, read SAM.gov's API, or sign in on portals Seamgen holds accounts on (Phase 2). Full-text requires usable extracted solicitation text and no known missing required scoring attachment. Ancillary/rating forms and bid-board exports pointing to a separate RFP do not establish that.

Until October 12, 2026 the fetch skill file was a copy of the refresh skill. It now holds the operator library's fetch skill, plus a rule that originals belong in the RFP's `resources/` folder and are never removed by cleanup. That is an instruction ISA reads in chat, not a rule any script enforces, and the skill's browser and Drive steps were written for the operator's Windows session, not the VM. Since October 6, 2026, the VM runs the shared AI scorer, content recognition, and weekly document fetching; the release record is in the [scoring-alignment spec](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md). Isolated real-model checks and their limits are in [model evaluation](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md); they do not establish complete Jake/ISA agreement or scheduled production correctness. See [alignment proof](rubric-alignment.md), [RFP overview](README.md), [data contracts](../../data-models.md), and [integrations](../../integrations.md).
