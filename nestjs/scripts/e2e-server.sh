#!/usr/bin/env bash
# Starts the backend for the Playwright end-to-end run. Uses its own databases so a test
# run never disturbs the telemetry of a developer's running demo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${E2E_PORT:-8091}"
INFLUX_URL="${INFLUX_URL:-http://127.0.0.1:8181}"

bash "$ROOT/scripts/influx-start.sh"

for db in vitals_e2e events_e2e; do
  curl -s -X DELETE "$INFLUX_URL/api/v3/configure/database?db=$db" >/dev/null || true
done

npm run build

exec env \
  PORT="$PORT" \
  INFLUX_URL="$INFLUX_URL" \
  INFLUX_VITALS_DB=vitals_e2e \
  INFLUX_EVENTS_DB=events_e2e \
  TEMPERATURE_SIMULATION=true \
  TEMPERATURE_INTERVAL_MS=1000 \
  node dist/main.js
