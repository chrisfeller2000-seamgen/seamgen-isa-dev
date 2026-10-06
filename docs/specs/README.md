# Task specs

## Active local specs

- [Complete Jake scoring alignment](2026-09-30__jake-scoring-alignment-minimal/spec.md): shared AI scoring from `test/rfp-rubric-alignment`, released to the VM October 6 with documents fetched at a preliminary 50+. Real-model checks, the release record and rollback are in the [implementation record](2026-09-30__jake-scoring-alignment-minimal/implementation.md); the first scheduled run is October 9.
- [Weekly RFP update the sales team can act on](2026-10-06__rfp-weekly-messages/spec.md): one scheduled run; a Friday Telegram message ISA writes in its own voice from checked facts (up to three picks, questions for the team, the biggest skipped RFP); an email organized by decision; a failure notice; and chat access to the week's results. Spec on `feat/rfp-weekly-messages`; not implemented.
- [RFP deadline selection and scoring](2026-09-30__rfp-deadline-scoring/spec.md): three-file patch deployed September 30 from `docs/rfp-deadline-scoring`; isolated VM checks passed, normal production job not run.
- [Secondary scorer: no final score without the solicitation](2026-10-05__rfp-needs-documents/spec.md): three-file patch deployed October 5 from `fix/rfp-evidence-gate`; post-deploy checks passed, normal secondary job not run since.

Use one folder on the task branch for a substantial ISA feature, bug, or investigation: `YYYY-MM-DD__short-kebab-name/`. Start from [`_template/`](./_template/) and keep scope, evidence, and acceptance criteria next to the work. Small fixes do not require a three-file spec.

For VM-facing work, distinguish the source change from any scheduler/config change and record which tests are offline, which need safe integration credentials, and which require a controlled live check. Do not paste raw customer RFPs, CRM responses, secrets, or logs into a spec.

When the work is finished, promote lasting rules to [RFP](../domains/rfp/README.md), [sales](../domains/sales-operations/README.md), or [architecture](../architecture.md); archive a useful completed spec under [`archive/`](archive/README.md) through normal Git review.
