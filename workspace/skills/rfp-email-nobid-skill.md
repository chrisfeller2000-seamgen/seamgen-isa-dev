---
name: rfp-email-nobid
purpose: Generate the "no-bid" email sent when an RFP has been evaluated and Seamgen has decided not to pursue it. Two modes — an announcement to Peter, Marianne and the Sales team for RFPs Seamgen sourced itself, or a short reply to whoever forwarded the opportunity.
audience: This skill is written to be read by both Claude (who drafts the email) and a human teammate (who reads, sanity-checks, and edits the template over time).
version: 1.6 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (this template reads from that skill's output)
---

# No-Bid Email Skill

## What this skill does

Turns the output of the RFP Scoring Skill into a short, professional email saying Seamgen is passing on an RFP, with the specific reasons why. Who it goes to depends on how the opportunity arrived — see "First decide which mode this is" below.

## When to use it

Use this skill when the RFP Scoring Skill returned a **No-bid** recommendation. That happens in two ways:

1. Any of the six kill gates failed. (Katie's LA Water & Power example is this — the RFP required Emergency Management certifications no one at Seamgen holds.)
2. All gates passed but the weighted score came out below 50.

Do **not** use this skill for RFPs scored "Worth a look" (50–74). Those need a conversation with Peter, not a no-bid announcement.

## How to use it

Paste the RFP Scoring Skill output and say "draft the no-bid email." Claude will produce the email using the template below.

## First decide which mode this is — announcement or reply

**Before drafting anything, ask who this email is actually to.** The skill defaulted to Peter + Marianne + Sales for every no-bid until July 2026, when Jake cut a draft from ~250 words to 60 and re-addressed it to one person. Getting this wrong doesn't produce a slightly-off email; it produces the wrong *kind* of message.

| | **Mode A — Announcement** (the default) | **Mode B — Reply to whoever forwarded it** |
|---|---|---|
| **When** | Seamgen sourced the RFP itself (HigherGov intake, a platform sweep, preliminary scoring) | A specific person sent it over and is waiting to hear back |
| **To** | Peter, Marianne, Sales | **That person, on that thread. Nobody else.** |
| **Greeting** | "Hello Peter," | Match the relationship — "Hey Marianne," |
| **Source note** | Required — leadership needs to see where it came from | **Omit.** They sent it; telling them where it came from is padding |
| **Scope** | The RFP that was scored | **Only what they asked about** |
| **Verdict line** | "I don't think this is a good fit for Seamgen because…" | Softer, conversational: "It doesn't seem like either of those would be the best fit for us." |

**The rule behind Mode B: don't widen the audience.** If Marianne forwards two opportunities without Peter on the thread, the reply goes to Marianne. Adding Peter turns a quick answer between colleagues into a leadership escalation she didn't ask for — and it's the same instinct Rule 8 warns about, only applied to a distribution list. **If it isn't obvious who the reply is for, ask Jake before drafting.**

**Extra opportunities you found while researching are not part of the answer.** If someone asks about two and you reviewed six, answer the two. The rest is a separate message, or at most one closing line — never four more bullets.

**What does not change between modes:** the bullets. One sentence each, naming the opportunity and the single concrete fact that kills it. That part of this skill is working and survived Jake's edit untouched.

## Mode A — the announcement pattern (from Katie, June 2026)

Katie's no-bid emails have a specific shape that works well and should be preserved:

- **Recipients:** Peter, Marianne, and the Sales team. Wider distribution than pursue emails — leadership sees what's being rejected and why. **(Mode B overrides this — reply to the sender alone.)**
- **Subject line:** Short and factual. Names the RFP.
- **Opening:** One sentence. "Hello Peter," or similar.
- **Body:** Two beats (preceded by a one-line **source note** — "This one came in via [platform]" — so leadership always sees where the opportunity originated).
  - Beat 1: "I have attached the RFP" (or equivalent — makes clear the RFP was reviewed).
  - Beat 2: "I don't think this is a good fit for Seamgen because [specific reason]" followed by a bulleted list of the disqualifying details.
- **Close:** "Cheers," + first name (**Jacob**) — the internal block from `reference-team-and-signature.md` v1.2.

That's it. No hedging, no extended justification. The bullets do the work.

**Why this shape works:** It respects Peter's and Marianne's time. They can see in ten seconds what was rejected and why. If they disagree, they know exactly which line to push back on.

## Template

```
To: Peter, Marianne, Sales

Subject: [RFP short title] — Not a fit

Hello Peter,

This one came in via [sourcing platform — e.g., HigherGov].

I have attached the RFP which consists of [n] files.

I don't think that this is a good fit for Seamgen because [one-sentence
summary of the primary disqualifying reason].

[If a kill gate failed, list the specific failed criteria here as bullets.
If the weighted score was low, list the two or three lowest-scoring
categories as bullets — see mapping table below.]

[If the sensitive-industry flag was raised, add:]
Additional note: This RFP is in the [defense / tobacco / gambling / etc.]
category. Flagging in case you or Marianne would like to weigh in
before I close it out.

Cheers,
Jacob
```

*Internal signature (first name only) from `reference-team-and-signature.md` v1.2 — Jake goes by Jake but signs "Jacob."*

## Creating the draft in Gmail

Once the email is written, **create it as a draft in Gmail** so Jake doesn't have to retype it. Also print it in chat exactly as before — the chat copy is how he reviews it; the draft is the convenience.

**Claude never sends this email. Only ever a draft.** See the Connectors section of `CLAUDE.md`, which governs and overrides anything here.

| Field | Value |
|---|---|
| **To** | **Jake alone — `joliker@seamgen.com`.** Do **not** put the real recipients in To, Cc or Bcc, even though the email is written to them. Jake swaps them in himself; that swap is the last human checkpoint before it goes out. (Gmail rejects a draft with no recipient at all, which is why this is self-addressed rather than empty — see Connectors in `CLAUDE.md`.) |
| **Cc / Bcc** | **Empty.** |
| **Subject** | The template's subject line. |
| **Body** | First line `Intended recipients: ...` — **Mode A:** `Peter, Marianne, Sales`. **Mode B:** the one person who forwarded it, and no one else. Then a blank line, then the email exactly as written — including the internal signature from `reference-team-and-signature.md` ("Cheers, / Jacob"). |

Report the draft link when it's done. If the Gmail connector turns out to offer no draft capability, **stop and tell Jake** — don't send it, and don't route it anywhere else instead.

## Mapping from scoring output to bullet content

The bullets should describe the *actual* failure in plain language. Use this mapping:

| Failed gate or low-scoring category | Bullet format |
|---|---|
| **Gate 1 (Timeline)** | "Timeline: due date is only [n] days away, and Seamgen needs a minimum of 10 days for the proposal process." |
| **Gate 2 (Custom build)** | "Scope: RFP is asking for [COTS product / license reseller / installation only], not the custom build work Seamgen does." |
| **Gate 3 (Not physical goods)** | "Scope: RFP requires [physical hardware / construction / equipment procurement], outside Seamgen's services." |
| **Gate 4 (Submittable)** | "Submission: [portal registration would take X days / format is not achievable in time]." |
| **Gate 5 (Deal size)** | "Deal size: estimated project size is under Seamgen's $100K minimum threshold." |
| **Gate 6 (Qualifications)** | List the specific minimum requirements as bullets. This is the Katie LA Water & Power pattern — the minimums the agency stated appear verbatim as bullets. |
| **Low case-study match** | "Fit: after checking for transferable precedent, no real Seamgen project maps to this scope. Closest real analog is [case study name], but the alignment is genuinely distant." |
| **Low agency type fit** | "Agency: [agency type] is outside Seamgen's target ICP anchors (State & Local, Education, Utilities, Public Healthcare)." |
| **Low tech stack alignment** | "Technical stack: RFP requires [technology], which is not in Seamgen's demonstrated stack." |
| **Low competitive position** | "Positioning: [strong incumbent / RFP language suggests wired for a specific vendor / Q&A window has already closed]." |

Rules for bullets:
- Never more than four bullets. If there are more than four failure reasons, pick the four most decisive.
- Never include the numeric score. Peter and Marianne don't need the rubric mechanics — they need the reasons.
- Each bullet should be one sentence, not a paragraph.
- **Before using "Low case-study match," apply the adjacent-experience principle** (rfp-scoring Category 1): only cite it when *no real* Seamgen project transfers to the ask. Never no-bid for lack of an exact-domain match when a genuine analog exists — that's a pursue with a transferable-experience angle, not a pass.

## Worked example: LA Water & Power (Katie's real email, June 4, 2026)

**Scoring output (reconstructed):**
- Gate 6 (Qualifications) FAILED — RFP required Emergency Management credentials no one at Seamgen holds.
- Recommendation: No-bid.

**Generated email:**

```
To: Peter, Marianne, Sales

Subject: LA Water & Power Emergency Management RFP — Not a fit

Hello Peter,

This one came in via HigherGov.

I have attached the RFP which consists of 3 files.

I don't think that this is a good fit for Seamgen because the City of LA
Water and Power is looking for individuals/businesses specializing in
Emergency Management. Minimum requirements are as follows:

- Education: A Bachelor's degree in Emergency Management, Public Safety,
  Homeland Security, or Public Administration.
- Certifications: One or more certifications such as Certified Emergency
  Manager (CEM), Associate Emergency Manager (AEM), or Master Exercise
  Practitioner Program (MEPP).
- Training: An Emergency Management Train the Trainer Certificate.

Kind Regards,
[Your name]
```

That's Katie's real email almost verbatim. The template preserves what worked. **One deliberate exception: the closing.** Katie signed "Kind Regards," and this example keeps her wording as a historical record — but Jake's own emails close **"Cheers, / Jacob,"** and that's what a generated email uses (`reference-team-and-signature.md` v1.2). Copy the structure here, not the sign-off.

## Second worked example: hypothetical low-score no-bid

**Scoring output (invented for illustration):**
- All gates PASSED.
- Weighted score: 38/100.
- Lowest categories: Case Study Match (4/25), Agency Type Fit (3/15), Tech Stack Alignment (5/15).
- RFP: a state Department of Motor Vehicles wants a Ruby on Rails rewrite of a legacy fleet-management system.

**Generated email:**

```
To: Peter, Marianne, Sales

Subject: [State] DMV Fleet Management System Rewrite — Not a fit

Hello Peter,

This one came in via HigherGov.

I have attached the RFP which consists of 2 files.

I don't think that this is a good fit for Seamgen because the scope
falls outside our demonstrated capabilities across several dimensions:

- Fit: RFP scope does not map to Seamgen's demonstrated case studies.
  Closest match is Lytx fleet monitoring, but the domain (state DMV
  fleet management) is distant.
- Agency: State DMV is outside Seamgen's four ICP anchors (State & Local
  Government, Education, Utilities, Public Healthcare).
- Technical stack: RFP requires Ruby on Rails, which is not in Seamgen's
  demonstrated stack.

Cheers,
Jacob
```

## Mode B worked example: the USAC / CDPH reply (Jake's real email, July 22, 2026)

Marianne sent Jake two HigherGov agency pages, without Peter on the thread, having noticed two opportunities were still open. Claude's first draft was ~250 words to Peter + Marianne + Sales, covering all six live opportunities it found across both agencies. **This is what Jake actually sent:**

```
To: Marianne

Hey Marianne,

It doesn't seem like either of those two opportunities would be the best fit for us.

- AI-Based Coding Assistant (USAC, due Aug 7): they are buying an existing AI coding
  product, not the custom build work Seamgen does, and the question window closed on
  July 20.
- California Tobacco Prevention Clearinghouse (CDPH, due Jul 23): restricted to "one
  qualified public or private nonprofit agency," so we are not eligible to bid at all.

Cheers,
Jacob
```

**Study the cuts, because they are the lesson:**

- **Peter came off the email.** He wasn't on the thread. One forwarded question between colleagues does not need the CEO.
- **Four bullets became two.** Claude had reviewed six live opportunities; Marianne asked about two. The other four were not wrong — they were not the answer.
- **The source note went.** "These came in via Marianne, from two HigherGov agency pages" — told to the person who sent them.
- **Two paragraphs of context went** — a count of everything reviewed, an assessment of two larger CDPH projects, and a closing recommendation about watching CDPH's pipeline. All defensible; none of it asked for. If it matters, it's a separate message.
- **The two surviving bullets are verbatim.** Not one word changed. Each names the opportunity, agency and due date, then the single fact that ends it — quoted eligibility language in one case, a closed question window in the other.

The finished email is 60 words. Aim there.

## Notes and edit history

**v1.6 — July 22, 2026, Jake + Claude.** Added **Mode A / Mode B** — the skill now decides *who the email is to* before drafting, instead of always addressing Peter + Marianne + Sales. Prompted by Jake cutting a draft from ~250 words to 60 and re-addressing it to one person: Marianne had forwarded two opportunities on a thread Peter wasn't on, so the reply went to Marianne alone. **Mode B** (reply to whoever forwarded it) drops the source note, matches the sender's greeting, softens the verdict line, and — the rule that actually got broken — **answers only what was asked**, since Claude had researched six live opportunities and put all six in a reply to a question about two. The governing principle is *don't widen the audience*: adding Peter turns a colleague's quick question into a leadership escalation. Mode A is unchanged and remains the default for RFPs Seamgen sourced itself. Also added Jake's sent email as the Mode B worked example, with the cuts annotated. **Explicitly unchanged: the bullets** — they survived the edit verbatim and the skill now says so, so a future version doesn't "improve" the one part that works. Logged in `feedback-log.md` (2026-07-22). The **pursue** skill was deliberately left alone: a pursue email exists to get Peter's Pursue/Partner/Pass decision, so it belongs with Peter regardless of who forwarded the lead.

**v1.5 — July 22, 2026, Jake + Claude.** Two corrections from the first live test of the Gmail connector. **(1) The draft is addressed to Jake, not left empty.** v1.4 said to leave To and Cc blank; Gmail refuses — `create_draft` returns *"At least one recipient (To, Cc, or Bcc) must be specified."* Drafts now go to `joliker@seamgen.com` and nobody else, with the real routing still on the body's `Intended recipients:` line, so the only address on a draft is Jake's own. **(2) The signature is corrected to "Cheers, / Jacob"** (`reference-team-and-signature.md` v1.2), taken from Jake's own sent mail — the old "Kind Regards, / Jake" was reconstructed from Katie's pattern and wrong on both counts. Katie's worked example keeps her original closing as a historical record, with a note not to copy it.

**v1.4 — July 22, 2026, Jake + Claude.** The skill now **creates a Gmail draft** in addition to printing the email in chat, so Jake doesn't retype it. **To and Cc are left empty** — he adds Peter, Marianne and Sales himself, which is deliberately the last human checkpoint before anything leaves. **Claude never sends email under any circumstances**; the governing rule lives in the Connectors section of `CLAUDE.md` and overrides anything in this file. No change to the email's content, structure, or tone.

**v1.3 — July 2026, Jake + Claude.** Updated the Gate 1 (Timeline) no-bid bullet to say Seamgen needs a **minimum of 10 days** (was 21), matching the `rfp-scoring` v1.4 gate change after HigherGov intake was automated.

**v1.2 — July 2026, Jake + Claude.** Added a one-line **source note** ("This one came in via [platform]") to the top of the email body and both worked examples, so Peter/Marianne/Sales always see where the opportunity originated — matching the new CLAUDE.md global rule.

**v1.1 — July 2026, Jake + Claude.** Added the adjacent-experience guardrail: don't cite "Low case-study match" as a no-bid reason until the closest *real* Seamgen project has been checked as a transferable bridge (per rfp-scoring Category 1). We don't pass for lack of an exact-domain match when a genuine analog exists.

**v1.0 — July 2026, Jake + Claude.** First draft. Template derived from Katie's LA Water & Power no-bid email of June 4, 2026, sent to Peter, Marianne, and Sales.

**Known limitations of v1.0:**
- Assumes Katie's four-part shape (opener, attached files line, "not a fit because" statement, bulleted reasons, close) is universally right. If Peter prefers a different shape for certain agency types, revisit.
- Does not handle the case where an RFP is a no-bid but Seamgen wants to preserve the relationship (e.g., "we can't do this one but we're interested in future work with this agency"). If that case comes up, add a warm-close variant.
- Recipient list is hard-coded as Peter + Marianne + Sales. If distribution rules change, update the template header.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
