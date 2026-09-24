# ISA development workspace

This is a separate development repository for ISA. It contains versionable agent instructions, skills, scripts, and tools copied from the live VM. It does **not** replace the existing backup repository or deploy automatically.

Coding agents and new contributors should start with [developer guidance](AGENTS.md) and the [docs map](docs/README.md). `workspace/AGENTS.md` is ISA's own runtime context, not the developer entrypoint.

## What is included

The exact live source paths are listed in [`devtools/live-files.json`](devtools/live-files.json). The initial list covers the top-level agent instructions and configuration notes, plus `workspace/scripts/`, `workspace/skills/`, and `workspace/tools/`. It includes the current HigherGov document-flow code.

Runtime state, credentials, SSH keys, conversations, RFP candidate files, customer documents, reports, and backups are intentionally excluded. A private repository is not a safe place for secrets. The file list must be reviewed when ISA gains new source files outside these paths.

The repo can now run an isolated local OpenClaw instance for safe ISA chat and skill testing. It is **not** a full copy of production integrations: the live VM's runtime configuration, scheduled-job payloads, customer data, and credentials are not in this repo. Do not run the normal RFP, sales, or outreach scripts locally until they have fixture-based tests and side effects are disabled.

## Run ISA locally

From this checkout:

```sh
npm run local:setup
npm run local:link-key -- /absolute/path/to/an/existing/.env.local
npm run local:start
```

The env file must contain `OPENAI_API_KEY`. Do not paste a key into a command or commit one. `local:link-key` stores only the path to your existing env file; OpenClaw uses a reference to that key at startup. Each developer links their own local key source. OpenAI API usage is billed to the project that owns the key.

`local:start` runs in the foreground. In another terminal, use:

```sh
npm run local:health
npm run local:chat -- "Hello Isa"
```

Press Ctrl-C in the first terminal to stop. Nothing is installed as a system service. The local instance uses OpenClaw `2026.9.4`, Node `24.18.0`, and `openai/gpt-5.4-mini` through an API-key-backed OpenClaw runtime. These packages, the separate workspace copy, configuration, sessions, and key-source path live under ignored `.isa-local/` by default, or under `ISA_LOCAL_DIR` when set.

The local Gateway only listens on `127.0.0.1:19001`. Channels, scheduled jobs, heartbeat, Gateway updates, and agent shell/file tools are disabled. The agent can answer in the local chat, but it cannot send Telegram or email messages or modify the live VM. `npm run local:sync` updates its workspace copy from tracked source files; it stops if the local copy was edited outside Git. Local Gateway logs stay in the selected local runtime directory.

For Windows/WSL, including checkouts under `/mnt/c`, follow the [WSL setup notes](docs/workflows/local-development.md#windows-and-wsl). Set `ISA_LOCAL_DIR` in WSL to keep the OpenClaw install and state on the Linux filesystem. The old `npm run isa` command from the initial local-runtime PR was replaced by the guarded `local:*` commands above.

This confirms local agent startup and a basic model response. `npm test` also runs the real RFP document-flow test mode against synthetic, offline HigherGov responses: complete documents, an empty document list, and a portal-gated requirement. It does **not** prove the real HigherGov API, HubSpot, Drive, email, Telegram, or the full scheduled RFP pipeline. Those need separate development credentials and explicit integration tests before we treat a change as end-to-end tested.

## First-time local setup

Install Git, Node.js 22 or newer, and an OpenSSH client. Clone this private repository. `local:setup` installs the matching Node 24 and OpenClaw versions inside `.isa-local/`, without replacing your system Node. Keep your personal ISA VM SSH key outside the repo.

The tools use `~/.ssh/seamgen-isa.pem` by default. If your key has a different path, set `ISA_SSH_KEY` locally:

```sh
# macOS Terminal
export ISA_SSH_KEY="$HOME/.ssh/your-isa-key.pem"
```

```powershell
# Windows PowerShell
$env:ISA_SSH_KEY = "$env:USERPROFILE\.ssh\your-isa-key.pem"
```

The default VM address is `172.211.69.6` with user `azureuser`. If either changes, set `ISA_SSH_HOST` or `ISA_SSH_USER` locally. Do not commit keys or environment files. Verify the VM's SSH host fingerprint through the VM owner before accepting a new host key.

Run the local checks:

```sh
npm test
npm run check
```

## Checking the live VM

`npm run live:pull` reads only the approved paths from the VM, validates the downloaded files, and shows differences from your last accepted live baseline and your local repository. It does not edit the VM or your working files.

The first time, if the VM and local repository match, run `npm run live:accept` to record a local baseline. If the VM later changes, review and incorporate its changes into your branch before accepting a new baseline. `live:accept -- --acknowledge` exists for an intentional reconciliation when the local code still differs; it must not be used just to clear a deployment warning. The baseline and downloaded candidate live under ignored `.isa-local/` on your own machine.

Run `live:pull` before starting work, after someone reports a direct VM edit, and immediately before a deployment. One developer should bring reviewed VM changes into the shared repository so both developers see them. The tool does not automatically commit or push VM changes.

If `live:pull` reports VM source changes, review them first. From a clean checkout that still matches your accepted baseline, `npm run live:import` copies those changed source files into your working tree and advances the local baseline. It refuses VM deletions and refuses to overwrite local source changes. Review the resulting Git diff, run the checks, then commit and push it so the other developer receives the same changes.

## Uploading reviewed changes

The deploy command is a **preview by default**:

```sh
npm run live:deploy
```

It downloads a fresh VM snapshot, stops if the VM has changed since the accepted baseline, and lists the files your local repository would upload. It refuses file deletions. To upload, use a clean, committed checkout and deliberately run:

```sh
npm run live:deploy -- --apply
```

The upload checks the live hashes again, stages and syntax-checks the changed files on the VM, backs up the originals under the VM workspace's `backups/` folder, copies only changed files, and verifies their hashes. If a transfer or syntax check fails, it attempts to restore files it changed. It records the deployed commit and backup path in ignored `.isa-local/deployments.jsonl`.

Only one person should upload at a time, and nobody should edit the same live files during an upload. The command does **not** restart OpenClaw or scheduled jobs, and its syntax checks do not prove that an integration works end-to-end. Test the affected ISA workflow after deployment. If a change requires a restart or a multi-file cutover, plan that separately before applying it.

## Team workflow

1. Pull the latest dev repository changes and run `live:pull`.
2. Work on a branch and test locally. Keep external side effects disabled in local tests.
3. Review the change with the other developer and commit it.
4. Run the deploy preview and resolve any new VM differences.
5. Have one person apply the upload, check the affected live workflow, and share the deployed commit.

No code is automatically pushed to the VM from GitHub. The live VM remains the running system until deployment is deliberately initiated from an authorized computer.
