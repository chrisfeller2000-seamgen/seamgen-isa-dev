# ISA task spec: weekly RFP update the sales team can act on

## Summary

The October 6 release made the Friday RFP job score with AI and fetch documents. What the sales team receives has not changed:
- a Telegram message with counts only;
- an email that lists every RFP as an identical "Manual review" card;
- some Fridays, a second run that says nothing was found.

This task changes what the job sends:
- **one run** each Friday;
- **a Telegram message** in ISA's own voice that:
  - says how many RFPs ISA went through;
  - names up to three worth a look;
  - turns each blocker into a question the team can answer;
  - names the biggest RFP being skipped when a partner could change the call;
- **an email** organized by decision;
- **a notice** when the run fails;
- **chat answers** that can find the week's results and respond to the team's replies.

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

**What the team asked for.** On September 30 someone asked ISA in the group: *"which RFPs from the latest batch are worth Seamgen pursuing this week? Give me up to three, ranked. For each, briefly explain what they need, why we're a fit, the budget if known, any requirements that could rule us out, and the next step. Include the proposal and questions deadlines. Link the documents you reviewed and flag anything unconfirmed. If you couldn't review the requirements, keep it as a lead to check rather than recommending we bid. It's fine if none are ready."* ISA's answer was right in substance, but on-demand, long, and full of server paths. This request is the starting point for the Friday message.

**Why blockers become questions.** The open gates in the October 5 tests are facts about Seamgen that someone on the team knows:
- utility-management experience;
- two similar projects in five years;
- a SOC 2 Type 2 audit.

The scorer can't settle them from company files; a teammate can in one reply.

## Decisions (Chris, October 6)

- **Tone.** The message should sound human-written: simple words, natural and casual, in ISA's voice ("warm, direct, commercially sharp", from `workspace/IDENTITY.md`). It must not sound robotic or generic.
- **ISA writes it.** ISA's model writes the Telegram message from facts the code prepares. A code template can only paste in the scorer's formal rubric sentences. Code checks every draft, and a plainer code-built version is sent if a check fails.
- **Message improvements accepted:**
  - turn each catch into a question for the team;
  - open with how many RFPs ISA went through;
  - name the biggest RFP being skipped when a partner could fix the reason;
  - bold titles and short "HigherGov listing" links.
- **Not now:**
  - a closing "reply here / ask me" line;
  - more email recipients.
- **Failure notice:** it names Chris.
- **The separate engineering test chat** is deferred.
- **Preview in the group.** ISA's draft for the six October 5 RFPs is posted in the sales group, opening with the line "Preview: here's how my new Friday RFP update will look, using RFPs from a test run. Not this week's results."
- **No full dry run** of the weekly job before release; Friday's run is the first full run of the new message.

## Desired behavior

### 1. One scheduled run

- Only the system crontab runs the weekly job.
- ISA's noon OpenClaw job is disabled; this is a scheduler change with separate approval.
- Nothing in ISA's instructions tells it to run the weekly job unless someone explicitly asks.

### 2. A failure notice

If the Friday run exits with an error, including before Node starts (for example a missing HigherGov key), the group gets one message: *"Heads up: this morning's RFP run didn't finish, so there's no RFP report today. Chris, the details are in the job log."*
- It never includes error text, keys or URLs.
- It is sent once per failed run.
- It respects `NO_TELEGRAM`.

### 3. The Friday Telegram message

**What it says, in order:**

1. **How many RFPs ISA went through, and the verdict.** For example: "I went through 148 new RFPs this week. 2 are worth a look, plus a long shot." The count is every unique RFP in this week's intake.
2. **Up to three ranked picks,** only from RFPs whose documents ISA read. Each pick has:
   - a bold title, the agency and state;
   - what they want, in one line;
   - **why us:** the closest Seamgen work, from the AI's case-study reason;
   - **a question for the team** for each open blocker (at most two), asked as a plain yes/no question about Seamgen, with the score if the answer is yes. For example: "Have we done utility management work, like moving a client off an old system? If yes, this scores 75, a strong pursue." An unconfirmed deadline is stated, not asked;
   - the proposal deadline in Pacific time with days left, and the budget, with estimates said to be estimates;
   - a "HigherGov listing" link.
