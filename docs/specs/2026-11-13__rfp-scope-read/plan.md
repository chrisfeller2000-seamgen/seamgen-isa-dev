# ISA implementation plan: score an RFP when its scope was read

## Approach and alternatives

Ask the model one direct question at full-text depth: were the supplied buyer documents enough to describe the work? Make that answer, not the per-document `scope` label, the thing that blocks a score. Keep the per-document label, narrowed, to decide what a scored RFP's blocker says: "part of the scope wasn't read, confirm it" for a scope document, and "missing referenced document" for anything else.

Alternatives considered:

- **Narrower prompt wording alone.** Cheapest, but it keeps the same question, a per-document guess. The model leans cautious, and five weeks of audits show the drift growing.
- **A role enum per document** (`primary-scope | supplementary-scope | amendment | external-standard | form`). Same effect, but it replaces a field older audit records and tests rely on, and asks the model for more labels per answer.
- **Cap a 75+ at Worth a look when a scope document is unread.** Rejected on November 13. A real pursue missing only a matrix or an appendix would never reach the pursue email. Rhode Island is stopped by `scopeRead.read: false`, not by a cap. If a partly read Strong Pursue goes wrong, the cap is the fallback.

## Source and insertion points

1. `workspace/scripts/rfp-scoring-judgment.mjs`
   - Output contract: add `scopeRead: { read, reason, evidence }` for full-text depth.
   - Narrow the `requiredDocuments[].scope` description.
   - Rules: replace the full-text `scope` rule with the `scopeRead` definition, naming cover sheets, portal summaries and forms-only packets as `read: false`. List what is `scope: false`: amendments and Q&A unless they replace the scope, external standards and policies, and figures and diagrams.
2. `workspace/scripts/rfp-scoring-policy.mjs`
   - New `scopeRead(judgment, sources, phase)` validator beside `requiredDocuments`. At full-text depth: `read` must be a boolean, and `reason` non-empty. When `read` is true, `evidence` needs at least one citation of kind `document`. It is ignored at preliminary depth.
   - `finalizeRfpScore`: replace the `unreadScope` block.
     - If `scopeRead.read` is false: Needs documents, with `Scope not read: …` and any missing scope documents.
     - If it is true with unread `scope: true` documents: push the `Part of the scope wasn't read: …` reason and score as usual.
   - Keep the existing checks before it: known gate failure, not open, deadline needs review without categories, document completeness, and unread documents without categories.
   - The conditional route and the final recommendation are unchanged.
3. The audit's `rules.prompt` (the system prompt's SHA-256) changes with the new rule text, so audits before and after can be told apart. The rubric label stays `Jake v1.8 + approved deadline correction`, because gates, categories and points are unchanged.
4. `workspace/scripts/rfp-report.mjs`: check that the scope reason reaches the report's blockers and open questions in plain words. The report's internal-code filter must not swallow it.
5. `devtools/rfp-audit.mjs`: add `Scope read` (yes/no/blank) and its reason to the Details tab. Older records without the field show blank.
6. `workspace/skills/rfp-scoring-skill.md`: version note v1.13, plus Needs documents wording, so ISA explains an unread scope, or a scored RFP with part of its scope unread, correctly in chat.
7. `docs/domains/rfp/document-qualification.md`: replace "Scope documents (October 26)" with the new rule and the November 13 evidence, keeping the Rhode Island history.

## Invariants and side effects

- A known gate failure still wins over any document question.
- `scopeRead.read: false` never produces a total or a pursue.
- An RFP with an unread `scope: true` document always carries the "confirm before bidding" blocker.
- Nothing here sends mail, posts to Telegram, writes HubSpot, or fetches documents; the change is in scoring only. Its effect on the Friday email appears only after deployment.
- A rejected answer retries once (existing behavior). A second rejection leaves the RFP unscored, as today.

## Context to keep beside code

- Beside the `scopeRead` check: why it replaced the per-document block. Rhode Island PDMP (October 23) is still the case it must stop; November 13's seven read-but-blocked RFPs are the case it must not.
- Beside the blocker: why a partly read scope scores with a note rather than a cap.
- Beside the prompt rule: the `scope: false` examples, so a later edit doesn't widen it again.

## Verification and release boundary

Offline (`npm test`, `npm run check`):

- `devtools/rfp-scoring-policy.test.mjs` cases:
  - cover sheet only (`read: false`) → Needs documents;
  - RFP read, with missing state policies, amendments, Q&A answers or diagrams marked `scope: false` → scored, Strong Pursue at 75+;
  - RFP read, with a missing requirements matrix marked `scope: true` → Strong Pursue at 75+, with the "confirm before bidding" blocker;
  - `read: true` citing only metadata → rejected;
  - missing `scopeRead` at full text → rejected;
  - preliminary without `scopeRead` → unaffected;
  - known gate failure plus `read: false` → No-bid.
- Update existing fixtures in `devtools/fixtures/rfp-alignment-cases.mjs` and the report and audit tests to carry `scopeRead`.
- `rfp-audit` test: an old record without `scopeRead` still writes a workbook.

Model check (real model calls; run only with explicit approval):

- Run `devtools/score-sample.mjs` from a temporary copy of this branch on the VM, at the original assessment dates. It reads saved documents and writes and sends nothing.
- Use the 13 cases in the [spec](spec.md) table and record each `scopeRead` and outcome in `implementation.md`.
- Pass criteria:
  - the four cover-sheet / question-portal cases, plus MLOps, East Hartford and Dallas ISD, stay Needs documents;
  - Student Portal, Guilford, Wendell, Lexington and Montgomery score;
  - Danville scores with the "confirm before bidding" blocker.

Release: a normal guarded `npm run live:deploy` preview, then `--apply` only on an explicit deployment request. The next Friday run's audit is the live check: compare the count of read-but-blocked RFPs with November 13. Rollback is the previous `rfp-scoring-policy.mjs` and `rfp-scoring-judgment.mjs` from the deployment backup.
