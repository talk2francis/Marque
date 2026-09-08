# Architecture

One VPS. Caddy terminates TLS and routes; PM2 supervises every process; a native
PostgreSQL 16 and Redis 7 sit underneath. No containers, no cloud control plane —
so the whole system is legible from one `pm2 status` and one `psql`.

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 700" width="100%" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="13">
  <rect x="0" y="0" width="980" height="700" fill="#15160f"/>
  <text x="24" y="34" fill="#ece9e1" font-size="17" font-weight="700">Marque — one host</text>
  <text x="24" y="54" fill="#9b9e8d" font-size="12">browser never signs except a charter grant · reads are unprivileged · the LLM never signs and never prices</text>

  <!-- client -->
  <rect x="24" y="80" width="200" height="56" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="124" y="104" fill="#ece9e1" text-anchor="middle" font-weight="600">Browser</text>
  <text x="124" y="122" fill="#9b9e8d" text-anchor="middle" font-size="11">RainbowKit · injected wallet only</text>
  <line x1="224" y1="108" x2="300" y2="108" stroke="#8a6a22" stroke-width="2"/>
  <text x="262" y="100" fill="#d9ae45" text-anchor="middle" font-size="10">HTTPS</text>

  <!-- caddy -->
  <rect x="300" y="80" width="150" height="56" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="375" y="104" fill="#ece9e1" text-anchor="middle" font-weight="600">Caddy</text>
  <text x="375" y="122" fill="#9b9e8d" text-anchor="middle" font-size="11">TLS · reverse proxy</text>

  <!-- next -->
  <rect x="300" y="176" width="230" height="92" rx="10" fill="#1b1e15" stroke="#b0892c"/>
  <text x="415" y="200" fill="#ece9e1" text-anchor="middle" font-weight="700">Next.js (web) :3200</text>
  <text x="415" y="220" fill="#9b9e8d" text-anchor="middle" font-size="11">standalone · SSR pages + /api/v1</text>
  <text x="415" y="238" fill="#9b9e8d" text-anchor="middle" font-size="11">CSP · HSTS · rate limits · SSRF guard</text>
  <text x="415" y="256" fill="#9b9e8d" text-anchor="middle" font-size="11">signs a charter grant with the operator key</text>
  <line x1="375" y1="136" x2="375" y2="176" stroke="#3c3f2e" stroke-width="2"/>

  <!-- agents -->
  <rect x="560" y="176" width="200" height="92" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="660" y="200" fill="#ece9e1" text-anchor="middle" font-weight="600">5 reference agents</text>
  <text x="660" y="219" fill="#9b9e8d" text-anchor="middle" font-size="11">Bound · Lattice · Sluicegate</text>
  <text x="660" y="235" fill="#9b9e8d" text-anchor="middle" font-size="11">Keel · Redcell   :8610–8614</text>
  <text x="660" y="253" fill="#9b9e8d" text-anchor="middle" font-size="11">deterministic · no LLM in the path</text>
  <line x1="450" y1="118" x2="560" y2="196" stroke="#3c3f2e" stroke-width="2"/>
  <text x="512" y="150" fill="#9b9e8d" text-anchor="middle" font-size="10">/agents/&lt;slug&gt;/*</text>

  <!-- workers -->
  <rect x="24" y="176" width="240" height="122" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="144" y="199" fill="#ece9e1" text-anchor="middle" font-weight="600">Workers (PM2)</text>
  <text x="144" y="219" fill="#9b9e8d" text-anchor="middle" font-size="11">ingest — sweep + enrich 8004scan</text>
  <text x="144" y="235" fill="#9b9e8d" text-anchor="middle" font-size="11">probe — liveness + schema</text>
  <text x="144" y="251" fill="#9b9e8d" text-anchor="middle" font-size="11">classify — DeepSeek, usd-capped</text>
  <text x="144" y="267" fill="#9b9e8d" text-anchor="middle" font-size="11">conform — nightly MCS</text>
  <text x="144" y="283" fill="#9b9e8d" text-anchor="middle" font-size="11">pancake-watch — pool ticks / 2 min</text>

  <!-- health -->
  <rect x="790" y="176" width="166" height="92" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="873" y="200" fill="#ece9e1" text-anchor="middle" font-weight="600">marque-health</text>
  <text x="873" y="219" fill="#9b9e8d" text-anchor="middle" font-size="11">/status + agent /health</text>
  <text x="873" y="235" fill="#9b9e8d" text-anchor="middle" font-size="11">every 60s</text>
  <text x="873" y="253" fill="#d9ae45" text-anchor="middle" font-size="11">Telegram on 2× fail</text>

  <!-- data layer -->
  <rect x="24" y="340" width="932" height="150" rx="12" fill="#12140e" stroke="#2c3023"/>
  <text x="44" y="365" fill="#ece9e1" font-weight="700">Data — two tiers, handled differently (AGENTS.md invariant 12)</text>

  <rect x="44" y="380" width="440" height="94" rx="8" fill="#191a10" stroke="#3c3f2e"/>
  <text x="64" y="402" fill="#57957a" font-weight="600">DERIVED — rebuildable from ingest</text>
  <text x="64" y="422" fill="#9b9e8d" font-size="11">agent · agent_service · agent_category · ingest_cursor</text>
  <text x="64" y="440" fill="#9b9e8d" font-size="11">rebuild drill: truncate → ingest from cursor 0 → diff</text>
  <text x="64" y="458" fill="#9b9e8d" font-size="11">funnel_snapshot — append-only measurement, never dropped</text>

  <rect x="500" y="380" width="440" height="94" rx="8" fill="#191a10" stroke="#3c3f2e"/>
  <text x="520" y="402" fill="#cd6f63" font-weight="600">FIRST-PARTY — cannot be reconstructed</text>
  <text x="520" y="422" fill="#9b9e8d" font-size="11">probe · conformance_result · receipt · run · run_event</text>
  <text x="520" y="440" fill="#9b9e8d" font-size="11">benchmark_run · sealed_call · pool_tick_observation</text>
  <text x="520" y="458" fill="#9b9e8d" font-size="11">builder_listing · product_event · nightly dump + restore test only</text>

  <line x1="200" y1="298" x2="360" y2="340" stroke="#3c3f2e" stroke-width="2"/>
  <line x1="415" y1="268" x2="440" y2="340" stroke="#3c3f2e" stroke-width="2"/>

  <!-- chain / external -->
  <rect x="24" y="520" width="300" height="76" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="174" y="544" fill="#ece9e1" text-anchor="middle" font-weight="600">BSC mainnet (56)</text>
  <text x="174" y="563" fill="#9b9e8d" text-anchor="middle" font-size="11">RPC failover pool — 6 endpoints,</text>
  <text x="174" y="579" fill="#9b9e8d" text-anchor="middle" font-size="11">bench a bad one 30s, spread the rest</text>

  <rect x="344" y="520" width="300" height="76" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="494" y="544" fill="#ece9e1" text-anchor="middle" font-weight="600">BSC testnet (97)</text>
  <text x="494" y="563" fill="#9b9e8d" text-anchor="middle" font-size="11">MarqueRegistry — anchor + sealCall</text>
  <text x="494" y="579" fill="#9b9e8d" text-anchor="middle" font-size="11">ERC-8004 IdentityRegistry</text>

  <rect x="664" y="520" width="292" height="76" rx="10" fill="#191a10" stroke="#3c3f2e"/>
  <text x="810" y="544" fill="#ece9e1" text-anchor="middle" font-weight="600">External</text>
  <text x="810" y="563" fill="#9b9e8d" text-anchor="middle" font-size="11">8004scan (index source) · DeepSeek (classify)</text>
  <text x="810" y="579" fill="#9b9e8d" text-anchor="middle" font-size="11">agent endpoints — via safeFetch() SSRF guard</text>

  <line x1="174" y1="490" x2="174" y2="520" stroke="#3c3f2e" stroke-width="2"/>
  <line x1="415" y1="268" x2="494" y2="520" stroke="#3c3f2e" stroke-width="1.5" stroke-dasharray="4 4"/>

  <text x="24" y="636" fill="#9b9e8d" font-size="11">Legend:  brass outline = signs / writes on chain    dashed = testnet    solid box = a supervised process</text>
  <text x="24" y="658" fill="#9b9e8d" font-size="11">Backups:  pg_dump nightly → two on-disk paths (+ rclone offsite hook) · restore test weekly · pm2 save + pm2-root.service on reboot</text>
  <text x="24" y="680" fill="#6b6f5d" font-size="10">Palette: ink #15160f · paper tones on dark · brass #b0892c / #d9ae45 · signals holds #57957a watch #d9ae45 breach #cd6f63</text>
</svg>
</p>

---

## Request paths

### A read (no wallet, the common case)

```
browser → Caddy → Next SSR/API
  page/api reads Postgres for what's already indexed and measured
  chain-live numbers (positions, health factor, pool tick) go through the
    RPC failover pool to BSC mainnet, allow-failure multicall so one bad
    position never fails the read
  a 12s in-process cache collapses concurrent reads of the same address
  every rendered number carries provenance; absence is shown as absence
```

Nothing here touches a private key. There is no session to steal.

### A hire (the one signature)

```
Preview   Next calls the agent read-only with the real position at a pinned
          block; grades the answer field-by-field against Marque's own
          computation. safeFetch() SSRF guard on the outbound call.
Charter   browser signs ONE transaction — MarqueRegistry / the agent's
          allowlist — setting {contracts, spend cap, expiry}. The screen dims
          to a cockpit and composes the charter line by line, then the brass
          mark settles and the tx hash types in as it confirms.
Execute   the agent acts strictly inside that scope. A call to a contract not
          on the allowlist, a spend over the cap, an action after expiry —
          refused before it is signed.
Receipt   four proof blocks + canonical hash + the anchor tx on chain. The
          recommendation was sealed BEFORE its outcome was known.
```

### The index (background)

`ingest` sweeps 8004scan on a per-minute / per-day request budget, enriches
agent details, snapshots the funnel. `probe` checks liveness and schema.
`classify` assigns categories (DeepSeek, hard USD cap, never signs or prices).
`conform` runs MCS nightly and seals live recommendations. `pancake-watch`
records each watched pool's tick every two minutes — the only source for
"hours out of range", because BSC keeps ~64 blocks of state and the official
subgraph is months behind (FINDINGS F-06).

The marketplace reads from our own Postgres, **never live from 8004scan**, so
an 8004scan outage degrades *freshness*, not availability.

---

## Failure behaviour

| Upstream | If it's down |
|---|---|
| One RPC endpoint | benched 30s after 2 faults; the pool routes around it. Verified: a pool with 2 dead endpoints first still returns a block in ~350 ms, 20/20 concurrent OK. |
| All RPC endpoints | chain-live sections show their error and a block; DB-backed pages keep working. |
| 8004scan | index stops refreshing; everything already indexed still serves. |
| DeepSeek | no new semantic reclassification; nothing else. |
| Postgres | `/status` says so; the health monitor pages after 2 checks. |
| The box reboots | `pm2-root.service` runs `pm2 resurrect`; all 12 apps + the site come back (verified with `pm2 kill && pm2 resurrect`). |

Load: 50 concurrent position reads for arbitrary addresses — 50/50 return 200,
site healthy immediately after; latency degrades gracefully (p50 ~17 s at 50×
vs ~2 s single) because the pool spreads load rather than failing.
