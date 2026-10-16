# RFP workflow

ISA's RFP pillar turns HigherGov opportunities into candidate records, scores likely fits, tries to collect solicitation evidence, and prepares pursue-decision material. Proposal skills cover later human-led work. Read [document qualification](document-qualification.md) for the automated job and [proposal handoff](proposal-handoff.md) for the downstream skill set.

## Main flow

The weekly job in `workspace/scripts/weekly-rfp-pursue-decision.mjs` runs intake, scores candidate metadata, optionally fetches documents for candidates above the preliminary threshold, then applies fuller qualification and prepares a report. Its normal path writes runtime candidate/report state and can use HubSpot, Drive, Gmail, and Telegram. `workspace/tools/Get-HigherGovOpportunities.ps1` and the RFP skills describe related workflows, but do not assume they are the exact implementation of the scheduled Node job.

## Friday update

`workspace/scripts/rfp-report.mjs` turns each run into one results file, `reports/new-rfp-qualification/<run date>.json` and `latest.json`, with one entry per RFP. Each entry is in one tier:

- **Strong pursue.**
- **Worth a look.**
- **Couldn't check yet:** documents missing or unreadable, or scoring didn't finish. Also "ask the agency first": the documents show a product buy (Jake's Gates 2 and 2a). The report gives the question to send and when the agency's questions are due. These are never picks, whatever they could score.
- **Screened out:** with a plain reason.

From that file:

- **The pursue email** goes to Peter, Marianne and Sales (`RFP_EMAIL_TO`) when there are Strong Pursue RFPs, in Jake's format (`workspace/skills/rfp-email-pursue-skill.md`): per RFP, a Drive folder link, what they use today and want, why it fits us, and up to three blockers. ISA's model writes only the sentences; code adds the subject, titles, links and sign-off, and `checkPursueSentences()` checks the sentences against the facts. If anything differs or the writer fails, code-built sentences are used. What the buyer uses today comes from the scorer's `buyer` field, which never affects points.
- **The subject must never match the mail-to-HubSpot job's pursue pattern** (`RFP_PURSUE_SUBJECT_PATTERN`). That job turns matching emails from isa@ into deals, paragraph by paragraph, so a match would create junk deals. A test keeps the two patterns in step.
- **Already in HubSpot.** A Strong Pursue that matches a deal in HubSpot's RFP pipeline (`workspace/scripts/rfp-hubspot-match.mjs`) stays a pick. Its email card says "Already in HubSpot as …", so sales sees it and a wrong match costs nothing. A match needs the same agency and project: two distinctive words in common, or the agency's acronym. Generic words like *website* or *development* don't count. Until October 16 a match hid the pick; that day a commercial "… Website Design and Development" deal hid the week's only Strong Pursue.
- **At most one pursue email per week.** A re-run in the same week sends nothing new; a failed send can be retried.
- **The Telegram message** is a short summary of what happened: the email was sent (with each RFP's score and biggest blocker), it failed, or nothing was worth pursuing (with the closest one and why). ISA writes the "sent" version, checked like the email; the other two are code-built.
- **Close calls.** Code then adds up to three "close calls": RFPs scoring 70 or more that weren't picked, so someone can ask for a closer look. Scores move about 5 points between runs. "Ask the agency first" RFPs and the quiet week's closest one are left out.
- **The results file** records the email and the message, who wrote them, and why a code-built version was used. ISA's chat reads it to answer questions about the week's RFPs.

## Weekly audit

Each run deletes the previous week's candidate files before intake, so the results file's one-line reasons were the only lasting record. Since October 14, `workspace/scripts/rfp-audit.mjs` also keeps `reports/new-rfp-qualification/audit/<run date>.jsonl`, written as the run goes. A run that dies partway still leaves what it scored, and a second run on the same date writes `<run date>-2.jsonl` instead of touching the first. Nothing deletes these files.

There is one line per listing the run pulled:
- **Each report entry,** written the moment the entry is.
- **Listings that never reached scoring,** with `outcome.tier: "skipped"`: those the intake filter dropped (`intake-due-soon`, `intake-set-aside`, `intake-not-a-bid`) and duplicates of an RFP already scored that run (`duplicate`). The duplicate check now runs before the listing is scored, so a duplicate no longer costs a model call.

Each line holds:
- **The RFP:** HigherGov `versionKey`/`oppKey`, title, agency, listing due date and links, plus `listingText`, the HigherGov summary and description the scorer read.
- **The outcome:** what the report said (tier, reason, recommendation, score), plus:
  - `decision` and `why` in plain words for every line;
  - what they want, budget, due date, and blockers and open questions.
- **The listing and full-text scoring:**
  - each gate's pass/fail/open with its reason;
  - category points, the reasons and the deadline;
  - any scoring error, the number of tries and seconds taken;
  - the model, a hash of the whole prompt (the code's rules included), and short hashes of the four scoring skills.
- **The model's own answer:** evidence quotes cut to 300 characters.
- **The documents:** why the set was incomplete, and file names, roles, and whether each was read. Local paths and download links stay in the manifest.

That is about 3 MB a week. If the file can't be written, the job logs one line and the Friday update goes out without it.

`npm run rfp:audit -- <run date>` copies one week to `.isa-local/audit/` (read-only on the VM) and writes a workbook next to it, with both tabs built from the same lines in the same order:
- **Sales:** decision, why, due, budget, score, where it lost points, what they want, and links.
- **Details:** each gate by name with its notes, points out of their maximum, documents, scoring errors, tries, seconds, and versions.

The workbook needs `exceljs`, the repo's only dependency (dev-only, `npm ci`); the VM never loads it. The audit holds RFP and contact data, so it is never committed. Until ISA has a database this file is the record; each line imports as one row keyed on `versionKey`. ISA's chat does not read it yet.

`RFP_INTAKE_REPLAY=YYYY-MM-DD:YYYY-MM-DD` pulls those past HigherGov days again, ignoring the seen list, and leaves the intake state and seen list unchanged, so the next scheduled run starts where the last one stopped. A plain re-run pulls new days instead and moves the state forward. To redo a failed week, combine it with `RFP_REPORT_WEEK_OF`.

`RFP_REPORT_WEEK_OF=YYYY-MM-DD` counts a late re-run as that date's week for the once-a-week email, so that week's Friday run still sends; deadlines still count from the real run date. It was used to redo October 9's run on October 14.

`RFP_DELIVERY=preview` writes the same files plus the email and Telegram text (`<run date>-email.html`, `<run date>-telegram.md`), but sends nothing and creates no Drive folders. It still runs intake, so use it only with an isolated `WORKSPACE_DIR`. To review the wording without running the job, use `npm run rfp:preview -- <results file>` (add `--isa` for ISA's own words).

If the run fails, the cron wrapper posts one failure notice to the group. See the [pursue email spec](../../specs/2026-10-12__rfp-pursue-email/spec.md) and the earlier [weekly update spec](../../specs/2026-10-06__rfp-weekly-messages/spec.md).

## When OpenClaw is unavailable during the run

The weekly job scores through the OpenClaw install on the VM and sends Telegram through its gateway, and it runs for about three hours from 12:00 UTC on Fridays. On October 9 an OpenClaw update (2026.9.6 to 2026.9.9) ran during it: 58 RFPs were left unscored and the Telegram message was not sent. Keep OpenClaw updates and gateway restarts out of that window.

The job now limits the damage:

- **Scoring.** One model connection serves the run. After three model failures in a row the job waits five minutes and tries the same RFP again, up to three times. If the model is still unavailable, the remaining RFPs are left as "Couldn't check yet" without calling it, and the report still goes out.
- **Telegram.** If the gateway refuses the connection, the send is tried five times, three minutes apart. Other failures are not retried, because the message may already have been posted.
- **Job log.** Each scoring failure writes one `[rfp-scoring]` line to `cron.log` with the stage and the error, with URLs and credentials removed. Reports and candidate files still record only the stage.

An answer that fails validation (`invalid-judgment`) is not an outage. Since October 14 the model gets one more try, with the validator's reason in the request (`previousAnswerRejected`); a second rejection stays unscored. On October 14 these rejections, mostly "Missing scoring evidence.", left 20 of 185 RFPs unchecked. A document set over the size limit (`context-unavailable`) is not retried. Whether a fresh connection recovers after an update has replaced the install has not been tested against a real OpenClaw.

## Invariants and sharp edges

- A metadata score is provisional; it must not be presented as document-backed qualification. Track `document_status`, `qualification_status`, and `scoring_confidence` separately.
- The real solicitation and required scoring attachments matter. Empty or portal-gated document sets cannot become full-text simply because HigherGov returned a listing or a public summary.
- From a `candidate.md`, the scorer reads only listed frontmatter fields and HigherGov's summary and description sections (`intakeText` in `rfp-scoring-policy.mjs`). Scores and notes written into the file never reach it. Examples are the preliminary-scoring skill's results, Jake's "KILL GATES" screens, and the intake's note to the old chat scorer. Jake's candidate files can be re-scored as they are.
- Candidate and `resources/` folders are runtime/customer data, not versioned source. The document manifest should describe what was returned, saved, extracted, blocked, or missing without storing credentials or signed links.
- RFP skills are not all consistent with current code: in this snapshot, `rfp-document-fetch-skill.md` is byte-identical to `rfp-document-refresh-skill.md` and identifies itself as refresh. Verify the intended fetch procedure before relying on that file.

Offline RFP tests include a whole weekly run in preview mode in `devtools/rfp-audit.test.mjs` (intake replay, recorded scoring, documents, report and audit, with nothing sent), the synthetic document-flow fixture in `devtools/rfp-fixture.test.mjs`, pure deadline/scoring regressions in `devtools/rfp-deadline.test.mjs`, the isolated secondary report fixture in `devtools/rfp-deadline-report.test.mjs`, the secondary evidence gate and file-role checks in `devtools/rfp-secondary-evidence.test.mjs`, and the rubric cases in `devtools/rfp-alignment.test.mjs`. They do not prove real portal access, complete document qualification, or scheduled production behavior. See [integrations](../../integrations.md) and [security](../../security.md).

The local scoring implementation shares `rfp-scoring-policy.mjs` and `rfp-scoring-judgment.mjs` between weekly and secondary scoring. It replaces their divergent keyword totals with grounded judgments, validated gates/categories, and code-computed decisions. It reuses ISA's model configuration; no separate model service or credentials are introduced.

[Rubric alignment](rubric-alignment.md) describes the recorded-judgment tests. Initial [real-model checks](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md) have also run, but complete AI alignment and production behavior remain unverified. The [implementation record](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md) lists private company-source prerequisites and the separate evaluation/release steps.
