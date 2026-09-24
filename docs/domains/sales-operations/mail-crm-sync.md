# Mail-to-HubSpot sync

`workspace/scripts/daily-mail-hubspot-sync.mjs` reads relevant Gmail messages, relates them to HubSpot contacts, leads, deals, and RFP stages, writes a local run report/state, and can post a Telegram summary. `hubspot-leads-sidecar.mjs` is the API client used for lead snapshots and actions.

## Invariants

- Preserve message-id tracking and the last successful run when changing intake logic; duplicate processing can create or move the wrong CRM records.
- Distinguish observed mail intent from a confirmed sales stage. Changes to sender filters, recipient checks, stage mapping, or association logic need realistic synthetic cases and a reviewed live verification plan.
- The script's report/backfill state lives under runtime `reports/daily-mail-hubspot-sync/`, not Git. The backfill summary's “dry run” text does **not** make the whole main job a safe dry-run command.

The normal entrypoint has Gmail/HubSpot/Telegram side effects and no isolated fixture in this repo. Use [local development](../../workflows/local-development.md) to add a test seam before running it outside the VM. See [sales overview](README.md).
