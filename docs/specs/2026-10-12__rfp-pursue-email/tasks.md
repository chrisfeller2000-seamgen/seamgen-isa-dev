# ISA task checklist: RFP updates in Jake's format

- [x] Branch `feat/rfp-pursue-email` from `main` at `9289874`, which includes the ISA-3 scoring fixes. The worktree was clean.
- [x] Chris's decisions recorded (October 12): Jake's format, sent automatically, Telegram summary, no weekly summary email, no no-bid emails.
- [x] Open questions answered (October 12): Strong Pursue only, signed "ISA", sales@seamgen.com, no meeting brief.
- [ ] Peter's email address for `RFP_EMAIL_TO`.
- [x] Scorer: `buyer` field (the policy's existing citation check covers it), with a policy test showing points and decisions are unchanged.
- [ ] `rfp-report.mjs`:
  - [x] entry fields (`buyer`, `blockers`, `sensitive`), plus plain gate reasons;
  - [x] pursue facts, sentence checks and fallback, email renderer;
  - [x] shared `writeChecked` helper;
  - [x] Telegram summary;
  - [x] delete the old report email and unused helpers;
  - [x] tests.
- [x] Weekly script: email then Telegram, the once-a-week guard, the `email` record, `.html` removed, preview files.
- [x] Cron wrapper: `RFP_EMAIL_TO` (Marianne and sales@ until Peter's address is known).
- [x] `npm run rfp:preview`, a synthetic fixture, and `score-sample.mjs --entries`.
- [x] `workspace/AGENTS.md` RFP section, `docs/domains/rfp/README.md`, specs index, October 6 spec note.
- [ ] Check on the VM that `gog gmail send --to` takes comma-separated addresses.
- [ ] `npm test`, `npm run check`, diff review and secret scan.
- [x] VM preview on Jake's archive (October 12, temporary folder, removed afterwards). This branch's scorer re-scored his July Strong Pursues, and ISA wrote the email and message. Fixes from it:
  - the opening line's count;
  - missing-link filler;
  - Jake's byte-order-mark files;
  - blocker sentences;
  - null scores in Telegram.

  Yonkers matches Jake: a no-bid on the 3-reference requirement, "silent on any incumbent", nearly the same objective, and the BidNet and references blockers.
  The first 9-RFP run was skewed: Jake's candidate files contain his own scoring notes ("KILL GATES … PASS"), and the scorer read them. Fixed on `fix/rfp-scorer-intake-text`, so the ISA-3 comparison can re-score his files as they are.
- [ ] Chris reviews the final preview email (`.isa-local/vm-preview/`).
- [ ] Before switching it on: ISA-3 deployed, and Jake's July Strong Pursues re-checked.
- [ ] Release, with explicit approval: guarded deploy, `RFP_EMAIL_TO` set, release recorded here.
- [ ] After the first live Friday: email, Telegram, `email` record, no mail-sync deals, log.
