# RFP workflow

ISA's RFP pillar turns HigherGov opportunities into candidate records, scores likely fits, tries to collect solicitation evidence, and prepares pursue-decision material. Proposal skills cover later human-led work. Read [document qualification](document-qualification.md) for the automated job and [proposal handoff](proposal-handoff.md) for the downstream skill set.

## Main flow

The weekly job in `workspace/scripts/weekly-rfp-pursue-decision.mjs` runs intake, scores candidate metadata, optionally fetches documents for candidates above the preliminary threshold, then applies fuller qualification and prepares a report. Its normal path writes runtime candidate/report state and can use HubSpot, Drive, Gmail, and Telegram. `workspace/tools/Get-HigherGovOpportunities.ps1` and the RFP skills describe related workflows, but do not assume they are the exact implementation of the scheduled Node job.

## Friday update

`workspace/scripts/rfp-report.mjs` turns each run into one results file, `reports/new-rfp-qualification/<run date>.json` and `latest.json`, with one entry per RFP. Each entry is in one tier:

- **Strong pursue.**
- **Worth a look.**
- **Couldn't check yet:** documents missing or unreadable, or scoring didn't finish. These are never picks, whatever they could score. It also covers two RFPs with a clear next step:
  - **"Ask the agency first":** the documents show a product buy (Jake's Gate 2), or ask for proof only a product vendor has, such as existing installs or demos of workflows already running in a product (Gate 2a). The report gives the question to send and when the agency's questions are due. Its wording follows the gate: "looks like a product buy" for Gate 2, "asks for proof a product vendor would have" for Gate 2a (entry field `agencyRule`). Results files from before November 13 have no `agencyRule` and keep the product-buy wording. A demo of the bidder's *proposed* design or of third-party tools is not a Gate 2a tell; see the [Gate 2a spec](../../specs/2026-11-13__rfp-gate2a-demos/spec.md).
  - **"Documents need a portal login":** the documents are on the agency's portal behind a vendor account. These come first in the Markdown, under their own heading. Each names the portal ("the documents need a free Public Purchase account to download") and gives the listing score, the HigherGov listing and the agency posting.

  Other missing documents say why in brackets when the posting attempt found out, such as a bot check, by email, or not listed (see [document qualification](document-qualification.md), "Agency posting").
- **Screened out:** with a plain reason.

From that file:

- **The pursue email** goes to Marianne and Sales (`RFP_EMAIL_TO`), with Chris and jgaribay@ copied (`RFP_EMAIL_CC`), when there are Strong Pursue RFPs, in Jake's format (`workspace/skills/rfp-email-pursue-skill.md`): per RFP, a Drive folder link, what they use today and want, why it fits us, and up to three blockers. ISA's model writes only the sentences; code adds the subject, titles, links and sign-off, and `checkPursueSentences()` checks the sentences against the facts. If anything differs or the writer fails, code-built sentences are used. What the buyer uses today comes from the scorer's `buyer` field, which never affects points.
- **The Drive folder.** Each Strong Pursue gets a folder under the favorable-RFP folder (an existing one is reused by name), and its agency documents in `resources/` are uploaded there. Files starting with `_` (the document manifests) stay on the VM; until November 17, 2026 they were uploaded too. A new folder's ID comes from `gog drive mkdir`'s `id` line. Listing the parent again is only a fallback, because a listing made straight after creation can miss the new folder: on November 6, 2026 the City of Chandler folder was made but never filled, and its email had no link. Failed listings, mkdirs and uploads are logged to `cron.log`.
- **The subject must never match the mail-to-HubSpot job's pursue pattern** (`RFP_PURSUE_SUBJECT_PATTERN`). That job turns matching emails from isa@ into deals, paragraph by paragraph, so a match would create junk deals. A test keeps the two patterns in step.
- **Already in HubSpot.** A Strong Pursue that matches a deal in HubSpot's RFP pipeline (`workspace/scripts/rfp-hubspot-match.mjs`) stays a pick. Its email card says "Already in HubSpot as …", so sales sees it and a wrong match costs nothing. A match needs the same agency and project: two distinctive words in common, or the agency's acronym. Generic words like *website* or *development* don't count. Until October 16 a match hid the pick; that day a commercial "… Website Design and Development" deal hid the week's only Strong Pursue.
- **At most one pursue email per week.** A re-run in the same week sends nothing new; a failed send can be retried.
- **The Telegram message** is a short summary of what happened: the email was sent (with each RFP's score and biggest blocker), it failed, or nothing was worth pursuing (with the closest one and why). ISA writes the "sent" version, checked like the email; the other two are code-built.
- **The move offer.** Right after the message, code adds one line asking whether to move the week's Strong Pursue RFPs to "Phase 2: Looking closer", by the names the message used ("Want me to move **…** to Phase 2: Looking closer? Reply here and I'll move it."). Nothing moves until someone in the group replies; ISA's chat then moves it (see [Stage folders](#stage-folders)). Failed-email weeks carry it too; quiet weeks have no picks, so no offer.
- **Close calls.** Code then adds up to three "close calls": RFPs scoring 70 or more that weren't picked, so someone can ask for a closer look. Scores move about 5 points between runs. "Ask the agency first" RFPs, RFPs waiting on a portal login, and the quiet week's closest one are left out.
- **Portal logins.** Last, code adds one line for the RFPs whose documents need a portal login: how many, and the top three by name with their portal ("4 RFPs need a portal login before their documents can be read: …. They're in the report."). ISA's checked text never carries it.
- **The results file** records the email and the message, who wrote them, and why a code-built version was used. ISA's chat reads it to answer questions about the week's RFPs.
- **Q&A questions are generated in chat, on request** (`workspace/skills/rfp-email-agency-questions-skill.md`), not by the weekly job. ISA states the questions deadline and how to submit, lists 5–7 questions with the RFP text behind each, and gives the agency email as text to copy. It never creates a Gmail draft. The pursue email's Key dates line comes from the scorer's `questions` field, which never affects points. It appears only when the documents state a questions deadline and the scorer cites it.

## Weekly audit

Each run deletes the previous week's candidate files before intake, so the results file's one-line reasons were the only lasting record. Since October 14, `workspace/scripts/rfp-audit.mjs` also keeps `reports/new-rfp-qualification/audit/<run date>.jsonl`, written as the run goes. A run that dies partway still leaves what it scored, and a second run on the same date writes `<run date>-2.jsonl` instead of touching the first. Nothing deletes these files.

There is one line per listing the run pulled:
- **Each report entry,** written the moment the entry is.
- **Listings that never reached scoring,** with `outcome.tier: "skipped"`: those the intake filter dropped (`intake-due-soon`, `intake-set-aside`, `intake-not-a-bid`), new versions of RFPs already being worked on (`in-progress`), and duplicates of an RFP already scored that run (`duplicate`). The duplicate check now runs before the listing is scored, so a duplicate no longer costs a model call.

Each line holds:
- **The RFP:** HigherGov `versionKey`/`oppKey`, title, agency, listing due date and links, plus `listingText`, the HigherGov summary and description the scorer read.
- **The outcome:** what the report said (tier, reason, recommendation, score), plus:
  - `decision` and `why` in plain words for every line;
  - what they want, budget, due date, and blockers and open questions.
- **The listing and full-text scoring:**
  - each gate's pass/fail/open with its reason;
  - category points, the reasons and the deadline;
  - any scoring error, the number of tries (a failed scoring too, since November 3) and seconds taken;
  - the model, a hash of the whole prompt (the code's rules included), and short hashes of the four scoring skills.
- **The model's own answer:** evidence quotes cut to 300 characters.
- **Rejected answers** (`rejections`): each answer the validator turned down, with its try number and reason, whether or not a later try passed. Up to 40,000 characters each.
- **The documents:** why the set was incomplete, and file names, roles, whether each was read, and its `source` (`highergov` or `posting`, with `match` for posting files). `posting` records the attempt at the agency's posting: site, portal, access, outcome, files listed and saved, and what was skipped. Local paths and download links stay in the manifest.

That is about 3 MB a week. If the file can't be written, the job logs one line and the Friday update goes out without it.

`npm run rfp:audit -- <run date>` copies one week to `.isa-local/audit/` (read-only on the VM) and writes a workbook next to it, with both tabs built from the same lines in the same order:
- **Sales:** decision, why, due, budget, score, where it lost points, what they want, and links.
- **Details:** each gate by name with its notes, points out of their maximum, documents, scoring errors, tries, seconds, and versions.

The workbook needs `exceljs`, the repo's only dependency (dev-only, `npm ci`); the VM never loads it. The audit holds RFP and contact data, so it is never committed. Until ISA has a database this file is the record; each line imports as one row keyed on `versionKey`. ISA's chat does not read it yet.

`RFP_INTAKE_REPLAY=YYYY-MM-DD:YYYY-MM-DD` pulls those past HigherGov days again, ignoring the seen list, and leaves the intake state and seen list unchanged, so the next scheduled run starts where the last one stopped. A plain re-run pulls new days instead and moves the state forward. To redo a failed week, combine it with `RFP_REPORT_WEEK_OF`.

`RFP_REPORT_WEEK_OF=YYYY-MM-DD` counts a late re-run as that date's week for the once-a-week email, so that week's Friday run still sends; deadlines still count from the real run date. It was used to redo October 9's run on October 14.

`RFP_DELIVERY=preview` writes the same files plus the email and Telegram text (`<run date>-email.html`, `<run date>-telegram.md`), but sends nothing and creates no Drive folders. It still runs intake, so use it only with an isolated `WORKSPACE_DIR`. To review the wording without running the job, use `npm run rfp:preview -- <results file>` (add `--isa` for ISA's own words).

## Rescoring one RFP mid-week

`workspace/scripts/rfp-rescore.mjs` rescores one RFP from the week's report with the current scoring code. It exists because a scoring fix that lands mid-week otherwise waits for an RFP that never comes back: the Friday run only pulls listings captured since the last run. On November 13 City of Laguna Beach's website redesign was held back by a Gate 2a misread fixed the next day, and the only way to correct the report was to re-run the whole week.

It runs in two steps, on the VM:

1. `node scripts/rfp-rescore.mjs <slug>` makes the same listing and full-text scoring calls as the Friday run. It reads the listing from `candidate.md` and the documents already saved in `resources/`. It prints the before and after, and saves the new result in `reports/new-rfp-qualification/rescore/<slug>.json`. Nothing else changes.
2. `node scripts/rfp-rescore.mjs <slug> --apply` writes that saved result, with no new model call, so what was shown is what is applied. It updates:
   - the RFP's entry, the counts, and a `rescores` list (before, after and date) in `<run date>.json` and `.md`, plus `latest.*` while that is the same run. The Markdown ends with "Rescored after the Friday run", saying the email and Telegram message didn't include the new result;
   - the RFP's `candidate.md`, with the same fields the Friday run writes;
   - `audit/<run date>-rescores.jsonl`, one line per apply, with `rescore.before`. The week's own audit file keeps one line per listing.

Other behavior:
- **Deadlines** count from the day of the rescore; `--date` sets another day.
- **Drive link:** `--drive-folder <link or ID>` sets the RFP's link; otherwise the Friday entry's link and HubSpot match are kept.
- **Never:** it never downloads documents, reads the agency posting, creates Drive folders, looks up HubSpot, sends the pursue email, or posts to Telegram. The week's `email` and `telegram` records stay as the Friday run wrote them, so a rescored Strong Pursue is emailed by hand.
- **When it refuses** (nothing changes): an RFP not in the week's report, one whose candidate file the next Friday run has cleared, or one with no saved documents; a scoring error; and any time the Friday job is running.

ISA's chat may run it when someone asks to rescore an RFP: first step, then `--apply` only after they confirm (`workspace/AGENTS.md`). Tests: `devtools/rfp-rescore.test.mjs`, which rescores an offline Friday week.

If the run fails, the cron wrapper posts one failure notice to the group. See the [pursue email spec](../../specs/2026-10-12__rfp-pursue-email/spec.md) and the earlier [weekly update spec](../../specs/2026-10-06__rfp-weekly-messages/spec.md).

## When OpenClaw is unavailable during the run

The weekly job scores through the OpenClaw install on the VM and sends Telegram through its gateway, and it runs for about three hours from noon Pacific on Fridays (the crontab sets `CRON_TZ=America/Los_Angeles`). On October 9 an OpenClaw update (2026.9.6 to 2026.9.9) ran during it: 58 RFPs were left unscored and the Telegram message was not sent. Keep OpenClaw updates and gateway restarts out of that window.

The job now limits the damage:

- **Scoring.** One model connection serves the run. After three model failures in a row the job waits five minutes and tries the same RFP again, up to three times. If the model is still unavailable, the remaining RFPs are left as "Couldn't check yet" without calling it, and the report still goes out.
- **Telegram.** If the gateway refuses the connection, the send is tried five times, three minutes apart. Other failures are not retried, because the message may already have been posted.
- **Job log.** Each scoring failure writes one `[rfp-scoring]` line to `cron.log` with the stage and the error, with URLs and credentials removed. Reports and candidate files still record only the stage.

An answer that fails validation (`invalid-judgment`) is not an outage. Since October 14 the model gets one more try, with the validator's reason in the request (`previousAnswerRejected`); a second rejection stays unscored. On October 14 these rejections, mostly "Missing scoring evidence.", left 20 of 185 RFPs unchecked. On October 23 and 30, 21 of 45 retried answers were rejected again. That message came from about 25 checks and named none of them, so the retry could only guess what to fix. Since November 3 every citation rejection names the answer field and the problem, for example `Missing scoring evidence at gates.gate3.evidence.` or `… at requiredDocuments[0].evidence[0]: needs a document excerpt, cites metadata.` Unknown eligibility (no qualification answer and no reference count) also no longer needs a citation, as the prompt always said; Gate 6 stays open. A document set over the size limit (`context-unavailable`) is not retried. Whether a fresh connection recovers after an update has replaced the install has not been tested against a real OpenClaw.

## Stage folders

Each RFP's folder sits in one of four tiers under `RFPs/`. The folder names are the ones the proposal skills and `Sync-RfpToDrive.ps1` were written for:

| Folder | Label | Means |
| --- | --- | --- |
| `1-pre-submission` | Scored | The Friday job saved its documents. Every RFP starts here. |
| `2-intermediate-stage` | Looking closer | Someone decided to look closer or collect more information. |
| `3-building` | Building | The proposal is being written, up to submission-ready. |
| `4-submitted` | Submitted | The proposal went in. |

Before November 17, 2026 nothing moved RFPs between tiers, so on the VM every RFP (302 folders) sat in tier 1, and nothing recorded which RFPs Seamgen was working on. HubSpot's RFP pipeline was checked as an alternative that day and doesn't record it either: no deal in "Qualified RFP" or "Response submitted", nearly all stages set in two bulk passes in August, and no deal created since August 20.

- **Moves happen only when someone asks.** ISA's chat runs `node scripts/rfp-stage.mjs <slug> <tier> --by "<name>" [--note "<why>"]` (`workspace/AGENTS.md`). The skills ask the requester instead of moving an RFP themselves: the fetch skill no longer moves a 50+ RFP to tier 2 on its own, and the submission email asks before moving to tier 4.
- **Phases.** People see the tiers as "Phase 1: Scored" through "Phase 4: Submitted"; the folder names don't change. After any move into Phase 2, 3 or 4, ISA says what moved, lists that phase's skills and runs only the ones the person picks. It never runs a skill because an RFP moved. The phase-to-skills map is in `workspace/AGENTS.md`, the only place ISA learns skills from: Phase 2 has the engineering brief, capability verification, agency questions and calendar dates; Phase 3 the submission checklist, deck rough draft, materials requests and moonshot integration; Phase 4 the submission email; Phase 1 nothing. Document refresh isn't offered: the Tuesday check covers Phases 2 and 3 on its own. `devtools/rfp-skill-files.test.mjs` checks every skill the map names exists.
- **A move renames the whole folder**, so `resources/` and the deliverables stay together. It copies this week's `candidate.md` into the folder, because the Friday job clears the candidate files each week, and appends the move to `_stage.json` ([data models](../../data-models.md)). An RFP with no folder yet gets one if this week's candidate file exists. Moving back to tier 1 means nobody is working on it.
- **It refuses** while the Friday job runs on the same workspace (it saves documents into these folders), when the RFP is already in that tier, when it has folders in two tiers, and when there is neither a folder nor a candidate file. `node scripts/rfp-stage.mjs list` shows tiers 2–4.
- **A new version of an RFP being worked on isn't scored again.** An amendment is a new HigherGov version, which the Friday intake hasn't seen. Without a check it would be scored as a new RFP, re-downloaded under the Friday job's file names, and could reach the pursue email again. Before scoring, the Friday job reads the `opp_key` of every RFP in tiers 2–4 (`rfpsInProgress()` in `rfp-folders.mjs`, from `_refresh.json`, the manifest or the `candidate.md` copy). A listing with one of those keys:
- **A forwarded RFP is recognized when its listing arrives.** An RFP moved with no HigherGov key has nothing to match on, so `rfp-stage.mjs` records its agency and solicitation number (`--agency`, `--number`; a move without them says so). HigherGov's API can't look one up. Checked against its published schema on November 17, 2026:
  - there is no keyword or title search, except inside a saved search built in HigherGov's website;
  - `source_id` is the posting site's internal ID ("39891" for an RFP numbered "1913-27"), not the solicitation number;
  - a HigherGov page link ends in yet another internal number.

  So the Friday run matches each new listing against these key-less RFPs before scoring (`matchKeylessRfp()`). A listing matches on either:
  - the solicitation number as a whole token in the listing's title or text, from the same agency; the number has to be distinctive (more than one part, letters and digits, or at least five digits), so a bare "2026" never matches;
  - or the same title and agency, by the duplicate-posting rule.

  A match is treated as in progress, and its keys are saved in the RFP's `_refresh.json` (`adoptHigherGovKeys()`), with the documents already in the folder counted as known. From then on the Tuesday check follows it, downloading only what HigherGov has that the folder lacks. A listing outside Seamgen's HigherGov saved search never reaches Friday, so it is never matched, and never scored either.
  - goes into the results file's `inProgress` list and a report section, "Updated listings already being worked on";
  - is audited as skipped (`in-progress`);
  - is never counted, picked, emailed or posted.
  The Tuesday document check handles its documents and due date, and anyone can ask ISA to rescore it.
- **The Friday job uses the moved folder** for any other listing that maps to it by slug: its documents are saved into the RFP's existing folder, latest tier first, and only an RFP with no folder gets a new one in tier 1.
- **Not done yet:** tier 1 still only grows. Clearing old tier-1 folders on a timer is safe only once moving is routine. The solution-landscape and capability-verification skills still cite CLAUDE.md Rule 10. Solution landscape is part of the scoring prompt (`policyNames` in `rfp-scoring-judgment.mjs`), so editing it changes scoring. Capability verification was taken out of the scoring prompt on November 17, 2026; it is a chat step that writes an engineer's checklist, so it can now be edited without changing scores. Tests: `devtools/rfp-stage.test.mjs`, including a whole offline Friday run after a move. See the [stage folders spec](../../specs/2026-11-17__rfp-stage-folders/spec.md).

## Tuesday document check

Agencies amend an RFP by adding documents to the listing or by moving the deadline. `workspace/scripts/rfp-refresh.mjs` catches both for the RFPs someone is working on.

- **When:** the system crontab runs `scripts/run-rfp-refresh-cron.sh` every Tuesday at 7:00 a.m. Pacific (`0 7 * * 2`, installed November 17, 2026). It checks every RFP in `2-intermediate-stage` (Looking closer) and `3-building` (Building). On request, ISA's chat runs `node scripts/rfp-refresh.mjs <slug>` for one RFP in any tier.
- **HigherGov's model:** an amendment is a new version of the opportunity, with the same `opp_key`. The script reads every version newest first (`listOpportunityVersions()`). A read-only check of 15 saved RFPs on November 17, 2026 found:
  - one whose November 3 version moved the due date from November 2 to November 30 with no new file;
  - that both versions shared one `document_path`, so the document list belongs to the opportunity.
  - So the due date is compared every week, not only the documents.
- **Matching documents:** HigherGov's document records have no ID (`file_name`, `file_type`, `file_size`, `posted_date`, `download_url`), so they are matched by name and size. A new name is new; a saved name with a new size is re-issued; a saved file no longer listed is reported and kept.
- **Saving:** only new and re-issued files are downloaded. A re-issued file is saved as `…-updated-<date>` beside the original, and nothing in `resources/` is overwritten. The manifest gets a row per file (`added_by_refresh`), so a rescore reads them.
- **Drive:** new files go straight to the RFP's one Drive folder (flat, one per RFP, whatever its tier), agency documents only. The folder is the one a Friday report linked to, or one found or made by the Friday job's naming rule. Its ID is then kept in `_refresh.json`, so later uploads don't depend on the Friday job's loose name match, which also lists only the first 200 folders. Nothing in Drive is replaced or deleted. `--drive` uploads what Drive lacks even with nothing new on HigherGov, for files a person sent ISA.
- **Telegram:** one code-built message to the sales group, only when something changed:
  - per RFP: a moved due date, new and re-issued documents by name, and the Drive link;
  - "Couldn't check" for RFPs with no HigherGov key, but only when a message goes out anyway.
  - A file HigherGov lists but won't hand over is reported once.
  - A quiet week sends nothing.
- **Retry and failure notice:** if the run fails, including an unsent Telegram message, the wrapper tries once more 10 minutes later. Only if that fails too does it post one failure notice, so silence never hides a failure. A retry is safe:
  - files already saved aren't downloaded again;
  - each recorded change stays `notified: false` in `_refresh.json` until a message carrying it is sent, so a change recorded before a crash is still announced, once;
  - a Drive upload that failed is tried again.
- **Record:** `RFPs/<tier>/<slug>/_refresh.json` and `reports/rfp-refresh/<date>.json` (see [data models](../../data-models.md)).
- **Never:** reads agency portals (a person checks those, per the refresh skill), deletes anything, or sends email. It refuses while the Friday job runs. `RFP_REFRESH_DELIVERY=preview` is a dry run: it reports what it would download, and saves, records, uploads and sends nothing.
- **Tests:** `devtools/rfp-refresh.test.mjs` (stand-in HigherGov, `gog` and Telegram) and the wrapper case in `devtools/rfp-cron-wrapper.test.mjs`. See the [Tuesday refresh spec](../../specs/2026-11-17__rfp-tuesday-refresh/spec.md).

## Invariants and sharp edges

- A metadata score is provisional; it must not be presented as document-backed qualification. Track `document_status`, `qualification_status`, and `scoring_confidence` separately.
- The real solicitation and required scoring attachments matter. Empty or portal-gated document sets cannot become full-text simply because HigherGov returned a listing or a public summary.
- From a `candidate.md`, the scorer reads only listed frontmatter fields and HigherGov's summary and description sections (`intakeText` in `rfp-scoring-policy.mjs`). Scores and notes written into the file never reach it. Examples are the preliminary-scoring skill's results, Jake's "KILL GATES" screens, and the intake's note to the old chat scorer. Jake's candidate files can be re-scored as they are.
- Candidate and `resources/` folders are runtime/customer data, not versioned source. The document manifest should describe what was returned, saved, extracted, blocked, or missing without storing credentials or signed links.
- RFP skills are not all consistent with current code. Until October 12, 2026 `rfp-document-fetch-skill.md` was a byte-identical copy of the refresh skill (`devtools/rfp-skill-files.test.mjs` now catches that); until November 2026 the refresh skill assumed a Windows browser bridge and Drive uploads ISA didn't have. Verify a skill's procedure against the code before relying on it.

Offline RFP tests include a whole weekly run in preview mode in `devtools/rfp-audit.test.mjs` (intake replay, recorded scoring, documents, report and audit, with nothing sent), the synthetic document-flow fixture in `devtools/rfp-fixture.test.mjs`, pure deadline/scoring regressions in `devtools/rfp-deadline.test.mjs`, the isolated secondary report fixture in `devtools/rfp-deadline-report.test.mjs`, the secondary evidence gate and file-role checks in `devtools/rfp-secondary-evidence.test.mjs`, and the rubric cases in `devtools/rfp-alignment.test.mjs`. They do not prove real portal access, complete document qualification, or scheduled production behavior. See [integrations](../../integrations.md) and [security](../../security.md).

The local scoring implementation shares `rfp-scoring-policy.mjs` and `rfp-scoring-judgment.mjs` between weekly and secondary scoring. It replaces their divergent keyword totals with grounded judgments, validated gates/categories, and code-computed decisions. It reuses ISA's model configuration; no separate model service or credentials are introduced.

[Rubric alignment](rubric-alignment.md) describes the recorded-judgment tests. Initial [real-model checks](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md) have also run, but complete AI alignment and production behavior remain unverified. The [implementation record](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md) lists private company-source prerequisites and the separate evaluation/release steps. [Company facts](company-facts.md) describes the dated record of registrations, certifications, insurance and references that Gate 6 relies on.
