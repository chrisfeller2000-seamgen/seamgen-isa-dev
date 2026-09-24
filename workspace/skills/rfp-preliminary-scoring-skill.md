---
name: rfp-preliminary-scoring
purpose: Run the HigherGov intake, then score everything that survives its prefilter against the standard rubric at metadata depth — producing one ranked list of what's worth a real look, fast, before any documents are fetched.
audience: This skill is written to be read by both Claude (who runs the tool and applies the rubric) and a human teammate (who reads the ranked list and decides what to pursue).
version: 1.0 — July 2026
owner: Jake (Seamgen)
---

# RFP Preliminary Scoring Skill

## What this skill does

Say *"run preliminary scoring"* and this happens:

1. **Pull** — run `tools/Get-HigherGovOpportunities.ps1` to fetch new HigherGov opportunities and write candidate files.
2. **Screen** — apply the scoring rubric's six kill gates to every candidate. Most die here.
3. **Score** — apply the full 100-point weighted rubric to the gate survivors only.
4. **Record** — write each score back into its `candidate.md`.
5. **Report** — one ranked list: what came in, what was killed and why, what survived and how it scored.

**This is the cheap pass, not the real one.** Every score it produces is **`metadata-only`** — derived from a HigherGov summary, with no solicitation document read. Its job is to tell Jake which handful of opportunities deserve the expensive treatment: document fetch, full-text re-score, and a pursue decision.

## What it is not

**It is not a replacement for `skills/rfp-scoring-skill.md`.** That skill owns the rubric — the gates, the categories, the weights, the decision thresholds. This skill *runs* that rubric in bulk and records the results. If the rubric and this file ever disagree, **the rubric wins**; fix this file.

**It is not a pursue decision.** A metadata-only score is provisional by definition. Nothing here goes in an email to Peter without a full-text re-score behind it.

## When to use it

- **Daily-ish**, to see what posted since the last run.
- **After a saved-search change**, to re-seed and see what the new filter actually brings in.
- **When Jake asks for "the recap"** — this skill absorbed the previously-planned `rfp-daily-recap`.

---

## Before you run

**Check these three things.** Each has bitten this pipeline at least once.

1. **`HIGHERGOV_API_KEY` is set** in the environment. It is never stored in this folder.
2. **The saved search still matches Seamgen's market.** The search *is* the filter — the API has no NAICS or keyword parameter of its own. Before a big run, open both halves in the browser and look at what comes back:
   - State/Local: `https://www.highergov.com/sl/contract-opportunity/?searchID=<id>`
   - Federal: `https://www.highergov.com/contract-opportunity/?searchID=<id>`

   **Both halves, every time.** A saved search typed "Federal Contract Opportunity" still returns State/Local results on the `/sl/` path, and State/Local is where Seamgen's ICP anchors live. On 2026-07-21 a broadened search silently returned **564 federal and zero State/Local** records — a federal-only criterion (PSC code, set-aside, agency, or vehicle) will zero the SLED side without any error, because SLED records don't carry those fields. Checking costs nothing and takes a minute.
3. **If the search ID changed, the run must be a backfill.** The script refuses otherwise, and it's right to: a watermark built against one filter is meaningless against another.

## Running the tool

From `tools/`:

| Situation | Command |
|---|---|
| Check config + state, no network, no quota | `.\Get-HigherGovOpportunities.ps1 -Status` |
| Preview the plan (~1 record) | `.\Get-HigherGovOpportunities.ps1 -DryRun` |
| Normal run — the prior full day | `.\Get-HigherGovOpportunities.ps1` |
| First run, catch-up, or after a search change | `.\Get-HigherGovOpportunities.ps1 -Backfill -Since <yyyy-MM-dd> -AcceptQuotaCost` |
| Cap a run | add `-MaxRecords <n>` |

**The flag is `-AcceptQuotaCost`.** The script's own help text says `-Confirm`, which is wrong — the parameter block is authoritative. (Its help also claims the default run "fetch[es] documents for survivors"; that phase was never built. Both are stale-docs bugs, logged in `future-edits.md`.)

**Quota discipline.** The budget is 10,000 records/month. The script counts every record, probes before fetching, and hard-stops before the limit — but a wide backfill across many days is the one operation that can spend real quota. Check `-Status` for the month's usage first, and say what a run cost when reporting.

---

## Scoring the survivors

Candidates land in `RFP-pipeline/candidates/<slug>/candidate.md`, pre-stamped with provenance, `scoring_confidence: metadata-only`, `status: awaiting-scoring`, and `score: null`.

### Step 1 — Kill gates on every candidate

Apply Stage 1 of `skills/rfp-scoring-skill.md` — the six gates. They're pass/fail and need no math, which is exactly why they come first: most candidates die here, and a killed candidate costs almost nothing.

**Recompute "days until due" against today.** `days_until_due_at_capture` was correct when captured, not now. Gate 1 is 10 calendar days.

Watch two things the metadata makes easy to get wrong:

