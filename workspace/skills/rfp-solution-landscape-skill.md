---
name: rfp-solution-landscape
purpose: Before recommending pursuit, establish what commercial solutions already exist for this problem, what the winning firm probably looks like, whether the RFP appears written for a specific vendor shape ("fake RFP"), and what role — if any — Seamgen can credibly play. Feeds rfp-scoring Category 7 and the meeting brief.
audience: Written to be read by both Claude (who does the research) and a human teammate (who sanity-checks it and edits the recipe over time). The OUTPUT is written for Jake, Peter and Marianne.
version: 1.0 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (runs against its full-text score, and hands back a Category 7 input). Reads the RFP's own documents, the agency's award history, and the planholder list where a portal exposes one. Feeds rfp-meeting-brief ("Who this looks written for") and rfp-email-pursue.
---

# Solution Landscape & Wired-RFP Skill

## What this skill does

Answers the question Peter asks before he asks anything else: **who is this actually for, and are we one of them?**

Four outputs:

1. **Product landscape** — what commercial products already serve this problem, named.
2. **Likely winner shape** — a description of the firm the specification fits.
3. **Wired verdict** — `Open` / `Leaning wired` / `Wired` / `Insufficient evidence`, with evidence in **both** directions.
4. **Our viable role** — prime builder, integrator behind a product partner, or none.

## Why this exists

Peter asked for it twice, and the second time cost a meeting.

**2026-07-26** (feedback log): *"It is good to search for solution direction first. Most local governments build the workflows on top off ArcGIS."* He asked us to map requirements to commercial solutions and to find reference implementations — *"not from teh SAAS vendor but from users, this gives a lot of content."*

**2026-07-28:** Jake was taken apart in a meeting on questions this skill exists to pre-answer, and Peter supplied the concept that names the pattern.

### The "fake RFP" concept — read this before using the skill

An agency often knows which vendor it wants. It cannot say so. Writing a specification strict enough to name one supplier would exclude most of the market from the outset, which is both bad practice and an invitation to protest — so the requirements get written **loosely**, describing the desired system in general terms while the real preference *peeks through* the wording.

**The tell is a gap.** The RFP names a specific platform, ecosystem or product posture — and then stops short of *requiring* credentials in it. That gap looks like an opening. It is usually camouflage: they didn't require the credential because requiring it would be indefensible, not because they don't intend to award on it.

Two live examples:

- **Illinois DoIT/IDVA (B-53273)** — "install and implement an **established, fully operational** web-hosted SAAS," two existing government customers, and **seven scripted live demonstrations** of claim, appeal and rating workflows. You cannot demonstrate a workflow that does not already exist. This was written for a veterans-benefits product vendor, and Seamgen was never the target.
- **Suwannee River WMD (26/27-002)** — native ESRI ArcGIS integration required throughout, but **no requirement to be an Esri partner or hold Esri certifications**. Under this lens, that absence is the tell.

**⚠ This inverts a natural reading, so state it plainly in the output.** The 2026-07-26 Suwannee brief recorded "no public-sector reference minimum to trip Gate 6a" as a *favourable* fact. It may be the opposite.

**But the inversion is a hypothesis, not a conclusion.** See "Counter-evidence is mandatory" below — Suwannee also carries strong evidence *against* the wired read, and a skill that only hunts tells would call it wrong.

## When to use it

Run it **at full-text scoring, before the pursue email** — early enough to change the recommendation rather than explain a loss. In practice that means alongside `skills/rfp-document-fetch-skill.md`'s re-score, at 75+.

Also run it when:
- Peter or Marianne asks who else is bidding, or what the agency bought last time.
- An RFP names a specific commercial platform (ArcGIS, Salesforce, Tyler, Accela, OpenGov, Granicus…).
- The RFP asks for demonstrations, existing installs, or an "established" or "operational" solution.
- A planholder list becomes available (see `skills/rfp-document-refresh-skill.md` — DemandStar exposes planholders by name).

Do **not** run it on a metadata-only score. The tells live in the requirements text.

## How to use it

Say "run the solution landscape on [RFP name]."

Output goes in chat. Once the RFP is being pursued, archive a PDF in its own folder — **`RFPs/[stage]/[rfp-slug]/`** — named:

```
RFPs/[stage]/[rfp-slug]/solution-landscape_YYYY-MM-DD_[rfp-slug].pdf
```

