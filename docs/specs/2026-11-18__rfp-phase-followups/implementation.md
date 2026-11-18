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

Not deployed. The upload is `scripts/rfp-report.mjs` and `AGENTS.md`, after PR #62's `scripts/rfp-scoring-judgment.mjs`. The script needs no restart, since the Friday job loads it fresh on each run. Check at upload whether an open chat session picks up the new `AGENTS.md` or needs a new session.
