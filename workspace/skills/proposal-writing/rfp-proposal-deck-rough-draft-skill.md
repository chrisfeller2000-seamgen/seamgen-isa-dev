---
name: rfp-proposal-deck-rough-draft
purpose: Turn an RFP's submission checklist plus available materials into a **review-ready rough draft** of a Seamgen proposal deck — a self-contained HTML slideshow rendered to PDF, in Seamgen's house style, with case-study and understanding language spun to the RFP. This is the FIRST iteration: it fills what can be responsibly grounded, keeps visible scaffolding (draft flags, placeholders) for small unknowns, and stubs whole components that need human-collected data. A companion `rfp-proposal-deck-final-draft` skill (planned) will strip that scaffolding into a submission-ready deck. Covers Phase 8 (Proposal development), the build side of Adan's Playbook Phases 4–6.
audience: Written for both Claude (who plans and assembles the draft) and Jake (who gathers the content/images and reviews it). This rough draft is an INTERNAL review artifact for Marianne/Peter and the team — not yet the client-facing submission.
version: 1.4 — July 2026 (post-submission lessons folded in)
owner: Jake (Seamgen)
depends_on: rfp-submission-checklist skill (defines the required contents + the "Forms to extract, complete & sign" list the deck's Appendix mirrors), the RFP itself, and resources/proposal-sources/ (Proposal - Case Studies.txt, Proposal - People.txt, Proposal - Assets.txt, Adan's RFP Playbook), resources/resumes/ (individual bios), and resources/proposal-templates/ (the example proposal decks that define house style). Reads technical content from the rfp-engineering-brief output when one exists.
---

# Proposal Deck Skill — Rough Draft (iteration 1)

## What this skill does

Builds a **review-ready rough draft** of the proposal deck for an RFP Seamgen is pursuing — not an outline Jake fills in by hand, and not yet the polished submission. Output is a **self-contained HTML slideshow + a PDF render** in Seamgen's house style. A PDF deck is an acceptable submission for most public RFPs; if a specific RFP demands a native/editable Google Slides file, this deck is the visual master Jake or Hoda recreates in Slides.

This is the **first of two iterations.** The rough draft deliberately keeps scaffolding so the team can see the shape of the whole proposal early: it fills everything it can responsibly ground, leaves *visible* placeholders for small unknowns, and *stubs* whole components that require human-collected data (see "Fill vs. Stub vs. Inline-filler" below). A planned companion skill, **`rfp-proposal-deck-final-draft`**, will take the gathered materials and turn this into the submission-ready deck (see "Rough draft vs. final draft").

It runs in three modes:

