#!/usr/bin/env bash
# Build and (re)start the web app.
#
# `pm2 reload` proved unreliable at picking up a fresh standalone server.js in
# this setup, and a half-swapped bundle serves a stale HTML shell that 404s its
# own asset hashes. Until P11's staged cutover, deploy is: build, hard-restart,
# verify the HTML references an asset that actually exists.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT/scripts/build-web.sh"

pm2 delete marque-web >/dev/null 2>&1 || true
pm2 start "$ROOT/ecosystem.config.cjs" --only marque-web
pm2 save >/dev/null 2>&1 || true

# Wait for the port, then check that an asset the served HTML references resolves.
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:3200/api/health" && break
  sleep 1
done

html="$(curl -s "http://127.0.0.1:3200/")"
asset="$(printf '%s' "$html" | grep -oE '/_next/static/chunks/webpack-[a-f0-9]+\.js' | head -1)"
if [ -z "$asset" ]; then
  echo "deploy-web: could not find a webpack chunk reference in the served HTML" >&2
  exit 1
fi
code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3200${asset}")"
ctype="$(curl -s -o /dev/null -w '%{content_type}' "http://127.0.0.1:3200${asset}")"
if [ "$code" != "200" ] || [[ "$ctype" != application/javascript* ]]; then
  echo "deploy-web: served HTML references ${asset} but it returns ${code} ${ctype} — stale bundle" >&2
  exit 1
fi

echo "deploy-web: live. HTML asset ${asset} -> ${code} ${ctype}"
