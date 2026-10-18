# Architecture

## Web request boundary (9 October 2026)

The web slots bind only to loopback. `ops/web-upstream.caddy` is the shared
Marque-only proxy rule, rendered with the selected port by `deploy-web.sh` for
both deploy and rollback. It deletes a client-supplied `X-Marque-Router-State`,
copies any actual routing-state header into that mirror with a presence prefix,
and normalizes duplicate original headers to the same value. Next strips its
Flight headers before middleware, so middleware validates the trusted mirror
before allowing a render. Invalid state receives 400, not a renderer exception.
Do not expose a web slot directly or replace this rule with a bare proxy.
Seller routes and other sites on the VPS do not use this rule. The isolated
proxy/request regression script covers ordinary navigation, RSC, empty/malformed
state and attempts to spoof the mirror. No user or agent secret is involved.


One VPS. Caddy terminates TLS and routes; PM2 supervises every process; a native
PostgreSQL 16 and Redis 7 sit underneath. No containers, no cloud control plane —
so the whole system is legible from one `pm2 status` and one `psql`.

<p align="center">
  <img src="./architecture.svg" alt="Marque architecture — one host: browser → Caddy → Next.js + workers + reference agents, over Postgres/Redis, with a two-tier data model and RPC failover to BSC" width="900">
</p>

<details>
<summary>The same diagram as inline SVG (for renderers that allow it)</summary>

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

</details>

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
Receipt   four distinct claims plus a sorted-JSON SHA-256 digest. Stored
          anchor references require independent chain verification. Sealed
          calls are separate records, not implied by every receipt.
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


### vNext P04 receipt integrity contract

The existing immutable receipt versions1/2 remain. Public receipt GET appends a version1 read-only evidence projection: content digest comparison and explicitly unchecked claim/anchor references, with no writes or remote fetch. Future local run grades retain the exact case used and the MCS version/revision; different-block tasks are ungraded. No schema migration or historical backfill. See [P04 receipt contract](vnext/P04_RECEIPT_CONTRACT.md) for canonical bytes, trust limits and rollback.


### vNext P05 portable MCS observations

Existing case/result rows remain. New request JSON commits to the frozen case, actual selected/invoked service and test-code manifest; old history remains unbound where metadata is missing. Portable warrant1 replay runs without DB/RPC and keeps test verdict, content integrity, freshness, issuer/chain/funding unknowns separate. observeCase reads current input without persistence; stale inputs stop before an agent task. Legacy UI/API test-pass history remains distinct from an exact-service Warrant and from paid hiring. See [P05 contract](vnext/P05_WARRANT_CONTRACT.md).


P06: opt-in version 2 receipt/job containers wrap existing immutable/public evidence and keep every original digest domain. The standalone inspector composes supplied read-only RPC consistency, exact event checks, transfer proof, locally supplied delivery bytes and separate policy/authority/quality limits. Heavy SDK inspection stays outside the root commerce entry. Existing job state projection now recognizes a post-transfer router verdict without reverting or falsely flagging the terminal state. No schema, signer or deployment change. See docs/vnext/P06_INSPECTION_CONTRACT.md.


## P07 versioned existing API and unsigned plan, 17 October 2026

The existing marketplace GET has an opt-in marque.catalog.v1 projection; default JSON and query algorithms remain. Commerce/catalog and commerce/plan are separate browser-safe subpaths. Public JSON Schemas/OpenAPI document unknowns, exact selection, UTC freshness and explicit writer side effects. The pure plan reuses existing createJobCall/config/ABI, independently compares expected terms and produces only UNSIGNED calldata; deferred funding/setup require a confirmed original job ID. No signer, wallet, generic execute service, new schema or dependency. Catalog SQL now uses bounded READ ONLY transactions (4s exact/8s global, lock500ms), preserving caches/singleflight; HTTP deadlines do not cancel SQL or cover pool waits. Receipt/conformance reads have matching exact bounds and courtesy limits. See docs/vnext/P07_MACHINE_CONTRACT.md for full compatibility and failure contract.


## P08 offline trial inspection

