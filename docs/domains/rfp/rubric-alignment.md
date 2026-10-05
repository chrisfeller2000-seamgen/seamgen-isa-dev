# RFP rubric alignment tests

Both Node scoring paths apply Jake's written rubric through one shared AI-judgment adapter (`rfp-scoring-judgment.mjs`) and one pure finalizer (`rfp-scoring-policy.mjs`). The offline tests feed **synthetic recorded judgments**, not real model answers. They prove validation, arithmetic, caller wiring, and storage, not AI interpretation or deployed behavior.

Run `npm test` and `npm run check`. There is no separate alignment command.

## What is covered

- `devtools/rfp-alignment.test.mjs` runs the 31 rubric cases in `devtools/fixtures/rfp-alignment-cases.mjs` through the real intake prefilter, document check, and finalizer, at preliminary and full-text depth. Expectations are rubric-derived and Jake has not reviewed them. The old keyword scorer passed 12 of 31.
- `devtools/fixtures/rfp-recorded-judgments.mjs` supplies invented, evidence-grounded decisions and company records. They are fixture inputs, not measured model judgments or current Seamgen claims.
- `devtools/rfp-scoring-policy.test.mjs`:
  - citation, project, credential, and partner grounding;
  - reference limits, value uncertainty, conditional routes, competitive deductions, and flags;
  - the preliminary documents-to-retrieve rule;
  - persistence, 75+ selection, and report classification;
  - malformed answers, missing private assets, timeouts, and the tools-free SDK request.
- `devtools/rfp-evidence-reference.test.mjs`: the excerpt-ID wire format. Paragraph IDs are deterministic, source text is fully covered and resolved exactly, and unknown or unused IDs fail.
- `devtools/rfp-secondary-evidence.test.mjs`, `rfp-deadline-report.test.mjs`, and `rfp-fixture.test.mjs` run the real secondary and weekly entry points offline. They cover the Needs documents gate, file roles, report counts, and deadlines.

A valid excerpt ID proves the cited text exists, not that the model read it correctly.

## What remains unproven

These tests do not involve a real model, HigherGov, the scheduler, report delivery, or CRM/Drive writes. Real-model checks are recorded separately in the [scoring alignment spec](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md). Practical alignment with Jake's workflow, current company qualifications, and batch latency still need a bounded, approved model run.