3. **The biggest RFP being skipped,** in one line, when one qualifies (see Tiers). For example: "Biggest one I skipped: managed security for the U.S. Virgin Islands, about $750k–3.5M. It's 24/7 security operations, not software, so it's only worth it with a security partner."
4. **What wasn't a fit,** as counts by reason, and where the full list is: "Full list is in Marianne's email."

**When nothing qualifies,** the message says so plainly, with the count and the main reasons. For example: "Morning team. Nothing worth chasing this week. I went through 148 RFPs. Most were hardware or off-the-shelf products…"

**Voice:**
- simple words and short sentences, written by ISA in the first person ("I went through…");
- no rubric terms (gate numbers, "eligibility verification"), internal codes or file paths;
- ISA never adds facts about Seamgen, guesses at answers, or creates urgency.

**How it's produced:**
- **Code prepares the facts:** picks, scores, deadline text, budget text, links, counts and the skipped RFP.
- **ISA writes the draft:** its model writes the message from only those facts and the style rules, as one tools-free completion with the existing OpenClaw model access.
- **Code checks the draft before sending:**
  - every link, title, score, date, day count, budget and count matches the facts, in order;
  - there are no other links;
  - there are no paths, codes or gate numbers;
  - the only formatting is bold and links;
  - it is at most 3,000 characters (aim for about 2,000).
- **Fallback:** if the draft fails any check, or the model call fails or times out, the job sends a code-built version of the same facts. Friday's message always goes out.

**Formatting.** Bold titles and named links (`**title**`, `[HigherGov listing](url)`), which OpenClaw converts for Telegram; ISA's chat answers in this group already use both. Before release, the preview message in the group confirms that `openclaw message send` renders bold and links. If it doesn't, the message is sent as plain text with bare links. Link previews are a channel-wide OpenClaw setting and stay as they are.

**Template (approved by Chris, October 6).** ISA's version follows this structure and the facts, phrased naturally. The fallback follows it too; where it can't rephrase, it uses the source sentence as written. That means HigherGov's summary sentence instead of "They want …", and the scorer's reason after "Question for the team: can we meet this?". Placeholders are in `{braces}`; `**…**` is the Markdown sent for bold.

Friday update:

```text
Morning team! I went through {total} new RFPs this week. {verdict}

1. **{title}, {agency}**
They want {what they need}.
Why us: {closest Seamgen work, and how close it is}.
Question for the team: {yes/no question about Seamgen}? If yes, it scores {score if yes}.
Due {date} at {time} PT ({days} days). Budget {budget}.
[HigherGov listing]({link})

2. **{title}, {agency}**
…same as above…

3. Long shot: **{title}, {agency}**
…same as above…

Biggest one I skipped: {title}, about {budget}. {why it was skipped}, so it's only worth it with a partner.

{documents line}
The other {count} weren't a fit: {n} {reason}, {n} {reason}, and the rest are {smaller reasons}. Full list is in Marianne's email.
```

When nothing qualifies:

```text
Morning team. Nothing worth chasing this week.

I went through {total} RFPs. Most were {top reason} or {second reason}. {documents line}
```

The failure notice is the fixed text in section 2.

How each part varies:
- **{verdict}:**
  - "{n} are worth a look.";
  - "{n} are worth a look, plus a long shot.";
  - "1 is a strong pursue and {n} are worth a look."
- **Picks:** up to three, by rank score. "Long shot:" appears only for flagged picks (see Tiers).
- **Why us:** left out when the scorer gave no case-study reason.
- **Question for the team:**
  - one per open blocker, at most two;
  - "If yes, it scores {n}" appears only when there is a potential score, plus "a strong pursue" at 75+;
  - with no open questions, the line is "It scores {n}." (plus "a strong pursue" at 75+).
