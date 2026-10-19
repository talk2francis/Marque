# Release recovery, 18 October 2026

## Reference-agent failures investigated on 19 October 2026

The owner requested investigation of recurring reference MCS failures. A bounded
read of the eight latest retained results per registered reference identity
found fresh passes for Bound, Lattice, Sluicegate and Keel at 01:47 UTC on
19 October. Their 18 October reboot-period failures were agent-card HTTP 502s,
not arithmetic mismatches. Their failed observations remain retained.

Tidemark repeatedly received MCS-YIELD-1 because the scheduler selected by
category alone. Its public engine declaration has `standard: null`: it measures
trailing realised exchange-rate growth, while that test asks for a quoted net
rate and switching decision. The scheduler now checks the explicit first-party
card declaration and matching category before capturing a grading case. A
missing or incompatible declaration is logged as skipped, never passed. This
does not grant Tidemark a Warrant or erase its historical failures. Redcell
likewise has no matching published category test.

A real free, read-only Tidemark request also failed at its configured archive
provider. TLS 1.2 and IPv4 checks did not restore it; the configured public
endpoints did not serve the exact older contract state. Public alternatives
were checked without signup or spending; no unverified replacement is being
installed. Availability of realised-yield history is a separate limitation from
MCS compatibility. Endpoint-bearing error text is now redacted in the same
Tidemark engine wrapper used by free and paid rails. No wallet, settlement,
pricing, MCS formula, tolerance or historical record is changed.

At 13:22:58 UTC the host recorded an ACPI power-key event and began an orderly
power-off. It booted again at 13:45:59 UTC. The event initiator is unknown.
This ended tmux and the running local build. Persistent Codex transcripts,
phase checkpoints, the frozen source manifest and private validation logs
preserved the exact stopping point.

The interrupted source was `2eaac0775823bd94414db99434d6fbe3ae0371b0`.
Its full local run passed 891 tests in 96 files with no skips, including
isolated PostgreSQL and read-only RPC cases. Web typechecking also passed.
GitHub's typecheck/lint/test/build job passed on that source. Its separate
live smoke failed with a marketplace hydration error on the older deployed
release, so the overall workflow was not green.

After boot, Caddy still pointed to port 3201, but the saved PM2 state restored
that web slot as stopped and the older slot on port 3200 as online. Public
requests returned HTTP 502. Restarting only the existing `marque-web-b` slot
restored complete HTTP 200 responses; `pm2 save` persisted the recovery.
Marque and Kerb health were checked separately. Comparisons now use a fresh
post-reboot process baseline; pre-reboot PID continuity is historical.

The resumed local build passed in 586.98 seconds. Lint passed in 77.00 seconds,
copy checks in 15.72 seconds and standalone packaging in 1.20 seconds. All
tracked source hashes still matched the pre-shutdown freeze at that point.
These results do not themselves establish production activation.

The deployment script now saves both available web slots before deployment
or rollback switches the proxy. A failed save prevents cutover. The delayed
retirement also saves its stopped state. This keeps the reboot snapshot
consistent with the slot the proxy depends on. A reboot before retirement
may restore both slots; inspect the live upstream before retiring either.

The first private rollback proof timed out. The unchanged bounded repetition
passed: 0.617 seconds to the old slot and 5.508 seconds back to the candidate.
These are private loopback observations, not a public rollback SLA. Eleven
proxy protection cases and eleven complete-body API samples passed. No
sampled API top-level field was removed; new receipt evidence, exact-service
preflight and nullable health release metadata are additive.

A browser test initially lost a hire dialog when its accessible name changed
from "Hire an agent" to "Hire Plinth keeper" after loading. The product dialog
remained open. The corrected locator passed mobile and desktop checks in
both themes, including selected service, expired-price notice and closing.
No task request, wallet signature or transaction was sent.

The full browser matrix, final artifact binding, production cutover and live
acceptance are recorded in the final P14/P15 checkpoints. No phase is declared
complete solely from this recovery note. Keeper, seller and other-product
processes are outside the release activation scope. No database migration,
observation deletion, new paid resource or mainnet transaction is required.

A cached-client check found four live JavaScript paths returned HTTP 404 from
the new candidate. Staging now retains the previous slot's public static files
without replacing new files. Before cutover, the verifier reads the old live
page and consumes its script, style and font files from the candidate, rejecting
missing files, wrong content types and incomplete bodies. Five local HTTP-fixture
checks cover success, missing chunks, truncated 200, HTML fallback and an error
page without asset evidence. Server code and observation data are not copied.

The first production stage of release d7ee954 returned HTTP 503 for the default
catalog. The release script stopped the candidate and preserved the old live
slot. Its restored-snapshot acceptance remains dated evidence, not production
success. Production had 1,212 classified identities and 892 owners, close to the
snapshot scope. Applying the complete-owner constraint before service
aggregation returned 1,733 qualifying rows in a read-only execution plan taking
2.003 seconds, within the unchanged eight-second bound. The same owner/host
partition and result-parity regressions gate this additional repair.

The follow-up restored-snapshot browser check still caught a Judge catalog
503. Tracing identified capability enrichment issuing four reads for each
displayed identity and scanning probe history. Catalog pages now batch exact
identities by their category task. Canonical evaluation reads the latest probe
through the existing service/time index, including newer manual observations
outside the scheduler, with the existing four-second read-only statement bound.
No timeout, freshness rule or hireability criterion was relaxed. Five additional
isolated PostgreSQL tests cover newer manual failure, foreign-identity evidence,
single/batch parity, unprobed services and exact identity scope; all 24 focused
checks passed. A traced restored-snapshot health-category read took 3.971 seconds
and its warm repeat 0.080 seconds. These observations do not establish a public
latency percentile; final candidate and production acceptance remain required.

