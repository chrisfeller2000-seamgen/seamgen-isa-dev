---
name: rfp-moonshot-integration
purpose: Take the design team's "moonshot" (a polished vision/pitch deck they produce for an RFP — e.g., from Hoda) and pick apart the best of it into the compliant proposal. Map each moonshot slide to the RFP's required response section, fact-and-compliance-check every borrowed slide before it enters the scored response, flag the required sections the moonshot omits, and feed the selected content into the proposal deck rough-draft. Covers the design-integration step of Phase 8.
audience: Written for Claude (who does the integration) and Jake (who reviews it and forwards the feedback to the design team). One output — the "slides + edits" note — is written to be forwarded to the designer (e.g., Hoda).
version: 1.1 — July 2026
owner: Jake (Seamgen)
depends_on: the design team's moonshot deck (PNG/PDF, e.g. in `resources/moonshot/` or the RFP's moonshot location), the proposal content/deck (the `rfp-proposal-deck-rough-draft` output), the RFP itself + its discovery Q&A + submission checklist. Feeds `rfp-proposal-deck-rough-draft` (Mode C — content handoff).
---

# Moonshot Integration Skill

## What this skill does

Seamgen's design team produces a **"moonshot"** for an RFP — a polished, vision-forward pitch deck (bold framing, big-picture pillars, aspirational language). It is **meant to complement, never replace, the compliant proposal.** The designer intentionally over-produces; the job here is to **cherry-pick the strongest slides/parts and slot them into the proposal**, which must follow the RFP's mandated response structure (e.g., RPV's §VI.3 a–h) and stay factually grounded.

This skill picks the moonshot apart, decides what to use and where it goes, scrubs each borrowed slide for accuracy, calls out what the moonshot doesn't cover, and feeds the selected material into the proposal deck rough-draft. It also produces a **designer-ready note** so the design team knows which slides we're using and what to fix.

## When to use it

After the design team hands over a moonshot for an RFP that already has a **proposal content/deck** (from `rfp-proposal-deck-rough-draft`) and a **submission checklist**. Ideally after the discovery Q&A exists (it grounds the vision). Don't use it before there's a proposal to integrate into — the moonshot is an *enhancement layer*, not the base document.

## How to use it

- "integrate the moonshot for [RFP]" — Claude reads the moonshot + proposal + RFP/Q&A and returns the integration map, the designer note, and the folded content.

## What a "moonshot" is (and isn't)

- **Is:** a persuasive vision deck — the emotional, big-idea layer that makes evaluators *want* to pick us.
- **Isn't:** a complete or compliant submission. It typically skips the required administrative/compliance sections (cover letter, org & staffing, team resumes, reference projects with contacts, price, QC plan, acceptance of conditions, requirements matrix). Treat it as a supply of vision material to draw from, not the response itself.

## The process: read → map → fact-check → flag gaps → feed the deck skill

1. **Read** the moonshot slide by slide (view the PNG/PDF; use a subagent if it's large/image-heavy).
2. **Map** each slide to the RFP's required response section, with a call: **use as-is / use with edits / trim / don't use**, and *where it slots* (e.g., "Digital Divide → Understanding," "Transition Blueprint → Schedule").
3. **Fact-and-compliance-check** every slide you'd borrow (see the gate below) — this is the point of the skill.
4. **Flag the gaps** — the required sections the moonshot omits, so they're sourced from the proposal content / submission-checklist owners.
5. **Feed the deck skill** — fold the cleared material into the proposal content (`rfp-proposal-deck-rough-draft` Mode C), and hand Jake the designer note.

## Fact & compliance gate (the critical guardrail)

A vision deck is written to impress, so before **any** of its content enters the *scored* response, verify:

- **No unverified numbers.** Every stat must trace to the RFP, the Q&A, or a real source. Flag or drop invented/estimated figures (e.g., a resident/member count with no source).
- **No unconfirmed scope.** Don't let an aspirational slide assert scope that's actually an open question (e.g., a named integration the RFP only mentions as context). Soften to "ready to support if required."
- **Terminology matches the actual RFP/PSA.** Exhibit/attachment names, section labels, and agreement titles must match the real solicitation — not a generic template the designer may have borrowed. Verify against the RFP/PSA; correct mismatches.
- **No overclaims on credentials/staffing** ("resources already mobilized," certifications, compliance levels) unless grounded.
- **Respects page limits.** If the RFP caps a section (e.g., Approach ≤2 pages), the borrowed slides for that section must fit — condense or move to a supplemental/demo piece.

Anything that fails the gate becomes an **edit in the designer note**, not silent removal — the designer needs to know why.

## Flag the gaps

List the RFP-required sections the moonshot does **not** cover, so nothing is assumed handled. These come from the proposal content and the submission checklist's owner routing (team/resumes, reference projects + contacts, price, QC, acceptance, requirements matrix, the signed cover letter).

## Outputs

1. **Designer-ready note** (for Jake to forward to the design team): which slides we're using, where each slots, and the specific edits each needs. Collaborative, plain tone.
2. **Slide → section integration map** (which moonshot slide feeds which RFP section).
3. **Folded content** — the cleared moonshot material merged into the RFP's own `RFPs/[stage]/[rfp-slug]/proposal-content_YYYY-MM-DD_[slug].md` (feeding `rfp-proposal-deck-rough-draft` Mode C), every borrowed claim grounded. (`[stage]` = the RFP's current lifecycle tier — save into its existing `[rfp-slug]/` folder wherever it lives; see CLAUDE.md Rule 10.)

## Guardrails

- **Complement, don't replace.** The compliant proposal is the base; the moonshot enhances it. Never let the vision deck's structure override the RFP's required response order.
- **Grounded only.** Everything that enters the scored response passes the fact & compliance gate. Real facts; no invented numbers, scope, or credentials.
- **Surface edits, don't bury them.** Rejected/softened content is explained in the designer note so the design team learns the constraints.
- **Current staff only** in any team references; historical names never appear.
- **Don't send anything.** This skill drafts the note; Jake forwards it.

## Worked example (abbreviated — RPV)

Hoda's 10-slide RPV moonshot (`resources/moonshot/`) mapped cleanly: **Digital Divide → Understanding**, **Frictionless Citizen Journey → Approach/vision**, **Inclusive Design → Accessibility**, **Administrative Superpowers → capabilities**, **Data Migration & Outreach → Migration + §IV.4**, **De-Risked Transition Blueprint → Schedule** (stronger than the original), **Why Seamgen → differentiation (with edits)**, **Contractual Alignment → Acceptance (verify first)**. Fact-gate catches: soften the **Tyler Munis** "compatibility" claim (open scope question), **verify the "Exhibit A / Exhibit D / Consultant Services Agreement"** references against RPV's Attachment A / PSA, and **source or drop** "13,000+ active members." Gaps the moonshot skips (sourced from the proposal content): cover letter, org & staffing/team, references-with-contacts, price, QC, acceptance, requirements matrix.

## Notes and edit history

**v1.1 — July 2026, Jake + Claude.** Folder reorg (type-based → by-RFP): the folded proposal-content file it feeds now lives in the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (was `proposals/`), matching `rfp-proposal-deck-rough-draft` v1.3. See CLAUDE.md v1.13.

**v1.0 — July 2026, Jake + Claude.** First draft. Codifies the recurring Phase-8 step of integrating the design team's moonshot into the compliant proposal: read → map (slide → required section) → fact & compliance gate → flag the gaps → feed `rfp-proposal-deck-rough-draft` (Mode C), plus a designer-ready "slides + edits" note. Prompted by Hoda's RPV moonshot, whose strong material (digital-divide framing, de-risked transition blueprint) was folded into the RPV proposal content while its unconfirmed claims (Tyler Munis scope, Exhibit A/D terminology, an unsourced member count) were flagged for edit.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
