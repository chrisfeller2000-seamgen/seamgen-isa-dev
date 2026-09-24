# Deployment to live ISA

There is no GitHub-to-VM automatic deployment in this repository. The live Azure workspace is still the running system. The development repo is where source changes should be reviewed and tested first.

## Release path

1. From a clean, reviewed branch, run `npm test` and `npm run check`. For a changed integration, add a relevant isolated test; local chat and syntax checks alone are insufficient.
2. Run `npm run live:pull` and resolve any direct VM changes before upload. The accepted baseline exists only in ignored local state; do not use `live:accept -- --acknowledge` to silence an unexplained drift warning.
3. Run `npm run live:deploy` to preview exact file changes. Have one person own the upload window; coordinate with anyone editing the same VM files.
4. Only after an explicit production deployment request, use a clean committed checkout and `npm run live:deploy -- --apply`. The command stages and syntax-checks changed files, backs up originals in the VM workspace, uploads approved files, and verifies hashes.
5. Test the affected live workflow and record the deployed commit, observed behavior, and backup path. A file upload does **not** restart OpenClaw or scheduled jobs. Plan restarts and multi-file cutovers separately.

## Rollback and limits

The upload tool records a backup path in ignored `.isa-local/deployments.jsonl`, but restoration is not an automatic release command. Confirm the exact deployed files and backup before a controlled rollback. Do not infer a successful RFP, CRM update, or email delivery from a syntax check. The live cron payloads and scheduler database are not versioned in this repo; changes to them need their own review and verification. See [architecture](architecture.md), [security](security.md), and the [root README](../README.md).
