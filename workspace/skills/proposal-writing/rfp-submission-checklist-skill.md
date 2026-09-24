---
name: rfp-submission-checklist
purpose: Generate a "packing list" for the actual proposal submission — every document, form, signature, cost item, and file that must be included in the proposal package before it can be submitted to the agency. Used during Phase 8 (Proposal development) as a living checklist that prevents responsiveness rejections.
audience: This skill is written to be read by both Claude (who drafts the checklist) and Jake (who uses the checklist to run the submission through to completion). The CHECKLIST ITSELF is written for Jake, Marianne, Peter, and anyone else who touches the proposal package.
version: 1.6 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (confirms pursue), rfp-engineering-brief skill (informs technical content items), Adan's RFP Playbook (standard Seamgen inclusions). Also references: the RFP itself (primary source), any clarifying-questions responses from the agency, and any addenda.
---

# Submission Checklist Skill

## What this skill does

Generates a **submission checklist** — an execution-focused document listing every deliverable, form, cost estimate, signature, and required file that must appear in the proposal package before submission. The checklist is used *during* proposal development, not for deciding whether to pursue.

**Position in the workflow:** Phase 8 (Proposal development). Runs after management (Peter/Marianne) has approved proposal development, typically after the engineering brief has been generated and the timeline estimate is in.

**Why it exists separately from the meeting brief:** The meeting brief answers "should we go? where are we?" — a decision-support document. This checklist answers "what physically has to be in the envelope?" — an execution-support document. Different job, different lifecycle.

## When to use it

Use this skill after:

1. The RFP Scoring Skill returned Strong Pursue (or Worth a Look upgraded to pursue).
2. Peter and Marianne have approved proposal development.
3. Ideally after the engineering brief has been generated.

Do **not** use this skill:

- Before pursuit is approved.
- For no-bid RFPs.
- As a substitute for reading the RFP's submission requirements yourself before the final review.

## How to use it

Tell Claude: "generate the submission checklist for [RFP name]."

Before Claude generates anything, **run the prerequisite check below.** If any prerequisite is missing, pause and ask Jake for approval before continuing.

---

## Prerequisite check (run BEFORE generating the checklist)

Verify each of the following. Confirm to Jake which are present and which are missing.

**Hard requirement** (halt if missing — do not proceed without this):

- **The RFP itself.** Cannot build a checklist without the agency's stated submission requirements. If the RFP is not attached or accessible in the folder, stop and ask Jake to provide it.

**Soft requirements** (missing is okay if Jake explicitly approves):

- **RFP Scoring output** — evidence this RFP passed the pursue decision. If missing, ask: "The RFP hasn't been scored yet. That normally means we haven't confirmed this is a pursue. Do you want me to proceed anyway?"
- **Pursue approval from management** — confirmation Peter/Marianne have green-lit proposal development. If Jake cannot confirm, ask: "Have Peter and Marianne approved developing a proposal for this? If not, this checklist may be premature."
- **Engineering scope brief** — informs the technical content section of the checklist. Without it, technical items will be generic rather than tailored to what Chris or Frank flagged. If missing, ask specifically:

  > "The engineering brief hasn't been generated yet for this RFP. Without it, the checklist's technical content section will be generic — it won't include Chris or Frank's specific technical considerations. **Yes I understand** (proceed with a generic technical section) or **No let me get that first** (halt so you can generate the engineering brief first)?"

**Nice to have** (no need to ask — just note in the output):

- Any clarifying-questions-to-agency emails and their responses. These often change what needs to appear in the proposal (e.g., agency specified WCAG AA level in Q&A).
- Any RFP addenda published since the original release.

**Rule:** Never generate the checklist without either (a) all soft requirements met, or (b) Jake's explicit "yes I understand" for each missing item. When in doubt, ask.

---

## Output format

The checklist is a **PDF file** saved in the RFP's own folder **`RFPs/[stage]/[rfp-slug]/`** (created if it doesn't exist yet), named:

```
RFPs/[stage]/[rfp-slug]/submission-checklist_YYYY-MM-DD_[rfp-slug].pdf
```

Example: `RFPs/[stage]/maryland-mdsg-website-redesign/submission-checklist_2026-07-08_maryland-mdsg-website-redesign.pdf`

