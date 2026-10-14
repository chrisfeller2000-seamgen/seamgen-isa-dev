---
name: rfp-document-fetch
purpose: Pull an opportunity's complete set of agency source documents into its RFP folder using the Chrome browser bridge, then re-score the RFP on the full text instead of the metadata summary.
audience: This skill is written to be read by both Claude (who drives the browser and files the documents) and a human teammate (who reads it to understand what was fetched and why something was skipped).
version: 1.9 — October 2026
owner: Jake (Seamgen)
---

# RFP Document Fetch Skill

## What this skill does

HigherGov's API gives Seamgen a **paragraph summary** of each opportunity, not the solicitation itself. Every candidate the intake writes is stamped `scoring_confidence: metadata-only`, and the scoring rubric is explicit that this weakens Gate 2 (custom vs. COTS), Gate 4 (submittable), Gate 5 (deal size) and Category 1 (case-study match — 25 of the 100 points). A metadata-only score is a provisional score.

This skill closes that gap. It uses the Chrome browser bridge to collect **every document the agency published** — the solicitation, exhibits, appendices, addenda, and Q&A — files them in the RFP's `resources/` folder, and hands the full text to the scoring skill for a real score.

It produces three things:

1. **The agency's documents on disk**, in the right folder.
2. **A document manifest** recording what was pulled and how many documents existed at the time.
3. **A full-text score** that replaces the provisional metadata one.

## When to use it

Run it when an opportunity scores **75 or above (Strong Pursue)** on the metadata pass. Below that, don't — the documents aren't worth collecting for an RFP that isn't being pursued.

**For ISA the trigger is 50+, not 75+.** ISA's Friday job fetches through the HigherGov API at a preliminary score of 50 or above (`skills/rfp-preliminary-scoring-skill.md` v1.1). The 75+ rule exists to ration the slow browser-driven fetch described in this skill. The decision bands are unchanged: 75+ is still Strong Pursue.

Also run it whenever an RFP is being pursued but its `resources/` folder is thin or empty (an RFP that arrived by forward, or one fetched before this skill existed).

Do **not** use it to bulk-collect documents across the whole saved search. The API is the channel for volume; this skill touches only opportunities Seamgen is actually pursuing. Bulk-scraping a vendor's site is both unnecessary and a terms-of-use risk.

## Before you start

- **The browser bridge must be live.** It launches its own Chrome profile at `C:\Users\<operator-windows-user>\.cache\chrome-devtools-mcp\chrome-profile` — currently `C:\Users\Jg125\...` — separate from the operator's everyday Chrome, but persistent, so logins survive between sessions. **Resolve this path against the current Windows user, never a name copied from this file**; it read `C:\Users\jolik\...` until 2026-09-22, long after that profile stopped existing.
- **Jake must be signed in to HigherGov** in that browser. If a page redirects to `/signin/`, stop and ask him to sign in; never ask for or handle credentials yourself.
- **Finish in one session.** Document links expire in about an hour (see "Why the links expire" below), so finding and downloading can't be split across days.
- **If you are ISA on the VM**, the browser bridge described here may not be what you have. However the documents are obtained, Steps 7–9 and "Keeping the originals" below apply unchanged.

---

## The procedure

### Step 1 — Find the opportunity

If the RFP came through the intake, its candidate file has everything needed:

```
pipeline/candidates/<slug>/candidate.md
```

Read two fields from its frontmatter:
- **`source_url`** — the HigherGov opportunity page.
- **`solicitation_url`** — the agency's own listing (Step 6).

If there is no candidate file, find it from the saved search — **and check both halves**:

| Half | URL |
|---|---|
| State / Local / Education | `https://www.highergov.com/sl/contract-opportunity/?searchID=Jim1JjnCbVl5BUJilSUBo` |
| Federal | `https://www.highergov.com/contract-opportunity/?searchID=Jim1JjnCbVl5BUJilSUBo` |

**This matters.** The saved search ("RFP Playbook") is registered as a *Federal* search, so the plain link opens the federal half — which is mostly license renewals, network hardware, and defense IT. Seamgen's actual scope lives on the **State | Local** side. Same search ID, different path. Checking only the default half will quietly miss almost everything relevant.

### Step 2 — Open the opportunity page

Navigate to `source_url` in the bridge browser.

### Step 3 — Read the Docs count

Every opportunity page carries **seven section headers**:

**Description · Overview · Contacts · Docs · Assistant · Classifications · Similar**

The **Docs** header shows a count badge (e.g. "Docs 2"). **Write that number down — it is the expected file total**, and Step 7 checks the downloads against it.

### Step 4 — Extract the document links

Pull the links out of the Docs section. Each one points to a HigherGov viewer page, not a file:

```
https://www.highergov.com/sl/document/<document-slug>/
```

**⚠ The documents list is a paginated table — expand it first, or you will silently miss documents.** The Docs section renders as a DataTable (`table#datatable_document_search`) showing only the first 10 rows. The remaining links are simply not in the DOM. Before enumerating, set its page-length control to 100:

```js
const sel = document.querySelector('select[name="datatable_document_search_length"]');
sel.value = '100';
sel.dispatchEvent(new Event('change', { bubbles: true }));
// wait ~3-4s for the table to redraw, then collect the links
```

**Then check your count against the Docs badge from Step 3.** They must match. On the Kansas City EHR opportunity the badge read **Docs 16** while the unexpanded page exposed only **5** links — fetching those 5 and reporting success would have looked complete and been wrong.

