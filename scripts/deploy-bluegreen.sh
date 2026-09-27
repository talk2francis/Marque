#!/usr/bin/env bash
# Superseded by scripts/deploy-web.sh (P2-11): two ports behind Caddy with an atomic
# upstream switch, instead of a directory swap and a process restart. Kept so old
# habits and docs still deploy the right way.
exec bash "$(dirname "${BASH_SOURCE[0]}")/deploy-web.sh" "$@"
