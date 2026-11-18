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

PR #60's Slack cleanup was left off the VM on purpose. The Slack tools there don't work and don't affect ISA, so `tools/Send-SlackMessage.ps1`, `tools/slack-app-manifest.yaml`, and #60's edits to `tools/README.md` and `tools/Sync-RfpToDrive.ps1` stay as they are; `live:pull` lists those four as the remaining differences. #60's two skill edits did go up in a second upload the same day (backup `backups/dev-deploy-2026-11-18T17-31-30-273Z-7bc549e`), because the phase map offers both: `rfp-capability-verification-skill.md` and `proposal-writing/rfp-materials-request-slack-skill.md`, which now give Slack messages as text to copy.

## Follow-up: later requests and the AGENTS.md size limit (November 18, 2026)

Two rules added to the phase map in `workspace/AGENTS.md`:
- **Later requests:** any later question about an RFP, or a request for one of its skills, starts with `node scripts/rfp-stage.mjs list`. The phase lives in the folders, so it survives new sessions and scheduled runs.
- **A skill from a later phase:** before running it, ISA names the skill's phase and asks whether to move the RFP there. On a yes it moves, then runs. On a no it still runs the skill and leaves the RFP where it is; a phase never blocks a skill. The submission email keeps its own question, asked after sending.

**AGENTS.md was being cut.** OpenClaw 2026.9.4 injects at most 20,000 characters of a workspace file (`bootstrapMaxChars`). For a longer `AGENTS.md` it keeps the first 9,000 and last 3,000 characters plus headings and bullets clipped to 240 characters, so most of the RFP section is lost. The phase map took the file from 18,687 to 20,876 characters in the first November 18 release, and to 21,757 with these rules. To get back under the limit, the unused OpenClaw `TOOLS.md` template text (example cameras, SSH and voices, the "Make It Yours" and "Related" links) was removed and the phase map shortened. The file is now about 19,600 characters. `devtools/rfp-skill-files.test.mjs` fails if it reaches 20,000.

### Local ISA scenarios

Local ISA (`openai/gpt-5.4-mini`; shell and file tools off) was given a test setup in which it wrote each command it would run and the tester pasted back realistic output for a made-up RFP, "Laguna Beach website redesign". This checks how the model reads the rules, not live tool use or the live model.

| Scenario | 21,757-character file (cut) | Under the limit |
| --- | --- | --- |
| A. Reply "yes" to the Friday offer | Wrong `rfp-stage.mjs` syntax first; after the move, listed no skills | Right command; after the move, listed all four Phase 2 skills and asked which |
| B. Two weeks later, "what can you do for Laguna Beach?" | Found Phase 2; listed two of four skills | Ran the list; named Phase 2 and all four skills |
| C. Phase 3 checklist for a Phase 2 RFP | Asked to move first | Asked to move first. On "no", it refused the skill until "a phase never blocks a skill" was added; then it ran the skill in Phase 2 (two runs out of two) |
| D. Phase 2 engineering brief for a Phase 2 RFP | No move question; made up a script name | No move question; opened the skill file |
| E. Submission email | Wrote a generic email without the skill | Same; doesn't look up the phase or open the skill |
| F. Calendar dates for an RFP in Phase 1 | Searched this week's results and never found the phase | Ran the list, found the folder in Phase 1, then started reading dates without asking to move it to Phase 2 |

E and F remain open: the model didn't connect "the email that goes with the proposal" or "put the dates on the calendar" to their skills. Neither has been checked with the live model.