**Extract links only. Never take a full-page snapshot** — a HigherGov page snapshot ran to 133,000 characters, which is unusable and buries the links that matter.

### Step 4b — Decide how much of the set to pull now

Document sets vary enormously — one opportunity carried **16 files**, the next carried **1**. A large set is mostly boilerplate: non-collusion affidavits, sustainability forms, insurance certificates, pricing worksheets.

**When fetching in bulk to decide bid/no-bid, pull the scoring documents first:**

- the solicitation itself,
- scope of work,
- functional/technical requirements matrices,
- instructions and conditions (submission rules, evaluation criteria).

Those carry everything the rubric's gates and categories actually read. **Then pull the complete package only for candidates that survive the re-score** — there's no value in downloading a sustainability affidavit for an RFP about to be declined.

**Say what you deferred.** List the not-yet-fetched files in the manifest's `## Not retrieved` with the reason "deferred — boilerplate, pull on survival". Deferring is fine; leaving it invisible is not.

**When fetching for a single RFP that's already being pursued, take everything** (Step 6 onward assumes the full set).

### Step 5 — Download each document

**Use HigherGov's own `downloadDocument` endpoint — it works for every file type and needs no viewer.** Each download button on the page carries the document's `resource_id` as its `id` and its type as its `slot`, and the site's own handler is:

```js
function downloadDocument(resource_id, type) {
  $.post("/download_document/", {resource_id, type, csrfmiddlewaretoken: csrf}, url => downloadUsingAnchorElementAws(url))
}
```

So, in the page context: POST `resource_id` + `slot` + `csrf` to `/download_document/`, receive the signed S3 URL, `fetch` it, and save the blob via an anchor with `download` set. Do the whole thing **inside the page** and return only the filename, byte count and magic bytes — that way the signed address never crosses into a tool result or the transcript.

**The opportunity page exposes every document's `resource_id`**, so a whole set can be pulled without visiting each viewer page — collect them from the Docs table rows (`button[onclick*="downloadDocument"]`, paired with the row's `a[href*="/document/"]` for the filename) after expanding the table per Step 4.

**Read the file from the S3 resource entry, not the Adobe viewer.** PDFs render in an Adobe viewer that fetches from `gemini-dl-docs-sl.s3.amazonaws.com`, but **non-PDFs do not** — `.xlsx` and `.docx` route through the Office web viewer (`view.officeapps.live.com`) instead, so a recipe that scrapes the Adobe frame silently fails on every Office attachment. The `downloadDocument` endpoint above avoids the distinction entirely.

**⚠ Chrome allows only ONE download per page load.** After the first, Chrome's "allow multiple automatic downloads" gate blocks the rest **silently** — no error, no file, and the in-page script still reports success because the `fetch` and the anchor click both succeed. A batch loop looks like it worked and delivers one file. **Reload or re-navigate before each download, and verify each file landed on disk before starting the next.** This is the same class of silent-truncation failure as the paginated Docs table in Step 4.

Chrome saves to the operator's normal Downloads folder (`%USERPROFILE%\Downloads`), not into the repo — **move each file into the RFP's `resources/` folder** as part of the same step, and treat a file that never appeared there as a failed download rather than a completed one.

**Wherever a file first lands, it is not fetched until it is in `resources/`.** That holds for ISA on the VM as much as for the operator's Downloads folder: a document saved to `/tmp`, the home folder or `.scratchpad/` goes into the RFP's `resources/` folder before it is opened or read, and is never left there as the only copy.

Keep the agency's own filename where it's meaningful (`RFP-561_Solicitation.pdf`, `Addendum_2.pdf`). Rename only when the source name is useless (`download.pdf`, `attachment`).

**Why the links expire.** The S3 address is a *signed* link valid for roughly an hour, and its query string contains an `AWSAccessKeyId` and a `Signature`. Two consequences, both non-negotiable:

- **Download in the same session you found it.** A stale link fails.
- **Never write that address anywhere.** Not into the manifest, not into a candidate file, not into a deliverable, not into chat. It carries credentials, exactly like the HigherGov API key that `Assert-NoSecret` already guards. Record the **filename and the document-page slug** instead.

### Step 6 — Record the original source. Chase it only where we already hold an account.

HigherGov is a mirror, not the origin. The **Overview** section has an **"Open"** button linking to the agency's own listing (it matches `solicitation_url` in the candidate file, and opens in a new tab).

**Always capture it.** Specifically:

1. Read the "Open" button's URL.
2. Identify the site by name — DemandStar, BidNet Direct, OpenGov Procurement, MyFloridaMarketPlace, PlanetBids, and so on.
3. Write both into the manifest's `Agency portal:` field (Step 9).

**Then check one thing before deciding whether to open it: the Procurement portal accounts table in `reference-team-and-signature.md`.**

| Portal status in the inventory | What to do now |
|---|---|
| **Account held** (e.g. **DemandStar**, HigherGov) | **Open it and diff it.** Compare the portal's document list against what HigherGov served. Pull anything HigherGov is missing, and record the portal as the source in the manifest table. No account work is required, so none of the reasoning below applies. |
| **No account**, or **unknown** | **Record and move on.** Do not log in, register, or attempt downloads. A locked portal is a **line in the manifest, not an interruption** — record it under `## Not retrieved` and carry on. |

