# Database read performance, 12 November 2026

Three external November 12 tests stopped at the first 25-user latency stage. All had zero completed HTTP errors and no persistent process restarts, but none established supported visitor capacity. Their dated aggregates remain on Adopt/Status and in the load-test report. This operation addresses measured database work while retaining every application query, observation, financial check and admission rule.

## Access paths

Migration `0036_registry_read_cover_indexes` records indexes prepared concurrently on production before migration registration:

| Index | Purpose | Measured bytes |
| --- | --- | ---: |
| `agent_id_chain_cover_idx` | Count/join complete identities by id and actual chain without reading wide metadata pages | 35,397,632 |
| `agent_category_latest_cover_idx` | Supply the complete category ordering and output without sorting the full history | 43,982,848 |
| `commerce_quote_created_idx` | Read the unchanged quote observation windows through their timestamps | 8,232,960 |

All three are nonunique, valid, ready and unfiltered. Migration registration checks the exact definitions and refuses a conflicting or invalid object. No identity, quote, probe or historical observation was deleted. No database restart was performed.

Before identity coverage, one serial registry count read 257,969 shared-buffer blocks in its diagnostic plan and spilled temporary files. A later covered plan read 27,930, used the new index and had no temporary spill. Covered executions varied from 0.95 to 4.05 seconds across separate diagnostic samples; these are not matched traffic benchmarks. The builder shelf's later indexed sample took about 0.81 seconds, versus 1.91 seconds in the earlier plan. Workload capacity remains a separate test.

## Application session default

The freshness query spent 962 ms of one 1,350 ms execution compiling SQL. In a later same-snapshot comparison, JIT on/off returned identical rows; execution was 1,082/517 ms. The builder shelf also returned identical rows in its on/off comparison. It did not consistently get faster from the toggle alone, so no universal speedup is claimed.

PostgreSQL documents that compilation overhead can outweigh its savings for short queries. [PostgreSQL 16 JIT decisions](https://www.postgresql.org/docs/16/jit-decision.html).

The measured production setting is `jit=off` for role `marque` in database `marque` only. It does not change other roles/databases, global memory, query correctness or application freshness periods. The previous role entry was preserved privately. The operator script [database-read-tuning.sql](../../ops/database-read-tuning.sql) targets the connected application's own role and database and rejects a superuser connection.

Role defaults apply at new-session login. Existing application pools recycle idle connections after 30 seconds; no session was forcibly terminated. A new connection independently reported the new default. [PostgreSQL 16 ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html).

For this installation the prior role-specific JIT entry was absent. Restoring inheritance uses `ALTER ROLE marque IN DATABASE marque RESET jit`; a different installation must restore its own captured prior setting. This is a performance setting, not a permission or financial-policy change.

## Deployment and verification

The serving web/MCP artifact remains `b67f005`, built from `5337636`. PostgreSQL can use the added access paths with those existing SQL statements immediately. Index descriptors and migration registration are database maintenance; no replacement application artifact or extra VPS build is needed. Exact-source CI still validates the migration, workspace types, lint, tests and compilation. Never relabel the old artifact as built from a newer index-only commit.

Before the next external test, verify all three index definitions, a new connection's JIT default, current public readiness, catalogue identity/count consistency, the preserved nine-wallet snapshot and stable process counters. Retain the original workload hash, latency/error thresholds, rate limits and stop guards. Do not prewarm the workload's cold job IDs. Raw request, host and database traces remain private; only checked aggregate measurements are published.
