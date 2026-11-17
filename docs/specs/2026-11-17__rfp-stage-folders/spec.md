# ISA task spec: RFP stage folders

## Problem and evidence

Eight of ISA's proposal skills (calendar logging, document refresh, engineering brief, submission checklist, submission email, moonshot integration, solution landscape, proposal deck) read or write `RFPs/2-intermediate-stage/`, `3-building/` or `4-submitted/`, and expect RFPs to be moved between them under "CLAUDE.md Rule 10". That file was Jake's and isn't in ISA's workspace. No code created those tiers or moved anything into them:

- `highergov-document-flow.mjs` always saved documents to `RFPs/1-pre-submission/<slug>/resources/`.
- `weekly-rfp-pursue-decision.mjs` only looked in the other tiers when reading documents back.
- A read-only listing of the VM on November 17, 2026 found `RFPs/1-pre-submission/` with 302 RFP folders, and no other tier.

So nothing recorded which RFPs Seamgen was working on. The calendar skill refuses any RFP in tier 1, so it refused every RFP. The refresh skill watches tiers 2 and 3, which were empty.

HubSpot's RFP pipeline was checked the same day as an alternative record, using read-only MCP tools on the VM. Of 54 deals, none are in "Qualified RFP" or "Response submitted", 48 are lost and 2 won. Nearly all stages were set in two bulk passes on August 13 and 20, 2026. No deal has been created since August 20. Stage-entry dates are switched off for that pipeline. HubSpot can't serve as the record.

## Desired behavior and acceptance

- [x] A script, `workspace/scripts/rfp-stage.mjs`, moves one RFP's whole folder to a named tier. It records who asked, when and why in `_stage.json`, and copies this week's `candidate.md` into the folder. `list` shows tiers 2–4.
- [x] An RFP moves only when someone asks. ISA's `AGENTS.md` tells its chat to run the script on request. The fetch skill asks before moving a 50+ RFP to tier 2, and the submission email asks before moving to tier 4.
- [x] Refusals change nothing: a missing `--by`, an unknown tier, the same tier, folders in two tiers, neither a folder nor a candidate file, or the Friday job running on the same workspace.
- [x] An RFP with no saved documents (a portal login, say) gets a folder in the requested tier if this week's candidate file exists.
- [x] The Friday job saves a returning listing's documents into the RFP's existing folder in whatever tier, latest first. Only an RFP with no folder gets a new tier-1 folder. A whole offline Friday run after a move proves there is no second tier-1 copy and that files someone added to the folder survive.
- [x] The non-scoring skills point at the rule in `AGENTS.md` instead of CLAUDE.md Rule 10.

## Out of scope

- Deploying to the VM. That needs an explicit deployment request.
- Clearing old tier-1 folders automatically. It's only safe once moving is routine.
- Editing `rfp-solution-landscape-skill.md`, `rfp-capability-verification-skill.md` and `rfp-scoring-skill.md`. All three are loaded into the Friday scoring prompt (`policyNames` in `rfp-scoring-judgment.mjs`), so their "Rule 10" mentions stay as they are, and this change doesn't alter scoring.
- Rewriting the refresh skill's browser-bridge and Drive steps.
- HubSpot: no deal is read or changed by the script.

## Constraints and risks

- A move is `fs.rename` of the whole directory, which is atomic within `RFPs/` on the VM's single filesystem. The candidate copy and `_stage.json` are written after it. If one of those writes fails, the folder has still moved and the error is printed.
- A moved RFP's `resources/` can still be reached by `rfp-rescore.mjs` and the Friday Drive upload, because both look in every tier.
- `Sync-RfpToDrive.ps1` already searches every tier.
- Rollback: revert the commit. Moved folders stay where they are. Moving them back to tier 1 with the script restores the old layout; the leftover `_stage.json` and `candidate.md` are harmless.

## References

- `workspace/scripts/rfp-folders.mjs`, `rfp-stage.mjs`, `highergov-document-flow.mjs`, `weekly-rfp-pursue-decision.mjs`
- `devtools/rfp-stage.test.mjs`
- [RFP workflow](../../domains/rfp/README.md), "Stage folders"; [data models](../../data-models.md)
