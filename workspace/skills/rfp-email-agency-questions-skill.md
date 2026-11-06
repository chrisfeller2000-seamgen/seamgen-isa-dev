---
name: rfp-email-agency-questions
purpose: When someone asks in chat, generate the clarifying questions Seamgen would submit during an RFP's Q&A, state the Q&A deadline, and give the formal email to the agency's point of contact as text to copy. ISA never creates a draft or sends anything.
audience: This skill is written to be read by both ISA (who writes the questions and the email text) and a human teammate (who reads, sanity-checks, and edits the template over time).
version: 1.6 — November 2026
owner: Seamgen sales team (no single owner or approver)
depends_on: rfp-scoring skill (the scored judgment for this RFP), the RFP's downloaded documents, and the Engineering Scope Brief when one exists
---

# Clarifying-Questions-to-Agency Skill

## What this skill does

When a teammate asks ISA in chat for an RFP's Q&A questions, ISA:

1. States the **Q&A deadline** and whether the window is still open.
2. Writes **5–7 clarifying questions**, each tied to the RFP text that prompted it.
3. Gives the formal email to the agency's point of contact **as plain text in chat**, ready to copy into the sender's own email.

**ISA never creates a Gmail draft and never sends this email.** It goes to the buyer, and a clumsy or premature question to an agency contact makes an impression that can't be withdrawn. Whoever sends it pastes it into their own mail, edits it, and adds the recipient themselves.

**This email is external and formal.** It represents Seamgen to the buyer. ISA's Friday pursue email is internal; this one is not, and tone, salutation, and structure shift accordingly.

## When to use it

Use it when someone asks for Q&A or clarifying questions on an RFP Seamgen is pursuing. Usually that is a Strong Pursue from the Friday pursue email, or a "Conditional — Ask the Agency" RFP that needs its one question sent (see `rfp-scoring`).

**Timing:** many RFPs post no formal Q&A window, and reaching out anyway is a business-development move that gets our name in front of the buyer. When the RFP posts a questions deadline, the questions must go in before it. When it doesn't, they should go early enough that the answers can still shape the proposal.

