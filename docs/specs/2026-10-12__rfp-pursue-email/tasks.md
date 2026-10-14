# ISA task checklist: RFP updates in Jake's format

- [x] Branch `feat/rfp-pursue-email` from `main` at `9289874`, which includes the ISA-3 scoring fixes. The worktree was clean.
- [x] Chris's decisions recorded (October 12): Jake's format, sent automatically, Telegram summary, no weekly summary email, no no-bid emails.
- [x] Open questions answered (October 12): Strong Pursue only, signed "ISA", sales@seamgen.com, no meeting brief.
- [x] Peter's email address for `RFP_EMAIL_TO` (October 13).
- [x] Scorer: `buyer` field (the policy's existing citation check covers it), with a policy test showing points and decisions are unchanged.
- [ ] `rfp-report.mjs`:
  - [x] entry fields (`buyer`, `blockers`, `sensitive`), plus plain gate reasons;
  - [x] pursue facts, sentence checks and fallback, email renderer;
  - [x] shared `writeChecked` helper;
  - [x] Telegram summary;
  - [x] delete the old report email and unused helpers;
  - [x] tests.
- [x] Weekly script: email then Telegram, the once-a-week guard, the `email` record, `.html` removed, preview files.
- [x] Cron wrapper: `RFP_EMAIL_TO` (Peter, Marianne and sales@).
- [x] `npm run rfp:preview`, a synthetic fixture, and `score-sample.mjs --entries`.
- [x] `workspace/AGENTS.md` RFP section, `docs/domains/rfp/README.md`, specs index, October 6 spec note.
- [x] Checked on the VM (October 14): `gog` v0.33.0 takes comma-separated `--to` and `--cc`, and `--body-html`.
- [x] `npm test` (150), `npm run check`, diff review; no new RFP details beyond what the public repo already has.
- [x] VM preview on Jake's archive (October 12, temporary folder, removed afterwards). This branch's scorer re-scored his July Strong Pursues, and ISA wrote the email and message. Fixes from it:
  - the opening line's count;
  - missing-link filler;
  - Jake's byte-order-mark files;
  - blocker sentences;
  - null scores in Telegram.

  Yonkers matches Jake: a no-bid on the 3-reference requirement, "silent on any incumbent", nearly the same objective, and the BidNet and references blockers.
  The first 9-RFP run was skewed: Jake's candidate files contain his own scoring notes ("KILL GATES … PASS"), and the scorer read them. Fixed on `fix/rfp-scorer-intake-text`, so the ISA-3 comparison can re-score his files as they are.
- [x] Chris and the team reviewed sample emails and the Telegram message (October 13).
- [x] ISA-3 is live (PR #11 was already on the VM), and Jake's July Strong Pursues were re-checked: same pursue-or-skip call as his rubric on 8 of 9.
- [x] Released October 14, 2026 (Chris's request), from `release/2026-10-13-live`, PR #14:
  - 00:35 UTC: commit `f6f01a9`, 7 workspace files (AGENTS.md, rfp-report, rfp-scoring-judgment, rfp-scoring-policy, the cron wrapper, weekly-rfp-pursue-decision, rfp-scoring-skill). Backup: `backups/dev-deploy-2026-10-14T00-31-58-255Z-f6f01a9`.
  - 00:39 UTC: commit `745a48c`, the cron wrapper only, holding Peter back. Backup: `backups/dev-deploy-2026-10-14T00-39-44-767Z-745a48c`.
  - Before upload, the VM matched main exactly (OCR and PR #11 were live). After it, `live:pull` shows no differences. On the VM's Node 24, the deployed modules import and build a sample email without the model.
  - Recipients: to Marianne and sales@, cc cfeller@ and jgaribay@. Peter joins later.
- [ ] After the first live Friday: email, Telegram, `email` record, no mail-sync deals, log.
