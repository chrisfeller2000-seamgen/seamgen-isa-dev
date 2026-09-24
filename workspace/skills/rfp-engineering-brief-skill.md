---
name: rfp-engineering-brief
purpose: Extract the engineering-relevant scope from an RFP into a short, structured document that a lead engineer can read in 5–10 minutes and use to give a reliable timeline estimate — without having to read the full 20–100 page RFP themselves.
audience: This skill is written to be read by both Claude (who drafts the brief) and a human teammate (who reads, sanity-checks, and edits the template over time). The BRIEF ITSELF is written for lead engineers who have not read the RFP.
version: 1.5 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (the scoring output confirms this RFP is being pursued). Feeds into: rfp-email-agency-questions skill (via the "Ambiguities Requiring Clarification" section) and downstream engineer timeline estimates.
---

# Engineering Scope Brief Skill

## What this skill does

Turns a full RFP into a short, structured brief that captures every engineering-relevant requirement, using **verbatim quotes with page references** as the source of truth. Engineers can read the brief in 5–10 minutes, drill into the source RFP only where they want to verify, and give a timeline estimate without needing to read the entire document.

## Why the format matters (design rationale)

Every other skill we've built is optimized for Jake's judgment — if Claude's summary is a little off, Jake catches it and edits. This skill is different. Its output goes to **engineers who will not read the RFP**, and their timeline estimate depends on whether the summary is accurate. A missed requirement or a glossed-over hard part produces an under-estimate, which becomes an under-priced proposal, which becomes a money-losing project.

The design principle is: **shift interpretation from Claude to the engineer.** Claude's job is *routing* (finding relevant sections and putting them in front of the engineer), not *summarizing* (deciding what the RFP means). Every claim in the brief must be backed by a verbatim quote and a page reference so the engineer can jump to the source if anything looks off.

## When to use it

Use this skill:

1. After the RFP Scoring Skill has returned a Strong Pursue or Worth a Look recommendation.
2. Before Slacking a lead engineer for a timeline estimate.

Do **not** use this skill:
- For RFPs that are still in the pursue/no-bid decision phase (too early).
- For no-bid RFPs (waste of time).
- As a substitute for the engineer actually reading the RFP if they *ask* to see the full document — the brief is a starting point, not a replacement.

## How to use it

Provide the full RFP (PDF or text). Say "generate an engineering scope brief for [RFP name]."

Claude will:
1. Read the full RFP end-to-end.
2. Extract engineering-relevant content using **guided extraction** (short label + verbatim quote + page reference).
3. Flag ambiguities inline and collect them at the bottom as candidate agency questions.
4. Return a PDF file that fits in 1–3 pages.

**File naming convention** (saved in the RFP's own folder **`RFPs/[stage]/[rfp-slug]/`**, created if it doesn't exist yet):
```
RFPs/[stage]/[rfp-slug]/engineering-brief_YYYY-MM-DD_[rfp-slug].pdf
```
Every deliverable for a given RFP lives together in the RFP's own folder — `RFPs/[stage]/[rfp-slug]/`, where `[stage]` is its current lifecycle tier (`1-pre-submission` / `2-intermediate-stage` / `3-building` / `4-submitted`). Save into that `[rfp-slug]/` folder wherever it already exists; don't assume the tier or create a duplicate (see CLAUDE.md Rule 10).

**Why PDF for the deliverable:** The engineering brief gets forwarded to engineers (Chris and others) who may open it in Slack, email, or on their phone. PDF renders identically everywhere and preserves the section headers, bolded labels, and blockquoted verbatim quotes that make the guided-extraction format scannable.

