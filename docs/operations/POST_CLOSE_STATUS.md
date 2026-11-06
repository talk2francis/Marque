# Post-close status evidence, 6 November 2026

The owner authorized publication and production release on 6 November, after the earlier local checkpoint. The [release report](RELEASE_HARDENING_2026-11-06.md) records follow-up verification and rollout. The live revision is reported by `/api/health`; earlier dated measurements below retain their original scope.

## Capacity

The November run already executed at 02:30 UTC. Every attempted stage aborted on latency. The runner only recognized exit code 108; the installed k6 returned 69, allowing the next stage to start. It now stops on every nonzero code. Stubbed regressions cover 69, 99, 108 and 1 without network traffic. No replacement production load was generated.

The [method and results](../phase2/LOAD-TEST.md) and [original exports](../evidence/capacity-2026-11-06/) support the Status and Running Marque sections. Both runs are dated; the November figures are failed capacity observations. One restart happened between the 100 and 250 stages, with no within-stage counter changes. The generator shared the application host.

## Outside observations

The prepared `uptime.yml` schedules six public GETs every ten minutes from GitHub Actions. Each run records status, TTFB and complete-response time with a 15-second transport deadline. It appends only to `status-log/status-log/YYYY-MM.jsonl` on branch `status-log`, never main. A workflow artifact also retains the original observation if persistence fails.

The Status reader has a two-second fetch deadline, an 8 MiB per-file limit, strict record validation and a 60-second cache. The bounded file budget accommodates the scheduled monthly observations. It reads both calendar months when needed for the seven-day window. A missing, malformed or unavailable log cannot become a perfect uptime percentage. Late schedules are not classified as outages. Publication to the default branch activates the workflow; the release report records the actual first run separately.

## Security and API care

The repository's private vulnerability reporting setting was checked and enabled under the phase B3 instruction. [SECURITY.md](../../SECURITY.md) and the prepared `/.well-known/security.txt` contain public reporting links and no personal email. The candidate's OpenAPI 3.1 description includes the campaign reads, catalog, explicit unsigned hiring operations and MCP endpoint; pinned Redocly CLI 2.76.0 validates it. Runtime package versions remain pinned to the previous graph; only the validator is added as a development tool.

The [baseline axe report](../audit/2026-11-close/baseline.json) contains sixteen actual route/theme checks of the live release. All eight requested routes passed in Day and Night with no serious or critical violations. Candidate accessibility and visual acceptance are recorded separately after the complete B/C/D build.

No money action, count definition, observation row, proxy route, process name, RPC provider or running worker was changed.
