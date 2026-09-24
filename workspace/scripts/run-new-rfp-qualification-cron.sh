#!/usr/bin/env bash
set -euo pipefail

export WORKSPACE_DIR="/home/azureuser/.openclaw/workspace"
export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH:-}"
export GOG_ACCOUNT="${GOG_ACCOUNT:-isa@seamgen.com}"
export GOG_KEYRING_BACKEND="${GOG_KEYRING_BACKEND:-file}"
export REPORT_TO="${REPORT_TO:-mariannefaro@seamgen.com}"
export TELEGRAM_TARGET="${TELEGRAM_TARGET:--1003890997073}"
if [[ -z "${GOG_KEYRING_PASSWORD:-}" && -f /home/azureuser/.openclaw/credentials/gog-keyring-password ]]; then
  export GOG_KEYRING_PASSWORD="$(< /home/azureuser/.openclaw/credentials/gog-keyring-password)"
fi

HIGHERGOV_ENV_FILE="/home/azureuser/.config/gogcli/gog-session.env"
if [[ ! -f "$HIGHERGOV_ENV_FILE" ]]; then
  printf '%s\n' "Missing HigherGov env file: $HIGHERGOV_ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$HIGHERGOV_ENV_FILE"
set +a
if [[ -z "${HIGHERGOV_API_KEY:-}" ]]; then
  printf '%s\n' "HIGHERGOV_API_KEY is not set after sourcing $HIGHERGOV_ENV_FILE" >&2
  exit 1
fi

mkdir -p "$WORKSPACE_DIR/reports/new-rfp-qualification"

cd "$WORKSPACE_DIR"
exec node scripts/weekly-rfp-pursue-decision.mjs
