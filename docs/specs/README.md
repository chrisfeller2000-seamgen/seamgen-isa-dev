# Task specs

## Active local specs

- [RFP deadline selection and scoring](2026-09-30__rfp-deadline-scoring/spec.md): implemented and tested locally on `docs/rfp-deadline-scoring`; not deployed.

Use one folder on the task branch for a substantial ISA feature, bug, or investigation: `YYYY-MM-DD__short-kebab-name/`. Start from [`_template/`](./_template/) and keep scope, evidence, and acceptance criteria next to the work. Small fixes do not require a three-file spec.

For VM-facing work, distinguish the source change from any scheduler/config change and record which tests are offline, which need safe integration credentials, and which require a controlled live check. Do not paste raw customer RFPs, CRM responses, secrets, or logs into a spec.

When the work is finished, promote lasting rules to [RFP](../domains/rfp/README.md), [sales](../domains/sales-operations/README.md), or [architecture](../architecture.md); archive a useful completed spec under [`archive/`](archive/README.md) through normal Git review.
