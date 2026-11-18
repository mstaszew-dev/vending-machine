#!/usr/bin/env bash
# Starts InfluxDB 3 Core as a file-backed local process. No Docker, no auth, telemetry off.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$ROOT/.tools/influxdb3"
DATA_DIR="$ROOT/.data/influxdb3"
LOG="$ROOT/.data/influxdb3.log"
PID_FILE="$ROOT/.data/influxdb3.pid"
PORT="${INFLUX_PORT:-8181}"
URL="http://127.0.0.1:$PORT"

if [[ ! -x "$BINARY" ]]; then
  echo "influxdb3 is not installed, run: npm run influx:install" >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "influxdb3 already running (pid $(cat "$PID_FILE"))"
else
  mkdir -p "$ROOT/.data"
  echo "starting influxdb3 on $URL (data: $DATA_DIR)"
  nohup "$BINARY" serve \
    --node-id dm-vending \
    --object-store file \
    --data-dir "$DATA_DIR" \
    --without-auth \
    --http-bind "127.0.0.1:$PORT" \
    --disable-telemetry-upload \
    --wal-flush-interval 100ms \
    --retention-check-interval 1m \
    --delete-grace-period 1h \
    >"$LOG" 2>&1 &
  echo $! >"$PID_FILE"
fi

for _ in $(seq 1 120); do
  if curl -fsS "$URL/health" >/dev/null 2>&1; then
    echo "influxdb3 is healthy at $URL"
    exit 0
  fi
  sleep 0.5
done

echo "influxdb3 did not become healthy, see $LOG" >&2
tail -20 "$LOG" >&2 || true
exit 1
