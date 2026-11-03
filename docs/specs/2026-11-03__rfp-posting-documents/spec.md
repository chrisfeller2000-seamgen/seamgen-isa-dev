# ISA task spec: documents from the agency posting (Phase 1, anonymous)

## Problem and evidence

**Oct 30, Friday job (`weekly-rfp-pursue-decision.mjs`).** 48 RFPs scored 50+ on their listing. 20 of them got no full-text score because of missing or unreadable documents (`.isa-local/audit/2026-10-30.jsonl`).

HigherGov never refused a download: all 39 files it listed came down. The gap is that HigherGov didn't have the files:

| Group | What HigherGov had | RFPs | Posting sites |
|---|---|---|---|
| A | No documents at all | 11 | Public Purchase ×3, DemandStar, IonWave, NC eVP, RAMP LA, Vermont Business Registry, NYSCR, DC OCP, and a newspaper home page |
| B | Some files, but not the solicitation | 6 | Two Jaggaer one-page summaries, an Oracle supplier-portal template, eMMA bid drawings, COMMBUYS attachments without the RFQ, a city page with only the requirements matrix |
| C | Unreadable formats | 3 | `.xml`, old `.doc`, and PDFs with no text. Out of scope here. |

Oct 23 looked the same: 19 of 50. Across both weeks there are about 40 different posting sites, and only Public Purchase misses repeatedly (6 times).

**What the job did.** It never requested the agency's posting (`solicitation_url`), and the report gave no reason beyond "couldn't get or read the RFP documents".

**Portal research, Nov 3** (anonymous GETs and the portals' own help pages; partly unverified):

| Site | Access |
|---|---|
| Public Purchase | 401 to an anonymous request |
| RAMP LA, Bonfire, OpenGov, NYSCR | Free accounts |
| DemandStar | Paid; terms ban robots |
| eMMA | Bot check |
| NC eVP | JavaScript app |
| Vermont | Specifications by email |
| COMMBUYS, IonWave, Oracle abstracts | Might serve some documents anonymously |
| Jaggaer | A summary's "Buyer Attachments" link to an open `PublicEventDownload` endpoint, which served Texas State's whole package (fetch skill v1.7) |

## Desired behavior and acceptance

**When the job tries the posting.** For an RFP at the document-fetch threshold (50+) where HigherGov returned no documents (`document-list-empty`, `access-blocked`), or returned files without a readable solicitation.

**What it fetches.** Anonymously and in the same run (`posting-documents.mjs`):
- file links on the posting page;
- links inside HigherGov's own PDFs, such as a Jaggaer summary's attachments;
- the posting itself, when it is a file.

**How found files are used:**
- They go through the same reading, classification and completeness rules as HigherGov's.
- A file that doesn't name the RFP's number or at least 2 distinctive title words is kept but never scored (`match: 'unmatched'`).

**What the report says otherwise.** An RFP still missing its documents because of a vendor login gets its own group under "Couldn't check yet", headed "Documents need a portal login". Each line names the portal ("the documents need a free Public Purchase account to download"), the listing score, the due date, the HigherGov listing and the agency posting.

Other causes say why in brackets:
- bot check
- by email
- JavaScript only
- not listed
- gone
- didn't answer
- robots.txt
- a newspaper notice

**Data and audit:**
- Results-file entries carry `portal` and `documentsNote`.
- `plainOutcome` gives the decision "Needs a portal login".
- Audit lines carry `documents.posting` and each file's `source` and `match`.
- The workbook adds a "Posting site" column.

**Flag.** `RFP_POSTING_FETCH_ENABLED`, off by default. With it off, a site in `rfp-portals.mjs` is still named from the list, and no request is made.

## Out of scope

- Logged-in downloads on Seamgen-held accounts (Phase 2). These need the planholder decision, credentials in Secret Server, and Sam and Hugo's approval for VM portal logins.
- A headless browser, captcha or bot-check handling, registration, terms acceptance, payment.
- SAM.gov's API, ZIP packages, following linked web pages, sets that have the solicitation but are missing a scope file (Rhode Island's case), the secondary scorer, and group C formats.
- Scheduler or credential changes. Turning the flag on is a later wrapper-only deploy after a measured run.

## Constraints and risks

**Terms of use.**
- Sites whose terms or access model rule out anonymous automated reading are `fetch: false` and never requested.
- robots.txt is honored.
- One page per RFP, with no crawling.

**Planholder lists.** Anonymous GETs register nothing, and no request is ever anything but a GET.

**Secrets.** Download links can carry tokens, so only origin and path are stored (`fetched_from`). The audit and log hold host names only.

**Limits:**

| Scope | Limit |
|---|---|
| Per request | 20 s timeout; 2 MB per page |
| Per site | at least 2 s between requests |
| Per file | 25 MB |
| Per RFP | 10 files and 60 MB |
| Per run | 30 RFPs and 15 minutes |

A 429 or a bot check blocks that site for the rest of the run.

**Wrong documents.**
- A web page served for a file link (a sign-in or error page) is never saved.
- Posting files must name this RFP.
- The scope-document rule still applies.

**Rollback.** Set the flag to 0, or restore the deploy backup. The new manifest and audit fields are additive.

## References

- Code:
  - `workspace/scripts/posting-documents.mjs` and `rfp-portals.mjs`
  - `weekly-rfp-pursue-decision.mjs`: `postingNeeded`, `extractManifestEvidence`, and the main loop
  - `rfp-report.mjs`: `checkReason`, `placement`, `renderMarkdown`
  - `rfp-audit.mjs`: `auditDocuments`
- Tools: `devtools/rfp-posting-probe.mjs`
- Docs:
  - [Document qualification](../../domains/rfp/document-qualification.md)
  - `workspace/skills/rfp-document-fetch-skill.md` Step 6–7a and its escalation ladder
  - The earlier sketch in [needs-documents](../2026-10-05__rfp-needs-documents/spec.md)
