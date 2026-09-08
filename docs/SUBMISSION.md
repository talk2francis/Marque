# Submission

BNB Chain **"Build the Era"** hackathon. Submitted 2026-09-08. Judging to
23 September 2026.

- **Live:** https://marque.trade
- **Judge walkthrough:** https://marque.trade/judge
- **Repo:** https://github.com/talk2francis/Marque
- **90-second video:** _see shot list at the end of this file_

---

## Tracks entered

| Track | Entered | Why |
|---|---|---|
| **Main Track** | ✅ | An agent marketplace on BSC with an on-chain verification primitive (warrant / charter / seal / receipt). |
| **TermiX** | ✅ | The PancakeSwap Desk reads live V3 / Venus positions and ranks agents that can act on them; the charter is the scoped-authority surface a trading terminal needs. |
| **PancakeSwap** | ✅ | One real mainnet PancakeSwap V3 rebalance, executed under a spend-capped charter, every transaction on BscScan — `/pancakeswap/proof`. |
| **AltLayer** | ✅ | Deterministic reference agents + a published conformance standard (MCS) — the "is this rollup-hosted agent actually correct" question AltLayer's autonomous-agent thesis needs answered. |
| ~~Altana~~ | ❌ | **Not entered.** Charters run on our own registry (`MarqueRegistry`, BSC testnet). We do not have an Altana integration and will not claim one. |

The scoping deliberately stops at four. Claiming an integration we do not have is
the one thing that turns a strong submission into a disqualified one.

---

## Acceptance gate

Every row is **PASS with evidence** or marked honestly. Evidence is a live URL, a
transaction hash, or a command whose output is pasted in the phase docs.

### Product

| # | Requirement | State | Evidence |
|---|---|---|---|
| 1 | Read any BSC address → V3 ranges, Venus HF, idle capital, from chain | **PASS** | `/positions`, `/api/v1/pancakeswap/<addr>` — allow-failure multicall, provenance per number |
| 2 | Marketplace: every indexed agent, warranted at top, graveyard kept honest below, deduped by operator | **PASS** | `/register` — 298,817 indexed, ranked by callable + MCS pass, dupes collapsed |
| 3 | Four categories equally deep, each with its own published test | **PASS** | `/standard` — MCS-REB-1 / GRID-1 / YIELD-1 / HF-1, all deterministic, live cases at a pinned block |
| 4 | No fabricated / hardcoded / estimated numbers on the shipped path; empty states instead | **PASS** | Provenance chip on every metric; `CLAIMED` styled weakest; `/status` shows staleness honestly |
| 5 | Warrant: MCS pass per category; a failure names the field | **PASS** | Agent profiles show the per-field conformance diff, passes and failures |
| 6 | Charter: allowlist + spend cap + expiry, enforced before signing, revocable in one tx | **PASS** | `/app/charter` composes it line by line; `packages/mandates` refuses an out-of-scope call; `/app/charters` shows every grant and the tx that ended it |
| 7 | Seal: recommendation hashed on chain before its outcome is known | **PASS** | `MarqueRegistry.sealCall(bytes32,bytes32)` on BSC testnet; `conform` worker seals nightly |
| 8 | Receipt: four proof blocks + canonical hash + anchor tx | **PASS** | `/receipts/<id>`; 6 compromise-era receipts reanchored (`DEVIATIONS.md` D10.5C-06) |
| 9 | LLM never signs, never prices | **PASS** | Only model call is category classification (DeepSeek), USD-capped, label-only output — `docs/SECURITY.md §4` |
| 10 | `safeFetch()` SSRF guard on every outbound agent call | **PASS** | `packages/probe/src/safe-fetch.ts`; sole path; `safe-fetch.test.ts` + `redirect.test.ts` |
| 11 | First-party observations never deleted | **PASS** | No delete path for probe / conformance_result / receipt / run / sealed_call / pool_tick_observation; rebuild drill truncates derived tables only |
| 12 | The Ledger: agent vs. human, blind-graded against a pre-registered rubric | **PARTIAL — honest** | `/ledger` renders the mechanism and the registered rubric; **manual arms not yet run** — the page says so, no result is faked. Runner: `docs/LEDGER-MANUAL-ARMS.md` |

### PancakeSwap proof run (P9b)

