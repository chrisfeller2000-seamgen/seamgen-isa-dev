# Local implementation record

## October 5, 2026 update

Committed on `test/rfp-rubric-alignment`; not pushed or deployed.

- `91a5c2b` preserves the September 30 work exactly as found.
- `9c7c218` merges `fix/rfp-evidence-gate`, so the branch starts from the code deployed on the VM: the HigherGov lookup/retry helper, the weekly job, and the secondary "Needs documents" gate. A readable solicitation goes to the shared AI scorer; anything else is Needs documents without a model call. The weekly job, secondary scorer, and policy share one file classifier, including content recognition of the solicitation.
- `308c5e7` fixes the preliminary contract behind the failed September 30 batch, where all four preliminary scores were null:
  - Documents to retrieve may cite the listing before any documents exist.
  - The prompt asks for all eight categories at metadata depth.
  - "Watch" needs RFI, Sources Sought, or pre-solicitation evidence.

  Offline replay of the four retained answers: the reference-blocker answer now validates (provisional 92, documents fetched). The answer that omitted categories and the two watch answers stay unscored. A fresh bounded model run is still needed to show that the prompt change works.
- `506847e` and the following documentation commit simplify without changing rules:
  - The finalizer is split into named steps.
  - The model-facing contract is written once.
  - The regex/vm alignment harness and `npm run rfp:alignment` are replaced by `devtools/rfp-alignment.test.mjs`.
  - Unscored and early-return results carry null categories instead of zeros.

Checks: `npm test` 111/111 (including all 31 rubric cases), `npm run check` 16 scripts, `git diff --check` pass. All offline.

Also found on October 5:

- **Keyword No-bids.** With the deployed keyword scorer, all 18 of the 42 real September 30 RFPs that were scored from documents came out No-bid on keyword gates. All 18 failed the hardware keyword. This work replaces that scorer; see the [needs-documents spec](../2026-10-05__rfp-needs-documents/spec.md).
- **Title matching.** The secondary now matches report titles exactly. 131 of 135 current report entries match one candidate; 4 shortened titles go to Needs review instead of being guessed. Adding the slug to weekly report entries would close that gap.

Company files uploaded October 5 at Chris's request:

- The reviewed Case Studies and Assets went to `/home/azureuser/.openclaw/workspace/resources/proposal-sources/`. Before the upload, `resources/` did not exist and a bounded workspace search found no copies, so nothing was replaced.
- Access: folder `700`, files `600`, owner `azureuser`.
- SHA-256 on the VM matches the reviewed local copies and Jake's archive originals:
  - Case Studies `78b7e2015564510a5520f6cb4e4386c74fe9a7ea765530dfdf9b1a4d89264ecd`
  - Assets `1e058719cfb83b69087521ac54bf3e8e71115fbbd6c87dbd3c52e875f442b865`
- This branch's `loadScoringContext()` was run on the VM from a temporary folder. It loaded all four policy skills and both company sources.
- The files are not in the source allowlist or Git. The workspace's own git repository has no remote and no commits. How the maintainers' separate backup treats `resources/` still needs to be confirmed with them.
- Five deployed ISA skills already name this path, so ISA's normal chat agent can now read these files.
- The private review notes, which flag dated or unsupported claims in Assets, were not uploaded, and the loader does not read them. Current qualifications still need supporting records; see [company-confirmation.md](company-confirmation.md).

Real-model batch, October 5 (approved by Chris, up to 36 calls):

- Setup: 18 real September 30 RFPs that the deployed keyword scorer had scored from documents, all as No-bid. They ran through this branch's weekly `--test-mode` on the VM in an isolated temporary workspace, with ISA's existing model access (`openai/gpt-6-luna`) and real read-only HigherGov access.
- Safeguards: Telegram, HubSpot, Google, and Slack hosts were blocked. The production fingerprint of candidates, reports, and company files was unchanged. Nothing was sent.
- Usage: 28 model calls, about $0.19 as reported by OpenClaw.
- First pass: 13 of 18 preliminary answers validated. All 5 rejections reproduced on a re-run with captured answers. All were prompt/validator contract gaps:
  - tech-band evidence (3);
  - a null value estimate (1);
  - required citations for unknown submission/gate answers (2 after the first fix).

  These were fixed in `5dc8086` and `9580864`, without changing Jake's rules. Offline replay of the same captured answers then validated all five.
