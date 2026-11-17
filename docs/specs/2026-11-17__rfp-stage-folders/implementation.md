# Implementation record: RFP stage folders

What it does and when it refuses: [RFP workflow](../../domains/rfp/README.md), "Stage folders", and the [spec](spec.md). Released together with the staff list and the email recipients.

## What was merged

- **#54, stage folders:**
  - `scripts/rfp-stage.mjs` and `scripts/rfp-folders.mjs` (both new);
  - the Friday job saves a returning listing's documents into the RFP's existing folder in any tier;
  - the "RFP stage folders" rule in `AGENTS.md`;
  - seven non-scoring skills point at that rule;
  - tests in `devtools/rfp-stage.test.mjs`.
- **#55, staff list:** in ISA's `MEMORY.md`, Adan Aispuro is added to the people who have left. Peter Schepers, Marianne Faro, Tina Alringer and Nick Buchan are listed as current. `nurrea@seamgen.com` is named as Nicolas Urrea (Itility).
- **#56, recipients:**
  - the pursue email and the no-bid announcement go to Marianne and Sales only, and `AGENTS.md` now says the Friday email does too;
  - DemandStar is noted as also called OpenBids, with its password in Secret Server;
  - the fetch skill's OpenBids note became v1.12 when `main` was merged in after #54.

## Release, November 17

**What was deployed**
- Commit `c6c3b66` on `main`.
- Uploaded with `npm run live:deploy -- --apply` at 21:08 UTC.
- 16 files:
  - `AGENTS.md` and `MEMORY.md`;
  - `scripts/highergov-document-flow.mjs`, `scripts/weekly-rfp-pursue-decision.mjs`, and the new `scripts/rfp-folders.mjs` and `scripts/rfp-stage.mjs`;
  - 10 skills: fetch, refresh, calendar logging, engineering brief, submission email, pursue email, no-bid email, submission checklist, moonshot, proposal deck.
- None of the three skills loaded into the scoring prompt changed. Nothing was restarted.

**Before upload**
- `npm test` passed (242) and `npm run check` was clean.
- `live:pull` showed no VM changes since the accepted baseline, and only these 16 files differed.
- It was a Tuesday, outside the Friday job's window.

**After upload**
- `live:pull` showed no differences.
- On the VM, `node scripts/rfp-stage.mjs list` printed tiers 2–4 empty and 302 RFP folders in Scored.
- A move without `--by` refused with "Nothing changed."
- `RFPs/` still holds only `1-pre-submission/`.

**Backup:** `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-11-17T21-08-27-987Z-c6c3b66`. To roll back, copy the 14 changed files back from its `original/` folder, and delete `scripts/rfp-folders.mjs` and `scripts/rfp-stage.mjs`. Any RFP moved before a rollback stays in its tier folder. The old Friday job also looks in every tier when reading documents back, but it would save a returning listing's documents into a new tier-1 folder.

## Not yet observed

- **ISA's chat moving an RFP on request:** whether it runs the script with `--by` and the name of the person who asked, and answers "what are we working on" from `list`.
- **The first Friday run with the change, November 20.** No RFP has been moved yet, so it should save documents exactly as before.
- **A listing coming back after its RFP was moved.** This should add documents to the moved folder, not a new tier-1 copy. It has only been tested offline.
