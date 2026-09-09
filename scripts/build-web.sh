#!/usr/bin/env bash
# Build the web app for self-hosting.
#
# Next's standalone output does NOT include static assets or public/ — they must
# be copied in afterwards or every page loads without CSS (AGENTS.md gotcha 4).
# Always build through this script, never `next build` alone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
BUILD_DIR="${MARQUE_BUILD_DIR:-.next}"
STANDALONE="$WEB/$BUILD_DIR/standalone/apps/web"

# shellcheck disable=SC1091
set -a && . /root/.marque/secrets.env && set +a

cd "$ROOT"

# A build into an alternate directory is a verification build: it must leave no
# trace in the working tree. `next build` rewrites tsconfig.json and
# next-env.d.ts to point at whatever distDir it just used, so an unguarded
# verification build leaves the repo referencing a throwaway directory — which
# then fails lint and would break the real build's types if committed.
if [ "$BUILD_DIR" != ".next" ]; then
  trap 'git -C "$ROOT" checkout -- apps/web/tsconfig.json apps/web/next-env.d.ts 2>/dev/null || true' EXIT
fi

pnpm --filter @marque/web build

if [ ! -f "$STANDALONE/server.js" ]; then
  echo "build-web: standalone server.js missing at $STANDALONE" >&2
  exit 1
fi

# Replace, don't merge: `cp -r src dest` when `dest` already exists nests it as
# `dest/src`, so the second deploy onward served stale asset hashes and every
# page 404'd its CSS and JS. Clear the targets first.
#
# The destination is $BUILD_DIR, not a hardcoded .next: the standalone server is
# generated with `distDir` baked in, so a build into .next-verify serves its
# static assets from .next-verify/static and ignores .next/static entirely.
# Copying to the wrong one produced a server that answered /api/health happily
# and 404'd every stylesheet and script — the exact failure this comment is
# about, reintroduced through the back door.
rm -rf "$STANDALONE/$BUILD_DIR/static" "$STANDALONE/public"
mkdir -p "$STANDALONE/$BUILD_DIR"
cp -r "$WEB/$BUILD_DIR/static" "$STANDALONE/$BUILD_DIR/static"
if [ -d "$WEB/public" ]; then
  cp -r "$WEB/public" "$STANDALONE/public"
fi

# The /standard page renders the GENERATED standard from docs/, so the file has
# to travel with the standalone bundle. Next's tracing does not follow a runtime
# readFile, and shipping without it means the page renders its empty state in
# production while looking fine locally.
mkdir -p "$STANDALONE/docs/standard"
cp -r "$ROOT/docs/standard/." "$STANDALONE/docs/standard/" 2>/dev/null || true
cp "$ROOT/docs/pancakeswap-proof.json" "$STANDALONE/docs/" 2>/dev/null || true

echo "build-web: standalone ready at $STANDALONE"
