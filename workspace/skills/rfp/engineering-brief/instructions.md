---
name: rfp-engineering-brief
purpose: Extract the engineering-relevant scope from an RFP into a short brief a lead engineer can read in 5–10 minutes and give a timeline estimate from, without reading the whole RFP; then keep their estimate.
audience: ISA (who picks the passages and records estimates) and the sales team (who send the brief and edit this recipe). The brief itself is written for engineers who have not read the RFP.
version: 2.0 — November 2026
owner: Seamgen sales team (no single owner or approver)
depends_on: scripts/rfp-brief.mjs (inputs, quote checks, the fixed format, the PDF, estimates); the RFP's saved documents; resources/proposal-sources/Proposal - People.txt. Feeds the agency questions skill (its "Ambiguities Requiring Clarification" section) and the proposal skills (the estimates).
label: Engineering brief for a timeline estimate
command: brief
phase: 2
when: An engineering brief: the RFP scope, short enough for a lead engineer to give a timeline estimate.
asks: engineering brief | eng brief | tech brief | technical brief | scope brief | scope summary | summarize the scope | scope for engineering | scope for the engineers | timeline estimate | estimate the timeline | how long would it take | level of effort | effort estimate | brief for the engineers | update the brief | revise the brief | redo the brief | rewrite the brief | new brief | brief with the addendum
---

# Engineering brief

## What this skill does

It turns a full RFP into a short brief that puts every engineering-relevant requirement in front of a lead engineer, each backed by **the RFP's exact words and page**. The engineer reads it in 5–10 minutes, checks the RFP only where something looks off, and gives a timeline estimate. Then it keeps that estimate.

ISA picks the passages. `scripts/rfp-brief.mjs` does the rest: it checks every quote against the saved documents, lays the brief out in its fixed format, prints the PDF, and records estimates.

**ISA never sends the brief.** The person who asked sends the PDF and the message, after reading them.

## Why the format matters

Every other skill's output is checked by the salesperson who asked. This one goes to **engineers who won't read the RFP**, and they price from it. A missed requirement or a glossed-over hard part becomes an under-estimate, then an under-priced proposal, then a money-losing project.

So the rule is: **ISA routes, the engineer interprets.** ISA finds the passages and puts them in front of the engineer; it doesn't decide what the RFP means. Every claim carries the RFP's exact words and page. The script refuses a quote it can't find in the saved documents.

Capability first (has anyone built this? the capability check), then the brief (how long?).

## When to use it

After the Friday scoring has called the RFP Strong Pursue or Worth a Look, and before asking a lead engineer for an estimate. Not for no-bid RFPs, and not as a substitute when the engineer asks for the full RFP.

## Step 1: the inputs

The router's decision carries them as `inputs`. Only when it doesn't, run `node scripts/rfp-brief.mjs --rfp <slug> --inputs`. They hold:

- **`steps`**: what this RFP calls for. Do each one.
- **`scope`**: whether the scoring found the saved documents describe the whole scope, and any scope documents it found named but never saved (`missing`). Try to fetch those first.
- **`capability`**: capability check rows answered "never" or still unanswered.
- **`team`**: the current staff; the brief goes only to them.
- **`keyDates`**: the proposal due date the brief and the message quote.
- **`saved`**: the brief written before, with its estimates.

The brief prints `scope` and `capability` itself, under "Risks for the estimate", so the engineer sees what the estimate can't cover.

