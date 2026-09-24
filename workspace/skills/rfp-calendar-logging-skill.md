---
name: rfp-calendar-logging
purpose: Log an RFP's action-item deadlines — Q&A due, pre-proposal conference (with its sign-up link and a few-days-prior registration alert), and proposal due — to Jake's work Google Calendar, with clear opportunity-identifying `[RFP]` titles, so a single calendar notification tells him which RFP it is and what to do.
audience: This skill is written to be read by both Claude (who reads the dates and writes the calendar events) and a human teammate (who reviews the preview and lives off the resulting alerts).
version: 1.0 — July 2026
owner: Jake (Seamgen)
depends_on: the per-RFP key-dates note (this skill authors it) and the Google Calendar connector (loads at session start).
---

# RFP Calendar-Logging Skill

## What this skill does

An RFP's deadlines don't do any good sitting in a Markdown file nobody re-opens. A mandatory
conference you had to register for four days earlier, a proposal due at 10:00 a.m. Pacific, a
Q&A window that closes on a Friday — these need to be **on Jake's calendar**, with a title he
can read at a glance and an alert that fires early enough to act.

This skill reads the confirmed dates for one RFP, writes them to Jake's **work Google Calendar**
as a small set of **action-item events** (each titled `[RFP] …`) with tiered advance reminders, and
keeps them in sync when a date moves — so the calendar is always the live truth, never a stale
snapshot.

It also **owns authoring the `key-dates_<rfp-slug>.md` note** (see Step 2). Until now that note
existed for only some RFPs and no skill's procedure created it — only `rfp-document-refresh`
updated one if it already existed. This skill closes that gap: it builds the note as its
structured intermediate, then logs from it. The note doubles as the human-readable date list
**and** the sync ledger that stores the created event IDs.

## When to use it

Run it for a single RFP that has reached **`RFPs/2-intermediate-stage/`, `3-building/`, or
`4-submitted/`** — i.e. an opportunity whose *real documents have been fetched and whose dates
are confirmed on the full text*. Common triggers:

- **At promotion into `2-intermediate-stage/`** — seed the calendar the moment an RFP is worth pursuing.
- **When `rfp-document-refresh` reports a moved date** — re-run so the calendar event moves with it.
- **On demand** — "log the calendar dates for [RFP]" / "sync my RFP calendar."

**Not eligible:** anything still in `RFPs/1-pre-submission/`. Those carry **metadata-only**
scores, and HigherGov metadata dates are unreliable — wrong due dates, no times, no Q&A dates,
mis-typed opportunity types (see the `highergov-metadata-scores-overpredict` memory). Logging a
metadata date is logging a date that is probably wrong. Full-text/confirmed dates only.

## Before you run

- **The Google Calendar connector must be loaded.** Connectors load at session start, so if it
  was authorized mid-session, restart Claude Code first. If the connector exposes no
  event-*create*/*update*/*list* capability, **stop and tell Jake** — do not work around it
  (the same rule that governs the Gmail-draft skills).
- **Target calendar: Jake's primary work calendar** on the connected `joliker@seamgen.com`
  account. (A dedicated "Seamgen RFPs" calendar would be tidier, but creating a new calendar
  isn't available on Jake's account — decided July 24, 2026.) RFP events stay findable on the
  busy primary calendar because every title is prefixed `[RFP] ` — searchable and filterable.
  If a dedicated calendar ever becomes available, switch the target to it and keep the prefix.
- The RFP's real documents should already be in `resources/` (via `rfp-document-fetch`). If the
  solicitation isn't there, there's nothing trustworthy to read dates from — fetch first.

---

## The procedure

Run for **one** RFP at a time.

### Step 1 — Locate the RFP and confirm the tier

Find the existing `<rfp-slug>/` folder under `RFPs/2-intermediate-stage/`, `3-building/`, or
`4-submitted/`. Don't assume a tier and don't create a duplicate — locate the folder wherever it
currently sits (Rule 10). If the only match is in `1-pre-submission/`, **stop**: it isn't
eligible yet (see "When to use it").

### Step 2 — Build or refresh the `key-dates_<rfp-slug>.md` note

This is the structured source the calendar is written from. Author it if missing; refresh it if present.

**Source order (most trustworthy first):**
1. An existing `key-dates_<rfp-slug>.md` at the RFP-folder root.
2. The RFP's meeting brief — the `## Key Facts` block and the `Submission mechanics` bullets.
3. The full-text RFP in `resources/` (the schedule/"Instructions to Proposers" section).