Every deliverable for a given RFP lives together in the RFP's own folder — `RFPs/[stage]/[rfp-slug]/`, where `[stage]` is its current lifecycle tier (`1-pre-submission` / `2-intermediate-stage` / `3-building` / `4-submitted`; a checklist usually means the RFP is in `3-building/`). Save into that `[rfp-slug]/` folder wherever it already exists; don't assume the tier or create a duplicate (see CLAUDE.md Rule 10).

**Length target:** 2–4 pages depending on RFP complexity. A simple website redesign RFP produces ~2 pages; a large federal RFP with heavy compliance can hit 4.

**Version implication:** When the RFP is amended (agency releases an addendum) or when the checklist reveals a missing item that later gets addressed, regenerate the PDF with today's date in the filename. Old versions stay in the prospect folder as a paper trail.

---

## The checklist structure

Six sections in this exact order:

### Section 1: Header

- **Opportunity sourced from (found via)** — the platform the RFP was found on (HigherGov, PlanetBids, RAMP, OpenGov, County of San Diego, CA eProcure, GSA eBuy) or "forwarded by [name]." Carry it from the scoring output's Source field; if unknown, ask Jake. This sits at the top so every checklist shows where the opportunity originated.
- **RFP name and number**
- **Agency**
- **Proposal due date and time (with time zone)**
- **Submission method** — email address, portal URL, or physical delivery address
- **Format requirements** — page limits, font size, margin rules, file naming conventions, required file types (PDF only? Word acceptable?)
- **Checklist generated on:** [Today's date]
- **Sources consulted:** [list of documents pulled from]

### Section 2: Required Documents (from the RFP)

The primary source. Every RFP has a "Proposal Response Outline" or "Offeror's Checklist" section that enumerates what must be submitted. Extract every item verbatim and turn it into a checkbox line.

Group items by the file structure the RFP requires. For example, USU's RFP requires three separate files (File One: Letter of Transmittal, File Two: Technical Proposal, File Three: Cost Proposal). Preserve that structure in the checklist so nothing gets attached to the wrong file.

For each item:
- Checkbox character `☐`
- Item name (verbatim from RFP)
- **Source:** the RFP section and page (`§6.01B(iii), p. 19`)
- **Owner:** who's producing this item
- **Notes:** any specific formatting or content requirements

### Section 3: Standard Seamgen Inclusions (from Adan's Playbook)

Items Seamgen always includes regardless of whether the RFP asks for them, per Adan's Playbook. Examples typically include:

- Seamgen company overview / capabilities statement
- **Relevant case studies** — pick from the clean case-study library at `resources/proposal-sources/Proposal - Case Studies.txt`, applying the **adjacent-experience principle** (rfp-scoring Category 1): choose the *closest real* Seamgen projects and frame each as transferable to this RFP's ask ("we built X → we can do Y"). Never invent a project; if a match is a stretch, present it as adjacent/transferable, not a direct claim.
- **Team resumes** — pull from `resources/proposal-sources/Proposal - People.txt` (or the individual bio files in `resources/resumes/`); generate a new resume in the same format for anyone not already covered.
- Standard past performance references

Cross-check the Playbook for the current standard list. If the Playbook lists items and the RFP already required them, note that in the item description — don't double-list.

### Section 4: Technical Content Requirements (from the engineering brief)

Pull from the engineering brief's "Scope of Work," "Technical Requirements," "Integrations," "Compliance and Security," "Accessibility," and "Ambiguities Requiring Clarification" sections. Turn each into a checklist item that says "proposal must address [topic]."

Examples of items:
- ☐ Discovery methodology description (per Engineering Brief, RFP §4.03A)
- ☐ AEO/GEO optimization approach (per Engineering Brief, RFP §4.03C)
- ☐ Accessibility conformance level stated (per Engineering Brief Ambiguity #1 — confirm with agency response before finalizing)

The purpose here is not to duplicate the engineering brief — it's to make sure every technical requirement the engineering brief flagged actually appears in the written proposal.

If the engineering brief was skipped (Jake said "yes I understand"), this section becomes a shorter generic list based on the RFP alone. Mark it in the section header: `[Generated without engineering brief — verify manually]`.

### Section 5: Legal and Procurement Items

Items that live outside the scope-of-work but are required by procurement rules. Standard items across most public-sector RFPs:

- Signed Letter of Transmittal
- Business license (current)
- Current W-9
- Certificate of insurance (types and amounts vary by RFP — extract from RFP)
- Claim of Business Confidentiality form (if Seamgen is redacting anything)
- References form (usually 3 references minimum)
- Evidence of financial responsibility (Dun & Bradstreet report, audited financials, or equivalent)
- E-Verify registration (state-specific — Utah, Arizona, others require this)
- Any exceptions/deviations to the RFP terms stated in the Letter of Transmittal

Owner routing for these: **Tina** owns business license, W-9, and company registration fields; **Nick** owns evidence of financial responsibility (financial statements, D&B, audited financials); **Marianne** owns insurance, contract-term exceptions, and signs the Letter of Transmittal (Peter approves). Note the owner explicitly per item.

### Section 5b: Forms to extract, complete & sign (embedded in the RFP)

Many RFPs bundle **fillable/signable forms as pages inside the RFP itself** — affidavits and certifications the vendor must extract, complete, sign (sometimes notarize), and include in the proposal package. These are the classic disqualifying-if-missing items, so detect them explicitly rather than assuming Section 2 caught them.

**Detection pass — scan the RFP text for:**
- Headings / labels: *Exhibit, Attachment, Affidavit, Certification, Certificate, Form, Acknowledgment, Disclosure*
- Affirmation language: *"I hereby affirm / certify / swear," "I FURTHER AFFIRM," "under penalty of perjury," "duly authorized representative," "notarize / notary public"*
- Named certs: *non-collusion, debarment / suspension, contingent-fee, bribery, drug-free workplace, anti-boycott (Israel/Iran divestment), MBE/DBE utilization, conflict of interest, addenda acknowledgment, key personnel form, financial disclosure, political contribution disclosure, E-Verify*
- Fillable cues: runs of underscores (`____`), checkboxes (`☐` / `[ ]`), signature/date/title blocks

**List each detected form as a checkbox item with:**
- Form name (verbatim) + the **RFP page(s) / Exhibit** it lives on
- **Signer / owner:** Marianne signs (Peter approves) for affidavits and anything binding the firm; **Tina** for registration/tax/license fields; **Nick** for financial-disclosure figures
- **Action:** *extract page(s) → complete → sign (→ notarize if required) → attach*
- ⚠ flag if the RFP says a missing/unsigned form renders the proposal non-responsive
- **Where it goes:** into the proposal package as attachments — a combined signed-forms PDF or separate uploads, per the submission method in Section 1. (The proposal-deck skill mirrors this list in its "Appendix: Required Forms & Certifications" so nothing is dropped.)

**Extraction note:** pinpoint the exact pages/exhibits; Jake extracts those pages from the source RFP PDF (or uses the agency's separately-posted fillable versions) to sign — Claude locates and lists, Jake signs.

**Only list forms that require completion/signature by the offeror.** A sample contract or "successful offeror only" affidavit (e.g., a Contract Affidavit executed at award, not at proposal) is noted but not put on the extract-and-sign list. **If none are present, state: "No embedded signable forms detected in this RFP."** (Example: Rancho Palos Verdes — the only signature artifact is the PSA executed at award, so this section reads "none detected"; USM-MDSG, by contrast, carries Exhibits B, D, K, O, and P.)

### Section 6: Pre-Submission Verification

The last-mile checklist. Run this the day of submission before hitting send. Items include:

- ☐ All required files present and named correctly
- ☐ File sizes within any stated limits
- ☐ Cost proposal in separate file from technical proposal (if RFP requires — most do)
- ☐ Page limits verified
- ☐ Required signatures obtained
- ☐ Addenda acknowledged in Letter of Transmittal
- ☐ All embedded signable forms (Section 5b) extracted, completed, signed, and attached
- ☐ Submission window confirmed (right time zone, right deadline)
- ☐ Backup copy saved locally

Also include a **"stop and verify with Marianne or Peter before submitting"** line — no proposal goes out without a second set of eyes. Ever.

---

## Item format (used for every checkbox item)

```
☐ [Item name — verbatim from source when possible]
   Source: [where this requirement came from — RFP § and page, or "Adan's Playbook," or "Engineering Brief"]
   Owner: [Jake / Peter / Marianne / Chris / Frank / Hoda / External / Multiple]
   Notes: [Any specific requirements — page limit, format, content specifics, deadline within the deadline]
```

Ownership options:

- **Jake** — general project management, timelines, proposal drafting, firm-experience/reference forms, most standard forms
- **Peter** — final approval on pursuit and price; final sign-off. (Marianne executes the binding signature — see below.)
- **Marianne** — legal/procurement affidavits, insurance, contract review, and **authorized signatory for binding documents** (transmittal letter, affidavits), with Peter's final approval
- **Tina** *(Operations/Admin)* — company registration fields (offeror address, phone, email, tax ID), business license, W-9, vendor-portal/account setup, Secret Server credentials
- **Nick** *(Operations/Admin)* — evidence of financial responsibility (financial statements, D&B report, audited financials); pairs with Tina on portal/account registration
- **Chris / Frank** — technical approach sections, architecture diagrams, integration plans
- **Hoda** — design system samples, visual deliverables, UX artifacts; and past-work/case-study matching to the RFP's experience asks
- **Firm experience / case studies** — default owner trio is **Jake + Frank + Hoda** (Hoda matches past work, Frank confirms technical precedent, Jake assembles)
- **External** — third-party items (bonded surety letters, notarized documents)
- **Multiple** — items that need input from more than one person (e.g., cost sheet = Marianne + engineers)

---

## Worked example: Utah State University Online Website Redesign (RFP #DG012336)

*This is a real RFP processed as an illustration. The USU RFP has an explicit "Offeror's Checklist" on page 20, which makes it a clean example. In a real case, Claude would also pull from the engineering brief — here I'll show what a checklist looks like when the engineering brief was skipped (with Jake's approval).*

**Generated file:** `RFPs/[stage]/usu-online-website-redesign/submission-checklist_2026-07-08_usu-online-website-redesign.pdf`

```
SUBMISSION CHECKLIST
====================

Opportunity sourced from (found via): HigherGov
RFP: USU Online Website Ecosystem Redesign & Rebuild
RFP #: DG012336
Agency: Utah State University — Purchasing Services
Contact: David Green (david.green@usu.edu)
Proposal due: July 6, 2026 by 3:00 PM MST
Submission method: Email to david.green@usu.edu
Format requirements: Three separate files (see Section 2)
Checklist generated: 2026-07-08
Sources consulted: RFP (27 pages), Adan's RFP Playbook,
                    resources/proposal-sources/Proposal - Case Studies.txt,
                    resources/proposal-sources/Proposal - People.txt.
Engineering brief: Skipped (Jake approved with "yes I understand" —
                    Section 4 is generic).

---

SECTION 2: REQUIRED DOCUMENTS (from the RFP)
--------------------------------------------

FILE ONE — Letter of Transmittal (§6.01A, p. 18)

☐ Signed Letter of Transmittal
  Source: RFP §6.01A, p. 18
  Owner: Peter (signature) + Jake (drafting)
  Notes: Standard business letter format. Must be signed by an individual
         authorized to legally bind Seamgen.

☐ Statement referencing all addenda received (or "no addenda received")
  Source: RFP §6.01A(i), p. 18
  Owner: Jake
  Notes: Check for addenda before finalizing.

☐ Statement that proposal remains valid for 120 calendar days
  Source: RFP §6.01A(ii) + §5.01, p. 14
  Owner: Jake

☐ Statement accepting financial responsibility for oral presentation
  travel expenses (if presentation required)
  Source: RFP §6.01A(iii), p. 18
  Owner: Jake

☐ Deviations or exceptions to RFP requirements (with justification)
  Source: RFP §6.01A(iv), p. 18
  Owner: Jake (drafts) + Peter (approves any exceptions)

☐ Identification of Confidential Information (per §5.08)
  Source: RFP §6.01A(v), p. 18
  Owner: Jake + Marianne

☐ Proposed exemptions to terms and conditions (each addressed individually)
  Source: RFP §6.01A(vi), p. 18
  Owner: Marianne (contract review)

FILE TWO — Technical Proposal (§6.01B, p. 19)

☐ Executive Summary and Proposal Overview
  Source: RFP §6.01B(i), p. 19
  Owner: Jake + Peter (final review)

☐ Detailed Discussion (response to each RFP section requiring a response,
  in outline form with matching section numbers)
  Source: RFP §6.01B(ii), p. 19
  Owner: Jake + engineers
  Notes: Sections 3, 4, 5, 7, 8 require response. Where content is
         agreeable, "Understood and Agreed" acceptable.

☐ Offeror Qualifications section (per §6.01B(iii))
  Source: RFP §6.01B(iii), p. 19
  Owner: Jake

☐ Business license (current)
  Source: RFP §6.01B(iii)(1), p. 19
  Owner: Marianne

☐ Current W-9 form
  Source: RFP §6.01B(iii)(2), p. 19
  Owner: Marianne

☐ Claim of Business Confidentiality form (if redacting anything)
  Source: RFP §6.01B(iii)(3), p. 19
  Owner: Jake + Marianne

☐ Three (3) references, each with business name, address, phone,
  contact, project description
  Source: RFP §6.01B(iv), p. 19
  Owner: Jake
  Notes: References must be from customers who received similar services.

☐ Evidence of Financial Responsibility (D&B report OR audited financials
  from last 2 fiscal years OR equivalent documentation)
  Source: RFP §6.01B(v), p. 20
  Owner: Marianne

FILE THREE — Cost Proposal (§6.01C, p. 20)

☐ Cost proposal in a separate file (NO cost info in Technical Proposal)
  Source: RFP §6.01C, p. 20
  Owner: Marianne + engineers (estimate) + Peter (approval)
  Notes: Cost proposals with pricing in the technical proposal are
         disqualified. Line-item detail required.

☐ Sample deliverables demonstrating typical work product
  Source: RFP §4.05, p. 14
  Owner: Hoda + Jake
  Notes: Site maps, wireframes, design systems, AI discoverability
         strategy, UX documentation, or reporting dashboards.

☐ Project timeline (Gantt chart preferred)
  Source: RFP §4.05, p. 13
  Owner: Jake + Chris/Frank

☐ Team documentation (roles, responsibilities, experience of key
  personnel)
  Source: RFP §4.05, p. 14
  Owner: Jake

☐ Three client references from comparable projects in past 5 years
  Source: RFP §4.05, p. 14
  Owner: Jake

☐ Insurance documentation and bonds (if applicable)
  Source: RFP §4.05, p. 14
  Owner: Marianne

---

SECTION 3: STANDARD SEAMGEN INCLUSIONS (from Adan's Playbook)
--------------------------------------------------------------

☐ Seamgen company overview / capabilities statement
  Source: Adan's Playbook (standard)
  Owner: Jake
  Notes: Cross-check with RFP §6.01B — may already be covered by
         Executive Summary.

☐ Relevant case studies (adjacent-experience principle)
  Source: resources/proposal-sources/Proposal - Case Studies.txt
  Owner: Jake
  Notes: For USU, Winward Academy, Contentstack, and Coaching.com are
         the strongest direct analogs; bridge others as transferable
         (e.g., Comic Con for high-traffic public web). Real projects only.

☐ Team resumes
  Source: resources/proposal-sources/Proposal - People.txt (or individual bio files)
  Owner: Jake
  Notes: If a team member isn't covered, generate a resume in the same
         format.

---

SECTION 4: TECHNICAL CONTENT REQUIREMENTS
------------------------------------------

[Generated without engineering brief — verify manually]

☐ Discovery methodology narrative (RFP §4.03A required)
  Owner: Jake + Chris/Frank

☐ UX and Information Architecture approach (RFP §4.03B required)
  Owner: Hoda + Jake

☐ AI Discoverability and Search Optimization approach — SEO, AEO, GEO
  (RFP §4.03C required)
  Owner: Jake
  Notes: Central to this RFP. Requires an actual strategy, not just
         "we'll do SEO."

☐ Visual Design system approach (RFP §4.03D required)
  Owner: Hoda

☐ Reporting requirements — sample reports/dashboards used for project
  reporting (RFP §4.03E)
  Owner: Jake + Chris/Frank

☐ Roles and Responsibilities section (RFP §4.03F)
  Owner: Jake

☐ Accessibility approach — confirm WCAG level with agency Q&A response
  Owner: Jake
  Notes: RFP only says "adhere to University Website Policy" — verify
         the specific WCAG standard required before writing.

---

SECTION 5: LEGAL AND PROCUREMENT ITEMS
---------------------------------------

☐ Standard contract or service agreement Seamgen proposes
  Source: RFP §4.05, p. 13
  Owner: Marianne

☐ Governmental Entity Addendum with Data Processing — reviewed and
  ready to sign
  Source: RFP §4.05, p. 13
  Owner: Marianne + Peter

☐ E-Verify registration confirmation (required for physical performance
  in Utah)
  Source: RFP §5.23, p. 18
  Owner: Marianne

☐ Statement re: no outstanding Utah state tax liens
  Source: RFP §5.21, p. 17
  Owner: Marianne

☐ Debarment certification (or written explanation if unable to certify)
  Source: RFP §8.17, p. 26–27
  Owner: Marianne

---

SECTION 6: PRE-SUBMISSION VERIFICATION
---------------------------------------

☐ All three files present, correctly named
☐ Cost proposal in separate file (not in Technical Proposal)
☐ Signatures obtained from Peter on Letter of Transmittal
☐ Addenda acknowledged (or "none received" statement included)
☐ Submission window confirmed (Mountain Time, 3:00 PM July 6, 2026)
☐ Backup copy saved to prospect folder
☐ Final review with Marianne AND Peter completed
☐ Ready to send

** No proposal goes out without a second set of eyes. **
```

---

## Notes and edit history

**v1.6 — July 2026, Jake + Claude.** Folder reorg (type-based → by-RFP): the checklist PDF now saves to the RFP's own folder `RFPs/[stage]/[rfp-slug]/` (was `submission-checklists/`). See CLAUDE.md v1.13.

**v1.5 — July 2026, Jake + Claude.** Added **Section 5b — "Forms to extract, complete & sign (embedded in the RFP)"**: a detection pass (headings/affirmation-language/named-certs/fillable cues) that lists each signable affidavit or certification bundled inside the RFP with its page/exhibit, signer, extract→sign→attach action, disqualifying-if-missing flag, and where it goes in the package. States "none detected" when absent (e.g., RPV). The proposal-deck skill's Appendix mirrors this list, and Section 6 gained a verification line. Prompted by Jake flagging embedded sign-and-return forms.

**v1.4 — July 2026, Jake + Claude.** Folder reorg: checklists now save to the `submission-checklists/` folder; repointed the case-study/people references to the new top-level `resources/`.

**v1.3 — July 2026, Jake + Claude.** Added an **Opportunity sourced from (found via)** line to the top of Section 1 (and the worked example) so every checklist shows the sourcing platform — matching the new CLAUDE.md global rule.

**v1.2 — July 2026, Jake + Claude.** Refined the ownership guidance after Jake re-assigned owners on the USM-MDSG checklist. Added **Tina** (Operations/Admin — company registration fields, business license, W-9, vendor-portal/account setup, Secret Server credentials) and **Nick** (Operations/Admin — evidence of financial responsibility; pairs with Tina on registration). Moved business license / W-9 / registration off Marianne to Tina, and financial-responsibility docs off Marianne to Nick. Established **Marianne as the authorized signatory for binding documents** (transmittal letter, affidavits) with Peter's final approval — previously Peter was shown as signer. Set the default firm-experience/case-study owner trio to Jake + Frank + Hoda. Updated the Section 5 owner-routing line accordingly.

**v1.1 — July 2026, Jake + Claude.** Pointed Section 3 at the clean case-study/people text in `resources/` (instead of the PDFs) and adopted the **adjacent-experience principle** for case-study selection — closest *real* project, framed as transferable, never invented — matching rfp-scoring v1.1, rfp-email-pursue v1.2, and rfp-meeting-brief v1.2.

**v1.0 — July 2026, Jake + Claude.** First draft. Structure derived from USU RFP §6.01 Proposal Response Outline, Adan's Playbook standard inclusions, and the engineering brief's technical content categories. Prerequisite check baked in for the engineering brief specifically — most likely upstream artifact to be missing when this skill is invoked.

**Known limitations of v1.0:**
- Assumes public-sector RFPs. Federal, state, and local government RFPs share common structure. Private-sector RFPs may have different required items.
- Section 3 (Standard Seamgen Inclusions) needs a real inventory from Adan's Playbook rather than the placeholder examples listed. When Adan's Playbook is next reviewed, extract the actual standard list.
- Ownership tags are best-guess based on team roster. If ownership responsibilities have shifted (e.g., Marianne handling more/less of the legal side), update the ownership guidance section.
- Does not include a "cost sheet build" workflow — that's a separate skill worth building later once we have Marianne's actual cost sheet template.
- Does not currently handle multi-vendor teaming arrangements where Seamgen is a subcontractor. If that comes up, add a teaming variant.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
