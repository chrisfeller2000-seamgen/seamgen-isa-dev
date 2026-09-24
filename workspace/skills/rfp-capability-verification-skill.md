---
name: rfp-capability-verification
purpose: Turn an RFP's technical asks into a per-operation checklist for a named engineer, so the answer comes back specific the first time. Confirms what Seamgen has actually done — as distinct from how long something would take, which is the engineering brief's job.
audience: Written to be read by both Claude (who builds the checklist) and a human teammate (who edits the recipe over time). The OUTPUT is written for a named lead engineer.
version: 1.0 — July 2026
owner: Jake (Seamgen)
depends_on: the full RFP (for verbatim extraction), rfp-scoring output (Category 1 case-study match), and `resources/proposal-sources/Proposal - Case Studies.txt` + `resources/resumes/` for what the record already claims. Feeds rfp-meeting-brief (Blockers, Five Key Points), rfp-solution-landscape (our viable role) and eventually the proposal itself.
---

# Capability Verification Skill

## What this skill does

Decomposes an RFP's technical requirements into **individual operations**, and asks a named engineer to answer **each one separately**: have we done exactly this, something adjacent, or never — and if not never, **on which project**.

## Why this exists — the failure it prevents

On Suwannee River WMD (26/27-002) the question *"have we done bi-directional ArcGIS work?"* took **three rounds** to answer, and produced a claim that was written into a brief twice and corrected twice:

1. Seth Lutske answered, but hedged: *"if I understood it correctly… Pete would know more."* The hedge was recorded as a **yes**, and the 07-26 brief called it *"our strongest single card."*
2. A 07-27 revision swung the other way and downgraded it to read-only rendering — **also wrong**.
3. Pete Nystrom, who actually built the back end, finally narrowed it: we wrote **attributes**, not **geometry**.

That distinction decides the bid. The RFP asks for *"managing parcel boundaries"* (§5E, p.8) — which is geometry. Three rounds, two wrong briefs, and one still-open risk of overclaiming in a proposal, all because the question was asked at the level of *"ArcGIS experience"* rather than at the level of the operations the RFP names.

**Peter's instruction, 2026-07-28:** ask whether they can do *the specific workflows this RFP mentions*.

## Why it's a separate skill from the engineering brief

`skills/rfp-engineering-brief-skill.md` exists to get a **timeline estimate**. This skill exists to get a **capability confirmation**. Same engineer, same RFP, different question — and mixing them produces a document that does neither well.

It **reuses** the engineering brief's core machinery deliberately:
- The **guided extraction pattern** (short label + verbatim quote + §/page).
- Its governing principle: **shift interpretation from Claude to the engineer.** Claude's job is routing, not deciding what the RFP means.

Sequence: capability verification **first** (can we do it at all?), engineering brief **second** (how long?). Estimating a build we cannot staff or have never done inverts the order — which is why Suwannee's estimate was deliberately deferred.

## When to use it

- Any RFP whose scope names a **specific technology, platform or integration surface** — ArcGIS, Salesforce, a named identity provider, a named permitting system.
- Any RFP where Category 1 (Case Study Match) scored on a **bridge** rather than a direct match. A bridge is a claim, and claims need confirming before they reach a proposal.
- Any time a brief is about to assert *"we have done this before."*
- Before `rfp-solution-landscape` finalises **"our viable role"** as prime builder.

Do **not** use it for generic capability (*"can we build a React front end?"*). Reserve it for the operations that decide the bid.

## How to use it

Say "run capability verification for [RFP name]."

Claude will:
1. Read the RFP and extract every operation the requirements actually name.
2. Identify **who built the closest real thing** — not who is easiest to reach.
3. Produce the checklist, plus a copy-paste message for that person.
4. Record the answers verbatim when they come back.

Output: a PDF in the RFP's own folder — **`RFPs/[stage]/[rfp-slug]/`** — plus copy-paste text in chat:

```
RFPs/[stage]/[rfp-slug]/capability-check_YYYY-MM-DD_[rfp-slug].pdf
```

`[stage]` is the RFP's current lifecycle tier; save into the existing `[rfp-slug]/` folder wherever it lives (CLAUDE.md Rule 10). Carries a **Source (found via)** line (Rule 9).

---

## Step 1 — Decompose into operations

