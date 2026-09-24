# ISA development guidance

This repository is a development copy of ISA, not the running Azure VM. Start with [the docs map](docs/README.md), then read the relevant domain and workflow pages. `workspace/AGENTS.md` is ISA's **runtime instruction file** and project content, not instructions for a coding assistant working on this repo.

- Before changing anything, check the current branch, worktree, status, and whether the work already exists on the integration branch. Preserve all existing and uncertain changes. Use a separate branch/worktree for a separate task.
- The tracked `workspace/` contains selected instructions, skills, scripts, and tools. The live OpenClaw configuration, scheduler database, credentials, customer documents, reports, and conversations are not in Git. See [architecture](docs/architecture.md) and [security](docs/security.md).
- Read-only VM comparison through `npm run live:pull` is allowed when needed. Do not upload, restart, change a scheduled job, or run a side-effecting live workflow without an explicit deployment request. The upload command previews by default; never bypass its VM-drift check or run two uploads at once.
- The isolated local ISA can answer chat prompts, but it does not reproduce production integrations. Do not run normal RFP, mail, report, or outreach jobs locally until the affected path has fixture tests and outbound effects are controlled. See [local development](docs/workflows/local-development.md).
- Keep credentials, SSH keys, private customer data, database files, raw logs, and runtime output out of Git. Import only paths approved in `devtools/live-files.json`.
- Review the diff and run `npm test` and `npm run check` before handing off code or docs. Add focused tests for changed behavior; a syntax check is not an end-to-end integration test.
- Keep comments and docs plain and ISA-specific. Explain non-obvious gates, state transitions, external contracts, and side effects beside the code; see [conventions](docs/conventions.md).
