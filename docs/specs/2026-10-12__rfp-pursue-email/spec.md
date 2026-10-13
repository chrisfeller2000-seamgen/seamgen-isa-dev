# ISA task spec: RFP updates in Jake's format (email and Telegram)

Jira ISA-6. Branch `feat/rfp-pursue-email`, from `main` at `9289874`.

## Summary

Replace the Friday summary email with Jake's pursue email, which ISA sends on its own, and make the Friday Telegram message a short summary of that email. Reuse what is already there:
- the report module;
- the Telegram message's "code builds the facts, ISA writes, code checks, code falls back" pattern;
- the Drive folders the job already creates.

One small addition to the scorer supplies the part Jake's format needs and ISA doesn't record yet: what the buyer uses today and what they want.

## Problem and evidence

- **The Friday email is a long report, not a decision email.** It's an HTML report of every RFP of the week (about 180), sent to Marianne only (`REPORT_TO`). `renderEmailHtml` in `workspace/scripts/rfp-report.mjs` builds it. Jake's emails were short, covered only the RFPs to pursue, went to Peter, Marianne and Sales, and followed a fixed format (`workspace/skills/rfp-email-pursue-skill.md` v1.7) that Peter and Marianne shaped.
- **The Friday Telegram message** has up to three picks, questions for the team, and the biggest skipped RFP ([October 6 spec](../2026-10-06__rfp-weekly-messages/spec.md)).
- **The scorer doesn't record what the buyer uses today.** `OUTPUT_CONTRACT` in `rfp-scoring-judgment.mjs` has no such field, and Jake's second part ("current solution and hopeful objective") needs it.
- **The mail → HubSpot sync would turn this email into junk deals if the subject matched.** It acts on emails from isa@ whose subject matches `RFP_PURSUE_SUBJECT_PATTERN` ("RFPs to pursue", "new qualified RFP's for pursue decision"). It splits the body at blank lines and tries to make a deal from each paragraph (`daily-mail-hubspot-sync.mjs:66-67`, `721`, `2071`). Jake's format has a blank line between every part.
- **Scoring is aligned with Jake's system** (PR #11, Jira ISA-3, merged October 12). Picks now come only from document scores, and Jake's Gate 2 and Gate 6 rules apply.

## Decisions (Chris, October 12)

- Use Jake's pursue-email format. ISA sends it on its own, with no review step; we test locally until we're happy with it.
- The Telegram message is a short summary of the email ISA sent.
- Drop the weekly summary email. No no-bid emails.
- Build now. Switch it on only after the ISA-3 scoring is live and checked against Jake's July Strong Pursues.
- Strong Pursue only, like Jake. Sign it "ISA".
- Send it to Peter, Marianne (mariannefaro@seamgen.com) and Sales (sales@seamgen.com).
- No meeting brief. It was Jake's own working document, and nobody needs it now.

## Desired behavior

### Which RFPs go in the email

- **Included:** the RFPs that already get a Drive folder today. They're scored from the documents at 75+ (Strong Pursue) and aren't already a HubSpot deal. Best score first.
- **Not included:** Worth a look (50–74). Jake only emailed one after talking it over with Peter.

### The email

- **From:** isa@seamgen.com. **To:** Peter, Marianne and Sales, from one setting, `RFP_EMAIL_TO`.
- **Subject:**
  - one or two RFPs: their short names, as Jake named the set ("<name> and <name> — pursuing");
  - three or more, or names too long for a subject: "<n> RFPs this week — pursuing";
  - never "RFPs to pursue" or "pursue decision" (see the mail sync above).