- **Due line:**
  - a verified deadline with a time: "Due Nov 2 at 2pm PT (27 days)";
  - a verified date with no time: "Due Nov 2 (27 days)";
  - a listing-only date: "I couldn't confirm the deadline (the listing says Oct 28)".
- **Budget:**
  - "about $250k–1.5M (HigherGov's guess)";
  - "$400k (from the RFP)";
  - "not listed".
- **Biggest one I skipped:** only when an RFP qualifies (see Tiers).
- **{documents line}:** only when some RFPs couldn't be checked: "{n} looked promising, but I couldn't get their documents to check the requirements." When some failed for another reason (scoring didn't finish, no deadline in the listing), it says "{n} I couldn't finish checking." It then points to Marianne's email: "in" it when there are picks, "at the top of" it when there are none.
- **More picks:** when more than three RFPs qualify: "{n} more are worth a look in Marianne's email."
- **Reasons:** the plain words in Tiers.

Sources:

| Placeholder | Source |
| --- | --- |
| {total}, counts and reasons | Counted by code from the week's results |
| {title}, {agency}, {link} | The HigherGov listing |
| {what they need} | HigherGov's summary of the RFP |
| Why us | The scorer's case-study reason |
| Question for the team | The scorer's unknown gates (2–6), asked as questions |
| {score if yes} | `potential_total`, the scorer's category points added up by code |
| {date}, {time}, {days} | The deadline found in the RFP documents, converted to Pacific time by code |
| {budget} | The RFP if it states one, otherwise HigherGov's estimate |

**Example.** The three picks are the real October 5 test results, with days left counted from October 6. The counts and the skipped RFP are illustrative. Bold and links are shown as they would render.

```text
Morning team! I went through 148 new RFPs this week. 2 are worth a look, plus a long shot.

1. Utility management software, State of Colorado
They want software to track and manage utility use across state buildings.
Why us: our ELEAF work is close (large water datasets in the cloud), but it isn't utility billing.
Question for the team: have we done utility management work, like moving a client off an old system? If yes, this scores 75, a strong pursue.
Due Nov 2 at 2pm PT (27 days). Budget about $250k–1.5M (HigherGov's guess).
HigherGov listing

2. Sex offender registry website, New Hampshire Dept. of Safety
They want to rebuild the public registry website.
Why us: it's a lot like the HCP portal we built (secure logins, admin roles, audit logs).
Question for the team: do we have 2 similar projects from the last 5 years, and can we meet NIST security controls? If yes, it scores 72.
Due Dec 16 at 11am PT (71 days). Budget about $250k–900k (HigherGov's guess).
HigherGov listing

3. Long shot: online giving platform, State of Idaho (for Idaho Public TV)
They want a platform for donations, including planned and non-cash gifts.
Question for the team: do we have a SOC 2 Type 2 audit? It's required, along with 3 recent similar projects. The budget might also be under our $100k minimum, and I couldn't confirm the deadline (the listing says Oct 28).
HigherGov listing

Biggest one I skipped: managed security for the U.S. Virgin Islands, about $750k–3.5M. It's 24/7 security operations, not software, so it's only worth it with a security partner.

The other 144 weren't a fit: 52 are buying existing products, 31 are hardware, 12 are due too soon, and the rest are smaller or off-target. Full list is in Marianne's email.
```

### 4. The Friday email

The email is built by code; it is the factual record, while the Telegram message is the note to the team.
- **Same recipient and subject.** The subject stays `New qualified RFP's for pursue decision - week N`, because ISA's mail-to-HubSpot job matches that subject when the email reaches `sales@`.
- **Sections in decision order:**
  1. Strong Pursue;
  2. Worth a look;
  3. Couldn't check yet;
  4. Screened out, as one line per RFP grouped by reason, not cards.
- **Every RFP links to its HigherGov listing,** plus the agency posting when known.
- **Deadlines are shown in Pacific time** with days left. A date taken only from the listing says so.
- **Fit and labels:**
  - "Why Seamgen fits" uses the AI's case-study reason, which removes the garbled text;
  - plain labels replace internal status codes.