- Outcome with current code:

  | Result | RFPs | Reasons |
  | --- | ---: | --- |
  | Preliminary No-bid | 12 | Hardware or equipment as the main deliverable; consulting rather than software; maintenance of an existing licensed product; a three-government-reference requirement; a 7-day deadline. The AI's stated reasons cite the actual scope and match the rubric's distinctions. |
  | Worth a look | 6 | Scores of 61–69 |
  | Strong Pursue (75+) | 0 | — |

  With no 75+ result, no documents were fetched and full-text AI scoring was not exercised.
- Finding: at metadata depth, competitive position stays neutral and AI and compliance are often low, so non-AI software RFPs land around 60–70. Under Jake's written policy, 50–74 is "Worth a look" with no automatic document fetch. Whether to fetch documents for that band was a business decision; Chris later chose 50+ (see Fetch threshold below).
- Records: private raw answers and usage are in ignored `.isa-local/rfp-ai-batch-2026-10-05/`.

Full-text test, October 5 (same approval; 8 of the 36 calls):

- Setup: the six Worth-a-look RFPs went through this branch's secondary scorer on the VM, using a labeled test input report that listed them at 80. Each run fetched documents from HigherGov, checked completeness, and called the shared AI scorer. All six packages downloaded and passed the evidence gate.
- Valid full-text results:

  | RFP | Result | Reason |
  | --- | --- | --- |
  | Research project | No-bid | Gate 2: an ongoing data feed, not custom software. |
  | Learning management system | No-bid | Gate 2: a hosted subscription product with minimal customization. |
  | Gift platform | Deadline needs review | The submission deadline was not found in the documents. Gates unknown include an IPRO account and an unverified SOC 2 Type 2 requirement. |
  | Registry website | Needs review | Gate 6 unknown: financial-strength documents, key-staff references, PCI DSS. Categories sum to 71. Case study HCP, adjacent. |

- Fixes from this test, all committed:
  - Packets of up to ~580k characters exceeded the old 450k limit; the model's context is ~1.05M tokens and the limit is now 1.5M characters.
  - An expanded project name ("Healthcare Partners (HCP)") was rejected; the concrete prompt example is restored and the validator stays strict.
  - A copied description became an enumerated value ("inferred: …"), introduced by `5dc8086`; enumerated values are plain again and tested.
  - A large package hit the 120-second limit; it is now 300 seconds.
- Not yet shown with the final code: the ERP (timeout) and utility-software (enumerated value) packages need one more call each. No RFP in this sample scored 75+, so a qualified Strong Pursue has not been observed on real documents.
- Totals for the October 5 testing: 36 model calls, about $0.30 as reported by OpenClaw. Production fingerprints were unchanged and nothing was sent. Downloaded documents were removed from the VM test folder; raw private records are in `.isa-local/rfp-ai-batch-2026-10-05/`.

