# RFP workflow

ISA's RFP pillar turns HigherGov opportunities into candidate records, scores likely fits, tries to collect solicitation evidence, and prepares pursue-decision material. Proposal skills cover later human-led work. Read [document qualification](document-qualification.md) for the automated job and [proposal handoff](proposal-handoff.md) for the downstream skill set.

## Main flow

The weekly job in `workspace/scripts/weekly-rfp-pursue-decision.mjs` runs intake, scores candidate metadata, optionally fetches documents for candidates above the preliminary threshold, then applies fuller qualification and prepares a report. Its normal path writes runtime candidate/report state and can use HubSpot, Drive, Gmail, and Telegram. `workspace/tools/Get-HigherGovOpportunities.ps1` and the RFP skills describe related workflows, but do not assume they are the exact implementation of the scheduled Node job.

## Invariants and sharp edges

- A metadata score is provisional; it must not be presented as document-backed qualification. Track `document_status`, `qualification_status`, and `scoring_confidence` separately.
- The real solicitation and required scoring attachments matter. Empty or portal-gated document sets cannot become full-text simply because HigherGov returned a listing or a public summary.
- Candidate and `resources/` folders are runtime/customer data, not versioned source. The document manifest should describe what was returned, saved, extracted, blocked, or missing without storing credentials or signed links.
- RFP skills are not all consistent with current code: in this snapshot, `rfp-document-fetch-skill.md` is byte-identical to `rfp-document-refresh-skill.md` and identifies itself as refresh. Verify the intended fetch procedure before relying on that file.

The only automated local RFP test currently in this repo is the synthetic document-flow fixture in `devtools/rfp-fixture.test.mjs`. It does not prove real portal access or the complete weekly job. See [integrations](../../integrations.md) and [security](../../security.md).
