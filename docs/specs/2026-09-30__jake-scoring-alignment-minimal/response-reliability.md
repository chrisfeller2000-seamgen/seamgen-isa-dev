# Evidence-reference reliability follow-up

September 30, 2026. User authorized this focused follow-up after the original-recipe comparison rejected five of eight ISA answers for unsupported retained quotations. Local work only; no deployment.

## Change

Keep Jake's gates, category bands, thresholds, source-kind checks, and strict finalizer. Replace only the AI evidence wire format: supply every source paragraph with an excerpt ID; the AI selects IDs and code attaches the original source text. Long paragraphs are split into bounded chunks; substantive source text is not truncated. Required attachment IDs continue to identify document sources, not excerpts.

Reject unknown IDs, model-generated quotation fields, malformed references, excessive evidence, and unsafe/deep structures. Validate all references, including non-decisive citations on a gate-failure route. No fuzzy quote repair, retries, or new model. Preserve prompt isolation and existing tools-free completion boundaries.

Restate existing optional-AI and standard-compliance bands in the serialization prompt to address observed interpretation drift. Do not add a midpoint rule or tune scores to cross 75. Subjective points inside Jake's ranges may still differ; identical historical scores are not promised.

Fresh testing also exposed an overly strict case-match check: a model citing both a real library project and the buyer's requirements was rejected because every case-match citation was required to be library-only. Permit those comparison citations while still requiring the project name in actual case-study evidence. All citations remain exact; buyer text alone cannot establish prior work. This corrects validation, not Jake's scoring policy.

## Proof and handoff

- Adapt synthetic model transports, leaving recorded domain judgments and expected decisions unchanged.
- Add catalog/resolver bounds, source-kind, malformed/unused reference, and context-isolation tests.
- Run the full offline suite, source check, and all 31 alignment cases.
- Reassess a bounded sample using identical prior inputs and ISA's already-approved model/auth; repeat the near-75 case. Record raw outputs privately, including failures, and publish only a non-sensitive summary.
- Review the score bands and evidence, not just whether JSON parses. Human confirmation of current company qualifications remains a separate release requirement.

Fresh proof completed in [evidence-id-evaluation.md](evidence-id-evaluation.md): fifteen diagnostic requests retained, two fresh final integration requests validated, five clarified responses validate in final replay, and four first-format failures remain rejected. All 75 offline tests and 31 alignment cases pass. Borderline point variation, current company proof, and batch latency remain release considerations. Do not install these helpers or company records on the VM or run business jobs.
