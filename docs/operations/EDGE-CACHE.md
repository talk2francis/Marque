# The edge cache

A small Node process (`ops/edge`, PM2 `marque-edge`, 127.0.0.1:3190) between Caddy and the web slot. It has no secret
and no database.

## Why

Almost every route is rendered per request and a render costs a large share of a CPU second. A handful of renders at
once block every web worker, so even pages Next has cached wait behind them. From 9 to 14 November every release
failed the first load stage (25 users) for this reason, whatever was tuned inside the app.

The edge answers repeat anonymous reads from memory without touching a worker, lets one render per URL run at a time,
and asks the web slot for at most four renders at once.

## What is stored, and for how long

`ops/edge/policy.mjs` is the whole policy. Fresh is served without asking the origin; stale is served while one
background render replaces it.

| Route | Fresh | Stale |
| --- | --- | --- |
| Pages the origin marks shared (`/`, `/register`, `/quest`, agent pages) | up to 30 s | up to 60 s |
| `/judge`, `/builders`, `/adopt`, `/proof`, `/why`, `/standard`, `/pancakeswap` | 30 s | 120 s |
| Job Room, job can still change | 15 s | 120 s |
| Job Room, settled (`lib/job-settled.ts`) | 5 min | 24 h |
| `/status` | 5 s | 15 s |
| `/api/v1/marketplace` (human listing) | 15 s | 30 s |
| `/api/v1/phase2/coverage`, `stats`, `config`, `ratings/<id>` | 10 s | 30 s |
| `/api/v1/phase2/wallet/<address>` | 3 s | 15 s |
| Media the origin marks public | up to 1 h | up to 60 s |

Never stored: writes, anything with `Authorization`, `Range` or the charters preview cookie, `/api/health`, `/api/mcp`,
`/me`, positions, charters, quotes, the machine catalogue (`format=machine` keeps its own quote expiry), any response
that sets a cookie, any error.

Three rules keep it honest for a person using the product:

- In-app navigation and `router.refresh()` are held for two seconds at most and never served stale, so a Job Room a
  hirer is watching moves exactly as before.
- A reload (`Cache-Control: max-age=0` or `no-cache`) is answered with a render at most two seconds old.
- When a viewer's refresh renders a page, the stored document for that page is replaced too.

Every stored response carries `Age` and `X-Marque-Edge: HIT | STALE | MISS | BYPASS | STALE-ERROR`.

Until 16 Nov public pages were fresh for 10 s and live Job Rooms for 5 s. The edge then re-rendered about three pages a
second in the background regardless of traffic, one to three cores of rendering; the longer windows cut that by about
three times. The two rules below are what keep a person's view current.

## Failing open

`ops/web-upstream.caddy` lists the edge first and the web slot second for GET and HEAD. If the edge is not listening,
Caddy marks it down for five seconds at a time and sends reads straight to the web slot. Writes never touch the edge.
If the web slot fails, a stored page still answers for up to five minutes past its stale window.

## Deploys

Caddy names the live slot in `X-Marque-Upstream-Port`; the edge keys its cache by it, so a new release starts with an
empty cache. `scripts/deploy-web.sh` tells the edge on switch, and the edge renders the pages read in the last 24 hours
again in the background, one at a time behind visitors.

## Operating it (on the VPS, loopback only)

```
curl -s 127.0.0.1:3190/__edge/stats                       # hit share, entries, origin queue
curl -s -X POST '127.0.0.1:3190/__edge/purge'             # drop everything
curl -s -X POST '127.0.0.1:3190/__edge/purge?path=/judge' # drop one path
curl -s -X POST '127.0.0.1:3190/__edge/cache?mode=off'    # pass everything through, no restart
pm2 stop marque-edge                                      # remove it entirely; Caddy serves directly
```

These paths answer only a direct local call. Through Caddy they are an ordinary 404.

## Load tests

The load script and thresholds are unchanged. A published result must say whether Job Rooms were already stored when
the stage began (a cold stage renders each of the 120 rooms once). The test client does not ask for compression, so
250 users moves about 20 MB a second of HTML: the network port is a limit of its own at that stage.

## Adding a route

A route may be listed only if its server code reads no cookie and no request header. If a listed route starts reading
one, add the cookie to `BYPASS_COOKIES` or remove the route in the same change (AGENTS.md).
