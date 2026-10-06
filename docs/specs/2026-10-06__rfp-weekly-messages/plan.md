# ISA implementation plan: weekly RFP update

## Approach and alternatives

**One new module, structured entries, and one writing step.** Add `workspace/scripts/rfp-report.mjs`. It owns:
- the weekly results format;
- the facts for the Telegram message;
- the draft checks;
- the fallback message;
- the email and Markdown renderers.

Everything in it is pure except `writeTelegramMessage()`, which takes a completion function as a parameter, so tests pass a fake one. The weekly script records one structured entry per RFP instead of free-text "manual review" reasons. It saves the results file, renders from it, and sends as it does today.

**Rejected alternatives:**
- **A code-only Telegram template.** It can only paste in the scorer's formal rubric sentences, so it reads robotic, which fails Chris's tone requirement. It is kept as the fallback.
- **Rewriting the scorer's prompt to produce casual reasons.** That would change scoring inputs and need a retest. The writer step leaves scoring untouched.
- **Patching the existing builders in place.** That keeps the keyword-era helpers that caused the garbled text.
- **A wider split of the weekly script.** It is out of scope.

**Stays outside Git:**
- disabling the OpenClaw noon job;
- a later test chat.

## Source and insertion points

1. **`rfp-report.mjs` (new).**
   - `reportEntry()` builds one entry from the candidate, the preliminary result, the full-text result (if any), the document outcome, the HubSpot check and the Drive link. Its fields:
     - **Need:** HigherGov's summary from the candidate body, without its "Background" heading.
     - **Fit:** the AI's `categories.caseStudy.reason`.
     - **Open questions:** unknown Gates 2–6 in order 6, 2, 5, 4, 3, at most two. An unconfirmed deadline is a fact, not a question.
     - **Rank score, score if yes, and long-shot flag:** as in the spec's Tiers.
     - **Deadline and budget text:** computed once, so the writer and the checks use the same strings.
   - `telegramFacts()`: the count, verdict counts, up to three picks, the skipped RFP (if any), and reason counts.
   - `writeTelegramMessage(facts, complete)`, which:
     - builds the prompt: ISA's "Vibe" line from `IDENTITY.md`, the style rules from the spec, and the facts as JSON;
     - calls `complete` with a 120-second timeout;
     - runs `checkTelegramDraft()`;
     - returns `{ text, source: 'isa' | 'fallback', reason }`.
   - `checkTelegramDraft(draft, facts)`: the checks listed in the spec's Acceptance section.
   - `renderTelegramFallback(facts)`, `renderEmailHtml(results)` and `renderMarkdown(results)`.
2. **`weekly-rfp-pursue-decision.mjs`.**
   - **Main loop:** replace the eight `manualReview.push` sites and the one `qualified.push` with `reportEntry(...)`.
   - **Report block:** build the results, write the message, save `<date>.json` and `latest.json`, then send.
   - **The completion function:** created once from `createOpenClawJudge()` in `rfp-scoring-judgment.mjs`, the same tools-free path the scorer uses.
   - **Delete** `buildTelegramSummary`, `buildEmailHtml`, `buildSection`, `buildReviewSection`, `buildQualificationNarrative`, `buildWhyItFitsNarrative`, `reasonToWhyFit` and `scoreBand`.
   - **Delete** the adapter's placeholder `landscape` and `capability` fields, and the `deadlines.questionsDue` field that is always empty.
3. **`rfp-scoring-policy.mjs`.** Expose the category sum as `potential_total` on full-text Needs review and Conditional results. It uses the same summing helper as `total`, so arithmetic stays in one place. Decisions are unchanged.
4. **`rfp-deadline.mjs`.** Export the existing `deadlineTimestamp()` so the report can show Pacific time from the verified cutoff.
5. **`run-new-rfp-qualification-cron.sh`.** Replace `exec node …` with a run that keeps the exit status. On a non-zero status, send the one-line notice with `openclaw message send`, unless `NO_TELEGRAM=1`, then exit with the original status. An `EXIT` trap also covers failures before Node starts.
6. **Preview mode.** Add `RFP_DELIVERY=preview` to the weekly script.
   - It writes the email HTML and `telegram.md` beside the report.
   - It skips the Gmail send, the Telegram send, and Drive folder creation and mirroring.
   - The writer still runs, so a preview shows ISA's real draft.
   - `NO_TELEGRAM` keeps its current meaning.
