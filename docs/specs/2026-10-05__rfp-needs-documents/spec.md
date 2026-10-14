# ISA secondary scorer: no final score without the solicitation

Status: Deployed to the VM October 5, 2026 (three files); post-deploy checks passed. The normal secondary job has not run since. Branch not pushed.
Task branch: `fix/rfp-evidence-gate`, created from `7d39fca` (the deployed September 30 deadline release)
Integration target: `main` (the two deadline commits in this base are not on `main` yet)
Scope: the secondary full-text scorer and its report, file-name classification in the shared HigherGov helper, and one line of ISA's scoring skill. The weekly job's code is not changed.

## Summary

The secondary scorer must give a final score and recommendation only after it has read the actual solicitation. When it has not — no document records, a failed lookup or download, files with no readable text, no file that is the solicitation, or a required attachment it could not read — the result is **Needs documents** with the specific reason, and no final score. The preliminary score stays visible, labeled provisional.

The preliminary (metadata) score does not change. Jake's process uses it to decide which RFPs are worth fetching documents for (75+). We cannot know an RFP lacks documents until we try, and fetching for every candidate would spend HigherGov quota on all of them.

Missing documents are not a no-bid. **Needs documents** is a status for automation, not a to-do for a person: it marks the RFPs that the follow-up retrieval work (below) should try to get automatically. Until that exists, they stay unscored and visible in the report.

This is the first, narrow implementation of the broader September 30 draft, `docs/specs/2026-09-30__rfp-evidence-gating/spec.md` on branch `docs/rfp-evidence-gating` (uncommitted, in its own worktree). That draft remains the reference for what this spec leaves out.

## Problem and evidence

Read-only checks on October 5, 2026. Counts only; RFP titles and content stay out of Git.

**The deployed secondary scorer does not check whether it read a solicitation.** Live `secondary-fulltext-score.mjs` (`ec0108c1…`) is identical to this branch's base.

- `main()` scores `candidate.body` — the HigherGov listing text — whenever `fetchAndExtract()` does not return `downloaded`, and again in its `catch` branch after a lookup or download error.
- `fetchAndExtract()` returns `downloaded` once it has tried the downloads, even when no file produced readable text. Nothing checks that any file is the solicitation.
- `buildScore()` always prepends the listing text to any document text.

**What the old code produced.** The September 28 secondary report covered 31 RFPs: 23 `downloaded` and 8 `document-list-empty`. It ran before the September 30 deadline release. All 8 RFPs without documents got a numeric "full-text" score and a recommendation: 2 Strong Pursue, 1 Worth a look, 5 No-bid. Two of the report's three Strong Pursue results had no documents at all.

**What the deployed code does now.** Since September 30, a deadline taken only from the listing is unverified (`gate1: null`), so an RFP without documents gets a null total. That blocks false pursue results only as a side effect of the deadline fix, and the outcome is still wrong:

- With no keyword gate failure on the listing text, the result is **Deadline needs review**. That sends people after the deadline instead of the documents. The existing offline test asserts exactly this for an empty document list.
- With a keyword gate failure on the listing text, the result is **No-bid**, decided from a summary. Only 1 of the 8 September 28 RFPs without documents is still in the VM candidate folder. Re-running the deployed scoring function on it in memory (no network, no writes) still returns No-bid from a Gate 2 keyword match on its listing text.
- A readable file is treated as the solicitation based on its name alone (see decision 2), and the result is scored as full-text. How often this happened on September 28 cannot be checked: that run saved its files in temporary folders that no longer exist.

No secondary report has been written to the RFP reports folder since September 28, so today's behavior has not yet reached a report.

**The weekly job already applies this rule.** When its completeness check fails, it stores `final_score: null`, keeps the candidate provisional, and lists it for manual review. Its October 2 report shows all 153 candidates as `metadata-only`; it is not currently fetching documents. That setting is separate and unchanged here.

## Desired behavior

