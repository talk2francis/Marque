# Telegram status alerts, 22 October 2026

Status: repair prepared; production activation and post-deployment acceptance are pending.

The host and supervised services are running. Initial public checks returned HTTP 200 for web health and category coverage. The health-monitor log records repeated complete-body `/status` timeouts, including two or more consecutive failures followed by recoveries. HTTP 200 headers alone are not a successful completed request; the existing monitor correctly preserves curl exit 28 as a failure.

## Cause and repair

The 20 October service-reconciliation repair stores durable per-identity progress in `ingest_cursor`. The status page selected and rendered every cursor. By 22 October it produced **6,666,854 bytes**, with a complete read taking **11.21 seconds** in one sample, close to the unchanged 12-second monitor budget. A later read-only snapshot contained **7,668 cursor rows**. Status rendering had unintentionally coupled its response size to registry growth. This is a Marque regression, not proof of a whole-site outage.

The repaired status read returns the five explicit mainnet operational checkpoints and a complete aggregate of stored service snapshots, refresh attempts and pending URI updates. All per-identity rows remain stored; none are deleted or counted as working agents. Each operational row uses its own update time instead of borrowing the first row's timestamp. Independent quest, chain and database reads start together instead of adding a second waiting stage. Unknown optional reads remain visibly unavailable. Monitoring deadlines and freshness limits are unchanged.

The same-snapshot production query check returned five operational rows plus complete counts (3,809 snapshots, 3,816 refresh attempts and one pending URI update) in **120 ms**, with all 7,668 cursor rows retained. These are dated samples, not latency percentiles or full-registry availability claims.

The category alarm also expected the obsolete `inQuest` property. Current coverage responses omit it, so the alarm selected no categories and falsely cleared. The repair validates all four current core categories and their measured counts, retaining the minimum of three and the five-minute hold. Missing, duplicate, wrong-network or malformed coverage is an unreadable observation, never a healthy zero. The observed yield count was **2**; the corrected monitor must report that real shortfall rather than suppress it.

## Separate active alerts

- **Tidemark quotes:** the existing configured archive endpoint is unreachable in current read checks. Three existing public BSC RPC alternatives did not serve the exact historical exchange-rate read: HTTP/RPC refusals, rate limiting or pruned-state failure. Historical state is not replaced with current state and the quote-readiness guard stays enabled. A usable archive endpoint must be configured privately before this dependency can be called repaired; no new paid provider or account is provisioned here.
- **Job 56:57037:** fresh on-chain `getJob` at block 129051748 reports FUNDED with no submission. Twelve retained notifications show the seller refused the task because it requires a BSC token or pool address. It is not a missing browser notification that can safely be marked accepted. The original task, seller responses, funding events and retry cap are preserved. This requires buyer/provider review; no task is rewritten and no fund, submit, refund or other wallet transaction is initiated. The observed expiry is 2026-10-27T21:21:38+00:00. No automatic-refund promise is made.

## Validation and rollout

Three cursor-freshness unit cases and the existing deadline case passed. A guarded PostgreSQL regression populated 20,004 temporary derived cursor rows, returned only operational rows, counted all 10,000 service snapshots and 10,000 attempts, distinguished pending from acknowledged work, and verified no rows disappeared. Four native monitor contract tests passed on the real current API shape and negative cases. The existing six HTTP/transport regression checks passed. Initial web types, lint, copy and unchanged MCS source-anchor checks passed.

Build, browser, exact-source CI, publication, activation and a fresh natural monitor observation window are reported separately after completion. No observation reset, migration, SDK update, threshold relaxation or wallet operation is needed. Private alert state, raw diagnostics and screenshots remain off-repository. The restored visual README and its assets are preserved.
