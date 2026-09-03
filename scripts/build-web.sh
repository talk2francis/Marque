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

echo "build-web: standalone ready at $STANDALONE"