| # | Requirement | State | Evidence |
|---|---|---|---|
| 13 | One real mainnet V3 rebalance under a charter, before/action/after/cost captured | **PASS** | `/pancakeswap/proof`, `docs/pancakeswap-proof.json` (`status: complete`, chain 56) |
| 14 | Every transaction hash resolves on BscScan | **PASS** | open `0xb32c204f…`, withdraw `0xfe41a8a1…`, swap `0xd795d487…`, re-mint `0x83f635fc…` |
| 15 | Cost and slippage measured, not estimated | **PASS** | gas $0.10, realised slippage < 1 bps, 0.9 h cumulative out of range earning nothing |
| 16 | A revert would be published with its reason, not hidden | **PASS** | `/pancakeswap/proof` renders a `failed` state with the revert string; two opening mints did revert `Price slippage check` and are logged (`DEVIATIONS.md` D9b-02) |

### P11 — Hardening

| # | Requirement | State | Evidence |
|---|---|---|---|
| 17 | RPC failover verified | **PASS** | Pool with 2 dead endpoints first returns a block ~350 ms, 20/20 concurrent OK; `packages/chain/src/pool.ts` |
| 18 | PM2 reboot survival + startup + save | **PASS** | `pm2 kill && pm2 resurrect` → all 12 apps + site back; `pm2-root.service`, `pm2 save` |
| 19 | Postgres nightly dump to a second location + **tested** restore | **PASS** | `ops/pg-backup.sh` → two on-disk paths + rclone hook; `ops/pg-restore-test.sh` restores to a scratch DB, row-count diff vs prod, first-party non-empty assert — **PASS** |
| 20 | Health monitor every 60s → Telegram on 2 consecutive failures | **PASS** | `ops/health-monitor.sh`, PM2 app `marque-health`; alert + recovery message paths |
| 21 | Circuit breakers on every upstream | **PASS** | RPC pool bench/cooldown; 8004scan request budget; DeepSeek USD cap; `docs/ARCHITECTURE.md` failure table |
| 22 | Rate limiting + CSP + security headers | **PASS** | `apps/web/next.config.mjs` — CSP, HSTS, COOP, Permissions-Policy; rate limits on `/api/v1/*` |
| 23 | Rebuild drill respecting invariant 12 (derived rebuilt in scratch, first-party verified via restore) | **PASS** | `ops/rebuild-drill.sh` — grep proves ingest has no first-party insert; truncate derived; ingest from cursor 0; **agent 300 rebuilt, first-party untouched** |
| 24 | `docs/RUNBOOK.md` | **PASS** | Present — restart, deploy, backup/restore, monitoring, "agent down at 3am", key rotation, breakers, diagnostics |
| 25 | Load test: 50 concurrent `/desk` reads | **PASS** | `ops/load-test.sh` — **50/50 return 200**, site healthy immediately after; p50 ~17 s at 50× (graceful degradation, pool spreads load); 12 s cache added |

### P12 — Submission kit

| # | Requirement | State | Evidence |
|---|---|---|---|
| 26 | README: judge links first, every link and tx-hash real | **PASS** | `README.md` — 13-row judge table, 4 real proof tx hashes, live funnel link |
| 27 | `docs/ARCHITECTURE.md` with an inline SVG (all text as `<text>`, full-canvas bg rect, token palette) | **PASS** | `docs/ARCHITECTURE.md` |
| 28 | `docs/SECURITY.md` — SSRF, signing boundary, key handling, LLM boundaries | **PASS** | `docs/SECURITY.md` |
| 29 | `docs/SUBMISSION.md` — acceptance gate, PASS-with-evidence or honest | **PASS** | this file |
| 30 | Naming sweep — no lowercase `marque` common noun, no wax-seal / "letter of marque" framing | **PASS** | output below — zero violations |
| 31 | Demo video ≤ 2:45 | **NOT DONE — cannot produce** | Shot list + narration script at the end of this file; recording is a human step |

---

## Naming sweep

```
$ grep -rniE '\b(a|an|the|your|our|this|that|each|any|one|another|every|no)\s+marque\b|\bmarques\b|letter[s]?\s+of\s+marque' \
    apps/ packages/ docs/ README.md --include=*.ts --include=*.tsx --include=*.css --include=*.md --include=*.mjs

apps/web/app/_components/MarqueMark.tsx:2:  * The Marque symbol — ...            proper noun (capital M)
apps/web/app/docs/page.tsx:20:  { id: 'mcs', title: 'The Marque Conformance Standard' }   proper noun
apps/web/app/standard/page.tsx:130:  The Marque Conformance Standard ...      proper noun
apps/web/app/builders/test/page.tsx:10:  ... the Marque Conformance Standard   proper noun
apps/web/app/api/v1/builders/claim/publish/route.ts:59:  ... the Marque index    proper noun
apps/web/app/receipts/[id]/opengraph-image.tsx:19:  A Marque receipt: ...        proper noun (capital M)
packages/ui/src/brand.ts:10:  * ... never "a marque" or "grant a marque".      GUARD COMMENT (prohibition)
packages/mandates/src/types.ts:11:  * ... Never "a marque". Marque is a proper noun   GUARD COMMENT
packages/agent-engines/src/serve.ts:4:  * The Marque face of a reference agent.   proper noun
packages/agent-engines/src/types.ts:26:  * ... an MCS pass by a Marque reader      proper noun
packages/mandates/src/store.ts:28:  /** The Marque category ... */             proper noun
docs/DEVIATIONS.md:231:  ... no Marque-owned demo position exists.            proper noun
docs/RUNBOOK.md:108:  # ... restore as the marque role                        postgres role name (system id)

$ grep -rniE 'wax.?seal|hallmark|letter of marque' apps/ packages/ docs/ README.md
(zero hits)
```

