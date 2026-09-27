# LOAD-TEST.md

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