**Why the no-account case stays deferred.** The documents HigherGov lists are enough for the first and second scoring, provided the actual RFP is among them (Step 7). Chasing portal *access* — account requests, registration, credentials — is real work with real turnaround, and spending it on an opportunity that may not survive scoring is backwards. That work belongs to the **building stage**, and it is owned by `skills/rfp-document-refresh-skill.md`.

**Why the account-held case is different.** That reasoning is about turnaround, and where the account already exists there is none — it costs a page load. The original rule was written before Seamgen's portal accounts were written down anywhere; when they finally were (`reference-team-and-signature.md` v1.3, July 2026), it turned out two meeting briefs had been carrying a `[HARD] DemandStar registration` blocker for an account we already held. **Consult the inventory rather than assuming a portal is shut.**

**HigherGov lags, and that is the point of looking.** On SW Wisconsin (2627-09), DemandStar held a Q&A addendum that HigherGov never served — plus five sign-and-return forms and a due date twelve hours off the solicitation's. Where we hold the account, the portal is the authoritative list, regardless of how much of the pipeline that portal represents.

**The link still matters now, even unfollowed.** A portal that's locked today may be open next week, and the meeting brief displays the original posting site by name and link (`skills/rfp-meeting-brief-skill.md` v1.9). Recording the address in the manifest keeps it findable instead of buried in a chat message.

### Step 7 — Confirm the actual RFP is present

**A document set is not automatically a solicitation.** HigherGov sometimes lists only ancillary files — a contract form, an insurance certificate, a wage schedule, an exhibit — with no RFP behind them.

**What counts as the RFP:** the document carrying the **scope of work, submission requirements, and evaluation criteria** — the thing a proposal actually responds to. It may be titled "Solicitation," "RFP," "Request for Proposals," "Scope of Work," or similar.

**What does not count on its own:** standard contract forms, W-9s, insurance certificates, wage determinations, vendor-registration paperwork, exhibits, appendices, or Q&A files. These are supporting material. A folder holding only these has no RFP in it.

#### 7a — Before declaring the RFP absent, check whether what you have is a *portal summary*

**Some agency portals publish a one- or two-page "event summary" instead of the solicitation, and HigherGov serves that summary as the document.** It reads like a cover sheet: title, open/close dates, contacts, a paragraph of description — and then a section listing the real package, typically headed **"Buyer Attachments,"** "Solicitation Documents," "Event Attachments," or similar. Jaggaer / SciQuest (`bids.sciquest.com`) does this; treat any portal as capable of it.

**Those filenames are usually live hyperlinks, and the endpoint behind them is often open.** On Texas State (2026-09-09) the summary's eight Buyer Attachments were links to `bids01.jaggaer.com/apps/Router/PublicEventDownload`, which returned every file — including the actual RFP — with **no login**. The first pass recorded that opportunity as "RFP absent, portal access required" and left a provisional score standing. It was wrong, and the real RFP moved the score.

**So, when the only document is a summary:**

1. **Extract the links from the PDF itself**, not just its visible text — a filename list rendered on the page is frequently an annotation whose URI lives in the file structure. Read the PDF's URI annotations and decompressed streams. If a listed attachment has no link anywhere in the file, *then* it is genuinely portal-only.
2. **Try the links before concluding anything.** Use a GET with a normal browser `User-Agent` and a `Referer` from the portal's own domain.
3. **Do not read a single failure as proof of a wall.** A `403` to a `HEAD` request means the method or the agent was refused, not that you need an account — the same probe as a `GET` with browser headers returned `200`. **This is Rule 11 in miniature: a portal that ignores your request shape looks identical to one that is locked.** Establish which before writing either into a manifest.
4. **Downloading through an open endpoint is permitted** — it is the escalation ladder's first row ("documents openly downloadable → pull them"), and it involves no account, no form, and no terms. A sign-in wall, a bot challenge, a registration form or a paywall still stops and notifies, exactly as before.
5. **Verify each file** (`%PDF-`, `PK` for Office formats) per Step 8, and record the source as the portal endpoint in the manifest's `From` column — never the URL itself if it carries a token.

**Only after 7a comes back empty is the RFP genuinely absent.** Record in the manifest *which* of the two situations you found: `RFP document present: NO — summary only, attachments are portal-gated` reads very differently from `NO — no solicitation published`, and the second is the only one that justifies leaving a metadata-only score alone.

- **If the RFP is present** → continue to Step 8.
- **If the RFP is absent** → **stop before scoring**, and:
  1. Create (or use) `RFPs/1-pre-submission/<rfp-slug>/resources/` as the destination.
  2. File whatever ancillary documents *were* retrieved — they're still useful.
  3. Write the manifest with an explicit `## Not retrieved` entry naming **the solicitation itself** as missing.
  4. **Notify Jake by opportunity name**, giving the HigherGov link, the original posting site and link, and a one-line "drop the RFP here: [path]".
  5. **Leave the score at `metadata-only`.**

**Never produce a full-text score from ancillary documents.** A score built on a contract form and an insurance certificate would carry the confidence of a real read with none of the substance, which is worse than an honest provisional score.

### Step 8 — Verify what you got

Before filing anything, check three things and report them:

1. **Count** — does the number of downloaded files match the Docs badge from Step 3? If not, say which are missing and why.
2. **Integrity** — does every PDF actually begin with `%PDF-`? A 2 KB "file" that's really an HTML error page is a silent failure.
3. **Inventory** — list each filename and its size.