Then read the RFP end to end (`documents.readAll`, or the router's `documents` by number).

## Step 2: pick the passages

Each item is a **label** (2–5 words, which the engineer scans), one plain **explain** sentence, and one or more **quotes**, each with its **source** (file, page and section, for example `file 1, page 12, §4.03B`).

- **Quote exactly**, odd phrasing and all. Use "…" to skip words inside one passage. The script refuses a quote it can't find in the saved documents.
- **Every quote has a page.** For PDFs, use the printed page number; the `--- page N ---` markers are the PDF's own page count, which differs when front matter is unnumbered.
- **Set `"flag": true`** on an item whose passage is unclear, and add it to the ambiguities too.

The sections, by key:

| Key | Section | |
|---|---|---|
| `scope` | Scope of Work | always (empty prints "Not addressed in the RFP.") |
| `deliverables` | Deliverables | always |
| `technical` | Technical Requirements | when the RFP has it |
| `integrations` | Integrations / Third-party systems | look hard: often buried in appendices |
| `compliance` | Compliance and Security | |
| `accessibility` | Accessibility | "must be accessible" with no WCAG level is an ambiguity |
| `migration` | Data / Content Migration | often the schedule bottleneck |
| `hosting` | Hosting, Infrastructure, Ownership Constraints | |
| `timeline` | Timeline and Phases (from the RFP) | the agency's dates, not our estimate |
| `priority` | Must-Have vs Should-Have language | "shall/must" vs "should/preferred" |

**Leave out** legal and commercial terms, cost proposal instructions, evaluation criteria and boilerplate. They matter, but not for an estimate.

**Length:** 1–3 pages (a 20-page RFP makes about one). The script refuses more than 5.

## Step 3: the ambiguities

Each is a **question** phrased as it would go to the agency, **why** it matters for the estimate, and the **quote** that creates it with its source, or `"silent": true` (with the nearest context as `source`, if any) when the RFP says nothing. The agency questions skill reads this section, and its version of an overlapping question wins there, so keep each one agency-ready. The "why" stays internal.

Watch for: "must be accessible" with no WCAG level; "modern web standards" with no platform; "integrate with existing systems" with no list; content migration with no volume; "security best practices" with no framework.

Example (Utah State University Online, RFP DG012336):

```
1. What accessibility standard does "University Website Policy" require: WCAG 2.1 AA, WCAG 2.2 AA, Section 508, or something else?
   - Why it matters for engineering: AA vs AAA can add 20–40% to accessibility work.
   - RFP basis: > "adhere to University Website Policy, including accessibility requirements" — §4.03B, p. 12
2. Which CMS does USU Online use now, and must the new site stay on it?
   - Why it matters for engineering: migrating to a new CMS and rebuilding on the old one are different projects.
   - RFP basis: RFP is silent
```

## Step 4: run the script and send its text

```
node scripts/rfp-brief.mjs --rfp <slug> <<'RFP_BRIEF_END'
{ "name": "<RFP name>", "number": "<RFP number>", "agency": "<agency>", "foundVia": "<HigherGov, PlanetBids, forwarded by …>", "pageCount": <pages>,
  "preparedBy": "<who asked>", "for": ["<engineer's full name from People.txt>"], "summary": "<what is being built, about 20 words>",
  "sections": { "scope": [ { "label": "Discovery phase", "explain": "Stakeholder interviews, journey analysis and an analytics review.",
      "quotes": [ { "quote": "<the RFP's exact words>", "source": "file 1, page 12, §4.03A" } ] } ], "deliverables": [ ... ] },
  "ambiguities": [ { "question": "...", "why": "...", "quote": "...", "source": "file 1, page 12, §4.03B" } ],
  "forSales": "<a note only the person who asked sees, e.g. a short response window>" }
RFP_BRIEF_END
```

It saves `engineering-brief_<date>_<slug>.md` and the PDF in the RFP's folder. It prints the text to send: a summary, the risks, and a message for the engineer, followed by a `MEDIA:` line that attaches the PDF. Send the text between the lines word for word, then the `MEDIA:` line on its own. If the PDF couldn't be made, say the brief is saved and offer to paste it. If it prints "Nothing was saved. Fix these…", fix each one and run it again.

**Never write the brief or the message yourself, and never send them to an engineer.**

To revise the brief (a new addendum, say), start from `--show`'s `input`, change it, and run step 4 again. The new brief keeps the earlier estimates, marked with the brief they were given on.

## Recording estimates

When someone passes on an engineer's estimate ("Chris estimated 12 weeks for Laguna Beach"), the router says so (`mode: "record-estimate"`). Record it; don't write a new brief:

```
node scripts/rfp-brief.mjs --rfp <slug> --estimate <<'RFP_BRIEF_END'
{ "by": "<full name>", "said": "<their estimate, word for word>", "duration": "<e.g. 12 weeks>", "team": "<e.g. 3 engineers>", "assumptions": ["<what they assumed>"] }
RFP_BRIEF_END
```

Put their words in `said` exactly as given. Never round, combine or upgrade an estimate. "What did Chris estimate?" is answered by the router from the saved brief.

## Notes and edit history

**v2.0 — November 24, 2026.** `scripts/rfp-brief.mjs` now:
- checks every quote against the saved documents, and that each has a page;
- checks each ambiguity has its basis, the length (at most 5 pages), and that the engineer is current staff;
- lays the brief out in the fixed format, adding a "Risks for the estimate" section from the unread scope documents and the capability check's open rows;
- prints the PDF with Chromium (the VM's) or Edge, through a plain home folder, and attaches it with a `MEDIA:` line;
- records estimates.

The router records estimates passed on in chat, answers "what did Chris estimate", sends "update the brief" here, and hands the skill its inputs. The Utah State example was cut to its ambiguities. The edit history before this version is in Git.

**v1.0–v1.8 (July–November 2026).** First written by Jake and Claude in July 2026, with the guided extraction format and the ambiguities feeding the agency questions. Later versions moved the brief into the RFP's folder and made it work without a single owner after Jake left.

**How to edit this skill:** change the text, bump the version and add a note here. The format, the checks and the PDF are in `scripts/rfp-brief.mjs`, with tests in `devtools/rfp-brief.test.mjs`.