Fetch threshold, October 5 (Chris's decision; `f31b48e`):

- Documents are now fetched at a preliminary 50+, not 75+. Jake fetched only at 75+ because his browser-driven fetch was slow and manual. The HigherGov API fetch takes seconds, and the batch above showed that good software RFPs score 60–70 at listing depth.
- The decision bands are unchanged: 75+ Strong Pursue, 50–74 Worth a look, below 50 No-bid. ISA's preliminary-scoring skill (v1.1) and scoring skill say the same.

End-to-end weekly test, October 5 (approved by Chris, about 12 calls):

- Setup: the same six Worth-a-look RFPs ran through this branch's weekly `--test-mode` on the VM. The flow was AI preliminary score, HigherGov document fetch at 50+, completeness check, then AI full-text score. The branch's skill files were used, not the live ones. Safeguards were the same as in the batch above.
- One full-text answer, for the gift platform's 48k-character solicitation, ran past the 16k output-token cap and was not scored. The other full-text answers used 6k–12k tokens. The cap is now 32k; unused headroom is not billed. The gift platform was re-run with the new cap.
- Results with current code: every preliminary and full-text answer validated, and all six packages passed the evidence gate.

  | RFP | Preliminary | Full text | Reason |
  | --- | ---: | --- | --- |
  | Research project | 62 | No-bid | Gate 2: an ongoing geolocation-data service, not a custom build. |
  | Learning management system | 68 | No-bid | Gate 2: a hosted subscription product with minimal customization. Gate 6: three public-sector references required. |
  | ERP system | 60 | No-bid | Gate 2: the city is buying the rights to an ERP product; custom work only if needed. |
  | Registry website | 70 | Needs review | Gate 6 unknown: two similar projects within five years and NIST controls are not established by company records. Categories sum to 72. |
  | Utility-management software | 69 | Needs review | Gate 6 unknown: utility-management and legacy-migration experience is required and not established. Categories sum to 75. |
  | Gift platform | 62 | Deadline needs review | Listing deadline only. Gate 4 unknown: IPRO account. Gate 6 unknown: SOC 2 Type 2 and three related projects. |

- The ERP and utility-software packages, unconfirmed in the full-text test above, now score. The registry and utility-software results are the ones a person should look at: everything passes except the experience gate.
- Usage: 14 model calls, about $0.16 as reported by OpenClaw. The production fingerprint was unchanged; nothing was sent. Downloaded documents were removed; raw private records are in `.isa-local/rfp-ai-batch-2026-10-05/`.

VM release, October 6, 2026 (Chris's explicit deployment request):

- Release `dev-deploy-2026-10-06T00-56-11-664Z-1d18aef`, uploaded with `npm run live:deploy -- --apply --files=…` from clean commit `1d18aef`. Before upload, the VM's copies of the six modified files matched the deployed evidence-gate release (`b872cbc`) byte for byte, and the two scoring modules did not exist. No RFP job was running.
- Files, SHA-256 before → after:

  | File | Before | After |
  | --- | --- | --- |
  | `scripts/weekly-rfp-pursue-decision.mjs` | `0032dd7feaf153e96cfb4e15d2624ff466e122df9c60a62fa026ce41cc134ed7` | `230940e0667075d20c1538601eeeb38b0ed29dea9c9a9aa6e5deba9c97b6c2bf` |
  | `scripts/secondary-fulltext-score.mjs` | `a044acfadbb133ab39c45f6d11a799874f3eeb477ef275667034efd491a78eeb` | `d9863214dcb58308709fbd8989c10b495ded5b608148d2cc58a4ab2790bccf21` |
  | `scripts/highergov-document-flow.mjs` | `1e0d4698a158f0ba9998bb7c55f534d2442ad0c8ce4bc851b2b406020b4e4492` | `f56f7012664fd604d6c277355145ed2698eec9606c5dfa803ae2d49efebca498` |
  | `scripts/rfp-scoring-policy.mjs` | (new) | `e09ffe2789b2f72182ecedaba3b7c5181b8e54b136ad6dcd988ca167557bd9a8` |
  | `scripts/rfp-scoring-judgment.mjs` | (new) | `edca308fcaab6e8458efcad1fab8a0ee06a4c08845e1b4c2ce0ae70b1f795dfa` |
  | `scripts/run-new-rfp-qualification-cron.sh` | `c699a8e2dac495350505ae2a6b4396440d1c45da49e2b2f9f8db754eacbcd5ea` | `ea455f16a1cd8d790b5efe8301d78f827f2076289dc0ee0e498b8ddd249e28e6` |
  | `skills/rfp-scoring-skill.md` | `4975d7383677673fb3baff1e723498cfcbaa1633e748811c1e133ec24e6a44c0` | `960109e1cb98cbabc9fb69c5cedf083cf09fb4b26d0bf50871f55672fb0b97e7` |
  | `skills/rfp-preliminary-scoring-skill.md` | `d8ae3b6b04b9ad46f0109d81a1801c9f4e7b10ddc09dfaba61b5a921e92977c5` | `b5868c4834fbcff72aa98955451b9d21dcb1fc53e066d740660150e0b8031d1b` |

- Checks on the VM after upload, none of which called the model or ran a job:
  - all eight hashes match the commit;
  - `node --check` and `bash -n` pass;
  - the scoring modules load the four live policy skills and both company files;
  - the wrapper sets `RFP_DOCUMENT_FETCH_ENABLED=1`;
  - in a cron-like environment (empty env, the wrapper's PATH, the HigherGov env file), `npm root -g` resolves the OpenClaw install, and model preparation returns `openai/gpt-6-luna` with auth.
- Schedule, observed read-only:
  - The system crontab runs the wrapper at `0 12 * * 5` UTC. The weekly script mails the report and sends the Telegram summary itself.
  - ISA's OpenClaw job "New RFP qualification" runs at noon Pacific. On October 2 it took 83 seconds and did not re-run the script.
  - Nothing schedules the secondary scorer.
  - No restart is needed; the cron starts a new process each week.
- Expected weekly effect: about 48 seconds per preliminary call and 78 per full-text call, run one at a time. For 110–155 candidates, the run takes about 2.5–3.5 hours instead of about 5 minutes, at about $2 a week. Downloaded documents stay in each candidate's folder; the VM had 6.4 GB free.
- Rollback: copy `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-10-06T00-56-11-664Z-1d18aef/original/` back over the workspace, then delete the two new `rfp-scoring-*.mjs` modules. Restoring only the wrapper turns weekly fetching off and keeps AI preliminary scoring.

Next:

1. After the first scheduled run (Friday, October 9, 12:00 UTC), check `cron.log` and the report:
   - duration;
   - preliminary decisions;
   - how many were fetched, Needs documents, and full-text scored;
   - any model failures.
2. Follow-ups: clean up downloaded documents over time; retrieve documents HigherGov cannot provide; add the slug to weekly report entries; confirm how the maintainers' backup treats `resources/`.

## September 30 status and proof

The `npm run rfp:alignment` command named below was replaced on October 5 by `devtools/rfp-alignment.test.mjs`.

Shared scoring is implemented on `test/rfp-rubric-alignment`, based on `7d39fca`. Refreshed `origin/main` remained `26c5cdd`. Existing deadline work and pending task files were preserved. Initial user-authorized model requests and a subsequent original-recipe comparison ran in isolation; see [model-evaluation.md](model-evaluation.md) and [reference-comparison.md](reference-comparison.md). The comparison exposed release blockers, not complete practical alignment. No commit, push, merge, deployment, business job, credential creation, or credential copy was performed.

Final local checks:

| Check | Result | What it proves |
| --- | --- | --- |
| `npm test` | 75/75 pass | Offline policy validation, caller wiring, evidence-reference bounds, temporary persistence/reports, document fixtures, and existing regressions. |
| `npm run rfp:alignment` | 31/31 cases; zero failed checks | Original synthetic policy expectations pass with recorded judgments. Not real AI agreement. |
| `npm run check` | 16 JavaScript/shell scripts checked | Source-boundary and syntax checks; not provider integration. |
| `git diff --check` | Pass | No diff whitespace errors. |

The old keyword-scoring baseline passed 12/31. Business expectations were retained. Legacy frozen total assertions were replaced with valid category arithmetic because the obsolete keyword calculator is no longer the policy authority; the actual deadline/day/timezone assertions remain. Synthetic HigherGov responses were corrected to accept the verified URL-shaped document path and distinguish an empty document list.

## Implemented behavior

- Both weekly phases and secondary scoring call one bounded judgment adapter and one pure finalizer. The divergent keyword calculators are removed as authoritative scoring paths.
- The existing four policy skills govern judgments. Six gates, their subrules, eight category bands, citations, real project/partner/credential evidence, value uncertainty, conditional routes, deductions, and review flags are validated. Totals and decisions are computed in code.
- The approved deadline helper is reused unchanged, including the October 26 / September 30 / 26 days / four points regression.
- Only eligible preliminary 75+ results trigger documents. Secondary selection no longer force-includes six old titles or guesses ambiguous matches.
- Rating forms, bid-board exports, and known missing required attachments cannot establish full-text qualification. Actual extracted text is required.
- Stored candidate state and reports consume validated outcomes. Failed model/context/validation requests stay unscored; no heuristic fallback or automatic repair retry.
- Scoring uses a fresh tools-free completion, not ISA's ordinary agent session. Input/output and request duration are bounded; evidence is not silently truncated.
- The AI selects supplied paragraph IDs, and code resolves original text before strict citation checks. Unknown/unused IDs and generated quote fields fail closed. Project names must literally appear in the selected library evidence. No fuzzy matching, quote repair, or automatic retry; see [response-reliability.md](response-reliability.md).
- A case-match bridge may cite both the buyer's requirements and the company's past work. The named project must still be supported by a case-study citation; a buyer document cannot supply that proof. This fixes an overly strict library-only check without changing scoring bands or weakening project provenance.

Existing intake, search configuration, schedules, document-fetch flag, integration credentials, and business-delivery behavior were not redesigned. No new research crawler, provider account, database, or model service was added. Available landscape evidence can be supplied; absent research is explicitly insufficient, not a fabricated wired verdict.

## Runtime prerequisites and remaining evaluation

A read-only SSH check succeeded. The VM has Node `v24.18.0`, OpenClaw `2026.9.6`, and the required completion/config/agent SDK exports. The tools-free interface has now completed isolated requests using ISA's existing `openai/gpt-6-luna` model/auth. The production jobs were not invoked.

The following canonical private files were absent on the VM:

- `resources/proposal-sources/Proposal - Case Studies.txt`
- `resources/proposal-sources/Proposal - Assets.txt`

A bounded workspace filename search (excluding backups, dependencies, and Git) found no matching copies. This is not an exhaustive scan of other VM directories. The provided Jake archive contains those files and `Proposal - People.txt`. Case Studies/Assets were extracted into ignored local test storage and reviewed for scoring risks, not certified current. No private content was copied into Git or installed in the VM workspace.

The adapter currently reads Case Studies and Assets at their canonical paths. The real nonempty case-study library is mandatory; without it, scoring stops with `context-unavailable`. Needed qualification records must be approved and available before release. Do not substitute the skill's project index or model memory. Additional named/dated credential records may need explicit source loading after their actual locations and authority are verified.

The agreed setup is file-based, with no database or automatic sync. Local extraction, targeted review, and actual file-loading validation are done; an exact-file VM upload with drift checks/backups/hashes remains separate. See [company evidence setup](spec.md#company-evidence-setup--local-files-no-database) and its [task checklist](tasks.md#company-evidence-setup--local-setup-done-vm-setup-pending). Test inputs were sent in memory for tools-free model requests, not installed in the live workspace.

Initial real-model results and the subsequent same-input original-recipe comparison are recorded separately. The latter found quote failures and a near-cutoff decision difference; it did not reproduce Jake's historical Claude environment. Before release, resolve model-response reliability and category interpretation and confirm needed current qualifications; see [company confirmation](company-confirmation.md). Valid quotes alone do not prove correct interpretation. Historical survivor counts, complete model alignment, and scheduled production correctness remain unproven.

The authorized follow-up replaced generated quotations with excerpt-ID selection and corrected comparison-citation validation. Fifteen bounded diagnostic requests were retained; both fresh final integration requests validated. Five clarified responses validate under final-source replay, including two rejected before the validator correction. Borderline scores of 71/73/74 have the same Worth a look decision but still vary subjectively. This improves the tested response path, not proof of production reliability. See [evidence-ID evaluation](evidence-id-evaluation.md) for exact results and timing.

## Source provenance and separate release

The read-only VM baseline was reconciled before implementation:

- Weekly: `0032dd7feaf153e96cfb4e15d2624ff466e122df9c60a62fa026ce41cc134ed7`
- Document helper: `f2fdcd1520497dc055df40d4c8ea96d7d91c11fef3bc5530b31f7b0f82111496`
- Secondary: `ec0108c12f8e2d25edc1ce5620c502cd25fe9ea663a38469b354be0290ef7187`

Newer URL lookup, stable-key verification, retries, pagination, and safe manifests were preserved. Refresh again before any upload.

Exact changed runtime set and final local SHA-256:

| File under `workspace/scripts/` | SHA-256 |
| --- | --- |
| `rfp-scoring-policy.mjs` — new | `1f81a49bf332d4c28121fea70b675da205a756ee4777f5c543e5fe013aed3a41` |
| `rfp-scoring-judgment.mjs` — new | `11dd9137912e0e245972f1399049f757bbe5722a53219f78e4e44864ca18d0f6` |
| `weekly-rfp-pursue-decision.mjs` | `bfd390708615451e40ff658659fa72818d66ad9ce71225e715c4c4791244f256` |
| `secondary-fulltext-score.mjs` | `2863b7eb6e9ecaed6bd431022d246c084b5a15cc00d0df65b2caa93edfe54147` |
| `highergov-document-flow.mjs` | `d2f1f5fbd9567fd558ef3776a3f9caa2ee15e7a21b1f481715e2e0f52ed1c71a` |

The unchanged approved `rfp-deadline.mjs` dependency is `410a27b202947c6d74ef83ba0b9add5c02126e514b42aa1838b1f37cce3af238`; verify its presence/hash during release. Existing skill policies also require a drift check. The source transfer allowlist already covers `scripts/`; it was not widened to include private assets.

Release is a separate request. First finish evaluation, publish code and docs together, preview exact files against fresh VM state, and back up old files/hashes. Coordinate a cutover with no in-flight job using mixed caller/helper versions. Rollback restores the exact prior caller/helper set; remove new helpers only after callers no longer import them. Do not enable document fetching, alter schedules/model configuration, or run an ordinary report as an implied release test.

The duplicate fetch/refresh skill remains unchanged and is a separate known issue. HigherGov/portal document gaps remain possible; scoring alignment does not make those documents available.
