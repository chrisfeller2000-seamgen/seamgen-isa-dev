# ISA task spec: score an RFP when its scope was read, even if a supporting document is missing

## Problem and evidence

The Friday job (`weekly-rfp-pursue-decision.mjs`, full-text pass) stops a scored RFP at **Needs documents** whenever the model lists a missing document with `scope: true` ([rfp-scoring-policy.mjs](../../../workspace/scripts/rfp-scoring-policy.mjs), the `unreadScope` check in `finalizeRfpScore`). The rule came from Rhode Island's PDMP RFP. On October 23 only the bid board's cover sheet was read, and the RFP went out as a 75 Strong Pursue. The specification, read later, asked for an out-of-the-box product ([document qualification](../../domains/rfp/document-qualification.md), "Scope documents").

The model is asked to label each missing document, and anything that "defines the work" counts as scope. In practice it also labels amendments, Q&A answers, state IT policies, figures and requirement matrices as scope, even when the main solicitation was downloaded and read. One such label holds back an otherwise complete score.

Evidence from the weekly audit files (`npm run rfp:audit`, read-only copies in `.isa-local/audit/`):

| Run | RFPs read at full text but stopped for a missing scope document |
| --- | --- |
| October 23 and 30 | 0 |
| November 6 | 5 |
| November 13 | 7 |

November 13 had no Strong Pursue and no full-text total for any RFP. The blocked RFPs, with the document the model called scope:

| RFP (listing score) | Was the main solicitation read? | Missing "scope" document | Correct result |
| --- | --- | --- | --- |
| MA DHE Student Portal RFQ (84) | Yes; Gate 2 passed on the documents | Posted COMMBUYS amendments and Q&A answers | Scored |
| Guilford Tech Academic Operations Platform (73) | Yes (`doc-1` is the RFP) | Four North Carolina statewide policies and standards | Scored |
| Wendell Citizen Request Management (72) | Yes (`doc-1` is the RFP) | Appendix B workflow diagrams (figures did not extract) | Scored |
| Danville Enterprise Technology Management (70) | Yes | Solution requirements matrix (.xlsx) | Scored, with a note that part of the scope was unread |
| U Michigan MLOps Infrastructure (79) | Only a summary PDF | Statement of work, technical standards workbook | Needs documents |
| East Hartford Family Communications (66) | Only a portal cover sheet | The RFP itself | Needs documents |
| Dallas ISD Special Education Records (72) | Only forms and general terms | Statement of work | Needs documents |
| *November 6:* Lexington County Records Management (77) | Yes | Amendments and written clarifications | Scored |
| *November 6:* Montgomery College Ticketing (67) | Yes | College IT, security and accessibility standards | Scored |
| *November 6:* RI Alert Warning System (67), RI CCRI One-Card (65) | Cover sheet only | Scope of work / specifications | Needs documents |
| *November 6:* UConn Time and Effort Reporting (65) | Question portal only | The RFP itself | Needs documents |
| *October 23:* RI DOH PDMP (73) | Cover sheet only | Agency solicitation specifications | Needs documents (regression case) |

These "correct result" values are the reviewer's reading of the audit's citations and file names, not a reproduced re-score. The model check in the [plan](plan.md) confirms them.

## Desired behavior and acceptance

The full-text question changes from "is any missing document scope?" to "**did we read the scope?**". There are three changes:

1. **The model says whether the scope was read.** At full-text depth the answer carries `scopeRead: { read, reason, evidence }`. `read: true` means the supplied buyer documents describe the work in enough detail to judge Gate 2 (custom build vs product), Gate 3 and the categories. That evidence must quote a supplied buyer document; listing text does not count. A cover sheet, a portal summary, or forms and terms alone are `read: false`.
2. **A narrower `scope` label on missing documents.** `scope: true` covers only a document the work description depends on: a specification, statement of work, or functional or technical requirements. These are `scope: false`, alongside forms, insurance, terms and pricing templates:
   - amendments, addenda and Q&A answers, unless one replaces the scope;
   - external standards, policies, codes and laws the buyer refers to;
   - figures and diagrams.
