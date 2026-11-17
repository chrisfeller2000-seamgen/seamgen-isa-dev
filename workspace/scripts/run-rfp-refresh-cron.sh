#!/usr/bin/env bash
set -euo pipefail

# Tuesday document check for the RFPs in Looking closer and Building (rfp-refresh.mjs). The
# system crontab runs it; it posts to the sales group only when something changed.
# WORKSPACE_DIR and HIGHERGOV_ENV_FILE can be overridden only so tests can run this wrapper
# against a temporary workspace; the crontab sets neither.
export WORKSPACE_DIR="${WORKSPACE_DIR:-/home/azureuser/.openclaw/workspace}"
export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH:-}"
export GOG_ACCOUNT="${GOG_ACCOUNT:-isa@seamgen.com}"
export GOG_KEYRING_BACKEND="${GOG_KEYRING_BACKEND:-file}"
export TELEGRAM_TARGET="${TELEGRAM_TARGET:--1003890997073}"

# A quiet week sends nothing, so without this a failed check would look like "nothing new".
# Tell the group once; error details stay in the log.
REFRESH_FAILURE_MESSAGE="Heads up: this morning's check for new RFP documents didn't finish, so new addenda or deadline changes may have been missed. Chris, the details are in the job log."
notify_failure() {
  local status=$?
  if [[ $status -ne 0 && ! "${NO_TELEGRAM:-}" =~ ^(1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss])$ ]]; then
    openclaw message send --channel telegram --target "$TELEGRAM_TARGET" --message "$REFRESH_FAILURE_MESSAGE" >/dev/null 2>&1 \
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

cd "$WORKSPACE_DIR"
# One more try before the failure notice: a HigherGov, Drive or Telegram hiccup usually
# clears in minutes. A retry is safe: files already saved aren't downloaded again, and a
# change recorded but not yet announced is announced by the retry. Tests set the delay to 0.
RETRY_DELAY_SECONDS="${RFP_REFRESH_RETRY_DELAY_SECONDS:-600}"
# Not exec: the failure trap above has to run after Node exits.
if ! node scripts/rfp-refresh.mjs --scheduled; then
  printf '%s\n' "Tuesday document check failed; trying again in ${RETRY_DELAY_SECONDS} seconds." >&2
  sleep "$RETRY_DELAY_SECONDS"
  node scripts/rfp-refresh.mjs --scheduled
fi
