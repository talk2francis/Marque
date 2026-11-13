## 13 November 2026, 08:09 UTC: coordinated catalogue release still misses latency

[External run 43390999342](https://github.com/talk2francis/Marque/actions/runs/43390999342) tested live and generator release 3184f81 using the original workload and stop rules. It reached 25 virtual visitors, then stopped before the hold: page p95 **11,432 ms**, API p95 **5,015 ms**. The 54 HTTP requests were 52 successful responses and two redirects, with zero completed HTTP errors and no persistent process restarts. No higher stage ran. Its aborted 2.46 requests/second is not sustained throughput. The observer retained at least 6,039,696 KiB available memory.

The stage observer saw one catalogue query leader; the prior overlapping broad refreshes were reduced, but latency still failed. Separate read-only diagnostics identified historical verification fan-out and background scan work as additional contributors. Their capped/profiled times are not production capacity. [Candidate scope, feature-preservation requirements and limits](../operations/HISTORICAL-PROOF-READS-2026-11-13.md). Adopt remains withheld; all failed aggregates are retained.

## 13 November 2026, 07:07 UTC: rendering follow-up still fails the first stage

[External run 43383364290](https://github.com/talk2francis/Marque/actions/runs/43383364290) tested live and generator release bffa7f5 with the unchanged November workload and targets. The first target was 25 users; it reached 24 before aborting, with page p95 **6,187 ms** and API p95 **9,748 ms**. Thirty HTTP requests comprised 28 successes, one redirect and one marketplace-search 503. The 5xx rate is 1/29 completed script reads (3.45%); redirects are outside that denominator. No hold completed and no higher stage ran. The 1.50 requests/second aborted average is not sustained capacity. Persistent restart counters stayed unchanged and the supervisor retained at least 5,467,420 KiB available memory.

The actual-stage database observer captured three overlapping catalogue query leaders, two with parallel workers, plus other aggregates. Both observed marketplace deadline warnings are retained; the client's one completed 503 does not include the second server response around cancellation. A subsequent short live-worker profile used a loopback-only inspector, closed it and verified unchanged serving PIDs/restart counters. Its ordinary-traffic sample was mostly idle and its six sequential reads succeeded; those diagnostic observations do not reproduce or negate the concurrent failure. Shared base-catalogue refresh coordination is being validated. All count, quote-expiry, admission and test rules remain unchanged.

At the owner's request the capacity-test section is withheld from /adopt until a meaningful completed passing result is reviewed. Status and this technical history retain actual failures. The publishing hold is already live; no automatic republishing is enabled.

## 12 November 2026, 23:42 UTC: Job Room follow-up still misses latency

[External run 43330998606](https://github.com/talk2francis/Marque/actions/runs/43330998606) tested serving and generator release 5437604c382d38f3fcd9207dcd6030bfdba41589 with the original workload hash and unchanged targets. It reached 25 peak users, then aborted before the hold: page p95 **6,346 ms**, API p95 **1,937 ms**. The 116 HTTP requests were 108 successful responses and eight redirects, with zero HTTP errors or persistent process restarts. Neither latency target passed. Its aborted average of 5.27 requests/second is not sustained throughput; no higher stage ran.

The actual-stage observer found the two serving web workers busy across its sampled 20.8-second window, with over 6 GiB available memory. Parent cgroups imposed no CPU quota and all six CPUs were allowed. A separate capped, cache-isolated warm-render profile identified catalogue projection/serialization and garbage collection; these diagnostics are not capacity measurements or proof of every delay. The next batch addresses event-loop blocking, duplicate refreshes, worker allocation and per-worker Job Room module initialization. All earlier failures remain retained.

## 12 November 2026, 17:51 UTC: refreshed reads, latency still missed

[Run 43273718671](https://github.com/talk2francis/Marque/actions/runs/43273718671) tested release `b67f005f01abc7a0a8c1b99b40fd060c6a7a19d7` after the accepted deployment and quote-worker activation, using the unchanged November workload and guards. It reached 25 users but aborted before the hold: page p95 **9,535 ms**, API p95 **2,604 ms**. Its 50 HTTP requests were 45 successful responses and five redirects; there were zero HTTP errors, admission rejections or persistent process restarts. The aborted 2.27 requests/second is not sustained throughput. Higher stages were not attempted.

The database observer confirmed a single serial registry aggregate, but its full count still read wide identity pages. Other background aggregates sorted all category rows and compiled expensive freshness expressions. The next database-only rollout adds three prepared covering/time indexes and a JIT-off default for new application sessions, without changing queries or counted populations. Read-only comparisons retained complete results; these diagnostic timings do not establish a capacity pass. [Configuration, measured plans and limits](../operations/DATABASE-READ-PERFORMANCE-2026-11-12.md).

## 12 November 2026, 16:33 UTC: continued external retest

[Run 43259875614](https://github.com/talk2francis/Marque/actions/runs/43259875614) used deployed release `69e9dc4165f2789148131f2fc915c9e5642c70a0`, with the identical November workload hash and all original targets and admission controls. It reached 25 users, then aborted before the hold: page p95 **8,802 ms**, API p95 **2,568 ms**. Its 51 HTTP requests comprised 45 successful responses and six redirects, with zero HTTP errors and no persistent process restarts. The aborted average of 2.32 requests/second is not sustained throughput. Higher stages were not attempted.

A bounded private database observer sampled every two seconds. It captured expensive full-history quote-probe selection and concurrent registry aggregate work during the failure. At one later read-only snapshot, the exact latest-probe rewrite retained all 2,565 observations; its plan executed in 302 ms versus 3,751 ms for the original and avoided the original temporary-file spill. A separate snapshot also matched all recovery rows. These are query diagnostics under different conditions, not a capacity measurement. Cross-process registry refresh coalescing and bounded serial aggregation are being validated alongside the worker read repair. All failed runs remain in the dated history.

## 12 November 2026: first repaired release, external retest

[Run 43210667907](https://github.com/talk2francis/Marque/actions/runs/43210667907) used release `f4a4d2285ae7499f2388d967bed4b595c86392ee` and the unchanged November workload (`7cc2ed4ddaf1d7224cdada6b5d252f8f048f1b5999eaba350a2d973ed0308e09`). The first stage reached 25 users, then aborted on latency before a 90-second hold: page p95 **7,700 ms**, API p95 **4,633 ms**. There were 54 HTTP requests (47 successful responses and seven redirects), 47 logical reads, zero HTTP errors, zero persistent process restarts and no admission rejection. Its aborted 2.45 requests/second is not sustained throughput. Higher stages were not attempted.

Private host samples retained at least 6,065 MiB available memory and no CPU throttling or sampled steal time. The failure does not establish a memory shortage. Builders, Judge, job-room and agent-page reads accounted for the slowest observed routes. Subsequent read-only diagnosis found a full-registry background funnel query repeatedly sorting/materialising hundreds of thousands of identities and spilling temporary files. A complete-count rewrite, local transaction bounds and cold/error read fixes are under validation. These query diagnostics do not establish a capacity pass; the next external run must measure that separately.

# LOAD-TEST.md

## 11 November 2026: external run failed its first stage

The scheduled 21:00 UTC test ran against release `87118f208578417d1da2f9896e03ecf382444248`. [External workflow 43099335414](https://github.com/talk2francis/Marque/actions/runs/43099335414) stopped at its first target of 25 virtual visitors, reaching a peak of 24 before aborting after about 20 seconds. No 90-second hold completed. The 50, 100 and 250 stages were not attempted.

| Target visitors | Peak | Logical reads | Requests/s | Page p95 | API p95 | Logical-read 5xx | Hold completed | Targets met |
|---|---|---|---|---|---|---|---|---|
| 25 | 24 | 23 | 1.35 | 6.12 s | 10.25 s | 4.35% (1 read) | No | No |

The HTTP client recorded 27 HTTP requests including redirects: 22 HTTP 200, four HTTP 308 and one HTTP 503. The rate is an aborted-run average, not sustained throughput. Server observations also recorded a second marketplace 503 around generator shutdown; this is separate from the completed client measurements. Both marketplace failures reached the application's 12-second request deadline. Host samples showed no persistent process restart and at least 5,657 MiB available memory; that alone does not rule out CPU, I/O or database contention.

The one-shot timer has expired. The traffic-free setup [run 42989158840](https://github.com/talk2francis/Marque/actions/runs/42989158840) made no requests and is not a capacity result. Raw host records and request-level diagnostics remain in private operational storage; the public capacity record contains aggregate measurements only.

## 12 November repair and retest procedure

The repair narrows the ordinary mainnet catalogue to classified and quoted identities while preserving full owner partitions for identity counts, all eligibility rules, explicit unclassified browsing and cross-network reads. It adds a partial classification index, corrects latest-probe ordering to match the existing index, batches canonical task-specific agent evidence, coalesces immutable job and policy reads, and serves dated last-good public projections during refresh. Isolated database tests compare the narrowed result with the original projection and verify the probe index plan. Diagnostic timings are not capacity passes.

The owner requested a fresh external run after the repaired release is deployed and accepted. Pin the new live release and a fresh start window; wait for normal old-slot retirement and finish all build/browser work first. Use the unchanged November request mix and thresholds below, with all release, host and admission guards enabled. Record each attempted stage, actual peak, completed hold, threshold outcome and any HTTP error. Stop at the first unsuccessful stage. An aborted run establishes no supported visitor count.

`/status` reads the schema-validated aggregate record at `MARQUE_ROOT/docs/evidence/capacity-record.json`. Completing a hold and passing targets are displayed separately. Append verified measurements atomically after reviewing client and host evidence, then commit the aggregate file and report. Application rebuilds are unnecessary for measurement-only updates. If the runtime record is missing or invalid, the page visibly labels its bundled historical fallback. Explicit generator failures, including admission errors, cannot become passes merely because latency targets were met.

The generator pins k6 0.54.0 and records the SHA-256 of the unchanged November `read-mix.js`. It attempts 25, 50, 100 and 250 virtual users in order, with the original 20-second ramp, 90-second hold, 5-second ramp-down and 20 seconds between successful stages. No cold job-room prewarming, workload substitution, forged client IPs or rate-limit bypass is allowed. The first unsuccessful stage stops all higher stages. Existing page/API latency targets and 5xx stop rules remain enforced. An HTTP 429 additionally stops the test; other HTTP errors also prevent a stage passing. One external source IP can reach an admission limit, which must be reported separately from backend capacity.

The external runner checks health and the exact deployed release every five seconds. The VPS supervisor records memory, CPU counters, load, memory pressure and persistent Marque restart counters, cancelling on health/release changes, persistent process changes or available memory below 1 GiB. The normal short-lived Charters keys process is excluded from persistent restart comparisons. A build in progress prevents dispatch. The start window expires after 30 minutes, so a delayed/rebooted timer cannot start a daytime load test. Workflow artifacts retain raw metrics, summaries and failed attempts for 30 days; the supervisor downloads them to the VPS. A traffic-free workflow dry run validates the wiring before the scheduled test. Completed holds and aborted attempts must be distinguished in the resulting report.

This external generator and its additional admission/host guards differ from the historical same-VPS runs. Results must carry those method differences and cannot establish a ranking against a different project or workload.

## 6 November 2026: current workload, aborted at every attempted level

Release `0e9f5c59444a0036a05f0f9e0d0bf742864abdbf`, production through Caddy, 02:30:15 to 02:33:15 UTC. The November mix includes marketplace search and previously unviewed mainnet and testnet job rooms, with receipt, chain and IPFS reads. It is different from the September mix below. These brief aborted attempts do not establish a supported visitor count or a comparable throughput improvement.

| Attempted visitors | Requests | Requests/s | Page p95 | API p95 | 5xx | Completed hold |
|---|---|---|---|---|---|---|
| 25 | 32 | 1.46 | 9.36 s | 8.09 s | 0% | No |
| 50 | 52 | 2.38 | 4.80 s | 6.37 s | 0% | No |
| 100 | 88 | 4.02 | 6.53 s | 10.54 s | 0% | No |
| 250 | 147 | 7.58 | 9.67 s | 12.23 s | 1.36% (2 requests) | No |

Every stage aborted after about 20 seconds on the page latency stop rule. The installed k6 returned exit code 69. The wrapper only recognized 108, so it continued to the next stage. It now stops on every nonzero exit, including threshold misses, generator failures and interrupts, and cleans up its monitors. Regression tests exercise 69, 99, 108 and 1 without generating traffic. No new production load was run to write this report.

Marque restart counters were 69 through the end of the 100 stage and 70 before the 250 stage. This is one restart between stages, with zero inside each sampled stage; the counters alone do not prove its cause. The host began with a one-minute load average of 5.16; Postgres and the two web processes were active. Kerb's processes were stopped. The generator ran on the same VPS, so its CPU and memory are included. The close guard still passed for all nine wallets afterward.

Original files: `/root/.marque/load/20261106T023015Z-0e9f5c5/`. Public, unchanged metric exports from both runs: [capacity evidence](../evidence/capacity-2026-11-06/). `/status` and `/adopt` display both dated runs and state that the current capacity target was missed.

The September measurements below remain historical observations. Neither their route mix nor their process ceilings describe the current release.

P2-11 load test, Sun 27 Sep 2026, 01:50 to 02:32 UTC, against production (`https://marque.trade`, through Caddy).

## Method

- Tool: k6 0.54, `scripts/load/read-mix.js`, run by `scripts/load/run.sh`, one stage at a time: 25, 50, 100 and 250 virtual users, each a 20 s ramp, 90 s hold and 5 s ramp-down, 20 s apart.
- Read mix: 65% pages (`/`, `/register`, `/register/yield`, `/agents/keel`, `/quest`), 35% APIs (`/api/v1/phase2/coverage`, `/api/v1/phase2/wallet/<addr>`), each virtual user pausing 0.5 to 1.5 s between requests.
- Targets (P2-11): p95 under 800 ms for pages, under 1.5 s for APIs, 5xx under 0.5%, no PM2 restarts.
- Box: the Contabo VPS, 6 vCPU, 12 GB RAM. It also runs Kerb (a separate project: web, API, attesters, indexer), Postgres 16 and Redis, and k6 itself ran on it, so every figure below includes the load generator's own CPU.
- CPU and memory: `vmstat 5` and `free -m` sampled through each stage (raw files in `/root/.marque/load/<run>/`, on the VPS). Resting baseline before any test: about 45% CPU busy (Kerb's attester near 30% of a core, Kerb API and web, Postgres), 3.7 GB of swap in use.

## Result (run 3, release a448e4a): passes through 100 users

| Stage | Requests | Rate | Page p50 | Page p95 | Page p99 | API p50 | API p95 | 5xx | PM2 restarts | CPU busy | Memory used (max) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 25 VUs | 2,392 | 20.7/s | 24 ms | **93 ms** | 154 ms | 18 ms | **142 ms** | 0.00% | 0 | 80% | 8,258 MB |
| 50 VUs | 4,922 | 42.5/s | 20 ms | **116 ms** | 296 ms | 14 ms | **97 ms** | 0.00% | 0 | 73% | 8,242 MB |
| 100 VUs | 8,672 | 74.6/s | 83 ms | **462 ms** | 851 ms | 53 ms | **489 ms** | 0.00% | 0 | 95% | 8,322 MB |
| 250 VUs | 19,043 | 163.6/s | 214 ms | **1,123 ms** | 2,720 ms | 108 ms | **1,804 ms** | 0.00% | 0 | 91% | 8,493 MB |

- 25, 50 and 100 users: every target met.
- 250 users: no errors and no restarts, but page p95 1,123 ms (target 800) and API p95 1,804 ms (target 1,500) miss. The box is saturated (9% idle), with k6 and Kerb on the same cores. The launch runbook's trigger for a second VPS is a miss at 100 users, which did not happen; a second box stays unrequested (gate G-C1).

## How it got there

| Run | Release | Change | Page p95 at 25 / 100 / 250 | API p95 at 100 | 5xx at 250 |
|---|---|---|---|---|---|
| 1 | fc54557 | baseline: every page rendered per request on one Node process | 2,706 / 20,783 / 30,001 ms | 10,087 ms | 11.78% (timeouts) |
| 2 | da508ed | home, marketplace, `/quest` served from Next's page cache (30 s); two web processes per slot | 761 / 5,245 / 17,008 ms | 699 ms | 0.00% |
| 3 | a448e4a | category shelves and storefronts page-cached too (dynamic segments need `generateStaticParams`) | 93 / 462 / 1,123 ms | 489 ms | 0.00% |

Run 1 capped near 15 requests a second: one Next process is one core, and the heavy pages (home, storefronts) cost 100 to 200 ms of CPU each. The pages in the mix are the same for every visitor (wallet state is fetched client side), so caching them for 30 s removes the render from the request path. Run 2's two PM2 restarts were the new alert monitor exceeding its own 150 MB ceiling while tail-parsing 20,000 access-log lines; it now reads the last 4 MB (ceiling 300 MB), and run 3 had none.

## Memory budget (P2-11 item 4)

Box: 11,960 MB. Postgres resident about 960 MB (shared_buffers 128 MB). Redis 5 MB resident, now capped at 256 MB (`volatile-lru`, persisted with `config rewrite`). About 1 GB kept for the kernel and page cache. That leaves about 9.7 GB for PM2 processes, shared with Kerb.

| Marque process | Measured (27 Sep, idle) | Ceiling |
|---|---|---|
| marque-web, marque-web-b (2 processes each, one slot live except 5 min after a deploy) | 175 to 230 MB per process | 800 MB per process |
| marque-ingest | 152 MB | 500 MB |
| marque-probe | 136 MB | 400 MB |
| marque-classify | 132 MB | 300 MB |
| marque-pancake-watch | 172 MB | 350 MB |
| marque-conform | 152 MB | 400 MB |
| marque-quotes | 188 MB | 400 MB |
| marque-indexer | 175 MB | 400 MB |
| marque-keeper | 168 MB | 350 MB |
| six reference sellers | 155 to 185 MB each (wrapper plus child) | 300 MB each |
| marque-alerts | 72 MB | 300 MB |

- Ceilings sum to 5.95 GB with one web slot (two processes), 7.55 GB for the 5 minutes both slots run. Measured Marque use is about 2.6 GB. Kerb's own ceilings sum to 7.2 GB against about 1.4 GB used; the combined ceilings exceed the box, but they are leak guards, not reservations, and real use leaves about 4 GB available.
- Found and fixed: the workers ran under the `tsx` CLI, which spawns a child, so PM2 watched a 19 MB wrapper and no worker ceiling could ever fire. Workers now run as one process (`node --import tsx`), and PM2 sees their real memory.
- Not changed: the six sellers exit at startup under PM2 with `node --import tsx` (they run fine by hand), so they stay on the wrapper; `ops/marque-alerts.mjs` sums each seller's process tree against the 300 MB ceiling instead (D2-11-03).

## Reproduce

```
bash scripts/load/run.sh https://marque.trade /root/.marque/load/<name>
```

## 12 November, database access-path retest

[External run 43283433112](https://github.com/talk2francis/Marque/actions/runs/43283433112) kept web release b67f005 after database migration 0036 and the scoped JIT default; generator/database source was 46c6d9b. The original workload hash and all targets/guards were unchanged. The first stage reached 25 virtual users and stopped before its hold, with 93 HTTP requests (88 successful responses and five redirects), page p95 6,769.97 ms, API p95 1,101.91 ms, zero completed HTTP errors/5xx and no persistent process restarts. No 50, 100 or 250 stage ran. The 4.23 requests/second figure is an aborted-run average, not sustained throughput. API latency met its target in this attempt; the overall test failed.

The subsequent Job Room diagnosis found one submission-block query per delivered hire during feedback attribution, including clients with no feedback. Two read-only jobs outside the workload returned identical complete results after batching: query counts fell from 13 to 10 and from 15 to 9. Their separate diagnostic timings are not a traffic-capacity comparison. Further immutable-description sharing, background Lens refresh and bounded deliverable hedging are in validation. Production activation and a new guarded external test remain required.
