---
name: rfp-calendar-logging
purpose: Give an RFP's action-item deadlines (questions due, pre-proposal conference with a register-by alert, proposal due) as a short list in chat with an "Add to Google Calendar" link for each, read from the RFP's own documents, so the person who asked can add them to their own calendar.
audience: ISA, who reads the dates and runs scripts/rfp-dates.mjs, and a teammate who edits this file.
version: 2.1 — November 2026
owner: Seamgen sales team (no single owner or approver)
depends_on: the RFP's saved documents (read through the router's `documents`), scripts/rfp-dates.mjs, and the RFP's key-dates note, which that script writes.
label: Key dates as calendar events
command: dates
phase: 2
when: An RFP's key dates (questions due, pre-proposal meeting, proposal due) with links to add them to your calendar.
asks: calendar | on the calendar | on my calendar | calendar dates | calendar events | calendar invites | calendar invite | calendar file | ics | ics file | invites | add the dates | put the dates | add to my calendar | add them to my calendar | reminders | set reminders | remind me of the deadlines | remind me about the dates | schedule the deadlines | deadlines on the calendar | dates on the calendar
---

# RFP calendar dates

## What this skill does

ISA reads one RFP's dates from its documents and passes them, exactly as printed, to
`scripts/rfp-dates.mjs`. The script does the arithmetic: weekdays, the agency's real time zone,
the register-by date, the suggested reminders, what has already passed and what moved since last
time. It writes the RFP's key-dates note and prints a short list with an "Add to Google Calendar"
link on each date. ISA sends that list; the person taps a link and saves the event in their own
calendar.

**ISA never creates, changes or deletes calendar events.** The person adds them from the links.
So "put the dates on my calendar" is never a reason to say you can't: the links are how it gets
done. Always finish with the script's text, never with your own list of the dates.

The question "when is it due?" is not this skill. The router answers it from the key-dates note
or the documents. This skill is for "put the dates on my calendar" or `rfp dates <rfp>`.

## Which RFPs

Any RFP whose own documents are saved, in any phase. The router has already asked about moving
an RFP in Phase 1 to Phase 2; if the person said to leave it where it is, do the skill anyway.

What matters is where a date comes from, not the RFP's folder. **Use only dates printed in the
agency's documents.** Never use a date from the HigherGov listing, the Friday email or the
scoring metadata: those are often wrong (no times, wrong due dates, no Q&A dates). If the router's
`documents` says `saved: 0`, follow `skills/rfp/document-fetch/instructions.md` first.

## Steps

### 1. Read the dates

