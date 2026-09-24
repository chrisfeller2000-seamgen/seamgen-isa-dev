# Commands

Run these from the repository root. `package.json` is the command source of truth; the root [README](../README.md) gives first-time setup detail.

| Command | What it proves or changes |
| --- | --- |
| `npm test` | Offline Node tests, including synthetic RFP document cases. No real HigherGov, HubSpot, Gmail, Drive, or Telegram check. |
| `npm run check` | Source safety and JavaScript/shell syntax checks. Not an integration test. |
| `npm run local:setup` | Installs isolated Node/OpenClaw and copies tracked ISA source into ignored `.isa-local/`. |
| `npm run local:link-key -- /absolute/path/to/.env.local` | Links an existing local `OPENAI_API_KEY` source by path; never paste the key into the command. |
| `npm run local:start` | Starts the isolated Gateway in the foreground at `127.0.0.1:19001`; Ctrl-C stops it. |
| `npm run local:health` / `npm run local:chat -- "Hello Isa"` | Checks the local Gateway / asks the local agent a question. The chat uses the linked model key. |
| `npm run local:sync` | Refreshes the isolated workspace from tracked source; refuses overwritten local changes. |
| `npm run live:pull` | Read-only download/compare of approved VM source. Does not change working files or the VM. |
| `npm run live:accept` / `npm run live:import` | Records a reviewed VM baseline / imports reviewed VM source changes into this worktree. Read the [README](../README.md) safeguards first. |
| `npm run live:deploy` | Previews a guarded source upload. No VM file changes. |
| `npm run live:deploy -- --apply` | Uploads reviewed changes to the **live VM**. Requires an explicit deployment request and a clean, committed checkout. |

Do not run `workspace/scripts/*.mjs` directly merely to see what happens: several read real credentials and send mail, post to Telegram, update HubSpot, or advance intake state. For RFP changes, use `npm test` and its offline fixture first. See [local development](workflows/local-development.md) and [deployment](deployment.md).
