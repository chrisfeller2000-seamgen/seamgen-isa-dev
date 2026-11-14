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
