---
name: rfp-capability-verification
purpose: Turn an RFP's technical asks into a per-operation checklist for the engineer who built the closest thing, so the answer comes back specific the first time, and keep their answers word for word. Confirms what Seamgen has actually done; how long it would take is the engineering brief's job.
audience: ISA (who builds the checklist and records answers) and the sales team (who send the message and edit this recipe). The message is written for a named engineer.
version: 2.0 — November 2026
owner: Seamgen sales team (no single owner or approver)
depends_on: scripts/rfp-capability.mjs (inputs, checks, the checklist, the message, the saved record and answers); the RFP's saved documents; resources/proposal-sources/Proposal - People.txt and Proposal - Case Studies.txt. Feeds the agency questions skill (rows answered "never" or still unanswered) and the proposal skills.
label: Capability check for a named engineer
command: capability
phase: 2
when: A capability check: a checklist for a named engineer to confirm what Seamgen has actually built for each technical ask.
asks: capability check | capability verification | capability checklist | verify our capabilities | have we built this | have we done this before | can we actually do this | confirm what we have built | checklist for an engineer | experience check | tech check | check with the engineers | ask the engineers | ask an engineer | do we have the experience | have we built anything like | have we done anything like | which engineer should i ask | who on our team has done | who has built | can we actually do | can we do what they are asking
---

# Capability check

## What this skill does

It breaks an RFP's technical requirements into **individual operations** and asks the engineer who built the closest real thing to answer **each one separately**: have we done exactly this, something adjacent, or never, and on which project. Then it keeps their answers, word for word, until every row is settled.

ISA decides the operations and who to ask. `scripts/rfp-capability.mjs` does the rest: it checks the rows, builds the checklist and the message to copy, saves the record as `capability-check_<slug>.md` in the RFP's folder, and records the answers.

**ISA never sends the message.** It is text for the person who asked to send themselves, after they have read it.

## Why it exists

On Suwannee River WMD (26/27-002) in July 2026, *"have we done bi-directional ArcGIS work?"* took three rounds. Seth hedged (*"if I understood it correctly… Pete would know more"*) and the hedge was recorded as a yes; a revision swung to "read-only", also wrong; Pete, who built the back end, finally said we wrote **attributes**, not **geometry**. The RFP asked for *"managing parcel boundaries"*, which is geometry. Two wrong briefs, because the question was asked about "ArcGIS experience" instead of the operations the RFP names. Peter's instruction (July 28, 2026): ask whether they can do *the specific workflows this RFP mentions*.

Capability first (can we do it at all?), then the engineering brief (how long?). Don't estimate a build nobody has done.

## When to use it

- The scope names a specific technology, platform or integration (ArcGIS, Salesforce, a named identity provider or permitting system).
- The scoring matched our case studies on a bridge rather than a direct match. The inputs say so.
- A brief or proposal is about to say "we have done this before".

Not for generic capability ("can we build a React front end?").

## Step 1: the inputs

The router's decision carries them as `inputs`. Only when it doesn't, run `node scripts/rfp-capability.mjs --rfp <slug> --inputs`. They hold:

- **`steps`**: what this RFP calls for. Do each one.
- **`scoring`**: the case-study match (`caseStudy`: band, project, reason) and the technology judgment (`tech`).
- **`team`**: the current staff from `Proposal - People.txt`, each with their role and what the record says they built (`onRecord`). Only these people can be asked.
- **`sources`**: the commands to read People.txt and the case studies in full.
- **`keyDates`**: the questions deadline the message quotes.
- **`saved`**: the check given before, with each row's answer and the rows still open.