### Step 9 — Write the document manifest

Create `resources/_document-manifest.md` in the RFP folder. **This is required, not optional** — the refresh skill (`skills/rfp-document-refresh-skill.md`) diffs against it to detect new addenda, and without it that skill has no baseline.

```markdown
# Document manifest — [RFP title]

Source (found via): [platform]
HigherGov page: [source_url]
Agency portal: [site name] — [solicitation_url]   (or "none listed")
Portal account: YES / NO / UNKNOWN — [per reference-team-and-signature.md; if NO, who would own setting one up]
Proposer of record: YES / NO / UNKNOWN — [this is what makes addenda arrive by email]
Submission method: [portal / email / physical — and the address or portal name]
Drive folder: [Favorable RFP's subfolder URL]   (or "not yet created")
Last fetched: YYYY-MM-DD
Docs count on HigherGov at fetch: [n]
Docs count on agency portal at fetch: [n, or "not checked — no account"]
RFP document present: YES / NO — [which file is the solicitation]

| File | Size | From | Fetched |
|---|---|---|---|
| RFP-561_Solicitation.pdf | 457 KB | HigherGov (doc slug: `rfp-561-solicitation-pdf-abc123`) | 2026-07-21 |
| Addendum_1.pdf | 88 KB | BidNet (agency portal) | 2026-07-21 |

## Not retrieved
- [Any document that could not be fetched, and the specific reason.]

## Change log
- **2026-07-21** — initial fetch, 2 documents.
```

Never put a signed S3 address in this file.

### Step 10 — Re-score on the full text

Run `skills/rfp-scoring-skill.md` against the actual documents and tag the result **`scoring_confidence: full-text`**.

Expect the score to move. Metadata summaries routinely omit the due time, the contact, set-aside requirements, and the true scope — all of which feed gates and categories. A full-text score is the real one; the metadata score was a filter.

### Step 11 — File it, or kill it