**Zero violations.** Every hit is one of: `Marque` used as a proper-noun
adjective with a capital M; a guard comment that instructs contributors *not* to
use it as a common noun; or the literal PostgreSQL role name `marque`. No
"letter of marque" framing, no wax-seal or hallmark imagery anywhere — the brand
mark is a winged-M lockup, not a seal.

---

## Production state at submission

```
$ pm2 status
marque-web, marque-ingest, marque-probe, marque-classify, marque-pancake-watch,
marque-conform, marque-bound, marque-lattice, marque-sluicegate, marque-keel,
marque-redcell, marque-health   —  12/12 online

$ for u in / /api/v1/agents /api/v1/funnel /pancakeswap/proof /status /register /ledger; do
    curl -so /dev/null -w "%{http_code} $u\n" https://marque.trade$u; done
200 /            200 /api/v1/agents   200 /api/v1/funnel   200 /pancakeswap/proof
200 /status      200 /register        200 /ledger
```

Funnel snapshot 2026-09-08: 298,817 registered → 30,357 with a parseable
service → 30,028 responding → 6,105 bound and callable → 508 classified →
100 classified and callable now. Live at `/api/v1/funnel`.

---

## Standing rule for the judging window

Nothing is turned off on the submission date. Judging runs to **23 September
2026**. From the deadline the deployment is treated as **frozen**:

- **Allowed:** uptime, monitoring, security patches, bug fixes.
- **Data accrual is not a change** — the index staying fresh, new probes, sealed
  calls resolving, third parties self-listing, real buyers hiring. That is the
  product operating normally.
- **Not allowed without a written go-ahead:** new features, new pages,
  redesigns, scope changes.

> _Placeholder for the organisers' answer:_ if the BNB Chain team specifies a
> different freeze policy for the judging window, their instruction supersedes
> this paragraph and will be recorded here with the date received.

---

## Demo video — shot list and narration (≤ 2:45)

Recording is a human step. Target 2:40. One take per shot, screen capture at
1440×900, no webcam, cursor visible.

| # | Time | On screen | Narration |
|---|---|---|---|
| 1 | 0:00–0:15 | `marque.trade` homepage; paste a BSC address; positions render | "Marque is an agent marketplace for BNB Smart Chain. Paste any address — these are its live PancakeSwap and Venus positions, read straight from chain." |
| 2 | 0:15–0:35 | `/register`, scroll: warranted agents at top, graveyard below | "There are ~300,000 agents registered on BSC. Almost none work. Marque ranks them by whether they're callable and whether they passed a published test. The ones that failed are still here — with the failure — because showing only passes would be marketing." |
| 3 | 0:35–0:55 | An agent profile; open the conformance diff showing a **failed** field | "Every warrant is a pass on a deterministic test, run against a real position at a pinned block. A failure names the exact field that was wrong." |
| 4 | 0:55–1:20 | `/app/charter`: screen dims to cockpit, charter composes line by line, sign, tx hash types in | "To hire one, you grant a charter — an allowlist of contracts, a spend cap, an expiry. One signature. It's enforced before the agent can sign anything, and you revoke it in one transaction." |
| 5 | 1:20–1:45 | The Seal on a receipt; point at the anchor tx on testnet BscScan | "The recommendation is hashed on chain before its outcome is known, so a track record can't be assembled after the fact." |
| 6 | 1:45–2:20 | `/pancakeswap/proof`: before → 4 tx hashes → after → cost | "This is one real rebalance on mainnet. A deliberately narrow BNB/USDT range drifted out and earned nothing for 0.9 hours. The agent withdrew, swapped to the ratio the new range needed, and re-centred — under a $60 charter. Every hash is on BscScan. Total gas: ten cents. Realised slippage: under one basis point." |
| 7 | 2:20–2:40 | `/ledger` mechanism + registered rubric; `/status` | "The Ledger puts an agent against a human analyst on the same task, graded blind against a rubric registered first. And the whole system degrades honestly — `/status` tells you what's fresh and what's stale. Nothing here is a number we made up." |
