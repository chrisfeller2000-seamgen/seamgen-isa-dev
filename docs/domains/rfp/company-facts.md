# Company facts

The RFP scorer needs to answer two questions it couldn't before. Does Seamgen hold this registration, certificate or insurance *today*? Will this client take a reference call *today*? The case studies and `Proposal - Assets.txt` are historical proposal text. They show past delivery, not current status. The company facts record holds the answers, each with who confirmed it, when, and where the proof is kept.

## Where it lives

`resources/proposal-sources/company-facts.json` in the VM workspace, beside the case-study library. It is private company data. It is not in Git and not in `devtools/live-files.json`. It is optional: without it, no credential can be scored as held, and Jake's one-government-reference standing fact applies.

[`devtools/company-facts.starter.json`](../../../devtools/company-facts.starter.json) is the starting point. It repeats only claims already in `rfp-scoring-skill.md`. Each fact is marked `unconfirmed` except four:

- Seth confirmed the Esri technical certification is not held.
- The GSA eLibrary page checked on November 10, 2026 shows MAS contract 47QTCA19D00DQ, held through June 17, 2029, the end of the current option period. It covers SINs 54151S, 54151HEAL and OLM.
- The same page lists Seamgen as Other Than Small Business, so small-business status is not held.
- No SBA certification is held.

The contract lists UEI YH6HUMDSGL97. A November 5 SBA profile showed an expired SAM.gov registration, but under a different UEI, N7NGKMMQ4GJ9. That record looks old or duplicate. The SAM.gov registration for YH6HUMDSGL97 stays unconfirmed until someone checks it on SAM.gov. Copy it outside Git, fill it in there, and never commit the filled-in copy.

## Updating it

New facts don't need a pull request. Code changes go through PRs; the record is data, and the VM copy is the one that counts.

1. Start from the VM copy: `npm run facts:upload -- --pull` saves it to `.isa-local/company-facts/`, which Git ignores. Before the first upload, copy the starter there instead.
2. Edit the copy. Change the status, and record who checked, the date and the source.
3. Preview: `npm run facts:upload -- <file>`. It validates the file, lists each fact added, changed or removed, and shows the `facts:check` summary.
4. Upload: add `--apply`. The VM validates the file with its own copy of the parser, so the upload stops if the scoring code that reads the record isn't deployed yet. The replaced record is backed up under `workspace/backups/facts-upload-<time>/`. The next scoring run reads the new record; nothing restarts.

The upload stops if the VM copy changed since this machine last uploaded or pulled it, so two people can't overwrite each other's edits. Pull, merge, and upload again. The tool needs the same SSH key as `live:deploy`. Uploading changes what the weekly RFP run scores, so treat it as a deployment and have it requested.

## Format

```json
{ "version": 1, "facts": [
  { "id": "gsa-mas-it", "type": "registration", "name": "GSA Multiple Award Schedule, IT category",
    "holder": "Seamgen", "status": "held", "expires": "2027-03-31",
    "verifiedBy": "Tina", "verifiedDate": "2026-11-10", "source": "GSA eLibrary listing, saved to the proposals drive" },
  { "id": "ref-florida-dep", "type": "reference", "client": "Florida Department of Environmental Protection",
    "clientType": "government", "project": "Sea Level Rise Projection / GIS platform", "completed": "2025-06",
    "value": 450000, "status": "available", "verifiedBy": "Marianne", "verifiedDate": "2026-11-10", "source": "client email" }
] }
```

These values are illustrative, not confirmed.

- `type`: `registration`, `certification` or `insurance` (with `name`, `holder`, `expires`, and `coverage` for held insurance), or `reference` (with `client`, `clientType` government/nonprofit/commercial, `project`, `completed` YYYY/YYYY-MM/ongoing, optional `value`).
- `status`: `held` / `not-held` / `unconfirmed` for qualifications, and `available` / `unavailable` / `unconfirmed` for references. Anything but `unconfirmed` needs `verifiedBy`, `verifiedDate` and `source`.
- Optional: `confirmWith` (who to ask) and `notes`.
- Unknown fields, impossible dates and line breaks inside values are rejected. A malformed file stops scoring with `context-unavailable`, so it can't silently drop facts. Run `npm run facts:check -- <file>` before uploading.

## How the scorer uses it

The loader turns each fact into one citable paragraph starting `Company fact <id>`. Code in `rfp-scoring-policy.mjs` applies the rules, not the model:

- **Current** means `held` or `available`, confirmed within 365 days of the assessment date (`MAX_FACT_AGE_DAYS`), and not past `expires`.
- **Held credentials** must cite a held entry whose holder and date match the claim. Citing Assets or a case study is rejected. A cited entry that is stale or expired leaves Gate 6 open, and the reason names what to reconfirm. A `not-held` entry lets the model fail the gate.
- **Public-sector references (Gate 6a, 1–2 required).** With the record present, the default count is the confirmed government references, and the model's count can't exceed the confirmed government plus nonprofit references. If the requirement is within the references listed but some aren't reconfirmed, Gate 6 stays open and names the clients to call. Otherwise it fails. Commercial clients never count. The 3+ rule is unchanged: it fails unless a named partner covers it.
- An open gate is still scored and shown as a blocker, as before.

## What it doesn't cover yet

People and key-personnel qualifications, teaming partners, portal accounts, and case-study dates and values. The scorer also doesn't yet use commercial references for "N similar projects within five years". The model can read them from the record, but no code rule checks them.
