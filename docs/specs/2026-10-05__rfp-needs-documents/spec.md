# ISA secondary scorer: no final score without the solicitation

Status: Implemented and committed locally October 5, 2026; offline tests pass. Not pushed or deployed.
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

Every candidate stores a `solicitation_url` to the agency's own posting. On October 5 the 153 candidates with that link pointed most often to SAM.gov (12), OpenGov (11), BidNet (9), and NY State Contract Reporter (9), then about 20 sites with 2–5 each and a long tail. Possible steps, easiest first: re-check HigherGov on later runs; SAM.gov's official API for federal attachments (needs a free SAM.gov API key; untested); agency pages that link documents publicly; sites where Seamgen already has an account (logins on the VM need Sam and Hugo's approval); sites needing new registration or a CAPTCHA stay flagged. Start with a read-only measurement of which sites the Needs documents RFPs use and whether their documents download without a login. This reopens portal work that was paused earlier because it was not consistently automatable.

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
- [ ] Push and PR only on request; release only on a separate request.

## References

- [Secondary scoring script](../../../workspace/scripts/secondary-fulltext-score.mjs)
- [HigherGov document helper](../../../workspace/scripts/highergov-document-flow.mjs)
- [Document qualification](../../domains/rfp/document-qualification.md)
- [RFP deadline selection and scoring](../2026-09-30__rfp-deadline-scoring/spec.md)
- [Deployment boundaries](../../deployment.md)
- [Security and data boundaries](../../security.md)
