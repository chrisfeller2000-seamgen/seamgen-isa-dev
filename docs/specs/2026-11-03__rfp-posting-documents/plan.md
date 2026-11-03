# ISA implementation plan: documents from the agency posting (Phase 1)

## Approach and alternatives

**Anonymous plain HTTP inside the Friday job,** behind a flag that is off by default.

A list of known posting sites (`rfp-portals.mjs`) does two jobs:
- it decides which sites are never requested;
- it names the portal in the report.

That second job works without fetching anything, so the report's login group helps from the first Friday even with the flag off.

Alternatives rejected for Phase 1:
- **A headless browser.** It would reach JavaScript portals but adds Chromium to the VM, and those portals mostly need a login anyway.
- **Logged-in downloads.** These are Phase 2. They need credentials on the VM, approval, and a planholder decision.
- **Per-portal adapters for every site.** About 40 sites a week, and only one repeats often. Jaggaer's summary links are the only adapter, because they are a known open endpoint.

## Source and insertion points

**`posting-documents.mjs`:**
- `fetchPostingDocuments()` is the entry point.
- `knownPostingOutcome()` and `postingWithoutFetch()` decide outcomes with no request.
- `politeGet()` is the only request function: GET only, with timeout, size caps and manual redirects.
- `classifyPostingPage()` and `classifyEmptyPage()` read the response.
- `harvestLinks()` finds file links, and `extractPdfLinks()` reads `/URI` links from raw and Flate streams.
- `postingRowMatchesRfp()` checks a file is for this RFP.
- `createPostingBudget()` holds one run's limits.

**`rfp-portals.mjs`:** `PORTALS`, `portalFor()`, `loginPortal()` and `PORTAL_ACCESS_TEXT`.

**`weekly-rfp-pursue-decision.mjs`:**
- `postingNeeded()` decides when to try the posting.
- `extractManifestEvidence()` gains an extraction cache and the RFP match check.
- The main loop tries the posting, merges posting rows into the manifest, and passes `posting` to every `addEntry`.

**`highergov-document-flow.mjs`:**
- exports its file helpers;
- rows get `source: 'highergov'`;
- the manifest markdown shows each row's source and a `posting:` line.

**`rfp-report.mjs`:** a new `portal` check reason, `checkReason()`, the entry fields `portal` and `documentsNote`, and the Markdown login group.

**Audit:** `rfp-audit.mjs` gains `posting` and per-file `source`/`match`; the workbook in `devtools/rfp-audit.mjs` gains a column.

**Wrapper:** the cron wrapper exports the flag as 0.

**Probe:** `devtools/rfp-posting-probe.mjs` and its npm script.

## Invariants and side effects

- **Nothing reaches an agency site but a GET without cookies.** No form, login, registration, terms acceptance or payment.
- **Never requested:** a `fetch: false` site, a robots.txt disallow, or a site blocked earlier this run. A posting on highergov.com doesn't count as a posting.
- **Same rules as HigherGov files.** Posting files pass the same extraction, classification and completeness rules, plus the RFP match check.
- **A failed posting file never makes the HigherGov set look worse:** its row has `required: false`.
- **No stored tokens.** Query strings never reach the manifest, audit or log.
- **HigherGov `failed` (an outage) never triggers a posting attempt.**
- **`--test-mode` is unchanged.**

## Context to keep beside code

- Why anonymous only, and why each `fetch: false` entry (terms, account, bot check), with dates.
- Why an HTML answer to a file link is dropped: it's a sign-in or error page.
- Why posting files must name the RFP: city bid boards list every bid's files.
- Why the extraction cache exists: OCR takes up to 10 minutes a file.

## Verification and release boundary

**Offline:**
- `devtools/posting-documents.test.mjs`: the module and the weekly helpers.
- `devtools/rfp-posting-run.test.mjs`: whole preview runs for found, unmatched, login portal, and flag off.
- New cases in `rfp-report.test.mjs` and `rfp-audit.test.mjs`.
- Mutation checks: the portal placement, the unmatched rule and the trigger each make their tests fail when reverted.
- `npm test` and `npm run check`.

**Probe:**
- `npm run rfp:posting-probe -- <date>` with no network.
- `--live` only with agreement, since it requests agency sites.

**Release:**
1. Upload with the flag at 0.
2. Check the next Friday's login group and the audit's `documents.posting`.
3. Run the live probe, or one flagged run, and review.
4. Set the flag to 1 with a wrapper-only deploy.
5. Check the `[rfp-posting]` lines in `cron.log`, the run time, and every `documents-found` RFP's files.
