# Exact-seller query repair

Baseline source: 97ef4c7. P00 observed the hire metadata request time out without headers/body after 60.06 seconds. Active seller-candidate queries exceeded 80 seconds. The browser stayed on its loading skeleton in six attempts.

Before rewriting, a read-only EXPLAIN with a 5 second timeout showed the exact hire path calls the global candidate query: sequential probe-schedule/service scans and a global category sort (planner estimate 336,105 category rows, total estimated cost 397,894.98). Planner costs are not milliseconds or measured row counts.

Selected change: optional identity/service restrictions inside the existing candidate query's probe and category inputs; scope stored quotes and provider settlement lookup to the selected service; reuse the existing indexes and selection checks. Global discovery retains its query shape. The exact path uses read-only transactions with 4 second statement and 500 ms lock timeouts. No index/migration, query-wide rewrite or production worker change.

One bounded read-only EXPLAIN ANALYZE on the actual identity-only candidate query returned the Plinth row: planning 3.704 ms, execution 1.929 ms, no written/dirtied buffers. Identity plus service plan cost 62.75; identity-only cost 62.88. This isolated SELECT timing does not establish endpoint p95, cold-cache performance or a live release result. The slow global query was not re-executed for comparison.

Hire metadata stops waiting for its core lookup at 10 seconds; optional contract reads become UNKNOWN after 2.5 seconds. The browser aborts its load after 15 seconds, ignores closed/replaced requests, and offers retry. The scoped SQL timeout cancels database execution; a Promise deadline alone does not cancel an underlying RPC or pool queue. Pool-wide saturation remains a risk and is not claimed solved.

Validation budget: query plans first, one scoped execution against production; candidate browsers use a separate limited snapshot and read-only credentials. No production load test, shared-service restart, global pool change or paid seller invocation.
