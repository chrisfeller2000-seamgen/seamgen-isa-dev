# Implementation record: score an RFP when its scope was read

## Model check, November 13

**How it ran**
- Branch commit `22bdb6f`, run on the VM from a temporary copy (`/tmp/isa-scope-check`, since removed).
- One-off runner, like `devtools/score-sample.mjs`: it read the saved documents in each RFP's `resources/` folder, scored them with this branch's code and skills (`rfp-scoring-skill.md` v1.13), and wrote and sent nothing.
- Model: `openai/gpt-6.1-sol`, the live configuration. Each RFP was scored at its original run date.

**Where the RFP details came from**
- This week's 7 RFPs: the live `candidate.md`.
- The November 6 and October 23 RFPs: their candidate files had been pruned from `RFP-pipeline/candidates/`, so a stub was rebuilt from that week's audit record (title, agency, listing due date, budget range, listing text). The stub has no agency type, set-aside or NAICS fields. The documents themselves were the saved originals.

**Model calls:** 14 for 13 RFPs. Montgomery College was retried once for `competitive.evidence`, which is unrelated to this change. No answer was rejected for `scopeRead` or `scope`.

| RFP | Before (audit) | Scope read? | Now | Matches spec |
| --- | --- | --- | --- | --- |
| MA DHE Student Portal RFQ | Couldn't check yet | Yes (RFQ, Attachment A) | **Strong Pursue, 85** | Yes |
| Guilford Tech Academic Operations | Couldn't check yet | Yes (RFP) | Ask the agency (Gate 2a, Q&A open), 74 if yes | Yes: scored |
| Wendell Citizen Request Management | Couldn't check yet | Yes (RFP) | Ask the agency (Gate 2, Q&A open), 72 if yes | Yes: scored |
| Danville Enterprise Technology Management | Couldn't check yet | Yes (RFP Section 2.1) | Ask the agency (Gate 2, Q&A open), 70 if yes | Scored; see note 2 |
| Lexington County Records Management (Nov 6) | Couldn't check yet | Yes (specifications) | Ask the agency (Gate 2, Q&A open), 79 if yes | Yes: scored |
| Montgomery College Ticketing (Nov 6) | Couldn't check yet | Yes (RFP) | Ask the agency (Gate 2a, Q&A open), 71 if yes | Yes: scored |
| U Michigan MLOps Infrastructure | Couldn't check yet | No: event summary | Needs documents | Yes |
| East Hartford Family Communications | Couldn't check yet | No: cover sheet | Needs documents | Yes |
| Dallas ISD Special Education Records | Couldn't check yet | No: forms and terms only | Needs documents | Yes |
| RI Alert Warning System (Nov 6) | Couldn't check yet | No: specifications missing | Needs documents | Yes |
| RI CCRI One-Card (Nov 6) | Couldn't check yet | No: specifications missing | Needs documents | Yes |
| UConn Time and Effort Reporting (Nov 6) | Couldn't check yet | No: portal summary | Needs documents | Yes |
| RI DOH PDMP (Oct 23, regression) | **Strong pursue** | No: specifications missing | **Needs documents** | Yes |

## Notes

1. The 6 scored RFPs other than the Student Portal now reach the Ask the Agency route. That route is unchanged, so they show as "Ask the agency first" with a score-if-yes, not "Couldn't check yet". With Gates 4 and 6 still open, the existing conditional rule keeps them at Needs review (`conditionalOutcome`, "Not a shortcut around unknown submission access, eligibility, or project size").
2. **Danville.** The model did not list the evaluation workbook as scope, so there was no "part of the scope wasn't read" blocker. Its `scopeRead.reason` names the workbook as unread. The spec expected the blocker. The result is the same either way, because Danville goes to Ask the Agency.
3. **The blocker path is untested on real data.** No real case produced `missing_scope`, so that path is covered only by the offline tests.
4. **An existing wording problem.** The Student Portal's first report blocker reads "No current company record establishes it." The Gate 6 sentence extraction drops the subject (ITS81 Category 3 membership). This predates the change and belongs in a separate fix.

   Fixed in #48 (`openIssue` in `rfp-report.mjs`): a gate reason "X, but Y" is kept whole when X states the requirement or Y points back to it. The blocker now reads "ITS81 Category 3 membership is mandatory, but no current company record establishes it."

## Release, November 13

**What was deployed**
- Commit `8e35527` on `main`: #47 (this change) and #48 (the blocker wording fix).
- Uploaded with `npm run live:deploy -- --apply` at 21:57 UTC.
- Four files: `scripts/rfp-report.mjs`, `scripts/rfp-scoring-judgment.mjs`, `scripts/rfp-scoring-policy.mjs`, `skills/rfp-scoring-skill.md` (v1.13).
- Nothing was restarted. The Friday job loads these files fresh on each run.

**Before upload**
- `npm test` passed (232) and `npm run check` was clean.
- `live:pull` showed no VM changes since the accepted baseline, and only these four files differed.
- No RFP job was running on the VM.

**After upload**
- `live:pull` showed no differences between the repo and the VM.
- The three scripts load on the VM.
- The deployed files contain `scopeRead`, the blocker fix, and skill v1.13.

**Backup:** `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-11-13T21-57-08-977Z-8e35527`. To roll back, copy the four files back from it; the tool doesn't do this automatically.

**Not yet observed:** no scheduled run has used the new code. The first is the Friday job on November 20 at 12:00 UTC (`run-new-rfp-qualification-cron.sh`). Compare its audit (`npm run rfp:audit -- 2026-11-20`) with November 13's:
- how many RFPs were read at full text but still stopped at Needs documents, and their `scopeRead` reasons;
- any answers rejected at `scopeRead`;
- whether open-gate blockers read as whole sentences.