- **Gate 2 (custom vs COTS)** is the hardest call from a summary alone. When the record genuinely could go either way, **don't kill it — carry it forward and flag the uncertainty.** Killing a real opportunity off a paragraph is the more expensive error, and the Gate 2 "productized RFP with a viable custom path" edge case exists precisely for this.
- **Gate 5 (deal size)** — an unstated budget never auto-fails. Score it and note the uncertainty.

If a gate fails, stop on that candidate: record the gate and the one-line reason. No weighted score.

### Step 2 — Full weighted rubric on gate survivors

Apply Stage 2 in full — all eight categories, the real weights, the real decision thresholds. Don't invent a shortcut scoring scheme; comparability across RFPs is the entire point of the rubric.

**Ground the case-study category.** Category 1 is 25 of the 100 points and must be grounded in `resources/proposal-sources/Proposal - Case Studies.txt`, applying the adjacent-experience principle. Never invent a precedent to justify a score.

**Say what the summary couldn't tell you.** Every score from this skill is provisional; note per-candidate which categories were guessed at.

### Step 3 — Record the result

Update the candidate's frontmatter:

```yaml
status: scored            # was: awaiting-scoring
score: 78                 # was: null
recommendation: "Worth a look"
scoring_confidence: metadata-only
scored_date: "2026-07-21"
```

Leave `scoring_confidence: metadata-only` — it only becomes `full-text` after `skills/rfp-document-fetch-skill.md` pulls the real documents and the rubric is re-run.

For a gate failure, record `status: scored`, `score: 0`, `recommendation: "No-bid"`, and the failed gate.

Writing scores back means a re-run doesn't redo finished work, and the numbers survive the conversation.

---

## Handling volume honestly

A broad search over several weeks can produce hundreds of candidates. Two rules:

**Gates first is a real efficiency, not a shortcut.** It's how the rubric is designed — Stage 2 only runs if Stage 1 passes.

**Never cap silently.** If a run is too large to finish, stop and say so with numbers: *"148 candidates; gates applied to all; 31 survived; 20 fully scored, 11 not yet — say the word and I'll finish them."* A report that looks complete but isn't is worse than an honest partial one. Surface the number **before** grinding through hundreds, so Jake can redirect.

---

## Output format

```
PRELIMINARY SCORING — [date range]
==================================

INTAKE
------
Command run: [exact command]
Days drained: [n]  ([first] → [last])
Records fetched: [n]     Quota used this run: [n]     Month to date: [n] / 10,000
New candidates written: [n]     Already seen (deduped): [n]

KILLED BY PREFILTER — [n]
-------------------------
[reason]: [n]   e.g. due-in-under-10-days: 14, excluded-opp-type: 9, set-aside-denied: 3

KILLED BY GATES — [n]
---------------------
- [Title] — Gate [n] ([name]): [one-line reason]

SURVIVORS, RANKED
-----------------
| Score | Title | Agency | Due | Recommendation | Weakest evidence |
|---|---|---|---|---|---|
| 82 | ... | ... | ... | Strong Pursue | Deal size inferred |

WORTH FETCHING DOCUMENTS (75+)
------------------------------
- [Title] — [score] — [one line on why]

FLAGGED FOR A HUMAN LOOK
------------------------
- [Anything Gate 2 was ambiguous on, sensitive-industry flags, or a CEO-connection wildcard]

NOT YET SCORED
--------------
- [n] candidates gated but not weighted — or "none, all complete"
```

**Every score in this report is `metadata-only` and provisional. Say so in the report, not just here.**

---

## What happens next

| Score | Next step |
|---|---|
| **75+** | Run `skills/rfp-document-fetch-skill.md` → full-text re-score. That score is the real one. |
| **50–74** | Jake's judgement. No document fetch by default (current policy is 75+). |
| **Below 50** | No-bid. `skills/rfp-email-nobid-skill.md` if it deserves a written pass; otherwise the pipeline record is enough. |

A no-bid RFP gets no `RFPs/` folder — the reasoning lives in the pipeline record and, if written, the no-bid email.

---

## Notes and edit history

**v1.0 — July 21, 2026, Jake + Claude.** First version. Built at Jake's request so *"run preliminary scoring"* is a single instruction covering intake → gates → weighted score → ranked list. **Supersedes the planned `rfp-daily-recap` skill**, which described the same pipeline; that entry comes off CLAUDE.md's "Planned but not yet built" list rather than being built separately. Three design decisions, all Jake's: **kill gates on everything, weighted rubric only on gate survivors** (mirrors the rubric's own two-stage design and avoids spending most of the effort on candidates a single gate already killed); **scores written back into `candidate.md`** using the `score` / `status` / `scoring_confidence` fields the intake already emits, so re-runs don't redo finished work; and **one skill rather than two**. The pre-run checklist encodes the 2026-07-21 incident where a broadened saved search silently returned 564 federal and **zero** State/Local records — the half Seamgen actually sells into. Also documents that the tool's help text is wrong about `-Confirm` (the real flag is `-AcceptQuotaCost`) and about fetching documents (never built).

**How to edit this skill:** Change the text. It's Markdown. Save. Bump the version number and add a note describing what changed and why. If it ever conflicts with `skills/rfp-scoring-skill.md`, that skill wins — it owns the rubric.
