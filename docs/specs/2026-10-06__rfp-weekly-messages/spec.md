# ISA task spec: weekly RFP update the sales team can act on

## Summary

The October 6 release made the Friday RFP job score with AI and fetch documents. What the sales team receives has not changed:
- a Telegram message with counts only;
- an email that lists every RFP as an identical "Manual review" card;
- some Fridays, a second run that says nothing was found.

This task changes what the job sends:
- one run;
- a Telegram message naming up to three RFPs worth acting on;
- an email organized by decision;
- a notice when the run fails;
- chat answers that can find the week's results.

Scoring rules and decisions do not change.

## Problem and evidence

Checked read-only on the VM on October 6, from the Friday job's log, report files, and the team group's history.

- **The Telegram message names no RFP.** The weekly script sends a fixed template, for example: *"Weekly RFP job 2026-10-02: 231 records scanned across 4 days; 155 candidates passed intake; 76 records filtered out. 0 RFPs qualified for the digest. 153 candidates sent to manual review. Mail sent to [recipient]."* The log shows it was sent on September 18, September 25 and October 2.
- **A second scheduled run undoes the first.**
  - The system crontab runs the job at 12:00 UTC (5am Pacific).
  - ISA's OpenClaw job "New RFP qualification" (`88d67daa-5c31-4383-aadb-ca9b846a98ae`) runs at noon Pacific as an agent turn. It re-ran the whole job on September 18 and 25, found nothing new, and sent Marianne a second email and the group a second summary, both saying zero.
  - On September 25 the re-run also overwrote that morning's report: the logged 110-RFP run became a 0/0 file stamped 19:00 UTC.
  - On October 2 it replied `NO_REPLY` and did not re-run, so the behavior varies by week.
- **The email is a wall of cards.**
  - October 2: 6,300 words, 0 recommended, and 153 red "Manual review" cards that look the same whether the RFP is a No-bid or worth a look.
  - Cards show internal codes (`preliminary-below-threshold`, `metadata-only`) and have no link to the listing.
  - A full-text "Worth a look" shows only "Final score N is below the pursue threshold."
- **"Why Seamgen fits" is garbled for AI results.** `buildWhyItFitsNarrative()` was written for the keyword scorer's short labels. Given the AI's gate sentences for a real RFP, it produces: *"Seamgen matches the ask with official proposal submission deadline verified. and the rfp allows a custom-developed solution …; Insufficient evidence; Official proposal submission deadline verified.; …"* No tested RFP has reached Strong Pursue, and Friday is the first production run, so nobody has seen this yet.
- **Failures are silent.** Earlier September runs died on a missing HigherGov key; nobody was told until someone read the log.
- **ISA's chat can't find the week's results.** Its runtime instructions (`workspace/AGENTS.md`) have no pointer to the RFP reports. In the group, ISA also:
  - narrates its work, usually 3–6 "I'm checking…" messages before an answer;
  - sometimes answers in over 10,000 characters;
  - includes server paths (`/home/azureuser/...`, `/tmp/...`) and internal codes.

**What the team asked for.** On September 30 someone asked ISA in the group: *"which RFPs from the latest batch are worth Seamgen pursuing this week? Give me up to three, ranked. For each, briefly explain what they need, why we're a fit, the budget if known, any requirements that could rule us out, and the next step. Include the proposal and questions deadlines. Link the documents you reviewed and flag anything unconfirmed. If you couldn't review the requirements, keep it as a lead to check rather than recommending we bid. It's fine if none are ready."* ISA's answer was right in substance, but on-demand, long, and full of server paths. This request is the specification for the Friday message.

## Desired behavior

### 1. One scheduled run

- Only the system crontab runs the weekly job.
- ISA's noon OpenClaw job is disabled; this is a scheduler change with separate approval.
- Nothing in ISA's instructions tells it to run the weekly job unless someone explicitly asks.

### 2. A failure notice

If the Friday run exits with an error, including before Node starts (for example a missing HigherGov key), the group gets one plain message. For example: *"This week's RFP run didn't finish, so there's no RFP report today. The error is in the job log."*
- It never includes error text, keys or URLs.
- It is sent once per failed run.
- It respects `NO_TELEGRAM`.

### 3. The Friday Telegram message

- **Up to three RFPs, ranked.** Each has:
  - what they need;
  - why Seamgen fits;
  - anything that could rule us out, or the open question;
  - the proposal deadline;
  - the value;
  - the next step;
  - one public link.
- **Nothing recommended when nothing qualifies.** The message says so.
- **Recommendations come only from RFPs whose documents ISA read.** RFPs scored from the listing alone are counted as "need documents", never ranked. This keeps the September 30 rule and the evidence gate.
- **One footer line** with the counts of RFPs that need documents and that were screened out, by reason, plus a pointer to the email.
- **Format:**
  - plain text with line breaks; no Markdown, because `openclaw message send` has no formatting option;
  - about 1,500 characters at most, well under Telegram's 4,096 limit.

Example (illustrative values):

```text
RFPs this week (Oct 9): 2 worth a look

1. Utility-management software — State Office of Sustainability
Need: hosted software to track utility use, with data migration and training.
Fit: our data-platform work is close; utility-specific experience is the gap.
Open question: do we have utility-management experience? Scores 75 if yes.
Due: Nov 3, 2:00 pm PT (5:00 pm ET), 28 days left
Value: $250k–$1.5M (HigherGov estimate)
Next: confirm the experience question, then decide.
https://www.highergov.com/...

2. …

Also: 1 needs documents · 140 screened out (41 buying a product, 22 hardware, 8 deadline too close, 7 under $100k). Full list in Marianne's email.
```

### 4. The Friday email

