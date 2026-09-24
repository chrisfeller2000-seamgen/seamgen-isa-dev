# Runtime inventory

Read-only observations from the ISA VM on September 24, 2026:

- Workspace: `/home/azureuser/.openclaw/workspace`
- OpenClaw: `2026.9.4 (3a9d69d)`
- Node.js: `v24.18.0`
- Installed Tavily plugin package: `@openclaw/tavily-plugin` `2026.9.4`
- The workspace has a `.git` directory, but `git status` reported no commits on `master` and the workspace files untracked. This is not a usable source-control history.
- The current import covers 44 selected files: agent instructions, skills, scripts, and tools. It excludes runtime state and customer data.
- The current recurring job names and schedules are recorded in `docs/live-jobs.md`; the scheduler's live payloads and database are not copied.

This is not a complete local OpenClaw installation. Before claiming end-to-end local parity, document the non-secret runtime configuration, installed plugins, job definitions, dependencies, test credentials, and safe side-effect controls. Do not copy the live `openclaw.json`, credential files, or session database into this repository.
