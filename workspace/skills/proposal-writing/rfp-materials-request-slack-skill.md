---
name: rfp-materials-request-slack
purpose: Turn a proposal's submission checklist (its per-item owner assignments) plus the rough-draft proposal deck's outstanding stub/inline-filler items into per-person, Slack-ready requests — grouped by teammate — so Jake collects everything the proposal still needs in one pass, without a second round of clarifying questions. Covers the materials-collection step of Phase 8 (Proposal development).
audience: Written for both Claude (who drafts the requests) and Jake (who reviews and sends them). The MESSAGES themselves are internal, to Seamgen teammates.
version: 1.6 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-submission-checklist skill (the per-item owner routing), the RFP itself (for verbatim requirement language), the rfp-proposal-deck-rough-draft output (its stub + inline-filler list = exactly what's still missing), the rfp-engineering-brief output (technical language + page refs for engineers), and reference-team-and-signature.md + CLAUDE.md's "Communication register by audience" (identity, signature, per-person tone).
---

# Materials Request (Slack) Skill

## What this skill does

Produces the **Slack messages Jake sends to teammates** to collect the materials a proposal still needs — the pricing, headshots, PM assignment, reference contacts, firm-registration fields, contract exceptions, and technical specifics that the rough-draft deck deliberately left as stubs. It **groups every ask by person** (all of Hoda's in one place, all of Chris's in another, etc.), so Jake can send one complete message per teammate.

The goal is **one clean pass**: each message is comprehensive enough that the recipient never has to come back confused or having missed something — so it pairs every plain-language ask with the **RFP's own words** (verbatim quote + section/page). It also tells each person, in one line, **what the others are working on**, so they know who to coordinate with.

Output is a **PDF grouped by person** (Jake's record/reference) **plus each message as plain copy-paste-ready text in chat** (Slack doesn't paste cleanly from a PDF).

## When to use it

Use once a **submission checklist exists** for the RFP (that's where owners come from), and — ideally — after the **rough-draft proposal deck** has been built, because the deck's stub + inline-filler list is the precise inventory of what's still outstanding. Use it at the start of proposal development, when Jake is ready to reach out to the team. Don't use it before there's a checklist to route against.

## How to use it

- "draft the materials requests for [RFP]" → Claude reads the checklist + deck + RFP and returns the grouped PDF + copy-paste messages.
- "draft the materials request for [person] on [RFP]" → just that one teammate's message.

## What it reads (inputs)

1. **The submission checklist** (`submission-checklists/…`) — the per-item **owner routing** (who owns what).
2. **The rough-draft deck's outstanding items** — its stubs (pricing, CPM schedule, financials, exceptions, VPAT) and inline-filler (headshots, PM, effort %, registration fields, reference contacts). This is the "what's still missing" list.
3. **The RFP itself** — for the **verbatim requirement language** behind each ask.
4. **The engineering brief** (if one exists) — verbatim technical language + page refs for the engineers' asks.
5. **`reference-team-and-signature.md`** — Jake's identity + the internal (first-name) sign-off. **CLAUDE.md** — the per-person communication register and the current roster.

## Who gets a message (deriving recipients)

**Ground every recipient in this RFP's submission checklist.** Message a person only if *this RFP's* checklist has an outstanding item they own. A person's **standing role is not an ask** — never carry "so-and-so usually owns X" into a message when this RFP doesn't require X. If the checklist has no line for someone, they get **no message.** (This is the exact trap to avoid: asking Finance for "financials" on an RFP that never requested any — which confuses the recipient and wastes the ask.)

Intersect the checklist's owner routing with the deck's stub/inline-filler list. Standard owners, each **only when the checklist actually contains their item**:

- **Tina** — company registration fields (offeror address/phone/email, tax ID), business license, W-9, proof of good standing, portal/account setup.
- **Nick** — evidence of financial responsibility, **only when this RFP actually requires it** (many public RFPs don't). No financials line in the checklist → **do not message Nick.** When it IS required, name the exact documents and whether it's due now or only on request (see "Make every ask self-explanatory").
- **Marianne** — contract/PSA exceptions, insurance terms, price approval, and the **binding signature** (cover/transmittal letter).
- **Peter** — final price sign-off + exceptions approval. Keep his to one or two lines.
- **Chris / Frank** (and Seth if assigned) — pricing estimate inputs, the detailed CPM schedule, and technical specifics (PCI/payment gateway, data-migration sizing, integrations, app-vs-web).
- **Hoda** — headshots and case-study screenshots / design assets, **only if Jake can't source them himself** (often he can — if so, skip her entirely). Never ask Hoda (or anyone) to decide *which* case studies to feature or to source reference contacts — that stays with Jake + Claude.
- **Staffing** — who the PM is + % effort per person (a question to leadership, e.g., Marianne — asked, not assigned).

Never invent a recipient or an ask — only route items that are real in **this RFP's** checklist/deck/RFP. **A general role is not an ask:** if a person has no grounded checklist item for this RFP, drop them. Use current staff only (never Adan or Katie — historical names only). **Selecting case studies and reconciling references is Jake + Claude's job, not a team ask.** And **drop any ask Jake can self-serve** (e.g., headshots or case-study images he already has) — don't message someone for something Jake can get himself.

**Firm-registration fields: don't re-ask for what's on file.** Pull confirmed company values (address, phone, tax ID, org type, license, etc.) from `reference-team-and-signature.md` and pre-fill them in the message ("I've got our address (…) and phone (…)"). Only ask Tina for the fields still marked `[to confirm]` there. As she supplies them, they get saved back to that reference doc so the next RFP doesn't ask again.

## The "what I'm asking each person for" map (stated once)

At the top of the PDF, include a compact map — one line per person summarizing **what Jake is asking that person for**, NOT an assertion of what they "own" or "handle." Framing matters: Jake is junior (an intern), so the map and every message must describe *Jake's own requests* and never define teammates' responsibilities or narrate who does what. Keep individual messages free of "so-and-so handles X / approves Y / signs Z" statements — those presume knowledge of others' roles and step on toes.

## Per-person message template (concise — Slack, not an essay)

```
Hey [Name] — putting together the [RFP] proposal (due [RFP due date]); could you get me the below by [Jake's internal deadline]?

What I need:

• [Plain-language ask, phrased as a question — "could you…", "who should…".] RFP asks for: "[verbatim requirement]" (§[X], p.[Y]).

• [Ask 2.] …

Everything we've put together for this one is in our Google Drive folder: [link].
Thanks.
— Jake
```

Formatting Jake prefers (apply in both the `.txt` and the PDF): **no "@Name — RFP proposal" title line** (the person is already identified by the Slack DM / the section header); **a blank line between each bullet** so they don't run together; and **"Thanks." not "Thanks!"** — no exclamation point.

Keep it tight: 2–5 asks per person is normal; group related asks into one bullet. Skimmable in Slack. **Ask, don't direct**, and never add a line describing what another teammate handles/approves/signs.

## Register by person (from CLAUDE.md)

Across all of these, keep an **intern-appropriate voice: humble, asking, never presuming.** Phrase asks as questions; don't tell a senior teammate what they do, approve, or sign.

- **Peter (CEO):** one or two lines, respectful; ask whether he'd like to review/approve, don't announce that he "signs off."
- **Marianne (Managing Director):** direct, specific; working details are fine — still asked, not assigned.
- **Engineers (Chris / Frank / Seth):** technical, precise, **verbatim quotes with page references, no fluff** — they want the exact RFP language, not a paraphrase.
- **Tina / Nick (Ops/Admin):** a clean, polite checklist — but with the **same rigor as the engineers**: name each document concretely, say in one line what it's for, and cite the RFP section. "A checklist" does not mean "vague."
- **Hoda:** headshots + case-study screenshots only (not "which case studies fit" — that's Jake + Claude).

## Make every ask self-explanatory

The whole point of this skill is that the recipient never has to come back and ask "what is this?" So **every** ask — not just the engineers' — carries all four of these:

1. **What, exactly — concrete and enumerated.** Never a category word like "financials" or "the forms." Spell out the actual items: *"audited or reviewed financial statements, a Dun & Bradstreet report, or a bank reference letter,"* not *"financials."*
2. **Why / what it's for — one plain-language line, jargon defined.** The recipient may not know the procurement term. Define it: *"evidence of financial responsibility = proof to the agency that we're financially able to deliver the contract."*
3. **What's needed now vs. later.** State it plainly. If nothing is due yet, say so ("no action needed now — just confirming we could produce this if the City requests it"). Never leave an "if it's optional I'd rather not" gap.
4. **The RFP's own words — verbatim, with section/page** (pull from the engineering brief when one exists). Do not paraphrase a requirement when the exact words are available.

**Conditional / on-standby items are the #1 confusion risk** (they're the ones that read as vague and optional). If you send one, name the exact trigger, say clearly whether any action is needed now, and still define the item in full. And remember the grounding rule: if the RFP has **no** requirement for the item, there is nothing to make self-explanatory — **don't send the ask at all.**

## What to offer — the shared Google Drive folder

Everything we've generated for the RFP (scoring, engineering brief, submission checklist, rough-draft deck, etc.) lives in one **shared Google Drive folder**. Rather than offering individual documents — and rather than pushing our internal drafts at people — give each person **the link to that folder** so they can pull whatever context they want themselves: *"Everything we've put together for this one is in our Google Drive folder: [link]."* Jake supplies the folder link per RFP.

One link works for everyone; it's cleaner and less presumptuous than deciding what each person needs.

**Feedback loop → future skills.** Log the recurring "can you send me / where do I find X?" replies. When the same request shows up across RFPs, that's a signal to build a new skill/deliverable so teammates get it automatically and never have to ask again. Surface those candidates to Jake (per CLAUDE.md Rule 6, don't create the new skill without asking first).

## Guardrails

- **Concise, not essays.** These are Slack messages. Comprehensive on substance, short in form.
- **Humble, intern-appropriate voice.** Ask, don't direct. Never presume to state what a teammate handles, owns, approves, or signs — phrase everything as a question ("could you…", "who should…"). This protects a junior sender from stepping on toes.
- **Real asks only — grounded in *this* RFP.** Never invent a requirement, an owner, or a deliverable, and never turn a person's standing role into an ask the RFP doesn't require. Every ask traces to a line in *this RFP's* checklist (or the deck/RFP). No checklist line → no message.
- **Current staff only.** Use the CLAUDE.md roster; never address Adan or Katie as current staff.
- **Internal voice + signature.** First-name, collaborative Slack tone; sign-off from `reference-team-and-signature.md` (first name only).
- **Source line.** Carry a "Source (found via)" line at the top of the PDF (internal tracking, per Rule 9). It never goes to an external party — but these are internal, so it stays.
- **Don't send anything.** This skill drafts; Jake sends. No Slack automation.

## Output

- **PDF:** `RFPs/[stage]/[rfp-slug]/materials-request_YYYY-MM-DD_[rfp-slug].pdf` — saved in the RFP's own folder (created if it doesn't exist yet), grouped by person, house style, for the record / at-a-glance view. HTML source kept in scratchpad.
- **Plain-text companion (the copy-paste workhorse):** `RFPs/[stage]/[rfp-slug]/materials-request_YYYY-MM-DD_[rfp-slug].txt` — the same messages as clean plain text, one per block with simple dividers. Slack (and any chat) pastes plain text cleanly, without the fonts/line-breaks a PDF drags along. Also echo the messages in chat. **Prefer the `.txt` for actual sending; the PDF is the polished record.**
- Regenerate both with today's date if the outstanding-items list changes; older versions stay as a paper trail.
- `[stage]` is the RFP's current lifecycle tier (`1-pre-submission` / `2-intermediate-stage` / `3-building` / `4-submitted`) — save into the RFP's existing `[rfp-slug]/` folder wherever it already lives (see CLAUDE.md Rule 10). Since materials-requests happen during active proposal construction, that's usually `3-building/`.

## Worked example (abbreviated)

For the Rancho Palos Verdes recreation-platform RFP, the skill reads the RPV submission checklist + the rough-draft deck's stubs and produces, e.g.:

> **Chris / Frank** — *"…could you get me: (1) a rough cost basis for a City-owned recreation platform + managed hosting; (2) the detailed CPM schedule to a Jan 5, 2027 go-live; (3) our PCI approach + which gateway. RFP: 'The vendor shall maintain full PCI DSS compliance for all their payment systems…' (§III, p.6). (4) Do we need to integrate with the City's Tyler Munis ERP? 'The City operates with Tyler Munis ERP as their accounting software.' (§III, p.5)… Everything we've put together is in our Google Drive folder: [link]."*

…plus grouped messages for Marianne (exceptions, insurance, prevailing-wage read, pricing once engineering's estimate is in, who signs), Peter (would he like to approve pricing/exceptions), and Tina (the company-registration fields still marked `[to confirm]`). **Nick is NOT messaged** — the RPV RFP has no financials requirement, so there is no grounded item for him. (Contrast USM, which *did* have a real hook — "Financial statements — furnish only if requested" at §IV.B.9 — where Nick would get a concrete, defined, clearly-conditional ask.) Headshots and case-study images are Jake's to source, so there's no Hoda message either. Every message closes with the shared Google Drive folder link, and the top of the page carries a "what I'm asking each person for" map. Output: `RFPs/[stage]/rancho-palos-verdes-recreation-software/materials-request_2026-07-08_rancho-palos-verdes-recreation-software.pdf` + `.txt`.

## Notes and edit history

**v1.6 — July 2026, Jake + Claude.** Folder reorg (type-based → by-RFP): both outputs (PDF + `.txt`) now save to the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (was `team-requests/`). See CLAUDE.md v1.13.

**v1.5 — July 2026, Jake + Claude.** Fixed two gaps exposed when Nick replied to his Rancho ask confused ("What financials exactly? … if optional would prefer not to"). Root cause: the Rancho RFP requires **no** financials — Nick's ask was carried over from his generic owner role, not grounded in this RFP. (1) **Grounding rule:** message a person only when *this RFP's* checklist has an item they own; a standing role is not an ask; no checklist line → no message. (2) **"Make every ask self-explanatory":** every ask (Ops/Admin included, not just engineers) must give the concrete *what*, a plain-language *why* with jargon defined, *what's needed now vs. later*, and the *verbatim RFP cite* — with conditional/on-standby items flagged as the top confusion risk. Upgraded the Tina/Nick register accordingly and refreshed the worked example (Nick is not messaged on RPV; Google-folder link replaced the old per-doc offers).

**v1.4 — July 2026, Jake + Claude.** Message-formatting tweaks from Jake: dropped the "@Name — RFP proposal" title line, added a blank line between bullets, and changed "Thanks!" to "Thanks." (no exclamation point). Applied to both the `.txt` and PDF.

**v1.3 — July 2026, Jake + Claude.** Wired in **firm-registration reuse**: confirmed company fields now come from `reference-team-and-signature.md` (address + phone confirmed; the rest marked `[to confirm — Tina]`), so the skill pre-fills what's known and only asks Tina for the gaps — and saves her answers back so the next RFP doesn't ask again.

**v1.2 — July 2026, Jake + Claude.** Three refinements from Jake's second review: (1) **added a plain-text `.txt` companion** as the copy-paste workhorse — pasting from the PDF into Slack mangled formatting, so the `.txt` (clean plain text, one message per block) is now preferred for sending and the PDF is the record. (2) **Replaced the per-person document offers with one shared Google Drive folder link** — instead of guessing what each person needs, point everyone to the folder holding everything we've generated (Jake supplies the link per RFP). (3) **Skip anyone whose asks Jake can self-serve** (e.g., headshots / case-study images) — don't message a person for something Jake can get himself.

**v1.1 — July 2026, Jake + Claude.** Tuned for Jake's **intern context** and tightened what we volunteer. (1) **Humble voice** — ask, never presume to state what a teammate handles/approves/signs; reframed the top map from "who's handling what" to "what I'm asking each person for." (2) **Hoda's scope** narrowed to headshots + case-study screenshots; **choosing which case studies to feature and reconciling references now stays with Jake + Claude** (not a team ask). (3) **What we offer** — only proactively offer the **RFP + engineering brief**, and only to the engineers and Hoda; never offer the rough-draft deck; everyone else is simply invited to ask for what they need. Added the **feedback loop → future skills** principle (recurring "can you send me X?" requests become candidates for new skills). Prompted by Jake's review of the RPV requests.

**v1.0 — July 2026, Jake + Claude.** First draft. Pivots the submission checklist's owner routing + the rough-draft deck's stub/inline-filler list into per-person, Slack-ready requests. Groups by teammate; pairs each ask with verbatim RFP language (+ §/page); states a "who's handling what" map once; tailors tone per person via CLAUDE.md's registers. Output: grouped-by-person PDF in `team-requests/` + copy-paste text in chat. Fills the gap between the submission checklist (assigns owners) and the final deck (needs the collected materials).

**Known limitations of v1.0:**
- Requires a submission checklist; best after the rough-draft deck exists (that's the outstanding-items source).
- Does not send Slack messages — drafting only (no Slack integration in Claude's toolset here).
- Recipient roles come from CLAUDE.md; confirm the current owner if a role has changed.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
