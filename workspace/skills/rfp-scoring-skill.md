---
name: rfp-scoring
purpose: Evaluate whether Seamgen should pursue a Request for Proposal (RFP), using a two-stage rubric that produces a numeric score, a pursue/no-bid recommendation, and structured notes that feed downstream email templates.
audience: This skill is written to be read by both Claude (who applies the rubric) and a human teammate (who reads, sanity-checks, and edits the rubric over time).
version: 1.8 — July 2026
owner: Jake (Seamgen)
---

# RFP Scoring Skill

## What this skill does

Given an RFP, this skill produces three things:

1. **A pursue/no-bid recommendation** — the final "should we bid?" answer.
2. **A numeric score (0–100)** — how strong the fit is, on a consistent scale.
3. **Structured notes** — the specific reasons behind the score, in a format that other skills (the email templates) can use directly.

The point of the numeric score is not the number itself. It's consistency. Different RFPs, scored on the same rubric, become comparable. Over time this builds a track record that shows which categories actually predict wins — which lets us re-weight the rubric with evidence instead of guessing.

## When to use it

Use this skill any time an RFP arrives that could plausibly be a Seamgen opportunity. Typical trigger: a new email from HigherGov's daily digest, or an RFP forwarded from Peter or another teammate.

Do not use it for:
- Sources Sought or RFI notices (those are pre-RFP; a much lighter screening applies)
- Amendments to RFPs already scored (rescore only if scope changed materially)

## Light screen for RFIs & Sources Sought (not a full score)

RFIs and Sources Sought notices are **pre-solicitation** — no award results from them; they're market research the agency uses to shape a future RFP. The HigherGov prefilter kills them and they do **not** get the full weighted rubric (its gates and weights assume a live, biddable solicitation). But a genuinely on-target RFI is a **signal that a real RFP is coming**, and responding is a business-development move that puts Seamgen in front of the people who'll write it. So give each a quick three-question screen instead of a score:

1. **Is the underlying scope a real Seamgen fit?** — custom build, an ICP anchor, a capability we can bridge to a real case study. If clearly not, log the reason and stop.
2. **Is it a credible future-RFP signal?** — the notice says it may lead to a solicitation, and the scope is concrete (not a vague capability survey).
3. **Can we respond by the stated deadline?**

If yes to 1–2: recommend a **light-touch positioning response** — a short capability statement that plants Seamgen's relevant credentials — and **track it as a watch item** for the eventual RFP. It does **not** get a full score, an `RFPs/` folder, or a pursue email at this stage; it's a positioning play, not a bid. (This is exactly how the County of Orange "Street Outreach" RFI and the Ohio "AI Veterans Navigator" RFI were handled — strong underlying fit, but responded-to-position rather than bid.) If the scope isn't a fit, log it (the prefilter already writes killed RFIs to `RFP-pipeline/killed.csv`) and move on.

## How to use it

Paste the RFP (or attach the documents) and say "run the RFP scoring skill on this."

Claude will:
1. Read the RFP end-to-end, including all attachments.
2. Apply Stage 1 (Kill Gates). If any gate fails, stop and report no-bid.
3. If all gates pass, apply Stage 2 (Weighted Scoring) and produce a total score.
4. Apply the decision rules to convert the score into a recommendation.
5. Return the structured output at the bottom of this document.

---

## Stage 1 — Kill Gates

Kill gates are pass/fail questions. **If any single gate fails, the RFP is a no-bid.** No math needed. The kill gates exist to save time — they stop us from scoring an RFP that was never going to work anyway.

### Gate 1: Timeline

**Question:** Is the proposal due date at least 10 calendar days away from today?

