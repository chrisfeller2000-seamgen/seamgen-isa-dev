# Local development

The safe local setup is an isolated OpenClaw instance and an offline RFP fixture, not a replica of Azure. Each developer uses their own checkout and isolated state under ignored `.isa-local/` by default, or under `ISA_LOCAL_DIR` when set.

## Prerequisites and setup

- Git, OpenSSH, npm, and Node 22 or newer. `npm run local:setup` installs the matching Node 24.18.0 and OpenClaw 2026.9.4 below `.isa-local/` without replacing system Node.
- For model-backed chat only, an existing local env file containing `OPENAI_API_KEY`. Do not put the key in Git or paste it into a command. `local:link-key` stores only the source file path. Use a Seamgen-approved model project for ongoing ISA work; API use is billed to the key's owning project.
- An authorized SSH key is needed only for `live:*` comparison/upload commands, not for offline tests or local chat. The key stays outside the repo.

From this checkout:

```sh
npm run local:setup
npm run local:link-key -- /absolute/path/to/existing/.env.local
npm test
npm run check
```

Start `npm run local:start` in one terminal. In another terminal in the same checkout, run `npm run local:health` and `npm run local:chat -- "Hello Isa"`. Stop the foreground Gateway with Ctrl-C. It binds only to `127.0.0.1:19001`; scheduled jobs, channels, heartbeat, and agent shell/file tools are off. `npm run local:sync` refreshes its workspace from tracked Git source and refuses to overwrite edits made inside the isolated copy.

## Windows and WSL

The commands above are for a shell with its own Node 22+ installation. For WSL, run them from Ubuntu with Linux Node/npm, not from Windows PowerShell. The simplest option is to clone the repository onto WSL's Linux filesystem. If the checkout is on `/mnt/c`, keep the much larger OpenClaw installation and its state on the Linux filesystem by setting this in **each WSL terminal** before running any `local:*` command:

```sh
export ISA_LOCAL_DIR="$HOME/.local/share/seamgen-isa-dev"
```

You can put that export in your WSL shell profile to make it persistent. `ISA_LOCAL_DIR` must be an absolute path outside the repository; all local commands must use the same value. Changing it later starts a separate local instance, so the key source must be linked again. Keep that key source outside the repository too.

Jessica's original PR used `npm run isa -- chat` and supported an Anthropic API key. Those options were **not** retained when the launchers were consolidated: use `local:start` plus `local:chat` above, and use an approved `OPENAI_API_KEY`. A Claude Desktop subscription alone is not an API key. The WSL storage path is now supported in the launcher, but startup and chat on Jessica's machine still need a real smoke test; passing CI or macOS checks does not establish WSL compatibility.

## What local tests cover

`npm test` uses synthetic HigherGov responses and a temporary workspace to exercise the RFP document test path for complete documents, an empty document list, and a portal-gated requirement. This does not call the real HigherGov API. Local chat proves the Gateway and a model response, not ISA's live Telegram, Gmail, Drive, HubSpot, or cron behavior.

Do **not** run the normal scripts in `workspace/scripts/` locally as a smoke test. Some use fixed production paths or accounts and have outbound effects. Add a fixture or explicit development integration mode for the path you need before running it. There is no local database migration or seed step in this source-only repo; live customer candidates and reports are intentionally absent.

If startup fails, first check `npm run local:version`, `npm run local:health`, the linked key source path, and whether another process owns port 19001. Do not solve local startup by copying the live OpenClaw config or credentials. See [commands](../commands.md), [security](../security.md), and [integrations](../integrations.md).

The repository keeps text-file line endings at LF on every checkout so Windows line-ending conversion does not create false VM hash differences. Local ISA chat has been verified on macOS; Windows/WSL startup still needs its own check before claiming support. Do not use a live VM upload to test that platform setup.
