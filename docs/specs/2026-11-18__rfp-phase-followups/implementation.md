# Implementation record: phase follow-ups after a move

## Why

Stage folders (November 17, 2026) record who decided to work on an RFP, but nothing told people what ISA can do next. The proposal skills sat unused unless someone knew to ask for them by name. ISA learns skills only from `workspace/AGENTS.md` (the live OpenClaw `skills` config doesn't load our `-skill.md` files), so the link between a phase and its skills has to be written there.

## Decisions (November 17–18, 2026)

- People see **phases**: "Phase 1: Scored", "Phase 2: Looking closer", "Phase 3: Building", "Phase 4: Submitted". Folder names stay as they are.
- ISA never runs a skill because an RFP moved. It asks before moving, then lists the phase's skills and runs only the ones picked.
- The offer goes in the Friday group message, one code-built line naming each Strong Pursue. The group has `requireMention: false`, so a reply reaches ISA without an @mention, and anyone in it may approve a move (`--by` records who).
- Document refresh is not a phase skill. It covers every RFP that has left Phase 1, on the Tuesday schedule, until it reaches Phase 4 (`SCHEDULED_STAGES` in `rfp-refresh.mjs` already does this). A one-off refresh on request still works in any phase.
- Capability verification is offered in Phase 2. It left the scoring prompt in PR #62, which this branch is stacked on.

## Changes

- `workspace/scripts/rfp-report.mjs`: `moveOfferLine()` adds the offer after the Telegram message, before the close calls and portal logins. It uses the names the message used, and is left out of what ISA writes and is checked on.
- `workspace/AGENTS.md`: a "Phases and their skills" rule under RFP updates, with the phase map.
- Tests: `devtools/rfp-report.test.mjs` (offer wording for one, two and three picks; quiet weeks) and `devtools/rfp-skill-files.test.mjs` (every skill in the map exists; no refresh or retired skill; the never-auto-run sentence stays).

## Release

Deployed to the VM on November 18, 2026 at `main` `7bc549e` (backup `backups/dev-deploy-2026-11-18T17-23-10-608Z-7bc549e`), in one upload of six files with PRs #61 and #64: `AGENTS.md`, `scripts/rfp-report.mjs`, `scripts/rfp-scoring-judgment.mjs`, and the pursue-email, meeting-brief and deck-rough-draft skills. A pull afterwards showed the VM matching `main` for all six. Nothing was restarted; the Friday job loads its scripts fresh on each run.

Not yet seen live: the offer line first appears in the Friday, November 20 group message, and nobody has yet replied to one or asked ISA for a phase's skills. Whether a chat session already open at upload time uses the new `AGENTS.md` wasn't checked.

PR #60's Slack cleanup was left off the VM on purpose. The Slack tools there don't work and don't affect ISA, so `tools/Send-SlackMessage.ps1` and `tools/slack-app-manifest.yaml` stay, and #60's four edited files weren't uploaded either; `live:pull` lists those six as the remaining differences.
