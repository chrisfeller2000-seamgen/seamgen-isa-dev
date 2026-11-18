---
name: rfp-document-refresh
purpose: Check the RFPs Seamgen is working on for new documents and deadline changes, save new documents beside the originals, put them in the RFP's Google Drive folder, and tell the team what actually changed — especially if a deadline moved.
audience: This skill is written to be read by both ISA (who runs the check and reads what it finds) and a human teammate (who reads the change report, checks agency portals ISA can't sign in to, and acts on it).
version: 2.0 — November 2026
owner: Seamgen sales team (no single owner or approver)
label: What changed in new documents
command: changes
phase: any
when: What changed in an RFP's new documents or amendments, deadline changes first.
asks: what changed | any changes | new documents | amendment | addendum | addenda | updated documents | did the deadline change | deadline change | new version | changes to the rfp | what is new in the rfp | refresh
---

# RFP Document Refresh Skill

## What this skill does

**Agencies amend RFPs by posting new documents to the same listing, or by moving the deadline.** A deadline extension, a scope change, the answers to every vendor's questions — these don't arrive as an email. They appear as `Addendum_2.pdf` on a page nobody thought to re-open, or as a new due date on the listing.

That makes a saved document set quietly perishable. The `resources/` folder that was complete on Monday can be missing the amendment that moved Friday's deadline. This skill catches that and reports **what changed** — not just that something did.

## How it runs

**Every Tuesday morning, on a schedule.** The system crontab runs `scripts/run-rfp-refresh-cron.sh`, which runs `node scripts/rfp-refresh.mjs --scheduled`. It checks every RFP in **Looking closer** (`RFPs/2-intermediate-stage/`) and **Building** (`RFPs/3-building/`). The tiers record a person's decision (see "RFP stage folders" in `AGENTS.md`), so these are exactly the RFPs someone is working on.

- When something changed, it posts **one message** in the sales group: per RFP, a moved due date, the new or re-issued documents by name, and the link to the RFP's Drive folder.
- **When nothing changed, it sends nothing.** A quiet week is silent.
- If the run fails, it is tried once more 10 minutes later; only if that fails too does the wrapper post one failure notice. A silent week is never a failed one, and a change found before a failure is still announced, once.
- The results are in `reports/rfp-refresh/latest.json` (and `<date>.json`). Answer questions about the Tuesday check from there.

**On request, for one RFP:** `node scripts/rfp-refresh.mjs <slug>`. The same check for one RFP in any tier. New documents go to Drive the same way, and nothing is posted to the group. Tell the person what it printed, in plain words.

**Drive only:** `node scripts/rfp-refresh.mjs <slug> --drive` also uploads any agency document in `resources/` that the Drive folder doesn't have. Use it after saving a file someone sent you, or one a person downloaded from a portal (see "Agency portals" below).

## What the check does

1. **Reads the newest version of the listing on HigherGov.** An amendment arrives as a new version of the same opportunity (same `opp_key`). On November 17, 2026, one saved RFP's November 3 version had moved its due date from November 2 to November 30 with no new file, so **the due date is compared every time**, not only the documents.
2. **Compares HigherGov's document list with what is saved.** HigherGov's document records have no ID, so documents are matched by **file name and size**:
   - **New:** a name not saved before.
   - **Re-issued:** a saved name with a different size.
   - **No longer listed:** saved, but gone from HigherGov. Reported, and kept.
3. **Downloads only new and re-issued files into `resources/`, and never overwrites an original.** A re-issued document is saved as `…-updated-<date>` beside the old one, so both versions stay. The document manifest gets a row for each, so a rescore reads them.
4. **Uploads to the RFP's Drive folder straight away:** agency documents only, never the `_document-manifest` files, and never replacing or deleting anything in Drive. Drive is **one flat folder per RFP** under **Sales (shared drive) › Favorable RFP's**, whatever tier the RFP is in. The folder is the one the Friday run linked to, or one made the same way if the RFP never had one. Its ID is kept in the RFP's `_refresh.json`, so later uploads always go to the same folder.
5. **Keeps a record** in `RFPs/<tier>/<slug>/_refresh.json`: the due date and documents last seen, the Drive folder, and a dated line per change.

A file HigherGov lists but won't hand over (portal-gated) is reported once and tried again each week.

**It never** reads agency portals, reads the documents' contents, deletes anything, or emails anyone. **It refuses** while the Friday job is running. An RFP with no saved HigherGov key (one forwarded by a teammate, say) can't be checked automatically: the Tuesday message lists it under "Couldn't check" when a message goes out anyway.

---

## When someone asks what changed: read the new documents

The script reports **that** something changed. This part says **what**, and it can't be skipped or skimmed — downloading an addendum without reading it just moves the problem onto the sales team's desk.

Read each new or re-issued document from `resources/` with `node scripts/document-text.mjs <file>`, and pull out:

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

**HigherGov's due date and the documents can disagree.** The Tuesday check reads HigherGov's; the addendum is the agency's own word. Where they differ, report both and say the agency should be asked — do not silently pick one. A submission timed to the wrong one is late with no remedy.

### Then update the RFP's records

- **`key-dates_<rfp-slug>.md`** — if a date moved, update it and cite the new source (`Confirmed from [document], [page]`). Keep the superseded date visible with a "was:" note. **Then re-run `skills/rfp/calendar-dates/instructions.md`**, so the person gets the changed event text for their calendar. ISA never writes to a calendar.
- **Downstream deliverables** — if a new mandatory form appeared, say which existing deliverable is now stale (usually the submission checklist, sometimes the proposal deck). Don't silently regenerate them; tell the person who asked what needs rebuilding and let them decide.

---

## Agency portals: a person checks these

**HigherGov is a mirror, and it can lag.** Yonkers' Q&A answers issued as a formal addendum on **BidNet Direct / Empire State Purchasing Group**, and SW Wisconsin's addendum reached **DemandStar** four days after the RFP's own printed schedule said it would, and never reached HigherGov. ISA has no browser on the VM and never signs in, so portals are a person's check.

When an RFP's manifest names an agency portal (its `source_path` or `Agency portal:` line), end your reply with a short checklist for the person: which portal, which RFP, and what to look for — **new documents, the due date the portal shows, and whether a pre-bid conference exists.** **Trust the portal's list over the RFP's printed schedule:** the schedule is a plan, the portal is the record.

When the person sends you a new document from a portal, save it in the RFP's `resources/` folder (as `skills/rfp/document-fetch/instructions.md` says), run `node scripts/rfp-refresh.mjs <slug> --drive` so it reaches Drive, and read it as above.

#### DemandStar, also called OpenBids (account held)

**DemandStar is also called OpenBids**; the site is `demandstar.com`. Seamgen has an account, and its password is in **Secret Server**. A person with Secret Server access signs in; ISA never handles the password. **Do not route a DemandStar sign-in to Tina as an account request** — the account already exists. For a portal where Seamgen has no account, a new vendor account is Tina's to set up; ISA never registers.

DemandStar is a small share of the pipeline (11 of 512 candidates in July 2026), but for several agencies it *is* the addendum channel. SW Wisconsin's RFP said so outright: *"All addenda will be supplied to Proposers of record via the College's e-bidding third party provider, Onvia DemandStar."* What the person checks, from July 2026's runs:

- **Start from the Watch list.** Sign in, go to **Bids**, filter by **Watched Bids**. Every tracked RFP is in one view. The **Bid Status** filter is single-select and defaults to Active, so switch it to find a bid that has closed.
- **Read the Documents table** — filename, type (Addendum / Bid Document / Attachment), **Date Modified** — and compare it with the RFP's `resources/`.
- **Read the Due Date on the bid page** and compare it with `key-dates_<slug>.md`. SW Wisconsin showed `08/10/2026 1:00 AM Central` against the RFP's *"1:00 p.m."*: report both and resolve it with the agency.
- **Bid names often differ from the RFP's title**, so search a distinctive fragment, the agency, or the bid ID (`https://www.demandstar.com/app/suppliers/bids/<bid-id>/details`).
- **Planholders are listed by name** on the signed-in bid page — a competitor list nothing else gives us. Note it when the field is crowded or a known incumbent appears.
- **Put a bid on Watch when its RFP moves to Looking closer.** Watching is free, commits nothing, and shows only as a count. Don't depend on DemandStar's email alerts: they go to the account holder's inbox, not to whoever checks.

##### The purchase gate — what to do when a new document appears

**Monitoring is free; the bytes are not.** Clicking a document name leads to a purchase page: *"You will be charged a nominal fee of $5.00. Once you purchase this Bid Package by using Place Order option there will be no cost for subsequent document downloads associated with this Bid."* So it is **$5 once per bid**, then that bid's documents are free.

1. **Report before doing anything else.** Name the bid, the exact **filename, type, size and Date Modified**, and say what it probably is — *Addendum* is likely material, *Attachment* likely boilerplate. State the $5 covers the whole bid package.
2. **Stop there.** Don't open the order page "so it's ready."
3. **Wait for the requester to confirm that specific purchase, on that specific bid.** A general "yes to buying documents when needed" authorises **no specific order**.
4. **Only after a named per-bid yes** does the person place the order.
5. **Record the spend** in the manifest's change log — date, bid, amount, what it bought, and who authorised it.

**Two standing blocks:**
- **No payment method was on file** in July 2026, so the first purchase needs one added — a person's action, regardless of authorisation.
- **SW Wisconsin (2627-09) is a standing no.** Don't propose buying its package while the **$5M cyber-liability requirement** is unresolved. If that blocker clears, it's a fresh decision.

If a portal blocks the way, apply the **escalation ladder in `skills/rfp/document-fetch/instructions.md`** — sign-in needed, bot challenge, registration required, paywall. **Never work around a barrier.**

---

## Output format (a refresh on request, or "what changed?")

```
DOCUMENT CHECK — [RFP title] — [date]

⚠ DEADLINE CHANGES
- Proposal due [old] → [NEW] — per [HigherGov / document, section/page]
  (or "None")

NEW DOCUMENTS
+ [filename] — [one line: what it is]
~ [filename] — re-issued; saved beside the earlier copy

WHAT CHANGED
- [Scope/requirement/criteria change, with a verbatim quote + §/page]
- [Q&A answer worth knowing, quoted]

DRIVE
[folder link] — [n] file(s) uploaded (or why not)

NEEDS SOMEONE
- [Portal to check, purchase to decide, stale deliverable — or "none"]
```

**Report the no-change case explicitly** when someone asks: "Checked, nothing new since [date]" is a real result. (The Tuesday message is different: a quiet week sends nothing.)

---

## Guardrails

- **Never overwrite or delete a saved document.** Re-issued files sit beside the originals.
- **Never replace or delete anything in Drive.** Uploads add agency documents only.
- **Never spend money without a named, per-bid confirmation from the requester.**
- **Never handle credentials, sign in, register, submit a form, or accept terms.** A person does.
- **Never bypass a bot challenge.**
- **Never persist signed download URLs.**
- **Never paraphrase a date or a requirement.** Quote it, cite it.

---

## Notes and edit history

**v2.0 — November 2026.** Rewritten for ISA on the VM. The check is now `scripts/rfp-refresh.mjs`: every Tuesday for the RFPs in Looking closer and Building (one Telegram message only when something changed), or on request for one RFP. It reads the newest HigherGov version, compares the due date as well as the documents (matched by name and size, since HigherGov's records have no ID), saves re-issued files beside the originals, and uploads new agency documents straight to the RFP's one Drive folder, whose ID it keeps. Gone: the Windows browser bridge, the file-picker workaround, `Sync-RfpToDrive.ps1`, `reference-team-and-signature.md`, and the calendar "sync-block ledger" (removed from the calendar skill in v1.1). DemandStar and other portals are now a person's check, with the same purchase gate; ISA reads what the person sends.

**v1.8 — November 2026.** DemandStar is also called OpenBids (same site, `demandstar.com`). Its account password is in Secret Server, and a person with access signs in; ISA never handles it. Sign-in no longer assumes Marianne.

**v1.7 — November 2026, Seamgen.** Jake has left Seamgen, so this skill has no single owner or approver. Refresh reports, sign-ins, purchase confirmations and rebuild decisions now go to the person who asked for the refresh, or the sales team. The purchase gate is unchanged: still a named yes, per bid, before any order.

**v1.6 — July 28, 2026, Jake + Claude.** Wired DemandStar's free **Watch** feature into the run, and wrote down the **purchase gate**.

**Jake's decision (2026-07-27/28):** use Watch to detect new documents; **never purchase until he has been told exactly what appeared and has explicitly confirmed that specific purchase.** Case by case. Watching is free, commits nothing, and — unlike ordering — puts no name on a public list, since watchers show only as a count while planholders show by name.

Step 4 now **starts from Bids → Watched Bids** rather than visiting bid pages individually: one view, and it sidesteps the direct-URL session drop. Bids go on Watch when their RFP reaches `2-intermediate-stage/`, recorded in the manifest. **A routing caveat that matters:** the account is in **Marianne's** name, so DemandStar's email alerts reach her, not Jake — the watch list read on each run is the mechanism, the email is a bonus, and a run skipped because "we'd have been emailed" is a run that misses the addendum.

The **purchase gate** is a five-step procedure — report the exact filename/type/size/date and what it probably is, **stop**, wait for a named per-bid yes, only then order, then log the spend in the manifest. Two standing blocks recorded: **no payment method is on file** (Jake's or Marianne's action), and **SW Wisconsin is a standing no** while its $5M cyber-liability blocker is open. The guardrail list gains the rule in its own words: *a general "yes to buying documents" authorises no specific order.*

**Also corrected a factual error of mine:** v1.5 said DemandStar "carries the largest share of this pipeline — the majority of `RFP-pipeline/candidates/` solicitation URLs." **Wrong.** It is **11 of 512 (2.1%)**, joint 11th behind SAM.gov (74) and BidNet Direct (42); the claim generalised from "11 entries" without checking the denominator. The reason to check DemandStar was never volume — it is that we hold the account and for several agencies it *is* the addendum channel.

**v1.5 — July 27, 2026, Jake + Claude.** Two changes, both prompted by the same failure.

**(1) Scope widened to `2-intermediate-stage/` as well as `3-building/`.** The v1.0 scope note predicted exactly this — *"an addendum can land on one of those unseen until it is promoted. If that gap ever bites, widening this skill to cover tier 2 is a one-line change"* — and it bit within a month. SW Wisconsin (2627-09) sat in tier 2 while its Q&A addendum posted, and its meeting brief ended up carrying an `[UNKNOWN]` blocker admitting the document set might be superseded. Tier 1 stays out of scope deliberately: metadata-only scores, may never be pursued, and the HigherGov intake already covers that volume.

**(2) A DemandStar procedure in Step 4, because we have an account and this skill didn't know.** DemandStar appeared **zero times** in this skill or the fetch skill, while two meeting briefs simultaneously carried a `[HARD] DemandStar registration` blocker for an account Seamgen already held. Step 4 now consults the **Procurement portal accounts** table in `reference-team-and-signature.md` first, and says explicitly not to route a DemandStar sign-in to Tina.

**Three things the first live run taught, now written into the step.** The portal's document list beat the RFP's own schedule — 2627-09's addendum was published four days after the printed date, so **the portal is the record and the schedule is only a plan**. The portal's **due date can disagree with the solicitation** — DemandStar showed `08/10/2026 1:00 AM Central` against the RFP's *"1:00 p.m."*, and the step now requires reporting both rather than silently picking one, because a submission timed to the wrong value is late with no remedy. And **proposer-of-record status** is worth recording, since that is what makes future addenda arrive by email instead of needing this check at all.

Also carried over: the browser bridge jams after roughly five downloads when the native file-picker sticks, so documents are pulled incrementally. `skills/rfp/document-fetch/instructions.md` → v1.6 in the same session; the escalation ladder still lives there and is referenced, not duplicated.

**v1.4 — July 24, 2026, Jake + Claude.** Step 7's key-dates bullet now **hands off to `skills/rfp/calendar-dates/instructions.md`** — after a moved date is written into `key-dates_<rfp-slug>.md`, re-run the calendar skill so the calendar event moves with it. That skill reconciles against a sync-block ledger kept in the same note, so it updates the existing event rather than duplicating. Added because the new calendar skill (CLAUDE.md v1.28, recipe #15) makes the RFP's deadlines live on Jake's "Seamgen RFPs" calendar — and a due date that moves on disk but not on the calendar is exactly the silent-staleness failure this refresh skill exists to prevent, one layer further out (the same reasoning that added the Drive push in v1.2).

**v1.3 — July 22, 2026, Jake + Claude.** The Drive push in Step 7 now names the actual mechanism — **`tools/Sync-RfpToDrive.ps1`** (rclone) — instead of leaving "push it into the folder" as an instruction with no working method behind it. Because the script copies the whole `resources/` folder and skips files already present, re-running it after a refresh is safe and moves only the new addenda. Matches `rfp-document-fetch` v1.4.

**v1.2 — July 22, 2026, Jake + Claude.** Step 7 now also **pushes newly downloaded documents into the RFP's Google Drive folder**, and Step 8 reports that it did. Added because `rfp-document-fetch` v1.3 started mirroring each intermediate-stage RFP's `resources/` to `My Drive > RFP Process Documents > Favorable RFP's`, and that mirror is what the pursue email links to (`rfp-email-pursue` v1.6) — so it's what Peter and Marianne actually read. Without this step an addendum that moves a due date would land on disk only, leaving leadership reading a superseded set from a link that looks current: the same silent-staleness failure this skill was built to prevent, one layer further out. Also covers the backfill case — an RFP promoted before fetch v1.3 has no `Drive folder:` manifest line, so the refresh creates the folder per fetch Step 12 rather than skipping.

**v1.1 — July 21, 2026, Jake + Claude.** This skill now **owns agency-portal retrieval outright**. `skills/rfp/document-fetch/instructions.md` v1.1 stopped chasing the originating site during scoring — it only records the portal's name and URL — after the first Yonkers run turned a locked BidNet listing into a same-day account request for an opportunity that hadn't finished scoring. Step 4 is rewritten to say plainly that the portal is worked *here*, in the building stage, where the opportunity has already been accepted as worth building and an account request (via **Tina**) is worth its lead time. The escalation ladder still lives in the fetch skill and is referenced, not duplicated.

**v1.0 — July 21, 2026, Jake + Claude.** First version, written alongside `skills/rfp/document-fetch/instructions.md` on the day the Chrome browser bridge went live. Prompted by Jake's observation that **new documents on the listing page are the mechanism by which agencies push back dates, amend scope, and publish Q&A** — so a document set silently perishes and needs re-checking. Diffs against the `_document-manifest.md` the fetch skill writes. Scoped to `RFPs/3-building/` only by Jake's decision; tier 2 is knowingly unwatched (noted as a gap). Uses the fetch skill's escalation ladder for agency portals rather than duplicating it.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.
