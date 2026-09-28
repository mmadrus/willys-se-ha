#!/usr/bin/env bashio
set -euo pipefail

# Timezone (container defaults to UTC otherwise)
if bashio::config.has_value 'timezone'; then
    export TZ="$(bashio::config 'timezone')"
fi

export WILLYS_DATA_DIR="${WILLYS_DATA_DIR:-/data}"
export WILLYS_INGRESS_PORT="${WILLYS_INGRESS_PORT:-8099}"

bashio::log.info "Starting Willys Inbox..."

exec node /app/server/index.js
