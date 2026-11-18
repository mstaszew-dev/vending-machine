#!/usr/bin/env bash
# Stops the local InfluxDB 3 Core process started by influx-start.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.data/influxdb3.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "influxdb3 is not running (no pid file)"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  for _ in $(seq 1 40); do
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  kill -9 "$PID" 2>/dev/null || true
  echo "stopped influxdb3 (pid $PID)"
else
  echo "influxdb3 was not running (stale pid $PID)"
fi
rm -f "$PID_FILE"