1. **Selection does not change.** The secondary still takes the preliminary report's 75+ entries and does not fetch below 75. The six fixed historical titles remain a separate known issue.
2. **Use the weekly job's evidence check.** After extraction, mark a manifest row `extracted` only if it produced non-empty text, as the weekly job does, then call the existing `evaluateDocumentCompleteness()` from `highergov-document-flow.mjs`. A final score is allowed only when it returns `complete: true`.
3. **Otherwise, Needs documents.** Set `fulltext_score: null` and `recommendation: 'Needs documents'`, keep `preliminary_score`, and record the status with a fixed, plain reason. Reasons after download come from the shared helper, so both scoring paths use the same wording:

   | Situation | `fetchStatus` | Reason |
   | --- | --- | --- |
   | No capture date to look up the listing | `metadata-only` | Listing could not be looked up in HigherGov (no capture date). |
   | Listing not found again in HigherGov | `failed` | Listing could not be found again in HigherGov. |
   | Listing has no documents link | `access-blocked` | HigherGov listing has no documents link. |
   | Zero document records | `document-list-empty` | HigherGov returned no documents. |
   | Lookup error | `failed` | Document retrieval failed. |
   | Every download failed | `failed` | Document download failed before any usable file was saved. |
   | Every file is portal-gated | `access-blocked` | The returned documents were portal-gated. |
   | No readable file is the solicitation | `partial-documents` | No extractable solicitation file was saved. |
   | A required attachment is missing or unreadable | `partial-documents` | Missing or unreadable required document: (file name). |

   Never copy raw error messages into a reason. Provider errors and download links can carry API keys or signed URLs.
4. **No verdict from listing text.** For a Needs documents result, do not run the keyword gates or categories on the listing text: no No-bid, no pursue, no category points. Show the listing deadline, labeled unverified, so an expired listing is still visible.
5. **Document-backed results do not change.** When the check passes, scoring works exactly as today, including **Deadline needs review** for a deadline the documents cannot confirm.

### Report

- The summary adds `needsDocuments`. The recommendation counts — Strong Pursue, Worth a look, No-bid, Deadline needs review, Needs documents — add up to `total`.
- The Markdown adds a "Needs documents: N" summary line and lists those RFPs in their own section after the scored ones, highest preliminary score first. Each shows its preliminary score (provisional), the reason, and the unverified listing deadline. No gate or category lines.
- JSON rows keep their keys; for Needs documents rows, gates and categories are null. Report code must count, sort, and render those rows without errors.
- ISA reads this report when asked in Telegram. Add **Needs documents** to the recommendation list in `workspace/skills/rfp-scoring-skill.md` and to its rule for reading the secondary report: such a row is neither a score nor a no-bid.

## Decisions (confirmed October 5)

Chris agreed with the proposed approach; each choice is easy to revisit.

1. **Label: Needs documents.** The AI-scoring branch already uses it; the September 30 draft's "Not enough information" is not used.
2. **Fix file-name classification in the shared helper now.** The live `classifyDocumentRecord()` in `highergov-document-flow.mjs` does not recognize underscore names: `RFP_Final.pdf`, `RFP_26-118_Website_Redesign.pdf`, and `Request_for_Proposals.pdf` are not treated as the solicitation, so real RFPs would become Needs documents. It also treats `Final Agenda.pdf`, `Final Rating Form.pdf`, and `RFP 26-118 Addendum 1.pdf` as the solicitation (checked October 5 with pure function calls on synthetic names). The AI-scoring branch already fixes this inside `classifyDocumentRecord()`; port that function change only.
   - Do **not** port that branch's `evaluateDocumentCompleteness()` change. It expects extracted text, but the live weekly job passes character counts, so every weekly document set would look incomplete.
   - Costs: a second runtime file ships, and the weekly job's file classification changes too (it is not fetching documents today). A name like `RFP - Scope of Services.pdf` becomes a requirements file, so a package with only that file becomes Needs documents.
   - Neither version detects by content that a readable, RFP-named file is only a notice or summary. That comes with the AI scoring work.