**The method: find every verb the RFP applies to the technology.** A requirement sentence usually contains several operations wearing one label.

Worked decomposition (Suwannee §5E, p.8):

> "Native integration with ESRI ArcGIS software is required for mapping, **managing parcel boundaries**, and **updating natural community layers**"

That is not one capability. It is **three** — render a map, edit parcel geometry, update a thematic layer — and Seamgen's position differs on each. Add §5C's *"Capable of GIS bi-directional communication for 3-year planning"* and the deployment question from §5A, and you get the checklist that should have gone out:

| # | Operation the RFP names | §/page | Why it's separate |
|---|---|---|---|
| 1 | Render ArcGIS map layers in a web app | §5E, p.8 | The easy one; almost certainly yes |
| 2 | Write **attributes** back to a client's feature layer | §5C, p.7 | Pete confirmed: yes, FDEP |
| 3 | Write parcel **geometry** back to a client's feature layer | §5E, p.8 | **The gap.** "Managing parcel boundaries" is geometry |
| 4 | Update natural community / vegetation layers | §5E, p.8 | Thematic layer maintenance — different again |
| 5 | Bi-directional sync against **ArcGIS Enterprise on-premises** | §5A / §5E | Deployment model, not just API |
| 6 | Map-driven workflow approval routing | §5, p.6 | Ties GIS to business process |

**Rules for decomposing:**
- **One operation per row.** If a row could be answered "yes and no," split it.
- **Read for verbs, not nouns.** "ArcGIS integration" is a noun and hides everything; "managing," "updating," "communicating" are the operations.
- **Separate read from write, and attributes from geometry.** This is where Suwannee turned, and it generalises: reading data is nearly always easier than writing it, and writing a shape is harder than writing a field.
- **Separate the deployment model** — on-premises vs. cloud, self-hosted vs. vendor-hosted — from the capability. We had delivered against both, but nobody had been asked.
- **Cap it at 8–10 rows.** Beyond that the engineer skims and you are back to a general answer.

## Step 2 — Route to whoever built it

**Ask the person who did the work, not the person who is easiest to reach.**

On Suwannee, Seth Lutske is the technical lead and the natural contact — but **Pete Nystrom wrote the FDEP GIS back end**, and only Pete could answer rows 2 and 3. Seth's hedge (*"Pete would know more"*) was the system telling us the routing was wrong, and it was recorded as an answer instead.

Before sending, check `resources/proposal-sources/Proposal - Case Studies.txt` and `resources/resumes/` for who is attached to the closest project. Where the record is silent — **Pete's bio does not mention GIS at all**, despite his having built it — say so in the ask, and fix the record afterwards.

Where two people split the work (front end / back end), **send to both and say which rows you expect each to own.**

## Step 3 — The four answers

| Answer | Means | Required with it |
|---|---|---|
| **Done exactly this** | We have shipped this operation | **Name the project and the client.** No project name = not this answer |
| **Adjacent** | Structurally similar, not identical | Name the project **and state what is different** |
| **Never** | No precedent | Nothing further — this is a clean, useful answer |
| **Not answered** | The engineer hedged, deferred, or answered a different question | **Never silently upgrade this to a yes** |

**"Not answered" is the whole point of the taxonomy.** *"If I understood it correctly… Pete would know more"* is not a soft yes. It is an unanswered row, and it must appear as one in every downstream document until someone answers it.

## Step 4 — Show the stakes

Give each row a **"what we would write if you say yes"** column — the actual proposal sentence the answer authorises.

Engineers answer more carefully when they can see the claim their yes creates. It also catches the mismatch where a technically-true yes supports a sentence that overreaches. Example:

| Operation | If you say "done exactly this," we will write… |
|---|---|
| Write parcel geometry back to ArcGIS Enterprise | *"Seamgen has written parcel geometry directly into a Florida state agency's on-premises ArcGIS Enterprise."* |

If the engineer would not sign that sentence, the answer is not "done exactly this."

## Step 5 — Record verbatim

Capture the answer **in the engineer's own words**, attributed and dated, exactly as the engineering brief treats timeline quotes. Paraphrase is how a hedge becomes a claim.

Then: **update the record.** If the answer reveals experience the case studies or bios do not carry, that is a gap in a source of truth, not just an RFP fact. Neither Seth's nor Pete's bio records the FDEP GIS work; `Proposal - Assets.txt` had the write-back scope wrong. Flag it for correction — never edit a source of truth on a verbal answer alone (Rule 2).