**Why it's a kill gate:** Seamgen's proposal process (Adan's playbook, Phase 4–6) requires a workback schedule with internal review cycles, tech + UX input, cost sheet development, and design work by Hoda. Below ~10 days there isn't enough runway to produce a competitive proposal. (This floor was lowered from 21 to 10 in July 2026 once HigherGov intake was automated — sourcing now happens the day after an RFP posts instead of on a manual weekly sweep, so Seamgen sees opportunities with far more of their window intact.)

**Pass:** ≥ 10 days from today to due date.
**Fail:** < 10 days.

**Capture both dates:** While evaluating timeline, record the **proposal due date** (always present) and the **questions/Q&A due date** if the RFP posts one. Many RFPs have no formal Q&A window — in that case questions are Seamgen-initiated with no deadline. Both feed the output block and the downstream pursue email, so note which case applies.

### Gate 2: Custom build (not COTS procurement)

**Question:** Is the agency asking for a custom-built solution or significant modernization work, rather than procurement of an existing commercial off-the-shelf (COTS) product?

**Why it's a kill gate:** Seamgen's business is custom software development. RFPs that are actually product-procurement disguised as RFPs (e.g., "we want to buy Salesforce and need someone to configure it") are structurally not our game.

**Pass:** Custom build, redesign, or heavy modernization.
**Fail:** Pure COTS procurement, license reseller work, or "install and configure this product" scope.

**Edge case:** RFPs that combine COTS procurement with custom integration work (e.g., "buy X, then build custom integrations to Y and Z") can pass this gate if the custom portion is material — roughly 40%+ of the effort.

**Edge case — productized RFP with a viable custom path (don't auto-kill).** Sometimes an RFP is framed as buying a product (SaaS/COTS), yet *everything else about it would clear the pursue bar* — the product framing is the **sole** blocker. Before failing Gate 2, check two things:
1. **Would it otherwise be a pursue?** Mentally run the weighted score assuming a custom build were allowed. If it wouldn't reach "Worth a look" territory anyway, just fail the gate — the product framing isn't the real problem.
2. **Do we have a real analog?** Is there a **real** Seamgen case study showing we've custom-built an equivalent capability (the underlying capability, per the adjacent-experience principle — role-based portal, enterprise config, integrations, etc.)? Real projects only — never invent or overstate.

If both are true, **do not fail the gate outright.** Instead set the recommendation to **Conditional — Ask the Agency** (see Decision rules): recommend a clarifying question asking whether they'd consider a custom-developed solution, cite the closest real analog as proof we could deliver it, and rescore once they answer.

**Guardrails:** This only applies while the **Q&A window is still open** — if questions have closed, or the agency answers "commercial product only," it's a firm no-bid. And it hinges on a *real* precedent; if nothing real bridges, fail the gate normally.

#### Gate 2a — are we the right *kind* of company for this buy?

**Peter's question, 2026-07-28:** *"We built the last Florida project in ArcGIS, but we're a software/cloud company, not a software vendor — does it make sense to make an offer?"*

Gate 2 asks what the **agency** wants. It has never asked what **we are**. Those are different questions, and the second one has been sinking pursuits invisibly.

**Seamgen is a software and cloud services firm.** We design and build custom software for clients. We do **not** sell a product: there is no Seamgen-owned system with an installed base, a version number, a licence model or a support tier. An RFP that wants a *vendor* wants something we structurally do not have, and no amount of technical fit substitutes for it.

**Tells that the agency is buying from a product vendor, not hiring a services firm:**

| Tell | Example |
|---|---|
| "Established," "fully operational," "proven," "in production" solution | Illinois: *"install and implement an established, fully operational web-hosted SAAS"* |
| **N existing installs**, especially N *government* installs | Illinois §F.2: *"at least two (2) government customers"* |
| **Live demonstrations** of named workflows | Illinois §F.5: seven scripted workflow demos |
| Licence / subscription / maintenance-tier pricing structure | A cost form with per-seat or per-module licence lines |
| Requirements written as a product feature checklist | Named modules; oddly specific feature combinations |

**How to score it:**

- **One or two soft tells** → not a gate failure. Note it, and let Category 7 carry the competitive cost.
- **Hard tells — an existing-installs requirement or mandatory demonstrations of workflows that must already exist** → route to **Conditional — Ask the Agency** (the existing state; no new one needed). The question to ask is whether a purpose-built solution qualifies, or whether a named product partner's installs satisfy the requirement.
- **Hard tells AND no named teaming partner by the time the Q&A window closes** → **FAIL Gate 2.** We cannot become a product vendor inside a proposal cycle.

**The teaming escape is real but must be concrete** — the same standard Gate 6a sets. Name the partner, and confirm the partner **actually sells through integrators**. On Illinois, Peter endorsed the integrator route and research then found that Tyler Technologies (which had acquired VetraSpec, so the two leading products are one vendor) and Panoramic **both sell direct**. An endorsed strategy with no willing partner is not a pass.

**Do not confuse this with Gate 2 proper.** An agency can want a genuinely custom build *and* expect a product vendor to deliver it — and an agency can use product language loosely for work that is really a build. Read the *evidence obligations* (installs, demos, references), not the adjectives.

### Gate 3: Not physical goods or equipment

**Question:** Is this a software or services engagement, not a request for physical equipment, hardware-only work, or construction?

**Why it's a kill gate:** Seamgen doesn't sell hardware.

**Pass:** Software, services, or software with incidental hardware (e.g., kiosk software where the hardware is specified but supplied by others).
**Fail:** Hardware-only, construction, physical infrastructure, or equipment procurement.

### Gate 4: Submittable

**Question:** Can Seamgen actually submit this proposal by the deadline? This means (a) we have or can get an account on the required portal, and (b) submission format is achievable.

**Why it's a kill gate:** If we can't submit, everything else is academic. This gate exists because some portals require weeks-long registration.

**Pass:** We already have the account, OR the portal allows email submission, OR Tina can register us in time.
**Fail:** Portal requires registration that will take longer than we have.

### Gate 5: Minimum viable deal size

**Question:** Is the estimated project size at least $100,000?

**Why it's a kill gate:** Below $100K, the cost of pursuing (Adan's time, tech/UX input, Hoda's design work, review cycles) starts to exceed the margin, and it also crowds out capacity for larger pursuits. Set by Jake, July 2026.

**Pass:** Estimated size ≥ $100K, based on any of: stated budget, scope inference, comparable case studies, or agency history on similar work.
**Fail:** Clearly below $100K, or scope so narrow that $100K is unlikely.

**Edge case:** If the RFP explicitly says "no budget stated" and the scope could plausibly be either $50K or $500K, do not fail this gate — score it and note the uncertainty in the output. Peter can decide with more context.

### Gate 6: Qualification eligibility

**Question:** Does Seamgen meet the stated minimum qualifications and any set-aside requirements?

**Why it's a kill gate:** Katie's LA Water & Power no-bid (June 2026) is the canonical example — the RFP required specific Emergency Management certifications that no one at Seamgen holds. Bidding without qualifications wastes everyone's time and can damage the agency relationship.

**Pass:** Seamgen either meets the minimum qualifications directly, has demonstrably equivalent experience, or has a legitimate teaming partner who does.
**Fail:** Missing hard qualifications (specific licenses, certifications, degrees, or set-aside categories Seamgen doesn't hold — SBA size, 8(a), veteran-owned, local vendor if geographically restricted).

**Common set-asides to check:** Small Business, 8(a), Woman-Owned, Veteran-Owned, HUBZone, Local Vendor Preference.

#### Gate 6a — the public-sector reference ceiling (check this every time)

**Seamgen can field roughly ONE clean public-sector reference.** This is a standing company fact, not a per-RFP judgement, and it has killed real pursuits:

- **Florida DEP** (state agency — Sea Level Rise Projection / GIS platform) is the one unambiguous government client.
- **U.S. Endowment for Forestry and Communities** is a **nonprofit**, not a government agency, though the work met NIST 800 / FITARA / FISMA. Arguable, not clean.
- Nothing else in `resources/proposal-sources/Proposal - Case Studies.txt` is a public-sector client. (Viasat serves government aircraft but is a commercial customer.)

**Distinguish two very different requirements — this is the crux:**

| The RFP asks for | Verdict |
|---|---|
| N references of **any** kind ("four most recent completed projects") | **Fine.** Seamgen has a deep commercial reference bench. Not a blocker. |
| **1–2 governmental / public-sector** references | Tight but workable — FDEP, plus U.S. Endowment if the RFP's wording admits nonprofit or federally-compliant work. Flag it. |
| **3 or more governmental / public-sector** references | **FAIL Gate 6** unless a named teaming partner supplies them. We cannot cover three. |

**Why this is a gate and not a deduction.** Yonkers scored 88 on full text with the three-reference requirement (§IV.F, p.19) already known and flagged in the brief — and was still recommended as a Strong Pursue, because a reference gap noted in prose doesn't move a number. Jake later declined it on exactly that basis. A requirement Seamgen provably cannot meet is a kill gate; the rubric already says so for certifications, and references are no different.

**The teaming escape is real but must be concrete.** "We could probably find a partner" is not a pass. Name the partner, or fail the gate.

**Never claim public-sector experience we don't have to clear this gate.** Overstating the reference bench is the one failure mode that survives scoring and then loses the bid at evaluation — or worse, wins it dishonestly.

**Seamgen's known qualifications** (verify these are still current before relying on them):
- GSA Schedule 70 certified
- SBA-certified Small Business
- Microsoft Cloud Solution Provider
- NAICS codes: 541511, 541512, 541513, 541519, 511210

**⚠ Seamgen holds NO Esri certifications.** This list said "Esri certified" until 2026-07-28, and so did `tools/highergov-config.json`. It was wrong. Seth Lutske — one of the two engineers who make up the entire GIS bench — confirmed on 2026-07-27 that he holds none, and no other holder has ever been named. An Esri **technical certification** is an individual, exam-based credential; an Esri **partner** agreement is a company-level commercial relationship. They are different things, and only the second is even plausibly claimed (in `Proposal - Assets.txt`, still **unverified with Marianne**).

This mattered: the false claim contributed the point that took Suwannee River WMD from 82 to 83. **Never restore a certification claim without naming who holds it**, and never let an unverified partner relationship be scored as a certification.

### Sensitive-industry flag (not a kill gate)

If the RFP falls into a category that might make Peter uncomfortable — defense/weapons, tobacco, gambling, adult content, firearms, or similar — **do not auto-kill.** Note it prominently in the output so it appears in the email debrief. Peter and Marianne decide.

---

## Stage 2 — Weighted Scoring (100 points)

Apply this only if all six kill gates passed. Score each category on its own scale, then sum to get the total.

### Category 1: Case Study Match (25 points)

**Question:** How closely does this RFP resemble something Seamgen has already built successfully?

**Why 25 points:** This is the single strongest predictor of a win. If Seamgen has a near-clone case study, we can write a proposal that says "we've done exactly this before, here's the outcome." That's very hard to compete with.

**The adjacent-experience principle (default to a bridge).** RFPs often ask for experience Seamgen hasn't done *in that exact domain*. Do not treat that as a miss. Actively hunt the **closest real project** in the case-study library and frame it as transferable capability: *"Seamgen built [real project], which demonstrates we can do [the RFP's ask]."* Bridge on the underlying **capability** — secure role-based portal, GIS/mapping, AI/data consolidation, high-traffic public app, compliance build — not the surface industry. A remote-but-real analog is a positive to be swung our way, not a zero.

**Guardrails:** The precedent must be a **real** project in the case-study library — never invent one or overstate it. If the bridge is a genuine stretch, score it in the lower bands and label it "adjacent / transferable," not a direct match. Reserve the bottom band only for RFPs where *nothing real* connects (rare — most software work bridges somewhere).

**Scoring:**
- **25 pts** — Near-clone of a specific case study (e.g., "patient portal for a healthcare provider" maps directly to HCP, Compulink, Aetna).
- **18–24 pts** — Same core capability, different vertical (e.g., "state government portal" when the portals we've built are local-government or healthcare).
- **12–17 pts** — Adjacent capability that transfers cleanly (e.g., "AI-driven case management" bridged from our AI referral/risk work at HCP and WellMed; a government mapping ask bridged from FDEP's GIS / sea-level tool).
- **6–11 pts** — Remotely similar: a real but distant analog. Still frame it positively as transferable — "we've done [X], so we can do [Y]."
- **0–5 pts** — Genuinely nothing real connects. Rare; use only after actually checking for a bridge.

**Reference — read the real library, don't rely on memory.** The full case-study library now lives as clean text at `resources/proposal-sources/Proposal - Case Studies.txt` — read it directly to find the closest real precedent and quote the actual project. The index below is a fast starting map (categories, as of July 2026), not a substitute for the file:
- Healthcare portals: Aetna/Active Health, HCP, Compulink, Solara, MedImpact, WellRx, WellMed, Genalyte, Regen Med, InsideOut, Arli, Braincorp, Epic Sciences
- Government / environmental with compliance: FDEP (sea-level rise / GIS), US Endowment (NIST 800, FITARA, FISMA)
- Data platforms + AI: Trovata, Stratax, Inspire Investing, eLEAF, Braincorp, HCP & WellMed (AI in production)
- Consumer / hospitality / high-traffic: SeaWorld, Omaha Steaks, San Diego Zoo, Comic Con (1M+ peak users), Kia, Contentstack, Luxury Card, PAR Tech
- Fintech: Trovata, CUSO, Real Estate Lab, Arrowhead Insurance, Aldera
- Learning / LMS: Winward Academy, Coaching.com, JBU, Full Measure Education, Referral Maker
- Website redesigns: Contentstack, LOWY Medical, Luxury Card, Holonis

**CEO connection override:** If case study match is low but Peter has a relevant connection or capability outside the case studies, note this in the output. It does not raise the score — but it flags that the low score alone should not disqualify the RFP.

### Category 2: Agency Type Fit (15 points)

**Question:** Does the issuing agency match Adan's ICP anchors?

**Adan's ICP anchors** (from the playbook):
- State & Local Government
- Education (DOE-type, state universities, community colleges)
- Utilities & Infrastructure
- Public Healthcare

**Scoring:**
- **15 pts** — Direct match to one of the four anchors.
- **10–13 pts** — Adjacent (federal civilian agency where Seamgen's GSA Schedule 70 applies; large private healthcare).
- **5–9 pts** — Private sector in a domain Seamgen has case studies in.
- **0–4 pts** — Agency type where Seamgen has no proof points.

### Category 3: Tech Stack Alignment (15 points)

**Question:** How closely does the required tech stack match what Seamgen has built with before?

**Seamgen's proven stack:**
- Cloud: Azure (heavy), AWS
- Frontend web: React, Angular, Vue
- Frontend mobile: iOS/Swift, Android/Kotlin, React Native, Xamarin, Flutter
- Backend: .NET Core, Java, Node.js
- Data: PostgreSQL, SQL Server, Oracle, MongoDB
- AI/ML: OpenAI, Azure AI, Google Vertex AI, Amazon Bedrock, Cohere
- Salesforce integration
- GIS: Esri / ArcGIS — **real delivery experience, no certifications.** The FDEP engagement wrote attributes back into the client's own on-premises ArcGIS Enterprise, with public layers on ArcGIS Online. Two engineers (Seth Lutske, Pete Nystrom) have done this work and neither bio records it. Score the *experience*; do not score credentials we don't hold (see Gate 6).
- Design: Figma, Sketch

**Scoring:**
- **15 pts** — Required stack is a subset of what Seamgen uses daily.
- **10–14 pts** — Mostly known tech with one or two adjacent items (e.g., a specific Java framework Seamgen hasn't used).
- **5–9 pts** — Half the stack is new territory.
- **0–4 pts** — Required stack is largely unfamiliar (e.g., Ruby-on-Rails-only shops, legacy mainframe work).

**Note:** RFPs are often technology-agnostic ("we want a modern web platform"). In that case, score based on whatever Seamgen would propose — typically 13–15 pts.

### Category 4: AI / Agentic Angle (10 points)

**Question:** Does this RFP have an AI, machine learning, chatbot, or intelligent-workflow component?

**Why it's a category:** Seamgen's website explicitly positions the firm around the "AI Agentic Era." RFPs that let Seamgen showcase AI work reinforce the positioning and, when the agency is AI-curious, differentiate strongly.

**Scoring:**
- **10 pts** — AI is central to the scope (e.g., "AI Pre-Plan Check Assistant", "Answer Engine Optimization").
- **6–9 pts** — AI is a named component but not the centerpiece (e.g., "chatbot for public users").
- **3–5 pts** — AI is a nice-to-have or implied opportunity (e.g., analytics-heavy scope where AI could be added).
- **0–2 pts** — No AI angle at all.

### Category 5: Deal Size Fit (10 points)

**Question:** Does the estimated project size fall in Seamgen's sweet spot?

**Sweet spot:** Roughly $250K–$3M based on the distribution of past case studies.

**Scoring:**
- **10 pts** — Estimated size $250K–$3M.
- **7–9 pts** — Estimated size $100K–$250K, or $3M–$5M.
- **4–6 pts** — Estimated size $5M–$10M (large, more complex to win but not impossible).
- **1–3 pts** — Above $10M (very large, competitive with larger firms).
- **0 pts** — Size is unstated and can't be inferred above ~$100K with any real confidence — it cleared Gate 5 only because an unstated budget never auto-fails (the Gate 5 edge case), so the deal may still be too small to be worth the pursuit cost. Use this **only** for genuinely uncertain-and-possibly-tiny scopes; any size we can reasonably infer belongs in a band above.

**When size is not stated:** Infer from scope and comparable case studies. Note the uncertainty explicitly in the output.

### Category 6: Compliance Fit (10 points)

**Question:** Does the required compliance regime match compliance work Seamgen has already delivered?

**Seamgen's demonstrated compliance experience:**
- HIPAA (multiple healthcare clients)
- NIST 800, FITARA, FISMA (US Endowment)
- Section 508 accessibility (Winward Academy)
- GDPR (Winward Academy)
- Cybersecurity work (HCP)
- ADA (multiple website projects)

**Scoring:**
- **10 pts** — Required compliance is directly demonstrated in prior work.
- **6–9 pts** — Similar compliance regime; Seamgen has done adjacent work (e.g., FedRAMP when we've done FISMA).
- **3–5 pts** — Standard compliance requirements no software firm would balk at (basic data security, standard state IT policies).
- **0–2 pts** — Unfamiliar or unusually stringent compliance (e.g., CMMC Level 3, ITAR, specific state healthcare frameworks Seamgen hasn't touched).

### Category 7: Competitive Position (10 points)

**Question:** How well-positioned is Seamgen versus likely competitors on this specific opportunity?

**Signals to check:**
- Is there a strong incumbent vendor? (Check HigherGov award history if available.)
- Is the Q&A window still open? (Open = we can shape requirements.)
- Has Seamgen worked with this agency before?
- Do Seamgen's unique qualifications apply (GSA Schedule 70, SBA, Microsoft CSP)? **Not Esri — we hold no Esri certifications** (see Gate 6).
- Is this a set-aside that favors Seamgen (small business, HUBZone if applicable)?
- **What does the proposal itself cost to produce, and is anything scored against us structurally?** (See below.)

**Qualification burden and structural disadvantage — deduct for these.** The rubric measures fit and winnability; until v1.7 it measured nothing about what a proposal *costs to write*, so a high-effort, low-probability pursuit could score the same as a cheap, likely one. Two things to look for:

- **Effort multipliers.** A lengthy security or vendor questionnaire is normal; one that must be completed **once per option offered** is not. South Dakota DOE requires a separate cost proposal, a separate Exhibit E Security & Vendor Questionnaire *(83 KB, in MS Word)*, and a separate solution diagram **for each of up to three hosting models** — offering all three roughly triples the work. Its §5.7 also warns that failing to fully respond *"may bar the State from contracting with"* us, so the questionnaire is not optional detail. Other multipliers: per-module pricing sheets, mandatory demos or sandboxes before award, hardcopy-only submission with many sealed copies.
- **Structural disadvantages we cannot fix.** Explicitly scored locale or local-presence points are the common case — South Dakota assigns **5 points to "availability to and familiarity with the project locale,"** which a California firm simply forfeits. Also: incumbent-favouring language, references restricted to a state or sector, and evaluation weightings that reward installed base over capability.

**How to score it:** treat a genuine effort multiplier or an unfixable scored disadvantage as **−2 to −4 on this category**, and say so in the reasoning. If a single opportunity carries *both* — a tripled proposal workload and points we forfeit by geography — that is a strong signal to pass even when the technical fit is excellent, because the expected value of the pursuit is poor. Surface it in the output's notes, and in the meeting brief's **Blockers** section, so a human decides with the cost visible.

**Do not confuse burden with disqualification.** A long questionnaire we *can* complete is a cost, not a gate. It belongs here, as a deduction. Only route it to Gate 6 if it demands a qualification, certification, or reference class Seamgen genuinely lacks.

#### The wired-RFP read — required on every full-text score

**An agency often knows which vendor it wants and cannot say so.** Writing a specification strict enough to name one supplier would exclude most of the market from the outset — bad practice, and an invitation to protest. So the requirements are written **loosely**, and the real preference *peeks through* instead. Peter named this pattern on 2026-07-28; Seamgen's shorthand for it is a **"fake RFP."**

**The tell is a gap: the RFP names a platform, ecosystem or product posture, then stops short of *requiring* credentials in it.** That absence reads like an opening. It is more often camouflage — the credential wasn't required because requiring it would be indefensible, not because they don't intend to award on it.

**⚠ This inverts a natural reading.** The 2026-07-26 Suwannee brief recorded "no public-sector reference minimum to trip Gate 6a" as *favourable*. It may be the opposite. Do not let the absence of a hard requirement score as an advantage without checking who the specification actually fits.

**`skills/rfp-solution-landscape-skill.md` (recipe #16) owns this analysis** — the tells, the mandatory counter-evidence step, the agency's award history, and the verdict itself. This category **consumes** its verdict; it does not re-derive it.

| Verdict from #16 | Category 7 effect |
|---|---|
| **`Open`** | No deduction |
| **`Leaning wired`** | **−2 to −4** |
| **`Wired`** | **−5 to −8** |
| **`Insufficient evidence`** | No deduction — but say so explicitly, and treat the score as provisional on this point |

**State the verdict in the output every time**, even when it's `Open`. The whole reason this is now scored rather than narrated is Yonkers: it reached 88 with its blocking fact already written in the brief, because prose doesn't move a number.

**Why a bounded deduction and not a kill gate.** Gate 6a is a gate because a reference count is *countable* — the RFP demands three, we hold one, done. Wiredness is a **judgement**, and both errors cost: a false `Wired` kills a pursuit we could have won, a missed one spends a proposal on a decided outcome. Capping at −8 lets a strong opportunity survive a suspicious read, and forces the reasoning into the open where Peter and Marianne can overrule it.

**Suwannee is the calibration case.** Its ArcGIS specification with no credential requirement is a real Tier 2 tell — but the District's own last software award went to a **custom .NET/SQL shop with no GIS practice, at 95/100 against 20 bidders**, no product spans the three-module scope, and **none** of the predicted Esri specialists has taken the documents. That is `Leaning wired` (−3), not `Wired`. If a read produces `Wired` on tells alone, the counter-evidence step was skipped.

**Scoring:**
- **10 pts** — Multiple favorable signals: no strong incumbent, Q&A open, prior relationship, unique qualifications apply.
- **7–9 pts** — Two or three favorable signals.
- **4–6 pts** — Neutral position, no clear advantages or disadvantages.
- **1–3 pts** — Strong incumbent, Q&A closed, no prior relationship.
- **0 pts** — Sole-source language, or a `Wired` verdict the counter-evidence could not rebut.

Apply the effort/structural deductions and the wired deduction **to the band score**, floored at 0. Show the arithmetic in the reasoning — e.g. *"7 favourable-signal base, −3 leaning-wired, −2 locale points forfeited = 2/10."*

### Category 8: Timeline Comfort (5 points)

**Question:** Beyond the 10-day minimum from Gate 1, how much runway do we actually have?

**Why it's separate from the kill gate:** Passing the 10-day minimum doesn't mean the timeline is comfortable. An RFP just over the gate still stresses the team. This category rewards RFPs with more room.

**Scoring:**
- **5 pts** — 30+ days from today to due date.
- **4 pts** — 21–29 days.
- **3 pts** — 16–20 days.
- **2 pts** — 11–15 days.
- **0 pts** — 10 days (barely passed the gate).

---

## Decision rules

Convert the total score to a recommendation:

| Total score | Recommendation | What happens next |
|---|---|---|
| **75–100** | **Strong Pursue** | Draft the pursue-to-Peter email. Add to shortlist for review with Peter and Marianne. |
| **50–74** | **Worth a look** | Present to Peter with score breakdown; recommend a 15-minute conversation before deciding. |
| **0–49** | **No-bid** | Draft the no-bid email. Log reason in HubSpot as "No Bid / Passed" with the specific weak categories. |

**One conditional state** (from the Gate 2 "productized RFP with a viable custom path" edge case):

| Result | Recommendation | What happens next |
|---|---|---|
| **Gate 2 would fail, but only the product/SaaS framing blocks an otherwise-pursue RFP, and a real Seamgen analog exists** | **Conditional — Ask the Agency** | Before passing: send the agency a single clarifying question (via the agency-questions skill) asking whether they'd consider a custom-developed solution, citing the real analog. Must go out before the Q&A deadline. If they say yes → rescore (likely pursue). If they say "commercial product only," or the window has closed → no-bid. |

### Two overrides

**Override 1: CEO connection wildcard.** If Peter has a relevant connection or capability outside Seamgen's case studies that changes the fit, note this in the output. It doesn't change the score, but it flags that a low score alone should not disqualify the RFP. Peter decides.

**Override 2: Sensitive industry flag.** If the RFP falls into a category that might make Peter uncomfortable (defense/weapons, tobacco, gambling, etc.), surface it prominently in the output regardless of score. Peter and Marianne decide.

---

## Scoring confidence — every score is one of two kinds

A score is only as good as what it was scored from, and the output must say which it was.

- **`metadata-only`** — scored from a HigherGov intake summary, with no solicitation document read. The HigherGov API returns a paragraph, and it is routinely sparse: `description_text` and `ai_summary` are each null on roughly 2 of 5 records, and the contact on 3 of 5. The RFP number, the due *time*, the contact block, and the real scope usually live **inside the document text**, which means Gate 2 (custom vs. COTS), Gate 4 (submittable), Gate 5 (deal size) and Category 1 (case-study match — 25 of the 100 points) are all being judged on thin evidence.

  **A metadata-only score is provisional. Say so, in the output and in any email that quotes it.** It is a filter for deciding what deserves a real look — never the basis for a bid/no-bid Peter acts on.

- **`full-text`** — scored after reading the actual solicitation and its attachments. This is the real score.

**Getting from one to the other:** run `skills/rfp-document-fetch-skill.md`, which pulls the agency's documents into the RFP's `resources/` folder and hands them back for a full-text re-score. Current practice is to fetch documents at **75+ (Strong Pursue)**.

**Expect the score to move.** Full text regularly surfaces things a summary omits — a mandatory on-site presence, a set-aside, a disqualifying certification, a much larger or smaller scope than implied. A re-score that changes the recommendation isn't an error; it's the point.

**When a field genuinely isn't available, write `unknown` — never guess and never invent a reassuring default.** The clearest case is the **questions/Q&A due date**, which the HigherGov API does not carry at all. Writing "None posted" for it would be a fabrication: "no Q&A window exists" and "we haven't read the document that would tell us" are different claims, and the "Conditional — Ask the Agency" path depends on that date being real. On a metadata-only score, that field is `unknown` until a document says otherwise.

---

## Output format

The skill produces this structured block (delivered in chat). Downstream email templates read from it directly. When an **archival PDF** is also saved for the record (do this once an RFP is being pursued), it goes in that RFP's own folder — **`RFPs/[stage]/[rfp-slug]/`** — named `RFPs/[stage]/[rfp-slug]/rfp-score_YYYY-MM-DD_[rfp-slug].pdf`. `[stage]` is the RFP's current lifecycle tier (`1-pre-submission` / `2-intermediate-stage` / `3-building` / `4-submitted`) — save into its existing `[rfp-slug]/` folder wherever it already lives; create it under `1-pre-submission/` only if the RFP has no folder yet. (See CLAUDE.md Rule 10: every deliverable for a pursued RFP lives in that one per-RFP folder.)

```
RFP SCORING OUTPUT
==================

RFP Title: [full title]
RFP Number: [ID number]
Issuing Agency: [agency name]
Agency point of contact: [name, title, email — the designated RFP contact; "not stated" if the RFP names none]
Source: [which portal or how it came in]
Date scored: [today's date]
Scoring confidence: full-text / metadata-only  [see "Scoring confidence" below — required]
Proposal due date: [date + time + time zone]
Days until due: [number]
Questions due date: [date + time + time zone, IF the RFP posts a formal Q&A deadline / "None posted — questions would be Seamgen-initiated" IF the document confirms there is no Q&A window / "unknown" IF scoring metadata-only, where the field simply isn't available]

KILL GATES
----------
Gate 1 (Timeline): PASS / FAIL — [one-line reason]
Gate 2 (Custom build): PASS / FAIL — [one-line reason]
  Gate 2a (Company-type fit): PASS / FAIL / CONDITIONAL — [is the agency hiring a services firm or buying from a product vendor? name the hard tells — existing-installs requirement, mandatory demos of existing workflows — and the named teaming partner if that's the pass route]
Gate 3 (Not physical goods): PASS / FAIL — [one-line reason]
Gate 4 (Submittable): PASS / FAIL — [one-line reason]
Gate 5 (Minimum $100K): PASS / FAIL — [one-line reason]
Gate 6 (Qualification eligibility): PASS / FAIL — [one-line reason]
  Gate 6a (Public-sector reference ceiling): PASS / FAIL / N-A — [how many government references the RFP demands vs the one clean one Seamgen holds (FDEP); name the teaming partner if that's the pass route]

Sensitive-industry flag: NONE / [describe]

If any gate FAILED, stop here. Recommendation = No-bid.
Skip the weighted scoring. Go to "Notes for email debrief" below.

WEIGHTED SCORE (only if all gates passed)
------------------------------------------
Case Study Match: [n]/25 — [reasoning + case studies cited]
Agency Type Fit: [n]/15 — [reasoning]
Tech Stack Alignment: [n]/15 — [reasoning]
AI / Agentic Angle: [n]/10 — [reasoning]
Deal Size Fit: [n]/10 — [reasoning + estimated size]
Compliance Fit: [n]/10 — [reasoning]
Competitive Position: [n]/10 — [reasoning + signals observed + the arithmetic if any deduction applied]
Timeline Comfort: [n]/5 — [reasoning]
TOTAL: [n]/100

Wired-RFP read: Open / Leaning wired / Wired / Insufficient evidence — [the tells found, the counter-evidence found, and the deduction applied. Required on every full-text score, including when the answer is Open. Source: skills/rfp-solution-landscape-skill.md]

CEO connection wildcard: YES / NO — [if yes, describe]

RECOMMENDATION
--------------
[Strong Pursue / Worth a look / No-bid / Conditional — Ask the Agency]
[If "Conditional — Ask the Agency": name the sole blocker (product/SaaS framing), the real analog that proves we could build it custom, and the Q&A deadline the question must beat.]

Notes for email debrief:
- [Key strengths — for pursue emails]
- [Key concerns or disqualifiers — for no-bid emails]
- [Open questions for the agency — starter list for clarifying-questions email]
- [Anything Peter and Marianne should specifically know]
```

---

## Worked example: Utah State University Online Website Redesign (RFP #DG012336)

The following is a real RFP scored to demonstrate how the rubric applies in practice. This example was scored retroactively — the RFP was pursued by Katie in June 2026 and the outcome is unknown at the time this skill was written.

```
RFP SCORING OUTPUT
==================

RFP Title: USU Online Website Ecosystem Redesign & Rebuild
RFP Number: DG012336
Issuing Agency: Utah State University (Purchasing Services)
Agency point of contact: David Green, Purchasing (david.green@usu.edu)
Source: HigherGov
Date scored: July 6, 2026
Proposal due date: July 6, 2026 by 3:00 PM MST
Days until due: 0 — but this is a backtest; RFP was scored retroactively for the day it was received (June 1)
Questions due date: June 22, 2026 by 3:00 PM MST (formal Q&A window posted)

KILL GATES (evaluated as of receipt, June 1, 2026)
--------------------------------------------------
Gate 1 (Timeline): PASS — 35 days from issue to due date
Gate 2 (Custom build): PASS — full website ecosystem redesign, custom UX and information architecture
Gate 3 (Not physical goods): PASS — software/services only
Gate 4 (Submittable): PASS — email submission (david.green@usu.edu), no portal registration required
Gate 5 (Minimum $100K): PASS — website ecosystem redesign of this scope typically $200K–$500K based on comparable case studies (Contentstack, LOWY, USU-scale)
Gate 6 (Qualification eligibility): PASS — Seamgen meets all listed minimums (3+ years experience, 3+ comparable projects, UX/conversion expertise, AI discoverability experience via Winward AEO work, project management processes, references available)

Sensitive-industry flag: NONE

WEIGHTED SCORE
--------------
Case Study Match: 20/25 — Winward Academy (e-learning platform for students, 508/GDPR compliance), Contentstack website redesign, and Coaching.com LMS all directly relevant. Not a perfect clone but multiple strong analogs.

Agency Type Fit: 15/15 — Higher education is one of Adan's four ICP anchors (DOE-type / education).

Tech Stack Alignment: 14/15 — RFP is stack-agnostic. Seamgen would propose React + Figma + modern web architecture, dead-center in the demonstrated stack.

AI / Agentic Angle: 10/10 — RFP explicitly names SEO + AEO (Answer Engine Optimization) + GEO (Generative Engine Optimization). Directly matches Seamgen's AI positioning.

Deal Size Fit: 8/10 — Not stated. Comparable projects suggest $200K–$500K, inside sweet spot but at the low end.

Compliance Fit: 8/10 — Utah E-verify + University Website Policy (accessibility). Standard state IT compliance. Seamgen has 508 experience directly.

Competitive Position: 7/10 — No incumbent named in the RFP. Q&A window still open at time of receipt. No stated prior relationship with USU. Standard competitive dynamics for higher-ed procurement.

Timeline Comfort: 3/5 — 35 days from issue is workable but not luxurious. Puts pressure on cost-sheet development.

TOTAL: 85/100

CEO connection wildcard: NO known connection noted.

RECOMMENDATION
--------------
Strong Pursue.

Notes for email debrief:
- Key strengths: AI discoverability is central to the RFP and central to Seamgen's positioning. Higher-ed vertical is an Adan ICP anchor. Multiple relevant case studies (Winward, Contentstack, Coaching.com).
- Key concerns: 35-day timeline is workable but not comfortable — recommend fast-tracking tech + UX input. Deal size unstated; if scope inflates during Q&A, revisit.
- Open questions for the agency (starter list):
  * Who created the existing website, and are they being considered for the redesign?
  * Which specific AI search platforms (ChatGPT, Perplexity, Gemini) is USU most concerned with for AEO/GEO?
  * Does the University have a preliminary list of "commonly searched questions" or AI-generated queries the new content strategy must address?
  * Which CMS does USU currently use, and is there a requirement to remain on that platform?
  * What specific digital learning technologies or student support tools must the ecosystem integrate with?
  * To what extent will the University provide content, versus expecting the partner to build content architecture?
- Anything Peter should know: This RFP is unusually explicit about AI-driven search optimization as a core requirement, which is rare in higher-ed website RFPs. Strong opportunity to lead with Seamgen's AI positioning.
```

---

## Notes and edit history

**v1.8 — July 28, 2026, Jake + Claude.** Prompted by Jake being taken apart in a meeting with Peter on questions the rubric had no way to ask. Three changes plus a factual correction.

**(1) The wired-RFP read is now scored, and required.** Category 7 previously carried the concept in a single 0-point band — *"wired for someone else (sole-source language…)"* — which in practice never fired, because sole-source language is rare and the real pattern is subtler. Peter supplied the pattern and the name: a **"fake RFP"** describes what it wants loosely, because a specification strict enough to name one supplier would exclude most of the market and invite a protest. **The tell is a gap — the RFP names a platform or product posture and then stops short of requiring credentials in it.** The analysis itself lives in the new `skills/rfp-solution-landscape-skill.md` (recipe #16); this category consumes its verdict as a bounded deduction (`Leaning wired` −2 to −4, `Wired` −5 to −8) and the output now carries a **`Wired-RFP read:`** line on every full-text score, including when the answer is `Open`. **Deliberately not a kill gate:** Gate 6a is a gate because a reference count is countable, whereas wiredness is a judgement, and a false positive kills a winnable pursuit with no appeal. **⚠ The change inverts a natural reading** — the 07-26 Suwannee brief scored "no public-sector reference minimum" as favourable, and it may be camouflage. Suwannee is the calibration case in both directions: the tell is real, but the District's own last award went to a custom .NET/SQL shop with no GIS practice at 95/100 against 20 bidders, so it lands at `Leaning wired` (−3), not `Wired`.

**(2) New Gate 2a — are we the right *kind* of company?** Peter's question: *"we're a software/cloud company, not a software vendor — does it make sense to make an offer?"* Gate 2 has always asked what the **agency** wants and never what **we are**. Seamgen sells custom software services; it owns no product with an installed base, a licence model or a support tier. Requirements that oblige a bidder to *evidence* a product — N existing installs, live demonstrations of workflows that must already exist — are asking for something no proposal can manufacture. Soft tells cost points in Category 7; hard tells route to the existing **Conditional — Ask the Agency** state; hard tells with no named partner by the Q&A close **fail the gate**. The teaming escape carries Gate 6a's standard *and one more check*: confirm the partner **sells through integrators at all**. Illinois is the worked case — Peter endorsed the integrator route, and research then found Tyler (which had acquired VetraSpec, making two apparent products one vendor) and Panoramic both sell direct.

**(3) Corrected a live factual error: Seamgen holds NO Esri certifications.** Gate 6's qualifications list said "Esri certified (GIS work)" and Category 3 said "GIS: Esri (certified)". Both were wrong, as was `tools/highergov-config.json`. Seth Lutske — one of the two engineers who are the entire GIS bench — confirmed on 2026-07-27 that he holds none, and no holder was ever named. An Esri **certification** is an individual exam credential; an Esri **partner** agreement is a company relationship, and only the second is even claimed (in `Proposal - Assets.txt`, still unverified with Marianne). The false claim contributed the point that took Suwannee from 82 to 83. Category 3 now describes the **real delivery experience** instead — FDEP attribute write-back into the client's own on-premises ArcGIS Enterprise — with an instruction to score experience, not credentials we don't hold. Standing rule added: **never restore a certification claim without naming who holds it.**

**Also:** Category 7 deductions now show their arithmetic in the reasoning, so a 2/10 reads as *"7 base, −3 leaning-wired, −2 locale"* rather than an unexplained number.

**v1.7 — July 22, 2026, Jake + Claude.** Prompted by Jake declining **Yonkers** (over its three-public-sector-reference requirement) and **South Dakota DOE** (over qualification burden). Both had scored as pursues — Yonkers at 88 on full text — with the blocking facts already *written in the brief but not reflected in the number*. Two changes so those facts now bite. **(1) New Gate 6a — the public-sector reference ceiling.** Encodes as a standing company fact that Seamgen has **one** clean government reference (Florida DEP); the U.S. Endowment carbon tool is a nonprofit despite meeting NIST 800/FITARA/FISMA. A demand for **3+ governmental/public-sector references now FAILS Gate 6** unless a *named* teaming partner supplies them. Crucially it distinguishes this from a generic reference requirement — South Dakota's "four most recent completed projects" is fine, because Seamgen's commercial reference bench is deep; Yonkers' "three governmental or public-sector references" is not. Added to the output block as its own line. **(2) Category 7 now scores proposal-effort burden and unfixable structural disadvantage** (−2 to −4). Until now the rubric measured fit and winnability but nothing about what a proposal *costs to write*, so a tripled workload scored the same as a cheap one. South Dakota is the worked example: a separate cost proposal, Exhibit E security questionnaire and solution diagram **per hosting option (up to three)**, with §5.7 warning that an incomplete response "may bar the State from contracting," plus **5 evaluation points for project-locale familiarity** that a California firm forfeits outright. Both signals together are a pass signal even on excellent technical fit. Guardrails: burden is a deduction, never a gate, unless it demands a qualification Seamgen actually lacks; and the reference ceiling must never be cleared by overstating public-sector experience.

**v1.6 — July 21, 2026, Jake + Claude.** The long-deferred **document-grounded scoring update**, unblocked the day the Chrome browser bridge went live and `skills/rfp-document-fetch-skill.md` (recipe #11) made full-text scoring actually reachable. Two additions: **(1)** a new **"Scoring confidence"** section and a required `Scoring confidence: full-text / metadata-only` line in the output block — the state already existed in `RFP-pipeline/candidates/<slug>/candidate.md` but the scoring output had nowhere to record it, so a provisional score and a real one were indistinguishable once quoted into an email. **(2)** **`unknown`** is now a permitted state for *Questions due date*. The HigherGov API doesn't carry that field at all, so the old output block — which only allowed a date or "None posted" — forced a fabrication on every metadata-only score, and the "Conditional — Ask the Agency" path depends on that date being real. Both gaps were identified in the July 2026 API probes and parked in `future-edits.md` awaiting exactly this skill.

**v1.5 — July 2026, Jake + Claude.** Two rubric fixes from the `future-edits.md` backlog. **(1)** Added a **"Light screen for RFIs & Sources Sought"** section — RFIs don't get the full rubric (its gates assume a live solicitation); instead a three-question screen decides whether to respond-to-position (a watch item, not a bid) or log-and-drop, codifying how the Street Outreach / Ohio Veterans RFIs were handled. **(2)** Redefined the dead **Deal-Size "0-pt" bucket** (Category 5): it no longer says "would have failed Gate 5" (impossible — Gate 5 already passed to reach Stage 2); it's now for genuinely uncertain, possibly-tiny scopes that cleared Gate 5 only because an unstated budget never auto-fails. Note: the reserved-for-document-phase version number moves to **v1.6** (the document-grounded scoring update is still deferred).

**v1.4 — July 2026, Jake + Claude.** Lowered the **Gate 1 timeline floor from 21 → 10 calendar days**, justified by the now-automated HigherGov intake (Seamgen sees opportunities the day after they post, not on a weekly manual sweep, so far more of the window is intact). Deleted the old "15–20 days out + exceptional fit → Peter manual override" edge case (the override band no longer has a purpose once the gate is at 10). Rescaled the Category 8 "Timeline Comfort" bands to the new floor (30+/21–29/16–20/11–15/10). Matched the intake prefilter to the same floor (`tools/highergov-config.json` `minDaysToDue` 15 → 10; kill-reason string → `due-in-under-10-days`) and updated the no-bid email language (`rfp-email-nobid-skill.md` "minimum of 10 days"). The reserved-for-document-phase version number moves to **v1.5** (the document-grounded scoring update is still deferred). **Also in v1.4:** the archival scoring PDF now saves to the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (was `scoring/`), part of the folder reorg from type-based to by-RFP folders — see CLAUDE.md v1.13.

**v1.2 — July 2026, Jake + Claude.** Added the **"productized RFP with a viable custom path"** edge case to Gate 2 and a matching **"Conditional — Ask the Agency"** recommendation state. When a COTS/SaaS product framing is the *sole* blocker on an otherwise-pursue RFP and a *real* Seamgen analog proves we could build it custom, don't auto-no-bid — recommend asking the agency (before the Q&A deadline) whether they'd consider a custom solution, then rescore on their answer. Guardrails: real projects only; firm no-bid if the window is closed or they answer commercial-product-only. Prompted by the MSU Nursing Teaching Assignment RFP.

**v1.1 — July 2026, Jake + Claude.** Reworked Category 1 (Case Study Match) around the **adjacent-experience principle**: default to finding the closest *real* project and framing it as transferable capability ("we built X → we can do Y"), raised the scoring floor so adjacent/remote-but-real analogs earn meaningful points, and reserved 0–5 for RFPs where nothing real connects. Pointed grounding at the clean case-study text (`resources/proposal-sources/Proposal - Case Studies.txt`). Guardrail unchanged: use only real projects; never invent or overstate.

**v1.0 — July 2026, Jake + Claude.** First draft. Kill gates and category weights derived from: Adan's RFP Playbook (April 2026, especially §4 Qualification Filter and §3 Agency Targeting), the Proposal - Case Studies PDF, the Seamgen website (July 2026), and observation of Katie's June 2026 email patterns (No-Bid on LA Water & Power, Pursue on USU, clarifying questions on Rancho Palos Verdes).

**Known limitations of v1.0:**
- Category weights are educated guesses. After 10–15 scored RFPs, review which categories correlated with wins and re-weight.
- The $100K minimum is a Jake-decided floor. If Peter or Marianne have different intuition, revisit.
- No category currently rewards existing agency relationships beyond the "Competitive Position" bucket. If relationships turn out to matter more than the current 10-point weight allows, consider promoting to its own category.
- Sensitive-industry list is a placeholder. Update if a real case forces the question.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
