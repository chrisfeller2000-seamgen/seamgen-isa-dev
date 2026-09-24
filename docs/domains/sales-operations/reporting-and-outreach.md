# Sales reporting and reengagement advice

`workspace/scripts/weekly-current-year-sales-report.mjs` builds a rolling sales/RFP pipeline report from HubSpot, saves report files, sends email through `gog`, and posts a Telegram summary unless disabled. `weekly-reengagement-outreach-advice.mjs` selects prior customers/leads, builds advice, writes a report, and can send email and Telegram. `outreach-flow.mjs`, `reengagement-outreach-agent.mjs`, and `sales-golden-rules.mjs` hold supporting logic.

## Invariants and test boundary

- Report counts, stages, recency windows, owners, and dates should come from current HubSpot data, not a model guess. Check the rendered report and intended recipients before any live send.
- Separate *advice* from *outreach sent*. A recommendation appearing in a report does not prove that mail was delivered or a HubSpot record changed.
- `REENGAGEMENT_DRY_RUN=1` suppresses the reengagement job's email/Telegram send path, but the script still reads live services and writes local report files. `NO_TELEGRAM=1` only suppresses Telegram; it does not suppress Gmail or HubSpot access. The weekly sales report has no general offline test mode in this repo.

These jobs do not yet have synthetic end-to-end tests here. Add narrow fixtures before relying on local runs; compare live behavior separately. See [sales overview](README.md), [integrations](../../integrations.md), and [security](../../security.md).