3. **Skill line: included.**

## Out of scope

- Preliminary scoring, the 75 threshold, and the keyword scoring of document-backed RFPs (replaced later by the AI scoring work).
- Content checks for readable, RFP-named files that are only notices or summaries.
- The weekly job's code, its document-fetch setting, schedules, intake state, HubSpot, email, and Telegram delivery.
- The secondary's six fixed historical titles, and saving its downloads somewhere other than a temporary folder.
- Portal access, new retries, or a retry schedule. Historical reports and CRM records.

## Plan

0. **Match production first.** Only two allowlisted files differed between this base and the VM: weekly `0032dd7f…` and the HigherGov helper `f2fdcd15…` (verified October 5; the other 43 matched). The unmerged GitHub branch `fix/highergov-lookup-retry` (`d926d83`, September 24) holds exactly those two VM versions, plus its own helper tests and fixture updates. It is merged into this branch as its own commit. Its one conflict, the empty-list status in the secondary scorer, keeps the deployed version (`ec0108c1…`), which already contains that change. The merge alone passes all 45 tests. A read-only `npm run live:pull` and plain `npm run live:accept` (no `--acknowledge`) recorded the matching VM baseline for this worktree.
1. Write failing offline tests for the acceptance cases below, extending the existing secondary CLI test (`devtools/rfp-deadline-report.test.mjs` with `devtools/fixtures/secondary-deadline-fetch.mjs`). Confirm they fail on the current code.
2. Implement in `secondary-fulltext-score.mjs`: extraction flags, the completeness check, Needs documents results, and report changes. Port the `classifyDocumentRecord()` change.
3. Update the skill line and `docs/domains/rfp/document-qualification.md`.
4. Run `npm test`, `npm run check`, and `git diff --check`; review the diff. Commit only when asked.

## Acceptance tests

All offline: synthetic candidates and in-process mocked HigherGov responses, as in the existing secondary CLI test. No real provider requests; candidate and intake-state files stay unchanged.

1. Zero document records with preliminary score 80 → Needs documents, null final score, counted only in `needsDocuments`. This replaces the current "Deadline needs review" assertion for this case; the change is intended.
2. Missing capture date, a listing not found again, no documents link, and a document-list error → Needs documents each, with fixed reasons containing no URL or key.
3. A download error thrown mid-run → Needs documents; the listing text is not scored.
4. A file that downloads but yields no text → Needs documents.
5. Only a readable non-solicitation file, such as a pricing form → Needs documents.
6. A readable solicitation plus an unreadable required attachment → Needs documents, naming that file.
7. Listing text that trips a keyword gate (for example "hardware") with no documents → Needs documents, not No-bid.
8. A readable solicitation → unchanged: the existing regression (October 26 deadline, 28 days as of September 28, 4 timeline points, total 77, Strong Pursue) and the conflicting/invalid-deadline cases (Deadline needs review) still pass.
9. Report counts add up to `total`; Needs documents rows render in their own section, sorted by preliminary score, with no gates or category points.
10. Pure-function tests for the file names in decision 2, and the weekly job's existing fixture tests still pass with the changed helper.
11. The full suite and source check pass.

Passing proves the secondary's decision boundary on synthetic inputs. It does not prove real HigherGov behavior, or that a readable, RFP-named file is the actual solicitation.

## Local results (October 5)

