# Implementation record: RFP calendar dates

## Why

The calendar skill (`workspace/skills/rfp/calendar-dates/instructions.md`, v1.2) didn't fit how ISA works now:

- **It refused every Phase 1 RFP**, while the router runs a skill in place when the person says to leave the RFP where it is. One of three local runs refused. The real risk was HigherGov metadata dates, not the folder.
- **It left the date arithmetic to the model:** weekdays, a printed "EST" in summer, the register-by date, reminders, passed dates. These are the errors a model makes most, and nothing checked them.
- **It didn't say how to read the documents.** It didn't use the router's numbered `documents`, it named the retired meeting brief as a source, and it cited rules ISA can't look up ("Rule 2", "the metadata memory").
- **It gave each event as text** for the person to type into a calendar.
- **Date questions became a move prompt.** "Is there a pre-bid meeting for Chandler?" matched the skill's `asks` and got a "move it to Phase 2 first?" question back. "What are the key dates for Yonkers" ran the whole skill.
- **The agency questions skill worked out the questions deadline separately**, so the two skills could disagree.

The user asked for 1–5 of the proposed changes, with an `.ics` attachment.

## What changed

- **`workspace/scripts/rfp-dates.mjs` (new).** ISA passes the dates exactly as printed, as JSON on standard input through a quoted heredoc. The script does the rest:
  - **Reading what ISA passes:**
    - It resolves printed US zones to the agency's real zone and notes a standard/daylight mismatch. A printed "MST" in summer asks whether the agency is in Arizona.
    - It checks a printed weekday against the date.
    - It reads numeric dates month first.
    - Fuzzy dates, unreadable times and missing zones go to "Not scheduled". A date with no time becomes an all-day event.
    - It drops filler values such as "Not stated", which ISA wrote in a local test.
  - **What it works out:**
    - the register-by event, on the sign-up deadline or the day before the conference;
    - reminders still ahead: proposal 14/7/2 days, conference and register 4/1, questions and other dates 3/1;
    - what has passed.
  - **Changes since the last run.** It compares each date with the one it gave last time and lists it as moved (old → new), removed, or unconfirmed.
  - **Files.** It writes `key-dates_<slug>.md` and `key-dates_<slug>.ics` in the RFP folder:
    - The note's marked part is replaced on each run; an older hand-written note is kept above it.
    - The `.ics` file has UTC times, folding at 75 octets, CRLF line endings and escaped text. UIDs include the date, so a moved date imports as a new event.
  - **Other modes.** `--show` prints the recorded dates with `daysLeft`; `--merge` updates some dates and keeps the rest.
  - **What it prints.** The text to send, then a `MEDIA:` line. OpenClaw attaches a local file when a final reply has that line on its own (`docs/reference/rich-output-protocol.md` in OpenClaw).
- **Router (`rfp-route.mjs`).**
  - A date question with no skill asked for is `answer` with `about: "dates"`.
  - Every `answer` carries `dates` from the key-dates note, or `null`.
  - "Send me a calendar file" no longer counts as sharing an agency document.
  - The calendar skill's `asks` now holds calendar requests only.
  - "Questions deadline" left the agency questions skill's `asks`.
- **Skills.**
  - **calendar-dates v2.0:**
    - It works in any phase once the agency documents are saved, and never uses metadata dates.
    - It reads the documents by number and builds the script's input.
    - It sends the script's text and `MEDIA:` line.
  - **agency-questions v1.7:** it takes the deadline from `--show`, or records the one it found with `--merge`.
  - **document-refresh v2.1:** it offers `rfp dates` when a date moved, instead of hand-editing the note.
  - **document-fetch v1.14:** it offers the calendar dates instead of running them.
  - **`INDEX.md`:** gained "An RFP's dates".
- **`workspace/AGENTS.md`.** One sentence: an RFP named only by its agency or city still counts as an RFP message. In local tests "Can you put the Laguna Beach dates on my calendar?" never reached the router (0 of 6), because nothing in it says "RFP". After the change it did 5 of 5.

## Tests

- `devtools/rfp-dates.test.mjs` has 11 tests. They cover:
  - zone, time and date reading, including a wrong weekday;
  - the event plan and the "EST in July" case;
  - filler fields;
  - "Not scheduled" dates;
  - the note and `.ics` format;
  - a re-run with a moved and a removed date;
  - `--merge` with a hand-written note;
  - the router's date answers;
  - standard input with shell characters;
  - an RFP with no folder.
- `devtools/fixtures/rfp-route-phrases.json` gained nine phrasings: date questions that must be answers, and calendar requests (including "send me a calendar file").
- `npm test` and `npm run check` pass.

### Local ISA (gpt-5.4-mini, test folder, November 18, 2026)

| Request | Result |
| --- | --- |
| "Is there a pre-bid meeting for Laguna Beach?" | 1/1: router, read the documents, said none is listed. No move question. |
| "Can you put the Laguna Beach dates on my calendar?" (after the `AGENTS.md` line) | 5/5 ran the router. 4/5 then followed the skill end to end: read the documents, used the addendum's January 21 date over January 14, ran the script and sent its text with the `MEDIA:` line, which the local CLI showed as an attachment. 1/5 answered the dates in text without the skill. |
| "When are questions due for Laguna Beach?" (note present) | 1/1 answered from `dates`: "Fri Dec 11, 2026 at 5:00 PM PT". |
| "Can you write the agency questions for Laguna Beach?" | 2/2 ran `--show` and gave the same deadline as the calendar, with "23 days left". |
| "add the Carlsbad parks booking dates to my calendar" | 0/4 reached the router (3 before the `AGENTS.md` line, 1 after): "parks booking" reads as a booking, not an RFP. In the group, the Friday message gives the context; `rfp dates <rfp>` always works. |

