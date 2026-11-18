#!/usr/bin/env bash
# Regenerates the test map from the test sources, then renders every PlantUML source
# next to itself as an SVG. Requires the `plantuml` CLI (brew install plantuml).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v plantuml >/dev/null 2>&1; then
  echo "plantuml is required: brew install plantuml" >&2
  exit 1
fi

node scripts/generate-test-map.mjs

plantuml -tsvg docs/*.puml

echo "rendered $(ls docs/*.svg | wc -l | tr -d ' ') SVGs in docs/"
