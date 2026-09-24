# Conventions

## Source and tests

- Change ISA behavior in the owning `workspace/scripts/`, `workspace/skills/`, or `workspace/tools/` file. Keep the developer transfer/runtime tooling under `devtools/` separate from ISA's business workflows.
- When a skill and script describe the same RFP rule, inspect both. A skill file can be aspirational or stale; verify what the scheduled script actually calls before claiming the rule is automated.
- Use `WORKSPACE_DIR` and synthetic fixtures for isolated tests. Keep network, CRM writes, mail, Drive, Telegram, and intake-state updates outside test paths. A flag such as `NO_TELEGRAM` alone does not make a whole job safe.
- Add tests for decisions and state transitions, especially metadata-only versus extracted documents, blocked attachments, retries, and duplicate processing. Run `npm test` and `npm run check`; document what real integrations remain untested.

## Comments and docs

- Explain why a gate, status, source identifier, deadline rule, or side-effect boundary exists when names and tests cannot make it obvious. Do not narrate simple syntax or require comments on every function.
- Keep local reasoning beside the code, durable RFP or sales invariants in the owning domain doc, task choices in branch-scoped specs, and lasting architecture decisions in an ADR. Change shared docs narrowly alongside the code that changed.
- Write plain, ISA-specific wording. Say which job, credential boundary, document state, or CRM action is involved; avoid generic prose that could fit another project.
- Treat `workspace/AGENTS.md` and `workspace/skills/` as ISA-facing source content. Developer guidance belongs in root `AGENTS.md` and `docs/`.

## Sensitive and generated material

Never commit `.isa-local/`, `.env` files, SSH keys, OpenClaw state, customer RFP resources, report output, logs, or API responses with private data. `devtools/live-files.json` is the allowlist for VM imports; a private GitHub repo is not permission to widen it casually. See [security](security.md).
