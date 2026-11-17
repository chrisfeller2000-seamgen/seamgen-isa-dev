# Implementation record: Tuesday RFP document check

What it does and when it refuses: [RFP workflow](../../domains/rfp/README.md), "Tuesday document check", and the [spec](spec.md). Merged in #58.

## Release, November 17

**What was deployed**
- Commit `cd4dd00` on `main` (#58).
- Uploaded with `npm run live:deploy -- --apply` at 22:35 UTC.
- 11 files:
  - `AGENTS.md`;
  - `scripts/highergov-document-flow.mjs`, `rfp-audit.mjs`, `rfp-folders.mjs`, `rfp-report.mjs`, `rfp-stage.mjs` and `weekly-rfp-pursue-decision.mjs`;
  - the new `scripts/rfp-refresh.mjs` and `scripts/run-rfp-refresh-cron.sh`;
  - `skills/rfp-document-fetch-skill.md` and `skills/rfp-document-refresh-skill.md`.
- None of the skills loaded into the scoring prompt changed. Nothing was restarted.

**Before upload**
- `npm test` passed (258) and `npm run check` was clean.
- `live:pull` showed no VM changes since the accepted baseline, and only these 11 files differed.
- No RFP job was running.

**After upload**
- `live:pull` showed no differences.
- `bash -n` passed on the new wrapper.
- `rfp-refresh.mjs --scheduled` ran in preview on an empty temporary workspace. It checked 0 RFPs, made no HigherGov, Drive or Telegram call, and wrote its report there.
- `rfp-stage.mjs list` showed tiers 2–4 empty and 302 folders in Scored.

**Backup:** `/home/azureuser/.openclaw/workspace/backups/dev-deploy-2026-11-17T22-34-57-912Z-cd4dd00`. To roll back the files, copy the nine changed files back from its `original/` folder, and delete `scripts/rfp-refresh.mjs` and `scripts/run-rfp-refresh-cron.sh`. Remove the crontab line first.

## Crontab, November 17

- **The schedule is Pacific.** The crontab sets `CRON_TZ=America/Los_Angeles`. The spec's "15:00 UTC" was installed as **`0 7 * * 2`**, 7:00 a.m. Pacific (15:00 UTC in winter, 14:00 in summer). The Friday line `0 12 * * 5` is therefore noon Pacific; the docs had called it 12:00 UTC.
- **Line added at 22:41 UTC:**
  `0 7 * * 2 /bin/bash /home/azureuser/.openclaw/workspace/scripts/run-rfp-refresh-cron.sh >> /home/azureuser/.openclaw/workspace/reports/rfp-refresh/cron.log 2>&1`
- `reports/rfp-refresh/` was created first, because cron's redirect fails if the folder is missing.
- The previous crontab is saved in `backups/crontab-2026-11-17T22-41-11Z.txt`. The existing lines are unchanged.

## Not yet observed

- **The first scheduled Tuesday, November 24.** With no RFP in Looking closer or Building, it should check nothing and send nothing.
- **The first real refresh:** a moved RFP checked against HigherGov, a download, a Drive upload, and a Telegram message.
- **A preview run on the VM** once an RFP has been moved: `RFP_REFRESH_DELIVERY=preview node scripts/rfp-refresh.mjs --scheduled`.
- **The Friday changes, first live on November 20:**
  - agency documents only to Drive;
  - the "already being worked on" list;
  - forwarded-RFP matching.

  With no RFP moved, the first two make no difference that week.