3. **Score with a note instead of blocking.** The policy decides from both fields:

| `scopeRead.read` | Unread `scope: true` documents | Result |
| --- | --- | --- |
| false | any | **Needs documents** (as today), reason `Scope not read: <reason>` plus the missing scope documents |
| true | none | Scored normally; unread `scope: false` documents stay a `Missing referenced document` note |
| true | one or more | Scored normally, Strong Pursue included, with the blocker `Part of the scope wasn't read: <names>. Confirm it before bidding.` |

Acceptance:

- The Rhode Island PDMP cover-sheet fixture, and the November 6 Rhode Island and UConn shapes, still return **Needs documents**.
- A fixture where the RFP was read and only state policies, amendments, Q&A answers or diagrams are missing returns a scored result, Strong Pursue when 75+.
- A fixture where the RFP was read and a requirements matrix marked `scope: true` is missing returns its normal recommendation (Strong Pursue at 75+) with the blocker text above.
- Full-text answers without `scopeRead` are rejected and retried once, the same way a missing `scope` label is today. `read: true` without a buyer-document citation is rejected.
- Preliminary (listing) answers don't need `scopeRead` and are unaffected.
- Known gate failures, closed or watch notices, deadline review and the Ask the Agency route keep their current order.
- The audit file and the `rfp:audit` Details tab show `scopeRead` for each full-text answer.
- The Friday report and pursue email show the scope blocker in plain words, with no internal codes.

## Out of scope

- Fetching amendments, Q&A answers or attachments from agency portals (COMMBUYS, eVP and others). That belongs with [posting documents](../2026-11-03__rfp-posting-documents/spec.md).
- The Ask the Agency (conditional Gate 2) route, the gates, category bands, thresholds and points.
- Any live VM upload, scheduler change, or re-run of the Friday job. The model check runs only with explicit approval (see [plan](plan.md)).
- Re-scoring past weeks or editing past audit files.

## Constraints and risks

- **Regression to the PDMP failure.** The risk is the model saying `read: true` for a cover sheet. Mitigations:
  - the prompt names cover sheets, portal summaries and forms-only packets as `read: false`;
  - `read: true` must quote a buyer document;
  - the model check includes all four cover-sheet cases.
- **A Strong Pursue on a partly read scope.** Chosen on November 13 over capping at Worth a look, so a real pursue missing only a matrix or appendix still reaches the team. The blocker tells them what to confirm before bidding. If such a pursue turns out wrong, capping is the fallback.
- **Over-correction the other way.** Narrowing `scope` could relabel a real addendum that replaces the scope. The prompt keeps that exception.
- **Answer-format change.** The prompt hash changes, so audit files before and after are distinguishable. Old audit records have no `scopeRead`; `rfp:audit` must show them as blank, not fail.
- **No new outbound effects.** The change can move an RFP from Couldn't check yet to Worth a look or Strong Pursue, which changes who appears in the Friday pursue email. That only takes effect after a reviewed deployment.

## References

- [rfp-scoring-policy.mjs](../../../workspace/scripts/rfp-scoring-policy.mjs): `requiredDocuments`, `finalizeRfpScore`
- [rfp-scoring-judgment.mjs](../../../workspace/scripts/rfp-scoring-judgment.mjs): output contract and rules for `requiredDocuments`
- [Document qualification](../../domains/rfp/document-qualification.md): "Scope documents (October 26)"
- [Secondary scorer: no final score without the solicitation](../2026-10-05__rfp-needs-documents/spec.md), #26 (the original scope rule)
- Weekly audit files for 2026-10-23, 2026-11-06 and 2026-11-13 (local, untracked, under `.isa-local/audit/`)
