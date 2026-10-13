# RFP workflow

ISA's RFP pillar turns HigherGov opportunities into candidate records, scores likely fits, tries to collect solicitation evidence, and prepares pursue-decision material. Proposal skills cover later human-led work. Read [document qualification](document-qualification.md) for the automated job and [proposal handoff](proposal-handoff.md) for the downstream skill set.

## Main flow

The weekly job in `workspace/scripts/weekly-rfp-pursue-decision.mjs` runs intake, scores candidate metadata, optionally fetches documents for candidates above the preliminary threshold, then applies fuller qualification and prepares a report. Its normal path writes runtime candidate/report state and can use HubSpot, Drive, Gmail, and Telegram. `workspace/tools/Get-HigherGovOpportunities.ps1` and the RFP skills describe related workflows, but do not assume they are the exact implementation of the scheduled Node job.

## Friday update

`workspace/scripts/rfp-report.mjs` turns each run into one results file, `reports/new-rfp-qualification/<run date>.json` and `latest.json`, with one entry per RFP. Each entry is in one tier:

- **Strong pursue.**
- **Worth a look.**
- **Couldn't check yet:** documents missing or unreadable, or scoring didn't finish.
- **Screened out:** with a plain reason.

From that file:

- **The email** to Marianne lists every RFP by tier. It is built by code, and its subject must not change, because the mail-to-HubSpot job matches it.
- **The Telegram message** names up to three RFPs whose documents ISA read, asks the team the open questions, and names the biggest skipped RFP a partner could rescue. ISA's model writes it in ISA's voice from facts the code prepares. `checkTelegramDraft()` compares every link and number with those facts; if anything differs or the writer fails, the code-built version is sent.
- **The results file** records which version was sent and why. ISA's chat reads the file to answer questions about the week's RFPs.

`RFP_DELIVERY=preview` writes the same files, including the Telegram text, but sends no email or Telegram message and creates no Drive folders. It still runs intake, so use it only with an isolated `WORKSPACE_DIR`.

If the run fails, the cron wrapper posts one failure notice to the group. See the [weekly update spec](../../specs/2026-10-06__rfp-weekly-messages/spec.md).

## Invariants and sharp edges

- A metadata score is provisional; it must not be presented as document-backed qualification. Track `document_status`, `qualification_status`, and `scoring_confidence` separately.
- The real solicitation and required scoring attachments matter. Empty or portal-gated document sets cannot become full-text simply because HigherGov returned a listing or a public summary.
- From a `candidate.md`, the scorer reads only listed frontmatter fields and HigherGov's summary and description sections (`intakeText` in `rfp-scoring-policy.mjs`). Scores and notes written into the file never reach it. Examples are the preliminary-scoring skill's results, Jake's "KILL GATES" screens, and the intake's note to the old chat scorer. Jake's candidate files can be re-scored as they are.
- Candidate and `resources/` folders are runtime/customer data, not versioned source. The document manifest should describe what was returned, saved, extracted, blocked, or missing without storing credentials or signed links.
- RFP skills are not all consistent with current code: in this snapshot, `rfp-document-fetch-skill.md` is byte-identical to `rfp-document-refresh-skill.md` and identifies itself as refresh. Verify the intended fetch procedure before relying on that file.

Offline RFP tests include the synthetic document-flow fixture in `devtools/rfp-fixture.test.mjs`, pure deadline/scoring regressions in `devtools/rfp-deadline.test.mjs`, the isolated secondary report fixture in `devtools/rfp-deadline-report.test.mjs`, the secondary evidence gate and file-role checks in `devtools/rfp-secondary-evidence.test.mjs`, and the rubric cases in `devtools/rfp-alignment.test.mjs`. They do not prove real portal access, complete document qualification, or scheduled production behavior. See [integrations](../../integrations.md) and [security](../../security.md).

The local scoring implementation shares `rfp-scoring-policy.mjs` and `rfp-scoring-judgment.mjs` between weekly and secondary scoring. It replaces their divergent keyword totals with grounded judgments, validated gates/categories, and code-computed decisions. It reuses ISA's model configuration; no separate model service or credentials are introduced.

[Rubric alignment](rubric-alignment.md) describes the recorded-judgment tests. Initial [real-model checks](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md) have also run, but complete AI alignment and production behavior remain unverified. The [implementation record](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md) lists private company-source prerequisites and the separate evaluation/release steps.
