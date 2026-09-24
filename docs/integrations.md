# External integrations

This repo contains code and instructions for several outside systems, but no production credentials. The live VM owns its own integration state. A local model response or offline fixture does not verify these providers.

| System | Source entrypoints | Development boundary |
| --- | --- | --- |
| OpenAI/OpenClaw | `devtools/local-isa.mjs`, `workspace/AGENTS.md`, `workspace/skills/` | The local agent uses a developer-linked `OPENAI_API_KEY` and isolated state. Its auth route may differ from live ISA. |
| HigherGov | `workspace/scripts/weekly-rfp-pursue-decision.mjs`, `highergov-document-flow.mjs`, `workspace/tools/Get-HigherGovOpportunities.ps1` | `HIGHERGOV_API_KEY` is external. Mock opportunity/document responses for local tests; verify real document availability separately. Empty rows or portal gating are not full-text evidence. |
| HubSpot | `daily-mail-hubspot-sync.mjs`, `hubspot-leads-sidecar.mjs`, sales reports, RFP duplicate check | Live scripts use HubSpot MCP and/or API sidecar credentials. Reads and writes must be tested separately, with pipeline/stage IDs and duplicate behavior checked. |
| Google Gmail/Drive | `gog` calls in RFP and sales scripts; `workspace/tools/Sync-RfpToDrive.ps1` | Live account/keyring are outside Git. Normal job runs may send mail or upload resources. Use fixtures and explicit non-production accounts for integration tests. |
| Telegram | `openclaw message send` in scheduled scripts | Local channels are disabled. `NO_TELEGRAM=1` only stops Telegram, not other job effects. |
| Slack | `workspace/tools/Send-SlackMessage.ps1` and proposal materials-request skill | The tools README references additional setup files absent from this source snapshot. Verify the actual app/token and preview behavior before using it. |

The [runtime inventory](runtime.md) records an installed Tavily package on the VM, but does not establish its live configuration or tests. Do not add real keys, signed document URLs, customer payloads, or provider responses to docs or fixtures. See [security](security.md) and [local development](workflows/local-development.md).
