#!/usr/bin/env bash
# Health monitor (P11 item 4). Runs under PM2 on a 60s loop. Checks /status and
# every reference agent's /health, and on TWO CONSECUTIVE failures of any check
# sends one Telegram alert (and one recovery message when it clears).
#
# Needs, in /root/.marque/secrets.env:
#   TELEGRAM_BOT_TOKEN=...      (from @BotFather)
#   TELEGRAM_CHAT_ID=...        (your chat/user id)
# Without them it still logs failures to stdout (PM2 captures it); it just can't
# page anyone.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/http-health.sh"
set -a; . /root/.marque/secrets.env; set +a

BASE="${MARQUE_PUBLIC_URL:-https://marque.trade}"
INTERVAL=60
STATE_DIR="/tmp/marque-health"
mkdir -p "$STATE_DIR"

CHECKS=(
  "status|${BASE}/status"
  "web-liveness|${BASE}/api/health"
  "api-funnel|${BASE}/api/v1/funnel"
  "agent-bound|${BASE}/agents/bound/health"
  "agent-lattice|${BASE}/agents/lattice/health"
  "agent-sluicegate|${BASE}/agents/sluicegate/health"
  "agent-keel|${BASE}/agents/keel/health"
  "agent-redcell|${BASE}/agents/redcell/health"
  "agent-tidemark|${BASE}/agents/tidemark/health"
)

tg() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  curl -sS -m 10 -o /dev/null \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" --data-urlencode "disable_web_page_preview=true" || true
}

echo "$(date -u +%FT%TZ) health-monitor up · base=${BASE} · telegram=$([ -n "${TELEGRAM_BOT_TOKEN:-}" ] && echo on || echo OFF)"

while true; do
  for entry in "${CHECKS[@]}"; do
    name="${entry%%|*}"; url="${entry#*|}"
    f="${STATE_DIR}/${name}.fails"; a="${STATE_DIR}/${name}.alerted"
    read -r code transport < <(http_health "$url")
    detail="HTTP ${code}"
    if [ "$transport" -ne 0 ]; then detail="request failed (curl ${transport}, last HTTP ${code})"; fi
    if [ "$transport" -eq 0 ] && [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
      if [ -f "$a" ]; then
        tg "✅ Marque recovered: ${name} is back (HTTP ${code})."
        rm -f "$a"
      fi
      echo 0 > "$f"
    else
      n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))
      echo "$n" > "$f"
      echo "$(date -u +%FT%TZ) FAIL ${name} ${detail} (consecutive: ${n})"
      if [ "$n" -ge 2 ] && [ ! -f "$a" ]; then
        tg "🔴 Marque: ${name} failing: ${detail}, ${n} consecutive checks. ${url}"
        touch "$a"
      fi
    fi
  done
  sleep "$INTERVAL"
done
