# Security and data boundaries

ISA handles sales and procurement information. The private dev repo is for reviewed source, not a backup of production state or customer records.

- Keep SSH keys, OpenClaw auth/state, `.env` values, HubSpot and Google credentials, Telegram/Slack tokens, signed download links, conversation history, and customer RFP documents outside Git. `.isa-local/` is ignored machine-local state; do not commit it or copy it between developers.
- `devtools/live-files.json` is the VM import allowlist. `devtools/isa-live.mjs` rejects unsafe paths and likely embedded secrets, but that scan is not a substitute for reviewing a diff before commit or upload.
- An OpenAI key linked for local chat is read from its existing file at startup. It is not copied into this repo; the owning API project pays for calls and receives model requests. Use an approved ISA project key for ongoing development instead of assuming a key from another project is suitable.
- Local OpenClaw binds to loopback and has channels, cron, heartbeat, and agent shell/file tools off. Do not copy live configuration or credentials into it to make a test pass.
- RFP candidates, `resources/`, reports, HubSpot responses, and Gmail data can contain private business/customer information. Build fixtures from invented data. If a real incident requires a sample, sanitize it and keep the original in approved storage.
- A developer's SSH access is not an approval for a coding agent to edit the VM. Use read-only inspection until a production change is explicitly requested; review exact targets, side effects, and rollback before upload or restart.

See [architecture](architecture.md), [integrations](integrations.md), and [deployment](deployment.md).
