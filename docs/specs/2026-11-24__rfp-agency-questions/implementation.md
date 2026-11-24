# Implementation record: RFP agency questions v2.0

## Why

This is the first in-depth review of the Phase 2 RFP skills after the calendar rework. The agency questions skill (`workspace/skills/rfp/agency-questions/instructions.md`, v1.7, 28k characters) had these problems:

- **The router sent the wrong requests to it.** Each of these ran the skill, which wrote a fresh set of questions:
  - "The agency answered our questions for Laguna Beach, what did they say?"
  - "What questions did we ask the agency for Laguna Beach?"
  - "Which RFPs this week are ask the agency first?"
- **Nothing was saved.** The questions existed only in the chat reply, so "what did we ask?", a revision after an addendum, or a later skill had nothing to work from.
- **Some inputs pointed to the wrong place:**
  - An older RFP's scoring came from the weekly audit file, where quotes are cut to 300 characters, though a move keeps the full `candidate.md` in the RFP folder.
  - The engineering brief had no location.
  - It cited an "RFP is silent" line in the scorer's `buyer` field that only the pursue email writes.
- **The count rules conflicted.** "Aim for 5–7" sat beside "every blocker", "every distinct engineering ambiguity", four categories and an AI question.
- **Katie's worked example** had 12 questions, a `To:` line, `CC: Sales` and a different sign-off from the template.
- **7.4k characters of edit history** included the old Gmail draft steps and an address to send drafts to.
- **The email to the buyer was written freehand:** template, numbering, signature and "no HigherGov or Drive links" were all left to the model.

The user approved all seven proposed changes on November 24, 2026.

## What changed

- **`workspace/scripts/rfp-questions.mjs` (new).**
  - `--inputs` gathers what the questions are written from:
    - the scoring notes: `buyer` with `noIncumbentNamed`, the "ask the agency first" question, the scorer's questions deadline;
    - the plain blockers and open questions from this week's `latest.json` entry, or the newest audit line;
    - the newest engineering brief's "Ambiguities Requiring Clarification" section, from its Markdown source;
    - the key dates and the questions saved last time;
    - `steps`: what this RFP's inputs call for, spelled out (record the deadline, ask about the incumbent, settle the blockers).

    The model's raw gate answers are left out: code decides the gates afterwards, so they could show an issue the final scoring had already settled.
  - Given the questions as JSON on standard input (quoted heredoc), it:
    - **takes the deadline line from the key-dates note** (`rfp-dates.mjs`), so it matches the calendar skill. It refuses until a questions deadline is recorded or `noDeadline` says the documents give none;
    - **stops** when the questions window or the proposal deadline has passed, or when there is no questions deadline and proposals are due within 7 days. It goes ahead with `--anyway` only after the person says yes;
    - **refuses**: a question with no source, a question that repeats its source's quote (60+ characters), HigherGov or Google Drive links, "gate N", "blocker", pursue tiers, the ICP or "found via" wording in anything the agency sees, more than 8 questions without headers, and more than 15;
    - **fills in Katie's template**:
      - "the RFP for the City of Laguna Beach's …";
      - a salutation from the RFP's honorific, or the full name, never a guess from a first name;
      - numbering that continues across headers;
      - a placeholder signature unless the person named the sender;
      - the contact and how to submit above the email, never in it;
    - **writes `agency-questions_<slug>.md`** in the RFP folder (not `resources/`, so not Drive), with a JSON record. `--show` prints it, and a rerun lists the questions added and dropped.
- **`workspace/scripts/rfp-route.mjs`.**
  - The agency's answers → `answer` with `about: agency-answers`, `questions` (the saved ones) and `answerFiles`: saved documents whose names look like a Q&A or addendum, with the commands to read them.
  - "What did we ask" → `answer` with `about: questions`. The note says "the questions I wrote on <date>", because ISA doesn't know whether or when they were sent.
  - "Ask the agency first" without a writing verb → `answer` from this week's results.
  - Requests to change questions ("redo the questions we sent", "add a question about hosting") still run the skill.
- **Skill v2.0** (15.9k characters):
  - steps for inputs, deadline, writing and running the script;
  - an order for when there are more candidate questions than room;
  - "never write the email yourself, no outreach footer";
  - rules 1–11 kept, shortened where code enforces them;
  - Katie's questions only;
  - a short history;
  - edit phrasings added to `asks`.
- **`INDEX.md`:**
  - The "Agency Q&A questions" line now points to the script and the saved copy.
  - The "An RFP's dates" line no longer says the calendar skill attaches a file; it gives links.
- **`docs/domains/rfp/README.md`** describes the script and the router answers.

## Tests

- `devtools/rfp-questions.test.mjs` has 11 tests. They cover:
  - the template and signature;
  - the salutation;
  - headers past 8 and the limit of 15;
  - internal words, pasted quotes and missing sources;
  - deadline lines and stops;
  - a save and a rerun with changes;
  - nothing saved on a stop or bad input;
  - `--inputs` from `latest.json` and from the audit;
  - standard input with shell characters;
  - the router's saved questions and `answerFiles`.