Read the documents with the commands in the router's `documents`, by number:
`node scripts/document-text.mjs --rfp <slug> --file all` (or `--file <n>` for one). Look at the
schedule or "Instructions to Proposers" section, and at every addendum: an addendum's date
replaces the original's. If a key-dates note is already there, `node scripts/rfp-dates.mjs --rfp
<slug> --show` prints what was given last time.

For each date, note:
- the date and time **exactly as printed**, with the weekday if the document gives one (the
  script checks that the weekday matches the date);
- the time zone as printed ("PT", "EST", "Central Time"). If the documents give a time with no
  zone, use the agency's location: Eastern `America/New_York`, Central `America/Chicago`,
  Mountain `America/Denver`, Arizona `America/Phoenix`, Pacific `America/Los_Angeles`;
- where it is: `file <n>, page <p>` (pages come from the `--- page N ---` lines);
- for a pre-proposal conference: whether it's mandatory, the sign-up link and the sign-up deadline,
  if the documents give them. Never guess a link.

Also note the RFP number, the agency, the contact for questions, how the proposal is submitted,
and where the RFP was found (HigherGov, PlanetBids…). Leave out any of these the documents don't
give; never write "not stated" or "unknown" in a field.

### 2. Run the script

Pass everything on standard input, through a quoted heredoc. Never put agency text on the command
line: it can contain characters the shell would run.

```
node scripts/rfp-dates.mjs --rfp <slug> <<'RFP_DATES_END'
{
  "name": "Laguna Beach Website Redesign",
  "agency": "City of Laguna Beach",
  "number": "RFP 2026-31",
  "contact": "Jane Doe, jdoe@lagunabeachcity.net",
  "submission": "Upload to PlanetBids",
  "foundVia": "PlanetBids",
  "zone": "PT",
  "milestones": [
    { "kind": "questions", "date": "December 11, 2026", "time": "5:00 PM", "source": "file 2, page 3" },
    { "kind": "conference", "date": "Thursday, December 3, 2026", "time": "10:00 a.m.", "mandatory": true,
      "registration": "https://…", "registerBy": "December 1, 2026", "source": "file 2, page 3" },
    { "kind": "proposal", "date": "January 21, 2027", "time": "2:00 PM", "source": "file 1, page 1 (Addendum 1)" }
  ],
  "notScheduled": [
    { "milestone": "Interviews", "why": "only \"week of February 8, 2027\"", "source": "file 2, page 4" }
  ]
}
RFP_DATES_END
```

- `kind` is `questions`, `conference`, `proposal`, or `other` with a `label` for another date
  someone must act on (an intent-to-bid deadline, a mandatory site visit). Leave out what the RFP
  doesn't have. The script adds the register-by event itself when a conference has a sign-up link
  or deadline.
- `zone` at the top is the agency's zone; a milestone's own `zone` overrides it.
- A date with no time is fine: it becomes an all-day event.
- **A date that isn't a real date goes in `notScheduled`, not `milestones`**: "TBD", "week of
  …", "within 5 days of award", "September 2026". The person sees it without a fake event.
- `note` on a milestone adds a few words to its event title, for example
  `"note": "email LADBS.Contracts@lacity.org"`.

### 3. Send what it prints

The script prints the text to send between two `-----` lines. Send it word for word, including
each `[Add to Google Calendar](…)` link exactly as printed: the link holds the event's title,
time and details, and a changed character can break it. Don't retype the dates or work out
weekdays yourself: the script's are checked. Never mention the key-dates note's path in the chat.

There is no calendar file to attach. OpenClaw won't attach a `.ics` file to a reply, so don't
make one or offer one.

If the script lists something under "Needs your action" or "Not scheduled" (a weekday that
doesn't match its date, a missing sign-up link, an unreadable time), it is already in the text.
Don't add a date to fix it; say what you'd need to confirm it.

If the script fails (for example, the RFP has no folder), pass on its reason and stop.

## What the events are

The script makes at most these, each titled `[RFP] <name> — …` so one notification names the RFP:

| Event | When | Suggested reminders |
|---|---|---|
| Questions due | the deadline | 3 days, 1 day before |
| Pre-proposal conference (or MANDATORY conference) | the conference | 4 days, 1 day before |
| REGISTER for conference by m/d | all day on the sign-up deadline (or the day before the conference) | 4 days, 1 day before |
| Proposal DUE | the deadline | 2 weeks, 1 week, 2 days before |

Each event's details have the RFP number, agency, contact, submission method, sign-up link, and
the document and page. Timed events are set at the right moment in the agency's own time zone,
with daylight time worked out, wherever the person is. A link can't set reminders, so the event
gets the person's default Google Calendar notification; the text lists the suggested ones. A date
that has passed is listed without a link.

## When a date moves

When new documents move a date, `skills/rfp/document-refresh/instructions.md` says to run this
skill again. The script compares with the dates it gave last time and
lists what changed, old → new. The moved date gets a new link, and the text tells the person to
delete the event they added for the old date. A date that was given
before and is no longer in the documents is listed as one to remove.

## The key-dates note

`key-dates_<slug>.md` in the RFP's folder is the RFP's one list of dates. The script writes the
part between its `key-dates` markers: a table with the source of each date, earlier dates kept as
"was:", and its record of what it gave. Anything else in the note (an older hand-written table)
is left alone. Don't edit the marked part by hand; run the script again with the corrected dates.
The agency questions skill reads its questions deadline from this note too. The note stays on
ISA's disk; it doesn't go to Drive.

## Guardrails

- Only dates printed in the agency's documents. Never invent a date, time or link.
- Never write to a calendar, or say an event was added. The person adds it from the links.
- Never answer a calendar request with the dates alone. Run the script and send its text.
- Never work out a weekday, time-zone change or reminder date yourself; the script does.

## Notes and edit history

**v2.1 — November 2026.** Google Calendar links replace the calendar file. OpenClaw (2026.9.4,
and 2026.9.9 on the VM) checks the type of a file attached to a reply and refuses
`text/calendar`, so the `.ics` file would never have reached Telegram; the reply would have gone
out with a "couldn't attach" note. The script no longer writes the file. Each upcoming date now
has an "Add to Google Calendar" link that opens the event filled in. A link can't set reminders,
so the text lists the suggested ones and the person's default notification applies. In one local
run ISA opened this skill, read the dates, then said it couldn't add calendar events and sent a
plain list; the skill now says a calendar request always ends with the script's text.

**v2.0 — November 2026.** Rewritten so ISA can run it reliably. **(1) Any phase with saved
documents.** v1.2 refused every RFP in Phase 1, which contradicted the router's "leave it where it
is" choice; the real risk was HigherGov metadata dates, and the rule now says that directly.
**(2) The date arithmetic moved into `scripts/rfp-dates.mjs`**: weekdays, printed "EST" in summer,
the register-by date, reminders, passed dates and changes since last time. Local tests had the
model work these out. **(3) A calendar file.** The script writes an `.ics` file ISA attaches, so
adding the events is one tap instead of typing four events. ISA still never writes to a calendar.
**(4) Documents are read by number** through the router's `documents`. The retired meeting brief
is no longer a source. **(5) Questions about dates are answered by the router**, not this skill.
The register-by event now sits on the sign-up deadline itself, with 4-day and 1-day reminders,
instead of 4 days before it with more reminders on top. Titles, the four events, reminder
offsets, agency time zones and the never-invent rule are unchanged.

**v1.2 — November 2026.** The move to Looking closer became the trigger (moves happen only when
someone asks).

**v1.1 — November 2026.** Jake left Seamgen. ISA stopped writing calendar events and gave them as
text in chat; the key-dates note recorded the dates last given.

**v1.0 — July 2026, Jake + Claude.** First version: the four action-item events, `[RFP]` titles,
tiered reminders, agency time zones, and the key-dates note as the skill's own record.

**How to edit this skill:** Change the text. It's Markdown. Bump the version and add a note
saying what changed and why. The header's `asks` list is what the router matches requests
against; run `npm run rfp:index` after changing the header.
