---
name: rfp-email-agency-questions
purpose: Generate the formal email sent to the RFP agency's point of contact, submitting clarifying questions during the RFP's Q&A window. This is the external-facing email that follows the internal pursue-to-Peter email.
audience: This skill is written to be read by both Claude (who drafts the email) and a human teammate (who reads, sanity-checks, and edits the template over time).
version: 1.5 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (this template reads from that skill's output), and typically the pursue-to-Peter email (the agency questions may reflect Peter's additions)
---

# Clarifying-Questions-to-Agency Email Skill

## What this skill does

Generates the formal email that Seamgen sends to the agency's designated point of contact, submitting clarifying questions during the RFP's official Q&A window.

**This email is different from the internal pursue-to-Peter email.** The pursue email is internal, informal, and invites Peter to add questions. This email is external, formal, and represents Seamgen to the buyer. Tone, salutation, and structure all shift accordingly.

## When to use it

Use this skill after:

1. The RFP Scoring Skill returned a Pursue recommendation.
2. The pursue-to-Peter email was sent.
3. Peter has responded (or not, after a reasonable window), and the final question list is set.
4. There is still time to submit — either the RFP's formal Q&A window is open, OR (the common case) the RFP has no formal Q&A window and Seamgen is proactively initiating questions to engage the agency and get our name in front of them.

**Note on timing:** Most of the time these questions are Seamgen-initiated — there is no posted "questions due" deadline, and reaching out is itself a business-development move. When the RFP *does* post a formal Q&A deadline, submit before it. When it doesn't, submit early enough that responses can still shape the proposal before the proposal due date.

