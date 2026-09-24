# ISA developer docs

Use this map to find the smallest relevant source before changing ISA. These docs describe the development copy and known live boundaries; they are not a claim that local behavior matches production.

- [Architecture](architecture.md): dev repo, local OpenClaw, live Azure VM, and entrypoints.
- [Local development](workflows/local-development.md) and [commands](commands.md): setup, safe tests, and VM comparison.
- [Agentic development](workflows/agentic-development.md) and [conventions](conventions.md): session-start checks, worktrees, comments, and documentation ownership.
- [RFP](domains/rfp/README.md) and [sales operations](domains/sales-operations/README.md): workflows, invariants, and known gaps.
- [External API contracts](api.md), [runtime data](data-models.md), and [integrations](integrations.md): provider calls, candidate/manifests, and credentials.
- [Security](security.md) and [deployment](deployment.md): sensitive data, external effects, and release boundaries.
- [Glossary](glossary.md): terms that should not be guessed.
- [Specs](specs/README.md) and [decisions](decisions/README.md): branch-scoped work and lasting choices.

Existing evidence remains in [runtime inventory](runtime.md) and [observed live jobs](live-jobs.md). The root [README](../README.md) is the human quickstart. `workspace/skills/` contains ISA-facing workflow instructions; `workspace/AGENTS.md` is ISA's own runtime context, not the coding-agent entrypoint.