The next staged release, 1c36141, also failed the default catalog check on the
current production data, before any traffic switch. A verified read-only trace
showed a process-cold default request taking 10.684 seconds: catalog rows,
commerce observations and seller tracks ran serially. These independent reads
now start together under their original bounds. A second process-cold read-only
production observation took 4.233 seconds, with a warm repeat of 0.168 seconds.
The live index changed between observations, so the samples are neither a frozen
result-parity comparison nor a latency guarantee. SQL eligibility, ranking,
clone counts, quote expiry and unknown-track behavior are unchanged; existing
database parity checks and a stalled-read scheduling regression gate the repair.
Both rejected candidate releases are preserved, and the stable slot kept traffic.

Current-data AXE checks also found a moderate heading-order defect in populated
catalogs: the page title was followed directly by card-level headings. A visually
hidden results heading restores that hierarchy using the existing accessibility
utility. Shared card headings and visible layout stay intact. The earlier empty
snapshot did not expose this case; final populated-catalog browser checks cover it.

Visual review found a separate first-load defect: the cached Register could show
zero agents and skip its API read while the current ready-catalog sample had
14. A real browser with a controlled five-minute client-clock offset reproduced
the unconditional stale-seed reuse before repair. The client now reuses a seed
only inside the existing 30-second page window, refreshes unknown/stale/future
times, clears numeric counts while reading, and updates measurement age locally.
Hydration no longer preserves a server-rendered "just now" label indefinitely.
No quote is renewed and no query, authority or statement bound is widened.
Controlled stale/error checks and the current-data browser matrix gate release.

The third staged release, 63122ee, was also rejected before cutover on the
default catalog. A private two-worker reproduction isolated catalog reads near
eight seconds, historical quote payload reads near three seconds and concurrent
track refresh work. Null ownership was ruled out for the classified sample
(1,212 identities, zero null owners); Redis connectivity and stored projection
metadata were healthy. No cache was flushed and no statement limit was raised.

Two narrower read-only plans took 1.643 seconds for the same complete-owner
service scope and 0.512 seconds for latest quote payload selection. The latter
selects IDs before reading large raw fields; newest failed quotes still win.
A private instrumented two-worker prototype returned the two catalog requests
in 7.792 and 6.415 seconds. These are separate dated samples, not frozen-dataset
or percentile claims. Existing catalog result parity and new real PostgreSQL
quote projection/tie/failure/scope cases gate the actual source repair.

## Catalog fan-out and exact-probe index, 19 October 2026

Web source `9ff6ce0` passed its full 914-case suite and the later reference fixes
passed 923 cases, with both release CIs green. The current-data browser gate
then rejected state 14 of 42: Health Factor at 390px/night received a catalog
503. No fourth production stage or public cutover occurred. The failing
observation and all earlier stage failures remain retained.

PostgreSQL recorded bounded statement timeouts in exact-service probe reads,
and subsequently in overlapping catalog/quote reads. A read-only plan for
20 Health Factor identities sorted 908 historical observations per service
on average across 11 services. Existing separate service/time and agent/time
indexes did not cover both predicates and the exact ordering together. The
additive migration 0020 supplies `(service_id, agent_id, checked_at DESC NULLS
LAST)`; production activation uses concurrent index creation and the normal
migration ledger. Fixture checks require the index and an ordered probe lookup
without a history sort. No retained observation is rewritten or deleted.

Catalog source and unscoped supply projections also coalesce identical pending
SQL reads, including scalar parameters. Every completed or failed promise is
removed, so the next request performs a new observation. Exact-service reads
are independent, quote expiry and capability decisions are evaluated per
caller, and original read-only/4s/8s/lock bounds remain. Five concurrency
regressions cover identical/different queries, exact reads, failure recovery
and non-scalar driver parameters. This is in-flight work sharing, not a
last-good result cache.

The schema-index source change regenerates the 42-file MCS source manifest to
`0xcfa7180a55f8e19407ead79e90e34f57ef25614863f0db14b47d634bbf6a9e39`.
MCS arithmetic, version 1.0.0 and tolerance revision 1 are unchanged; historical
result hashes remain historical. Fresh build, current-data acceptance and
actual production activation are still required after this candidate entry.

### Cold-cluster rejection and early category scoping

Candidate `9fb7775` passed 929 tests in 102 files with zero skips, both source
CIs and 42 current-data browser states (30 accessibility checks), but its cold
two-worker preflight received a catalog 503. It was not deployed. Retained
negative evidence takes precedence over those earlier positive gates.

The catalog plan materialized and sorted 344,294 category records before
owner scoping. The category CTE now narrows to all identities belonging to the
complete selected owner groups before choosing the existing category winner.
Unscoped seller projections narrow categories to the scheduled A2A identity
superset that the final query can return. Exact-service identity, full owner
groups, category ordering, null-owner fallback and quote rules are unchanged.
No cache policy, JIT setting or production read timeout is changed.

A read-only single-statement snapshot comparison returned 1,732 catalog rows
and 774 seller rows before and after, with zero differing rows in both
directions. These are dated observations, not a frozen supply claim. All 57
focused tests in 10 files passed, including seven catalog SQL parity cases. A
private compiled SQL-only prototype returned HTTP 200 for all 14 requests
across two fresh two-worker clusters; it is not a deployable release artifact.
The source change still requires fresh full validation, an immutable prepared
artifact, cold checks on separate runtime copies and actual live acceptance.
