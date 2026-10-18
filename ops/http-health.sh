#!/usr/bin/env bash
# Output two independent fields: last HTTP status and curl transport exit status.
http_health() {
  local code transport=0
  code="$(curl -sS --connect-timeout 4 -m "${2:-12}" -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" || transport=$?
  [[ "$code" =~ ^[0-9]{3}$ ]] || code=000
  printf '%s %s\n' "$code" "$transport"
}