## Follow-up: Google Calendar links instead of the `.ics` file (November 19, 2026)

The `.ics` attachment above would not have reached Telegram. Before release, OpenClaw's code was checked for what happens to a `MEDIA:` file that isn't an image:

- **Telegram would take it.** OpenClaw's Telegram sender sends any non-image, non-audio, non-video file as a document.
- **OpenClaw refuses it first.** A reply's local file passes a type check (`assertHostReadMediaAllowed`). Its list, `HOST_READ_ALLOWED_DOCUMENT_MIMES`, allows PDF, Office files, archives, CSV, Markdown, plain text, JSON and YAML, plus images, audio and video. An `.ics` file is detected as `text/calendar` from its contents, so renaming it doesn't help.
- **Shown on OpenClaw's own loader.** Run against a sample file with the options a reply uses, `loadWebMedia` refused the `.ics` ("Host-local media sends only allow … (got text/calendar)") and accepted a `.md` file. Without the reply's host reader it accepted both, which is why the local CLI test above showed an attachment.
- **The VM's version has the same check.** The `openclaw@2026.9.9` package from npm has the same list. A refused file is dropped, and the reply goes out with a note that it couldn't be attached.

The user chose Google Calendar links over a zipped file or sending to Telegram outside OpenClaw. What changed:

- **`rfp-dates.mjs`.** It no longer writes the `.ics` file or prints a `MEDIA:` line. `googleCalendarLink()` builds a `calendar.google.com/calendar/render?action=TEMPLATE` link for each upcoming event, carrying:
  - the title, as before;
  - the times in UTC, with `ctz` set to the agency's zone; an all-day event ends the next day;
  - the details: RFP number, agency, contact, submission method, sign-up link and source.

  Each date in the text ends with `[Add to Google Calendar](…)`. Parentheses and asterisks in the link are percent-encoded, so a title like "(Phase 2)" can't end the Markdown link early. OpenClaw's Telegram renderer turns the link into a tappable "Add to Google Calendar" (checked with its `renderTelegramHtmlText`).
- **Reminders.** A link can't set reminders, so the event gets the person's default Google notification, and the text lists the suggested ones.
- **Skills and docs.**
  - calendar-dates v2.1 says to send the links exactly as printed, and that there is no file to attach.
  - The agency questions line, the domain README and `commands.md` now describe links instead of a file.
- **Tests.** `devtools/rfp-dates.test.mjs` checks:
  - one link per upcoming event, with the right times, zone and details;
  - all-day dates;
  - a title with parentheses and asterisks;
  - no `MEDIA:` line, and no file other than the note.

**Local ISA (same model, router fixture's RFPs, commands relayed by hand because local ISA has no shell, November 19):**

| Request | Result |
| --- | --- |
| "Can you put the Laguna Beach dates on my calendar?" | 0 of 4 reached the script. Every run went through the router, which said to open the calendar skill. ISA read the documents and gave the right dates as text, including the addendum's January 21, but didn't open the skill. Two runs stalled on the relay itself. |
| `rfp dates laguna-beach-website-redesign` | 1 of 2 followed the skill end to end. Its reply was identical to the script's text, both links included. The other gave the dates as text. |

When ISA reached the script, it sent the links unchanged.

### Why ISA skipped the skill (November 19)

Most of the skipping came from the test, not the skill:
- **The cause in the test.** The relay message told ISA "you have no shell tool here" and gave no way to read a file. In its thinking ISA said it was "unsure if I should follow the instructions to open the skill file since we don't have a tool for files right now". One run made up its own file-reading command instead. On the VM, ISA reads a skill with its file tool, so this doesn't happen there.
- **The corrected message** says shell and file tools are relayed, with `RUN: cat <path>` for reading a file.

| Round (natural phrasing, corrected relay message) | Opened the skill | Ran the script and sent its text |
| --- | --- | --- |
| Before the wording change | 2 of 2 | 1 of 2 |
| After the wording change | 5 of 5 | 5 of 5, links identical to the script's |

**The one real miss.** ISA opened the skill and read the documents, then said "I can't add calendar events directly here" and sent a plain list. The skill's opening said what ISA never does, and nothing said a calendar request still gets done.

**The fix in calendar-dates v2.1:**
- Under that opening: "put the dates on my calendar" is never a reason to say you can't, since the links are how it gets done, and always finish with the script's text.
- A new guardrail: never answer a calendar request with the dates alone.
- A test in `devtools/rfp-dates.test.mjs` keeps both sentences in the skill.

**Runs not counted:**
- Two runs, because DNS lookups to the model provider failed (`ENOTFOUND`).
- One run garbled by the retries after that failure.

**Caveats:**
- The samples are small, and the two rounds can't separate the wording change from run-to-run variation.
- The relay driver repeated a command when a retried model call repeated ISA's message. The driver was fixed partway through.

## Not verified

- **A Google Calendar link opened on a phone.** The link format is Google's documented "add event" template, but nobody has tapped one from Telegram yet.
- **The live model** (openai/gpt-6.1-sol) hasn't run this path, or relayed the links unchanged.
