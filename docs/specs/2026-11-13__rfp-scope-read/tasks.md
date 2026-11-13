# ISA task checklist: score an RFP when its scope was read

- [x] Check branch/worktree and integration target. `fix/rfp-scope-documents` (#26) is merged into `main`; this is new work on `fix/rfp-scope-read` from `main` at `91680ca`.
- [x] Collect evidence from the November 13, November 6 and October 23 audit files (read-only `npm run rfp:audit`).
- [x] Judgment contract and rules: add `scopeRead`, narrow `requiredDocuments[].scope`.
- [x] Policy: `scopeRead` validator; replace the unread-scope block; an unread scope document becomes a blocker note (`missing_scope`).
- [x] Audit `rules.prompt` hash changes with the rule text; no rubric label change.
- [x] Report: the scope blocker comes first, in plain words, with the RFP text that names the document.
- [x] `rfp:audit` Details tab: `Scope read` column; checked against the 301 real November 13 records, which predate the field.
- [x] Tests: the policy cases in the plan; shared fixture, report and audit tests.
- [x] Docs: `document-qualification.md` scope section; `rfp-scoring-skill.md` v1.13; specs README entry.
- [x] Run `npm test` (231 pass) and `npm run check`; review the diff; fixtures use invented RFP names only.
- [x] With approval only: model check of the 13 spec cases on the VM (one-off runner like `score-sample.mjs`). All 13 matched; results in `implementation.md`.
- [ ] With an explicit deployment request only: guarded deploy, then compare the next Friday audit.
