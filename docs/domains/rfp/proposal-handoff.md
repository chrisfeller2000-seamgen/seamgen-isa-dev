# RFP proposal handoff

## Purpose and source

After qualification, ISA's RFP skills describe engineering briefs, submission checklists, materials requests, agency questions, pursue/no-bid emails, and rough proposal decks. The entrypoints are the relevant Markdown files in `workspace/skills/`, especially `skills/rfp/engineering-brief/instructions.md`, `skills/rfp/submission-checklist/instructions.md`, and `skills/rfp/proposal-deck/instructions.md`. These are instructions for ISA and teammates; this repository does not prove that a scheduled job executes each step.

## Rules to preserve

- A positive score is not approval to submit. A human pursue decision and review of actual solicitation requirements should precede proposal work.
- Ground claims, dates, pricing, capability, case studies, and compliance statements in the RFP and verified Seamgen materials. The rough-deck skill explicitly distinguishes filled content from visible placeholders and material that must be gathered by people.
- Keep drafts and customer documents in controlled runtime/project storage, not this source repo. Review outbound emails, Slack messages, Drive uploads, and submissions before sending.

## Known sharp edge

ISA has no Slack connection. Materials requests and capability checks are drafted as plain text for the person who asked to approve and paste into Slack themselves. `workspace/tools/README.md` describes PowerShell helpers from a Windows laptop setup; treat it as a workflow note to verify, not proof that those tools are installed or configured on the VM. See [RFP overview](README.md), [security](../../security.md), and [integrations](../../integrations.md).