- **Score holds at 50+** → keep the RFP folder and promote it to `RFPs/2-intermediate-stage/<rfp-slug>/` (documents in hand, re-scored on full text — that's exactly what tier 2 means).
- **Full text kills it** → draft the no-bid (`skills/rfp-email-nobid-skill.md`) and **purge the downloaded documents**. This is the standing download-once → cache → purge-after-no-bid policy; dead RFPs don't keep 40 MB of PDFs on disk. This purge is the **only** time an RFP's documents are removed, and it follows a no-bid decision; it is never part of tidying up after a task (see "Keeping the originals").

Either way, tell Jake what the documents changed about the score. "It stayed a Strong Pursue" is a useful result; "the full text revealed a mandatory on-site requirement" is a more useful one.

### Step 12 — Mirror the documents to Google Drive

**Only when Step 11 promoted the RFP to `2-intermediate-stage/`.** A killed RFP gets no Drive folder, the same way it gets no local folder.

**ISA cannot do this step.** `Sync-RfpToDrive.ps1` runs on the operator's Windows machine, and ISA on the VM cannot upload to the shared Drive. When ISA runs this skill it skips the transfer, leaves the manifest's `Drive folder:` line as it found it, and says in its report that a person still has to move the files. It never says a document is in Drive when it is not, and never gives a path on its own disk as a link, because nobody else can open one. When someone asks ISA for a document, it attaches the file from `resources/` in the chat.

Promotion to intermediate stage is what earns an RFP a folder under **`Sales (shared drive) > Favorable RFP's`** (parent ID `1FgeVVURDnS-JyQTyapa7pCl3BN4_PmaW`). This exists so Peter and Marianne can read the solicitation from a link instead of navigating HigherGov, which they've said they don't want to do — and it's the link the pursue email carries (`rfp-email-pursue` v1.6). It's on the **Sales shared drive** so the files belong to the team rather than to one person's account; an abandoned empty folder of the same name sits in Jake's My Drive, so **resolve by ID, not by name**.

1. **Create the subfolder.** Name it the local `<rfp-slug>` verbatim, minus any leading `(NN) ` score prefix — internal scores shouldn't be the first thing leadership reads off a folder name.
2. **Copy in the contents of `resources/` — and nothing else.** The agency's documents only. Scoring PDFs, meeting briefs, engineering briefs and key-dates notes stay local. This is the same separation Rule 10 draws on disk, and the reason the RFP folder has a `resources/` subfolder at all.
3. **Write the `Drive folder:` line** into `resources/_document-manifest.md`, alongside `HigherGov page:` and `Agency portal:` (Step 9).
4. **Report the folder link** to Jake with the score result.

**Transfer the files with `tools/Sync-RfpToDrive.ps1`:**

```powershell
.\tools\Sync-RfpToDrive.ps1 -Slug <rfp-slug>
```

It finds the RFP's folder in whatever tier it currently sits in, copies `resources/` (excluding the manifest), and verifies the counts. `-WhatIf` previews.

**Do not upload through the Drive connector** — it routes file bytes through Claude's context and is not viable at RFP scale (LADBS alone is 43 MB). **Do not use the browser bridge for this either**: it uploads one file per tool call and jams after roughly five, when the native Windows file-picker sticks open and blocks Chrome; a hung `take_screenshot` is the tell, and only Jake can clear it. That path is a last resort for a single small file, not a transfer mechanism.

If the transfer can't run at all, **still create the folder and record its link**, then tell Jake the files need moving. An empty folder with a known link is recoverable; a missing folder silently breaks the pursue email.

**Access is not automatic.** The Drive connector cannot set permissions. Jake shares the parent `Favorable RFP's` folder with Peter and Marianne once, by hand, and subfolders inherit it. If that hasn't happened yet, say so rather than handing over a link that returns "Request access."

### Step 13 — Log the deadlines to the calendar

Now that the RFP is in `2-intermediate-stage/` and its dates are confirmed on the full text, run **`skills/rfp-calendar-logging-skill.md`** to put its action-item deadlines — Q&A due, pre-proposal conference (+ a register-by alert), proposal due — on the "Seamgen RFPs" Google Calendar. That skill authors the `key-dates_<rfp-slug>.md` note as it goes. This is the moment the dates become trustworthy enough to schedule; before promotion the score was metadata-only and its dates weren't.

---

## Keeping the originals

The documents this skill files are the **originals**: the files exactly as the agency published them, or as a teammate sent them. Text extracted from them, HTML renders, saved page copies and logs are **working files**.

- Originals live in the RFP's `resources/` folder. Read them from there, and don't work from a second copy somewhere else.
- Working files go in `.scratchpad/` or `/tmp`, never in `resources/`.
- **Cleaning up after a task removes only working files created in that task. It never trashes or deletes anything inside a `resources/` folder.** Before removing anything, list it and check that no original, and no only copy of anything, is on the list.
- The one exception is the no-bid purge in Step 11, which is a decision about the RFP, not tidying.

**Why this is written down.** On October 7, 2026 ISA downloaded the California Monitoring Program RFQ to `/tmp`, built the meeting brief from it, and trashed its working files afterwards. The RFQ was among them and was the only copy. It was found in Trash three days later, when someone asked where it was saved. An original that only exists in a temp location looks like scratch and gets cleaned up as scratch.

---

## The agency-portal escalation ladder

**When this applies:** only when the agency portal is actually being *worked* — that is, during the **building stage**, via `skills/rfp-document-refresh-skill.md`. It is kept here because both skills share it.

**It does not fire during scoring.** At fetch time the portal is recorded, not opened (Step 6). A portal discovered to be locked while scoring is a line in the manifest's `## Not retrieved`, **not** an interrupt and not an action item for Jake. Raising an account-setup request for an opportunity that hasn't survived scoring yet is work spent in the wrong order.

Once the ladder does apply, classify what you hit and either proceed or stop. **Never work around a barrier.**

| What you find | What to do |
|---|---|
| Documents openly downloadable | Pull them into `resources/`, note the portal in the manifest. Proceed. |
| **Sign-in required** on a portal **the inventory records as held** — check the **Procurement portal accounts** table in `reference-team-and-signature.md`, which is the single source of truth for this and includes **DemandStar** | Not a blocker. Tell Jake which portal needs signing into in the bridge browser. He signs in once, the session persists across sessions, and the fetch resumes. **Do not route this to Tina** — there is no account to set up. |
| **Bot / security challenge** (e.g. Cloudflare "verify you are not a bot") | **Stop. Do not attempt to bypass it** — it is an explicit anti-automation control, and defeating it is not something this system does. Notify Jake to pull those documents manually, or to clear the check himself in the bridge window. |
| **Account registration required** (new vendor account, registration forms, W-9 up front) | Stop and notify. Route to **Tina**, who owns vendor and portal account setup, with **Nick** for financial-responsibility items. Credentials go to Secret Server — never into this folder. |
| **Paywall**, or documents released only on written request | Stop and notify, quoting the portal's stated process verbatim. |

Every stop produces the same message, and it is short:

> **[RFP title] — documents need your action.**
> Portal: [name + link]
> Blocked by: [one line — what the barrier is]
> Needed: [the specific next step, and who owns it]
> Deadline pressure: [the relevant date, if one is near]

**Silence is never an acceptable outcome.** An unfetchable document set gets reported, not skipped. A fetch that quietly returns three of five documents and lets Jake believe he has everything is worse than one that stops and says so.

---

## Guardrails

- **Read-only browsing.** Navigate, read, download. Never submit a form, register an account, accept terms, or click anything that commits Seamgen — without asking Jake first.
- **Downloading on a portal we hold is permitted, including where it lists us publicly.** Jake's decision, 2026-07-27: on portals in the inventory, pull documents freely even though doing so typically adds Seamgen to the agency's planholder list, which competitors can see. Appearing on a list for a bid we are genuinely considering is not a cost worth a round trip. **This does not extend to anything else** — form submission, new-account registration and accepting terms all still stop and ask.
- **Never spend money without a named, per-bid confirmation from Jake.** *Free* downloading is authorised above; **paid** access is not, and the two look identical until a price appears. Some portals charge for a bid package — DemandStar is **$5 once per bid** — and a general "yes to buying documents" authorises **no specific order**. Report what appeared and what it costs, stop, and wait for a yes on that bid. The full procedure lives in `skills/rfp-document-refresh-skill.md` → "The purchase gate."
- **Never persist signed URLs.** They carry AWS credentials.
- **Never handle credentials.** Jake signs in; you don't ask for passwords, and you don't screenshot a login screen.
- **Targeted, not bulk.** Only opportunities actually being pursued.
- **Same-session fetch.** Signed links expire in about an hour.

---

## Output format

Report in chat, before filing:

```
DOCUMENT FETCH — [RFP title]
============================

Source (found via): [platform]
HigherGov page: [url]
Original posting: [site name] — [url]   (recorded, not opened)
Docs count on HigherGov: [n]

RETRIEVED
---------
- [filename] — [size] — [from: HigherGov / agency portal]
- ...

NOT RETRIEVED
-------------
- [filename or description] — [specific reason]

VERIFICATION
------------
File count vs Docs badge: [n of n]
All files valid: YES / NO — [detail]
RFP document present: YES — [filename] / NO — see below

WHAT THE DOCUMENTS CHANGED
--------------------------
- [Dates, contacts, scope, or requirements the metadata didn't have]
- [Anything that moves a gate or a scoring category]

NEEDS YOUR ACTION
-----------------
- [Blocked portals, missing logins, time-critical items — or "none"]
```

Then run the scoring skill and report the full-text score separately.

---

## A note on the API alternative

This skill uses the browser because it needs no new code and it can reach agency portals, which the API cannot. But HigherGov's API can also serve documents — and more cheaply:

- `download_url` returns the PDFs from S3 with **no API key and zero quota cost** (verified byte-exact during the July 2026 probes).
- `text_extract` returns the real full solicitation text (538,829 characters on the tested record).
- `pipeline/state.json` already carries an empty `documentsPending[]` array waiting for it.

What's missing is the PowerShell — `Get-HGDocuments` and `ConvertTo-HGAttachment`, specified as Phase 4 in `future-edits.md`. When Seamgen's volume justifies building it, the API becomes the primary path for HigherGov-hosted documents and this browser recipe stays as the fallback for agency portals and for the roughly 1-in-5 opportunities the API returns nothing usable for. **Building it requires Jake's approval** — it's new code, and this folder is a document library, not an engineering project.

---

## Notes and edit history

**v1.9 — October 12, 2026.** Two things, both from the California Monitoring Program incident.

**(1) This skill is back in ISA's workspace.** ISA's copy of `rfp-document-fetch-skill.md` had held the text of the **refresh** skill since at least the first import of its workspace into the development repo, so ISA had no fetch procedure and nothing telling it where a downloaded RFP belongs. The text below v1.9 is the operator library's v1.8, unchanged.

**(2) Originals are kept, and cleanup can't touch them.** On October 7 ISA downloaded the RFQ to `/tmp`, built the meeting brief, and trashed its working files with the RFQ among them. New section **"Keeping the originals"** separates originals from working files and limits cleanup to working files created in the task; Step 5 now says a file isn't fetched until it is in `resources/`, wherever it first landed; Step 11 names the no-bid purge as the only time documents are removed.

Also added, because ISA runs on a Linux VM and this skill was written for the operator's Windows session: a line in "Before you start" saying the filing rules apply however ISA obtains the documents, and a note in **Step 12** that ISA cannot upload to the shared Drive — it skips the transfer, says so, and attaches the file in chat when someone asks for a document. "When to use it" now states that ISA's trigger is 50+, matching `skills/rfp-preliminary-scoring-skill.md` v1.1 and the Friday job, while the 75+ rule stays for the browser-driven fetch. `skills/rfp-meeting-brief-skill.md` → v2.4 in the same change.

**v1.8 — September 22, 2026, Jessica + Claude.** Corrected two things that broke a live six-RFP fetch, both of them mechanics rather than judgement.

**(1) The bridge profile path pointed at a user who no longer exists.** "Before you start" hard-coded `C:\Users\jolik\.cache\chrome-devtools-mcp\chrome-profile` — Jake's Windows account, gone since the August operator handover. The real profile is `C:\Users\Jg125\...`. The line now says to resolve the path against the *current* Windows user and carries the incident, because the same staleness will recur at the next handover. This is the `tools/README.md` rclone-line problem in a second place: a path written once as a fact, still read as one after it stopped being true.

**(2) Step 5's download recipe only worked for PDFs, and batching it silently lost files.** Three findings from the 2026-09-22 run, all now written into Step 5:

- **Use HigherGov's own `downloadDocument` endpoint.** POST `resource_id` + `slot` + `csrf` to `/download_document/`, fetch the returned signed URL, save the blob from inside the page. It is type-agnostic and never exposes the signed address to a tool result.
- **The Adobe-viewer recipe fails on Office files.** PDFs render through Adobe and fetch from `gemini-dl-docs-sl.s3.amazonaws.com`; `.xlsx` and `.docx` go through `view.officeapps.live.com` instead, so scraping the Adobe frame returns nothing for them. On Aurora that would have quietly dropped `Attachment A - Cost Proposal.xlsx`, which is the cost form.
- **Chrome permits one download per page load.** The second and later downloads in a loop are blocked **silently** — the in-page script still reports success, because the fetch and the anchor click both genuinely succeed. A five-file batch on the MA Trial Court set delivered one file and reported five. Reload before each download and confirm the file reached disk. Same failure shape as the paginated Docs table in Step 4: a result that looks complete and isn't.

Also recorded: the **opportunity page exposes every document's `resource_id`**, so a whole set can be enumerated and pulled without opening each viewer page; and Chrome saves to `%USERPROFILE%\Downloads`, so moving each file into `resources/` is part of the step, and a file that never arrived there is a failed download, not a finished one.

**v1.7 — September 9, 2026, Jessica + Claude.** **Added Step 7a — "before declaring the RFP absent, check whether what you have is a *portal summary*."** Caught by Jessica during the first full-text pass on a nine-RFP batch, and the miss was hers to spot because nothing in the skill covered it.

**What happened.** Two of the nine (Texas State, SJSU) returned exactly one HigherGov document apiece: a Jaggaer/SciQuest **event summary** — a cover sheet of dates, contacts and a description paragraph. Step 7 as written says a summary is not a solicitation, which is true, so both were recorded *"RFP absent — behind the portal"* and left at their provisional metadata scores. But the Texas State summary carried a **Buyer Attachments** section, and those eight filenames were **live hyperlinks** to `bids01.jaggaer.com/apps/Router/PublicEventDownload`. The endpoint is open. All eight came down with no login — including the actual RFP, which re-scored the opportunity **77 → 80** and made it the highest-scoring live item in the batch. SJSU's summary, checked the same way, genuinely has no attachment links, so that one was correctly blocked; the two cases are indistinguishable without the check, which is the whole reason 7a exists.

**The reasoning failure is the part worth keeping.** The first pass asserted "the documents are behind Jaggaer" **without ever trying a link** — a cause named, not verified, then written into a manifest for the next reader to act on. Worse, the first probe was a PowerShell `HEAD` request that returned **403**, which read as confirmation; a `GET` with a browser `User-Agent` returned **200**. That is **Rule 11 in miniature**: a server refusing your request *shape* is indistinguishable from a server refusing your *identity*, and only checking tells you which. 7a therefore says in order: extract links from the PDF structure (not just its rendered text), try them with browser headers, and never let one failure mode stand as proof of a wall.

**Also tightened:** the manifest must now distinguish `RFP document present: NO — summary only, attachments are portal-gated` from `NO — no solicitation published`, because only the second justifies leaving a metadata-only score in place. The escalation ladder is **unchanged** — 7a explicitly routes through its existing first row ("documents openly downloadable → pull them"), and sign-in walls, bot challenges, registration forms and paywalls all still stop and notify.

**v1.6 — July 27, 2026, Jake + Claude.** **Taught this skill that Seamgen already has portal accounts.** It didn't know, and the cost was concrete: on 2026-07-27 two meeting briefs (Suwannee, SW Wisconsin) each carried a `[HARD] DemandStar registration` blocker owned by Tina — **for an account Seamgen already held**. The skill as written would have reproduced that every time, because the escalation ladder's sign-in row hard-coded a list of portals (*"OpenGov, RAMP, CA eProcure, PlanetBids, County of San Diego"*) that **omitted DemandStar**, so a DemandStar sign-in wall fell through to the *"Account registration required"* row and its "stop and route to Tina" instruction.

**Four changes.** (1) The ladder's sign-in row no longer carries its own list — it points at the **Procurement portal accounts** table in `reference-team-and-signature.md` (v1.3), which exists precisely to answer "do we have an account here?", and it says explicitly *do not route this to Tina* when the answer is yes. A hard-coded list in a skill file drifts; a single source doesn't. (2) **Step 6** becomes conditional: still *record, don't chase* where we have no account, but **open and diff the portal where we do** — costing a page load rather than an account request. (3) The **manifest template** gains `Portal account:`, `Proposer of record:`, `Submission method:` and a portal docs-count, so account status reaches Gate 4 and the meeting briefs instead of being re-derived each time; the Suwannee manifest had already improvised this as a parenthetical. (4) A **guardrail** records Jake's decision that downloading on portals we hold is permitted **even though it typically lists Seamgen publicly on the agency's planholder list** — while form submission, new-account registration and accepting terms still stop and ask.

**What deliberately did not change.** The **bot/security-challenge** row and the **account-registration** row are untouched in wording and still stop; both are incident-derived (the Cloudflare challenge on OpenGov via Milpitas, and the Yonkers/BidNet escalation *during scoring*). The stage-gate reasoning is also intact and now stated more precisely: it was always an argument about **turnaround**, and where an account already exists there is none. Adding DemandStar removes a false positive rather than softening a stop.

**Why it mattered immediately.** DemandStar hosts **both** of the live DemandStar-submitted intermediate-stage RFPs and appeared **zero times** in this skill or the refresh skill. *(Volume correction, 2026-07-28: the v1.6 note originally called DemandStar "the highest-volume portal in this pipeline." That was wrong — it is **11 of 512 candidates, 2.1%**, ranking joint 11th behind SAM.gov at 74 and BidNet Direct at 42. The error was generalising from "11 entries" without checking what 11 was a share of. What made the change urgent was never volume; it was that we hold the account and the portal is the addendum channel.)* On the first live check it was holding a **Q&A addendum for SW Wisconsin 2627-09 that HigherGov never served**, dated four days after the RFP's own published schedule said it would post. `skills/rfp-document-refresh-skill.md` → v1.5 in the same session.

**v1.5 — July 24, 2026, Jake + Claude.** Added **Step 13 — Log the deadlines to the calendar**: once an RFP is promoted to `2-intermediate-stage/`, run the new `skills/rfp-calendar-logging-skill.md` (CLAUDE.md v1.28, recipe #15) to put its Q&A/conference/proposal deadlines on the "Seamgen RFPs" Google Calendar. Promotion is the right trigger because it's the point the dates become trustworthy — before it, the score was metadata-only and HigherGov dates are unreliable (`highergov-metadata-scores-overpredict`). No change to the fetch/scoring procedure itself; this just chains the calendar step onto the promotion that Steps 11–12 already perform.

**v1.4 — July 22, 2026, Jake + Claude.** Step 12's transfer mechanism is now **`tools/Sync-RfpToDrive.ps1`** (rclone), replacing "the browser bridge, or Jake drags them in." v1.3 had shipped with a transfer step that didn't really work: the Drive connector is read-only *and* would route file bytes through Claude's context, and the browser bridge uploads one file per tool call before the native Windows file-picker sticks open and blocks Chrome entirely — it managed 5 of 34 documents before jamming. rclone moves the whole set in one command at no context cost, and the script verifies the destination counts rather than trusting an exit code. The browser is now explicitly named as **not** the transfer path, with its failure mode written down so nobody rediscovers it. The rule that survives unchanged: if transfer can't run, **still create the folder and record its link** — an empty folder with a known link is recoverable, a missing one silently breaks the pursue email.

**v1.3 — July 22, 2026, Jake + Claude.** Added **Step 12 — mirror the documents to Google Drive**, and a `Drive folder:` line to the Step 9 manifest template. When Step 11 promotes an RFP into `2-intermediate-stage/`, it now also gets a subfolder under `My Drive > RFP Process Documents > Favorable RFP's` holding **only the agency's documents** — a mirror of `resources/`, never the deliverables at the RFP-folder root. Built because Peter and Marianne asked not to have to navigate HigherGov to read a solicitation; the folder is what the pursue email now links to (`rfp-email-pursue` v1.6), which makes this step load-bearing rather than a nicety — skip it and the pursue email falls back to a link leadership has said they don't want. A killed RFP gets no Drive folder, matching the existing purge-after-no-bid policy. Two constraints documented in the step because they will recur: **file transfer can't go through the connector** (contents route through Claude's context; LADBS alone is 43 MB), so it goes through the browser or Jake — and if neither is available, create the folder anyway and report it, because an empty folder with a known link is recoverable while a missing one silently breaks the pursue email. **Sharing is Jake's**, since the connector cannot set permissions.

**v1.2 — July 21, 2026, Jake + Claude.** Two fixes found while fetching documents for 21 candidates at once. **(1) The documents list is a paginated DataTable, and Step 4 didn't say so.** It renders 10 rows; the rest aren't in the DOM at all. On the Kansas City EHR opportunity the Docs badge read **16** while the page exposed **5** links — the skill would have downloaded 5, matched no check, and reported success. Step 4 now requires expanding `select[name="datatable_document_search_length"]` to 100 before enumerating, and reconciling the count against the badge. This is precisely the silent-truncation failure the skill was written to prevent, and it was in the skill itself. **(2) New Step 4b — how much of a set to pull.** Sets range from 1 to 16+ files and large ones are mostly boilerplate (affidavits, sustainability forms, insurance certificates). When fetching in bulk to decide bid/no-bid, pull the **scoring documents** — solicitation, scope of work, requirements matrices, instructions — and defer the rest until a candidate survives, recording the deferral in the manifest's `## Not retrieved`. Single-RFP fetches for an active pursuit still take everything.

**v1.1 — July 21, 2026, Jake + Claude.** Fixed a **priority error** that the first Yonkers run exposed, plus added a missing check. **(1) The agency-portal step is demoted from "follow it" to "record it."** v1.0 treated retrieving documents from the originating site as a required part of fetch; on Yonkers that hit BidNet Direct's *"Bid Documents — Locked. Registered members only"* and escalated into a same-day account-setup ask **during scoring** — for an opportunity whose HigherGov documents were already enough to score on. Now Step 6 captures the "Open" button's URL and the site's name into the manifest and moves on; a locked portal is a manifest line, not an interrupt. Source-site retrieval moves to the **building stage**, owned by `skills/rfp-document-refresh-skill.md`, and the escalation ladder is relabelled to say so. The link still gets recorded because the meeting brief now displays it (`rfp-meeting-brief-skill.md` v1.9) and because a portal locked today may open later. **(2) New Step 7 — "Confirm the actual RFP is present."** A document set can be all contract forms and exhibits with no solicitation behind it; the skill now defines what counts (scope of work + submission requirements + evaluation criteria), and when it's absent it creates the folder as a destination, files the ancillary documents, names the gap in the manifest, notifies Jake with both links and the drop path, and **leaves the score `metadata-only`** rather than producing a full-text score off supporting paperwork. Steps renumbered 6–11 accordingly; the manifest and output block gained `RFP document present` and a named `Original posting` field.

**v1.0 — July 21, 2026, Jake + Claude.** First version, written the day the Chrome DevTools browser bridge went live and validated end to end (a real 256 KB PDF pulled down and deleted). Codifies the navigation path Jake described — saved search → opportunity title → the seven headers → the Docs section — plus three things found while validating it: (1) the saved search opens on its **Federal** half, and Seamgen's actual scope is on the **State | Local** half of the same search ID; (2) documents sit behind **expiring signed S3 links containing AWS credentials**, so fetch must happen in-session and the address must never be written to disk; (3) the **"Open"** button in Overview leads to the agency's own portal, where addenda and Q&A often actually live — and the first portal tested (OpenGov, via a Milpitas listing) returned a **Cloudflare bot challenge**, which produced the escalation ladder rather than a workaround. Trigger set at **75+ (Strong Pursue only)** by Jake.

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why.

