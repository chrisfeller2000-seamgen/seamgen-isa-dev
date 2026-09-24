---
name: rfp-meeting-brief
purpose: Generate a short (one-page) pre-meeting document for a specific RFP, designed to be read in 60 seconds before a weekly sales meeting or a hallway conversation with Peter, Marianne, or a lead engineer.
audience: This skill is written to be read by both Claude (who drafts the brief) and a human teammate (who reads, sanity-checks, and edits the template over time).
version: 2.3 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (this brief reads from that skill's output), plus optional inputs from the pursue-to-Peter email thread, engineer timeline estimates, and agency Q&A responses. The Blockers section reads the RFP directly, for verbatim requirement quotes with §/page.
---

# Meeting Brief Skill

## What this skill does

Produces a one-page document about a single RFP, formatted so that Jake can read it in 60 seconds before walking into a meeting and speak intelligently about the opportunity.

The brief compresses everything already known about the RFP — the score, the strengths and concerns, the deadlines, the agency contact, and the engineer's timeline estimate if available — into a single scannable page, plus one field that only Jake can provide: the specific ASK for this meeting.

It is a **decision** document, not a build document. It covers whether to pursue and what stands in the way; it does not enumerate the submission package. That belongs to `skills/proposal-writing/rfp-submission-checklist-skill.md` at Phase 8, once the decision has already been made.

## When to use it

Use this skill any time Jake needs to walk into a meeting and be prepared to speak about an RFP that he hasn't had time to re-read the full documents for. Typical triggers:

- Monday morning weekly sales meeting.
- A scheduled 1:1 with Peter or Marianne about a specific opportunity.
- A hallway conversation where Peter says "hey, where are we on the Maryland thing?"
- Slack from a lead engineer asking for context before they give a timeline estimate.

Do **not** use this skill for:
- Formal proposal development (that's a different, longer skill we'll build later).
- Communicating with the agency (that's the Clarifying-Questions-to-Agency Email Skill).
- The initial pursue/no-bid decision to leadership (that's the No-Bid Email or Pursue-to-Peter Email skills).

## How to use it

Tell Claude: "generate a meeting brief for [RFP name]."

Provide (or point Claude to):
1. The RFP Scoring Skill output for this RFP.
2. Any engineer timeline estimate that has come in (paste the Slack message or forward it verbatim — see "Engineer timeline" section below).
3. Any updates from Peter, Marianne, or the agency since the last brief.
4. **The ASK** — what specifically needs to be decided or discussed in this meeting. If Jake doesn't provide it, Claude will infer a likely ASK from the lifecycle stage.
5. The RFP document itself — needed for **Blockers**, which quotes requirements verbatim with §/page rather than paraphrasing them. Its submission section still matters, but only for mechanics that could **disqualify** us (see Blockers below), not for a full package inventory.

Claude will produce the brief in the RFP's own folder **`RFPs/[stage]/[rfp-slug]/`** (a Markdown working copy plus the PDF deliverable), creating that folder if it doesn't exist yet, named:

```
RFPs/[stage]/[rfp-slug]/meeting-brief_YYYY-MM-DD_[rfp-slug].pdf
```

For example: `RFPs/[stage]/maryland-website-redesign/meeting-brief_2026-07-06_maryland-website-redesign.pdf`

Naming convention rationale: the date prefix makes multiple briefs over time sort chronologically within the RFP's folder, and the slug in the filename keeps each file self-describing even if moved. Every deliverable for a given RFP lives together in the RFP's own folder — `RFPs/[stage]/[rfp-slug]/`, where `[stage]` is its current lifecycle tier (`1-pre-submission` / `2-intermediate-stage` / `3-building` / `4-submitted`). Save into that `[rfp-slug]/` folder wherever it already exists; don't assume the tier or create a duplicate (see CLAUDE.md Rule 10). **The PDF is rendered from a temporary HTML built in the scratchpad (headless Edge/Chrome print-to-pdf); that HTML is NOT kept in the RFP folder — the folder holds only the `.md` working copy and the `.pdf` deliverable.**

## The brief format

The brief is a Markdown document of roughly **700–1,000 words** (tightened in v2.2, when the Required Proposal Package section was removed for being build material rather than decision material). It won't fit on one screen and never has in practice — but it should be read whole in a few minutes, not skimmed in despair.

What matters is not total length but **where the weight sits**: the **top third — The Ask, Why We Should Pursue, and Blockers — must be readable in about 60 seconds.** That's the part Peter reads before deciding. Everything below it is reference material for when the conversation goes deeper: he reads it if he wants it, and it costs him nothing if he doesn't.

If the top third can't be skimmed in a minute, cut *there* — not from the detail sections.

Structure:

```
# Meeting Brief: [RFP name]

**Source (found via):** [sourcing platform — e.g., HigherGov, PlanetBids, RAMP, or "forwarded by [name]"]
**HigherGov listing:** [URL, or "n/a"]
**Original posting:** [site name] — [URL, or "not identified"]
**Date:** [YYYY-MM-DD]
**RFP #:** [ID]
**Prepared by:** Jake

---

## The Ask

[One or two sentences: what specifically needs to be decided or discussed
in this meeting.]

## Why We Should Pursue

[Two or three sentences — the single strongest, presentation-ready case for
bidding, distilled so Jake can read it aloud in a meeting without scrolling
the rest of the brief. Lead with the top fit(s), name the real proof (closest
case studies), and cite any structural edge (quality-weighted evaluation, no
incumbent, ICP anchor). If the pursue is genuinely qualified, one honest caveat
clause is allowed — but lead with why to bid. On a no-bid: omit this section.]

## Blockers

*Every reason we would not win this as of today. [HARD] = disqualifying or
non-responsive if unmet. [SOFT] = weakens us, but survivable.*

- **[HARD] [Short label]:** [One line — what the blocker is.]
  - Requirement: > "[verbatim quote]" — §[x], p.[n]
  - What we have: [grounded in a source of truth — never from memory]
  - To clear it: [what would resolve it] — *owner: [name]*
- **[SOFT] [Short label]:** [Same structure.]
- **[UNKNOWN] [Short label]:** [Something that may or may not block us.]
  Unknown — to be addressed in Q&A (see Clarifying Questions below).

[If nothing genuinely stands in the way, write "None identified" — state it
explicitly rather than leaving the section empty.]

## Where We Are

[One sentence describing the current lifecycle stage — e.g., "Peter and
Marianne approved gauging engineer timeline; Chris has estimated 12–14
weeks; awaiting decision on whether to write proposal."]

## Summary

[Two to three sentences describing what the RFP is asking for and who it's
for. Written so a stranger to the opportunity understands it.]

## Current Solution & Desired Outcome

**Today:** [What they run now that needs replacing — the incumbent system or
vendor, or an explicit "greenfield, nothing exists today." Quote + §/page if
the RFP says; otherwise "Unknown — to be addressed in Q&A."]

**Build posture:** [Is a fully custom solution required, or would a third-party
platform (CMS/COTS) that Seamgen configures and integrates be acceptable?
Quote + §/page, or the Q&A label.]

**What they want out of it:** [The outcome being bought, in the agency's own
words — more senior engagement, easier navigation, fewer walk-in questions.
Outcomes, not features. Quote + §/page, or the Q&A label.]

**Who this looks written for:** [The wired verdict — Open / Leaning wired /
Wired / Insufficient evidence — the one strongest tell, the strongest piece of
counter-evidence, and what the agency bought last time. ~80 words. Source:
skills/rfp-solution-landscape-skill.md]

## Key Facts

- **Agency:** [Name]
- **Main contact:** [Name, title, email]
- **Questions due:** [Date/time]
- **Proposal due:** [Date/time]
- **Estimated deal size:** [$ range or "not stated"]
- **Score:** [n/100 — Strong Pursue / Worth a look / No-bid]

## Five Key Points

*A mix of fits and concerns. Order matters — most important first.*

1. **[Fit or Concern — one bold label]:** [One-sentence explanation.]
2. **[Fit or Concern]:** [One-sentence explanation.]
3. **[Fit or Concern]:** [One-sentence explanation.]
4. **[Fit or Concern]:** [One-sentence explanation.]
5. **[Fit or Concern]:** [One-sentence explanation.]

## Engineer Timeline Estimate

[If available:] **[Engineer name], [date]:** "[verbatim quote from the
engineer's Slack message or email]"

*Interpretation for the meeting:* [One sentence translating the quote
into plain language, especially if there are caveats like "depends on
their content migration."]

[If not yet available:] Engineer estimate not yet requested / pending
from [Engineer name] as of [date].

## Clarifying Questions (for the agency)

*The starter questions Seamgen plans to submit to the agency — Peter/Marianne
add to these. On a no-bid: "N/A — no-bid."*

- [Question 1]
- [Question 2]
- [Question 3]
- [Question 4]
- [Question 5]

*Question sourcing (internal — trim before any external use):*
1. [Q1 topic] — > "[verbatim RFP quote]" — §X, p.Y   (or: RFP is silent; nearest context §X)
2. [Q2 topic] — ...

## Open Threads

- [Anything currently pending — waiting on agency response, waiting on
  Peter's decision, waiting on cost sheet, etc.]
- [Any recent update or event that hasn't been fully processed yet.]
```

## How to write each section

### The header links (HigherGov listing + Original posting)

Every brief carries **two links**: the HigherGov listing, and the **original posting** — the agency's own site, named and linked. The point is traceability: months later, "where did this come from and where do its addenda appear?" should be answerable from the brief alone, without re-deriving it.

**Take the values from the first source that has them — never invent a URL:**

1. **`RFPs/<stage>/<rfp-slug>/resources/_document-manifest.md`** — its `HigherGov page:` and `Agency portal:` fields. This is the normal case: `skills/rfp-document-fetch-skill.md` records both when it pulls the documents, including the portal's name.
2. **`RFP-pipeline/candidates/<slug>/candidate.md`** — `source_url` (HigherGov) and `solicitation_url` (the agency's posting), for an RFP that came through the intake but hasn't been fetched yet.
3. **Ask Jake** — or, for an RFP that never had a HigherGov listing (forwarded by a teammate, or found directly on a portal), write `n/a` for the HigherGov line and name the portal it actually came from.

If the original posting genuinely can't be determined, write **"not identified"**. That is a truthful state and a mildly useful flag; a guessed link is neither.

**Naming the site matters as much as the link.** "BidNet Direct" or "OpenGov Procurement" tells the reader immediately whether Seamgen already has access there — the URL alone doesn't.

### The Ask (top of brief — most important line)

**If Jake provided the ASK explicitly:** Use his exact framing, but tighten to one or two sentences.

**If Jake didn't provide the ASK:** Infer from the lifecycle stage using this table:

| Lifecycle stage | Likely ASK |
|---|---|
| Just scored, decision pending | Approval to send [pursue / no-bid] email to Peter and Marianne. |
| Pursue email sent, waiting on Peter | Any additions to the clarifying-questions list before I send to the agency? |
| Peter approved pursuit, engineer estimate pending | Green light to Slack [engineer] for a timeline estimate. |
| Engineer estimate received, proposal decision pending | Green light to start proposal development based on [engineer]'s [X-week] estimate. |
| Clarifying questions sent to agency, awaiting response | Informational only — flagging that we're waiting on the agency. |
| Agency responded, proposal decision pending | Given the agency's responses, green light to start the proposal? |
| Proposal in development | [Specific proposal question — cost sheet, review cycle, tech approach] |
| Proposal submitted | Informational — submitted, awaiting outcome. |

**Never leave The Ask blank.** If neither Jake nor the lifecycle table produces a clear ASK, write "Ask: informational, no specific decision requested" — that itself is useful information.

**Make-or-break callout (when pursuit hinges on one question).** If going after the RFP comes down to a single unresolved question — will the agency accept a custom build (the rfp-scoring "Conditional — Ask the Agency" case), a mandatory qualification we may not meet, a reference/set-aside gap, a deadline we might miss — **lead the brief with a highlighted "Make-or-break" callout directly under the header, before The Ask**, stating that one question in a sentence and what it gates. Then make The Ask the decision about that question, and mirror it in Open Threads. Don't bury the thing the whole pursuit turns on inside the five points — a reader should see it in the first two seconds. One make-or-break per brief; if there are genuinely two, pick the one that kills the bid fastest.

### Why We Should Pursue

Two or three sentences, presentation-ready — this is the line Jake reads aloud when someone asks "why are we going after this one?" Distill it from the Five Key Points and the scoring debrief, but keep it **positive and concrete**: the top one or two fits, the closest *real* case studies as proof, and any structural edge (quality-weighted evaluation, no incumbent, ICP anchor). Ground case studies in `resources/proposal-sources/Proposal - Case Studies.txt`; never invent. If the pursue is genuinely qualified (a real delivery risk or a gate we might not clear), one honest caveat clause at the end is fine — but the section still leads with why to bid, not why to worry. Omit the section entirely on a no-bid.

### Blockers

**The counterweight to Why We Should Pursue.** That section says why to bid; this one says why we might lose. Peter asks the second question as often as the first, and before v2.1 the brief made him assemble the answer from three scattered places.

List **every reason Seamgen would not win this as of today**, each labelled by severity:

- **`[HARD]`** — disqualifying, or renders the proposal non-responsive if unmet.
- **`[SOFT]`** — weakens us but survivable.
- **`[UNKNOWN]`** — might block us; we don't yet know.

Each entry carries four things: the **requirement** (verbatim quote + §/page), **what Seamgen actually has**, **what would clear it**, and **who owns clearing it**.

**Ground every claim. Never write a gap from memory.**

| Claim about… | Check against |
|---|---|
| References / past performance | `resources/proposal-sources/Proposal - Case Studies.txt` |
| Held certifications | `tools/highergov-config.json` → `seamgenProfile.certifications` |
| Demonstrated compliance experience | `skills/rfp-scoring-skill.md` Category 6 |
| Qualification gates, competitive position | The scoring output's **Gate 6** and **Category 7** — already computed; draw from them rather than re-deriving |

**A blocker cuts both ways, and both errors are costly.** Overstating a gap kills a pursuit we could have won; understating one loses the bid late, after real work. The Yonkers reference gap is the worked example of getting this right:

> **[HARD] Government references:** The RFP requires three public-sector references; we can field roughly one.
> - Requirement: > "Proposers must provide at least three (3) governmental or public-sector references for similar engagements." — §IV.F, p.19
> - What we have: **Florida DEP** (state agency — Sea Level Rise Projection tool) is one clean public-sector client. The **U.S. Endowment** carbon tool is a *nonprofit*, not a government agency, though it met NIST 800 / FITARA / FISMA. Nothing else in the case-study library is a public-sector client.
> - To clear it: ask the agency whether public-sector healthcare, federal, or nonprofit engagements qualify — *owner: Jake, before the Q&A deadline*

Note what that entry does **not** say: it doesn't claim zero public-sector experience (false — FDEP is real), and it doesn't imply we can cover three (also false). Precision in both directions is the point.

**Severity comes from the RFP's own wording, not from instinct.** Yonkers asks for SOC 2 evidence *"where available"* (S-9, p.15) — that's `[SOFT]`. Had it said "must provide," it would be `[HARD]`. Read the verb before assigning the label.

**Run the categories** so nothing is missed: references / past performance · certifications & compliance · business-status set-asides (MBE/WBE, 8(a)) · insurance & bonding thresholds · key-personnel requirements · geographic or local-presence rules · registration & portal access · incumbent advantage · timeline & capacity · **proposal-effort multipliers** · **structural disadvantages we can't fix**.

**Two categories deserve special attention, because both have cost real pursuits:**

- **Public-sector references.** Seamgen holds **one** clean government reference (Florida DEP). An RFP demanding **3+ governmental/public-sector** references is `[HARD]` — it fails Gate 6a in `skills/rfp-scoring-skill.md` v1.7 unless a *named* teaming partner supplies them. A generic "N most recent projects" requirement is **not** a blocker; the commercial reference bench is deep. Yonkers died on exactly this distinction after scoring 88.
- **Effort multipliers and unfixable disadvantages.** A security questionnaire required *once per option offered*, per-option cost proposals, mandatory pre-award demos, or explicitly scored locale points a California firm forfeits. These are usually `[SOFT]` individually — they cost rather than disqualify — but **name the cost in hours or multiples**, because two of them together are a legitimate reason to pass on a strong technical fit. South Dakota DOE is the worked example: three hosting options, each needing its own cost proposal, Exhibit E questionnaire and diagram, plus 5 evaluation points for project-locale familiarity.

**Submission mechanics belong here when — and only when — they could cost us the bid.** As of v2.2 the brief no longer carries a Required Proposal Package section, so the decision-relevant slice of the RFP's submission rules has to surface in Blockers or it surfaces nowhere:

- **A portal we aren't registered on.** Yonkers is the worked case: submission only through BidNet / Empire State Purchasing Group, where Seamgen has no account. `[HARD]` until registration completes, owner **Tina**, and it carries real lead time — which is exactly the kind of thing that must be known *before* the meeting green-lights writing, not discovered in week two.
- **A mandatory pre-proposal conference**, especially one whose date has passed or is imminent. Missing it is usually disqualifying outright.
- **Hard mechanics that void a response** — price appearing in the technical volume when it must be sealed separately, no-ZIP rules, page limits, file-size caps.

Everything else about the package — the affidavit list, the exhibit inventory, letterhead and signature rules — is **not** a blocker and does not go in the brief. It's assembly work, and `skills/proposal-writing/rfp-submission-checklist-skill.md` produces it in full at Phase 8. The test is simple: *could this stop us winning, or is it just work?* Only the first belongs here.

**"None identified"** is allowed, but say it explicitly. An empty section reads as an oversight; the words read as a judgement.

### Current Solution & Desired Outcome

**This section exists because Peter asked for it.** In a July 2026 review he wanted to know, plainly, *what are these people using right now that needs replacing?* — and the brief had no answer.

Three parts:

**Today** — the incumbent system or vendor, or an explicit "greenfield, nothing exists." A replacement project and a first-ever build are different engagements with different risks, and the difference changes both the estimate and how the proposal is written.

**Build posture** — is a **fully custom** solution required, or would a **third-party platform** (CMS or other COTS) that Seamgen configures and integrates be acceptable? This materially changes scope, price, and who we're competing against. It also connects to the scoring skill's Gate 2 "productized RFP" edge case.

**What they want out of it** — the outcome the agency is buying, in its own words. **Outcomes, not features.** "An AI assistant" is a feature; "seniors can find services without calling the front desk" is an outcome. Peter pitches outcomes; a feature list tells him nothing he can use.

**Who this looks written for** *(added v2.3)* — the wired verdict, in about 80 words. **Peter asks this every time; the brief should answer it before he does.**

An agency often knows which vendor it wants and cannot say so, because a specification strict enough to name one supplier would exclude most of the market and invite a protest. So the requirements are written loosely and the preference peeks through — Seamgen's shorthand is a **"fake RFP."** **The tell is a gap: the RFP names a platform or product posture, then stops short of requiring credentials in it.**

Carry four things and no more: the **verdict** (`Open` / `Leaning wired` / `Wired` / `Insufficient evidence`), the **single strongest tell**, the **single strongest piece of counter-evidence**, and **what the agency bought last time**. The full analysis lives in `skills/rfp-solution-landscape-skill.md` — this is its headline, not a rerun.

**Never name the company you think will win.** It's an accusation, it's unprovable, and briefs travel. Describe the shape — "an Esri Gold partner with three to five named state land systems" — and let the reader draw the conclusion.

**⚠ This inverts a natural reading, so watch for it in your own drafts.** The 2026-07-26 Suwannee brief recorded "no public-sector reference minimum to trip Gate 6a" as a *favourable* fact and even wrote it as "unlike Yonkers." Under this lens it may be camouflage. But Suwannee is equally the reminder that the inversion is a hypothesis: the District's own last software award went to a custom .NET/SQL shop with no GIS practice at 95/100 against 20 bidders, which is real evidence against the wired read. **If the counter-evidence line is empty, the research wasn't done — write `Insufficient evidence` rather than a confident-looking verdict.**

**Mark what you know and what you don't.** These answers are sometimes stated plainly in the RFP and sometimes only reachable through Q&A. Both states must be visible, so Peter can tell knowledge from assumption:

| State | Write it as |
|---|---|
| Stated in the RFP | Verbatim quote + §/page |
| Not stated, Q&A window open | **"Unknown — to be addressed in Q&A"** |
| Not stated, Q&A window closed | **"Unknown — Q&A window closed"** — a standing risk, not a to-do |

**Self-consistency rule: every "to be addressed in Q&A" item must have a matching entry in the Clarifying Questions section below.** An unknown with no question attached is a promise nobody keeps. Yonkers does this correctly — its current-solution unknown maps to the drafted question *"Is 'Connect Yonkers Seniors' fully greenfield, or is an existing tool/vendor being replaced or migrated from?"*, sourced to the RFP being silent on any incumbent (§I, p.3).

The third state matters as much as the first two. Once the window closes, an unknown stops being something to ask and becomes something to price risk around — and the brief should stop implying anyone can still chase it.

### Where We Are

One sentence. Should capture: (1) who has weighed in so far, (2) what was decided, (3) what's pending. Example patterns:

- "Scored 85/100 today; no leadership review yet."
- "Peter approved pursuit June 22; clarifying questions sent to agency; awaiting response."
- "Peter and Marianne approved gauging engineer timeline; Chris estimates 12–14 weeks; awaiting decision on whether to write proposal."
- "Proposal in draft, first internal review scheduled [date]."

The last of those is the Maryland/Palos Verdes state Jake described.

### Summary

Two to three sentences, lifted or paraphrased from the RFP's objective statement. Should answer:
- What is the agency asking for?
- Who is it for (target users)?
- Why now (if the RFP explains a triggering pain)?

Example (USU): "Utah State University is soliciting a full redesign of the USU Online website ecosystem — the primary marketing entry point for prospective online students. The redesign must be conversion-focused and explicitly optimized for AI-driven search (SEO + AEO + GEO). Current site was not designed as a modern marketing platform and is limiting inquiries and enrollments."

### Key Facts

Straight from the scoring output. If any field is missing, write "not stated" rather than guessing.

**Score line format:** "[n]/100 — [recommendation]" — e.g., "85/100 — Strong Pursue."

### Five Key Points

Distill from the scoring output's "Notes for email debrief" section. Rules:

1. **Fits only — concerns belong in Blockers.** As of v2.1 this section carries the **detailed positive case**; every reason we might lose lives in **Blockers**, labelled by severity. Three sections, three jobs: *Why We Should Pursue* is the spoken pitch, *Five Key Points* is the detail behind it, *Blockers* is the case against. Don't say the same thing in two of them. (Before v2.1 this section mixed both, which is why the Yonkers reference gap ended up buried as point 4 of a list headed "a mix of fits and concerns.")
2. **Bold the label.** Start each with a bold two-to-four-word label (e.g., **AI alignment**, **Timeline pressure**, **Case study match**, **Agency relationship**) followed by a colon and the one-sentence explanation. The bold labels make the brief scannable.
3. **Rank by importance, not by score category.** If the biggest concern is that the deadline is tight, that goes first even if it's category 8 in the rubric.
4. **No jargon.** "Custom build with heavy AI component matches Seamgen's positioning" is good. "High Case Study Match and AI Angle scores" is bad — that reveals the mechanics.
5. **Bridge past work generously.** When a point cites case-study fit, apply the adjacent-experience principle (rfp-scoring Category 1): name the closest *real* Seamgen project and frame it as transferable to the RFP's ask — even across industries ("we built [X], so we can do [Y]"). Ground it in `resources/proposal-sources/Proposal - Case Studies.txt`; never invent a project.
6. **Surface the custom-path play on productized RFPs.** If the RFP is framed as buying a product (SaaS/COTS) but Seamgen could deliver it as a **custom build** and the product framing is the only thing holding the score down (the rfp-scoring Gate 2 "Conditional — Ask the Agency" case), make one of the key points that recommended play: *ask the agency whether they'd consider a custom-developed solution, backed by [closest real project]*. Name the real analog(s) that prove we've built the equivalent capability, and call out the open Q&A deadline the question must beat. Real projects only. This turns the brief into a decision aid — it hands the reader a concrete way to rescue an otherwise-strong RFP instead of just passing.

### Engineer Timeline Estimate

**This section is the most Jake-specific.** Engineer estimates in the wild come as Slack messages or emails that are conversational and often contain caveats. Preserve the caveats — that's what makes the estimate useful.

**Format:** Quote the engineer verbatim, attribute by name and date. Then add a one-sentence interpretation that translates any caveats into plain language.

**Example from Chris on MDSG:**

> **Chris, [date]:** "For MDSG I'd estimate about 12-14 weeks for our side of the work (build, QA, accessibility, training, launch prep, etc). Their actual launch may depend on how fast they handle content migration though."
>
> *Interpretation for the meeting:* Seamgen's engineering effort is 12–14 weeks, but the agency-facing launch date depends on how quickly Maryland handles their own content migration — which is outside our control.

**If no estimate yet:** State that plainly. "Engineer estimate not yet requested from Chris" is more useful than skipping the section.

### Clarifying Questions (for the agency)

*This section moved here from the pursue-to-Peter email (which is now brief by design, v1.3). The meeting brief is where the starter agency-questions list lives.*

The questions come from the scoring output's "Notes for email debrief" plus a read of the RFP. Rules:

1. **5–7 questions.** Fewer than 4 looks lazy; more than 8 gets ignored.
2. **Prioritize questions that shape the proposal** (who built the current thing? in-scope vs out-of-scope? what does "ideal" look like?) over trivia.
3. **Cover four categories where possible:** incumbent/history · technical specifics (named platforms, must-integrate systems) · scope clarification (agency-provided vs. vendor-produced) · success criteria (the "what would you build without constraints?" question that reveals unstated priorities).
4. **Never ask what the RFP already answers.** Read the RFP first.
5. **AI-forward RFPs get at least one AI-specific question** (AI/AEO/GEO/chatbot/ML/agentic).
6. **Source every question** in the appendix under this section: a verbatim RFP quote + § and page, or `RFP is silent; nearest context §X` for omission-driven questions. Keep the question bullets clean; the sourcing lives in the appendix.

**Convergence note:** this starter set merges (and dedupes) with the Engineering Scope Brief's sourced "Ambiguities" later, at the agency-questions email stage — so it need not be exhaustive on *technical* ambiguities (the engineering brief supplies those). Focus on the strategic, proposal-shaping questions that also give Peter/Marianne an easy way to contribute. On a no-bid, collapse to "N/A — no-bid."

### Open Threads

A short bulleted list of anything currently pending. Don't over-explain — one line per thread. Examples:

- Awaiting Peter's response on the pursue email sent [date].
- Sent clarifying questions to [contact] on [date]; expected response [date].
- Cost sheet in first draft; Hoda has not yet reviewed.
- Chris asked whether ADA compliance is Level A or AA — waiting on our answer.

## Worked example: Maryland (MDSG) RFP

This is the state Jake described — Peter and Marianne have approved gauging the engineer timeline, Chris has estimated, and the proposal-writing decision is pending.

**Inputs (assumed):**
- Scoring output showing Strong Pursue (score fabricated for illustration).
- Chris's message: "For MDSG I'd estimate about 12-14 weeks for our side of the work (build, QA, accessibility, training, launch prep, etc). Their actual launch may depend on how fast they handle content migration though."
- Jake's provided ASK: "should I generate some questions to ask the main contact, or start writing the proposal based on their response to my outline?"

**Generated file:** `meeting-brief_2026-07-06_maryland-mdsg-website-redesign.md`

```
# Meeting Brief: Maryland (MDSG) Website Redesign

**Source (found via):** HigherGov
**HigherGov listing:** n/a — this brief predates v2.0; no link was captured at the time
**Original posting:** not identified
**Date:** 2026-07-06
**RFP #:** USMMDSG2609
**Prepared by:** Jake

*Note: this example predates v2.1, so it has no **Blockers** or **Current Solution & Desired Outcome** sections — the MDSG solicitation isn't on hand to source them from, and inventing their contents would violate the grounding rule those sections exist to enforce. For worked examples of both, see the how-to guidance above, which draws on the live Yonkers RFP-561 brief.*

---

## The Ask

Should I generate additional clarifying questions to send to the main
contact, or start writing the proposal based on the responses I've
already received?

## Where We Are

Peter and Marianne approved gauging the engineer timeline last week;
Chris has estimated 12–14 weeks for Seamgen's engineering effort;
awaiting decision on whether to start proposal development.

## Summary

Maryland Sea Grant (a University System of Maryland program) is
soliciting a full website rebuild to modernize their digital presence
and improve outreach to researchers, educators, and coastal
stakeholders. Current site is functional but dated, with content
architecture that limits discoverability. Scope covers strategy, UX,
design, build, accessibility compliance, and training.

## Key Facts

- **Agency:** University System of Maryland — Maryland Sea Grant
- **Main contact:** [Name, title, email — from RFP]
- **Questions due:** [Date/time]
- **Proposal due:** [Date/time]
- **Estimated deal size:** [$X–$Y — based on scope and comparable case studies]
- **Score:** [n]/100 — Strong Pursue

## Five Key Points

1. **Case study fit:** Contentstack and LOWY Medical website redesigns
   are the closest analogs — Seamgen has demonstrated exactly this kind
   of information-architecture-and-rebuild work.
2. **Accessibility experience:** RFP requires WCAG compliance; Seamgen
   has 508 experience through Winward Academy that maps directly.
3. **Timeline pressure — external:** Chris's 12–14 weeks fits the
   proposal-stated timeline, but launch depends on Maryland's own
   content migration speed, which is outside our control. Worth
   flagging in the proposal.
4. **No AI angle in the RFP:** Unlike USU, this RFP does not lean into
   AI/AEO/GEO. Seamgen's AI positioning is not a differentiator here —
   the pitch has to lead with design and delivery quality.
5. **Agency relationship:** No prior Seamgen work with the University
   System of Maryland; competitive dynamics unknown. Worth asking Peter
   if he knows anyone in the USM system.

## Engineer Timeline Estimate

**Chris, [date]:** "For MDSG I'd estimate about 12-14 weeks for our
side of the work (build, QA, accessibility, training, launch prep,
etc). Their actual launch may depend on how fast they handle content
migration though."

*Interpretation for the meeting:* Seamgen's engineering effort is
12–14 weeks, but the agency-facing launch date depends on how quickly
Maryland handles their own content migration — which is outside our
control.

## Open Threads

- Awaiting decision from Peter/Marianne on whether to start writing
  the proposal based on Chris's estimate.
- No further clarifying questions submitted to the agency since [date].
- Cost sheet not yet started.
```

That reads in 60 seconds at the top and answers every question Peter or Marianne is likely to ask on the way to the meeting room.

## Notes and edit history

**v2.3 — July 28, 2026, Jake + Claude.** Added a fourth beat — **"Who this looks written for"** — to *Current Solution & Desired Outcome*, carrying the wired-RFP verdict in about 80 words. Prompted by Jake being taken apart in a meeting with Peter on exactly this question, and by Peter supplying the concept that names the pattern: a **"fake RFP"** describes what it wants loosely, because a specification strict enough to name one supplier would exclude most of the market and invite a protest — so **the tell is a gap**, where the RFP names a platform or product posture and then stops short of requiring credentials in it.

**Deliberately not a new section.** v2.2 had just cut the brief from 1,000–1,500 words to 700–1,000, and adding a section would have undone that; *Current Solution & Desired Outcome* already covers build posture, so this is where the question belongs. The analysis itself lives in the new `skills/rfp-solution-landscape-skill.md` (recipe #16) — the brief carries only the verdict, the strongest tell, the strongest counter-evidence, and what the agency bought last time.

Two rules attached. **Never name the company you think will win** — describe the shape; briefs travel and an accusation is unprovable. And **if the counter-evidence line is empty, write `Insufficient evidence`** rather than a confident-looking verdict, because the failure mode here is seeing wiring everywhere once you know the concept. **⚠ The change inverts a reading already in a live brief:** the 07-26 Suwannee brief recorded "no public-sector reference minimum" as favourable, phrased as "unlike Yonkers." That same brief also holds the counter-evidence — a prior District award to a custom .NET/SQL shop at 95/100 against 20 bidders — which is why Suwannee is the calibration case in both directions.

**v2.2 — July 22, 2026, Jake + Claude.** **Removed the Required Proposal Package section entirely.** Jake's call: the briefs had grown too long, and that section is *build* material — what it takes to assemble a submission — sitting inside a *decision* document about whether to pursue at all. It is not lost; `skills/proposal-writing/rfp-submission-checklist-skill.md` (Phase 8) produces the same content in more depth, at the point where someone is actually assembling the package. Removed from the format block, the writing guidance, and the Maryland worked example; the `depends_on` line and required input #5 were reworded rather than deleted, since **Blockers** still reads the RFP directly for verbatim quotes with §/page. Length spec tightened **1,000–1,500 → 700–1,000 words**.

**The one thing that had to survive the cut:** submission mechanics that could *disqualify* us. A portal Seamgen isn't registered on, a mandatory pre-proposal conference, a sealed-cost rule — those are decision-relevant, and deleting the section without rehousing them would have quietly dropped a real blocker from the brief. Blockers guidance now says so explicitly, with the Yonkers BidNet registration gap as the worked case (`[HARD]`, owner Tina, real lead time) and a test for the boundary: *could this stop us winning, or is it just work?* Only the first belongs in the brief; affidavit inventories and letterhead rules are the checklist's job.

**Existing briefs were deliberately left unchanged.** The eight already generated are dated records of what was actually put in front of Peter and Marianne; regenerating them against a newer template would make them misrepresent what was known at the time. **`rfp-workflow-flowchart.html` still describes this skill as carrying "the Required Proposal Package (⚠ disqualifiers)" — that line is now wrong (Rules 5/7).**

**v2.1 — July 21, 2026, Jake + Claude.** Two new sections, both from Peter's feedback in that day's meeting. **(1) "Current Solution & Desired Outcome"** (after Summary) — Peter asked plainly *what are these people using right now that needs replacing?* and the brief had no answer. Three parts: **Today** (incumbent system/vendor, or explicit greenfield), **Build posture** (fully custom vs. a third-party platform Seamgen configures and integrates — which changes scope, price, and the competitive set, and links to scoring Gate 2's productized-RFP case), and **What they want out of it** (the outcome being bought, in the agency's words — *outcomes, not features*). **(2) "Blockers"** (immediately after Why We Should Pursue, as its counterweight) — every reason Seamgen wouldn't win as of today, each labelled **`[HARD]`** (disqualifying/non-responsive), **`[SOFT]`** (weakens us, survivable) or **`[UNKNOWN]`**, and each carrying the requirement verbatim + §/page, what Seamgen actually has, what would clear it, and the owner. Severity is read off the RFP's own verb — Yonkers asks for SOC 2 *"where available"* (S-9, p.15), so that's `[SOFT]`, not `[HARD]`. **Both sections mark what's known vs. unknown**, with three states (stated / unknown-Q&A-open / unknown-Q&A-closed) and a **self-consistency rule**: every "to be addressed in Q&A" item must have a matching entry in Clarifying Questions. **Grounding is mandatory in both directions** — the worked Yonkers blocker names Florida DEP as a real public-sector client rather than claiming zero experience, while still stating we can field roughly one of the three required; overstating a gap kills winnable pursuits, understating one loses bids late. **Also:** *Five Key Points* is now **fits-only** (rule 1 rewritten; concerns route to Blockers, ending the three-way duplication that buried the Yonkers reference gap), and the **length spec** moved from "400–600 words, one screen" — which briefs had exceeded for months — to **1,000–1,500 words with the top third readable in ~60 seconds**. The Maryland/MDSG worked example is explicitly marked as predating both sections rather than being backfilled with invented RFP content.

**v2.0 — July 21, 2026, Jake + Claude.** Added **two links to the brief header** — `HigherGov listing:` and `Original posting:` (the agency's own site, **named** as well as linked). Jake's reasoning: a meeting brief already exists for any opportunity worth looking at, so it's the natural home for the traceability, and naming the portal tells the reader at a glance whether Seamgen has access there. Added a **"The header links"** how-to section with a strict source chain — the RFP's `resources/_document-manifest.md` first (written by `skills/rfp-document-fetch-skill.md` v1.1), then `RFP-pipeline/candidates/<slug>/candidate.md` (`source_url` / `solicitation_url`), then ask Jake — and an explicit **never invent a URL** rule, with `n/a` / `not identified` as the honest fallbacks. The Maryland/MDSG worked example uses those fallbacks rather than fabricated links, since it predates the fields. This is the brief-side half of the change that also demoted the fetch skill's portal step from "chase it" to "record it." **Version note:** the frontmatter was stamped `1.8` while this history already carried a `v1.9` entry (the *Why We Should Pursue* section), so this change lands as **2.0** rather than reusing 1.9.

**v1.9 — July 2026, Jake + Claude.** Added a **Why We Should Pursue** section (2–3 sentences, right after The Ask) — a presentation-ready distillation of the strongest reasons to bid, so Jake can pitch the opportunity in a meeting without scrolling the whole brief. Positive/concrete (top fit + closest real case studies + structural edge like a quality-weighted evaluation or no incumbent); one honest caveat clause allowed on a qualified pursue; omitted on no-bids. Prompted by Jake wanting a quick, spoken "why we should bid" line at the top of each brief.

**v1.8 — July 2026, Jake + Claude.** Added a **Clarifying Questions (for the agency)** section to the brief (template + how-to). This is the starter agency-questions list that used to live in the pursue-to-Peter email — moved here when the pursue email was made brief (`rfp-email-pursue` v1.3: title + link, objective, why-it-fits only). The meeting brief already carried the deadlines (Key Facts → Questions due / Proposal due), so with this addition the brief is now the single home for "all the workflow detail" behind a pursue. Guidance (5–7 questions, four categories, one AI-specific on AI-forward RFPs, each sourced to a verbatim quote + §/page or "RFP is silent") carried over from the pursue skill; the convergence-with-engineering-brief note applies here now. Prompted by Jake's July 2026 direction that pursue emails stay short.

**v1.0 — July 2026, Jake + Claude.** First draft. Format designed for one-brief-per-RFP use, dropped into the prospect's Google folder. ASK field is user-provided with intelligent lifecycle-based defaults. Engineer timeline modeled on Chris's real MDSG estimate.

**v1.1 — July 2026, Jake + Claude.** Added the **Required Proposal Package** section: the specific documents, forms, exhibits, and submission mechanics the proposal must include, read directly from the RFP's submission-requirements section, with disqualifying-if-missing items flagged (⚠). Purpose: so a "should we pursue?" conversation can immediately see what actually submitting would take. Section collapses to "N/A — no-bid" for no-bids.

**v1.7 — July 2026, Jake + Claude.** Folder reorg (type-based → by-RFP): the brief now saves to the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (PDF + MD working copy), was `meeting-briefs/`. See CLAUDE.md v1.13.

**v1.6 — July 2026, Jake + Claude.** Folder reorg: briefs now save to the `meeting-briefs/` folder (PDF deliverable + MD working copy); repointed the case-study reference to the new top-level `resources/`.

**v1.5 — July 2026, Jake + Claude.** Added the **make-or-break callout** convention: when a pursuit hinges on one unresolved question (custom-vs-product, a mandatory qualification, a reference/set-aside gap, a deadline risk), lead the brief with a highlighted callout under the header, make it The Ask, and mirror it in Open Threads — so the deciding question is visible in the first two seconds. Prompted by the Cumberland County (custom-vs-product) and Cherriots (transit-reference gap) briefs.

**v1.4 — July 2026, Jake + Claude.** Added talking-point rule #6 (**surface the custom-path play on productized RFPs**): when an RFP is framed as buying a SaaS/COTS product but Seamgen could build it custom and that framing is the only thing holding the score down, the brief should recommend asking the agency whether they'd consider a custom solution, backed by the closest real project — matching the new rfp-scoring "Conditional — Ask the Agency" state. Prompted by the MSU Nursing Teaching Assignment RFP.

**v1.3 — July 2026, Jake + Claude.** Added a **Source (found via)** line to the brief header (and the worked example) so every brief shows which platform the opportunity came from — matching the new CLAUDE.md global rule.

**v1.2 — July 2026, Jake + Claude.** Added talking-point rule #5 (bridge past work generously): case-study-fit points now apply the adjacent-experience principle — closest real project framed as transferable, grounded in the clean case-study text, never invented.

**Known limitations of v1.1:**
- The "Five Key Points" number is a heuristic, not a hard rule. If an RFP has three genuinely critical points and everything else is noise, three is fine — don't pad. Judgment call.
- No handling of multi-agency or teamed proposals where two contacts and two agencies exist. If that comes up, add a variant.
- Assumes the scoring output is up to date. If the scoring was done weeks ago and material changes have happened (agency addendum, scope change), rescore before generating a brief.
- Does not include cost sheet numbers, even in later-lifecycle briefs. If cost sheet becomes a regular meeting topic, add a section.
- "Prepared by" defaults to Jake (the operator). If someone else on the team starts generating briefs, parameterize this.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
