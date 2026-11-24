# Implementation record: RFP capability check v2.0

## Why

The second Phase 2 skill review, after the agency questions. The capability check (`workspace/skills/rfp/capability-check/instructions.md`, v1.3) had these problems:

- **The router sent the wrong requests to it, or missed them:**
  - "Pete answered the Laguna Beach capability check: rows 1 and 2 done exactly on FDEP, row 3 never" and "What did Seth say about the capability check?" each built a new checklist.
  - "Can you check with the engineers whether we can do what Laguna Beach is asking?", "Do we have the experience for Laguna Beach?" and "Which engineer should I ask?" got a general answer.
  - Its `asks` named Nick Buchan, who isn't an engineer.
- **Nothing kept the answers.** Recording the engineer's words, and never turning a hedge into a yes, is the skill's whole purpose (Suwannee River WMD, July 2026). But nothing was saved, so nothing tracked the rows still unanswered. The skill's own "known limitations" said so.
- **The PDF it described had never existed.** It gave no steps for making one on the VM, and none was ever produced there. A PDF in a VM folder doesn't reach the person in Telegram; the message they copy to the engineer is the real deliverable.
- **Inputs were named but never read:**
  - the scoring's case-study match, with no way to find it;
  - People.txt and the case studies, with nothing to stop routing to someone who has left;
  - a questions deadline the model had to work out itself.
- **Its rules were left to the model:** no project name, no claim; never upgrade an answer; at most 10 rows; a quote, page and "if yes" sentence on every row.
- **Nothing used the answers afterwards**, including the agency questions skill, whose rule 11 is about asking a fit question plainly.

The user approved all six proposed changes on November 24, 2026, with the PDF replaced.

## What changed

- **`workspace/scripts/rfp-capability.mjs` (new):**
  - `--inputs`:
    - the case-study and technology judgments, from the scoring notes or the newest audit line (`scoringJudgment()` is now shared from `rfp-questions.mjs`);
    - the current staff parsed from `resources/proposal-sources/Proposal - People.txt`, with roles and the "work on record" and "note" lines;
    - the key dates and the saved check;
    - `steps`.
  - Writing a check (JSON on standard input):
    - it refuses missing quotes, sources or "if yes" sentences, repeated operations, more than 10 rows, unrouted rows, and names not on the current staff list;
    - it prints the checklist and one message per engineer, with only their rows, each row's claim, and the deadline from the key-dates note;
    - it saves `capability-check_<slug>.md` with a JSON record;
    - a rewrite keeps answers to unchanged rows and lists the ones it drops.
  - `--answer`:
    - it refuses a "done" without a project, and an "adjacent" without the project and the difference;
    - it keeps the engineer's words and the date, and lists the rows still unanswered;
    - it lists record gaps for a person to fix, and never edits the sources.
  - `--show`: prints the saved record.
- **`workspace/scripts/rfp-route.mjs`:**
  - a message passing on an answer to this skill gets `mode: "record-answer"`, and never asks about a move;
  - "what did Seth say", "where are we" and "which rows are open" about a capability check get `answer` with `about: "capability"`, and the saved record in `capability`;
  - a run of this skill carries `inputs`.
- **`workspace/scripts/rfp-questions.mjs`:** `--inputs` lists capability rows answered "never" or still unanswered (`capability`), with a step that weighs rule 11 (ask a fit question plainly) against rule 8 (don't advertise a gap).
- **Skill v2.0** (10.5k characters, down from 15.6k):
  - steps for inputs, operations, who to ask, running the script, and recording answers;
  - the PDF replaced by the saved record;
  - `asks` gained the missing phrasings and dropped "ask nick if we have done";
  - the Suwannee story kept in short form.
- **`INDEX.md` and `docs/domains/rfp/README.md`** describe the script and the router answers.

## Tests

- `devtools/rfp-capability.test.mjs` has 9 tests. They cover:
  - parsing People.txt;
  - the row and routing checks;
  - the message;
  - the answer checks;
  - Suwannee replayed: Seth's hedge recorded as unanswered, Pete's answers, and a record gap;
  - a rewrite that keeps and drops answers;
  - the agency questions inputs seeing the open row;
  - `--inputs` with and without People.txt;
  - the router;
  - standard input with shell characters.
- `devtools/fixtures/rfp-route-phrases.json` gained 9 phrasings. "Who should I ask about the Laguna Beach deadline?" must not reach the skill; "who should i ask" was too broad and was left out of `asks`.
- `npm test` (315) and `npm run check` pass.

## Not verified

- **Local model runs (item 6)** wait on the OpenAI key used for local testing, which has had no credits since November 24 at 18:54 UTC.
- **Live data:**
  - People.txt parsing is tested against its layout as read on the VM (nine people, each name in capitals with a "Role:" line), but hasn't run on the VM's file.
  - No real capability check has run.

## Release (November 24, 2026 at 21:22 UTC)

Uploaded on the user's request together with the engineering brief (#94), after both merged. Commit `3d04e55` (the #94 merge, which includes #93).

**Before the upload:**
- `npm test` (325) and `npm run check` passed on `main`.
- `live:pull` showed no VM changes since the accepted baseline. The only differences were the 7 files below.

**Uploaded:** 7 files.
- `scripts/rfp-capability.mjs` and `scripts/rfp-brief.mjs` (both new);
- `scripts/rfp-questions.mjs` and `scripts/rfp-route.mjs`;
- `skills/rfp/INDEX.md`;
- the instructions for capability-check and engineering-brief.

The backup is `backups/dev-deploy-2026-11-24T21-22-10-899Z-3d04e55`. The upload took several minutes, longer than earlier ones, and finished without errors. `AGENTS.md` was not changed (13,190 characters). Nothing was restarted, and no scheduled job changed.

**After the upload:** `live:pull` showed the VM matching `main`, with 65 files in the accepted baseline.

**Read-only checks on the VM:**
- `node --check` passed for the four changed scripts.
- **Router**, on the real Laguna Beach RFP (`website-redesign-and-replacement-project`, Phase 1):
  - "capability check for the City of Laguna Beach website redesign" gave `ask-move` for the capability check;
  - "What did Pete say about the Laguna Beach website capability check?" gave `answer` with `about: "capability"` (no check is saved yet).
- **`--inputs`** on the same RFP:
  - it took the case-study match from the 2026-11-13 audit line: `sameCapability`, project "Contentstack";
  - it parsed the real `Proposal - People.txt` into the nine current staff with their roles. Pete Nystrom and Seth Lutske each had one "on record" line; the others had none.

**Still unseen:** a real capability check from the team, and the model running it.
