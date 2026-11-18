#!/usr/bin/env bash
# Installs the InfluxDB 3 Core distribution into nestjs/.tools (no Docker, no package manager).
# The tarball ships the binary plus a bundled Python runtime; both must stay siblings because
# the binary resolves libpython through @rpath relative to its own directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${INFLUXDB3_VERSION:-3.12.2}"
TOOLS="$ROOT/.tools"
BINARY="$TOOLS/influxdb3"

if [[ -d "$TOOLS/python" ]] && "$BINARY" --version >/dev/null 2>&1; then
  echo "influxdb3 already installed: $("$BINARY" --version | head -1)"
  exit 0
fi

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=amd64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

URL="https://dl.influxdata.com/influxdb/releases/influxdb3-core-${VERSION}_${OS}_${ARCH}.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading $URL"
curl -fL --progress-bar "$URL" -o "$TMP/influxdb3.tar.gz"
tar -xzf "$TMP/influxdb3.tar.gz" -C "$TMP"

DIST="$(find "$TMP" -maxdepth 1 -type d -name 'influxdb3-core-*' | head -1)"
if [[ -z "$DIST" || ! -f "$DIST/influxdb3" ]]; then
  echo "archive did not contain the influxdb3 distribution" >&2
  exit 1
fi

mkdir -p "$TOOLS"
rm -f "$BINARY"
cp -R "$DIST/." "$TOOLS/"
chmod +x "$BINARY"
echo "installed $("$BINARY" --version | head -1) at $BINARY"
