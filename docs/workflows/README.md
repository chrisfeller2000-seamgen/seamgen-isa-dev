# Developer workflows

- [Local development](local-development.md): isolated ISA chat, offline tests, and what is not safe to run.
- [Agentic development](agentic-development.md): task start, instruction boundaries, source comparison, and review.
- [Deployment](../deployment.md): guarded, explicit upload to the live Azure VM.

Do not add a generic runbook for a live job until its inputs, outputs, side effects, and rollback have been verified. The [observed scheduler inventory](../live-jobs.md) is not an executable job configuration.
