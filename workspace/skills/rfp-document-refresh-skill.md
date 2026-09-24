---
name: rfp-document-refresh
purpose: Re-check the listings of RFPs currently being built, catch addenda and Q&A answers posted since the last fetch, file them, and tell Jake what actually changed — especially if a deadline moved.
audience: This skill is written to be read by both Claude (who runs the re-check) and a human teammate (who reads the change report and acts on it).
version: 1.6 — July 2026
owner: Jake (Seamgen)
---

# RFP Document Refresh Skill

## What this skill does

**Agencies amend RFPs by posting new documents to the same listing page.** A deadline extension, a scope change, the answers to every vendor's questions — these don't arrive as an email. They appear as `Addendum_2.pdf` on a page nobody thought to re-open.

That makes a fetched document set quietly perishable. The `resources/` folder that was complete on Monday can be missing the amendment that moved Friday's deadline.

This skill re-checks the listings for RFPs currently being built, downloads whatever is new, reads it, and reports **what changed** — not just that something did.

## When to use it

Run it on demand against everything in **`RFPs/3-building/`** — the RFPs where a proposal is actively being written.

Good moments to run it:
- At the start of a working session on a proposal.
- Before a review meeting with Peter or Marianne.
- Right after a Q&A deadline passes (that's when answers get posted).
- Before submission — the last check that nothing moved.

**Scope note (widened July 27, 2026).** This now watches **`RFPs/2-intermediate-stage/` and `RFPs/3-building/`** — every RFP we are actively working, not only the ones being written.

It used to watch the building tier alone, and the v1.0 note predicted the consequence: *"an addendum can land on one of those unseen until it is promoted. If that gap ever bites, widening this skill to cover tier 2 is a one-line change."* **It bit within a month.** SW Wisconsin (2627-09) sat in tier 2 while its Q&A addendum posted on DemandStar, unseen — and the RFP's own schedule said that addendum was due four days earlier than it actually appeared, so even a diligent reader working from the printed timeline would have missed it. Its meeting brief ended up carrying an `[UNKNOWN]` blocker admitting we might be reading a superseded document set.

Tier 1 (`1-pre-submission/`) stays out of scope. Those carry metadata-only scores and may never be pursued; watching them is volume work the HigherGov intake already covers.

## Before you start

Same prerequisites as `skills/rfp-document-fetch-skill.md`: the browser bridge live, Jake signed in to HigherGov in it, and the whole run completed in one session because document links expire in about an hour.

Each RFP also needs a **`resources/_document-manifest.md`** — the baseline this skill diffs against. If one is missing, run the fetch skill first to establish it; without a manifest there is nothing to compare to, and "is this new?" becomes unanswerable.

---

## The procedure

Repeat for each RFP folder in `RFPs/2-intermediate-stage/` and `RFPs/3-building/`.

### Step 1 — Read the baseline

Open `RFPs/3-building/<rfp-slug>/resources/_document-manifest.md` and note:
- the file list,
- the **Docs count at last fetch**,
- the date of the last fetch.

### Step 2 — Re-open the HigherGov listing

Navigate to the `HigherGov page` recorded in the manifest, and read the current **Docs** count from the section headers.

**A changed count is the fastest signal there is.** Docs 2 → Docs 4 means two new documents, before reading a single file.

But don't rely on the count alone — a replaced document can leave the count unchanged. Compare the actual **file list** against the manifest.

### Step 3 — Diff

Sort what you find into three buckets:

- **New** — on the page, not in the manifest.
- **Changed** — same name, different size (a re-issued exhibit).
- **Unchanged** — ignore, don't re-download.

### Step 4 — Work the agency's portal (this skill owns it)

Follow the **"Open"** button in the Overview section through to the agency's own listing, and diff that as well.

**This is a first-class part of this skill, not an optional extra.** The fetch skill deliberately only *records* the portal's name and URL — chasing access during scoring is work spent in the wrong order, on an opportunity that may not survive. By the building stage that calculus flips: the opportunity has been accepted as worth building, so **getting in is now worth the effort**, including asking **Tina** to set up a vendor account (portal credentials live in Secret Server, never in this folder).

**HigherGov is a mirror and it can lag.** Yonkers' Q&A answers issue as a formal addendum on **BidNet Direct / Empire State Purchasing Group**; an RFP watched only on HigherGov can miss them entirely. The manifest's `Agency portal:` field already names the site and holds the link — that's what the fetch skill recorded it for.

**Check the Procurement portal accounts table in `reference-team-and-signature.md` first.** It is the single source of truth for which portals Seamgen can already reach, and it is what stops this step raising an account request for an account we hold.

#### DemandStar (account held)

**DemandStar is a small share of the pipeline by volume — 11 of 512 candidates, 2.1%** — but it is disproportionately worth checking, because for several agencies it *is* the addendum channel rather than a mirror, and because we hold the account. SW Wisconsin's RFP says so outright: > *"All addenda will be supplied to Proposers of record via the College's e-bidding third party provider, Onvia DemandStar."*

0. **Start from the Watch list, not from individual bids.** Sign in, go to **Bids**, and filter by **Watched Bids**. Every RFP we are tracking appears in one view, which is faster than visiting bid pages one at a time and avoids the direct-URL session drop below. Bids are put on Watch when they reach `2-intermediate-stage/` — see "Watching a bid" below.
1. Open each watched bid **by clicking it from that list**. (The bid ID is in the candidate file's `solicitation_url` if you need to confirm identity: `https://www.demandstar.com/app/suppliers/bids/<bid-id>/details`.)
2. Read the **Documents** table — filename, type (Addendum / Bid Document / Attachment), **Date Modified**, status — and diff it against the manifest.
3. **Trust the portal's list over the RFP's printed schedule.** On 2627-09 the RFP said the Q&A addendum would post July 23; DemandStar shows it dated July 27. The schedule is a plan, the portal is the record.
4. Read the **Due Date** shown on the bid page and compare it against `key-dates_<slug>.md`. **Where the portal and the solicitation disagree, report both and resolve it with the agency — do not silently pick one.** 2627-09 shows `08/10/2026 1:00 AM Central` on DemandStar against *"1:00 p.m."* in the RFP; a submission timed to the wrong one is late with no remedy.
5. Note whether we appear as a **proposer of record** — that status is what makes future addenda arrive by email rather than requiring this check.

Signing in is not a blocker here: the account exists and Jake (or Marianne, whose name it is in) signs in once in the bridge window. **Do not route a DemandStar sign-in to Tina.**

**⚠ Two mechanics learned the hard way on 2026-07-27, both of which will waste a session if ignored.**

- **Sessions expire between visits — check before assuming, and never sign in yourself.** On 2026-07-28 the bridge landed on the login form with empty fields; that is Jake's action, not ours, and it stops the run until he does it. Signed in, the header shows the account holder's name (**Marianne Faro**) — a cheap way to confirm.
  - **⚠ Correction, 2026-07-28.** v1.5 recorded that *"the session does not survive direct URL navigation… treat a typed URL as a session-ender."* **That is too strong.** With a live session, navigating straight to `https://www.demandstar.com/app/suppliers/bids/<id>/details` worked fine and stayed signed in. The original failure was almost certainly an **expired session**, or the older `/app/limited/` path. Clicking through the app is still the safer default, but a direct `/app/suppliers/...` URL is a legitimate fallback when search can't find a bid — which is exactly what recovered SW Wisconsin.
- **Bid names on the portal often differ from the RFP's filename — search accordingly.** SW Wisconsin's document is *"RFP 2627-09 Web Design & Development"*, but the bid is listed as **"Website Design, Development, Hosting Solution, and Content Management."** A bid-name search for "Web Design" returns **nothing**. Search a distinctive fragment, the agency, or fall back to the bid ID from the manifest.
- **The Bid Status filter is single-select and defaults to Active.** A watched bid that has closed disappears from the default view — switch the status to find it. That is how the **USM-MDSG** bid surfaced, sitting at *Under Evaluation*.
- **Documents cost money. Monitoring does not.** Clicking a document name leads to a **purchase page**: *"You will be charged a nominal fee of $5.00. Once you purchase this Bid Package by using Place Order option there will be no cost for subsequent document downloads associated with this Bid."* So it is **$5 once per bid**, then that bid's documents are free forever. **Never click "Place Order."** Report the cost and let Jake decide — his 2026-07-27 decision authorised accepting *planholder visibility*, not **spending money**, and "never click anything that commits Seamgen" governs a paid transaction. Clicking **Cancel** backs out cleanly. *(Seamgen's billing address is on file but no payment method is set, so an order would need one added — another reason this is Jake's or Marianne's action, not ours.)*

**This split is what makes the free tier worth running on every pass.** Without spending anything you can read the **full document list with filenames, file sizes, types and Date Modified**, the **due date as the portal enforces it**, the **planholder names and count**, and whether a **pre-bid conference** exists. That is the entire monitoring job — *has a new addendum appeared, and has the deadline moved* — and it is exactly what was missed on SW Wisconsin. The $5 buys only the bytes.

**Useful side-effect worth capturing while you are in there:** the signed-in bid page lists **planholders by name** — 48 firms on 2627-09. That is a competitor list we have no other source for, and it belongs in the meeting brief's Blockers section when the field is crowded or a known incumbent appears.

##### Watching a bid

**Watching is free, commits nothing, and does not put Seamgen's name on any public list.** Watchers appear only as a count; planholders appear by name. That distinction is why Watch is the default and ordering is not.

**Put a bid on Watch when its RFP reaches `2-intermediate-stage/`.** From the bid page, use the **Watch** control; confirm it by returning to Bids → **Watched Bids** and checking the bid is listed. Record it in the RFP's `resources/_document-manifest.md` (`DemandStar watch: ACTIVE — set YYYY-MM-DD`).

**⚠ Do not depend on DemandStar's email alerts.** The account is in **Marianne Faro's** name, so any notification goes to her inbox, not Jake's. **The watch list read on each refresh run is the mechanism; the email is a bonus.** A run that skips the portal because "we'd have been emailed" is a run that misses the addendum.

##### The purchase gate — what to do when a new document appears

Monitoring is free; the bytes are not. When the diff shows something new, follow this exactly.

1. **Report before doing anything else.** Name the bid, the exact **filename, type, size and Date Modified**, and say what it probably is — a document typed *Addendum* is likely material (scope, dates, Q&A answers), one typed *Attachment* is likely boilerplate. State that the cost is **$5 once for the whole bid package**, not per document, and that it makes every future document on that bid free.
2. **Stop there.** Do **not** open the order page "so it's ready." Do not treat reporting as implied permission.
3. **Wait for Jake to confirm that specific purchase, on that specific bid.** A general "yes to buying documents when needed" is **not** authorisation for any particular order. Neither is his 2026-07-27 decision, which covered planholder visibility and explicitly not spend.
4. **Only after a named per-bid yes**, place the order. Jake's 2026-07-28 decision authorises clicking **Place Order** once he has said yes to that bid.
5. **Record the spend** in the manifest's change log — date, bid, amount, what it bought, and who authorised it. That is the audit trail.

**Two standing blocks:**

- **No payment method is on file.** Seamgen's billing address is stored but no card is set, so the first purchase needs one added — **Jake's or Marianne's action, not ours**, regardless of authorisation.
- **SW Wisconsin (2627-09) is a standing no.** Do not propose buying its package while the **$5M cyber-liability requirement** is unresolved; it is redundant spend on a bid we probably cannot make. If that blocker clears, it becomes a fresh decision, not a resumed one.

If a portal genuinely blocks the way, apply the **escalation ladder in `skills/rfp-document-fetch-skill.md`** — sign-in needed, bot challenge, registration required, paywall. **Never work around a barrier.** Report a blocked portal *immediately* rather than at the end of the run: this is exactly the window where a missed addendum does real damage, and an account request has lead time.

**Pull documents incrementally.** The browser bridge jams after roughly five downloads, when the native Windows file-picker sticks open and blocks Chrome — a hung `take_screenshot` is the tell, and only Jake can clear it. Take the new and changed files first; if the set is large, expect to stop and hand off.

### Step 5 — Download what's new

Into the same `resources/` folder, following the fetch skill's Step 5 (read the real file address from the network request list; never write the signed address to disk).

### Step 6 — Read the new documents and extract what changed

This is the part that matters, and it can't be skipped or skimmed. Downloading an addendum without reading it just moves the problem onto Jake's desk.

For each new document, pull out:

| Look for | Because |
|---|---|
| **Proposal due date** | The single most consequential change. Flag it first, every time. |
| **Questions / Q&A due date** | Often the nearest deadline, and easy to miss. |
| **Scope changes** | Added, removed, or reworded requirements. |
| **New mandatory forms** | Anything sign-and-return feeds the submission checklist. |
| **Q&A answers** | Other vendors' questions reveal how the agency is thinking, and sometimes reshape the requirement. |
| **Evaluation-criteria changes** | Re-weighted scoring changes what the proposal should emphasize. |
| **Cancellation or postponement** | Rare, decisive, and worth catching the same day. |

Quote the document and cite the section or page — the same discipline the engineering brief uses. **Do not paraphrase a date.** If the addendum says "October 3, 2026 at 4:00 PM PST," write that, not "early October."

### Step 7 — Update the RFP's records

- **`key-dates_<rfp-slug>.md`** — if any date moved, update it and cite the new source, matching the existing format (`Confirmed from [document], [page]`). Keep the superseded date visible with a strikethrough or a "was:" note so the change is legible rather than silent. **Then re-run `skills/rfp-calendar-logging-skill.md`** so the moved date updates the calendar event (it reconciles against the sync-block ledger in this same note, so it moves the existing event rather than making a duplicate). A due date that moves on disk but not on the calendar is the same silent-staleness failure this skill exists to prevent, one layer out.
- **`resources/_document-manifest.md`** — add the new files to the table and append a dated line to the change log:
  ```
  - **2026-07-21** — refresh: +Addendum_2.pdf (due date moved Aug 7 → Aug 21), +QA_Responses.pdf. Docs count 2 → 4.
  ```
- **Downstream deliverables** — if a new mandatory form appeared, say which existing deliverable is now stale (usually the submission checklist, sometimes the proposal deck). Don't silently regenerate them; tell Jake what needs rebuilding and let him decide.
- **The RFP's Google Drive folder** — push every newly downloaded document into it with `.\tools\Sync-RfpToDrive.ps1 -Slug <rfp-slug>`, and say in the report that you did. The folder is under `Sales (shared drive) > Favorable RFP's`; its URL is on the manifest's `Drive folder:` line. The script copies the whole `resources/` folder and skips what's already there, so re-running it after a refresh is safe and only moves the new files.

**Why this matters more here than at fetch time.** The Drive folder is what Peter and Marianne read from (it's the link in the pursue email, `rfp-email-pursue` v1.6). If a refresh pulls an addendum that moves the due date and it lands only on disk, leadership is reading a superseded document set from a link that looks current — with no signal that anything changed. That is precisely the silent-staleness failure this skill exists to prevent, reintroduced one layer out.

If the folder has no `Drive folder:` line (an RFP promoted before `rfp-document-fetch` v1.3), create the folder now per that skill's Step 12 and record it.

### Step 8 — Report

Deadline changes first. Always.

---

## Output format

```
DOCUMENT REFRESH — [date]
=========================

Checked: [n] RFPs in 3-building/

⚠ DEADLINE CHANGES
------------------
- [RFP title]: Proposal due [old] → [NEW] — per [document], [section/page]
- [RFP title]: Questions due [old] → [NEW] — per [document], [section/page]
  (or "None")

NEW DOCUMENTS
-------------
[RFP title] — Docs [old count] → [new count]
  + [filename] ([size]) — [one line: what it is]
  + [filename] ([size]) — [one line: what it is]

WHAT CHANGED
------------
[RFP title]
  - [Scope/requirement/criteria change, with a verbatim quote + §/page]
  - [Q&A answer worth knowing, quoted]

NO CHANGE
---------
- [RFP title] — Docs still [n], nothing new since [date]

NEEDS YOUR ACTION
-----------------
- [Blocked portal, stale deliverable, or time-critical item — or "none"]
```

**Report the no-change case explicitly.** "Checked, nothing new" is a real result and it's what makes the report trustworthy. A refresh that only ever speaks up when something changed leaves Jake unable to tell "all clear" from "didn't run."

---

## Guardrails

Identical to the fetch skill, and they carry the same weight:

- **Read-only browsing.** Never submit a form, register, or accept terms without asking.
- **Never spend money without a named, per-bid confirmation from Jake.** A general "yes to buying documents" authorises **no specific order**. Watching is free and is the default; ordering is a separate decision, taken once, per bid, out loud. See "The purchase gate" above.
- **Never persist signed URLs** — they carry AWS credentials.
- **Never handle credentials.** Jake signs in.
- **Never bypass a bot challenge.**
- **Never paraphrase a date or a requirement.** Quote it, cite it.

---

## Notes and edit history

**v1.6 — July 28, 2026, Jake + Claude.** Wired DemandStar's free **Watch** feature into the run, and wrote down the **purchase gate**.

**Jake's decision (2026-07-27/28):** use Watch to detect new documents; **never purchase until he has been told exactly what appeared and has explicitly confirmed that specific purchase.** Case by case. Watching is free, commits nothing, and — unlike ordering — puts no name on a public list, since watchers show only as a count while planholders show by name.

Step 4 now **starts from Bids → Watched Bids** rather than visiting bid pages individually: one view, and it sidesteps the direct-URL session drop. Bids go on Watch when their RFP reaches `2-intermediate-stage/`, recorded in the manifest. **A routing caveat that matters:** the account is in **Marianne's** name, so DemandStar's email alerts reach her, not Jake — the watch list read on each run is the mechanism, the email is a bonus, and a run skipped because "we'd have been emailed" is a run that misses the addendum.

The **purchase gate** is a five-step procedure — report the exact filename/type/size/date and what it probably is, **stop**, wait for a named per-bid yes, only then order, then log the spend in the manifest. Two standing blocks recorded: **no payment method is on file** (Jake's or Marianne's action), and **SW Wisconsin is a standing no** while its $5M cyber-liability blocker is open. The guardrail list gains the rule in its own words: *a general "yes to buying documents" authorises no specific order.*

**Also corrected a factual error of mine:** v1.5 said DemandStar "carries the largest share of this pipeline — the majority of `RFP-pipeline/candidates/` solicitation URLs." **Wrong.** It is **11 of 512 (2.1%)**, joint 11th behind SAM.gov (74) and BidNet Direct (42); the claim generalised from "11 entries" without checking the denominator. The reason to check DemandStar was never volume — it is that we hold the account and for several agencies it *is* the addendum channel.

**v1.5 — July 27, 2026, Jake + Claude.** Two changes, both prompted by the same failure.

**(1) Scope widened to `2-intermediate-stage/` as well as `3-building/`.** The v1.0 scope note predicted exactly this — *"an addendum can land on one of those unseen until it is promoted. If that gap ever bites, widening this skill to cover tier 2 is a one-line change"* — and it bit within a month. SW Wisconsin (2627-09) sat in tier 2 while its Q&A addendum posted, and its meeting brief ended up carrying an `[UNKNOWN]` blocker admitting the document set might be superseded. Tier 1 stays out of scope deliberately: metadata-only scores, may never be pursued, and the HigherGov intake already covers that volume.

**(2) A DemandStar procedure in Step 4, because we have an account and this skill didn't know.** DemandStar appeared **zero times** in this skill or the fetch skill, while two meeting briefs simultaneously carried a `[HARD] DemandStar registration` blocker for an account Seamgen already held. Step 4 now consults the **Procurement portal accounts** table in `reference-team-and-signature.md` first, and says explicitly not to route a DemandStar sign-in to Tina.

**Three things the first live run taught, now written into the step.** The portal's document list beat the RFP's own schedule — 2627-09's addendum was published four days after the printed date, so **the portal is the record and the schedule is only a plan**. The portal's **due date can disagree with the solicitation** — DemandStar showed `08/10/2026 1:00 AM Central` against the RFP's *"1:00 p.m."*, and the step now requires reporting both rather than silently picking one, because a submission timed to the wrong value is late with no remedy. And **proposer-of-record status** is worth recording, since that is what makes future addenda arrive by email instead of needing this check at all.

Also carried over: the browser bridge jams after roughly five downloads when the native file-picker sticks, so documents are pulled incrementally. `skills/rfp-document-fetch-skill.md` → v1.6 in the same session; the escalation ladder still lives there and is referenced, not duplicated.

**v1.4 — July 24, 2026, Jake + Claude.** Step 7's key-dates bullet now **hands off to `skills/rfp-calendar-logging-skill.md`** — after a moved date is written into `key-dates_<rfp-slug>.md`, re-run the calendar skill so the calendar event moves with it. That skill reconciles against a sync-block ledger kept in the same note, so it updates the existing event rather than duplicating. Added because the new calendar skill (CLAUDE.md v1.28, recipe #15) makes the RFP's deadlines live on Jake's "Seamgen RFPs" calendar — and a due date that moves on disk but not on the calendar is exactly the silent-staleness failure this refresh skill exists to prevent, one layer further out (the same reasoning that added the Drive push in v1.2).

**v1.3 — July 22, 2026, Jake + Claude.** The Drive push in Step 7 now names the actual mechanism — **`tools/Sync-RfpToDrive.ps1`** (rclone) — instead of leaving "push it into the folder" as an instruction with no working method behind it. Because the script copies the whole `resources/` folder and skips files already present, re-running it after a refresh is safe and moves only the new addenda. Matches `rfp-document-fetch` v1.4.

**v1.2 — July 22, 2026, Jake + Claude.** Step 7 now also **pushes newly downloaded documents into the RFP's Google Drive folder**, and Step 8 reports that it did. Added because `rfp-document-fetch` v1.3 started mirroring each intermediate-stage RFP's `resources/` to `My Drive > RFP Process Documents > Favorable RFP's`, and that mirror is what the pursue email links to (`rfp-email-pursue` v1.6) — so it's what Peter and Marianne actually read. Without this step an addendum that moves a due date would land on disk only, leaving leadership reading a superseded set from a link that looks current: the same silent-staleness failure this skill was built to prevent, one layer further out. Also covers the backfill case — an RFP promoted before fetch v1.3 has no `Drive folder:` manifest line, so the refresh creates the folder per fetch Step 12 rather than skipping.

**v1.1 — July 21, 2026, Jake + Claude.** This skill now **owns agency-portal retrieval outright**. `skills/rfp-document-fetch-skill.md` v1.1 stopped chasing the originating site during scoring — it only records the portal's name and URL — after the first Yonkers run turned a locked BidNet listing into a same-day account request for an opportunity that hadn't finished scoring. Step 4 is rewritten to say plainly that the portal is worked *here*, in the building stage, where the opportunity has already been accepted as worth building and an account request (via **Tina**) is worth its lead time. The escalation ladder still lives in the fetch skill and is referenced, not duplicated.

**v1.0 — July 21, 2026, Jake + Claude.** First version, written alongside `skills/rfp-document-fetch-skill.md` on the day the Chrome browser bridge went live. Prompted by Jake's observation that **new documents on the listing page are the mechanism by which agencies push back dates, amend scope, and publish Q&A** — so a document set silently perishes and needs re-checking. Diffs against the `_document-manifest.md` the fetch skill writes. Scoped to `RFPs/3-building/` only by Jake's decision; tier 2 is knowingly unwatched (noted as a gap). Uses the fetch skill's escalation ladder for agency portals rather than duplicating it.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
