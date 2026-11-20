# Asking ISA for RFP work

ISA understands normal requests ("can you do the engineering brief for Laguna Beach?"). These short commands always work, and are the fastest way to get exactly what you want. ISA shows them next to every choice it offers, so you can also just reply with the number.

Use the RFP's name as it appears in the Friday email, or its short ID (for example `laguna-beach-website-redesign`).

## Commands

| To get | Type |
| --- | --- |
| What ISA can do for an RFP right now | `rfp skills <rfp>` |
| The RFPs we're working on, by phase | `rfp list` |
| Move an RFP | `rfp move <rfp> shortlisted`, `building`, `submitted` or `scored` |
| Engineering brief, for a timeline estimate | `rfp brief <rfp>` |
| Capability check, for a named engineer | `rfp capability <rfp>` |
| Questions for the agency's Q&A, with the email | `rfp questions <rfp>` |
| Key dates, with links to add them to your calendar | `rfp dates <rfp>` |
| Submission checklist | `rfp checklist <rfp>` |
| Proposal deck rough draft | `rfp deck <rfp>` |
| Messages asking teammates for materials | `rfp materials <rfp>` |
| Moonshot deck folded into the proposal | `rfp moonshot <rfp>` |
| The email that goes with the proposal | `rfp submission-email <rfp>` |
| What changed in new documents | `rfp changes <rfp>` |
| Download and save the documents | `rfp fetch <rfp>` |

## Phases

Every RFP is in one phase: **1 Scored**, **2 Shortlisted**, **3 Building**, **4 Submitted**. RFPs move only when someone asks.

If you ask for something from a later phase (a checklist for an RFP still in Shortlisted, say), ISA asks whether to move it first. Reply `1` to move it, or `2` to leave it where it is; either way ISA does what you asked. Adding `--stay` to a command skips the question: `rfp checklist laguna-beach-website-redesign --stay`.

## Dates

Just ask: "when is Laguna Beach due?" or "is there a pre-bid meeting?" gets an answer from the RFP's own documents, never from the HigherGov listing.

`rfp dates <rfp>` (or "put the Laguna Beach dates on my calendar") sends the questions deadline, pre-proposal meeting and proposal due date, each with an "Add to Google Calendar" link. Tap one and save to add that event, then set the suggested reminders if you want them; a link can't set them. ISA never adds anything to a calendar itself. When an addendum moves a date, ask again: ISA lists what moved, with a new link for the new date. Delete the old event yourself.

ISA never sends emails or creates drafts for RFPs. It gives you the text to copy.
