#!/usr/bin/env bash
set -euo pipefail

# WORKSPACE_DIR and HIGHERGOV_ENV_FILE can be overridden only so tests can run this wrapper
# against a temporary workspace; the crontab sets neither.
export WORKSPACE_DIR="${WORKSPACE_DIR:-/home/azureuser/.openclaw/workspace}"
export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH:-}"
export GOG_ACCOUNT="${GOG_ACCOUNT:-isa@seamgen.com}"
export GOG_KEYRING_BACKEND="${GOG_KEYRING_BACKEND:-file}"
# Who gets the Friday pursue email, comma-separated: Peter, Marianne and Sales (Jira ISA-6).
export RFP_EMAIL_TO="${RFP_EMAIL_TO:-peter.schepers@seamgen.com,mariannefaro@seamgen.com,sales@seamgen.com}"
export TELEGRAM_TARGET="${TELEGRAM_TARGET:--1003890997073}"
# Fetch HigherGov documents for preliminary 50+ candidates and AI-score their full text.
# Nothing else runs full-text scoring on a schedule. This adds roughly 2-3 hours to the run.
export RFP_DOCUMENT_FETCH_ENABLED="${RFP_DOCUMENT_FETCH_ENABLED:-1}"

# If the run fails at any point, including the checks below, tell the sales group once, so
# a missing Friday update isn't mistaken for "nothing found". Error details stay in the log.
RFP_FAILURE_MESSAGE="Heads up: this morning's RFP run didn't finish, so there's no RFP report today. Chris, the details are in the job log."
notify_failure() {
  local status=$?
  if [[ $status -ne 0 && ! "${NO_TELEGRAM:-}" =~ ^(1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss])$ ]]; then
    openclaw message send --channel telegram --target "$TELEGRAM_TARGET" --message "$RFP_FAILURE_MESSAGE" >/dev/null 2>&1 \
      || printf '%s\n' "Could not send the failure notice to Telegram." >&2
  fi
  exit "$status"
}
trap notify_failure EXIT

if [[ -z "${GOG_KEYRING_PASSWORD:-}" && -f /home/azureuser/.openclaw/credentials/gog-keyring-password ]]; then
  export GOG_KEYRING_PASSWORD="$(< /home/azureuser/.openclaw/credentials/gog-keyring-password)"
fi

HIGHERGOV_ENV_FILE="${HIGHERGOV_ENV_FILE:-/home/azureuser/.config/gogcli/gog-session.env}"
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
# Not exec: the failure trap above has to run after Node exits.
node scripts/weekly-rfp-pursue-decision.mjs