- **Mode A — Deck plan + collection list.** Early, before Jake has gathered everything. From the RFP + its submission checklist, produce the slide-by-slide plan (in the RFP's required response order) and a precise **"what to gather" list** — the content and image assets Jake needs to collect. This tells Jake exactly what to hand back.
- **Mode B — Assembly.** Once Jake drops the gathered content + images into the prospect folder, assemble the complete deck: embed provided images, drop clearly-marked `[IMAGE: description]` placeholders where an asset is still missing, spin the case-study and understanding language to the RFP, build team cards from `resources/`, and auto-fill Seamgen's boilerplate slides.
- **Mode C — Content handoff (text for a Slides template).** When the real submission is a native **Google Slides deck the team assembles and illustrates** (and/or when a polished past proposal is the visual reference to match), produce the proposal as **clean, paste-ready text, section by section**, for Jake/Hoda to drop into a copy of the template — with `[IMAGE: …]` notes where visuals go. Claude writes the copy (mapped to the RFP's required response order, matching a reference proposal's spine and voice when one is provided); it does **not** author native Slides or place images. Output: a `.md`/`.txt` content file in the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (e.g., `proposal-content_YYYY-MM-DD_[slug].md`).

## When to use it

Use after: the RFP scored a pursue (or a Conditional that resolved to pursue), Peter/Marianne green-lit proposal development, and a **submission checklist exists** for the RFP. Ideally after the engineering brief too (it feeds the technical slides). Do not use for no-bid RFPs, or before there's a checklist to build against.

## How to use it

- Mode A: "give me the proposal deck plan for [RFP]." Claude reads the RFP + its submission checklist and returns the slide plan + collection list.
- Mode B: "build the proposal deck for [RFP]" once the gathered content/images are in the prospect folder. Claude assembles the HTML + PDF.
- Mode C: "write the proposal content for [RFP] for the Slides template" — Claude studies the reference proposal (if provided) + the RFP + Q&A and produces the paste-ready content file.

---

## Approach framing: ABC → XYZ (and use the discovery Q&A)

Three upgrades that make the Approach section land — from Marianne's direction and the RTA reference proposal:

- **ABC → XYZ.** Structure the approach as: *the RFP asks for ABC, and we deliver all of it (the floor) — but what would genuinely move the needle is XYZ (the ceiling).* Meet every requirement first, then propose an **elevated, optional, modular** vision. Each XYZ idea must tie to a client goal or pain point and be **grounded in real Seamgen work** (never invented). Respect the client's stated preferences and keep the extras clearly optional, so it reads as vision, not scope-creep. (RTA did this via benchmarking, a future-ready cloud recommendation, and an optional chatbot.)
- **Mine the discovery Q&A.** When a discovery Q&A with the agency exists (e.g., `resources/[RFP] Q&A.md`), treat it as the **primary source** for the Understanding / "why now" wording and for the XYZ ideas — the client's own stated pain points, goals, and openness to innovation are the most persuasive material available. Anchor each XYZ idea to a pain point they named. (On RPV: pain points = weak support, outdated payments, thin marketing → XYZ = self-service + chatbot, modern/flexible payments, rewards + "Activity Assistant" personalization.)
- **Reframe the offer explicitly if the RFP mismatches Seamgen's model** *(new in v1.4)*. If the RFP is written for a product Seamgen doesn't actually sell — a SaaS subscription, a per-seat license, a hosted platform vs a delivered build — the Executive Summary needs an explicit reframing paragraph that clarifies what Seamgen is actually offering. On the RPV submission, this single added paragraph — *"This means we are offering a newly built platform, not an ActiveNet implementation. The pricing will be different, there will be no licenses but the City will own the platform, and we will need to work closely together to define and build to your needs."* — was the single most impactful edit made between rough draft and final. Silent framing mismatches read as confusion or dishonesty later. Related: v1.1 flagged the "confirm with the City" build-vs-product callout as scaffolding to relocate to an internal cover note. Update: the *internal* callout stays internal, but the *client-facing* framing paragraph is now a required Executive Summary move whenever the RFP-to-Seamgen fit is mismatched.

---

## Fill vs. Stub vs. Inline-filler (the rough-draft rule)

The whole point of the rough draft is to show the shape of the entire proposal early **without fabricating anything that requires human data, analysis, or sign-off.** For each section, decide which of three treatments applies:

**1. FILL — Claude generates it, grounded in `resources/` + the RFP.** Everything whose substance Claude can responsibly write or spin from real sources:
- Cover · Table of Contents · cover-letter body (firm intro, understanding, compliance statement) · Understanding of the need · Approach / positioning · Platform (or solution) capabilities · Payments/PCI **approach** · Accessibility **approach** · Data-migration **approach** · Value & innovation · Organization & Staffing narrative + org chart · Team cards (real bios from `resources/resumes/`) · Prior Experience · Case studies (spun from **real** projects) · Quality-Control plan · Project-schedule **structure** (built from the RFP's own dates) · Acceptance-of-conditions narrative.

**2. INLINE FILLER — keep as a visible placeholder.** Small, obvious unknowns that don't mislead and are cheap to swap later. Fine to leave in a rough draft:
- Headshots (`[IMAGE: headshot — Name]`) · the PM's name · effort-% per person · firm phone/email/address/tax ID · reference-contact names/phones.

**3. STUB — header + 1–2 sentences on what will appear and how it's formatted + "to be provided by [owner]".** Do **not** fabricate these; a stub is more honest and more useful than fake content. Applies to whole components that need human-collected data, analysis, or approval:
- **Pricing figures** → Marianne + engineering + Peter · **detailed CPM / 11×17 schedule** → engineering (Chris/Frank) · **financial statements / evidence of financial responsibility** → Nick · **exceptions to the contract/PSA** → Marianne + Peter · **the VPAT artifact itself** → design (the accessibility *approach* is filled; the document is provided on request) · **insurance evidence** → Tina/Marianne.

**Pricing pattern — the monthly budget box** *(new in v1.4)*. When the RFP demands "future features / updates included at no additional cost" (as RPV's Section III did), the pricing stub should describe the **monthly budget box** structure rather than either "yes, all free forever" (dangerous — unbounded scope) or "no, all quoted separately" (loses the bid). Structure: (a) the Annual Subscription covers platform maintenance, security patches, performance improvements, and Seamgen-released platform-level updates; (b) PLUS a fixed monthly budget for client-requested feature development (use it or not); (c) any feature request larger than the monthly budget is scoped and priced separately by mutual written agreement before development begins. RPV final submission: $9k/month standard support + $9k/month feature budget box = $18k/month combined subscription option. This is the answer to "how do we protect Seamgen from unlimited custom-build scope while still bidding to an 'included at no cost' RFP."

**Exceptions patterns for Marianne + counsel** *(new in v1.4)*. When stubbing "exceptions to the contract/PSA," don't draft the exception language (counsel territory) but DO flag these three exception categories for their attention — all three were negotiated on RPV Section h:
- **Public-works / prevailing-wage / payment-retention** clauses — reject or narrow when the engagement is consultancy rather than construction (RPV rejected Article 1.4 California Labor Law and Article 2.2b Contract Retention as "not applicable since this is not public works but consultancy").
- **Limitation of Liability** — cap at total contract value, with carve-outs for fraud, willful misconduct, confidentiality breach, and IP infringement (standard SaaS/consultancy protective language).
- **Background IP** — preserve Seamgen's pre-existing methodologies, frameworks, reusable code, AI prompts/models, templates. Grant the client a perpetual non-exclusive royalty-free license to use Background IP as part of the Deliverables. Prevents the client from claiming ownership of Seamgen's reusable assets.

**Hybrid rule.** When the RFP dictates the *format* of a stubbed component (e.g., a required price-table with specific columns), show the **structure** and mark the values "to be provided by [owner]" — don't invent numbers to fill it. When the whole component needs human analysis, stub it entirely with the header + sentence.

Owners come straight from the RFP's **submission checklist** (`rfp-submission-checklist` skill): Tina = registration/tax/license/good-standing; Nick = financial responsibility; Marianne signs / Peter approves; engineering = estimates, CPM, technical specifics; Hoda = design assets. Route every stub to the checklist owner.

## Rough draft vs. final draft

This skill produces the **rough draft** and deliberately KEEPS scaffolding that a submission must not contain. The planned `rfp-proposal-deck-final-draft` skill is what removes it. The rough draft keeps, and the final draft will strip or resolve:

- **Draft flags** (the "DRAFT — … to confirm" corner labels) → removed in final.
- **Inline placeholders** (`[IMAGE: …]`, `[TBD]`, `[Last Name]`, effort `[__]%`) → replaced with real, verified content in final; if a headshot/bio is still not final, the final skill **drops it entirely** rather than shipping a placeholder.
- **Stub notes** → replaced with the real component once the owner supplies it.
- **The "Source (found via)" line** (internal tracking) → removed from the client-facing final.
- **The build-vs-product "confirm with the City" callout** → the final skill **relocates** this insight to an *internal* cover note for Jake/Marianne; it is **not deleted** (it's the most important strategic signal on a productized RFP), but it never appears on a client-facing slide.
- **Open format question the final skill must resolve:** some RFPs (e.g., Rancho Palos Verdes) require a *concise typed document with per-subsection page limits*, not a slideshow. The final skill decides between the deck and a **"document mode"** that lifts this same content into a page-limited document — the deck is the visual master either way.
- **Enforce page limits at drafting time, not editing time** *(new in v1.4)*. When the RFP specifies per-section page limits, convert them to word counts BEFORE drafting. Rough conversions: **1 page ≈ 400–500 words of narrative body text**, or ~600 words if the page includes a small table or bullet list. RPV's 2-page Approach limit → 800–1,000 words total. RPV's 1-page Quality Control limit → 400–500 words. RPV's 1-page Acceptance of Conditions limit → 400–500 words. When content doesn't fit, choose depth over breadth: 2 strong sub-sections beat 4 shallow ones. **The RPV rough draft was drafted with 11 sub-sections in the Approach at ~3,000+ words; the final submission cut this to 2 sub-sections at ~700 words.** That was the largest source of rework in the entire RPV engagement — enforce the word count up-front to avoid it next time.

---

## House style (from Seamgen's example decks)

Match this — it's extracted from the master templates and real proposals in `resources/proposal-templates/`.

**Palette**
- Text / headings slate `#53585F`; near-black titles `#212121`
- Eyebrow / sub-labels steel-blue `#869CB2`
- **Signature accent green `#24CD7B`** — used for rules, underlines, icon accents, tags; **not** as a slide background
- Secondary green `#49B977`; panel fill `#F6F6F6`; links `#0365C0`
- White type on dark section dividers

**Fonts.** Headings use a Proxima-Nova-style geometric sans; since the brand fonts aren't installed for the Chrome PDF render, use the fallback stack `"Proxima Nova", Mulish, Montserrat, "Segoe UI", Arial, sans-serif`. Body Arial/Segoe. (Note in the handoff that Hoda can swap to real Proxima Nova if she rebuilds in Slides.) Colors + layout carry the brand more than the exact face.

**Type ladder (approx, on 16:9):** cover / divider titles 56–64px; slide headers 28–34px; sub-labels 18–22px; body 15–16px; captions 11–13px. Section dividers carry a large faint numeral watermark.

**Voice.** Second person; mirror the client's own words ("your team," "the problems your team is facing today"). Case studies are past-tense and outcome/ROI-forward — name the marquee client, then "we designed and developed…," then a quantified result, and name the tech stack. This is the observed Seamgen voice; keep it.

**Format.** 16:9 slides (each a `.slide` block), self-contained HTML (inline CSS, images as data URIs), rendered to PDF with headless Chrome — the same pipeline as our other deliverables.

## Formatting discipline (read like a municipal submittal, not a pitch)

Government evaluators score fast and scan for compliance. Keep every page calm and disciplined:

- **One idea per page. Split when crowded.** If a slide feels dense, break it into two — never shrink type to "fit everything." (Lesson learned: a 6-card team grid overflowed one slide; it belongs on two slides of three.)
- **Repeatable case-study skeleton.** Every reference/work-sample slide uses the same structure so it skims in under a minute: **Challenge → Solution → Relevance to the RFP → Results**, with the metric callout and one image slot in the *same position* on every slide.
- **Org / reporting chart on the staffing page.** Show PM → City primary contact, and PM → architects / engineers / UX / QA at a glance, rather than describing it in prose.
- **Uniform team cards.** Same size and layout; role and effort-% in the same place on every card.
- **Mirror the RFP's section names exactly** (and its response order) so evaluators can map the deck to the scoring criteria.
- **Restraint:** 2–3 type sizes total, the single green accent used sparingly (rules/section letters/small dividers — never as a background), generous whitespace, **icon-free**, and a consistent footer (page # · firm · project) on every content page.
- **% effort must sum to exactly 100%** *(new in v1.4)*. When the RFP asks for % effort per staff member (RPV §c required this), the total sums to exactly 100%, not 100+% with an explanatory footnote about concurrent participation. A lean team of 5–7 people at balanced % effort reads cleaner than a large team at fractional %. RPV final: Nico + Katie (co-PM) 18 + Amy (Tech Lead + Backend) 10 + 10 + Frank (Front-End) 26 + Hoda (UX) 9 + Seth (QA) 8 + Chris (Applied AI) 16 + Nick (BA) 3 = **100%**.

## Canonical skeleton (default; trim per RFP)

Default to the full build-engagement skeleton; **the per-RFP section set and order are driven by the RFP's mandated response structure + the submission checklist** — mirror them, and drop sections that don't apply (a lighter design/website variant omits the technical/security/support sections).

1. **Cover** — project title, client/agency, RFP #, date, Seamgen mark
2. **Table of Contents** — roman numerals + page numbers
3. **I. Company Overview** — Introduction letter (signed Marc Alringer, President) · About Us (Summary / Background / Design Philosophy / Competitive Advantage) · Company Information (GSA Schedule 70, SBA, UEI/DUNS/CAGE, NAICS) · Clients Highlight · What We Do · Relevant Experience
4. **II. Project Summary** — Understanding of the need (spun to their language) · Core Features · Technical Overview · Compliance (508/WCAG/GDPR/PCI as applicable) · Cybersecurity
5. **III. Process & Work Plan** — approach + Phases 1–4 with deliverables
6. **IV. Support & Maintenance** — if the RFP asks for ongoing support
7. **V. Timeline & Cost** — estimate (placeholder unless Jake provides numbers)
8. **VI. Project Management** — core team, collaboration tools, cadence
9. **VII. References** — project references + testimonial blocks
10. **Case Studies / Work Samples** — one per slide (see components); spun to the RFP
11. **Appendix: Required Forms & Certifications** — see below
12. **Thank-You** — "TOGETHER WE CAN CHANGE LIVES" + contact (Marc Alringer / current signatory)

## Reusable slide components (build as CSS classes)

Cover · TOC (dot-leaders + page nos.) · section divider (eyebrow "Section N" + ALL-CAPS title + faint numeral watermark) · prose / letter · two-/multi-column content · **case-study "Work Sample"** (top-right PROJECT DURATION / YEAR / VALUE callout + WORK SUMMARY prose + TOOLS tag row + image slot) · process/phase (heading + deliverables list + "Timeline: X wks" pill) · **team card** (portrait + Name / role + short bio) · reference contact grid · testimonial letter block · data table (cadence / deliverables / pricing) · client-highlight matrix · Thank-You contact card.

## Spinning case studies and the understanding to the RFP

For the **Understanding** slide and every **case-study** slide, reword to mirror the RFP's terminology, priorities, and evaluation criteria (the adjacent-experience principle from `rfp-scoring` Category 1, extended to language):

- Pull **real** projects from `resources/proposal-sources/Proposal - Case Studies.txt`; never invent one.
- Reframe the same real facts in the RFP's vocabulary — e.g., for a transit RFP, describe Comic-Con as "a high-traffic public ticketing and registration platform serving 1M+ users at peak," not "a comic convention app."
- Echo the client's own words in the Understanding slide (second person).
- Label a genuine stretch as "adjacent / transferable," never as a direct match. Reword, don't fabricate — outcomes and metrics must stay true to the source.
- **Reorder case studies by RFP-relevance** *(new in v1.4)*. The most-relevant case study appears first; the least-relevant last. Municipal / government / public-sector RFP → lead with government work, close with consumer work. Healthcare RFP → lead with HIPAA-compliant work. High-volume consumer / commerce RFP → lead with SeaWorld / Comic-Con / Blenders. The order signals to the evaluator whether Seamgen "gets" what they do. On RPV: the rough draft led with Blenders (a consumer brand); the final submission reordered to Compulink → Healthcare Partners → Florida DEP → Blenders, putting the government/healthcare/enterprise work in front and closing with the consumer piece. Much stronger match for a municipal recreation department.

## Embedded signable forms → Appendix

The deck does **not** put affidavits/certifications on slides — they're attachments. It reserves an **"Appendix: Required Forms & Certifications (signed — attached separately)"** entry that pulls the list straight from the submission checklist's **"Forms to extract, complete & sign"** subsection, and states they're compiled into the submission package per the RFP's submission method (combined PDF vs separate uploads). This guarantees the disqualifying-if-missing forms are never dropped just because they aren't slides.

## Images

Embed every image asset Jake provides (as a data URI, so the HTML stays self-contained). Where an asset is still missing, drop a **visible** `[IMAGE: description]` placeholder on the slide (e.g., `[IMAGE: headshot — Frank Garcia]`, `[IMAGE: Comic-Con app screenshot]`) so nothing silently disappears and Jake can see exactly what to supply.

## Guardrails

- **Real facts only.** Never invent case studies, capabilities, quotes, metrics, team members, or firm credentials. Ground everything in `resources/`. Spinning is rewording, not fabricating.
- **Firm credentials** (GSA Schedule 70, SBA small business, NAICS 541511/512/513/519/511210, Esri, Microsoft CSP) come from the scoring skill's known-qualifications + `resources/` — verify they're current before relying on them.
- **Cost stays a placeholder** unless Jake supplies real numbers (pricing comes from Marianne + engineers + Peter).
- The deck is a **draft for Marianne and Peter review before submission** — state this on the handoff, not on a client-facing slide.
- Personnel: use current staff only (see the roster reconciliation — People.txt is a template with placeholder/former entries).

## Output

- **File:** `RFPs/[stage]/[rfp-slug]/proposal-deck_YYYY-MM-DD_[rfp-slug].pdf` — saved in the RFP's own folder (created if it doesn't exist yet), the submission-ready PDF. The self-contained HTML source is kept in the scratchpad and offered on request (useful if Jake/Hoda rebuild in Google Slides). Every deliverable for a given RFP lives together in the RFP's own folder — `RFPs/[stage]/[rfp-slug]/`, where `[stage]` is its current lifecycle tier (`1-pre-submission` / `2-intermediate-stage` / `3-building` / `4-submitted`; a deck draft usually means the RFP is in `3-building/`). Save into that `[rfp-slug]/` folder wherever it already exists; don't assume the tier or create a duplicate (see CLAUDE.md Rule 10).
- Regenerate with today's date when the deck materially changes; older versions stay as a paper trail.

## Worked example (abbreviated)

For a hypothetical transit-website RFP, Mode A returns: Cover → TOC → Company Overview (About Us, Company Information, What We Do) → Understanding ("Cherriots needs a rider-first, accessible website…" — mirroring their language) → Approach → Technical (CMS + GTFS-RT + mapping) → Timeline → Team (Hoda, Frank, …) → **Case Studies spun to transit**: FDEP (gov + GIS), Comic-Con (high-traffic public ticketing), SeaWorld/San Diego Zoo (mapping) → References → **Appendix: Required Forms** (Non-Collusion, DBE Good-Faith, Debarment — from the checklist) → Thank-You. Plus the collection list: "Provide headshots for [team]; screenshots for FDEP/Comic-Con/Zoo; final pricing or leave placeholder; signed Non-Collusion/DBE/Debarment forms (RFP pp. …)."

Mode B then assembles that into `RFPs/[stage]/samtd-cherriots-website/proposal-deck_YYYY-MM-DD_samtd-cherriots-website.pdf`.

## Notes and edit history

**v1.4 — July 2026, Jake + Claude (post-submission lessons).** Folded in specific edits from the RPV *final* submission (July 17, 2026) that came out of Marianne, Peter, and counsel's review of the rough draft. v1.3 was based on the July 9 rough draft; v1.4 adds what changed between rough draft and submitted PDF. Six new pieces of guidance: **(1) Reframe the offer explicitly if the RFP mismatches Seamgen's model** — added as third bullet under "Approach framing." The RPV Executive Summary paragraph "This means we are offering a newly built platform, not an ActiveNet implementation…" was the single most impactful edit made. **(2) Monthly budget box pricing pattern** — added under the STUB section. Structures the answer to RFPs demanding "future features included at no cost" as maintenance-plus-monthly-feature-budget, with anything larger scoped separately. Protects Seamgen from unbounded custom-build scope. **(3) Page-limit-to-word-count math** — added to "Rough draft vs. final draft." 1 page ≈ 400–500 words body. RPV's 2-page Approach → 800–1,000 words. Enforce at draft time (the RPV rough draft was ~3,000 words in Approach; the final was ~700). **(4) Reorder case studies by RFP-relevance** — added to "Spinning case studies." Municipal RFP → government work first, not consumer. **(5) Common legal exception patterns** — added under the STUB section. Three categories Marianne + counsel typically negotiate: public-works exemption for consultancy, LoL cap, Background IP preservation. **(6) % effort must sum to exactly 100%** — added to Formatting discipline. Not 100+% with a footnote. Companion document: `resources/RPV_Draft_vs_Final_Analysis.md` contains the section-by-section changes and reasoning that produced these lessons. **(Install note:** this v1.4 was folded onto the stage-aware `RFPs/[stage]/[rfp-slug]/` output paths from the 3-tier lifecycle change — CLAUDE.md v1.15 — so output still lands in the RFP's current-stage folder; the six items here are content-only.)

**v1.3 — July 2026, Jake + Claude.** Folder reorg (type-based → by-RFP): both outputs — the Mode B deck PDF and the Mode C content `.md`/`.txt` — now save to the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (was `proposals/`). See CLAUDE.md v1.13.

**v1.2 — July 2026, Jake + Claude.** Added three things from Marianne's review + the RTA reference proposal: (1) **Mode C — content handoff** (produce clean, paste-ready text section-by-section for a Google Slides template the team assembles/illustrates, output a `.md` content file in `proposals/`); (2) the **ABC → XYZ approach framing** (deliver the full ask, then propose an elevated, optional, grounded vision tied to the client's pain points); (3) **use of a discovery Q&A** as the primary source for Understanding/"why now" and the XYZ ideas. First applied on RPV (`proposals/proposal-content_2026-07-09_rancho-palos-verdes-recreation-software.md`), modeled on the Seamgen RTA proposal's spine, voice, and reference-backed case-study cards.

**v1.1 — July 2026, Jake + Claude.** Renamed to **`rfp-proposal-deck-rough-draft`** to mark it as the first of two iterations (a `rfp-proposal-deck-final-draft` skill is planned). Added three sections: **"Fill vs. Stub vs. Inline-filler"** (Claude fills only what it can ground; keeps small unknowns as visible filler; stubs whole components that need human data, routed to submission-checklist owners), **"Rough draft vs. final draft"** (what this skill deliberately keeps and the final skill will strip/relocate — including moving the build-vs-product "confirm with the City" note to an internal cover note, and resolving the deck-vs-page-limited-document format question), and **"Formatting discipline"** (one idea per page; a uniform Challenge→Solution→Relevance→Results case-study skeleton; an org chart on the staffing page; uniform cards; icon-free restraint — folded in from Jake's Perplexity review). Prompted by the Rancho Palos Verdes rough-draft review.

**v1.0 — July 2026, Jake + Claude.** First draft. House style, canonical skeleton, and slide-component library extracted from five example decks in `resources/` (two MASTER templates + Viasat / iOT / iMGWorld real proposals). Two modes (deck plan + collection list; assembly). Case-study/understanding language spun to the RFP (real facts, reworded). Embedded signable forms handled via an Appendix that mirrors the submission checklist's "Forms to extract, complete & sign" subsection. Output: self-contained HTML → PDF in `proposals/`. Fulfills the long-deferred proposal-writing skill (Phase 8 / Playbook Phases 4–6).

**Known limitations of v1.0:**
- Brand fonts (Proxima Nova) aren't embedded in the Chrome render; the fallback stack approximates. If pixel-accurate brand type matters, rebuild in Google Slides from the PDF.
- Native editable Google Slides output isn't produced (no Slides API in Claude's toolset); the PDF/HTML is the deliverable.
- Cost slides are placeholders by design until Marianne/engineers/Peter provide real pricing.
- The section set is a strong default; always reconcile against the specific RFP's required response order before finalizing.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
