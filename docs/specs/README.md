# Task specs

## Active local specs

- [Complete Jake scoring alignment](2026-09-30__jake-scoring-alignment-minimal/spec.md): shared AI scoring from `test/rfp-rubric-alignment`, released to the VM October 6 with documents fetched at a preliminary 50+. Real-model checks, the release record and rollback are in the [implementation record](2026-09-30__jake-scoring-alignment-minimal/implementation.md); the first scheduled run is October 9.
- [Weekly RFP update the sales team can act on](2026-10-06__rfp-weekly-messages/spec.md): one scheduled run; a Friday Telegram message ISA writes in its own voice from checked facts (up to three picks, questions for the team, the biggest skipped RFP); an email organized by decision; a failure notice; and chat access to the week's results. Released to the VM October 6 from `feat/rfp-weekly-messages` (`a4d2658`), with the noon OpenClaw re-run disabled; first scheduled run October 9.
- [RFP updates in Jake's format](2026-10-12__rfp-pursue-email/spec.md): Jira ISA-6, built on `feat/rfp-pursue-email` and not deployed. ISA sends Jake's short pursue email itself, the Friday Telegram message becomes a summary of it, and the weekly summary email is dropped. It replaces the email and Telegram parts of the October 6 spec and switches on only after ISA-3 is live and checked.
- [Weekly RFP audit, one scoring retry, Gate 2 from a listing](2026-10-14__rfp-weekly-audit/spec.md): built on `feat/rfp-weekly-audit` after the October 2–8 backfill found no Strong Pursue and its gate reasons were about to be deleted. Keeps a permanent per-RFP audit file, retries a rejected scoring answer once, and carries close Gate 2 calls from a listing on to the documents.
- [RFP deadline selection and scoring](2026-09-30__rfp-deadline-scoring/spec.md): three-file patch deployed September 30 from `docs/rfp-deadline-scoring`; isolated VM checks passed, normal production job not run.
- [Secondary scorer: no final score without the solicitation](2026-10-05__rfp-needs-documents/spec.md): three-file patch deployed October 5 from `fix/rfp-evidence-gate`; post-deploy checks passed, normal secondary job not run since.

Use one folder on the task branch for a substantial ISA feature, bug, or investigation: `YYYY-MM-DD__short-kebab-name/`. Start from [`_template/`](./_template/) and keep scope, evidence, and acceptance criteria next to the work. Small fixes do not require a three-file spec.

For VM-facing work, distinguish the source change from any scheduler/config change and record which tests are offline, which need safe integration credentials, and which require a controlled live check. Do not paste raw customer RFPs, CRM responses, secrets, or logs into a spec.

When the work is finished, promote lasting rules to [RFP](../domains/rfp/README.md), [sales](../domains/sales-operations/README.md), or [architecture](../architecture.md); archive a useful completed spec under [`archive/`](archive/README.md) through normal Git review.
