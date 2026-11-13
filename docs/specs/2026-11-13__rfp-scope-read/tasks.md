# ISA task checklist: score an RFP when its scope was read

- [x] Check branch/worktree and integration target. `fix/rfp-scope-documents` (#26) is merged into `main`; this is new work on `fix/rfp-scope-read` from `main` at `91680ca`.
- [x] Collect evidence from the November 13, November 6 and October 23 audit files (read-only `npm run rfp:audit`).
- [ ] Judgment contract and rules: add `scopeRead`, narrow `requiredDocuments[].scope`.
- [ ] Policy: `scopeRead` validator; replace the unread-scope block; an unread scope document becomes a blocker note.
- [ ] Record the rubric rule and prompt change in the audit's `rules`.
- [ ] Report: the scope blocker reads plainly in the Friday report and pursue email.
- [ ] `rfp:audit` Details tab: `Scope read` column; tolerate older records.
- [ ] Tests: the policy cases in the plan; update shared fixtures, report and audit tests.
- [ ] Docs: `document-qualification.md` scope section; `rfp-scoring-skill.md` v1.13; specs README entry.
- [ ] Run `npm test` and `npm run check`; review the diff; check that no customer data is in fixtures.
- [ ] With approval only: model check of the 13 spec cases via `score-sample.mjs` on the VM, results in `implementation.md`.
- [ ] With an explicit deployment request only: guarded deploy, then compare the next Friday audit.
