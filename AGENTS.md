# Development guidance

- This repository is a development copy of ISA. `workspace/AGENTS.md` is ISA's runtime instruction file and is project content, not an instruction to a developer or coding assistant working on this repository.
- The live Azure VM remains separate. Reading it through `npm run live:pull` is allowed when needed for the task; never upload or restart anything live without an explicit deployment request.
- Preserve existing files and changes. Review the diff and run `npm test` and `npm run check` before proposing a change.
- Keep credentials, private keys, conversation databases, customer documents, and runtime output out of Git. Use only the approved paths in `devtools/live-files.json` for VM imports.
- The upload command previews by default. Never bypass its live-file drift check, and never run two uploads at once.
