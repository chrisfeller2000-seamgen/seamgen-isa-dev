---
name: rfp-email-submission
purpose: Draft the external transmittal email that accompanies a submitted proposal — naming the RFP, stating how the proposal is organised against the RFP's own required structure, requesting confirmation of receipt, and offering availability during evaluation.
audience: This skill is written to be read by both Claude (who drafts the email) and a human teammate (who checks it against the RFP's submission rules before anything is sent).
version: 1.3 — November 2026
owner: Seamgen sales team (no single owner or approver)
depends_on: rfp-submission-checklist skill (submission mechanics)
---

# Proposal Submission Email Skill

## What this skill does

Drafts the short, formal email that goes to the agency's contact **when Seamgen submits a proposal**. Five beats:

1. **Delivery statement** — names the RFP and states that the proposal is organised **per the RFP's own required section structure**.
2. **Optional value-add note** — anything Seamgen included beyond what was asked for.
3. **Request confirmation of receipt.**
4. **Offer availability during evaluation.**
5. **Thanks + a forward-looking close.**

This is an **external** email to a government contact. It uses the formal register (CLAUDE.md: *"Dear Mr./Ms./Dr. [Last name]"*) and the **external** signature block — full name and title — not the internal first-name form.

---

## ⚠ Before drafting: confirm the proposal may be emailed at all

**This is the one check that matters more than the wording, and it is easy to get wrong.**

Many solicitations forbid email submission outright. Two live examples from Seamgen's own pipeline:

- **Yonkers RFP-561:** *"proposals will NOT be accepted via email"* — submission is through BidNet / Empire State Purchasing Group only, and late or misdelivered means rejected.
- **GSP Airport RFP-2026-0004 (§2.3):** submission is **Beacon Bid only**; email, mail, fax and hand delivery are all rejected.

So establish which of three situations applies **before writing a word**:

| Situation | What this email is |
|---|---|
| **Email IS the submission method** (the RFP names an address to send proposals to) | The delivery itself. The attachments are the proposal. This is the Rancho Palos Verdes case. |
| **Portal submission required, email permitted as courtesy** | A transmittal note *after* the portal upload succeeds. Never say "please find attached" — the proposal was not attached, it was uploaded. |
| **Portal required, email discouraged or silent** | **Do not send it.** Confirm the portal receipt instead. Tell the requester rather than sending anything that could look like an alternate submission. |

**Read the RFP's submission section, or the RFP's `submission-checklist` deliverable, and say in your output which situation applies and where the rule came from (§/page).** If you cannot establish it, stop and ask — do not guess.

**Never let this email be the thing that makes a compliant proposal non-responsive.**

---

## When to use it

At the moment of submission, once the proposal package is final and the binding signatures are in place. Not before.

**Related but different skills:** `rfp-email-agency-questions` (clarifying questions during the Q&A window) and `rfp-submission-checklist` (what must be *in* the package). This skill covers only the covering email.

**Rule 9 exception applies.** Like the agency-questions email, this email **never carries the "Source (found via)" field.** Never tell an agency we found their solicitation on HigherGov or any other sourcing platform — that is internal tracking only.

---

## The pattern

- **To:** the RFP's designated contact, by name. Use the exact contact the RFP names for submissions, which is not always the same person as the Q&A contact.
- **Subject:** RFP number + title + "Proposal Submission" (unless the RFP dictates a subject-line format — some do, and then theirs wins).
- **Salutation:** *"Dear Mr./Ms./Dr. [Last name],"* — formal. If the honorific or gender is not evident from the RFP, use the full name (*"Dear Alex Lucas,"*) rather than guessing.
- **Beat 1 — delivery + structure.** Name the RFP as the agency names it, and state that the response is organised per their required structure, citing the section: *"organized per RFP §VI.3 (sections a through h)."* **This is the most valuable sentence in the email** — it signals compliance with their evaluation structure before anyone opens the file, and evaluators notice.
- **Beat 2 — value-adds (optional).** One sentence, only when Seamgen genuinely included something beyond the ask. See the caution below.
- **Beat 3 — confirm receipt.** *"Kindly confirm receipt at your convenience."* Always include it: it creates a written record that the submission arrived, which matters if a deadline is ever disputed.
- **Beat 4 — availability.** Offer further information during evaluation.
- **Beat 5 — thanks + forward-looking close**, naming the agency.
- **Signature:** the sender's external block — full name + title, left as a placeholder for whoever sends it.

**Keep it to roughly five short paragraphs.** The proposal does the work; this email delivers it politely and proves it is organised the way they asked.

---

## The value-add sentence — useful, but check first

The Rancho Palos Verdes email did this well:

> *"We are really excited about your goals, and have added a few extra items not requested in the RFP — to grow from an activity booking website toward a true activity assistant (including rewards, self-service, and a chatbot)."*

It shows enthusiasm and signals Seamgen thought past the requirement. **But only include it when all three are true:**

1. **Seamgen actually included those items** in the submitted package. Never advertise something that isn't in the file.
2. **The RFP permits additions.** Some solicitations cap page counts or state that unrequested material will not be evaluated — and a few treat extraneous content as non-responsive. Check the submission rules.
3. **The additions don't imply scope Seamgen hasn't priced.** Naming a chatbot the cost sheet doesn't cover invites an awkward conversation at award.

If any of those fails, drop the sentence. The email is fine without it.

---

## Template

```
To: [RFP-designated submission contact]
Subject: [RFP number] — [RFP title] — Proposal Submission

Dear [Mr./Ms./Dr.] [Last name],

Please find attached Seamgen's proposal in response to [the agency's formal RFP name],
organized per RFP [§X.X (sections a through h)].

[Optional — only if all three conditions above are met:]
We are really excited about your goals, and have added a few extra items not requested in
the RFP — [one clause naming them and the outcome they serve].

Kindly confirm receipt at your convenience. Please don't hesitate to reach out if you need
any additional information during evaluation.

Thank you for the opportunity; we look forward to the possibility of partnering with
[the agency].

Kind regards,

[Sender's name]
[Title]
Seamgen
[Phone]
[Email]
```

*The signature stays a placeholder: no single person sends these, so ISA never fills in a name, title, phone, or address. The sender adds their own.*

**If the proposal was uploaded to a portal rather than attached,** replace beat 1's opening with: *"Seamgen's proposal in response to [RFP] was submitted through [portal] on [date/time], organized per RFP [§X.X]."* Do not write "please find attached" when nothing is attached.

---

## Giving the email as text

Once the email is written, **print it in chat as text to copy**, in a code block. The sender pastes it into their own mail, attaches the proposal if email is the submission method, adds the recipient, and signs it.

**ISA never creates a Gmail draft and never sends this email.** It goes to the buyer, and a misordered or misdirected submission email can't be withdrawn.

**The three-situation gate above runs first, and it decides whether ISA gives the email at all:**

| Situation | Give the email? |
|---|---|
| **Email IS the submission method** | Yes. Say in chat that the sender attaches the proposal — ISA does not attach it. |
| **Portal required, email permitted as courtesy** | Yes, but **only after the requester confirms the portal upload succeeded**. A courtesy transmittal written before the upload lands is an invitation to send it in the wrong order. |
| **Portal required, email discouraged or silent** | **No.** Say why, cite the §/page, and stop. Writing the email here manufactures the exact risk the gate exists to prevent — a stray email that makes a compliant proposal look like an alternate submission. |

Above the code block, put one line: `Intended recipient: [agency contact name, title, agency, and address as the RFP gives them]`. Keep the agency address out of the code block, so nothing is pre-addressed to the buyer. Inside the code block, give the subject line and the email exactly as written, ending with the external signature placeholder.

**Rule 9's external exception holds.** No `Source (found via)` line, no HigherGov link, and no Google Drive link — the Drive folder is internal and never reaches an agency.

## Worked example: Rancho Palos Verdes (the real email)

```
Dear Mr. Lucas,

Please find attached Seamgen's proposal in response to the City's Request for Proposals for
the Recreation Management Software Platform, organized per RFP §VI.3 (sections a through h).
We are really excited about your goals, and have added a few extra items not requested in the
RFP - to grow from an activity booking website toward a true activity assistant (including
rewards, self-service, and a chatbot).

Kindly confirm receipt at your convenience. Please don't hesitate to reach out if you need any
additional information during evaluation.

Thank you for the opportunity; we look forward to the possibility of partnering with the City
of Rancho Palos Verdes.

Kind regards,

Jacob Oliker
AI Sales Consultant
```

Note the moves worth copying: the RFP is named as *the City* names it; the organising section is cited explicitly; the value-add is framed as an outcome ("toward a true activity assistant") rather than a feature list; and receipt confirmation is requested without being demanding.

---

## Before sending — final checks

Run these against the RFP's submission section or the RFP's submission checklist:

- **Submission method confirmed** (the three-situation table above) and cited to §/page.
- **Deadline** — including **time and time zone**, and whether the agency's clock or the sender's governs. Late is almost always fatal.
- **Attachment naming and count.** Many RFPs mandate separate marked files (Yonkers required exactly four, each carrying the legal company name). Check size caps too — Yonkers capped at 500 MB.
- **Signatures in place.** The binding signature on the proposal is **Marianne's**, with Peter's final approval (CLAUDE.md v1.2). This email is a transmittal, not the binding document — sending it does not substitute for a signed proposal, and an unsigned proposal is commonly rejected outright.
- **Right contact.** Some RFPs disqualify a bidder for contacting anyone other than the named procurement officer.
- **The sender reads the email before it goes.** This is an external, irreversible send to a government contact.

## After sending

- Note the send time and keep the confirmation reply — that is the receipt record.
- **Promote the RFP folder to `RFPs/4-submitted/<rfp-slug>/`** per CLAUDE.md Rule 10; the whole folder travels with its deliverables and `resources/`.
- Log the outcome when it lands, and capture lessons in `feedback-log.md` (Phase 10).

---

## Notes and edit history

**v1.3 — November 2026.** Jake has left Seamgen, so the skill has no single owner or approver. **No more Gmail drafts:** ISA prints the email in chat as text to copy, with the intended recipient on a line above it, and the external signature is a placeholder instead of "Jacob Oliker / AI Sales Consultant". The draft addressed to `joliker@seamgen.com` and the "stop and tell Jake" fallback are gone; the three-situation gate now decides whether ISA gives the email at all, and the portal-upload confirmation comes from the requester. The Rancho Palos Verdes worked example keeps Jake's real signature as a historical record.

**v1.2 — July 22, 2026, Jake + Claude.** Two corrections from the first live test of the Gmail connector. **(1) The draft is addressed to Jake, not left empty.** v1.1 said to leave To and Cc blank; Gmail refuses — `create_draft` returns *"At least one recipient (To, Cc, or Bcc) must be specified."* Drafts now go to `joliker@seamgen.com` and nobody else, so a transmittal sitting in Gmail carries no agency address at all. The three-situation gate above still runs first and still decides whether a draft is created; self-addressing does not soften it. **(2) The signature question from v1.0 is closed in favour of the real email.** `reference-team-and-signature.md` is now **v1.2** and carries "Kind regards, / Jacob Oliker / AI Sales Consultant" — the block this skill's own worked example had all along. The template no longer uses `[Full name]` / `[Title]` placeholders.

**v1.1 — July 22, 2026, Jake + Claude.** The skill now **creates a Gmail draft** in addition to printing the email in chat. **To and Cc are left empty** — Jake adds the agency contact himself, the last human checkpoint before anything reaches a buyer. **Claude never sends email under any circumstances**; the governing rule lives in the Connectors section of `CLAUDE.md`. **The v1.0 three-situation gate now also decides whether a draft is created at all** — no draft is made for a solicitation that forbids or is silent on email submission, and a courtesy transmittal is only drafted *after* Jake confirms the portal upload succeeded. Drafting first and gating later would manufacture the exact risk the gate exists to prevent. Restated Rule 9's external exception for the draft (no source line, no HigherGov link, **no Google Drive link** — the folder added in `CLAUDE.md` v1.24 is internal), and noted that Claude does not attach the proposal; attachments are Jake's to add. No change to the email's content, structure, or tone.

**v1.0 — July 22, 2026, Jake + Claude.** First version, built from the real Rancho Palos Verdes submission email Jake sent for the Recreation Management Software Platform RFP. Captures the five beats of that email, with the RFP-section citation ("organized per RFP §VI.3, sections a through h") identified as its strongest move. Adds three things the source email didn't need but the skill does: **(1) the submission-method check** — many solicitations forbid email submission entirely (Yonkers: *"proposals will NOT be accepted via email"*; GSP Airport §2.3: Beacon Bid only), so the skill establishes whether email is the delivery, a courtesy transmittal, or not to be sent at all, and forbids "please find attached" when the proposal went to a portal; **(2) conditions on the value-add sentence** — only claim additions that are genuinely in the package, that the RFP permits, and that the cost sheet covers; **(3) pre-send checks** covering deadline with time zone, attachment naming and count, and the reminder that the binding signature is Marianne's with Peter's approval, since a transmittal email is not a substitute for a signed proposal. Rule 9's external-email exception is restated: this email never names the sourcing platform.

**Placement note.** Filed in `skills/` alongside the other three email skills (no-bid, pursue, agency-questions) rather than in `skills/proposal-writing/`. It drafts correspondence rather than constructing proposal content, and keeping the email family together aids discovery. Move it if the proposal-writing grouping matters more.

*(The v1.0 open question on the signature and title was resolved in v1.2 — the real email's block won. See above.)*

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