- **Unchanged:** Strong Pursue rules (full-text 75+, no existing HubSpot RFP deal) and Drive folder creation.

### 5. One results file per run

The job saves `reports/new-rfp-qualification/<run date>.json` and `latest.json`, with one entry per RFP:
- tier and rank score;
- what they want;
- the fit reason;
- the open questions and the score if they are answered yes;
- deadline with time zone and days left;
- value and whether it is an estimate;
- public links;
- document status.

The file also records:
- the week's counts;
- the skipped RFP named in the message;
- the Telegram text that was sent;
- whether ISA's draft or the fallback was used, and why.

The email, the Telegram facts and the Markdown report all come from this file, and ISA's chat reads it.

### 6. ISA's chat instructions

A short RFP section in `workspace/AGENTS.md` says:
- **Where results are:** this week's results are in `latest.json` and the report; each RFP's file has the scoring detail.
- **Answering questions:** in the same voice as the Friday message — short, plain words, public links, estimates marked, no server paths.
- **Replies to Friday questions:** say what the answer means from the results file. For example: "Got it, that makes Colorado a 75, a strong pursue." Or: "Then it's a pass." Don't change any records.
- **Group chats:** at most one short acknowledgement before the answer.
- **The weekly job:** never run it unless someone explicitly asks.

## Tiers

Built from the existing scoring outcomes; no scoring rule changes.

| Tier | Includes | In the Telegram message |
| --- | --- | --- |
| Strong Pursue | Full-text Strong Pursue and not already in HubSpot | Picked first |
| Worth a look | Full-text Worth a look, Needs review, Deadline needs review, or Conditional — Ask the Agency, with a rank score of 50+ | Picked by rank score |
| Couldn't check yet | Preliminary 50+ whose documents could not be fetched or read; scoring that didn't finish; a listing with no deadline; or one that needs an agency answer first | Counted |
| Screened out | Every No-bid, preliminary below 50, Not an open bid, Watch item, too little listing detail, already in HubSpot | Counted by reason; may be the skipped RFP |

**Rank score:**
- the full-text total when there is one;
- otherwise the potential total, which is the sum of the AI's category points when they were scored;
- otherwise the preliminary score. This happens for Deadline needs review, which stops before category scoring.

**Long shot.** A pick is flagged as a long shot when any of these is true, and ISA may only use the words "long shot" for a flagged pick:
- its rank score is the preliminary score;
- it has two or more open questions;
- the low end of its budget is under $100,000.

**The skipped RFP.** The largest screened-out RFP whose deciding reason is Gate 2 (buying a product) or Gate 6 (eligibility), with a high-end value of at least $500,000. It is omitted when none qualifies. Peter asked that product-shaped RFPs be treated as a teaming question rather than an automatic No-bid (feedback log, July 26), so this is the exclusion most worth a second look.

**Plain words for screened-out reasons.** For Jake's gates:
- Gate 1: due too soon or passed;
- Gate 2: buying an existing product;
- Gate 3: hardware or equipment;
- Gate 4: can't be submitted;
- Gate 5: under $100k;
- Gate 6: eligibility we can't meet.

The remaining reasons are:
- weak fit (score under 50);
- not an open bid;
- pre-solicitation (watch);
- too little listing detail;
- already in HubSpot.

Picks, extra picks, couldn't-check-yet and screened-out RFPs add up to the count in the first line.

## Acceptance

- [ ] The noon OpenClaw job is disabled after approval, and the cron wrapper is the only scheduler of the weekly job.
- [ ] A failed run, including a wrapper-level failure, sends exactly one failure notice naming Chris; a `NO_TELEGRAM` run sends none.
- [ ] Telegram message:
  - opens with the count of RFPs gone through;
  - lists at most three picks, all from full-text results, in rank order;
  - asks each open blocker as a question with the score if yes;
  - names the skipped RFP only when one qualifies;
  - says plainly when nothing is ready.
