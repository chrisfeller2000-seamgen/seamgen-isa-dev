# Sales operations

ISA's sales jobs connect mail activity and HubSpot records, prepare a rolling sales report, and produce reengagement advice. See [mail-to-CRM sync](mail-crm-sync.md) and [reporting and outreach](reporting-and-outreach.md).

These are distinct jobs in `workspace/scripts/`; their observed live schedules are listed in [live jobs](../../live-jobs.md). The scripts use HubSpot, Google mail, and Telegram and may change external state. This repo does not have an offline end-to-end fixture for them yet. Do not use a direct script run as a harmless local test.

Keep leads, deals, owners, pipeline stages, message history, and report recipients grounded in actual CRM/mail data. A generated recommendation is not a sent outreach message or a verified HubSpot update. See [integrations](../../integrations.md) and [security](../../security.md).