---

## Output format

```
CAPABILITY CHECK — [RFP name] ([number])
Source (found via): [platform]
Date: [YYYY-MM-DD]
Routed to: [name(s)] — [why this person: who built the closest thing]
Decision this feeds: [e.g. "prime-builder vs no-bid, before questions close July 31"]

| # | Operation | RFP basis | Answer | Project | Notes |
|---|---|---|---|---|---|
| 1 | [operation] | > "[quote]" — §X, p.Y | [ ] Done exactly  [ ] Adjacent  [ ] Never | | |

WHAT EACH "YES" AUTHORISES
--------------------------
[row #]: "[the proposal sentence]"

ANSWERS RECEIVED
----------------
[Name], [date]: "[verbatim]"
Rows resolved: [#s]   Rows still unanswered: [#s]

RECORD GAPS FOUND
-----------------
[e.g. "Pete Nystrom's bio does not mention GIS; Proposal - Assets.txt had the FDEP write scope wrong."]
```

### The copy-paste message

Engineer register per CLAUDE.md: technical, precise, verbatim quotes with page references, no fluff. State the decision it feeds and the deadline — engineers deprioritise asks with no visible stakes.

```
Hey [name] — quick capability check for the [RFP short name] bid. Six specific
things, and I need each answered separately rather than as "do we do ArcGIS."

Asking you because you built [closest project].

For each: have we done exactly this, something adjacent, or never? If not never,
which project?

1. [Operation] — RFP says: "[verbatim]" (§X, p.Y)
2. ...

Context: this decides whether we bid as prime or pass. Questions to the agency
close [date/time both zones].

If any of these is really someone else's area, say so and I'll route it — a
"probably" doesn't help me here, it ends up in a proposal.
```

That last line is deliberate. It gives the engineer explicit permission to decline a row, which is what turns a hedge into a routable "not mine."

**Sending:** Slack, once `tools/team.json` is populated (it is currently blank). Until then, copy-paste. Either way — **show Jake the message and get his go-ahead before anything reaches a teammate.** Hard rule, per CLAUDE.md.

---

## Guardrails

- **A hedge is not a yes.** The single rule this skill exists to enforce.
- **No project name, no claim.** "We've done that" without a named client is an unanswered row.
- **Never upgrade an answer in a downstream document.** If the checklist says "adjacent," the brief says adjacent and the proposal says adjacent.
- **Never edit a source of truth on a verbal answer** (Rule 2). Flag the gap; let a human confirm it.
- **Overclaiming is the failure mode that survives scoring and loses at evaluation** — or wins dishonestly. Same standard `rfp-scoring` Gate 6a sets for references.
- **Cap the list.** Ten rows is the ceiling; past that you get skim-answers.

## Notes and edit history

**v1.0 — July 28, 2026, Jake + Claude.** First version, built after Peter's 2026-07-28 instruction to ask engineers about *the specific workflows an RFP names* rather than about a technology in general. The worked case throughout is Suwannee's ArcGIS question, which took three rounds and produced two wrong briefs because it was never decomposed — a hedge from Seth was recorded as a yes, a correction over-swung to read-only, and Pete finally narrowed it to attributes-not-geometry, which is the distinction the RFP's *"managing parcel boundaries"* actually turns on. Four design decisions carry the weight: **"Not answered" is a first-class answer** so a hedge cannot be silently upgraded; **routing goes to whoever built the thing**, since Seth's *"Pete would know more"* was the system flagging bad routing; **every row shows the proposal sentence a yes authorises**, so the engineer sees the claim they are creating; and **read/write and attributes/geometry are always split**, because that is where this one turned and it generalises. Kept separate from `rfp-engineering-brief` (timeline estimation) while reusing its guided-extraction pattern and its shift-interpretation-to-the-engineer principle.

**Known limitations of v1.0:**
- The decomposition is judgement. Two people would produce different row counts from the same paragraph; the 8–10 cap is a guess at where skim-answers begin.
- No mechanism yet for tracking an unanswered row across time — it lives in the RFP folder and relies on someone re-reading it.
- Slack delivery is blocked on `tools/team.json` being populated.
- Does not yet feed the proposal-deck skills, which are where an overclaim would actually reach a buyer.