Do **not** write the questions:
- after a formal Q&A window has closed (say so instead: the agency won't answer), or so close to the proposal due date that answers couldn't be used;
- for no-bid RFPs.

If the person asks anyway after the window closed, say the window has closed, and give the questions only if they confirm they still want them (for example, to prepare for an interview).

## Where to find the inputs

Read these for the RFP, in this order. Don't ask the person for anything ISA can read itself.

1. **The RFP documents:** `RFPs/<stage>/<slug>/resources/` and its `_document-manifest.json`. These are the source of truth; every question points back to them. They persist between weekly runs, and a copy is in the RFP's Drive folder.
2. **The scored judgment.** Where it is depends on when the RFP was scored, because each weekly run deletes the previous week's candidate files:
   - **Scored in this week's run:** `scoring_judgments` in the `RFP-pipeline/candidates/<slug>/candidate.md` front matter.
   - **Scored in an earlier week:** that week's `reports/new-rfp-qualification/audit/<run date>.jsonl`, where the RFP's line holds the full-text judgment with quotes cut to 300 characters. Go back to the documents for the full wording.
   - **Either way:** the RFP's entry in `reports/new-rfp-qualification/<run date>.json` (`latest.json` for this week), which has the plain-language blockers and `questionsDue`.

   Useful parts of the judgment:
   - `questions`: the questions deadline the scorer cited (`due`, `time`, `evidence`). The scorer can miss one, so check the documents too;
   - `buyer`: what they use today, what they want, and how the evaluation favours us;
   - open gates and blockers: each is a candidate question when only the agency can resolve it;
   - `conditional`: the "Ask the Agency" question and its `qaDueDate`, when the RFP is product-framed;
   - the evaluation criteria and weights the scorer cited.
3. **The Engineering Scope Brief**, if one was written: its "Ambiguities Requiring Clarification" section.
4. **Anything the person adds in chat**: an addendum, a question from Peter or Marianne, a gap noticed while drafting.

**Never invent** a deadline, contact, page number, or requirement. If the documents aren't downloaded, say so and work from the listing only with that stated plainly.

## Stating the Q&A deadline

Lead the reply with one line, taken from the documents, never from memory:

- **Posted:** `Questions due: <day, date, time and time zone as written> (<n> days left)`, with the § and page it comes from.
- **Passed:** `Questions were due <date>; the window has closed.` Then stop, per "When to use it".
- **None posted:** `The documents give no questions deadline.` Add the proposal due date, so the person can judge how early to send.
- **Not readable:** `Couldn't confirm a questions deadline: <reason, e.g. documents not downloaded>.`

Also give **how questions must be submitted** when the RFP says (email to a named contact, a portal Q&A form, a required form or subject line), and the contact's name and address as written in the RFP. If submission is portal-only, say so: the email text below becomes the list to paste into the portal.

## Generating the questions

Aim for **5–7 questions**. Fewer than 4 looks lazy; more than 8 gets ignored. If the RFP really needs more, group them under headers (rule 5).

**Prioritise questions that shape the proposal:** who built the current thing, what's in or out of scope, what "ideal" looks like. Skip trivia. Cover these four categories where the RFP leaves real doubt:

| Category | Typical question |
|---|---|
| **Incumbent and history** | Who supports the current system, and is it being replaced or extended? |
| **Technical specifics** | Named platforms, must-integrate systems, hosting and data-migration volume |
| **Scope** | What the agency provides versus what the vendor produces; options and phases |
| **Success criteria** | What would the agency build without constraints? (This reveals priorities the RFP doesn't state.) |

Also:
- **AI-forward RFPs** (AI, AEO/GEO, chatbots, ML, agentic work) get at least one AI-specific question.
- **Every open gate or blocker the agency could resolve** gets a question: an unclear reference requirement, a product-versus-custom framing, an unstated budget. A blocker only Seamgen can fix (a certification we lack) is not a question for the agency.
- **Every "RFP is silent — to be confirmed in Q&A"** line from the scorer's `buyer` field gets a matching question.
- **Merge the Engineering Brief's ambiguities by topic, not wording.** Where it overlaps a question above, use the brief's version (it is sourced) and drop its internal "Why it matters for engineering" note. Keep every distinct engineering ambiguity: each one affects timeline or price.
- Then apply the **Rules for questions in this email** below, especially rule 8: cut any question that mainly exposes a weakness.

## What ISA replies with

Three parts, in this order:

1. **The Q&A deadline line**, the submission method, and the contact, as above.
2. **Sources (internal, don't send):** one line per question: its number, then the verbatim RFP quote with § and page, or `RFP is silent; nearest context §X` for a question about something the RFP omits. Where it resolves a blocker or open question, say which one in plain words, never as a gate number. This is how the person checks the questions before sending. Don't give file paths here either: name the document and page.
3. **Email to copy:** the template below, filled in, in a code block so it copies cleanly.

Keep anything internal out of part 3: no sources, gate names, scores, HigherGov or Drive links, or "found via" line (rule 7).

## The pattern (from Katie, June 22, 2026 — Rancho Palos Verdes)

Katie's agency-facing email has a distinct shape from internal emails:

- **Recipient:** the specific agency contact named in the RFP (Mr. Lucas at Rancho Palos Verdes).
- **Subject line:** references the RFP name and number, so it doesn't get lost in the agency's inbox.
- **Salutation:** formal. "Dear Mr. Lucas," — not "Hello" or "Hi". First-name basis is not appropriate for a first external touch.
- **Opening:** one sentence saying who Seamgen is and which RFP the email is about. RFP contacts often run several procurements at once.
- **Body:** two beats.
  - "I am submitting the following questions for clarification:" followed by a **numbered** list, so the agency can answer by number.
  - Two closing asks: "Please confirm receipt of these questions." and "Do you have an expected date for when the responses will be shared?"
- **Close:** "I look forward to reviewing your responses and using this information to develop a comprehensive proposal that meets [Agency]'s requirements and objectives." Then the sender's signature.

**Why this shape works:** everything makes the agency's job easier. Numbered questions can be answered in order. Confirming receipt catches lost emails. Asking for a response date avoids awkward follow-ups. The closing sentence marks Seamgen as a serious, professional bidder.

The tone matters. Katie writes as if she's already Mr. Lucas's colleague, not begging for a scrap of information. Confidence without arrogance.

## Template

```
Subject: [RFP number/name] — Clarifying Questions from Seamgen

Dear [Mr./Ms./Dr.] [Last name],

I am writing on behalf of Seamgen regarding the RFP for [full RFP name].

I am submitting the following questions for clarification:

1. [Question 1]
2. [Question 2]
3. [Question 3]
4. [Question 4]
5. [Question 5]
   - [Optional sub-question on the same topic]

Please confirm receipt of these questions.

I look forward to reviewing your responses and using this information to
develop a comprehensive proposal that meets [Agency name]'s requirements
and objectives.

Do you have an expected date for when the responses will be shared?

Kind regards,
[Sender's name]
[Title]
Seamgen
[Phone]
[Email]
```

**The signature stays a placeholder.** No single person sends these, so ISA never fills in a name, title, phone, or address. The sender adds their own. If the person asking has told ISA who will send it, ISA may fill it in from what they said, never from memory.

Put the agency contact's name and address **above** the code block (part 1), not inside the email, so nothing is pre-addressed to the buyer.

## Rules for questions in this email

Questions discussed internally can be exploratory. In this external email, every question should be:

1. **Answerable by the agency contact.** Don't ask "what will the political dynamics of this project look like?" Ask concrete, procurement-appropriate things.
2. **Actually needed to shape the proposal.** If you can figure it out from the RFP, don't ask. The agency will note (and dislike) sloppy questions.
3. **Free of assumptions that could offend.** "Is the incumbent being considered?" is fine. "Are you unhappy with the incumbent?" is not.
4. **Numbered, not bulleted.** Numbering lets the agency respond by number and lets other bidders reading the public Q&A file see clearly what was asked.
5. **Grouped logically if there are many.** If you have 10+ questions, group them under headers (Discovery, Technical, Budget, Timeline). If fewer, a flat numbered list is fine.
6. **Light page pointers yes, internal sourcing no.** Where a question points at a specific part of the RFP, a brief pointer is good — it signals we actually read the document (Katie's Q3 did exactly this: "the technical requirements listed starting on page 5"). But do **not** paste the verbatim quotes from the Sources part, or the engineering brief's "why it matters for engineering" notes, into this external email. Those are for the Seamgen team checking the questions — the agency just needs the clear question, optionally with a page pointer.
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
- Final question list: 12 questions, refined from an internal starter list. (This predates the 5–7 guideline. A list this long today would be grouped under headers, per rule 5.)

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

*(The closing above is Katie's, kept as a historical record. Katie's real email was addressed to the contact; the text ISA gives has no `To:` line and ends with the placeholder signature from the template.)*

**What Katie did well here** (and worth preserving in future emails):

- Question 3 references a specific page ("page 5") in the RFP — signals to Mr. Lucas that the RFP was actually read.
- Question 9 uses an indented sub-question to keep related items together.
- Question 11 explicitly says "so I can ensure our proposal meets your expectations" — reframes what could be a rude question ("what's your budget?") as helpful.
- Question 12 asks for the public Q&A file — this is a pro move because it lets Seamgen see what competitors are asking about, revealing where the agency is receiving pushback.

## Notes and edit history

**v1.6 — November 2026.** Reworked for the team after Jake left Seamgen. **(1) Chat only, text to copy.** ISA no longer creates a Gmail draft. It gives the email as text in chat for the sender to paste into their own mail and address themselves. The agency contact goes above the text, never in it. **(2) No single owner or approver**, and no named signer: the signature is a placeholder the sender fills in. Steps that waited on Peter's additions to the pursue email are gone. **(3) The question sources are what ISA actually has.** These are the RFP documents, the scored judgment (`scoring_judgments` and the results-file entry), and the Engineering Scope Brief. The old sources no longer carry questions: the pursue email dropped them in its v1.3, and the meeting brief was retired on October 12, 2026. **(4) The meeting brief's question guidance moved here:** 5–7 questions, four categories, one AI question on AI-forward RFPs, and a cited source for each. Open gates, blockers and "silent" incumbent lines now become questions too. **(5) The reply leads with the Q&A deadline** (or says none is posted, or that it has passed) and the submission method, then the sources, then the email. This also covers portal-only Q&A, a v1.0 known limitation. Rules 1–11 and Katie's worked example are unchanged.

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

**Known limitations of v1.0** (the signature, Cc and portal items were resolved in v1.6):
- Assumes English-language, US-domestic RFPs. Adjust register for international agencies or state agencies with distinct communication norms.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