Then read the RFP (`documents.readAll`, or the router's `documents` by number).

## Step 2: break it into operations

**Find every verb the RFP applies to the technology.** One requirement sentence usually holds several operations.

Suwannee §5E, p.8: *"Native integration with ESRI ArcGIS software is required for mapping, managing parcel boundaries, and updating natural community layers"* is three operations: render a map, edit parcel geometry, update a thematic layer. Seamgen's answer differs for each.

- **One operation per row.** If a row could be answered "yes and no", split it.
- **Read for verbs, not nouns.** "ArcGIS integration" hides everything; "managing", "updating", "communicating" are the operations.
- **Split read from write, and attributes from geometry.** Reading is nearly always easier than writing, and writing a shape is harder than writing a field.
- **Split the deployment model** (on-premises or cloud, self-hosted or vendor-hosted) from the capability.
- **At most 10 rows.** The script refuses more; past that engineers skim.

Each row needs the RFP's own words (`quote`), the file and page (`source`), and **the proposal sentence a "done exactly" answer would allow** (`ifYes`), for example *"Seamgen has written parcel geometry directly into a Florida state agency's on-premises ArcGIS Enterprise."* Engineers answer more carefully when they see the claim their yes creates. If they wouldn't sign that sentence, the answer isn't "done exactly".

## Step 3: who to ask

**Ask the person who did the work, not the person easiest to reach.** On Suwannee, Seth was the natural contact, but Pete wrote the FDEP GIS back end and only Pete could answer the write rows. Seth's "Pete would know more" was the routing being wrong.

Use the case studies and each person's `onRecord`. Where the record is silent about work someone did, say so in `why` and list it as a record gap once they confirm. Where two people split the work (front end and back end), give each their own rows. The script refuses anyone not on the current staff list.

## Step 4: run the script and send its text

```
node scripts/rfp-capability.mjs --rfp <slug> <<'RFP_CAPABILITY_END'
{ "name": "<RFP name>", "number": "<RFP number>", "decision": "<what the answers decide, e.g. prime builder or no-bid>",
  "routedTo": [ { "name": "<full name as in People.txt>", "why": "<the project they built>", "rows": [1, 2, 3] } ],
  "rows": [ { "operation": "<one operation>", "quote": "<the RFP's words>", "source": "file <n>, page <p>, §<x>", "ifYes": "<the proposal sentence a yes allows>" } ] }
RFP_CAPABILITY_END
```

It prints the checklist and one message per engineer, with the questions deadline from the key dates. Send the text between the lines word for word. If it prints "Nothing was saved. Fix these…", fix each one and run it again.

**Never write the checklist or the message yourself, and never send the message to a teammate.** The person who asked reads it and sends it.

To change the rows later, start from `--show`'s `input`, change it, and run step 4 again. Answers to unchanged rows are kept; the script lists any it drops.

## Recording answers

When someone passes on an engineer's answer ("Pete answered the Laguna Beach capability check…"), the router says so (`mode: "record-answer"`). Record it; don't build a new check:

```
node scripts/rfp-capability.mjs --rfp <slug> --answer <<'RFP_CAPABILITY_END'
{ "by": "<full name>", "said": "<their answer, word for word>",
  "rows": [ { "n": 2, "answer": "done", "project": "<named project>", "client": "<client>" },
            { "n": 3, "answer": "adjacent", "project": "<project>", "difference": "<what differs from the RFP's ask>" },
            { "n": 4, "answer": "never" }, { "n": 5, "answer": "unanswered" } ],
  "recordGaps": ["<what People.txt or the case studies get wrong, as they said it>"] }
RFP_CAPABILITY_END
```

| Answer | Means | Needs |
|---|---|---|
| `done` | We have shipped exactly this | The project (and client). No project, no claim: the script refuses it |
| `adjacent` | Similar, not the same | The project and what is different |
| `never` | No precedent | Nothing more; a clean, useful answer |
| `unanswered` | They hedged, deferred, or answered something else | Nothing; **never upgrade it to a yes** |

"Pete would know more" is `unanswered` for those rows, and the next step is to ask Pete. Put their words in `said` exactly as given: a paraphrase is how a hedge becomes a claim. The script prints where every row stands and which are still open; send that text word for word.

**Record gaps** (a bio that doesn't mention work they did, a case study with the wrong scope) are listed for a person to fix. Never edit People.txt or the case studies yourself, and never on a verbal answer alone.

## Guardrails

- **A hedge is not a yes.** The rule this skill exists for.
- **No project name, no claim.**
- **Never upgrade an answer downstream.** If the check says "adjacent", the brief, the agency questions and the proposal say adjacent.
- **Overclaiming survives scoring and loses at evaluation**, or wins dishonestly.

## Notes and edit history

**v2.0 — November 24, 2026.** `scripts/rfp-capability.mjs` now builds the checklist and the message, checks the rows (quote, source and "if yes" sentence on each, at most 10, only current staff), saves the record as `capability-check_<slug>.md` instead of a PDF that was never produced on the VM, and records answers (a "done" needs a project, an "adjacent" a project and the difference). The router records answers passed on in chat instead of building a new check, answers "what did Pete say" from the saved record, and hands the skill its inputs. Rows answered "never" or still unanswered reach the agency questions skill. The edit history before this version is in Git.

**v1.0–v1.3 (July–November 2026).** First written by Jake and Claude on July 28, 2026 from the Suwannee ArcGIS case. Later versions made messages copy-paste only, with no single owner after Jake left.

**How to edit this skill:** change the text, bump the version and add a note here. The checks and the message template are in `scripts/rfp-capability.mjs`, with tests in `devtools/rfp-capability.test.mjs`.
