#!/usr/bin/env bash
set -euo pipefail

export WORKSPACE_DIR="/home/azureuser/.openclaw/workspace"
export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH:-}"
export GOG_ACCOUNT="${GOG_ACCOUNT:-isa@seamgen.com}"
export GOG_KEYRING_BACKEND="${GOG_KEYRING_BACKEND:-file}"
if [[ -z "${GOG_KEYRING_PASSWORD:-}" && -f /home/azureuser/.openclaw/credentials/gog-keyring-password ]]; then
  export GOG_KEYRING_PASSWORD="$(< /home/azureuser/.openclaw/credentials/gog-keyring-password)"
fi
export REPORT_RECIPIENT="${REPORT_RECIPIENT:-sales@seamgen.com}"
export REPORT_FROM="${REPORT_FROM:-isa@seamgen.com}"
export TELEGRAM_TARGET="${TELEGRAM_TARGET:--1003890997073}"

cd "$WORKSPACE_DIR"
exec node scripts/weekly-current-year-sales-report.mjs
