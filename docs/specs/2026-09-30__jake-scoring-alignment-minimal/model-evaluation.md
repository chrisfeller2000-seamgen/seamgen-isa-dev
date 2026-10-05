# Initial real-model evaluation — September 30, 2026

This records the initial test stage. Subsequent comparison, stricter all-citation validation, current source hashes, and release blockers are in [reference-comparison.md](reference-comparison.md). The six successful answers below still pass final offline replay; they do not establish general response reliability.

## Scope and isolation

The user authorized a small AI scoring test after preparing Jake's company files. Twelve model requests were made across five scenarios, including diagnostic/retest attempts. This is initial proof, not a complete Jake/ISA comparison or a production rollout.

Tests used ISA's existing `openai/gpt-6-luna` model/auth, high reasoning, and OpenClaw `2026.9.6`. Local scoring helpers and evidence were sent through SSH stdin and executed in memory. No helper/company files were installed in the live workspace. The bounded completion had no tools, agent session, delivery, or business-job entrypoint.

No weekly/secondary production job, intake reset, watermark update, scheduled-job change, HubSpot/Drive write, email, or Telegram post was initiated. No credential was created/copied or model configuration changed. Read-only VM source hashes still matched the pre-implementation baseline; the canonical company files remained absent.

## Company evidence

Case Studies and Assets were extracted from the supplied Jake archive into Git-ignored, owner-protected local storage. The actual `loadScoringContext` loaded both files and all four policy skills.

| Source | SHA-256 |
| --- | --- |
| Case Studies | `78b7e2015564510a5520f6cb4e4386c74fe9a7ea765530dfdf9b1a4d89264ecd` |
| Assets | `1e058719cfb83b69087521ac54bf3e8e71115fbbd6c87dbd3c52e875f442b865` |

Original files were not rewritten. A separate private review note accompanied test inputs. It flags older proposal language, unsupported/current qualification claims, unverified partner status, and the dated FDEP attribute-vs-geometry correction. This targeted review does not certify current company qualifications. People was not loaded.

Private inputs, exact unmodified model responses, provider-reported usage, input/response hashes, and local diagnostic scripts are in `.isa-local/company-evidence-8lxYBinQ/`; none are tracked. The private review notes identify specific source locations without putting the company material into Git.

## Measured outcomes

| Scenario | Evidence | Validated outcome |
| --- | --- | --- |
| Clear healthcare-provider portal | Invented RFP; real archived company evidence | 93, Strong Pursue; actual HCP precedent, all six gates pass. |
| Same healthcare business packet again | Same opportunity, evidence, date, and model | 93 again. The serialization instructions were clarified between calls; this is not identical-prompt repeatability proof. |
| $5,000 project | Invented RFP; real company evidence | Gate 5 fails; No-bid; no weighted total. |
| Three separate government references | Invented RFP; real company evidence; no documented qualified partner | Gate 6 fails; No-bid; no weighted total. Commercial clients were not counted as government references. |
| Virgin Islands MDR | Four actual saved buyer PDFs plus company evidence | Gate 2 fails: ongoing managed security operations, not custom software development. No-bid; submission/qualification gaps remain unknown, not fabricated passes. |
| Missing mandatory Appendix A/SOW | Invented RFP explicitly referring to an absent buyer document | AI identified the absent SOW and omitted scoring categories. After the document-check ordering fix, replay of that unmodified answer returns Needs documents, partial confidence, and no total. |

The healthcare breakdown was 25 case study, 15 agency, 15 stack, 8 AI, 10 deal, 10 compliance, 6 competitive, and 4 timeline. No landscape research was supplied; the model marked it insufficient and applied no wired deduction. That limitation remains explicit even when supplied solicitation text is complete.

The actual MDR deadline remained October 26, 2026 at 16:30 AST: 26 calendar days from September 30, four timeline points. Form approval dates were ignored. The three MDR reference letters were recognized as project-related, not an explicit three-government-reference requirement.

The MDR packet came from existing saved VM PDFs, not a new HigherGov/API download. It contained RFP, SOW, rating form, and mandatory-supporting-documents list. The pre-proposal invite's meeting access details were excluded from model inputs. The referenced contract template was not in that saved set; no complete-package claim or pursue score is made for MDR.

All six successful real-model judgments above were replayed, unchanged, through the final local validator. This replay makes no new API requests. It proves final validation of those answers, not a new end-to-end model run after every code edit.

## Failures found and local corrections

1. **Response-format drift and source mistakes.** Early output added Gate 2a/6a as extra gate keys, copied skill report sections, omitted required fields, or assigned an excerpt to the wrong source. Instructions now require the exact six-key gate object, subrules, flat citations, explicit bid status, and literal excerpts from the named source. Invalid answers still fail closed; no automatic repair/retry was added.
2. **Reasoning exhausted the response limit.** Two instrumented calls returned `stopReason: length` at 8,000 tokens; one used all 8,000 for reasoning with no answer. The bounded allowance is now 16,000 while retaining high reasoning and the 120-second timeout. Truncated/tool-call output remains rejected.
3. **Valid case-library proof was overly restricted.** Real model output used case studies to establish past delivery and commercial references. The validator now accepts actual company or case-study records for those facts. Named partner and current held-credential checks still require separate company evidence, including the named holder/date for credentials. A focused regression prevents a case-study credential sentence from bypassing that requirement.
4. **Missing documents were checked after categories.** The AI rightly omitted categories when the mandatory SOW was absent. The validator demanded eight categories before checking the document gap. Completeness/required-attachment checks now precede weighted-category validation on that route; a regression covers omitted categories.
5. **Attachment terminology was ambiguous.** The contract now distinguishes buyer-issued scoring material from bidder-created reference letters, cost proposals, and company certificates. An RFP merely referring to an attachment does not mean that attachment text was supplied.

No fabricated quote was accepted or rewritten to match the source. Diagnostic failures were retained, not discarded from the evidence record.

## Final local proof and remaining work

- `npm test`: 68/68 pass.
- `npm run rfp:alignment`: 31/31 synthetic cases; zero failed checks.
- `npm run check`: 16 scripts checked.
- `git diff --check`: pass.

Final helper hashes:

- Policy: `1b2aeef26008461a77482239560de875c2ebf727b52d84e26f4d2bf15bb5789a`.
- Judgment adapter: `ed12f5b66379c14763e38e7b66c67f2e0ff614ac80037ed815f70271c1182555`.

Still pending: current human-supported qualification facts where needed, an independent same-input run of Jake's actual workflow, near-50/75 stability checks, and batch latency/quota evaluation. Tested request times were roughly 41–83 seconds; a few examples do not establish scheduled-batch reliability. Source-valid quotes do not prove every model interpretation is correct.

No commit, push, merge, or VM release was performed. Prepare private-source provisioning and exact-file source deployment only on a separate request, with fresh drift checks and backups. Keep provider/document availability limits separate from scoring-policy alignment.
