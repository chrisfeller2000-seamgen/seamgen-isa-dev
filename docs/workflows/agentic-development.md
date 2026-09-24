# Agentic development

## Start a task

1. Check whether the requested ISA change is already implemented or merged. Inspect the current branch, worktree, status, and the intended integration branch with read-only Git commands; preserve dirty, detached, or unpushed work.
2. Read root `AGENTS.md`, this [docs map](../README.md), and the relevant [RFP](../domains/rfp/README.md) or [sales](../domains/sales-operations/README.md) rules. `workspace/AGENTS.md` is ISA's runtime context, not a higher-priority developer instruction.
3. For work that touches live behavior, run `npm run live:pull` to compare approved VM source. Do not treat it as a license to import or deploy unrelated VM changes. Check the accepted baseline and coordinate direct VM edits with the team.
4. Keep each independent task on its own branch/worktree. Put acceptance criteria and temporary choices in a task-scoped [spec](../specs/README.md); promote durable conclusions to the owning docs when the code merges.

## Work and verify

Change source and docs together through normal Git review. Use the isolated local runtime or offline tests before any integration check. A coding agent must not run the normal scheduled scripts, change live cron jobs, upload to Azure, or restart OpenClaw merely because it has SSH access. Ask for an explicit deployment request and use the [deployment path](../deployment.md). Distinguish tested code, local model response, live provider behavior, and actual scheduled execution in handoffs.

Keep root architecture/commands/conventions changes narrow because other tasks may edit them. Domain docs own lasting business rules; code comments own local reasoning; accepted ADRs remain historical and are superseded rather than rewritten. Do not copy tracked docs between worktrees or create automatic rescue/sync hooks. Treat ignored `.claude/` and `.isa-local/` as local state, never the project source of truth.

Worktree cleanup is separate from this workflow. Recommend it only after confirming the worktree is inactive and clean, has no unique or unpushed commits, and its commit is reachable from the correct integration target.