`[stage]` is the RFP's current lifecycle tier. Save into the existing `[rfp-slug]/` folder wherever it already lives (CLAUDE.md Rule 10). Carries a **Source (found via)** line like every internal deliverable (Rule 9).

---

## Step 1 — Map the product landscape

**Question: if the agency simply bought something, what would they buy?**

Research and name real products. Where the RFP names a platform, start with that platform's own product family — vendors usually sell a packaged answer to exactly this problem.

Worked example (Suwannee): the RFP names ArcGIS throughout, so the first question is *what does Esri sell for land management?* Answer: **Parcel Fabric**, **Local Land Records**, and the app family **Land Review / Outreach Manager / Land Strategy Manager**. That reframes §5's "customized off the shelf" completely — there *is* an off-the-shelf thing being described.

Record for each product: what it covers, **what it does not cover**, and who implements it (the vendor direct, or a partner channel).

**The coverage gap is where our opportunity lives, if there is one.** On Suwannee, research found **no Esri template exists for acquisition or disposition** — two of the three modules. A product that covers one third of the scope means the winner still has to build, which is a genuine opening.

### Grounding rules — one of these has already burned us

- **Never name a product without verifying it exists.** On 2026-07-26 a ranking site (worldmetrics.org) listed "Trimble Assure" as the #1 land-management product. **It does not exist.** It was relayed to Jake before being checked. Verify against the vendor's own site or a real customer deployment before a product name enters any deliverable.
- **Prefer user-published evidence over vendor marketing** (Peter, 2026-07-26): other agencies' procurement records, award notices, published user manuals, training material, legislative and audit reports. Vendor pages tell you what a product claims; a county's training PDF tells you what it does.
- **Ranking sites and AI summaries are leads, not sources.** Chase them to a primary source or drop them.

## Step 2 — Describe the likely winner shape

**Not a company name — a shape.** "An Esri Gold partner carrying three to five named state natural-resource land systems." "A veterans-benefits SaaS vendor with existing state installs."

Build it from what the RFP rewards: the evaluation weights, the reference class it asks for, the demonstrations it requires, the credentials it names.

**Never write "Vendor X will win this" into a deliverable.** It is an accusation, it is unprovable, and these documents travel. Describe the profile; let the reader draw the conclusion.

Then ask the comparison question: **how far is Seamgen from that shape, and is the distance closeable by this deadline?** Usually it is not, which is the useful finding.

## Step 3 — Research the agency's procurement history

**Peter's question, verbatim: "Did they do a product selection and what was the outcome?"**

Findable, and it is the single best counterweight to a wired read. Look for:

- **Prior awards for comparable work** — who won, what did they build, was it a specialist or a generalist?
- **How many bidders**, and the winning score if published.
- **Whether the current system was bought or built in-house.** Illinois' CyberVet appears to be IDVA's own in-house build with no vendor behind it — which means no incumbent is defending the account, and the migration is genuinely bespoke.
- **Whether this agency has bought the named platform before.**

Worked example: **SRWMD's own last software award went to a custom .NET/SQL shop with no GIS practice, scoring 95/100 against 20 bidders.** That is direct evidence this District does not automatically hand work to the platform specialist — and it is why Suwannee is not a `Wired` verdict.

## Step 4 — The wired verdict

### Tier 1 tells (strong — any one supports `Wired`)

| Tell | Why it's strong |
|---|---|
| Requires an **"established" / "fully operational"** solution already in production | Excludes anyone building it |
| Requires **N existing installs**, especially N *government* installs | A countable barrier only incumbents clear |
| Requires **live demonstrations of specific named workflows** | You cannot demo what does not exist |
| Requirements read like **one product's feature sheet** — named modules, oddly specific feature combinations | The spec was written with a product open on the desk |
| Reference class narrowed to **the incumbent's exact profile** | Same barrier, dressed as past performance |

### Tier 2 tells (moderate — support `Leaning wired`)

| Tell | Note |
|---|---|
| **Names a platform but requires no credential in it** | Jake/Peter's insight, 2026-07-28. The gap is deliberate |
| Timeline very short relative to scope | Favours whoever already has the thing |
| Evaluation rewards installed base or locale over approach | Structural, unfixable |
| Incumbent's terminology echoed in the scope | Language leaks |

