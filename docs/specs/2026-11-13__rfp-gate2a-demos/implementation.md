# Implementation record: a demo of the proposed design isn't a product tell

## Model check, November 13

**How it ran**
- Branch `fix/rfp-gate2a-demos`, uncommitted working tree (this record's change), run on the VM from `/tmp/isa-gate2a-check`, since removed.
- `devtools/score-sample.mjs --date 2026-11-13 --entries`: it read each RFP's live `candidate.md` and saved `resources/` documents, scored them with this branch's code, and wrote and sent nothing.
- Skills: `WORKSPACE_DIR` pointed at a temporary workspace with read-only links to the live workspace, except `skills/`, a copy of the live skills with `rfp-scoring-skill.md` replaced by v1.14. The scorer reads its skills from `WORKSPACE_DIR`, so without this the live v1.13 would have been used.
- Model: `openai/gpt-6.1-sol`, the live configuration. No RFP job was running. No answer was rejected and none failed.

| RFP | Before (Nov 13 audit) | Now | Pass |
| --- | --- | --- | --- |
| City of Laguna Beach Website Redesign | Ask the agency (2a), "looks like a product buy", 78 if yes | **Strong Pursue, 78**. Gate 2 passes; Gates 4 (PlanetBids access) and 6 (insurance, licences, municipal examples) open | Yes |
| Winston-Salem Document Manager | Ask the agency (2a), 71 if yes | Ask the agency (2a), 77 if yes: references must come from organizations already using the proposed solution | Yes: real 2a kept, new wording |
| University of Wyoming Event Management | Ask the agency (2a), 78 if yes | Ask the agency (**2**), 79 if yes: turnkey platform purchase | Yes, see note 1 |
| Canyons School District Visitor Management | Ask the agency (2a), 65 if yes | Ask the agency (**2**), 67 if yes: product ACR framing, no material custom share | Yes, see note 1 |
| Tempe Union Integrated Assessment | Ask the agency (2a), 72 if yes | **No-bid**: Gate 2 fails, and Gate 6 fails on five grades 9–12 school-district references | Yes, see note 2 |

## Notes

1. **Wyoming and Canyons moved from 2a to 2.** For Wyoming the model said "the demonstrations do not explicitly require an already-running product", so the new rule took the demo tell away. Both are still product purchases under Gate 2 and still go to the agency first, now worded "looks like a product buy", which fits them.
2. **Tempe became a No-bid.** That decision comes from Gate 6 (five school-district references with performance surveys), which this change doesn't touch. On November 13 the same model left Gate 6 open. It is run-to-run variation in the stricter direction, not a product buy getting through.
3. **Laguna is now a Strong Pursue at 78**, three points over the line. Scores move about 5 points between runs, so a Friday run could land it at Worth a look. Either way it is a pick, not "Couldn't check yet".
4. Laguna's questions are due November 17. The first scheduled run that could use this change is November 20, so this doesn't bring Laguna to sales in time by itself.

## Release, November 14

**What was deployed**
- Commit `477d703` on `main` (#50).
- Uploaded with `npm run live:deploy -- --apply` at 00:18 UTC.
- Three files: `scripts/rfp-report.mjs`, `scripts/rfp-scoring-judgment.mjs`, `skills/rfp-scoring-skill.md` (v1.14).
- Nothing was restarted. The Friday job loads these files fresh on each run.

**Before upload**
- `npm test` passed (232) and `npm run check` was clean.
- `live:pull` showed no VM changes since the accepted baseline, and only these three files differed.
- No RFP job was running on the VM.

**After upload**
- `live:pull` showed no differences between the repo and the VM.
- `rfp-report.mjs`, `rfp-scoring-judgment.mjs`, `rfp-scoring-policy.mjs` and `weekly-rfp-pursue-decision.mjs` load on the VM.
- The deployed files contain the Gate 2a rule, the `agencyVendor` wording, and skill v1.14.

**Backup:** `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-11-14T00-18-47-848Z-477d703`. To roll back, copy the three files back from its `original/` folder; the tool doesn't do this automatically.

**Not yet observed:** no scheduled run has used the new code. The first is the Friday job on November 20 at 12:00 UTC, which also carries the scope-read change (#47). Compare its audit (`npm run rfp:audit -- 2026-11-20`) with November 13's:
- the ask-the-agency entries, their `conditional.rule`, and whether any Gate 2a case cites only a demo of a proposed design or a third-party tool;
- that real product buys (ERP, HRIS, LMS and similar) still go to the agency or fail Gate 2, not to the picks;
- that Gate 2a entries read "asks for proof a product vendor would have".