- **Same recipient and subject.** The subject stays `New qualified RFP's for pursue decision - week N`, because ISA's mail-to-HubSpot job matches that subject when the email reaches `sales@`.
- **Sections in decision order:**
  1. Strong Pursue;
  2. Worth a look;
  3. Needs documents;
  4. Screened out, as one line per RFP grouped by reason, not cards.
- **Every RFP links to its HigherGov listing,** plus the agency posting when known.
- **Deadlines are shown in Pacific time** with days left. A date taken only from the listing says so.
- **Fit and labels:**
  - "Why Seamgen fits" uses the AI's case-study reason, which removes the garbled text;
  - plain labels replace internal status codes.
- **Unchanged:** Strong Pursue rules (full-text 75+, no existing HubSpot RFP deal) and Drive folder creation.

### 5. One results file per run

The job saves `reports/new-rfp-qualification/<run date>.json` and `latest.json`, with one entry per RFP:
- tier;
- score, or the potential score when one question is open;
- what they need, the fit reason and the open question;
- deadline with time zone and days left;
- value and whether it is an estimate;
- public links;
- document status;
- next step.

The email, Telegram message and Markdown report are all rendered from this file, and ISA's chat reads it.

### 6. ISA's chat instructions

A short RFP section in `workspace/AGENTS.md` says:
- **Where results are:** this week's results are in `latest.json` and the report; each RFP's file has the scoring detail.
- **How to answer:** in the September 30 style, short, with public links, plain words, no server paths, and estimates marked as estimates.
- **Group chats:** at most one short acknowledgement before the answer.
- **The weekly job:** never run it unless someone explicitly asks.

## Tiers

Built from the existing scoring outcomes; no scoring rule changes.

| Tier | Includes | Ranked in Telegram |
| --- | --- | --- |
| Strong Pursue | Full-text Strong Pursue and not already in HubSpot | Yes, first |
| Worth a look | Full-text Worth a look; full-text Needs review, Deadline needs review, or Conditional — Ask the Agency with a potential score of 50+ | Yes, by score |
| Needs documents | Preliminary 50+ whose documents could not be fetched or read | No, counted |
| Screened out | Every No-bid, preliminary below 50, Not an open bid, Watch item, too little listing detail, already in HubSpot | No, counted by reason |

Screened-out reasons use plain words for Jake's gates:
- Gate 1: deadline too close or passed;
- Gate 2: buying a product, not custom software;
- Gate 3: hardware, goods or equipment;
- Gate 4: can't be submitted;
- Gate 5: under $100k;
- Gate 6: eligibility we can't meet.

The remaining reasons are:
- score under 50;
- not an open bid;
- pre-solicitation (watch);
- too little listing detail;
- already in HubSpot.

## Acceptance

- [ ] The noon OpenClaw job is disabled after approval, and the cron wrapper is the only scheduler of the weekly job.
- [ ] A failed run, including a wrapper-level failure, sends exactly one failure notice; a `NO_TELEGRAM` run sends none.
- [ ] Telegram text:
  - lists at most three RFPs, all from full-text results;
  - says nothing is ready when none qualify;
  - stays at or under 1,500 characters.
- [ ] No message, email or results file contains a server path, an excerpt ID, an internal status code, or a signed document URL.
- [ ] Every listed RFP has its HigherGov link.
- [ ] Deadlines show Pacific time and days left, and a listing-only date is marked unconfirmed.
- [ ] The email subject and recipient are unchanged; screened-out RFPs appear as grouped lines, not cards.
- [ ] "Why Seamgen fits" never joins gate sentences; a regression test covers the October 6 garbled output.
- [ ] Scoring results are unchanged for the same inputs.
- [ ] `npm test` and `npm run check` pass, and new tests use synthetic fixtures only.
- [ ] A local preview built from the six October 5 real results is reviewed by Chris before release.

## Out of scope

- **Getting the questions deadline.** The deadline module deliberately ignores question dates, and nothing extracts them yet, so the message shows the proposal deadline only. This is a follow-up.
- **The separate test chat for engineering work.** Deferred by Chris on October 6.
- **Other work:** splitting the rest of the weekly script, the run speed-up, merging the full-text-only script, trimming Jake's rubric files, the comparison with Jake's 557 scored RFPs, and new RFP features.
- **Changes to scoring rules, thresholds, recipients, HubSpot or Drive behavior.**

## Constraints and risks

- **Mail-to-HubSpot dependency.** ISA's mail job turns emails from ISA with this subject into HubSpot RFP deals if they reach `sales@`. Keep the subject, and do not add `sales@` without changing that job.
- **Telegram tests can't be sent anywhere safe.** There is no separate test chat yet. Verify the message from preview files, not by sending; the first live message is Friday's.
- **Group-chat behavior** after the instruction change can only be confirmed on the next real use in the group.
- **Real RFP results are runtime data.** They stay in ignored `.isa-local/` for previews; Git fixtures are invented.
- **Disabling the noon job** is reversible (`openclaw cron enable`) and needs its own approval and a heads-up to Sam and Hugo.

## References

- `workspace/scripts/weekly-rfp-pursue-decision.mjs`: report and Telegram builders, the main loop's review entries, and the score adapter.
- `workspace/scripts/rfp-scoring-policy.mjs` (outcomes and totals) and `workspace/scripts/rfp-deadline.mjs` (deadline fields).
- `workspace/scripts/run-new-rfp-qualification-cron.sh`: the scheduled entry point.
- `workspace/scripts/daily-mail-hubspot-sync.mjs`: `RFP_PURSUE_SUBJECT_PATTERN`.
- [Scoring alignment record](../2026-09-30__jake-scoring-alignment-minimal/implementation.md) (October 6 release) and [needs-documents spec](../2026-10-05__rfp-needs-documents/spec.md).
