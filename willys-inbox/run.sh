#!/usr/bin/env bash
set -euo pipefail

# s6-overlay may start the CMD with a scrubbed environment. The real
# container env (SUPERVISOR_TOKEN, TZ, ...) is kept in this envdir - import it.
if [ -d /run/s6/container_environment ]; then
    shopt -s nullglob
    for envfile in /run/s6/container_environment/*; do
        key=$(basename "${envfile}")
        val=$(cat "${envfile}")
        if [ -n "${key}" ]; then
            export "${key}=${val}"
        fi
    done
    shopt -u nullglob
fi

# Timezone from add-on options
OPTIONS=/data/options.json
if [ -f "${OPTIONS}" ] && command -v jq >/dev/null 2>&1; then
    TZ_VALUE=$(jq -r '.timezone // empty' "${OPTIONS}" 2>/dev/null || true)
    if [ -n "${TZ_VALUE}" ]; then
        export TZ="${TZ_VALUE}"
    fi
fi

export WILLYS_DATA_DIR="${WILLYS_DATA_DIR:-/data}"
export WILLYS_INGRESS_PORT="${WILLYS_INGRESS_PORT:-8099}"

log() { echo "[$(date '+%H:%M:%S')] INFO: $*"; }
log "Starting Willys Inbox..."

exec node /app/server/index.js
