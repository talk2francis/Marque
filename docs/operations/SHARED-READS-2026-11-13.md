# Shared read coordination, 13 November 2026

The two external runs after release 3639502 still failed their first 25-visitor stage. The later run had no completed HTTP errors, but page p95 remained 5,920 ms and API p95 2,747 ms. Neither completed a hold. Capacity is unestablished; Adopt publication remains withheld. [Results and limitations](../phase2/LOAD-TEST.md).

The stage observer found overlapping expensive catalogue, registry funnel, seller and quote-history reads. The host retained memory and idle CPU, with no persistent restart, observed CPU steal or cgroup quota explaining the whole failure. Separate read-only plans confirmed that several broad reads still took seconds. A reverse-join seller prototype preserved its complete results but saved only about 70 ms after maintenance; a temporary current-probe projection also had modest gains. Neither prototype was shipped. Isolated profiled timings are not capacity measurements.

The next candidate coalesces cold projection reads across workers through opt-in Redis leases, and adds the existing ownership-fenced refresh coordination to API, storefront, standing and registry funnel projections. A follower waits for complete published data and preserves its observation date. Expired owners cannot overwrite a successor or release its lease. Redis failure retains ordinary computation and process-memory fallback; failed computation does not publish a partial success.

The marketplace commercial-state map becomes a shared serialized snapshot, preserving its existing 10-second fresh and 30-second maximum age. Its timestamp starts before the database read. Maximum age is checked on retrieval, completion and fallback, including memory during a Redis outage. Existing response-time quote expiry still applies. Storefront terms remain a per-request live read; a metadata refresh reuses that same promise, and a timed-out reader rejoins the existing computation instead of starting duplicate work. Eligibility, counts, classifications, signed prices, provider matching, balances, allowances and transaction simulations do not change.

General worker readiness initializes home, Judge, Builders, the reference Keel profiles and the existing featured Job Room on each worker's own connection. Same-origin canonical redirects are followed, with worker identity checked before and after. No cold benchmark Job Room or benchmark-only profile is selectively warmed. Workload, targets, traffic admission and the stop-on-first-failure rule remain unchanged.

Three additive nonunique indexes were prepared concurrently on production and validated before migration 0037 registration:

| Index | Keys and included columns | Predicate |
| --- | --- | --- |
| commerce_quote_ok_created_agent_cover_idx | created_at DESC, agent_id | ok |
| probe_schedule_last_probe_cover_idx | last_probe_id, service_id; INCLUDE agent_id | last_probe_id IS NOT NULL |
| commerce_quote_agent_history_cover_idx | agent_id, created_at DESC; INCLUDE ok | none |

Ordinary online VACUUM (ANALYZE, INDEX_CLEANUP ON) completed on agent_service, probe_schedule, commerce_quote and conformance_result. No observation, historical result, identity or eligibility predicate was changed. Migration registration uses short lock/statement limits and validates exact index definitions. Drizzle 0.38 cannot represent INCLUDE, so the two included-column definitions remain explicit SQL with schema comments. Future schema generation must preserve them.

Focused tests cover cross-worker cold coalescing, failed-owner recovery, expired-owner fencing, Redis outage, original observation dates, maximum-age rejection during computation and fallback, quote expiry, marketplace scope, standing, storefront lookup and shared supply counts. Local HTTP tests cover canonical redirects, incomplete responses, replaced worker connections and refusal of external redirects. Full CI, compiled feature acceptance, normal deployment and an unchanged external retest remain separate gates; these tests alone do not establish a latency improvement.