- `devtools/fixtures/rfp-route-phrases.json` gained 14 phrasings. The phrase test now also checks `about`.
- `npm test` and `npm run check` pass.

### Local ISA (gpt-5.4-mini, November 24, 2026)

**Setup:**
- The Laguna Beach test RFP was given realistic text: Q&A contact, technical requirements, evaluation criteria and an addendum.
- It also had scoring notes with no incumbent named, a results entry with one blocker and one open question, and an engineering brief.
- Local ISA has no shell, so a driver relayed `RUN:` commands into a temporary copy of the workspace and sent the output back. The driver isn't committed.

**Round 1** (before the changes listed under it):

| Request | Result |
| --- | --- |
| "Can you write up the questions we should send Laguna Beach for their Q&A?" | 3/3 ran the router, the skill, `--inputs`, the documents and the script, then sent its text. Every run first tried the script without a recorded deadline, was refused, recorded it with `--merge` (with the addendum's January 21 proposal date) and reran. None asked who supports the current system. |
| "Add a question about hosting to the Laguna Beach questions" (questions saved) | 2/2 used `--show`, added one question and reran. The reply listed "Added: …". |
| "What did we ask Laguna Beach?" | 2/2 answered from `questions` without the skill, but said "We asked" and reworded some questions. |
| "Laguna Beach answered our questions, anything we need to know?" | 0/2. The router didn't recognize the wording, so it went to the general answer path. One run answered from the scoring notes. |
| "Write the agency questions for Laguna Beach" (window closed November 23) | 1/2 ran the script, which stopped, and asked whether to go ahead. The other skipped the script and wrote the email freehand with the outreach footer. Its documents still said December 11 (a fixture mistake), but freehand writing is the real problem. |

**Changes after round 1:**
- `steps` in `--inputs`;
- "never write the email yourself" in the skill;
- `answerFiles` and "answered our questions" in the router;
- "the questions I wrote on <date>";
- the contact source cut to file and page;
- "the City of Laguna Beach's".

**Round 2:**

| Request | Result |
| --- | --- |
| Write the questions | 2/3 went end to end, and both included the incumbent question. The third looked like a skipped router, but it wasn't (see the correction below). |
| What did we ask | 1/1 "The questions I wrote on 2026-11-21", word for word. |
| Window closed | 2/2 stopped at the script and asked; nothing written freehand. |
| The agency's answers | 3/3 (after the router fix) read the Q&A addendum and led with the changes that matter: Azure Government hosting, the $350,000 budget, the proposal date and no two-way sync. 2/3 named the question it didn't answer. |

**Correction: ISA never skipped the router.** Two runs (one above, one in the real round below) looked as if ISA answered from memory. In the session database, both first replies were the router command followed by an empty text part. About five seconds later, with no new message, OpenClaw had ISA reply again, apparently because it treats an empty ending as no answer, and that second reply made up questions. The CLI prints only the last reply, so the driver missed the router call. On the VM, ISA calls the router through its exec tool rather than as text, so this doesn't arise there. The driver now reads every reply from the session database and takes exactly one command: its first line, or through the heredoc's end marker.

**Real RFP round** (the City of Laguna Beach "Website Redesign and Replacement Project", RFP CM-013, Phase 1). The solicitation PDF and its audit line were copied read-only from the VM into a temporary workspace. It is an "ask the agency first" RFP whose questions window closed on November 17. Jordan's replies were "2" (leave it in Phase 1), then "Yes, write them anyway".

- **"Can you write the questions we should send the City of Laguna Beach…" didn't reach the skill.** Every `asks` phrase relied on "agency". The skill's `asks` gained "questions we should send", "questions to ask", "questions for the city" and similar.
- **`--inputs` found no scoring.** The Friday run after November 13 cleared the RFP's `candidate.md`. `--inputs` now falls back to the newest audit line's full-text judgment.
- **ISA wrote questions freehand** after reading the skill and documents, without running `--inputs`, and so missed the "ask the agency first" question. The router now puts `inputs` (with its `steps`) in every decision for this skill, and `steps` ends with "never send questions you wrote without the script". After that change, the one complete run asked the "ask the agency first" question as question 1, said the window had closed, and passed on the script's text.
- **Not part of this PR:** in 3 of 5 runs, ISA answered "2" by sending the router its own `rfp move` command, and the RFP moved to Shortlisted without a yes. That is fixed separately.
- The OpenAI key used for local tests ran out of credits during the last round, so it has only one complete run.

**Caveats:**
- The samples are small.
- ISA still tries the script before recording the deadline. The script refuses and ISA recovers, at the cost of one extra command.
- A reply without `FINAL:` got one reminder from the driver, which is a test artifact.

## Not verified

- **The live model** (openai/gpt-6.1-sol) hasn't run any of this.
- **Real data:**
  - `--inputs` ran on one real audit line (Laguna Beach). It hasn't run on a real Phase 2 RFP's `candidate.md` copy.
  - No engineering brief's Markdown source has been seen on the VM.
- **Telegram:** the code block around the email hasn't been seen there.
