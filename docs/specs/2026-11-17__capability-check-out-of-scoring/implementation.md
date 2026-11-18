# Implementation record: capability verification leaves the scoring prompt

## Why

`rfp-capability-verification-skill.md` was one of four skill files pasted into the Friday scoring prompt (`policyNames` in `workspace/scripts/rfp-scoring-judgment.mjs`). It writes a checklist and a message for a named engineer, and the scored answer has no field for it. Being in the prompt meant any edit to it changed scoring. It is now a chat step only, to be offered after a Strong Pursue or a move to Looking closer. The solution-landscape skill stays in the prompt, because it feeds Category 7.

Category 1's rule that a case study must name the actual project is in the scorer's `SYSTEM_RULES`, so it doesn't depend on this skill.

## Model check, November 17

**How it ran**
- Two temporary copies on the VM under `/tmp/isa-capcheck`, since removed: `before` from `main` (`b035167`), whose scoring code matched the VM's byte for byte, and `after`, the same with this branch's `rfp-scoring-judgment.mjs`.
- `devtools/score-sample.mjs --date 2026-11-13`, run from each copy with `WORKSPACE_DIR` set to the live workspace. It read each RFP's `candidate.md` and saved `resources/` documents and the live skills, made one model call per RFP, and wrote and sent nothing.
- Model: `openai/gpt-6.1-sol`, the live configuration. No RFP job was running. No answer was rejected and none failed.
- Six RFPs scored on full documents in the November 13 run: the week's only Strong Pursue, two Ask the Agency, one Deadline needs review and two No-bids. Most are custom development, where a capability claim matters most.

| RFP | Before | After | Same result |
| --- | --- | --- | --- |
| website-redesign-and-replacement-project | Strong Pursue, 78 | Strong Pursue, 79 | Yes |
| document-manager-and-workflow-automation | Ask the agency (2a), 73 if yes | Ask the agency (2a), 71 if yes | Yes |
| real-time-foot-traffic-analysis | Ask the agency (2), 64 if yes | Ask the agency (2), 65 if yes | Yes |
| hcjdc-systems-development-and-support-services | Deadline needs review, 63 | Deadline needs review, 63 | Yes |
| boulder-hbsc-roadmap-web-development-database-management-and | No-bid, Gate 6 | No-bid, Gate 6 | Yes |
| website-migration-and-consolidation-project | No-bid, Gate 2 | No-bid, Gate 2 | Yes |

Every RFP kept its tier and the same gates passed, failed or stayed open, with the same blockers. Scores moved by 2 points or less, within the usual run-to-run variation of about 5 points.

## Tests

- `devtools/rfp-skill-files.test.mjs` pins the three skills the scorer sends.
- `devtools/fixtures/rfp-recorded-judgments.mjs` reads the scorer's exported `policyNames` instead of keeping its own copy.

## Release

Not deployed. The upload is one file, `scripts/rfp-scoring-judgment.mjs`. Nothing needs a restart, because the Friday job loads it fresh on each run.
