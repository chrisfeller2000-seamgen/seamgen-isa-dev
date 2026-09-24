---
name: rfp-email-pursue
purpose: Generate the brief "pursue" email sent to Peter, Marianne and Sales when Seamgen is pursuing an RFP. The email names the opportunity (title + source + link to the RFP's Google Drive folder), says what the agency runs today and what they hope to get, why it fits Seamgen, and what could stop us winning. Deadlines and clarifying questions do NOT go in this email; they live in the meeting brief.
audience: This skill is written to be read by both Claude (who drafts the email) and a human teammate (who reads, sanity-checks, and edits the template over time).
version: 1.7 — July 2026
owner: Jake (Seamgen)
depends_on: rfp-scoring skill (this template reads from that skill's output)
---

# Pursue-to-Peter Email Skill

## What this skill does

Turns the output of the RFP Scoring Skill into a **short** email to Peter, Marianne and Sales that does four things:

1. Names the opportunity and where it came from — full RFP title + source + link.
2. **Current solution & hopeful objective** — what they're using now to solve the problem, and what they hope the new build achieves.
3. Says **why it fits Seamgen** — grounded in the closest real project (transferable capability).
4. **Blockers** — what could stop us winning this, so nobody is surprised later.

**Keep it brief — this is still a short email.** Do **NOT** include due dates / Q&A deadlines, and do **NOT** include a clarifying-questions list. Those belong in the **meeting brief** (`rfp-meeting-brief` skill). This email exists to put the opportunity in front of leadership cleanly — it is not the place to run the rest of the workflow.

**Hard length caps, because two sections were added in v1.5 and the email must not sprawl:**

| Section | Cap |
|---|---|
| Current solution & hopeful objective | **2 sentences** — one for today, one for the goal |
| Why it fits us | 1–2 sentences (unchanged) |
| Blockers | **3 bullets maximum**, one line each — or "None identified" |

If a blocker needs a paragraph to explain, it belongs in the meeting brief's Blockers section, not here. Peter is busy; see CLAUDE.md on his communication style.

## When to use it

Use when the RFP Scoring Skill returned a **Strong Pursue** (75+), or a **Worth a look** (50–74) upgraded to pursue after a conversation with Peter.

Do **not** use for no-bids (that's the No-Bid Email Skill) or for the email to the agency itself (that's the Clarifying-Questions Email Skill).

**Prefer full-text scores.** A metadata-only score is provisional and has proven to over-predict badly — on 2026-07-21, nine of twenty-one metadata pursues collapsed to no-bid once the documents were read. Don't put an opportunity in front of Peter on a summary score alone if the documents are gettable.

**Cohesive multi-RFP variant:** when several RFPs are being pursued at once, one email covers them all — a numbered block per opportunity, each with the same four beats. Open with a one-line framing and close once. This is the common case in practice.

## How to use it

Paste the RFP Scoring Skill output and say "draft the pursue email." Claude produces the email using the template below.

## The pattern

- **Recipients:** Peter, Marianne, and the Sales team.
- **Subject line:** Name the RFP with a "pursue"/"opportunity" cue (for a multi-RFP email, name the set).
- **Opening:** a single framing sentence — how many opportunities, from which sweep, and whether they were full-text reviewed.
- **Body — four beats per opportunity:**
  - Beat 1: RFP opportunity name + source ("RFP Opportunity through [source]:") with a link to the RFP's **Google Drive folder** — see "Which link to use" below.
  - Beat 2: **Current solution & hopeful objective.**
  - Beat 3: **Why it fits us.**
  - Beat 4: **Blockers.**
- **Sensitive-industry flag (optional, one line):** if the scoring output raised a sensitive-industry flag but the RFP still scored as a pursue, add a single "Note for Peter/Marianne:" line before the close. The flag isn't a kill — Peter and Marianne decide — so it must reach them visible.
- **Close:** signature per `reference-team-and-signature.md`.

## Which link to use — Google Drive, not HigherGov

**The link in beat 1 points at the RFP's Google Drive folder**, under `Sales (shared drive) > Favorable RFP's`. It is not the HigherGov listing.

This changed in v1.6 because Peter and Marianne said plainly they don't want to open HigherGov and navigate it to read a solicitation. The Drive folder holds the agency's documents already downloaded — they click once and read the RFP.

**What doesn't change:** the `Source (found via)` value still reads HigherGov (or wherever the opportunity was found). Rule 9 records where an opportunity was *found*, which is a different question from where the documents now live. Both facts stay in the email; only the URL moved.

**Finding the link**, in order:

1. The `Drive folder:` line in the RFP's `RFPs/<stage>/<rfp-slug>/resources/_document-manifest.md`.
2. A Drive search under the `Favorable RFP's` parent folder (ID `1FgeVVURDnS-JyQTyapa7pCl3BN4_PmaW`, on the **Sales shared drive**) for the RFP's slug. Note there is an abandoned empty folder of the same name in Jake's My Drive — resolve by ID, not by name.
3. Ask Jake.

**Fallback when there is no Drive folder.** A folder only exists once the RFP reaches `2-intermediate-stage/`. If the pursue email is going out earlier — an RFP still in `1-pre-submission/` on a metadata-only score — use the agency's **own original posting URL**, and the HigherGov listing only if that's unknown too.

**Never invent a URL, and never drop the link.** `not identified` is the honest fallback if all three are unknown, the same rule the meeting brief follows.

**Worth noticing if you hit the fallback:** an RFP good enough to put in front of Peter but with no documents downloaded is usually a sign the document-fetch step was skipped. See the note above on preferring full-text scores.

## Writing beat 2 — Current solution & hopeful objective

**This beat exists because Peter asked for it.** In a July 2026 review he wanted to know plainly *what are these people using right now that needs replacing?* Two halves, one sentence each:

**Current solution** — the incumbent system or vendor, or an explicit "greenfield, nothing exists today." A replacement and a first-ever build are different engagements with different risks, and Peter reads them differently.

**Hopeful objective** — what they want built *and the goal behind it*. Not a feature list — the outcome. "An AI assistant" is a feature; "seniors can find city services without phoning the front desk" is what they're buying.

**Say when you don't know.** RFPs frequently omit the incumbent. If the document is silent, write **"RFP is silent on any incumbent — to be confirmed in Q&A"** rather than implying greenfield. Guessing here misleads the two people deciding whether to spend money on a proposal. This mirrors the meeting brief's *Current Solution & Desired Outcome* section (`rfp-meeting-brief` v2.1), which carries the fuller treatment.

## Writing beat 3 — Why it fits us

Ground the why-fits in the **closest real Seamgen project**, framed as transferable capability — the adjacent-experience principle from `rfp-scoring` Category 1: *"We built [real project], so we can do [the RFP's ask]."* Bridge on the underlying capability (secure portal, GIS/mapping, AI/data, high-traffic app, compliance build), not the exact industry. Cite a **real** project from `resources/proposal-sources/Proposal - Case Studies.txt` — never invent one, and don't overstate a distant analog as a direct match.

Where the evaluation structure favours us (cost weighted low, quality weighted high, no named incumbent), one clause on that is worth including — it's the kind of thing Peter acts on.

## Writing beat 4 — Blockers

**Every reason we might not win, in at most three lines.** This exists because opportunities were reaching Peter as confident pursues with their blocking facts buried in an attachment — Yonkers went to him scoring 88 with its three-public-sector-reference problem visible only in the brief, and was later declined on exactly that.

Draw from the scoring output's gates and Category 7, and from the meeting brief's Blockers section if one exists. Lead with the most severe. Common ones:

- **Public-sector references.** Seamgen holds **one** clean government reference (Florida DEP). An RFP wanting **3+ governmental/public-sector references** is a serious blocker and fails Gate 6a in `rfp-scoring` v1.7 without a named teaming partner. A generic "N recent projects" requirement is *not* a blocker — say so rather than raising a false alarm.
- **Certifications we lack** — SOC 2 Type II, ISO 27001, FedRAMP, HUBZone/8(a)/MBE set-asides.
- **Portal or registration barriers** — e.g. submission only through a portal Seamgen isn't registered on (a Tina item, with lead time).
- **Proposal-effort multipliers** — a security questionnaire required once *per option offered*, per-option cost proposals, mandatory pre-award demos.
- **Structural disadvantages** — explicitly scored local-presence points, an entrenched incumbent, references restricted to a sector or state.

**Be accurate in both directions.** Overstating a blocker kills a winnable pursuit; understating one loses the bid late, after real work. If nothing genuinely stands in the way, write **"None identified"** — say it rather than omitting the section, so Peter knows it was considered.

## Template

```
To: Peter, Marianne, Sales

Subject: [RFP short title / set name] — pursuing

[One-line framing: how many opportunities, which sweep, whether full-text reviewed.]

1. [Short name] — [one-clause hook, e.g. "strongest fit of the three"]

RFP Opportunity through [source]: [Full RFP title + number] — [Drive folder link]

Current solution & hopeful objective: [What they run today, or "RFP is silent on any
incumbent — to be confirmed in Q&A."] [What they want built and the goal behind it.]

Why it fits us: [One or two sentences — closest real Seamgen project(s) as transferable
capability, plus any evaluation-structure advantage.]

Blockers: [Most severe first, max 3, one line each — or "None identified."]

[repeat per opportunity]

[Optional, only if the scoring output raised a sensitive-industry flag:]
Note for Peter/Marianne: this one falls in a sensitive category ([defense / gambling /
tobacco / etc.]) and still scored as a pursue — flagging it for your call before we invest.

[Signature per reference-team-and-signature.md]
```

## Creating the draft in Gmail

Once the email is written, **create it as a draft in Gmail** so Jake doesn't have to retype it. Also print it in chat exactly as before — the chat copy is how he reviews it; the draft is the convenience.

**Claude never sends this email. Only ever a draft.** See the Connectors section of `CLAUDE.md`, which governs and overrides anything here.

| Field | Value |
|---|---|
| **To** | **Jake alone — `joliker@seamgen.com`.** Do **not** put Peter, Marianne or Sales in To, Cc or Bcc, even though the email is written to them. Jake swaps in the real recipients himself; that swap is the last human checkpoint before it goes out. (Gmail rejects a draft with no recipient at all, which is why this is self-addressed rather than empty — see Connectors in `CLAUDE.md`.) |
| **Cc / Bcc** | **Empty.** |
| **Subject** | The template's subject line. |
| **Body** | First line `Intended recipients: Peter, Marianne, Sales`, then a blank line, then the email exactly as written — including the internal signature from `reference-team-and-signature.md` ("Cheers, / Jacob"). |

Report the draft link when it's done. If the Gmail connector turns out to offer no draft capability, **stop and tell Jake** — don't send it, and don't route it anywhere else instead.

## Worked example: Yonkers (v1.6 format)

Rebuilt from the real July 2026 email, with the two new beats. Every fact is from RFP-561 itself.

```
1. Yonkers — "Connect Yonkers Seniors" (strongest fit of the three)

RFP Opportunity through HigherGov: City of Yonkers RFP No. 561 — AI-Driven Mobile and Web
Application "Connect Yonkers Seniors" — [Drive folder: yonkers-connect-seniors-app]

Current solution & hopeful objective: RFP is silent on any incumbent system — to be confirmed
in Q&A. The City wants to design, build, host and support an AI-driven mobile and web app so
residents aged 60+ and their caregivers can find City services, transport and events without
having to know which department to call.

Why it fits us: bridges HealthCare Partners (HIPAA-grade, role-based portal with an AI referral
engine) and InsideOut (multi-audience platform for patients, caregivers and staff) — and the
City's own reference architecture (React Native / React / Node / PostgreSQL / Python-AI / AWS /
OAuth) is exactly our stack. Cost is only 5 of 100 evaluation points, which favours us.

Blockers:
- Requires three governmental/public-sector references (§IV.F); we can credibly field one
  (Florida DEP) — needs a teaming partner or an agency ruling on whether nonprofit/federal counts.
- Submission is only through BidNet / Empire State Purchasing Group, where Seamgen isn't
  registered — Tina lead time.
- Asks for SOC 2 Type II / ISO 27001 evidence "where available"; we hold neither, though the
  wording is permissive.
```

Note what the Blockers section does here: it surfaces, in three lines, the exact issue that later caused Jake to decline this opportunity. Under v1.4 that fact reached Peter only inside the meeting brief.

## What lives in the meeting brief, not here

- **Key dates** — proposal due date and any Q&A / questions deadline (with time + time zone).
- **The starter clarifying-questions list** — sourced to verbatim RFP quotes + §/page.
- **The full Blockers analysis** — severity labels, the requirement quoted, what would clear it, and who owns clearing it. This email carries the headline; the brief carries the argument.

## Notes and edit history

**v1.7 — July 22, 2026, Jake + Claude.** Two corrections from the first live test of the Gmail connector. **(1) The draft is addressed to Jake, not left empty.** v1.6 said to leave To and Cc blank; Gmail refuses — `create_draft` returns *"At least one recipient (To, Cc, or Bcc) must be specified."* Drafts now go to `joliker@seamgen.com` and nobody else, with the real routing still on the body's `Intended recipients:` line. The safety property is unchanged: the only address on the draft is Jake's own, so the worst an accidental send can do is reach him — never Peter, Marianne or Sales. **(2) The signature question is closed.** `reference-team-and-signature.md` is now **v1.2** and carries **"Cheers, / Jacob"** for internal email, taken from Jake's own sent mail rather than inferred from Katie's pattern; the ⚠ open-question note that sat here since v1.5 is removed.

**v1.6 — July 22, 2026, Jake + Claude.** Two changes, both from Jake connecting his Google account. **(1) Beat 1's link is now the RFP's Google Drive folder**, not the HigherGov listing — Peter and Marianne said they don't want to navigate HigherGov to read a solicitation, they want one click to the documents. New "Which link to use" section carries the lookup order (manifest `Drive folder:` line → Drive search under `Favorable RFP's` → ask Jake), the fallback chain for RFPs that don't have a folder yet (original agency posting, then HigherGov), and the standing prohibition on inventing a URL. **`Source (found via)` is deliberately unchanged** — Rule 9 records where an opportunity was *found*, which is a different question from where its documents now live, and both facts belong in the email. **(2) The skill now creates a Gmail draft** in addition to printing the email in chat, with **To and Cc left empty** so Jake adds recipients himself. Claude never sends; the governing rule is in the Connectors section of `CLAUDE.md`. The meeting brief was deliberately left at v2.1 and keeps its HigherGov + Original-posting links — Jake's call, since the brief is his working document and the pursue email is leadership's.

**v1.5 — July 22, 2026, Jake + Claude.** Two changes Jake asked for after reviewing the real pursue email he sent Peter and Marianne. **(1) "Objective" became "Current solution & hopeful objective"** — leadership needs to know what the agency runs *today* that needs replacing, not just what they're asking for, plus the goal behind the build. Mirrors the meeting brief's *Current Solution & Desired Outcome* (v2.1), including the rule that an unstated incumbent is written as "RFP is silent — to be confirmed in Q&A" rather than assumed greenfield. **(2) New "Blockers" beat** — max three one-line entries, most severe first, so what could stop us winning reaches Peter and Marianne in the email itself. Prompted by Yonkers reaching Peter as a confident pursue at 88 with its three-public-sector-reference problem visible only in the brief; Jake later declined it on exactly that. Carries the Gate 6a reference ceiling from `rfp-scoring` v1.7, and the explicit warning not to flag a generic "N recent projects" requirement as a blocker. "Why it fits us" is unchanged. **Also aligned to observed practice:** recipients are now **Peter, Marianne and Sales** (the real email went to Peter and Marianne — this also resolves the v1.0 known limitation), the opening is a framing sentence rather than "Hello Peter," and the multi-RFP numbered-block form is documented as the common case. Added hard length caps so the two new beats don't turn a deliberately short email into a long one, and a note preferring full-text scores over metadata-only ones.

*(The v1.5 open question on the signature was resolved in v1.7 — see above.)*

**v1.4 — July 2026, Jake + Claude.** Added an **optional one-line "Note for Peter/Marianne"** for a **sensitive-industry flag**: when the scoring output flags a sensitive category (defense/weapons, gambling, tobacco, etc.) on an RFP that still scored a pursue, the email surfaces it in one line before the close so a flagged-yet-pursued RFP never reaches Peter with the flag dropped.

**v1.3 — July 2026, Jake + Claude.** **Made the pursue email brief.** Per Jake (Peter's preference): pursue emails should cover only the objective, why-it-fits, and the title + link. Removed the **key-dates lines** and the entire **starter clarifying-questions list + "Question sourcing" appendix**; both moved to the **meeting brief**. Rewrote the template to three beats and replaced the worked example with the brief version.

**v1.2 — July 2026, Jake + Claude.** Added "Framing 'why this is worth pursuing'": ground any why-pursue hook in the closest *real* project as transferable capability (adjacent-experience principle, rfp-scoring Category 1); never invent.

**v1.1 — July 2026, Jake + Claude.** Added the "Question sourcing" appendix and the convergence note. *(Superseded in v1.3.)*

**v1.0 — July 2026, Jake + Claude.** First draft. Template derived from Katie's USU pursue email of June 9, 2026, sent to Peter and Sales.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note at the bottom describing what changed and why.
