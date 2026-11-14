# ISA task spec: a demo of the proposed design isn't a product tell (Gate 2a)

## Problem and evidence

City of Laguna Beach's Website Redesign and Replacement Project (HigherGov `3c9634c4c00d5bffafe86bb2ecfaabfe`, due December 3) is custom municipal website work. On November 13 the Friday job:

- scored its listing **80, Strong Pursue**;
- read the full RFP and left Gate 2 open, with the reason "The redesign and development scope fits custom services. Gate 2a remains conditional because proposal-stage search and accessibility demonstrations are mandatory";
- set `subrules.product.hardProductObligations: true` and `conditional.rule: "2a"`, citing two lines: the consultant "shall demonstrate its proposed search functionality using representative municipal service questions", and "Demonstration of automated accessibility auditing tools or comparable functionality";
- reported it as "Ask the agency first" with no score. Its potential total was 78, and the why read "Looks like a product buy".

Jake's Gate 2a ([rfp-scoring-skill.md](../../../workspace/skills/rfp-scoring-skill.md)) counts as hard tells only "an existing-installs requirement or mandatory demonstrations of workflows that must already exist". The output contract in `rfp-scoring-judgment.mjs` shortened this to `existing installs / mandatory demos`, so any required demo could set the flag.

Separately, the report gives every ask-the-agency RFP the same "looks like a product buy" wording, even when only Gate 2a was the issue.

Audit check (four weeks, October 23 to November 13, 33 ask-the-agency entries): `conditional.rule` was `2a` exactly when `hardProductObligations` was true, so the report can rely on it. Laguna Beach was the only 2a case whose Gate 2 reason called the scope custom.

## Desired behavior and acceptance

1. **Prompt.** The output contract and a system rule state that a demo is a hard product tell only when it must show workflows already running in an existing product. A demo of a proposed design, a prototype or third-party tools is not. Skill v1.14 says the same. Offline test: the prompt carries the qualifier and no longer the bare `existing installs / mandatory demos`.
2. **Report wording.** Each report entry records `agencyRule` (`'2'` or `'2a'`; a numeric 2 is accepted).
   - Gate 2: "looks like a product buy, so it needs the agency's answer on a custom build first" (unchanged).
   - Gate 2a: "asks for proof a product vendor would have (existing installs or demos), so it needs the agency's answer on whether a services firm qualifies".
   - An entry without `agencyRule` (older results files) keeps the Gate 2 wording.
   - Offline tests cover all three.
3. **Real-model check.** Score from saved documents with this branch, at the November 13 run date, writing and sending nothing, as in the [scope-read check](../2026-11-13__rfp-scope-read/implementation.md):
   - Laguna Beach: no conditional route, and scored. Open Gates 4 and 6 don't hold back a score; they become blockers on the pick.
   - The four other November 13 Gate 2a cases must not become picks: University of Wyoming Event Management, Tempe Union Integrated Assessment, Canyons School District Visitor Management, Winston-Salem Document Manager.

   Ran November 13 and passed; see the [implementation record](implementation.md).

## Out of scope

- No change to gates, categories, points, thresholds, or the conditional route in `rfp-scoring-policy.mjs`.
- No change to the pursue email or Telegram text. Ask-the-agency RFPs aren't picks or close calls, so neither shows this wording.
- No deployment, scheduler or VM change without an explicit deployment request.

## Constraints and risks

- Looser 2a judgments could let a real product buy through. The check's four true 2a cases guard this; the next Friday audit should be compared with November 13's ask-the-agency list.
- The prompt hash in the audit changes, so before and after can be told apart. The rubric label is unchanged.
- Laguna Beach's questions are due November 17 at 5pm PT. This fix won't reach the Friday job before then, so sales should look at it directly.

## References

- `workspace/scripts/rfp-scoring-judgment.mjs`: output contract `subrules.product`, `SYSTEM_RULES`.
- `workspace/scripts/rfp-scoring-policy.mjs`: `applySubrules` (Gate 2a), `conditionalOutcome`.
- `workspace/scripts/rfp-report.mjs`: `CHECK_REASONS`, `checkReason`, `reportEntry`.
- November 13 audit (`npm run rfp:audit -- 2026-11-13`), not committed.
