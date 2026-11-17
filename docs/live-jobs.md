# Live recurring jobs (read-only inventory)

Observed through `openclaw cron list --all --json` on September 24, 2026. This is documentation of the live scheduler, not a runnable export or a source of truth. One-off customer follow-ups are intentionally omitted.

| Job | Observed schedule | Enabled |
| --- | --- | --- |
| Cron jobs registry guard | Every hour | Yes |
| heartbeat-main | Every 30 minutes | Yes |
| Daily mail-HubSpot sync | 08:00 and 17:00 America/Los_Angeles | Yes |
| Memory Dreaming Promotion | 03:00 (job timezone not explicit in returned schedule) | Yes |
| New RFP qualification | Friday 12:00 America/Los_Angeles | Yes |
| Weekly Reengagement Outreach Advice | Monday 06:00 America/Los_Angeles | Yes |
| Weekly current year sales report | Monday 12:01 America/Los_Angeles | Yes |
| skill-collection-review-main | Every 7 days | Yes |

**Weekly RFP job (October 6).** The system crontab, not OpenClaw, runs `scripts/run-new-rfp-qualification-cron.sh` at `0 12 * * 5`. The crontab sets `CRON_TZ=America/Los_Angeles` (seen November 17, 2026), so that is **noon Pacific**, not 12:00 UTC as these docs said until then. The weekly script sends the email and the Telegram update itself. The OpenClaw "New RFP qualification" job above is an agent turn at noon Pacific. On September 18 and 25 it re-ran the weekly job, sending a second "0 RFPs" email and message, and on September 25 it overwrote that morning's report. It was disabled on October 6 (`openclaw cron disable 88d67daa-5c31-4383-aadb-ca9b846a98ae`; `openclaw cron list` hides disabled jobs, so use `--all`), so the crontab is the only scheduler. See the [weekly update spec](specs/2026-10-06__rfp-weekly-messages/spec.md). The wrapper also exports `RFP_POSTING_FETCH_ENABLED`, which is 0 until a measured run; at 1 the job requests agency postings anonymously when HigherGov has no documents ([posting spec](specs/2026-11-03__rfp-posting-documents/spec.md)).

**Tuesday document check (installed November 17, 2026).** The system crontab runs `scripts/run-rfp-refresh-cron.sh` at `0 7 * * 2`, 7:00 a.m. Pacific under the crontab's `CRON_TZ`, logging to `reports/rfp-refresh/cron.log`. It runs `rfp-refresh.mjs --scheduled` for the RFPs in Looking closer and Building, and posts to the sales group only when something changed. To turn it off, remove that line; the previous crontab is saved in `backups/crontab-2026-11-17T22-41-11Z.txt`. See [RFP workflow](domains/rfp/README.md), "Tuesday document check", and the [release record](specs/2026-11-17__rfp-tuesday-refresh/implementation.md).

The cron job payloads and OpenClaw scheduler database have not been imported. Before a full local or development-environment run, define safe non-production job configuration separately and disable outbound side effects.
