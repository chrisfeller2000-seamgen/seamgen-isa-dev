# Pursue email skill retired

ISA's Friday job already writes and sends the pursue email for the week's Strong Pursue RFPs, so nobody needs to ask for a draft. The chat skill `rfp-email-pursue-skill.md` was left over from when a person drafted that email. It's now gone from the repo and the VM.

## What changed (#81)

- **Requests for a pursue email:** the router answers that ISA sends it on its own, and offers this week's email, an engineering brief or the agency questions. A question such as "Did you email Marianne about pursuing Laguna Beach?" isn't treated as a request for a draft.
- **Rescored RFPs:** a rescore can create a Strong Pursue after Friday's email has gone out. `rfp-rescore.mjs --email` writes the normal pursue email for that RFP and saves it. `--send-email` sends exactly that saved email after a person says yes. This is the one exception to ISA's "never send an RFP email" rule in `workspace/AGENTS.md`.
- **A send that may have gone out:** if Gmail fails or times out, a marker file blocks another send until someone checks the Sales inbox and runs `--retry`.
- **Peter:** removed from the Friday email's writing prompt and its sensitive note.
- **Tests:** the rescore refusal test scored against today's date, so it began failing on `main` once its sample RFP's deadline came within the 10-day minimum. The date is now fixed.

## VM subtitle kept (#82)

The first deploy attempt stopped at the VM-drift check. `scripts/weekly-current-year-sales-report.mjs` had been edited directly on the VM on November 23 at 20:01 UTC, changing the sales report email's subtitle:

- **Before:** "Current year only. HubSpot is the single source of truth. Sales Golden Rules applied."
- **After:** "Current year and rolling 12-month view."

The user chose to keep the new line, so #82 imported it with `live:import`. Who made the edit is unknown, and nobody has checked that the script calculates a rolling 12-month view.

## Release (November 23, 2026 at 23:05 UTC)

Uploaded on the user's request. Commit `a557fec` (the #82 merge, which includes #81).

**Before the upload:**
- `npm test` (293) and `npm run check` passed on the #82 branch, and CI passed on #81 and #82.
- `live:pull` showed no VM changes since the accepted baseline, and no RFP job was running.

**Uploaded:** 9 files, using `--files` because the upload tool doesn't delete live files.
- `AGENTS.md`;
- `scripts/rfp-report.mjs`, `rfp-rescore.mjs`, `rfp-route.mjs` and `weekly-rfp-pursue-decision.mjs`;
- `skills/rfp-meeting-brief-skill.md`, `rfp-solution-landscape-skill.md`, `rfp/INDEX.md` and `rfp/document-fetch/instructions.md`.

The backup is `backups/dev-deploy-2026-11-23T23-05-25-105Z-a557fec`. Nothing was restarted, and no scheduled job or crontab line changed.

**Read-only checks on the VM:**
- The router gave the retired reply to "draft a pursue email for Laguna Beach" and "write an email to Marianne about pursuing Laguna Beach".
- It did not give that reply to "Did you email Marianne about pursuing Laguna Beach?".
- `AGENTS.md` is 13,117 characters, under OpenClaw's 20,000 limit.

## VM cleanup (November 23, 2026 at 23:12 UTC)

Done as a separate step on the user's request, after each file's checksum was confirmed:

- Removed `skills/rfp-email-pursue-skill.md` from the workspace.
- Edited the `rfp-flow` Workshop skill (`agents/main/agent/workshop-skills/rfp-flow/`). It no longer describes a weekly digest or drafting rules, and step 7 now says the Friday job writes and sends the pursue email.
- Removed that skill's `references/pursue-email.md`.

The originals are in `backups/retire-pursue-email-2026-11-23`. `live:accept` then recorded the deletion, and a deploy preview showed nothing left to upload.

`rfp-flow` is outside Git and ISA can rewrite it, so a deploy check won't notice if the old email guidance returns. The edited `SKILL.md` has SHA-256 `cac38394f8d100e3bf052d61d53214c1a60f3a3c055ff42f342fed5e4406ff39`.

## Not yet tested

- A real rescore email through Gmail, and ISA's model writing one.
- A pursue email request through real Telegram chat. A chat session already open at upload time may keep its old instructions until it starts fresh.

## Known issue

`rfp-flow` still says Shared Drive upload is unavailable, which contradicts the current Drive process. It was outside this change.