7. **`workspace/AGENTS.md`.** Add the short RFP section described in the spec, including how to respond to replies to Friday questions.
8. **Docs.** Update `docs/domains/rfp/README.md` and `document-qualification.md` with the report tiers, the message and the results file, and `docs/live-jobs.md` with the single scheduler.
9. **Before release:** the preview message to Chris confirms that `openclaw message send --channel telegram` renders Markdown bold and links. If it doesn't, switch the writer rules and the fallback to plain text.

## Invariants and side effects

**Unchanged:**
- Scoring inputs, prompts, gates, thresholds and recommendations.
- The evidence gate: Needs documents is never picked.
- Strong Pursue qualification, the HubSpot duplicate check, and Drive behavior for qualified RFPs.
- The email recipient and subject, and the Telegram target.

**The writer:**
- It receives only `telegramFacts()`, never documents or company files.
- Its draft is sent only if every check passes.
- A failure, a timeout or a rejected draft sends the fallback, so the message is never skipped.

**Other rules:**
- Preview mode never sends mail or Telegram and never writes to Drive; tests assert this.
- The failure notice fires only on a non-zero exit, once per run, and never includes error text.
- Messages use public links only: the HigherGov `source_url` and the agency `solicitation_url`. Document download URLs can carry signed tokens and are never shown.
- Intake state (`RFP-pipeline/state.json`, `seen.csv`) is untouched by reporting. A failed report step after scoring leaves candidate files as they are today; re-running the job is unchanged.

## Context to keep beside code

- **Why only full-text results are picked:** the evidence gate, and the team's September 30 rule.
- **Why ISA writes the message:** Chris's tone requirement. Why every draft is checked against the facts and falls back: so a Friday message is never wrong or missing.
- **Why the skipped-RFP rule uses Gates 2 and 6 and $500k:** Peter's teaming guidance.
- **Why the email subject must not change:** the mail-to-HubSpot match.
- **Why the noon job is disabled:** one scheduler, after the September 18 and 25 double runs. Record this in `docs/live-jobs.md`, not in code.

## Verification and release boundary

**Offline,** with synthetic fixtures in `devtools/fixtures/`:
- **Facts:** ranking, the three-pick cap, rank-score fallbacks, long-shot flags, the skipped-RFP rule, counts that add up, and Pacific-time and listing-only deadlines.
- **Checks:** a good recorded draft passes. Each rejection case falls back with a recorded reason:
  - a changed number, date, budget or title;
  - an extra or missing link;
  - a path or gate number;
  - unsupported formatting;
  - too long.

  A thrown or timed-out completion also falls back.
- **Fallback, email and Markdown renderers:** links on every entry; no paths, excerpt IDs or codes; and the garbled-fit regression.
- **Delivery:** the send step takes the command runner as a parameter, and in preview mode it makes no `gog` or `openclaw` call.
- **Wrapper:** a failing command produces one notice and keeps the exit status.
- **Repository checks:** `npm test`, `npm run check`, `git diff --check`.

**Previews:**
- **Local, free:** render the facts and the fallback from the six October 5 real results in ignored `.isa-local/`.
- **In Telegram, one model call (about 1–2 cents, approved by Chris):** run the writer on the same facts on the VM. Send the result to Chris's direct chat with ISA, under a line saying it's a preview built from test RFPs. This also shows how bold titles and links render.

Chris reviews both before release. There is no full dry run (Chris, October 6); Friday's run is the first full run with the new message.

**Release:**
1. `npm run live:deploy` preview, then `--apply`, with the changed files from a clean commit.
2. After approval: `openclaw cron disable 88d67daa-5c31-4383-aadb-ca9b846a98ae`. Rollback is `enable`.
3. Rollback for files: the deploy backup folder.

**First live check:** Friday's run:
- the Telegram message, and whether ISA's draft or the fallback was sent and why;
- the email;
- `latest.json`;
- the job log;
- that no noon re-run happens.
