# ISA implementation plan: [name]

## Approach and alternatives

Explain the chosen change and why it fits the affected job/skill. State what remains on the VM or in a human workflow.

## Source and insertion points

Name the files/functions to inspect and change, with ownership and order. Do not paste the implementation into the plan.

## Invariants and side effects

Identify RFP evidence gates, CRM identity/stage rules, intake watermarks, mail/Telegram/Drive effects, or other task-specific constraints. State how a failed partial run resumes safely.

## Context to keep beside code

Which external contract, exception, or safety decision must remain understandable after this plan is gone? Use concrete ISA terms; do not pre-plan comments for methods that do not exist yet.

## Verification and release boundary

List offline fixtures, syntax/source checks, any non-production integration probe, and the distinct live check needed after an authorized deployment. Include rollback evidence for VM changes.
