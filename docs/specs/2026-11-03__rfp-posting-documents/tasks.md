# ISA task checklist: documents from the agency posting (Phase 1)

- [x] **Branch.** `feat/rfp-posting-documents`, stacked on `fix/rfp-validation-detail` (PR #32, not yet merged), because both touch `rfp-audit.mjs`. Retarget to `main` once #32 merges. The worktree was clean.
- [x] **Evidence.** The Oct 23 and Oct 30 audits:
  - the A/B/C split;
  - the host tally;
  - no HigherGov download refused.
  - Portal research on Nov 3: anonymous GETs only, no logins.
- [x] **`rfp-portals.mjs`.**
  - 17 sites, each with its access model, whether the job may request it, and its evidence.
  - Suffix host matching.
  - Plain access wording.
- [x] **`posting-documents.mjs`.**
  - GET-only requests, with no cookies and the job's limits.
  - robots.txt.
  - Page classification, link harvest, and PDF `/URI` extraction (raw and Flate).
  - The Jaggaer document host.
  - The RFP match check.
  - A dry run for the probe.
- [x] **Weekly job.**
  - `postingNeeded()`.
  - The extraction cache and match check in `extractManifestEvidence()`.
  - The posting step and manifest merge.
  - `[rfp-posting]` log lines.
  - The flag, off by default; the cron wrapper exports it as 0.
- [x] **Report.**
  - The `portal` reason and the "Documents need a portal login" group.
  - `checkReason()`, with bracketed causes for other misses.
  - `plainOutcome` "Needs a portal login".
  - Entry `portal` and `documentsNote`.
- [x] **Audit.** `documents.posting`, plus per-file `source` and `match`; the workbook's "Posting site" column and decision order.
- [x] **Probe.** `npm run rfp:posting-probe -- <date>` (offline), with `--live` as a dry run.
  - Oct 23 offline: 19 RFPs. 9 never requested: 6 on free-account portals, NC eVP, Vermont, SAM.gov. 10 to try.
  - Oct 30 offline: 20 RFPs. 10 never requested: 6 on login portals, eMMA, NC eVP, Vermont, a newspaper. 10 to try, 3 of which are the unreadable-format group C.
- [x] **Tests.**
  - The module, weekly helpers, report and audit.
  - Four whole preview runs: found, unmatched, login portal, flag off.
  - Mutation checks fail as expected.
- [ ] **Live probe** (`--live`, needs agreement), covering:
  1. Jaggaer `Summary.pdf` links and `PublicEventDownload` with our User-Agent.
  2. COMMBUYS `downloadFile`.
  3. IonWave `extract.aspx`.
  4. NC eVP.
  5. Oracle abstracts.
  6. Gilbert AZ and DC OCP harvest.
  7. robots.txt on these sites.

  Record the results here and adjust `rfp-portals.mjs`.
- [ ] **Release** with the flag at 0, after an explicit deployment request: preview, drift check, one deployer, backups recorded here.
- [ ] **Enable** the flag with a wrapper-only deploy after reviewing the probe. Check the Friday audit, `cron.log` and the run time.