The existing Ledger gains a pure trials subpath and bounded local replay CLI; it reuses manifest SHA-256, commits frozen task/input/policy/rubric/fork, retains errors and exact-value assertion failures, and always labels comparison UNPROVEN. No executor, DB/RPC load, provider call, financial judgement grade or published benchmark change. See [contract](vnext/P08_TRIAL_CONTRACT.md).


## P09 catalog suitability inspection

Pure commerce ./routing reuses catalog-v1 and SDK text sanitization. Strict structured intent/explicit clock produce exact selection reasons and compatible BigInt budget diagnostics. Existing catalog lacks task/settlement/authority evidence, so no selection qualifies and no winner is returned. Deterministic disclosed inspection ordering/manual browse are separate from a provider recommendation. Offline CLI shares bounded local JSON intake with P08. See [contract](vnext/P09_ROUTING_CONTRACT.md). No API/UI/DB/worker/authority changes.


## P10 authority boundary

The existing registry writer is historical testnet policy storage, not native asset authority. Candidate blocks new grant/execute and quarantines the unused Altana adapter before signer/SDK initialization. Existing historical reads/revocation remain; reads no longer update rows. Pure decoded-action policy preview and no-wallet four-category UI expose unresolved account/token/recipient/enforcement bounds. The legacy judge flow stops at preview and uses catalog evidence. See [contract](vnext/P10_AUTHORITY_CONTRACT.md). No new signer, session, escrow, schema or production deployment.

P10 browser correction: policy-preview footer prose and navigation stack within the existing prose measure; links retain a40px hit area. Manual390px screenshot exposed cramped flex columns despite no document overflow. No design token/font/art or authority change.

P11: existing ERC-8004 ratings/track/storefront share exact prepared-feedback/job/identity binding; legacy API shape preserved, opt-in rating-evidence v1 separates review/address/job units and unknown independence. Track query failure is unavailable, not zero. Existing Ledger GET adds opt-in bounded read-only outcome-reference metadata with explicit unverified/unavailable links. P03 raw-token seller outcomes and P06 chain inspector are reused. No new score/protocol, schema or history mutation. See vnext/P11_REPUTATION_CONTRACT.md.

P11 final copy alignment: homepage, register compare sheet, FAQ and whitepaper use buyer-linked review records, distinct wallet/person units and escrow funding versus payment release. Legacy verifiedBuyers API field remains compatible; no separate review framework. Existing quote explanation says selected terms and a maximum expiry, without universal signatures.

Whitepaper HTML uses current source; its original30SepPDF remains an explicitly dated archive, not silently regenerated or represented as the current text.


P12: existing storefront/builder evidence remains contextual; pure job-copy helper separates completion from PaymentReleased, charter glossary matches preview-only authority, and read-only audit modes preserve explicit environment and screenshot scope.

P12 receipt UI reuses the existing integrity projection and per-object explorer resolver. Unknown anchor metadata stays unknown; archived flags never become payment/authority/fresh-quality proof. No receipt mutation or API schema change.

P12 wallet accessibility: retain RainbowKit2.2.11 and its connection behavior. WalletProvider adds a connect-modal-only portal observer for unnamed decorative option icons inside visibly named wallet buttons. No new provider, signer or authority, no vendor/dependency edits. Actual Chromium/axe modal proof is required after rebuilding.

P13: explicit browser read-only commerce subpath reuses catalog and unsigned plan; Node-only execution/evidence reuses portable receipt content checks. Shared probe/payment-challenge is a bounded pure captured-response inspector, never a wallet or HTTP requester. The legacy x402 task rail fails closed before POST; reachability/error responses do not imply a free task. Existing ERC-8183 commerce remains unchanged. See docs/vnext/P13_READ_CLIENT_CONTRACT.md.

P13 source-manifest update: MCS arithmetic/version/tolerance and historical results are unchanged. The generated local implementation manifest includes all probe source, so liveness/payment-challenge changes require regeneration from41to42source files. New source hash0x3c871134132086241c3e9cf1ddfab7303709de6c28b395a59f442b817adcda3e supersedes0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433 for new local proof generation. Historical code hashes are retained and existing portable verifier reports UNSUPPORTED/UNAVAILABLE for current-code agreement while retaining arithmetic replay separately. No stored observation or onchain anchor is rewritten. Regression proves this distinction.

