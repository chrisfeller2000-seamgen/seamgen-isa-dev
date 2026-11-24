# Implementation record: RFP engineering brief v2.0

## Why

The third and last Phase 2 skill review, after the agency questions and the capability check. The engineering brief (`workspace/skills/rfp/engineering-brief/instructions.md`, v1.8, 26k characters) had these problems:

- **The PDF couldn't be made as described.** The steps were for "headless Edge on this machine" (Jake's Windows laptop), and no brief had ever been produced on the VM. The VM's Chromium is a Snap package. A test on November 24 printed nothing into `/tmp`, but did print into a plain folder in the home directory. Snap apps also can't write to hidden folders such as `~/.openclaw`, where the RFP folders are. Nothing attached a PDF in chat.
- **Estimates had nowhere to go:**
  - "Chris estimated 12 weeks for Laguna Beach" and "Chris says Laguna Beach is about 4 months with 3 engineers" got a general answer, and nothing was recorded.
  - "What did Chris estimate?" had nothing to answer from.
  - "Update the Laguna Beach brief with the new addendum" went to the document refresh.
  - `asks` named Nick Buchan, who isn't an engineer.
- **Quotes weren't checked.** The rule is "verbatim quote with page, never paraphrase", because engineers price from the brief without reading the RFP. Nothing checked that a quote was in the RFP.
- **Inputs it didn't use:**
  - scope documents the scoring found named but never saved (an estimate from a partial scope comes in low);
  - the capability check's "never" and "not answered" rows, though the skill puts capability first;
  - the proposal due date in the key-dates note;
  - the current staff list.
- **A silent coupling:** the agency questions script reads the brief Markdown's "Ambiguities Requiring Clarification" section. A renamed heading or a missing Markdown file would break it without notice.

The user approved all six proposed changes on November 24, 2026, keeping the PDF.

## What changed

- **`workspace/scripts/rfp-brief.mjs` (new):**
  - `--inputs`: `scope` (unread scope documents from `requiredDocuments`, plus `scopeRead`), `capability` (open rows), `team`, `keyDates`, `saved` and `steps`.
  - Writing a brief (JSON on standard input):
    - every quote is checked against the saved documents' text (letters and digits only, so line breaks, hyphenation and curly quotes don't matter; "…" joins pieces), and needs a page;
    - each ambiguity needs a question, a reason, and a quote or `silent`;
    - the summary must be about 20 words, the recipients current staff, and the brief at most 5 pages (about 500 words each);
    - it renders the fixed format, with "Risks for the estimate" built from the inputs;
    - it saves `engineering-brief_<date>_<slug>.md` with a JSON record;
    - it prints the text to send, with a message for the engineer and a `MEDIA:` line for the PDF.
  - **PDF:** Chromium, Chrome or Edge (or `CHROMIUM_PATH`), printing from a temporary folder in the home directory and then moving the file into place. Without a browser it says so and the Markdown stands.
  - `--estimate`: the engineer's words and the date, with any duration, team and assumptions, all current staff. A revised brief carries estimates over, marked with the brief they were given on.
  - `--show`: prints the saved brief.
- **`workspace/scripts/rfp-route.mjs`:**
  - an estimate passed on in chat gets `mode: "record-estimate"`, never a move question; a question about time ("Do you think … takes 12 weeks?") isn't recorded;
  - "what did Chris estimate" gets `answer` with `about: "estimate"` and the saved `brief`;
  - "update / revise / redo … brief" goes to the brief;
  - a run of this skill carries `inputs`.
- **Skill v2.0** (10.4k characters, down from 26k):
  - steps for inputs, passages, ambiguities, running the script, and recording estimates;
  - the section keys in one table;
  - the Utah State example cut to two ambiguities;
  - `asks` gained "update the brief" phrasings and dropped "brief for nick".
- **`INDEX.md` and `docs/domains/rfp/README.md`** describe the script and the router answers.

## Tests

- `devtools/rfp-brief.test.mjs` has 10 tests. They cover:
  - quote matching;
  - the brief checks;
  - the fixed format and risks;
  - saving, the `MEDIA:` line, and the agency questions reading the ambiguities;
  - refusals, including a brief over 5 pages;
  - estimates carried onto a revised brief;
  - `--inputs`;
  - the router;
  - standard input with shell characters;
  - a real PDF where a browser is installed: printed through Edge on Windows on November 24.
- `devtools/fixtures/rfp-route-phrases.json` gained 5 phrasings.
- `npm test` (325) and `npm run check` pass.

## Not verified

- **Local model runs** wait on the OpenAI key used for local testing, which has had no credits since November 24 at 18:54 UTC.
- **On the VM:**
  - `printPdf` itself hasn't run there. Only the same Chromium command was tested, by hand, through a home folder.
  - OpenClaw attaching a PDF from the workspace with `MEDIA:` is unseen. PDF is on its allowed list (see the calendar record).
- **The quote check** hasn't run on a real RFP's extracted PDF text. Tables or scanned pages may need the words copied from `document-text.mjs`'s output.

## Release (November 24, 2026 at 21:22 UTC)

Uploaded together with the capability check (#93) as commit `3d04e55`, backup `backups/dev-deploy-2026-11-24T21-22-10-899Z-3d04e55`. The checks before and after the upload, and the file list, are in the [capability check record](../2026-11-24__rfp-capability-check/implementation.md#release-november-24-2026-at-2122-utc).

**Read-only checks on the VM for the brief:**
- **Router:**
  - "engineering brief for the City of Laguna Beach website redesign" gave `ask-move` for the brief on the real Laguna Beach RFP;
  - "Chris estimated 12 weeks for the Laguna Beach website redesign" gave `run-skill` with `mode: "record-estimate"`, no move question, and `inputs` listing the nine current staff.
- **`--inputs`:** scope taken from the 2026-11-13 audit line, with no unread scope documents. `read` is empty because that run's judgment predates the scoring's scope-read field.
- **The quote check on the real RFP's PDF text:** two passages from the solicitation (the overview's "seeks a qualified website development firm…" and the search requirement's "Provide modern website search capabilities…") were found; a made-up sentence was not.
- **`printPdf` on the VM:** printed a test brief to a PDF in under a second (964 ms) through Snap's Chromium. The temporary home folders were removed afterwards.

**This answers two of the open items above:** the quote check on real PDF text, and `printPdf` on the VM.

**Still unseen:** OpenClaw attaching the PDF in Telegram with `MEDIA:`, a real brief or estimate from the team, and the model running it.
