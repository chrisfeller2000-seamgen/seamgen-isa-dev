# ISA implementation plan: weekly RFP update

## Approach and alternatives

**One new module and structured entries.** Add `workspace/scripts/rfp-report.mjs`, which owns the weekly results format and its three renderers: Telegram text, email HTML and Markdown.
- The renderers are pure: they take the results and return text, with no file, network or CLI calls.
- The weekly script stops writing free-text "manual review" reasons. Instead it records one structured entry per RFP, saves the results file, renders from it, and sends as it does today.

**Rejected alternatives:**
- **Patching the existing builders in place.** That keeps the keyword-era helpers and free-text reasons that caused the garbled text.
- **A wider split of the weekly script.** It is out of scope.
- **Asking the AI to write the Telegram message.** The scorer already returns every needed field. Code-built text is deterministic, testable and free.

**Stays outside Git:**
- disabling the OpenClaw noon job;
- a later test chat.

## Source and insertion points

1. **`rfp-report.mjs` (new).** It contains:
   - `reportEntry()`, which builds one entry from the candidate, the preliminary result, the full-text result (if any), the document outcome, the HubSpot check and the Drive link;
   - `rankForTelegram()`;
   - `renderTelegram()`, `renderEmailHtml()` and `renderMarkdown()`;
   - the plain-label maps for gates and statuses.

   The entry gets its fields as follows:
   - **Fit:** the AI's `categories.caseStudy.reason`.
   - **Open question:** the first unknown gate's reason.
   - **Rule-out risk:** the failed gate's reason.
   - **Need:** HigherGov's `ai_summary`, first sentence.
   - **Next step:** derived from the tier and outcome.
2. **`weekly-rfp-pursue-decision.mjs`.**
   - **Main loop:** replace the eight `manualReview.push` sites and the one `qualified.push` with `reportEntry(...)`.
   - **Report block:** write `<date>.json` and `latest.json`, then render.
   - **Delete** `buildTelegramSummary`, `buildEmailHtml`, `buildSection`, `buildReviewSection`, `buildQualificationNarrative`, `buildWhyItFitsNarrative`, `reasonToWhyFit` and `scoreBand`.
   - **Delete** the adapter's placeholder `landscape` and `capability` fields, and the `deadlines.questionsDue` field that is always empty.
3. **`rfp-scoring-policy.mjs`.** Expose the category sum as `potential_total` on full-text Needs review results. It uses the same summing helper as `total`, so arithmetic stays in one place. Decisions are unchanged.
4. **`rfp-deadline.mjs`.** Export the existing `deadlineTimestamp()` so the report can show Pacific time from the verified cutoff.
5. **`run-new-rfp-qualification-cron.sh`.** Replace `exec node …` with a run that keeps the exit status. On a non-zero status, send the one-line notice with `openclaw message send`, unless `NO_TELEGRAM=1`, then exit with the original status. An `EXIT` trap also covers failures before Node starts.
6. **Preview mode.** Add `RFP_DELIVERY=preview` to the weekly script.
   - It writes the email HTML and `telegram.txt` beside the report.
   - It skips the Gmail send, the Telegram send, and Drive folder creation and mirroring.
   - It is used by the local preview and the optional VM dry run.
   - `NO_TELEGRAM` keeps its current meaning.
7. **`workspace/AGENTS.md`.** Add the short RFP section described in the spec.
8. **Docs.** Update `docs/domains/rfp/README.md` and `document-qualification.md` with the report tiers and results file, and `docs/live-jobs.md` with the single scheduler.

## Invariants and side effects

**Unchanged:**
- Scoring inputs, prompts, gates, thresholds and recommendations.
- The evidence gate: Needs documents is never ranked.
- Strong Pursue qualification, the HubSpot duplicate check, and Drive behavior for qualified RFPs.
- The email recipient and subject, and the Telegram target.

**Rules for the new behavior:**
- Preview mode never sends mail or Telegram and never writes to Drive; tests assert this.
- The failure notice fires only on a non-zero exit, once per run, and never includes error text.
- Messages use public links only: the HigherGov `source_url` and the agency `solicitation_url`. Document download URLs can carry signed tokens and are never shown.
- Intake state (`RFP-pipeline/state.json`, `seen.csv`) is untouched by rendering. A failed render after scoring leaves candidate files as they are today; re-running the job is unchanged.

## Context to keep beside code

- Why only full-text results are ranked: the evidence gate, and the team's September 30 rule.
- Why the email subject must not change: the mail-to-HubSpot match.
- Why the Telegram message is plain text: the CLI has no formatting option.
- Why the noon job is disabled: one scheduler, after the September 18 and 25 double runs. Record this in `docs/live-jobs.md`, not in code.

## Verification and release boundary

**Offline,** with synthetic fixtures in `devtools/fixtures/`:
- renderer tests for ranking, the three-item cap, the "nothing ready" message, the character limit, Pacific-time deadlines, listing-only dates, links on every entry, and no paths, excerpt IDs or codes;
- a regression test for the garbled fit text;
- a delivery test: the send step takes the command runner as a parameter, and in preview mode it makes no `gog` or `openclaw` call;
- a wrapper test that a failing command produces one notice and keeps the exit status;
- `npm test`, `npm run check`, `git diff --check`.

**Local preview, free:** render from the six October 5 real results in ignored `.isa-local/` for Chris to review.

**Optional VM dry run, recommended:**
- The real weekly job runs in an isolated temporary workspace, with copies of the HigherGov config, `state.json`, `seen.csv`, skills and company files, and `RFP_DELIVERY=preview`.
- The production fingerprint is taken before and after.
- Cost and time: about $1.50–2 and about 3 hours, on the same model and HigherGov quota.
- Needs Chris's approval.

**Release:**
1. `npm run live:deploy` preview, then `--apply`, with the changed files from a clean commit.
2. After approval: `openclaw cron disable 88d67daa-5c31-4383-aadb-ca9b846a98ae`. Rollback is `enable`.
3. Rollback for files: the deploy backup folder.

**First live check:** Friday's run — its Telegram message, the email, `latest.json`, the job log, and that no noon re-run happens.
