#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/http-health.sh"
curl() { printf '%s' "$TEST_HTTP"; return "$TEST_EXIT"; }
TEST_HTTP=200 TEST_EXIT=0
[ "$(http_health https://example.invalid)" = '200 0' ]
TEST_EXIT=28
[ "$(http_health https://example.invalid)" = '200 28' ]
TEST_HTTP=000 TEST_EXIT=7
[ "$(http_health https://example.invalid)" = '000 7' ]
TEST_HTTP=503 TEST_EXIT=0
[ "$(http_health https://example.invalid)" = '503 0' ]
TEST_HTTP=200 TEST_EXIT=18
[ "$(http_health https://example.invalid 90)" = '200 18' ]
TEST_HTTP=garbage TEST_EXIT=0
[ "$(http_health https://example.invalid)" = '000 0' ]
echo 'HTTP monitor: 6 regression checks passed' 
