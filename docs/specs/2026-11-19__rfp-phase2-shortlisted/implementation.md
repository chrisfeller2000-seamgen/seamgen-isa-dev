# Phase 2 renamed to Shortlisted

Phase 2 of the RFP phases was called "Looking closer". It's now **Shortlisted**, a one-word name like the other phases: Scored, Shortlisted, Building, Submitted. Phase 2 means the RFP is confirmed a good fit, but more information is needed before anyone writes the proposal.

## Why this name

- **Pursuing**, the first choice, was too close to the "Strong Pursue" tier and the "pursue email". The Friday offer would have read "move these Strong Pursue RFPs to Pursuing".
- **Qualified** clashes with the weekly job and report, which are both named "new RFP qualification".
- **Shortlisted** says the RFP made the cut without a commitment yet. It appeared in only one workspace file before the rename, so the router doesn't confuse it with other wording.

## What changed (#80)

- **Messages:** the Friday move offer (`rfp-report.mjs`), the router's phase names, move commands and "what's in…" lists (`rfp-route.mjs`), and the output of `rfp-stage.mjs`.
- **Move words:** `shortlisted` and `shortlist`, as a word or a verb. "Shortlist Carlsbad" moves the RFP to Phase 2. "Is Carlsbad shortlisted?" is a question and moves nothing. "Pursuing" isn't a move word, so "Are we still pursuing Pasco County?" stays a question.
- **Old names:** `looking` and "looking closer" still work, for existing habits and any `rfp:move:looking:` button already sent.
- **Unchanged:** the folder is still `RFPs/2-intermediate-stage/`, because renaming it would mean moving live folders on the VM. The skills' version-history lines and earlier specs keep the old name.

## Release (November 20, 2026 at 07:20 UTC)

Uploaded on the user's request after #80 merged. Commit `6febd1e` (the #80 merge).

**Before the upload:**
- `npm test` (289) and `npm run check` passed on `main`.
- `live:pull` showed no VM changes since the accepted baseline. The only differences were #80's 10 workspace files.

**Uploaded:** 10 files.
- `scripts/rfp-folders.mjs`, `rfp-report.mjs`, `rfp-route.mjs` and `rfp-stage.mjs`;
- comment-only changes to `scripts/rfp-refresh.mjs`, `run-rfp-refresh-cron.sh` and `weekly-rfp-pursue-decision.mjs`;
- `skills/rfp/INDEX.md`, and the document-fetch and document-refresh instructions.

`AGENTS.md` didn't change. The backup is `backups/dev-deploy-2026-11-20T07-20-17-509Z-6febd1e`. Nothing was restarted, and no scheduled job or crontab line changed.

**After the upload:** `live:pull` showed the VM matching `main`.

**Read-only checks on the VM:**
- The router read "what is in shortlisted" as a request to list the RFPs, and gave `rfp-stage.mjs list`.
- "Looking closer" is left only in the version-history lines of the calendar-dates and document-refresh skills.
- The seven Workshop skills outside Git (`agents/main/agent/workshop-skills/`, including `rfp-flow`) don't mention "Looking closer", `intermediate-stage` or Phase 2, so none needed an edit.

## First Friday run (November 20, 2026)

Checked read-only on the VM on November 23.

- **The run:** it finished at 16:39 UTC with 226 RFPs: 3 Strong Pursue, 3 Worth a look, 37 "Couldn't check yet" and 183 screened out. The pursue email and the Telegram summary both sent on the first attempt.
- **The offer:** the Telegram summary used the new name: "Want me to move any of these to Phase 2: Shortlisted". It named the South Carolina beachfront GIS app, University of Kentucky IT staffing, and UT Knoxville website and digital design.
- **Replies:** ISA's chat database shows no Telegram message reaching ISA between the offer and the check. Its most recent Telegram group session activity is from November 14.
- **Moves:** none. `RFPs/2-intermediate-stage/` doesn't exist, and `rfp-stage.mjs` creates it on the first move to Phase 2.

So the new wording is confirmed in a live message, but a real Phase 2 reply and the "moved from Scored to Shortlisted" output are still unseen. ISA's database can't show a group message that Telegram never delivered to it, so people may have replied in the group without ISA receiving it.