### Counter-evidence is mandatory

**Never issue a verdict on tells alone.** Look for each of these and record what you found, including "nothing found":

- **Prior awards** — did this agency actually pick a specialist last time? (Suwannee: no.)
- **Planholder composition** — are the predicted specialists showing up? (Suwannee: **none** of Timmons Group, GCS or Frontier Precision took the documents; 7 planholders total.)
- **Does a product genuinely span the scope**, or only part of it? (Suwannee: no product spans all three modules.)
- **Is there a real incumbent**, or is the current system in-house? (Illinois: in-house.)
- **Is the evaluation approach-weighted?** Suwannee puts **50 of 100 points on Work Plan & Approach** against 20 for cost — a rubric that rewards the written proposal, which is where a non-specialist can win.

Weigh planholder evidence carefully in both directions: absent specialists may mean the RFP is not wired for them — **or** that they order documents elsewhere, or have not looked yet. Say which reading the timing supports.

### Assigning the verdict

| Verdict | Rule |
|---|---|
| **`Wired`** | One or more Tier 1 tells, and counter-evidence does not rebut them |
| **`Leaning wired`** | Tier 2 tells present; counter-evidence mixed or thin |
| **`Open`** | No Tier 1 tells, or counter-evidence actively rebuts the tells |
| **`Insufficient evidence`** | The research has not been done. **Say this rather than guessing** — it is an honest state and it tells the reader the verdict line is not load-bearing yet |

## Step 5 — Our viable role

One of four, stated plainly:

- **Prime builder** — we bid as the primary, building it.
- **Integrator behind a product partner** — a named partner supplies the product and the reference class; we supply integration and migration. *Requires a named partner. "We could probably find one" is not a role* (same standard as `rfp-scoring` Gate 6a).
- **Subcontractor** — someone else primes.
- **None** — no honest path. Say it.

Where the role is integrator, check whether the product vendors **actually sell through integrators**. On Illinois they do not: Tyler Technologies (which acquired VetraSpec, so the two leading products are one vendor) and Panoramic both sell direct. That finding turned an endorsed strategy into a probable no-bid, and it took one round of research.

---

## Output format

```
SOLUTION LANDSCAPE
==================

RFP: [title] ([number])
Source (found via): [platform]
Date: [YYYY-MM-DD]
Researched from: [full text / full text + planholder list / full text + award history]

PRODUCT LANDSCAPE
-----------------
[Product name] — [what it covers] | Gaps: [what it does not] | Implemented by: [vendor direct / partner channel]
[repeat]

Coverage verdict: [does any single product span this scope? if not, what fraction?]

LIKELY WINNER SHAPE
-------------------
[Profile, not a company name.]
Distance from Seamgen: [what we'd need that we don't have, and whether it's closeable by the deadline]

AGENCY PROCUREMENT HISTORY
--------------------------
Prior comparable award: [who won, what they built, how many bidders, winning score if published / "none found"]
Current system: [bought from X / built in-house / unknown]
Has this agency bought the named platform before? [yes/no/unknown]

WIRED VERDICT: [Open / Leaning wired / Wired / Insufficient evidence]
--------------------------------------------------------------------
Tells found:
- [Tier 1 or 2] [tell] — > "[verbatim quote]" — §X, p.Y
Counter-evidence found:
- [evidence, with source]
Reasoning: [two or three sentences — why the verdict follows from both columns]

OUR VIABLE ROLE: [Prime builder / Integrator behind (named partner) / Subcontractor / None]
--------------------------------------------------------------------------------------------
[One or two sentences. If integrator: name the partner and confirm they sell through integrators.]

WHAT THIS CHANGES
-----------------
Category 7 input: [the deduction this supports, -0 to -8, with the reason]
Recommendation impact: [none / downgrade / no-bid]
For the meeting brief: [the ~80-word "Who this looks written for" paragraph]
```

---

## Worked example: Illinois DoIT / IDVA (B-53273) — `Wired`

**Tells (Tier 1, three of them):** an *"established, fully operational web-hosted SAAS"*; experience hosting the proposed solution *"for at least two (2) government customers"* (§F.2); and **seven** scripted live demonstrations of veteran intake, claim creation, electronic VA submission, issue tracking, rating decisions, appeals and long-term benefit management (§F.5).