Do **not** use this skill:
- Before Peter has had a chance to weigh in on the questions.
- After a formal Q&A window has closed (the agency won't respond), or so close to the proposal due date that answers couldn't be incorporated.
- For no-bid RFPs (obviously).

## How to use it

Provide the question sources (see "Converging the question sources" below) and the agency contact info. Say "draft the agency clarifying questions email."

Claude will produce the email using the template below.

## Converging the question sources (one list, no duplicates)

By the time this email is drafted, clarifying questions may have been generated in up to three places. **This email is the single point where they converge into one list — deduplicated, not concatenated.**

Pull from:
1. **The pursue-to-Peter email thread** — the starter questions, plus anything Peter added.
2. **The Engineering Scope Brief** — its "Ambiguities Requiring Clarification" section, if a brief was generated. These are the most rigorous: each is tied to a specific RFP section and page.
3. **Anything new** that has surfaced since (an agency addendum, a gap noticed while drafting).

Merge rules:
- **Dedupe by topic, not by wording.** If the pursue starter list and the engineering brief both ask about the current CMS, that becomes *one* question in the final email — not two.
- **When two sources overlap, prefer the engineering brief's version** — it's sourced and precise. But strip its internal "Why it matters for engineering" note; that's for Jake and Peter, never for the agency.
- **Keep every distinct engineering ambiguity.** Each one affects timeline or price, so a dropped ambiguity is an un-costed risk.
- **Then apply the "Rules for questions in this email" below** (answerable by the contact, non-offending, numbered, logically grouped).

The pursue starter questions and the engineering brief's ambiguities are *expected* to overlap — this step collapses them into the clean list the agency actually receives.

## The pattern (from Katie, June 22, 2026 — Rancho Palos Verdes)

Katie's agency-facing email has a distinct shape from the internal emails:

- **Recipients:** The specific agency contact named in the RFP (in Katie's case, "jlucas" — Mr. Lucas at Rancho Palos Verdes). Sales team CC'd for internal record.
- **Subject line:** Not shown in the source, but should reference the RFP name/number so it doesn't get lost in the agency's inbox.
- **Salutation:** Formal. "Dear Mr. Lucas," — not "Hello" or "Hi." First-name basis is not appropriate for a first external touch.
- **Opening:** One sentence stating who Seamgen is and which RFP the email is regarding. This matters because RFP contacts often handle multiple procurements simultaneously.
- **Body:** Two beats.
  - Beat 1: "I am submitting the following questions for clarification:" followed by a **numbered** list of questions (not bullets — numbered so the agency can respond by number).
  - Beat 2: Two closing asks.
    - "Please confirm receipt of these questions."
    - "Do you have an expected date for when the responses will be shared?"
- **Close:** "I look forward to reviewing your responses and using this information to develop a comprehensive proposal that meets [Agency]'s requirements and objectives." + signature.

**Why this shape works:**

Everything about this email is designed to make the agency's job easier. Numbered questions can be answered in order. Confirming receipt catches lost emails. Asking for a response timeline avoids awkward follow-ups later. And the closing sentence reminds the agency that Seamgen is a serious, professional bidder — not a bot.

The tone is important. Katie writes as if she's already Mr. Lucas's colleague, not begging for a scrap of information. Confidence without arrogance. That's the register to preserve.

## Template

```
To: [Agency contact email]
CC: Sales

Subject: [RFP number/name] — Clarifying Questions from Seamgen

Dear [Mr./Ms./Dr.] [Last name],

I am writing on behalf of Seamgen regarding the RFP for [full RFP name].

I am submitting the following questions for clarification:

1. [Question 1]
2. [Question 2]
3. [Question 3]
4. [Question 4]
5. [Question 5]
6. [Question 6]
7. [Question 7]
   [Optional sub-question, indented with two spaces and a bullet, e.g.]
   - [Follow-up detail on the same question]

Please confirm receipt of these questions.

I look forward to reviewing your responses and using this information to
develop a comprehensive proposal that meets [Agency name]'s requirements
and objectives.

Do you have an expected date for when the responses will be shared?

Kind regards,
Jacob Oliker
AI Sales Consultant
Seamgen
(925) 389-1515
joliker@seamgen.com
```

*Signature is the canonical external block from `reference-team-and-signature.md` (v1.2), taken from Jake's own sent mail — note **Jacob**, the lowercase "regards", and the **AI** in the title. If it changes, update it there, not here.*

## Creating the draft in Gmail

Once the email is written, **create it as a draft in Gmail** so Jake doesn't have to retype it. Also print it in chat exactly as before — the chat copy is how he reviews it; the draft is the convenience.

**Claude never sends this email. Only ever a draft.** See the Connectors section of `CLAUDE.md`, which governs and overrides anything here. That rule matters more here than on the internal emails: **this one goes to the buyer**, and a clumsy or premature question to an agency contact is a real impression that can't be withdrawn.

| Field | Value |
|---|---|
| **To** | **Jake alone — `joliker@seamgen.com`.** The agency contact's address goes nowhere near this draft, in To, Cc or Bcc, even when the RFP states it plainly. Jake puts it in himself — the last human checkpoint before anything reaches a buyer. (Gmail rejects a draft with no recipient at all, which is why this is self-addressed rather than empty — see Connectors in `CLAUDE.md`.) |
| **Cc / Bcc** | **Empty.** |
| **Subject** | The template's subject line (RFP number + "Clarifying Questions" per the pattern). |
| **Body** | First line `Intended recipient: [agency contact name, title, agency]`, then a blank line, then the email exactly as written — including the **full external signature block** from `reference-team-and-signature.md`, not the internal first-name-only one. |

**Rule 9's external exception holds inside the draft.** No `Source (found via)` line, no HigherGov link, and no Google Drive link ever appears in this email — we never tell an agency we found their RFP on a sourcing platform, and the Drive folder is internal. The `Intended recipient:` line is scaffolding for Jake; it goes above the email body and he deletes it before sending.

Report the draft link when it's done. If the Gmail connector turns out to offer no draft capability, **stop and tell Jake** — don't send it, and don't route it anywhere else instead.

## Rules for questions in this email

The questions here differ subtly from the pursue-to-Peter starter list. In the internal email, questions could be exploratory. In this external email, every question should be:

1. **Answerable by the agency contact.** Don't ask "what will the political dynamics of this project look like?" Ask concrete, procurement-appropriate things.
2. **Actually needed to shape the proposal.** If you can figure it out from the RFP, don't ask. The agency will note (and dislike) sloppy questions.
3. **Free of assumptions that could offend.** "Is the incumbent being considered?" is fine. "Are you unhappy with the incumbent?" is not.
4. **Numbered, not bulleted.** Numbering lets the agency respond by number and lets other bidders reading the public Q&A file see clearly what was asked.
5. **Grouped logically if there are many.** If you have 10+ questions, group them under headers (Discovery, Technical, Budget, Timeline). If fewer, a flat numbered list is fine.
6. **Light page pointers yes, internal sourcing no.** Where a question points at a specific part of the RFP, a brief pointer is good — it signals we actually read the document (Katie's Q3 did exactly this: "the technical requirements listed starting on page 5"). But do **not** paste the internal verbatim-quote blocks or the "why it matters for engineering" notes from the pursue email / engineering brief into this external email. Those are navigation aids for Jake, Peter, and Chris — the agency just needs the clear question, optionally with a page pointer.
7. **No "found via" line.** Every *internal* deliverable carries a "Source (found via)" field naming the sourcing platform (per the CLAUDE.md global rule). This external email is the **sole exception** — never tell the agency we found their RFP on HigherGov/PlanetBids/etc. It's internal tracking only and reads oddly to the recipient.

8. **Never ask a question that exposes a weakness or invites scrutiny.** *(Added v1.5, from Marianne's review of the Suwannee questions.)* Every question is read by the evaluators and, once answered publicly, by every competitor. **Before each one, ask: does the answer change what we do — or does asking it change what they think of us?** If it's the second, cut it.

   Two worked cuts from Suwannee 26/27-002:

   - **Asking how a "zero-error rate" migration standard would be measured.** Marianne: *"we are professionals so of course we ingest 100% correct."* The question reads as doubt about a competence we should simply demonstrate in the work plan. Volume is a legitimate estimating input; the standard is not something to negotiate down in public.
   - **Asking whether the AI-use disclosure covers proposal tooling.** The RFP's AI line sits **inside the 50-point Work Plan & Approach criterion** — it is *scored*. Asking draws evaluator attention to our AI use for no operational gain. Marianne: *"since they mention use of AI for the proposal as a risk.. so would not ask."*

   **The boundary:** a question about a *requirement we must price or design against* is fair even when the answer might be unwelcome. A question that mainly advertises an insecurity is not.

9. **Prefer questions that are hard to answer evasively.** *(Added v1.5.)* Phrasing decides whether you get an answer or a shrug.

   | Weak | Strong | Why |
   |---|---|---|
   | "Is there a budget for this project?" | "Has the District established a budget or not-to-exceed amount? If so, please provide the range. **If not, please confirm that no budget has been established.**" | Closes the silent-non-answer escape |
   | "Is there an existing vendor?" | "**Who** is the vendor currently supporting…?" | Presupposes one, so it returns a **name** we can research or approach |

10. **Read the evaluation criteria before finalising the list.** *(Added v1.5.)* Questions are a **positioning instrument**, not only an information-gathering one — the agency publishes the answers and every bidder reads them. Where a criterion carries heavy weight, a question that signals the right approach earns something a purely informational question does not. Suwannee puts **50 of 100 points on Work Plan & Approach**, its first sub-criterion being *"Understanding of the District's needs"* — which is why Marianne added a question about spending time with District staff to learn the workflow as actually performed, including steps absent from written procedure.

11. **State an awkward positioning question plainly rather than hinting at it.** *(Added v1.5.)* Where `rfp-scoring` **Gate 2a** leaves genuine doubt that we are the right *kind* of firm, ask the buyer outright, describing what we actually are. Marianne's Suwannee sub-question is the model: *"we have built ArcGIS functionality before, but Seamgen is a bespoke software development company… specializing in workflow automation, agentic workflows and system integration as a layer on top of systems such as ArcGIS, rather than in implementing ArcGIS itself. Does it make sense for a firm of that profile to submit an offer?"* A "no" costs one email and saves a proposal cycle; a "yes" is worth more than a guess. **Describe the firm honestly — never overstate to make the answer come out favourably.**

## Worked example: Rancho Palos Verdes (Katie's real email, June 22, 2026)

**Inputs:**
- RFP: City of Rancho Palos Verdes Recreation Management Software Platform
- Agency contact: jlucas (Mr. Lucas)
- Final question list: 12 questions, refined from the pursue-to-Peter starter list.

**Generated email (matches Katie's real email almost verbatim):**

```
To: jlucas@rpvca.gov
CC: Sales

Subject: Recreation Management Software Platform RFP — Clarifying
Questions from Seamgen

Dear Mr. Lucas,

I am writing on behalf of Seamgen regarding the RFP for the City of
Rancho Palos Verdes' Recreation Management Software Platform.

I am submitting the following questions for clarification:

1. Please share the link to the existing website
2. What are the 3 biggest pain points of the current website?
3. Aside from the technical requirements listed starting on page 5, are
   there any other UI enhancements you are looking for in the recreation
   management software platform?
4. As the current software provider, is ActiveNet being considered for
   the new recreation management software platform?
5. If you could design the ideal version of your website without
   limitations, what would it look like in terms of design,
   functionality, and user experience?
6. What manual workflows are you looking to make more efficient?
7. To increase resident participation in recreation programming, are
   there specific demographic groups you would like to target with the
   new recreation management platform?
8. Have you considered a chat bot to increase search functionality for
   the public user? Would this be something that you are interested in?
9. Does payment and billing functionality need to integrate with a
   Kiosk solution?
   - Does the City have a preferred existing payment and billing
     hardware provider that the contractor must integrate with, or
     should hardware ecosystem be suggested as part of the solution?
10. Does the contractor need to provide iOS and Android Apps that are
    published to the Apple App Store and Google Play, or just 100%
    functional parity (aka run in their web browser on the mobile
    device)?
11. Do you have a ballpark figure or a maximum budget in mind for this
    project so I can ensure our proposal meets your expectations?
12. Will you share the comprehensive Q&A submitted by all prospective
    bidders on the RFP portal?

Please confirm receipt of these questions.

I look forward to reviewing your responses and using this information
to develop a comprehensive proposal that meets the City of Rancho
Verdes' requirements and objectives.

Do you have an expected date for when the responses will be shared?

Kind Regards,
[Your name]
```

*(The closing above is Katie's, kept as a historical record. A generated email signs with the current external block — "Kind regards, / Jacob Oliker / AI Sales Consultant" — per `reference-team-and-signature.md` v1.2.)*

**What Katie did well here** (and worth preserving in future emails):

- Question 3 references a specific page ("page 5") in the RFP — signals to Mr. Lucas that the RFP was actually read.
- Question 9 uses an indented sub-question to keep related items together.
- Question 11 explicitly says "so I can ensure our proposal meets your expectations" — reframes what could be a rude question ("what's your budget?") as helpful.
- Question 12 asks for the public Q&A file — this is a pro move because it lets Seamgen see what competitors are asking about, revealing where the agency is receiving pushback.

## Notes and edit history

**v1.5 — July 31, 2026, Jake + Claude.** Four new question rules (8–11), all from **Marianne's line-by-line review** of the Suwannee River WMD questions on the morning of the deadline. Until now the skill governed *how* to phrase a question and *whether the agency could answer it* — it had nothing to say about whether asking was **in our interest**, and that turned out to be the gap.

**Rule 8 — never ask a question that exposes a weakness or invites scrutiny** — is the principle behind both of her cuts, and neither was obvious from the old rules. She struck the question about how the *"zero-error rate"* migration standard would be measured (*"we are professionals so of course we ingest 100% correct"*) — it reads as doubt about a competence the work plan should simply demonstrate. And she struck the question about whether the AI-use disclosure covers proposal tooling, because that requirement sits **inside the 50-point Work Plan & Approach criterion**: it is scored, so asking spends evaluator attention on our AI use for no operational gain. The test is now written as: *does the answer change what we do, or does asking it change what they think of us?* With a boundary, so this doesn't become an excuse to duck hard questions — anything we must **price or design against** stays fair even if the answer might be unwelcome.

**Rule 9 — prefer questions that are hard to answer evasively.** Her two rewrites are the worked examples: "is there a budget" became *"…If not, please confirm that no budget has been established,"* closing the silent non-answer; "is there an existing vendor" became *"**who** is the vendor,"* which returns a name we can research or approach.

**Rule 10 — read the evaluation criteria before finalising the list.** Questions are a **positioning instrument**, not just an information-gathering one, because the agency publishes the answers and every bidder reads them. Marianne worked backwards from the scoring — 50 of 100 points on Work Plan & Approach, first sub-criterion *"Understanding of the District's needs"* — and added a question about spending time with District staff to learn the workflow as actually performed, *"the unwritten flow."*

**Rule 11 — state an awkward positioning question plainly rather than hinting at it.** Where `rfp-scoring` **Gate 2a** leaves real doubt that we are the right *kind* of firm, ask the buyer, describing what we actually are. Her Suwannee sub-question is the model and is quoted in full. A "no" costs one email and saves a proposal cycle. Guardrail attached: describe the firm honestly, never overstate to steer the answer.

**v1.4 — July 22, 2026, Jake + Claude.** Two corrections from the first live test of the Gmail connector. **(1) The draft is addressed to Jake, not left empty.** v1.3 said to leave To and Cc blank; Gmail refuses — `create_draft` returns *"At least one recipient (To, Cc, or Bcc) must be specified."* Drafts now go to `joliker@seamgen.com` and nobody else. **This matters most on this skill of the four**: it is the one whose intended recipient is outside Seamgen, and self-addressing guarantees that a draft sitting in Gmail has no agency address on it at all. **(2) The external signature is corrected** to "Kind regards, / Jacob Oliker / **AI** Sales Consultant" (`reference-team-and-signature.md` v1.2) — the old block was reconstructed from Katie's pattern and had the wrong first name, capitalisation and title. Katie's worked example keeps her original closing, with a note not to copy it.

**v1.3 — July 22, 2026, Jake + Claude.** The skill now **creates a Gmail draft** in addition to printing the email in chat. **To and Cc are left empty** — Jake adds the agency contact himself, which is deliberately the last human checkpoint before anything reaches a buyer. **Claude never sends email under any circumstances**; the governing rule lives in the Connectors section of `CLAUDE.md`. Restated Rule 9's external exception explicitly for the draft: no `Source (found via)` line, no HigherGov link, and **no Google Drive link** — the Drive folder added in `CLAUDE.md` v1.24 is internal and must never reach an agency. Also specified that the draft carries the **full external signature block**, not the internal first-name-only one. No change to the email's content, question structure, or tone.

**v1.2 — July 2026, Jake + Claude.** Recorded this external email as the **sole exception** to the CLAUDE.md "Source (found via)" global rule (added rule #7): the sourcing platform is internal tracking and is never shown to the agency.

**v1.1 — July 2026, Jake + Claude.** Established this email as the single convergence point for clarifying questions: added the "Converging the question sources" section (pull from the pursue thread + engineering brief Ambiguities, dedupe by topic, prefer the sourced engineering version on overlap) and a rule that internal verbatim-quote blocks / "why it matters" notes are stripped for the agency, though a light page pointer may stay.

**v1.0 — July 2026, Jake + Claude.** First draft. Template derived from Katie's Rancho Palos Verdes agency-questions email of June 22, 2026, sent to jlucas at the City.

**Known limitations of v1.0:**
- Signature block is hard-coded generic. Real emails should include Jake's actual title, phone, and email.
- The template CCs Sales by default. If specific RFPs need different internal CCs (e.g., adding Adan or Marianne for larger opportunities), update as needed.
- Does not handle the case where the RFP requires questions be submitted through the procurement portal instead of by email. When that happens, the same question list can be used, but the delivery mechanism is different — no email is sent, just the portal submission. Consider adding a portal-submission variant.
- Assumes English-language, US-domestic RFPs. Adjust register for international agencies or state agencies with distinct communication norms.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
