#!/usr/bin/env bash
# Build the web app for self-hosting.
#
# Next's standalone output does NOT include static assets or public/ — they must
# be copied in afterwards or every page loads without CSS (AGENTS.md gotcha 4).
# Always build through this script, never `next build` alone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
STANDALONE="$WEB/.next/standalone/apps/web"

# shellcheck disable=SC1091
set -a && . /root/.marque/secrets.env && set +a

cd "$ROOT"
pnpm --filter @marque/web build

if [ ! -f "$STANDALONE/server.js" ]; then
  echo "build-web: standalone server.js missing at $STANDALONE" >&2
  exit 1
fi

mkdir -p "$STANDALONE/.next"
cp -r "$WEB/.next/static" "$STANDALONE/.next/static"
if [ -d "$WEB/public" ]; then
  cp -r "$WEB/public" "$STANDALONE/public"
fi

# The /standard page renders the GENERATED standard from docs/, so the file has
# to travel with the standalone bundle. Next's tracing does not follow a runtime
# readFile, and shipping without it means the page renders its empty state in
# production while looking fine locally.
mkdir -p "$STANDALONE/docs/standard"
cp -r "$ROOT/docs/standard/." "$STANDALONE/docs/standard/" 2>/dev/null || true

echo "build-web: standalone ready at $STANDALONE"
