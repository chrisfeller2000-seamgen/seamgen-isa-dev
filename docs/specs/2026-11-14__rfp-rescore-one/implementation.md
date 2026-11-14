# Implementation record: rescore one RFP mid-week

What it does and when it refuses: [RFP workflow](../../domains/rfp/README.md), "Rescoring one RFP mid-week". Built in #52 after City of Laguna Beach's website redesign was held back on November 13 by the Gate 2a misread fixed in #50 ([Gate 2a record](../2026-11-13__rfp-gate2a-demos/implementation.md)).

## Model check, November 14

- **Setup:** branch `feat/rfp-rescore-one`, run on the VM in `/tmp/isa-rescore-check`, since removed. Its workspace had copies of the November 13 report files and Laguna's `candidate.md`; everything else, the `RFPs/` documents included, was linked read-only.
- **Step 1:** Strong pursue, 78, in about 2.5 minutes. Only the pending file was written.
- **`--apply`:**
  - 1 Strong Pursue (was 0), with the Drive folder link;
  - `latest.json` matched `2026-11-13.json`;
  - email `none`, Telegram `sent`, both unchanged;
  - one line in `audit/2026-11-13-rescores.jsonl`;
  - `candidate.md` read Strong Pursue / 78;
  - the pending file was removed.
- **Live files:** the live `latest.json` and Laguna's `candidate.md` had the same checksums before and after.
- **Fixed after the check:** the "before" side showed "Ask the agency first, 78", but 78 was only what Laguna could reach. An RFP that wasn't picked now shows no score.
- **Fixed in CI:** the guard against running alongside the Friday job saw weekly jobs other tests had started in parallel. It now only counts a job on the same workspace (`5aca8c3`).

## Release, November 14

**What was deployed**
- Commit `4f83b0d` on `main` (#52).
- Uploaded with `npm run live:deploy -- --apply` at 01:48 UTC.
- Four files: `AGENTS.md`, `scripts/rfp-report.mjs`, `scripts/rfp-rescore.mjs` (new), `scripts/weekly-rfp-pursue-decision.mjs`. Nothing was restarted.

**Before upload:** `npm test` passed (235) and `npm run check` was clean. `live:pull` showed no VM changes since the accepted baseline, and only these four files differed. No RFP job was running.

**After upload:** `live:pull` showed no differences, the four RFP scripts load on the VM, and `AGENTS.md` has the rescore rule.

**Backup:** `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-11-14T01-48-12-213Z-4f83b0d`. To roll back, copy the three changed files back from its `original/` folder and delete `scripts/rfp-rescore.mjs`.

## First use: City of Laguna Beach, November 14

On request, the rescore was run on the live VM with the Drive folder the team made by hand.

- **Step 1:** Ask the agency first, no score → **Strong pursue, 77**. The earlier check gave 78; scores move a few points between runs.
- **Blockers given:**
  - references: three similar-service ones, with local-government references favored;
  - PlanetBids access. Seamgen has the account, but company facts don't record portal accounts yet.
- **`--apply`:**
  - the November 13 report and `latest.*` show 1 Strong Pursue, with the Drive link and the "Rescored after the Friday run" note;
  - email `none` and Telegram `sent`, unchanged;
  - `audit/2026-11-13-rescores.jsonl` has 1 line, and the week's audit is still 301 lines;
  - `candidate.md` reads Strong Pursue / 77.
- **Not sent by ISA:** the pursue email for Laguna was sent by hand.

**Not yet observed:** ISA's chat using the script, or answering about Laguna from the updated report.