- Step 0 completed as described in the plan. A fresh read-only check at 21:29 UTC found no VM change since the morning baseline; the only VM differences are this change's three files. GitHub `main` is still `26c5cdd`.
- New tests in `devtools/rfp-secondary-evidence.test.mjs`: file-name roles, and one offline run of the real secondary scorer over 16 synthetic listings, 15 of which must become Needs documents. The existing empty-list assertion in `devtools/rfp-deadline-report.test.mjs` now expects Needs documents instead of Deadline needs review; the change is intended.
- Before the fix, the new tests failed as expected: an empty list gave Deadline needs review, and `RFP_Final` was not a solicitation. With the merge and the fix: `npm test` 47/47, `npm run check` (14 scripts), and `git diff --check` pass. The Oct 26 / 28 days / 4 points / 77 / Strong Pursue regression is unchanged.
- Diff review found one more gap: when a download throws (rather than returning an HTTP error), the secondary's fallback row lost the file's role, so a required attachment could fail unnoticed. The fallback now keeps the role from `classifyDocumentRecord()`, with a regression test.
- The weekly job has the same pattern: it records a thrown download as an optional `other` file. Its code is unchanged here and it is not fetching documents today; fix it separately before document fetching is turned on.
- The new file roles also change the role prefix in saved file names. On October 5 the VM had no saved `RFPs/1-pre-submission/` folders, so no existing saves can be duplicated under a new name.

These are offline results on synthetic inputs. No real HigherGov request, model call, VM change, or production job was involved.

## Release (separate approval)

- Exact files: `scripts/secondary-fulltext-score.mjs`, `scripts/highergov-document-flow.mjs`, and `skills/rfp-scoring-skill.md`. The imported weekly job already matches the VM and is not uploaded.
- Preview with `npm run live:deploy -- --files=…` after a fresh drift check. One deployer, coordinated with Sam and Hugo; backups and hashes recorded in this spec.
- Post-deploy check as on September 30: import pure functions from the deployed files with network disabled and assert the Needs documents and classification cases. Do not run the normal job.
- Rollback restores the release backups and verifies these hashes:
  - secondary `ec0108c12f8e2d25edc1ce5620c502cd25fe9ea663a38469b354be0290ef7187`
  - helper `f2fdcd1520497dc055df40d4c8ea96d7d91c11fef3bc5530b31f7b0f82111496`
  - skill `87dc6d27bfc2307b7c279c29f59c87c4b25b00439310c365af71629c0c37ab74`
- The next real secondary run is the first production evidence; check its Needs documents count and reasons.

## Follow-up: automated document retrieval (separate spec)

Chris's goal is a pipeline that is as automated as possible, so Needs documents should feed an automatic retrieval step, with a person only as the last resort. Jake's original system did not solve this either: it used a signed-in browser, checked only agency sites where Seamgen already had an account, and otherwise asked Jake to supply the RFP.

