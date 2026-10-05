# Task specs

## Active local specs

- [Complete Jake scoring alignment](2026-09-30__jake-scoring-alignment-minimal/spec.md): shared AI scoring on `test/rfp-rubric-alignment`, merged October 5 with the deployed evidence gate and a fix for the preliminary contract. Offline tests pass; a bounded real-model batch, the company-file upload, and release remain pending. Earlier model checks are in the [implementation record](2026-09-30__jake-scoring-alignment-minimal/implementation.md).
- [RFP deadline selection and scoring](2026-09-30__rfp-deadline-scoring/spec.md): three-file patch deployed September 30 from `docs/rfp-deadline-scoring`; isolated VM checks passed, normal production job not run.
- [Secondary scorer: no final score without the solicitation](2026-10-05__rfp-needs-documents/spec.md): three-file patch deployed October 5 from `fix/rfp-evidence-gate`; post-deploy checks passed, normal secondary job not run since.

Use one folder on the task branch for a substantial ISA feature, bug, or investigation: `YYYY-MM-DD__short-kebab-name/`. Start from [`_template/`](./_template/) and keep scope, evidence, and acceptance criteria next to the work. Small fixes do not require a three-file spec.

For VM-facing work, distinguish the source change from any scheduler/config change and record which tests are offline, which need safe integration credentials, and which require a controlled live check. Do not paste raw customer RFPs, CRM responses, secrets, or logs into a spec.

When the work is finished, promote lasting rules to [RFP](../domains/rfp/README.md), [sales](../domains/sales-operations/README.md), or [architecture](../architecture.md); archive a useful completed spec under [`archive/`](archive/README.md) through normal Git review.