**Capture, per milestone:** the **date**, the **time**, and the **true IANA timezone**; the
**agency contact** (who to reach out to); the **submission method**; and — for the conference —
the **registration link** and any **registration deadline**, dug out of the RFP text.

**Resolve the timezone honestly.** RFPs routinely print "EST"/"CST" year-round; in summer those
are really EDT/CDT. Record the real zone (`America/New_York`, `America/Chicago`,
`America/Los_Angeles`) so the alert fires at the correct absolute moment, and keep the
printed-vs-actual note the existing key-dates files carry ("RFP prints 'EST'; in July/August it
is technically EDT — quoted as written").

**Never invent** (this is a hard line, per Rule 2 and the metadata memory):
- `unknown`, relative ("within 5 working days of downloading the RFP"), and fuzzy ("Week of Aug
  24", "September 2026") values are **not** turned into calendar events. They go in the chat
  report's `NOT SCHEDULED` section so Jake sees them without a fake event on his calendar.
- If the registration link isn't in the documents, say so — write "register via [portal]" and
  flag the missing link; never guess a URL.

**Format** the note like the three existing ones (Yonkers / South Dakota / SW Wisconsin): H1
title `# Key dates — <Agency / RFP name> (<RFP number>)`, a `Source (found via):` provenance
line, a `| Milestone | Date/time |` table with the **Proposal due** row bolded, and a trailing
`**Note:**`. Filename is `key-dates_<rfp-slug>.md` — **no date in the filename** (one canonical
note per RFP). On a refresh, keep any superseded date visible with a "was:" note rather than
silently overwriting, matching `rfp-document-refresh` Step 7.

### Step 3 — Resolve the target calendar

Target Jake's **primary work calendar** (`joliker@seamgen.com`). Note its calendar ID and record
it in the note's sync block (Step 6) so later runs don't have to re-resolve it. The `[RFP] `
title prefix (Step 4) is what keeps these findable among everything else on the primary calendar.

### Step 4 — Compose the events (core action items only)

Build only the dates Jake has to **act on**. Per RFP, at most four:

| # | Event | Timing |
|---|---|---|
| 1 | **Q&A / questions due** | Timed event at the deadline. |
| 2 | **Pre-proposal conference** | Timed event at the conference date/time. Skip entirely if the RFP has no conference. |
| 3 | **"REGISTER by" action item** | A distinct **all-day** event ~4 days before the registration deadline (or the conference date if no separate deadline). This is the "know a few days prior" alert. Only when attendance requires signing up. |
| 4 | **Proposal due** | Timed event at the deadline. |

**Title convention** — clear and opportunity-identifying, because the notification has to stand
on its own: `[RFP] <short name> — <MILESTONE>`. Examples:
- `[RFP] LADBS AI Pre-Plan Check — Proposal DUE (email LADBS.Contracts@lacity.org)`
- `[RFP] LADBS AI Pre-Plan Check — MANDATORY conference (register via RAMP)`
- `[RFP] LADBS AI Pre-Plan Check — REGISTER for conference by 7/28`
- `[RFP] Yonkers Connect Seniors — Questions due`

**Description** carries the working detail: RFP number, agency, **who to contact**, **submission
method**, **registration link**, the `Source (found via)` (internal tracking), and a pointer to
the local RFP folder / Drive folder.

**Tiered reminders** (native Google Calendar notifications, by stakes):
- **Proposal due** → 2 weeks + 1 week + 2 days before.
- **Conference / REGISTER-by** → 4 days + 1 day before.
- **Q&A due** → 3 days + 1 day before.

**Timezone:** create each event in the **agency's real timezone** (Step 2), not Jake's, so the
absolute time — and therefore every reminder — is correct regardless of where he is.

### Step 5 — Preview in chat, then create on Jake's OK

These are real writes to a live calendar, so show the work first. Print the full event list —
title, date, time, timezone, and reminder offsets for each — and let Jake catch a wrong date
**before** it lands. Create the events only after he says go. Report the event links when done.

This mirrors the "preview first, act second" rule the Slack bridge and Drive sync both follow.

### Step 6 — Idempotent write, and record the ledger

**Never create a second copy of an event that already exists.** At the bottom of
`key-dates_<rfp-slug>.md`, keep a sync block:

```
<!-- calendar-sync
calendar: primary — joliker@seamgen.com (id: <calendarId>)
last synced: 2026-07-24
events:
  questions-due:   <eventId>
  conference:      <eventId>
  register-by:     <eventId>
  proposal-due:    <eventId>
-->
```

On every run, read that block and reconcile per milestone:
- **Missing** (no ID) → create, store the new ID.
- **Present, date/time changed** → **update** the existing event (don't create a new one).
- **Present, milestone now gone or closed** → flag it for deletion in the preview; delete on OK.

Then rewrite the block with the current IDs and today's `last synced` date.

### Step 7 — Report

Lead with what's most time-critical (the nearest deadline or a just-moved date).

---

## Output format

```
CALENDAR LOG — [RFP short name] — [date]
========================================

Calendar: primary (joliker@seamgen.com)
Source: key-dates_[slug].md (built from [meeting brief / full-text RFP], [date])

EVENTS  (preview — nothing written until you say go)
------
+ [Q&A due]        [Fri Sep 4, 10:00 AM PT]  reminders: 3d, 1d
+ [Conference]     [Wed Jul 29, 10:00 AM PT] reminders: 4d, 1d   link: [reg URL]
+ [REGISTER by]    [Tue Jul 28, all-day]     reminders: 4d, 1d
+ [Proposal DUE]   [Wed Sep 17, 10:00 AM PT] reminders: 2w, 1w, 2d

CHANGED  (re-run — updated in place, not duplicated)
-------
~ [Proposal DUE]   [Sep 17 → Sep 24] per [document], [§/page]
  (or "None — nothing moved")

NOT SCHEDULED  (no confirmed date — needs your attention, not a fake event)
-------------
- [Milestone]: [why — unknown / relative / fuzzy], per [source]
  (or "None")

NEEDS YOUR ACTION
-----------------
- [Missing registration link, calendar not found, connector issue — or "none"]
```

**State the no-change case explicitly** on a re-run ("Nothing moved") — an "all clear" is a real
result and it's what makes the calendar trustworthy.

---

## Guardrails

- **Never invent a date, time, or link.** `unknown` is the honest answer; a wrong calendar alert
  is worse than no alert. Fuzzy and relative dates are reported, never scheduled.
- **Never duplicate.** Reconcile against the sync-block ledger every run; update in place.
- **Preview before writing to the live calendar.** Create only on Jake's go-ahead.
- **Write to Jake's primary work calendar** (a dedicated calendar wasn't available on his
  account). The `[RFP] ` title prefix is what keeps events findable there — always include it.
- **Agency-true timezone**, DST resolved, so reminders fire at the right absolute time.
- **Full-text/confirmed dates only.** A metadata-only-scored RFP (still in `1-pre-submission/`)
  is not eligible.
- **Connector limits stop the run, not a workaround.** No create/update verb, no calendar, no
  connector loaded → stop and tell Jake, exactly as the Gmail-draft skills do.
- The key-dates note is a **local** deliverable — it is **never** mirrored to Drive (only the
  agency's `resources/` documents are). No PDF is produced.

---

## Notes and edit history

**v1.0 — July 2026, Jake + Claude.** First version. Built because Jake wanted RFP deadlines —
especially conference sign-ups that must happen a few days ahead — to live on his work calendar
with titles clear enough that a single notification names the opportunity. Delivers the
"Calendar workback schedule" item that had sat in `future-edits.md`, in a focused core-action-
items form (Q&A due, conference, a distinct REGISTER-by alert, proposal due) rather than the
full internal-review workback (which stays open as a possible extension). Two design decisions
worth recording: (1) the skill **took ownership of authoring the `key-dates_<rfp-slug>.md`
note**, which no skill's procedure previously created — it's now the structured intermediate the
calendar is written from and the ledger that stores event IDs for idempotent re-runs; and (2)
events are created in the **agency's real timezone** with the printed-vs-actual (EST/EDT)
resolution the key-dates notes already flagged, so an alert fires at the correct absolute moment.
Written against the standard Google Calendar connector verbs; the exact tool names get pinned on
the first live run (the way `create_draft` was pinned for the Gmail skills), because the
connector loads only at session start and was not live when this was authored. **Calendar target:
Jake's primary work calendar** — the plan called for a dedicated "Seamgen RFPs" calendar, but
creating a new calendar wasn't available on his account (decided July 24, 2026), so events land on
the primary calendar and stay findable via the `[RFP] ` title prefix.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
