# Glossary

- **ISA:** Seamgen's OpenClaw-based assistant. The live ISA and a developer's local ISA are separate processes with separate state.
- **Workspace:** On the VM, `/home/azureuser/.openclaw/workspace`; in Git, the selected source copy under `workspace/`; locally, an ignored copy under `.isa-local/`.
- **Skill:** ISA-facing workflow instructions in `workspace/skills/`. A skill's text is not proof its steps are implemented or scheduled.
- **Candidate:** A HigherGov opportunity represented by a runtime `RFP-pipeline/candidates/<slug>/candidate.md`. Customer candidates are not tracked in this repo.
- **Resources:** Downloaded solicitation and attachment files under a runtime `RFPs/<stage>/<slug>/resources/` folder, not the Git source tree.
- **Preliminary score:** Metadata-based screen used to decide whether to fetch documents. It is not a final pursue decision.
- **Full-text / partial-documents / access-blocked:** Evidence states for RFP qualification. Full-text requires usable solicitation evidence and no known missing required scoring documents.
- **Document manifest:** Per-candidate record of the returned documents, local download/extraction results, and completeness state.
- **Watermark / seen set:** Runtime HigherGov intake state that avoids reprocessing; not source code and not safe to reset during an ordinary test.
- **`gog`:** Command-line bridge used by live scripts for Google mail and Drive operations. Its live credentials are not in this repo.
- **Sidecar:** `hubspot-leads-sidecar.mjs`, a separate HubSpot API client used by sales jobs for lead data and actions.
- **Accepted live baseline:** Local, ignored hash snapshot used by `live:pull` and guarded upload checks. It is not a Git commit or a copy of all VM state.
