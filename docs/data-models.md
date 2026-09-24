# Runtime data contracts

This repo has no database schema or migration system. The live jobs use files and provider records as data contracts; most such files are intentionally absent from Git.

| Contract | Runtime location / writer | Important fields or rule |
| --- | --- | --- |
| RFP candidate | `RFP-pipeline/candidates/<slug>/candidate.md`, written/updated by `weekly-rfp-pursue-decision.mjs` | Provenance (`opp_key`, `version_key`, `captured_date`), source/agency/deadline/value, preliminary and final scores, `scoring_confidence`, `qualification_status`, `document_status`. Metadata is provisional. |
| Solicitation resources and manifest | `RFPs/<stage>/<slug>/resources/`, written by the RFP document flow | Saved document paths, role/required flag, download and extraction outcome, completeness. Full-text requires an extracted solicitation and no known missing required scoring document. |
| HigherGov intake state | `RFP-pipeline/state.json` and `seen.csv` | Watermark/seen keys avoid duplicate intake. Do not reset or advance them during a local test. |
| Sales job output/state | `reports/` under the live workspace | Mail-sync processed IDs and last success, plus generated reports. These can contain private business data and are not Git source. |
| OpenClaw state | VM's OpenClaw state directory or ignored local `.isa-local/` | Sessions, configuration, auth, and scheduler payloads are runtime state, not imported by `devtools/live-files.json`. |

`workspace/scripts/weekly-rfp-pursue-decision.mjs` currently parses YAML-like candidate frontmatter itself. If a field or status changes, update the writer, reader, manifest handling, and fixtures together; do not silently reinterpret older candidates. The [RFP domain](domains/rfp/README.md) owns qualification meaning. See [security](security.md) before inspecting or copying real runtime files.
