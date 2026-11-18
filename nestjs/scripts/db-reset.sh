#!/usr/bin/env bash
# Destroys the local telemetry data directory and restarts InfluxDB empty.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/influx-stop.sh"
rm -rf "$ROOT/.data/influxdb3" "$ROOT/.data/influxdb3.log"
bash "$ROOT/scripts/influx-start.sh"