Every candidate stores a `solicitation_url` to the agency's own posting. On October 5 the 153 candidates with that link pointed most often to SAM.gov (12), OpenGov (11), BidNet (9), and NY State Contract Reporter (9), then about 20 sites with 2–5 each and a long tail. Possible steps, easiest first: re-check HigherGov on later runs; SAM.gov's official API for federal attachments (needs a free SAM.gov API key; untested); agency pages that link documents publicly; sites where Seamgen already has an account (logins on the VM need Sam and Hugo's approval); sites needing new registration or a CAPTCHA stay flagged. This reopens portal work that was paused earlier because it was not consistently automatable.

### Measurement, October 13, 2026

Input: the 16 RFPs the October 9 run marked Needs documents for lack of documents. Read-only VM reads of their candidate files, then one plain request per stored `solicitation_url` (no cookies, no JavaScript), and one test download noted below. The working notes stay in ignored local `.isa-local/` files; counts and site names only here.

- **5 of 16 were not missing documents.** HigherGov had returned the solicitation and ISA did not recognize it: it called itself a Request for Offers or a Request for Application, it was the file named "Scope of Work", it said where to download itself, or it was an unreadable `.xlsm`. The recognition fixes are on `main` (`7e9dbb8`, `c0cc919`, and `f2afb73` for `.xlsm`). Whether each is live on the VM was not checked here.
- **11 were really missing, and no stored page linked the files directly.** A plain request got a CAPTCHA or bot challenge (2), a login form (1), a plan-holder registration form (2), a JavaScript portal (3: SAM.gov, IonWave, Georgia's procurement registry), or a notice pointing to another site (3). One more hop on those three still did not reach the files.
- **The JavaScript group, checked further.** SAM.gov's public record lists exactly the two files HigherGov returned and is readable as plain JSON without a browser. IonWave's files are plain `Extract.aspx` links with no file extension; one test download returned the full RFP with no login. Georgia's registry loads for a standard browser name, but that RFP was available only by emailing the county.
- **Robots files.** Every dedicated procurement portal in the sample (IonWave, Bonfire, Virginia eVA, PA eMarketplace, Jaggaer, Texas SmartBuy, QuestCDN) disallows all robots. IonWave's was read only after the page reads and the one download, and no automated request went to it afterward; its owner's terms also bar commercial use not approved in writing. The sites that allow robots are ordinary agency or nonprofit pages, and none of them held the missing files.

Conclusions for the retrieval spec:

- Recognizing what HigherGov already returns was the largest gain in this sample, larger than any fetching step.
- Do not schedule automated fetching from procurement portals without the site's permission. Treat them as places a person fetches from, with the portal named in the blocker. Read a site's robots file before probing it.
- SAM.gov's official API is the one retrieval route consistent with these findings. It still needs a free SAM.gov API key and is untested.
- A link finder must not depend on file extensions; take the file name from the link text or the response headers.

This is one week's sample. `devtools/measure-document-sources.mjs`, a reusable version of the measurement written afterward, is kept as an uncommitted draft and has not been run. It does not read robots files and finds files by extension, so it should not be run as it stands.

## Coordination

The AI-scoring branch (`test/rfp-rubric-alignment`, uncommitted) rewrites the same secondary script, imports the same VM files, makes the same classification change, and already enforces this rule with the same label. Whichever lands second merges the other; the shared label and identical classification change keep that merge mechanical. Both branches also edit `docs/specs/README.md`.

## Tasks

- [x] Decisions 1–3 confirmed.
- [x] Production versions merged from `fix/highergov-lookup-retry` in their own commit; suite passes.
- [x] Acceptance tests written and seen failing.
- [x] Implementation passes all acceptance tests.
- [x] Skill line and domain docs updated.
- [x] `npm test`, `npm run check`, `git diff --check` pass; diff reviewed.
- [x] Committed locally on request.
- [x] Released to the VM on Chris's explicit request (see Deployment evidence).
- [ ] Push and PR only on request.

## References

- [Secondary scoring script](../../../workspace/scripts/secondary-fulltext-score.mjs)
- [HigherGov document helper](../../../workspace/scripts/highergov-document-flow.mjs)
- [Document qualification](../../domains/rfp/document-qualification.md)
- [RFP deadline selection and scoring](../2026-09-30__rfp-deadline-scoring/spec.md)
- [Deployment boundaries](../../deployment.md)
- [Security and data boundaries](../../security.md)

## Deployment evidence — October 5, 2026

Chris asked to deploy straight to the VM. Exact-file release of commit `b872cbc`; no service restart, schedule, configuration, or credential change.

- Before upload: read-only check at 21:29 and 21:35 UTC found no VM change since the accepted baseline and no RFP job running. The preview listed only the three files below, with no excluded differences.
- Release: `dev-deploy-2026-10-05T21-37-52-242Z-b872cbc`, uploaded at 21:40 UTC. Backup root: `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-10-05T21-37-52-242Z-b872cbc` (`original/` holds the prior files).

| Deployed file | New SHA-256 | Prior SHA-256 (in backup) |
| --- | --- | --- |
| `scripts/secondary-fulltext-score.mjs` | `a044acfadbb133ab39c45f6d11a799874f3eeb477ef275667034efd491a78eeb` | `ec0108c12f8e2d25edc1ce5620c502cd25fe9ea663a38469b354be0290ef7187` |
| `scripts/highergov-document-flow.mjs` | `1e0d4698a158f0ba9998bb7c55f534d2442ad0c8ce4bc851b2b406020b4e4492` | `f2fdcd1520497dc055df40d4c8ea96d7d91c11fef3bc5530b31f7b0f82111496` |
| `skills/rfp-scoring-skill.md` | `4975d7383677673fb3baff1e723498cfcbaa1633e748811c1e133ec24e6a44c0` | `87dc6d27bfc2307b7c279c29f59c87c4b25b00439310c365af71629c0c37ab74` |

- After upload: independent SSH hashes match the commit; `weekly-rfp-pursue-decision.mjs` (`0032dd7f…`) and `rfp-deadline.mjs` (`410a27b2…`) are unchanged; both scripts pass `node --check` under VM Node v24.21.0; a fresh `live:pull` shows no difference between the VM and this branch.
- Pure functions imported from the deployed files on the VM, network disabled, passed six checks: the weekly job's helper imports, file-name roles, the completeness check, the Needs documents result, the unchanged deadline regression (Oct 26, 28 days, 4 points, 77, Strong Pursue), and report counts and ordering. No business job, provider request, candidate or report write, or message was involved.
- Not yet observed: a real secondary run. The next one is the first production evidence; check its Needs documents count and reasons.

Rollback, if needed and separately requested: confirm the three VM files still have the new hashes above, copy the three files from the backup's `original/` folder back into place, and verify the prior hashes. Do not overwrite later VM edits or restore old reports.

## Real-data check after release — October 5, 2026

Controlled run of the deployed secondary scorer on 10 real RFPs from the October 2 list (preliminary 75+, captured September 30, ten different agency sites). It used an isolated temporary workspace on the VM and real read-only HigherGov calls: 4 listing pages (76 records), 10 document lists, 39 files, 92 seconds. Production RFP and report files were unchanged (fingerprint `90887e67…` before and after). Nothing was sent.

| Outcome | Count | Review |
| --- | ---: | --- |
| Scored from documents | 2 | Both No-bid from the existing keyword scorer; unchanged by this fix. |
| Needs documents, correct | 4 | 2 with no HigherGov documents; 2 whose only file is a short (about 1.5–2k characters) notice-like document. |
| Needs documents, wrong | 4 | 3 real RFPs (68k–147k characters, with RFP, deadline, and scope wording) not recognized because their file names lack "RFP" or "solicitation"; 1 complete ERP package blocked by a single `.doc` contract exhibit the VM cannot read (no `.doc` converter installed). |

Conclusion: no final score came from a listing summary, but file-name recognition misses too many real solicitations for an automated report. Follow-up: recognize the solicitation from its extracted text, not only its file name, and decide how unreadable contract or form exhibits and `.doc` files should count. Do not tune a rule to these 10 cases alone.

## Content-recognition follow-up — local, not deployed

Built and tested locally (48/48 offline tests): an otherwise unclassified file counts as the solicitation when its text names itself one, states a submission deadline, and describes the work; bidder forms and contract templates no longer block scoring when unreadable and are listed as not read.

Evaluated on the VM with the undeployed code on all 42 September 30 RFPs scoring 75+: isolated temporary workspace, real read-only HigherGov calls (8 listing pages / 151 records, 41 document lists, 118 files, 434 seconds), production fingerprint `90887e67…` unchanged, nothing sent.

- 18 scored from documents: 9 recognized by file name, 9 only by content. 24 Needs documents: 11 empty lists, 1 retrieval failure, 12 incomplete sets.
- The incomplete sets include correct cases (two RFIs, a direct award, short notices) and probable misses: an RFQ whose deadline wording is "no later than", a "Request for Quotes", a West Virginia solicitation whose scope section is titled "Specifications", and a complete SAM.gov package blocked by image-only drawing attachments.
- **All 18 document-backed results are No-bid from the existing keyword gates.** All 18 fail the keyword "software, not hardware" gate; 14 fail the references gate and 9 the custom-work gate. Long solicitations almost always contain such words. This predates the evidence gate (the September 28 report had 19 No-bids among 23 downloaded RFPs) and is the document-backed scorer the AI scoring work replaces.

Because recognizing more solicitations currently turns Needs documents into keyword No-bids, do not deploy the content rule until document-backed scoring is trustworthy. The deployed name-based gate stays.
