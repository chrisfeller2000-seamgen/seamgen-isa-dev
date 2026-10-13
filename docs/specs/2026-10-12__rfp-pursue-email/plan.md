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

In order:

1. **`workspace/scripts/rfp-scoring-judgment.mjs`.** Add `buyer` to `OUTPUT_CONTRACT`:
   - `currentSolution`: the system or vendor in place today, or null when the documents don't say;
   - `objective`: what they want built and why;
   - `evidence`: document excerpts.

   Plus one prompt rule. It's required at full-text depth only.
2. **`workspace/scripts/rfp-scoring-policy.mjs`.** When finalizing, `cite(judgment.buyer.evidence, sources, { kind: 'document' })` whenever `buyer` is present, and keep it on the result. It never touches points, gates or decisions.
3. **`workspace/scripts/rfp-report.mjs`.**
   - `reportEntry` gains:
     - `buyer`;
     - `blockers`: worst first, built from open gates (the `QUESTION_GATES` order), `subrules.submission`, `subrules.eligibility` and `competitive`;
     - `sensitive`, from the flags.
   - New functions:
     - `pursueFacts(results)`: picks and per-RFP facts;
     - `checkPursueSentences(sentences, facts)`;
     - `pursueSentencesFallback(facts)`;
     - `renderPursueEmail(facts, sentences)`, which returns `{ subject, html, text }`;
     - `writePursueEmail(facts, complete)`.
   - Telegram:
     - `telegramFacts(results, email)` describes the email outcome;
     - `TEMPLATE`, `renderTelegramFallback` and `checkTelegramDraft` are rewritten for the short summary, and links must be the picks' Drive folders.
   - Extract the shared `writeChecked` helper from `writeTelegramMessage`.
   - Delete:
     - `renderEmailHtml` and `EMAIL_FOOTER`;
     - the biggest-skipped helpers (`biggestSkipped`, `SKIPPED_MIN_VALUE`, `PARTNER_GATES`);
     - the team-question helpers and fields, once nothing uses them.

     Keep `renderMarkdown`.
4. **`workspace/scripts/weekly-rfp-pursue-decision.mjs`,** after `buildResults`:
   1. build `pursueFacts`;
   2. if there are picks and no email went out this week, write and send the email;
   3. write the Telegram summary from the actual email outcome;
   4. write the results files, now including `email`.

   `deliverWeeklyReport` becomes two small sends, email then Telegram, each keeping the injectable `run` for tests. The `.html` report writes are removed. Drive folders, the HubSpot check and the subject constant change only as described in the spec.
5. **`workspace/scripts/run-new-rfp-qualification-cron.sh`.** `RFP_EMAIL_TO` replaces `REPORT_TO`, with its default recipients.
6. **`devtools/rfp-preview.mjs`, plus `rfp:preview` in `package.json`.** It reads report entries (a results file or `score-sample.mjs` output) and writes the email and Telegram text to `.isa-local/preview/`. It uses the local OpenClaw writer when one is reachable, otherwise the code version.
7. **`workspace/AGENTS.md` (ISA's runtime instructions), RFP section.** Describe the email and the Telegram summary, and remove "Replies to the Friday questions" now that there are none.
8. **Docs.** Update the "Friday update" section of `docs/domains/rfp/README.md` and the specs index entry. In the October 6 spec, mark its email and Telegram sections as replaced by this spec.

## Invariants and side effects

- **At most one pursue email per week.** The guard reads that week's results file before sending. A failed send doesn't count, so a re-run can retry it.
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
