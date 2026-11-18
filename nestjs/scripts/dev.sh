#!/usr/bin/env bash
# Starts InfluxDB (if installed) and the NestJS backend in watch mode.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -x "$ROOT/.tools/influxdb3" ]]; then
  bash "$ROOT/scripts/influx-start.sh"
else
  echo "influxdb3 is not installed; the backend will start, monitoring reads will answer 503"
  echo "run 'npm run influx:install' to enable the time-series features"
fi

exec npx nest start --watch
