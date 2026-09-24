# External API contracts used by ISA

ISA does not expose a versioned HTTP API in this repository. Its scripts consume outside APIs and CLIs; [integrations](integrations.md) lists the owners and credentials.

## HigherGov

The weekly RFP script queries the external opportunity API and stores stable `opp_key`, `version_key`, and `captured_date` values in `candidate.md`. `highergov-document-flow.mjs` uses those values to rehydrate the opportunity, reads its current `document_path`, then queries the document API. Do not treat `document_path` or a returned download URL as a permanent credential-free file location; refresh through the API when needed, and never persist signed URLs or API keys in source.

The document response can be empty, blocked, incomplete, or contain unsupported files. Each returned record must be accounted for in the manifest and the final evidence state. The offline fixture in `devtools/fixtures/highergov-fetch.mjs` models complete, empty, and portal-gated responses; it does not certify HigherGov's live availability or every file shape.

## HubSpot and Google

Sales and RFP jobs call HubSpot through MCP and/or `hubspot-leads-sidecar.mjs`, which uses the HubSpot API. Deal, lead, owner, association, stage, and duplicate semantics are job-specific; inspect the calling script and use safe synthetic cases before changing them. Google mail and Drive are accessed through `gog` CLI calls, not a local app API in this repo. Their tokens/account state live outside Git.

Do not claim a contract is stable solely from a successful syntax check. For provider changes, capture a sanitized request/response shape, error case, idempotency expectation, and separate non-production verification plan in the task [spec](specs/README.md). See [RFP document qualification](domains/rfp/document-qualification.md) and [security](security.md).