- [ ] The draft checks reject a changed number, date, budget, title or link; an extra link; a missing pick; a path, code or gate number; unsupported formatting; and more than 3,000 characters. Each rejection sends the fallback, and the results file records why.
- [ ] A failed or timed-out model call sends the fallback, and Friday's message is never skipped because of the writer.
- [ ] Bold titles and named links render correctly in the group preview; otherwise the message is sent as plain text.
- [ ] No message, email or results file contains a server path, an excerpt ID, an internal status code, or a signed document URL.
- [ ] Deadlines show Pacific time and days left, and a listing-only date is marked unconfirmed.
- [ ] The email subject and recipient are unchanged; screened-out RFPs appear as grouped lines, not cards.
- [ ] "Why Seamgen fits" never joins gate sentences; a regression test covers the October 6 garbled output.
- [ ] Scoring results are unchanged for the same inputs.
- [ ] `npm test` and `npm run check` pass, and new tests use synthetic fixtures only.
- [ ] Before release, Chris reviews the fallback version and ISA's draft for the six October 5 RFPs. The draft is posted in the sales group, labeled as a preview.

## Out of scope

- **Questions deadlines and mandatory pre-bid meetings.** The deadline module deliberately ignores them, so the message shows the proposal deadline only. Extracting them needs a scorer change and a retest; it is the next follow-up.
- **Later message ideas:**
  - reminders for last week's picks;
  - flagging agencies Seamgen already knows from HubSpot;
  - running twice a week;
  - a closing "reply here" line;
  - more email recipients.
- **The separate test chat for engineering work.** Deferred by Chris on October 6.
- **Other work:** splitting the rest of the weekly script, the run speed-up, merging the full-text-only script, trimming Jake's rubric files, and the comparison with Jake's 557 scored RFPs.
- **Changes to scoring rules, thresholds, recipients, HubSpot or Drive behavior.**

## Constraints and risks

- **ISA could misstate a fact when writing.**
  - The writer sees only the prepared facts, never the documents.
  - The checks compare every link, number, date and budget with those facts.
  - The fallback covers any failure.

  Wording in between (for example "it's a lot like the HCP portal") is not machine-checked. The preview review and the first Fridays are when Chris confirms it stays faithful.
- **Cost and time:** the writer adds one model call per run, about 1–2 cents and up to a few minutes.
- **Mail-to-HubSpot dependency.** ISA's mail job turns emails from ISA with this subject into HubSpot RFP deals if they reach `sales@`. Keep the subject, and do not add `sales@` without changing that job.
- **There is no test chat yet.** The one preview goes to the sales group with a clear preview label. Friday's message is the first real one.
- **Group-chat behavior** after the instruction change can only be confirmed on the next real use in the group.
- **Real RFP results are runtime data.** They stay in ignored `.isa-local/` for previews; Git fixtures are invented.
- **Disabling the noon job** is reversible (`openclaw cron enable`) and needs its own approval and a heads-up to Sam and Hugo.

## References

- `workspace/scripts/weekly-rfp-pursue-decision.mjs`: report and Telegram builders, the main loop's review entries, and the score adapter.
- `workspace/scripts/rfp-scoring-policy.mjs` (outcomes and totals), `workspace/scripts/rfp-deadline.mjs` (deadline fields), and `workspace/scripts/rfp-scoring-judgment.mjs` (the tools-free OpenClaw completion).
- `workspace/scripts/run-new-rfp-qualification-cron.sh`: the scheduled entry point.
- `workspace/scripts/daily-mail-hubspot-sync.mjs`: `RFP_PURSUE_SUBJECT_PATTERN`.
- `workspace/IDENTITY.md` and `workspace/SOUL.md`: ISA's voice.
- [Scoring alignment record](../2026-09-30__jake-scoring-alignment-minimal/implementation.md) (October 6 release) and [needs-documents spec](../2026-10-05__rfp-needs-documents/spec.md).
