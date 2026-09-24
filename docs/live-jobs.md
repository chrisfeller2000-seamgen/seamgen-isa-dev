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

The cron job payloads and OpenClaw scheduler database have not been imported. Before a full local or development-environment run, define safe non-production job configuration separately and disable outbound side effects.
