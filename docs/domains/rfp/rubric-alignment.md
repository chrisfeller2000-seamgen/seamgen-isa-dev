# RFP rubric alignment tests

Both Node scoring paths apply Jake's written rubric through one shared AI-judgment adapter (`rfp-scoring-judgment.mjs`) and one pure finalizer (`rfp-scoring-policy.mjs`). The offline tests feed **synthetic recorded judgments**, not real model answers. They prove validation, arithmetic, caller wiring, and storage, not AI interpretation or deployed behavior.

Run `npm test` and `npm run check`. There is no separate alignment command.

## What is covered

- `devtools/rfp-alignment.test.mjs` runs the 32 rubric cases in `devtools/fixtures/rfp-alignment-cases.mjs` through the real intake prefilter, document check, and finalizer, at preliminary and full-text depth. Expectations are rubric-derived and Jake has not reviewed them; the portal cover-sheet case is a project rule added after Rhode Island's PDMP. The old keyword scorer passed 12 of the first 31.
- `devtools/fixtures/rfp-recorded-judgments.mjs` supplies invented, evidence-grounded decisions and company records. They are fixture inputs, not measured model judgments or current Seamgen claims.
- `devtools/rfp-scoring-policy.test.mjs`:
  - citation, project, credential, and partner grounding;
  - reference limits, value uncertainty, conditional routes, competitive deductions, and flags;
  - the preliminary documents-to-retrieve rule;
  - persistence, document-fetch selection (50+), and report classification;
  - malformed answers, missing private assets, timeouts, and the tools-free SDK request.
- `devtools/rfp-evidence-reference.test.mjs`: the excerpt-ID wire format. Paragraph IDs are deterministic, source text is fully covered and resolved exactly, and unknown or unused IDs fail.
- `devtools/rfp-secondary-evidence.test.mjs`, `rfp-deadline-report.test.mjs`, and `rfp-fixture.test.mjs` run the real secondary and weekly entry points offline. They cover the Needs documents gate, file roles, report counts, and deadlines.

A valid excerpt ID proves the cited text exists, not that the model read it correctly.

## Gates 2 and 6 after the October 9 comparison

On October 9, Jessica ran Jake's system on ISA's 8 "worth a look" RFPs, and it no-bid all of them. On the three read in full, ISA had found the same reference and experience requirements but left them as open questions instead of failing Gate 6.

Since October 12:
- A mandatory minimum that the case library and Jake's standing facts clearly can't meet fails Gate 6. Examples are 3+ government references, or years of a product Seamgen has never delivered. Eligibility stays unknown only when the requirement is unclear, or when passing would rest on a credential that needs a current record.
- One required government reference is covered by Jake's standing fact (Florida DEP, `GOVERNMENT_REFERENCES` in the policy). A second still needs the RFP to accept nonprofit or federal work.
- Gate 2 has Jake's three outcomes: pass, fail, or Conditional — Ask the Agency. Buying, licensing, hosting, or configuring an existing product fails unless the custom share is clearly material (about 40%+) or the conditional route applies. A re-score of the 8 on October 12 left this gate open on 3 RFPs that Jake's system failed, which is why this rule was added.

Since October 26, ISA departs from Jake's "pass with a note" for these two gates. After the documents are read, an open Gate 2 or Gate 6 is Needs review (shown as Worth a look with the question), never Strong Pursue. Rhode Island's PDMP went out as a 75 Strong Pursue with both open, scored from the bid board's cover sheet; its specification asked for an out-of-the-box product and prior PDMP installs. See [document qualification](document-qualification.md).

Whether the model now matches Jake's calls is measured by the sample comparison in Jira ISA-3, not by these tests.

## What remains unproven

These tests do not involve a real model, HigherGov, the scheduler, report delivery, or CRM/Drive writes. Real-model checks are recorded separately in the [scoring alignment spec](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md). Practical alignment with Jake's workflow, current company qualifications, and batch latency still need a bounded, approved model run.