P13 docs accessibility: reuse existing docs.code scroll container for new examples, preserving actual mobile layout width and pointer hit testing. Shared documentation navigation/support complementary landmarks have distinct names. No stylesheet/token/theme change; real mobile pointer proof and actual innerWidth assertions are required, not forced clicks or HTTP-only schema reads.


P14/P15 release: deploy health requires both HTTP200 and successful complete transport, including rollback readiness. Deploy no longer removes historical release directories or recursively changes shared Caddy log ownership; build limits are3GiB memory/1GiB swap/50%of oneCPU. Judge mode now contains only two independent read operations and links to policy preview plus explicitly separate historical job/receipt records. No grant/run/revoke handler remains in that walkthrough; buyer-owned ERC8183 hire is unchanged. Campaign guidance was rechecked against the organizer on18October.

The deployment writes a full commit ID into each new standalone release and passes it only to that web slot. Health adds nullable `release`; old bundles or missing/invalid markers report null. It is deployment metadata, not a cryptographic source-build attestation. Historical rollback bundles need no rewrite.

P14 red-team repair: shared safeFetch rejects HTTPS-to-HTTP redirects before DNS/socket/body forwarding, retaining same-protocol HTTP/HTTPS redirects and per-hop DNS pinning. Seven regression cases cover301/302/303/307/308 POST downgrade and same-protocol controls. The reproducible code manifest changes for this source fix; historical receipts/results/hashes remain untouched and old-code agreement stays a separate unsupported state.

Release tooling follow-up: an optional prepared artifact must match full releaseSHA, checksums and all web/package/config/dependency inputs from its recorded build source; dirty tracked source and unknown arguments are refused before slot activation. Candidate smoke intercepts telemetry locally and blocks/fails all other writes. Existing48guarded PostgreSQL regressions now run on a separately migrated empty fixtureDB in CI. Conformance uses CONFORM_DEFER_ON_START=1 in its PM2 config, scheduling first reference/full sweeps12/24hours after activation rather than duplicating tasks immediately; --once and default standalone invocation semantics remain explicit. Usage/FAQ copy now distinguishes supported reference preview, quote mode, funding, submission and payment release.


Coverage minimum prices now require one chain/token-address/decimal scope; symbols and assumed pegs do not establish comparability. Mixed scopes return the existing nullable cheapest field as null, and home invites individual quote comparison rather than falsely saying no valid quotes. Exact quotes and all counts remain available; no exchange rates, payment or ranking policy are added.


The legacy all-host nightly conformance sweep is quarantined: A2A/MCP reachability is not task consent or free execution. Scheduled outside sweeps log SKIPPED without fetches, cases or results; explicit default --once refuses with an error. First-party reference tests remain scheduled and the existing builder test/claim consent flow remains available. No historical result is rewritten and no new consent framework is introduced.

### Ready and exact catalog reads (18 October 2026)

Cold restored-database catalog reads exceeded the existing eight-second SQL
budget. Plans showed a broad registry join before quote filtering. Ready and
exact selections now resolve their requested identities to whole owner groups
before invoking the same catalog SQL. Owner/endpoint clone partitions, eligibility,
category-specific latest conformance, pagination and response fields remain intact.
Unknown-owner identities retain the full path because SQL groups null owners
alongside one another. The ready selection uses current stored-quote validity
before its bounded memo; response-time expiry remains enforced. Failed commerce
reads propagate as unavailable rather than appearing as zero supply. No SQL
budget, migration, global planner setting or production cache is changed.
# Web slot persistence, 18 October 2026

Blue/green deployment and rollback save PM2 state before switching the Marque
upstream. A failed save prevents cutover. Delayed retirement saves again after
stopping the old slot. This preserves the live slot across host reboots; see
`docs/vnext/P15_RECOVERY.md` for the observed stale-snapshot outage and recovery.
