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

- **The pursue email** goes to Peter, Marianne and Sales (`RFP_EMAIL_TO`) when there are Strong Pursue RFPs, in Jake's format (`workspace/skills/rfp-email-pursue-skill.md`): per RFP, a Drive folder link, what they use today and want, why it fits us, and up to three blockers. ISA's model writes only the sentences; code adds the subject, titles, links and sign-off, and `checkPursueSentences()` checks the sentences against the facts. If anything differs or the writer fails, code-built sentences are used. What the buyer uses today comes from the scorer's `buyer` field, which never affects points.
- **The subject must never match the mail-to-HubSpot job's pursue pattern** (`RFP_PURSUE_SUBJECT_PATTERN`). That job turns matching emails from isa@ into deals, paragraph by paragraph, so a match would create junk deals. A test keeps the two patterns in step.
- **At most one pursue email per week.** A re-run in the same week sends nothing new; a failed send can be retried.
- **The Telegram message** is a short summary of what happened: the email was sent (with each RFP's score and biggest blocker), it failed, or nothing was worth pursuing (with the closest one and why). ISA writes the "sent" version, checked like the email; the other two are code-built.
- **The results file** records the email and the message, who wrote them, and why a code-built version was used. ISA's chat reads it to answer questions about the week's RFPs.

`RFP_DELIVERY=preview` writes the same files plus the email and Telegram text (`<run date>-email.html`, `<run date>-telegram.md`), but sends nothing and creates no Drive folders. It still runs intake, so use it only with an isolated `WORKSPACE_DIR`. To review the wording without running the job, use `npm run rfp:preview -- <results file>` (add `--isa` for ISA's own words).

If the run fails, the cron wrapper posts one failure notice to the group. See the [pursue email spec](../../specs/2026-10-12__rfp-pursue-email/spec.md) and the earlier [weekly update spec](../../specs/2026-10-06__rfp-weekly-messages/spec.md).

## Invariants and sharp edges

- A metadata score is provisional; it must not be presented as document-backed qualification. Track `document_status`, `qualification_status`, and `scoring_confidence` separately.
- The real solicitation and required scoring attachments matter. Empty or portal-gated document sets cannot become full-text simply because HigherGov returned a listing or a public summary.
- Candidate and `resources/` folders are runtime/customer data, not versioned source. The document manifest should describe what was returned, saved, extracted, blocked, or missing without storing credentials or signed links.
- RFP skills are not all consistent with current code: in this snapshot, `rfp-document-fetch-skill.md` is byte-identical to `rfp-document-refresh-skill.md` and identifies itself as refresh. Verify the intended fetch procedure before relying on that file.

Offline RFP tests include the synthetic document-flow fixture in `devtools/rfp-fixture.test.mjs`, pure deadline/scoring regressions in `devtools/rfp-deadline.test.mjs`, the isolated secondary report fixture in `devtools/rfp-deadline-report.test.mjs`, the secondary evidence gate and file-role checks in `devtools/rfp-secondary-evidence.test.mjs`, and the rubric cases in `devtools/rfp-alignment.test.mjs`. They do not prove real portal access, complete document qualification, or scheduled production behavior. See [integrations](../../integrations.md) and [security](../../security.md).

The local scoring implementation shares `rfp-scoring-policy.mjs` and `rfp-scoring-judgment.mjs` between weekly and secondary scoring. It replaces their divergent keyword totals with grounded judgments, validated gates/categories, and code-computed decisions. It reuses ISA's model configuration; no separate model service or credentials are introduced.

[Rubric alignment](rubric-alignment.md) describes the recorded-judgment tests. Initial [real-model checks](../../specs/2026-09-30__jake-scoring-alignment-minimal/model-evaluation.md) have also run, but complete AI alignment and production behavior remain unverified. The [implementation record](../../specs/2026-09-30__jake-scoring-alignment-minimal/implementation.md) lists private company-source prerequisites and the separate evaluation/release steps.