- **Body,** in Jake's template, in this order:
  1. One opening line: how many RFPs, from this week's HigherGov search, scored on the full documents.
  2. For each RFP, numbered:
     - "<short name> — <short hook>"
     - "RFP Opportunity through HigherGov: <agency> RFP No. <number> — <full title> — Drive folder", in Jake's order (a link; the number is HigherGov's `source_id`, when there is one)
     - "Current solution & hopeful objective:" 2 sentences
     - "Why it fits us:" 1–2 sentences that name a real past project, plus how the evaluation favors us when the scorer finds it (Jake's "cost is only 5 of 100 points")
     - "Blockers:" up to 3 one-liners, worst first, or "None identified." ISA gets the RFP text cited behind each one, so it can name the actual portal or certification, as Jake did
  3. A "Note for Peter/Marianne:" line, only when an RFP has a sensitive-industry flag.
  4. Sign-off: "Cheers," then "ISA".
- **Link:** the Drive folder. If there isn't one, the agency's own posting, then HigherGov. Never invented.
- **Current solution:** taken from the scorer. When the documents don't name one, write Jake's line: "RFP is silent on any incumbent — to be confirmed in Q&A."
- **Left out, as Jake did:** deadlines and questions for the agency. They went in his meeting brief, which we're not keeping.
- **Look:** plain, like a person's email. Simple HTML for paragraphs, the list and links only; no colors, tables, or footer.

### Who writes what

- **Code builds the facts for each RFP:**
  - title, source and link;
  - score;
  - current solution and objective;
  - the fit reason with the project name;
  - blockers, worst first, from the scorer's open gates, submission, competition and eligibility findings;
  - flags.
- **ISA writes only the sentences,** returned as JSON per RFP: hook, current solution and objective, why it fits, blockers.
- **Code assembles the email:** subject, titles, links, numbering and sign-off. So those can't be wrong.
- **Code checks ISA's sentences:**
  - every RFP appears once;
  - no links or file paths;
  - no internal codes such as "gate 6" or excerpt IDs;
  - numbers come only from the facts;
  - the length limits are met: 2 sentences, 1–2 sentences, and at most 3 blockers.

  If any check fails, code writes the sentences from the facts instead, and the results file records why.

### The Telegram message

- **After the email:**
  - "Sent this week's pursue email: <n> RFP(s)."
  - one line per RFP: short name in bold, score, biggest blocker (or "No blockers stood out."), and its Drive folder link;
  - "I looked at <total> RFPs this week."
- **No picks:** no email goes out, and the message says: "No RFPs worth pursuing this week, so no email went out. I looked at <total>; the closest was <name> at <score> (<why>)."
- **Email failed:** the message says the email didn't go out, lists the picks, and points Chris to the job log.
- **How it's written:** ISA writes the "sent" version in its own voice, checked like the email (links, numbers, wording, under 800 characters). The failed and no-picks versions are always code-built, because their wording matters more than the voice.
- **Removed:** the questions for the team and the biggest-skipped line.

### Records and safety

- **Results file** (`<date>.json`, `latest.json`): keeps every RFP as today. It adds `email: {status, subject, to, picks, writtenBy, reason, text, sentAt}` and `telegram: {status, source, reason, text}`. Email status is `sent`, `failed`, `none`, `preview` or `already-sent`. The Markdown copy stays; the `.html` report is no longer written.
- **One pursue email per week.** Before sending, the job reads `latest.json`. If a pursue email already went out in the same ISO week, nothing new is sent or posted. A failed send doesn't count, so a re-run retries it. This holds until the database (ISA-5) records runs properly.
- **Failures:** a failed email is reported in Telegram, and the run still succeeds. If that Telegram post also fails, the run exits with an error, so the cron wrapper's failure notice tries once more.
- **Preview mode** (`RFP_DELIVERY=preview`) sends nothing. It writes `<date>-email.html` and `<date>-telegram.md`.
- **Plain gate reasons:** when a subrule changes a gate, the policy stores a stock reason ("Gate N is unresolved or not met under its documented subrule…"). The report replaces it with a plain sentence, so it can't leak into the email, the message or the Markdown (issue 8 from October 9).

### Local testing

- `npm run rfp:preview -- <file> [--isa]` builds the email and the Telegram message into `.isa-local/preview/` and sends nothing.
  - **Input:** a results file, or `devtools/score-sample.mjs --entries` output for real RFPs. `devtools/fixtures/rfp-preview-week.json` is a synthetic week to try it on.
  - **Writer:** with `--isa`, ISA's model writes the words through the installed OpenClaw (on the VM, or a local install); otherwise the code version is shown.

## Acceptance

**Offline tests,** with synthetic fixtures:
- the picks rule;
- the subject never matches the mail sync's pattern;
- every part of the email appears in order, with links taken from the facts;
- Jake's "silent" line appears when there's no current solution;
- failed checks fall back to the code version;
- no picks: no email, and the no-picks Telegram message;
- email failure: Telegram says so;
- the once-a-week guard;
- preview sends nothing.

**Scorer:**
- the new `buyer` field is citation-checked like every other part of the judgment;
- points and decisions are unchanged (existing policy tests pass as they are).

**Other:**
- `npm test` and `npm run check` pass.
- Chris has reviewed emails from at least one real week (local preview, or preview mode on the VM) and is happy with them.
- Before switching it on: ISA-3 is deployed, and the re-check of Jake's July Strong Pursues passes.

## Out of scope

- Creating HubSpot deals for pursued RFPs. The mail sync's deal path stays off for these emails; that's a follow-up.
- No-bid emails and Jake's meeting brief (Chris, October 12).
- The database (ISA-5), splitting the weekly script, and the Monday jobs.
- Schedule or OpenClaw configuration changes.

## Constraints and risks

- **Nobody reviews the email before it reaches Peter.** Its accuracy rests on the ISA-3 scoring and the checks; the Telegram summary gives the team a same-day look.
- **The new scorer field could move scores slightly.** The July Strong Pursue re-check covers it.
- **ISA's sentences may fail the checks often.** The code version goes out, the reason is recorded, and we tune the prompt.
- **Recipients:** the email now goes to sales@, which the mail sync reads. The subject keeps the mail sync's deal path off. Ask Sam and Hugo what the newer "Mailsync" OpenClaw jobs do with ISA's mail.
- **Rollback:** restore the previous files from the deploy backup, and the old email and message return.

## Open questions

- Peter's email address, for `RFP_EMAIL_TO`.
- Whether `gog gmail send --to` accepts several addresses separated by commas. Check on the VM (`gog gmail send --help`) before release.

## References

- Jira ISA-6 (this work), ISA-3 (scoring, PR #11), ISA-5 (database).
- `workspace/skills/rfp-email-pursue-skill.md` (template and rules), and `rfp-email-nobid-skill.md` (not used).
- `workspace/scripts/rfp-report.mjs`, `weekly-rfp-pursue-decision.mjs`, `rfp-scoring-judgment.mjs`, `rfp-scoring-policy.mjs`, `run-new-rfp-qualification-cron.sh`.
- `workspace/scripts/daily-mail-hubspot-sync.mjs:66-67` (the pursue-email pattern).
- `devtools/score-sample.mjs` (read-only re-scorer for real test data).
- [October 6 spec](../2026-10-06__rfp-weekly-messages/spec.md): its email and Telegram sections are replaced by this one.
