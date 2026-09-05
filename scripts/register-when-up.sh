#!/usr/bin/env bash
# Retry ERC-8004 registration until 8004scan is healthy enough to broker it.
#
# Their API is flapping: the same authenticated read returns 200 one minute and
# 500 DATABASE_ERROR the next. Rather than sit on it, poll for a good window
# and register the moment one appears. Registration is idempotent per agent.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . /root/.marque/secrets.env; set +a
LOG=/root/marque/docs/evidence/register-retry.log
ATTEMPTS=${ATTEMPTS:-36}          # 36 x 5min = 3 hours
SLEEP=${SLEEP:-300}

for i in $(seq 1 "$ATTEMPTS"); do
  code=$(curl -sS -m 30 -H "X-API-Key: $SCAN_API_KEY" \
    "https://api.8004scan.io/api/v1/agents?chain_id=97&limit=1" -o /dev/null -w '%{http_code}' || echo 000)
  echo "$(date -Is) attempt $i/$ATTEMPTS · 8004scan $code" >> "$LOG"
  if [ "$code" = "200" ]; then
    echo "$(date -Is) healthy — registering" >> "$LOG"
    ./scripts/register-agents.sh >> "$LOG" 2>&1
    if ! grep -q "FAILED" <(tail -40 "$LOG"); then
      echo "$(date -Is) ALL REGISTERED" >> "$LOG"; exit 0
    fi
    echo "$(date -Is) partial or failed — will retry" >> "$LOG"
  fi
  sleep "$SLEEP"
done
echo "$(date -Is) gave up after $ATTEMPTS attempts" >> "$LOG"