**How the PDF is produced:** the brief is authored in Markdown, then rendered to PDF by converting the Markdown to styled HTML and printing it via headless Edge (this machine has no pandoc/wkhtmltopdf, so that's the working path). The Markdown source is kept alongside the PDF so edits re-render cleanly. Practical gotcha: a PDF that's open in a viewer is file-locked and won't overwrite — close it before regenerating, or the "new" file is silently the old one.

## Length target

- **Target: 1–3 pages** depending on RFP size (a 20-page website RFP produces ~1 page; a 100-page federal RFP produces ~3 pages).
- **Hard cap: 5 pages.** If it's longer than that, compression has failed — revisit which sections were included.

## The guided extraction pattern

Every substantive claim uses this shape:

```
- **[Short label — 2–5 words]:** [One-sentence plain-language explanation.]
  > "[verbatim quote from the RFP]" — §[section number], p. [page number]
```

Rules:
- **Label first, quote second.** Engineers scan labels; they only read quotes when a label catches their attention.
- **Never paraphrase inside the quote block.** Quotes are exact, including odd phrasing or grammatical quirks.
- **Every quote gets a page reference.** Format: `§4.03B, p. 12` or `Appendix A, p. 27`. No exceptions.
- **If multiple short quotes support one label**, list them sequentially under the same label.
- **If a section is genuinely absent from the RFP** (e.g., no compliance section), write `Not addressed in the RFP.` under the section header. Do not invent content.

## The brief format

```
# Engineering Scope Brief: [RFP name]

**Source (found via):** [sourcing platform — e.g., HigherGov, PlanetBids, RAMP, or "forwarded by [name]"]
**Date prepared:** [YYYY-MM-DD]
**RFP #:** [ID]
**Full RFP location:** [path/link to source PDF]
**Prepared by:** Jake
**For:** [Engineer name(s)]

---

## One-line summary

[A single sentence describing what's being built. Not from the RFP —
Jake's/Claude's synthesis. Keep to 20 words or fewer.]

## RFP snapshot

- **Agency:** [Name]
- **Total RFP page count:** [n pages]
- **Proposal due:** [Date/time]
- **Sections referenced in this brief:** [e.g., §4.03, §4.05, §8.04, Appendix A]

---

## Scope of Work

[Guided extraction of the primary scope-of-work language.]

## Technical Requirements

[Guided extraction of any explicit technical requirements — required
technologies, performance benchmarks, architectural constraints.]

## Deliverables

[Guided extraction of what the agency expects to receive at end of
engagement — documents, artifacts, systems, transition support, etc.]

## Integrations / Third-party systems

[Any external systems the built solution must talk to. Often buried in
scope-of-work bullets or appendices. Look hard here.]

## Compliance and Security

[Any regulatory, industry, or agency-specific compliance requirements.
HIPAA, NIST, FedRAMP, SOC 2, PCI DSS, agency-specific data policies.]

## Accessibility

[Any WCAG level, Section 508, ADA, or agency-specific accessibility
requirements. If only vague language ("must be accessible") exists,
flag it as an ambiguity.]

## Data / Content Migration

[Whether the agency will provide content or expects the vendor to
migrate/produce it. Critical for timeline — content migration is
frequently the schedule bottleneck.]

## Hosting, Infrastructure, Ownership Constraints

[Where the solution must be hosted, who owns the code/data, any
mandated cloud providers or on-prem requirements.]

## Timeline and Phases (from the RFP)

[Any phase gates, milestone dates, or launch-date targets stated by
the agency. Distinct from the engineer's estimate — this is what the
RFP itself says.]

## Must-Have vs Should-Have language

[Any explicit priority signaling in the RFP — "shall," "must,"
"required" versus "should," "preferred," "nice-to-have." Helps the
engineer estimate scope reduction opportunities.]

---

## Ambiguities Requiring Clarification

*These items are unclear in the RFP and are candidates for the next
clarifying-questions email to the agency contact.*

1. [Question as it would be phrased to the agency.]
   - Why it matters for engineering: [One sentence.]
   - RFP basis: > "[verbatim quote that creates the ambiguity]" — §X, p. Y
     [If the ambiguity is an omission (the RFP says nothing), write instead:
     "RFP is silent; nearest relevant context §X, p. Y" — or "RFP is silent"
     if there is no nearby context at all.]

2. [Question]
   - Why it matters: [...]
   - RFP basis: > "[verbatim quote]" — §X, p. Y

[etc.]

---

## For Jake (not for the engineer)

[A short block only Jake sees, flagging anything he should know
before Slacking the engineer — e.g., "This RFP has an unusually
short response window; consider whether Chris has bandwidth this
week before asking."]
```

## Which sections to include in every brief vs. sometimes

**Always include** (even if empty — write "Not addressed in the RFP" rather than skipping):

- One-line summary
- RFP snapshot
- Scope of Work
- Deliverables
- Ambiguities Requiring Clarification

**Include when the RFP has relevant content:**

- Technical Requirements
- Integrations
- Compliance and Security
- Accessibility
- Data / Content Migration
- Hosting, Infrastructure, Ownership Constraints
- Timeline and Phases
- Must-Have vs Should-Have language

**Never include:**

- Legal and commercial terms (payment schedules, indemnification, insurance requirements)
- Cost proposal instructions
- Evaluation criteria and scoring rubrics
- Boilerplate procurement language

These matter but not for a timeline estimate. Including them adds noise.

## Handling ambiguities

When Claude encounters a passage in the RFP that is unclear, incomplete, or contradictory in a way that affects engineering scope, do this:

1. **Include the passage anyway** in the relevant section with the label prefixed by `⚠`.
2. **Also add an entry to "Ambiguities Requiring Clarification"** at the bottom.
3. **Phrase the ambiguity as a candidate question** to the agency contact — same format the Clarifying-Questions-to-Agency Email Skill would use.
4. **Add a one-sentence "Why it matters for engineering" note** so Jake (and later Peter) understands why the ambiguity is worth clarifying.

**Convergence:** these ambiguities are the *canonical, sourced version* of the RFP's open questions. At the agency-questions email stage they get merged (and deduplicated) with the pursue email's starter questions into the single list the agency receives — and where they overlap, these sourced versions win. Keep each one tightly phrased and agency-ready; the "Why it matters for engineering" note is internal and gets stripped before anything reaches the agency.

Common ambiguities to watch for:
- "Must be accessible" without a WCAG level.
- "Modern web standards" without naming platforms or frameworks.
- "Integrate with existing systems" without listing the systems.
- Content migration mentioned without volume estimates.
- Compliance stated in general terms ("data security best practices") without a named framework.

## Worked example: Utah State University Online Website Redesign

*This is a real RFP (DG012336) processed as an illustration. The brief below is what the skill produces from the full 27-page RFP.*

**File name:** `RFPs/[stage]/usu-online-website-redesign/engineering-brief_2026-07-06_usu-online-website-redesign.pdf`

```
# Engineering Scope Brief: USU Online Website Ecosystem Redesign

**Source (found via):** HigherGov
**Date prepared:** 2026-07-06
**RFP #:** DG012336
**Full RFP location:** [Google Drive path]
**Prepared by:** Jake
**For:** Chris (lead engineer)

---

## One-line summary

Full redesign and rebuild of Utah State University's online-program
marketing website, optimized for prospective students and AI-driven search.

## RFP snapshot

- **Agency:** Utah State University — Purchasing Services (David Green)
- **Total RFP page count:** 27
- **Proposal due:** July 6, 2026, 3:00 PM MST
- **Sections referenced in this brief:** §4.01, §4.02, §4.03, §4.04,
  §4.05, §5.23, §8.04

---

## Scope of Work

- **Discovery and strategic planning phase:** Multi-track discovery
  including stakeholder interviews, user journey analysis, current
  analytics review, competitive analysis, and content architecture review.
  > "The offeror shall conduct a comprehensive discovery process to inform
  > the redesign. This phase should include stakeholder interviews, user
  > journey analysis, review of current analytics and site performance,
  > competitive analysis of peer institutions, identification of target
  > audiences and key decision drivers, and content and information
  > architecture review." — §4.03A, p. 12

- **UX and information architecture:** Site map, user journey pathways,
  wireframes, conversion pathways for lead generation.
  > "UX deliverables should include a site map for the redesigned
  > ecosystem, user journey pathways, wireframes for key page templates,
  > and conversion pathways for lead generation." — §4.03B, p. 12

- **AI-driven search optimization (AEO/GEO):** Strategies for both
  traditional SEO and AI answer-engine optimization. Central to this RFP.
  > "The offeror shall provide strategies to optimize the website for
  > modern search environments including traditional SEO best practices
  > and optimization for AI-driven search and answer engines (AEO/GEO),
  > and technical improvements to support search indexing and
  > discoverability." — §4.03C, p. 13

- **Visual design system:** Modern design system aligned to USU brand,
  distinct identity for USU Online.
  > "The offeror shall deliver a modern visual design system that aligns
  > with Utah State University brand guidelines while creating a distinct
  > digital identity for USU Online." — §4.03D, p. 13

## Technical Requirements

- ⚠ **Platform / CMS not specified:** RFP does not name a required CMS
  or hosting platform. Vendor to propose.
  > No corresponding requirement in RFP. See Ambiguities below.

- **Mobile-responsive:** Required.
  > "The design should be accessible, responsive, and optimized for
  > mobile users." — §4.03D, p. 13

## Deliverables

- **Discovery summary, user personas, journey maps, content strategy,
  IA framework.**
  > "Deliverables may include a discovery summary, user personas, user
  > journey maps, content strategy recommendations, and an information
  > architecture framework." — §4.03A, p. 12

- **Sample deliverables required in proposal itself.**
  > "Sample project deliverables or artifacts that demonstrate the
  > offeror's typical work product, such as site maps, wireframes, design
  > systems, AI discoverability strategy, UX documentation, or reporting
  > dashboards." — §4.05, p. 14

- **Project timeline with visual schedule (Gantt preferred).**
  > "A project timeline outlining major phases, milestones, and
  > anticipated completion dates. A visual project schedule such as a
  > Gantt chart is preferred." — §4.05, p. 13

## Integrations / Third-party systems

- ⚠ **Digital learning technologies and student support tools:**
  Integration required but specific systems not named.
  > "the USU Online website ecosystem must also serve as a meaningful
  > resource for current students, faculty, and staff by equipping each
  > group with the information, tools, and support necessary to succeed
  > in the online learning environment." — §4.01, p. 11

  See Ambiguities below.

## Compliance and Security

- **Data security — commercial best practices required.**
  > "The contractor shall employ commercial best practices for ensuring
  > the security of all University electronic and paper data accessed,
  > used, maintained, or disposed of in the course of contractor's
  > performance under this Agreement." — §8.04, p. 24

- **E-Verify required for any in-Utah work.**
  > "the offeror or its agent, contractor, subcontractor or service
  > provider is required to register and participate in the Status
  > Verification System (E-verify)" — §5.23, p. 18

- **PCI DSS if applicable.**
  > "The payment card industry data security standards (PCI DDS)... will
  > only be part of the final contract if applicable." — §8.05, p. 25

## Accessibility

- ⚠ **Accessibility required but WCAG level not specified.**
  > "adhere to University Website Policy, including accessibility
  > requirements" — §4.03B, p. 12

  See Ambiguities below.

## Data / Content Migration

- **Content provided by USU where applicable.**
  > "Utah State University will... provide content where applicable." — §4.03F, p. 13

- ⚠ **Content architecture and gap analysis expected from vendor** — but
  scope of vendor-produced content unclear.
  > "content strategy recommendations, and an information architecture
  > framework." — §4.03A, p. 12

  See Ambiguities below.

## Hosting, Infrastructure, Ownership Constraints

- **Ownership transfers to University.**
  > "Title to all concepts, plans, strategies, and other supplies and
  > services produced/purchased as a result of this RFP, will become the
  > property of the University." — §3.10, p. 10

- **Hosting not specified.** Vendor to propose.

## Timeline and Phases (from the RFP)

- **Anticipated completion April 2027; Phase 1 design implementation
  targeted Spring 2027.**
  > "The University's anticipated completion date for this scope of work
  > is April 2027, with our development team targeting a Spring 2027
  > start for Phase 1 design implementation." — §4.04, p. 13

- **Note:** Contract begins on date of award (RFP due July 6, 2026),
  meaning ~9 months of runway before Phase 1 targeted start.
  > "any contract awarded as a result of this solicitation will have a
  > term that begins on the date of award and continues through the
  > completion of the project." — §3.09, p. 10

## Must-Have vs Should-Have language

The RFP uses "shall" throughout §4.03 for the four scope tracks
(Discovery, UX/IA, AI Search Optimization, Visual Design) — all four are
mandatory. The word "may" appears only around specific deliverable
examples ("Deliverables may include..."), signaling those examples are
illustrative, not required. This gives modest room to negotiate specific
deliverables inside each required track.

---

## Ambiguities Requiring Clarification

1. **What accessibility standard does "University Website Policy" require
   — WCAG 2.1 AA, WCAG 2.2 AA, Section 508, or something else?**
   - Why it matters for engineering: WCAG AA vs AAA compliance can add
     20–40% to accessibility remediation effort.
   - RFP basis: > "adhere to University Website Policy, including
     accessibility requirements" — §4.03B, p. 12 (the policy names no
     WCAG level — that omission is the ambiguity).

2. **Which CMS does USU Online currently use, and is there a requirement
   to remain on that platform?**
   - Why it matters for engineering: Migration to a new CMS vs. rebuild
     on the existing one are different projects with different timelines.
   - RFP basis: RFP is silent; the current platform is never named.

3. **What specific digital learning technologies and student support
   tools must the redesigned ecosystem integrate with or link to?**
   - Why it matters for engineering: Each integration is scope. LTI,
     SSO, LMS-specific connectors, or CRM integrations each have
     different complexity.
   - RFP basis: > "the USU Online website ecosystem must also serve as a
     meaningful resource for current students, faculty, and staff by
     equipping each group with the information, tools, and support
     necessary to succeed in the online learning environment" — §4.01,
     p. 11 (names no specific systems).

4. **How much content will USU provide vs. how much is the vendor
   expected to write or restructure?**
   - Why it matters for engineering: Content architecture with
     vendor-produced content is a different skill mix and timeline than
     restructuring agency-provided content.
   - RFP basis: > "Utah State University will... provide content where
     applicable" — §4.03F, p. 13, against > "content strategy
     recommendations, and an information architecture framework" —
     §4.03A, p. 12 (the split is never quantified).

5. **Which AI search platforms (ChatGPT, Perplexity, Gemini, others)
   are the highest priority for AEO/GEO optimization?**
   - Why it matters for engineering: Different platforms have different
     structured-data and content-format expectations.
   - RFP basis: > "optimization for AI-driven search and answer engines
     (AEO/GEO)" — §4.03C, p. 13 (does not say which engines).

6. **Is hosting expected to be vendor-provided, USU-provided, or is a
   specific provider (Azure, AWS, on-prem) required?**
   - Why it matters for engineering: Hosting choice materially affects
     architecture and ongoing cost.
   - RFP basis: RFP is silent; no hosting or provider language appears.

---

## For Jake (not for the engineer)

- This RFP has strong AI positioning (AEO/GEO) that maps directly to
  Seamgen's website messaging — Chris may want to lean into that in the
  estimate.
- The 9-month runway from award to Phase 1 target (April 2027 completion,
  Spring 2027 Phase 1 start) is comfortable — no timeline pressure from
  the agency side.
- If Chris asks whether the accessibility level is a real constraint,
  the honest answer is "we don't know yet, we're going to ask" — do not
  assume WCAG AA.
```

That's the full worked example. Real quotes, real page numbers, honest ambiguity flags.

## Notes and edit history

**v1.5 — July 2026, Jake + Claude.** Folder reorg (type-based → by-RFP): the brief now saves to the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (was `engineering-briefs/`). See CLAUDE.md v1.13.

**v1.4 — July 2026, Jake + Claude.** Folder reorg: briefs now save to the `engineering-briefs/` folder.

**v1.3 — July 2026, Jake + Claude.** Added a **Source (found via)** line to the brief header (and the worked example) so the sourcing platform travels with the brief — matching the new CLAUDE.md global rule.

**v1.2 — July 2026, Jake + Claude.** Ambiguities now carry their RFP basis (verbatim quote + § + page, or "RFP is silent; nearest context" for omissions) instead of a bare section reference, so each open question is self-contained and navigable. Documented the convergence flow (ambiguities are the canonical sourced questions the agency email dedupes against) and the Markdown→HTML→Edge PDF rendering path.

**v1.1 — July 2026, Jake + Claude.** Changed deliverable output from Markdown (.md) to PDF (.pdf). Rationale: engineers open this file in Slack, email, or on mobile; PDF renders identically everywhere and preserves the guided-extraction formatting (headers, bolded labels, blockquoted verbatim quotes) that makes the brief scannable.

**v1.0 — July 2026, Jake + Claude.** First draft. Structure designed to shift interpretation from Claude to the engineer via guided extraction + verbatim quotes + page references. Ambiguities section designed as a natural feeder to the Clarifying-Questions-to-Agency Email Skill.

**Known limitations:**
- Assumes Claude can accurately extract page numbers from the RFP. For PDFs with unusual pagination (front matter, appendices with separate numbering), Claude should use the printed page number as it appears on the page rather than the PDF page count.
- Does not handle multi-document RFPs (e.g., main RFP + Appendix A + Attachment B) with separate references. For those, use `[Document short name] §[section], p. [page]` — e.g., `Appendix A §3.1, p. 4`.
- Does not currently include a "questions the engineer is likely to ask Jake" section. If a pattern emerges where Chris keeps asking Jake the same clarifying questions, consider adding a preemptive section.
- The clarifying-questions email skill does not yet automatically pull from this brief's Ambiguities section. Until it does, Jake routes manually by copying items over. If this becomes tedious, update the clarifying-questions skill's instructions to check for an engineering brief by default.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
