# ISA implementation plan: RFP updates in Jake's format

## Approach and alternatives

This is a change to how the Friday results are delivered. The scoring, intake and document steps stay as they are. Where a module already does a job, we extend it rather than adding new modules.

- **Email and Telegram text stay in `rfp-report.mjs`,** next to the results and the Telegram writer, and the old report email is deleted. Moving this into a new module would mean more churn for little gain.
- **"Ask ISA, check, fall back" becomes one small shared helper.** Today's `writeTelegramMessage` has its own timeout, check and fallback. The email needs the same, so it becomes a helper both writers call, instead of a second copy.
- **ISA writes sentences as JSON; code assembles the email.** The other way, ISA writing the whole email as free text, would need its links, titles and numbering parsed and checked. Here they can't be wrong because code puts them in.
- **"What they use today / what they want" comes from the scorer.** It already reads the full documents and has its citations checked. The alternatives:
  - a separate model call per pick, which means more calls and more code;
  - the HigherGov summary only, which can't say what the buyer uses today, so Jake's "silent" line would be a guess.
- **A subject that avoids the mail sync, plus a weekly guard on the results file.** No changes to the mail sync itself, and no database yet (ISA-5).

## Source and insertion points

As built:

1. **`workspace/scripts/rfp-scoring-judgment.mjs`.** `buyer` added to `OUTPUT_CONTRACT`:
   - `currentSolution`: one sentence on what is in place today, or null when the text doesn't say;
   - `objective`: one sentence on what they want built and why;
   - `advantage`: one sentence on how the evaluation favors us, or null;
   - `evidence`: excerpt citations.

   Plus one rule: `buyer` never affects gates or points.
2. **`workspace/scripts/rfp-scoring-policy.mjs`: no change.** `validateAllCitations` already checks every citation anywhere in the judgment, and the finalized result keeps the whole judgment as `judgments`. A policy test shows a `buyer` field is checked and leaves points and decisions unchanged.
3. **`workspace/scripts/rfp-report.mjs`.**
   - `reportEntry` gains:
     - `buyer`: a current solution only when cited, and `silent` only when the scorer said null;
     - `blockers`: `{ text, quote }`, worst first, from open gates, then submission, a wired competitive verdict, and an unfamiliar compliance band. The quote is the cited RFP text ISA uses to be specific;
     - `number`: HigherGov's `rfp_number`, shown as Jake did ("No. 561");
     - `sensitive`.
   - `gateReason` swaps the policy's stock "under its documented subrule" reason for a plain sentence per gate, and strips "Gate N" mentions from model reasons.
   - New functions: `pursueFacts`, `checkPursueSentences`, `pursueSentencesFallback`, `renderPursueEmail` (`{ subject, text, html }`) and `writePursueEmail`.
   - `MAIL_SYNC_PURSUE_SUBJECT` mirrors the mail sync's pattern; a test reads the mail sync's source to keep them equal.
   - Telegram:
     - `telegramFacts(results, pursue, email)` describes the outcome;
     - `renderTelegramFallback` has sent, failed and none versions;
     - `checkTelegramDraft` checks the Drive links, numbers and "sent";
     - `writeTelegramMessage` only asks the model for the sent version.
   - One shared `writeChecked` helper handles the timeout, the check and the fallback for both writers.
   - Deleted:
     - the report email (`renderEmailHtml`, `EMAIL_FOOTER`, `cardHtml`, `lineHtml`);
     - the biggest-skipped and team-question Telegram helpers.

     `renderMarkdown(results)` stays, now titled "RFP results, week N", and lists blockers.
4. **`workspace/scripts/weekly-rfp-pursue-decision.mjs`.**
   - `deliverPursueUpdate`, which replaces `deliverWeeklyReport`:
     1. the once-a-week guard against the previous `latest.json`;
     2. ISA's sentences;
     3. the email, through `gog gmail send --body-html`;
     4. the Telegram summary from the actual outcome.

     `run`, `preview`, `to` and the writer can be injected for tests.
   - `main` writes the results files once, after delivery, with the `email` and `telegram` records.
   - `RFP_EMAIL_TO` replaces `REPORT_TO`.
5. **`workspace/scripts/run-new-rfp-qualification-cron.sh`.** `RFP_EMAIL_TO` defaults to Marianne and sales@. Peter is added before release.
6. **`devtools/rfp-preview.mjs`, `npm run rfp:preview`, `devtools/fixtures/rfp-preview-week.json`.** `devtools/score-sample.mjs --entries` adds full entries for real-data previews.
7. **`workspace/AGENTS.md` RFP section, `docs/domains/rfp/README.md`, specs index, October 6 spec note.**

## Invariants and side effects

- **At most one pursue email per week.** The guard reads `latest.json` before sending. A failed send doesn't count, so a re-run can retry it. The results file is written right after delivery, so a crash in those few seconds could let a re-run send again; that's acceptable until the database (ISA-5).
- **The email goes out first.** The Telegram message describes what actually happened: sent, none, or failed.
- **Preview mode and tests never send.** Tests inject `run` and the writer (`Symbol.for('isa.rfp.testWriter')`).
- **The subject never matches `RFP_PURSUE_SUBJECT_PATTERN`.** The mail sync can't be imported (it runs on load), so the test copies the pattern, with a comment pointing to `daily-mail-hubspot-sync.mjs:67`.
- **Links in the email are only the picks' Drive, posting or HigherGov URLs from the facts.** ISA's sentences contain no URLs.
- **Unchanged:** intake, scoring decisions, document handling, Drive folder creation and the failure notice.

## Context to keep beside code

- Why the subject must avoid the mail sync's pattern: it turns those emails into deals, splitting at paragraphs.
- Why ISA returns sentences and code assembles the email.
- The once-a-week guard, and that the database replaces it later (ISA-5).
- Jake's "silent" line is only used when the documents were read and don't name a current solution.

## Verification and release boundary

1. **Offline:** new cases in `devtools/rfp-report.test.mjs` and `devtools/rfp-scoring-policy.test.mjs`, then `npm test` and `npm run check`.
2. **Local:** `npm run rfp:preview` on fixture entries, then on real entries from `score-sample.mjs`. Chris reviews them.
3. **VM, with approval:** run `score-sample.mjs` on a recent week from `/tmp`, read-only (one model call per RFP), to get real entries with `buyer`. Then preview from those entries. Nothing is sent.
4. **Release, with explicit approval and after ISA-3 is live and checked:** follow the guarded deploy as usual (`live:pull`, preview, then `--apply` with `--files`). Set `RFP_EMAIL_TO`. Record the release in this spec.
5. **First live Friday:** check the email, the Telegram summary, the `email` record, that the mail sync created no deals from it, and the log.
