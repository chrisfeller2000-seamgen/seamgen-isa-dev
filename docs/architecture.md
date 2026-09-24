# Architecture

ISA currently has three distinct places to think about:

1. **Live Azure VM.** OpenClaw runs with its own state, credentials, Telegram channel, and scheduled jobs. Its workspace is `/home/azureuser/.openclaw/workspace`. The VM remains the running system; GitHub does not deploy to it automatically. [Runtime inventory](runtime.md) and [live jobs](live-jobs.md) are dated observations, not a runnable export.
2. **This development repository.** `workspace/` holds an approved, versionable subset of VM source: agent instructions, `scripts/`, `skills/`, and `tools/`. `devtools/live-files.json` defines the import boundary. `devtools/isa-live.mjs` compares, imports, previews, and deliberately uploads changed source files. The repo excludes the scheduler database, live configuration, secrets, conversations, reports, and customer RFP files.
3. **Each developer's isolated local runtime.** `devtools/local-isa.mjs` installs matching Node/OpenClaw versions under ignored `.isa-local/`, copies tracked workspace source, and starts a loopback-only Gateway. Channels, cron, heartbeat, and agent shell/file tools are disabled. It is useful for basic chat and focused tests, not live integration parity.

## Main source paths

- `workspace/scripts/weekly-rfp-pursue-decision.mjs` coordinates HigherGov intake, preliminary scoring, optional document retrieval, qualification, report writing, email, and Telegram. `highergov-document-flow.mjs` handles document records, local files, and manifests. The offline fixture is `devtools/rfp-fixture.test.mjs`.
- `workspace/scripts/daily-mail-hubspot-sync.mjs`, `weekly-current-year-sales-report.mjs`, and `weekly-reengagement-outreach-advice.mjs` are separate scheduled sales jobs. `hubspot-leads-sidecar.mjs`, `outreach-flow.mjs`, and `sales-golden-rules.mjs` provide shared logic.
- `workspace/skills/` contains ISA-facing RFP and proposal instructions; those documents do not prove that every step is wired into a script or scheduled job. `workspace/tools/` has PowerShell helpers and HigherGov configuration.
- `devtools/isa-live.mjs` owns guarded VM source transfer. `devtools/local-isa.mjs` owns local runtime isolation. `package.json` exposes the supported developer commands.

## Boundaries that matter

Keep source changes in Git, review them, and compare against fresh VM state before upload. Never treat a local model response or syntax check as proof that HigherGov, HubSpot, Gmail, Drive, Telegram, or the OpenClaw scheduler worked. Generated candidate folders, document resources, reports, and watermarks are runtime data, not source to import into Git. See [RFP](domains/rfp/README.md), [integrations](integrations.md), and [deployment](deployment.md).