**Counter-evidence sought:** the incumbent (CyberVet) appears to be IDVA's own in-house build, so no vendor is defending the account — genuinely favourable. But it does not rebut the tells: the requirement is still that the *proposed* solution already runs for two governments.

**Product landscape:** Tyler Technologies **acquired VetraSpec**, so what looked like two competing products is one vendor. Panoramic is the other.

**Our viable role: None, currently.** The integrator route Peter endorsed requires a partner, and **neither Tyler nor Panoramic sells through integrators**. Without one, no honest path.

**Verdict: `Wired`.** Category 7 input: **−8**. Recommendation impact: downgrade toward no-bid pending a partner.

## Worked example: Suwannee River WMD (26/27-002) — `Leaning wired`, contested

**Tells (Tier 2):** native ESRI ArcGIS integration required throughout (§5C, §5E) with **no requirement to be an Esri partner or hold certifications**; and §5's *"customized off the shelf software solution"* framing, which describes a product posture.

**Counter-evidence, and it is strong:**
- **The District's own last software award went to a custom .NET/SQL shop with no GIS practice, at 95/100 against 20 bidders.** This agency has demonstrably not auto-selected the platform specialist.
- **No Esri template exists for acquisition or disposition** — two of the three modules — and no COTS product spans the full scope.
- **7 planholders, and none of the predicted specialists** (Timmons Group, GCS, Frontier Precision) has taken the documents. *(Caveat: DemandStar orders only; the District also posts on MyFloridaMarketPlace, and three weeks remain.)*
- **50 of 100 points on Work Plan & Approach**, 20 on cost — an approach-weighted rubric rewards the written proposal.

**Verdict: `Leaning wired`, not `Wired`.** The tell is real and was previously misread as favourable; the counter-evidence is real too and is mostly primary. Category 7 input: **−3**, not −8.

**Our viable role: Prime builder** — contingent on staffing, which is the actual binding constraint here.

**This is the example to reason from when the evidence conflicts.** The instinct after learning the fake-RFP concept is to see it everywhere. Suwannee is the case where the tell is present and the agency's own behaviour contradicts it.

---

## Guardrails

- **Both errors cost, and now that this is scored, so does over-calling.** A false `Wired` kills a pursuit we could have won; a missed one spends a proposal on a decided outcome. Neither is the safe default.
- **Never name the intended winner in a deliverable.** Shapes, not companies.
- **Never invent or relay an unverified product.** "Trimble Assure" is the standing reminder.
- **`Insufficient evidence` is a real answer.** Use it rather than dressing up a guess — and say what research would resolve it.
- **The verdict is an input, not a decision.** It feeds Category 7 as a bounded deduction (max −8) and appears in the meeting brief. Peter and Marianne decide.
- **Re-run it when the planholder list changes.** A specialist appearing on the list three weeks in is new evidence.

## Notes and edit history

**v1.0 — July 28, 2026, Jake + Claude.** First version. Built after Jake was taken apart in a meeting with Peter on questions the briefs should have pre-answered, and after the **second occurrence** of the 2026-07-26 feedback-log correction — whose own note said *"If this correction appears a second time, it should promote to a skill rather than stay here."* Merges two things that are really one workflow: the market/solution scan Peter asked for on 07-26, and the **"fake RFP"** diagnostic he supplied on 07-28. The load-bearing design decisions: **counter-evidence is mandatory** (Suwannee is the worked example precisely because its tells and its agency behaviour disagree); **shapes, not company names**, in anything written down; and **`Insufficient evidence`** as a first-class verdict so an un-researched RFP can't acquire a confident-looking label. The Category 7 deduction is capped at −8 rather than made a kill gate, because wiredness is a judgement and Gate 6a's precedent — a *countable* fact — does not transfer.

**Known limitations of v1.0:**
- The Tier 1 / Tier 2 split is judgement, not data. After a dozen verdicts, check which tells actually predicted losses and re-tier.
- No handling yet of RFPs where the wired vendor is a *systems integrator* rather than a product vendor — the tells differ.
- Planholder evidence is only available where a portal exposes it (DemandStar does; most do not), so the counter-evidence step is weaker on other platforms.
- Does not yet feed `rfp-email-nobid`. A `Wired` verdict is a clean, non-defeatist no-bid reason and the email skill should learn to use it.
