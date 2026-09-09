# Submission

BNB Chain **"Build the Era"** hackathon. Francis confirmed portal submission on
9 September 2026. The exact portal submission timestamp is not recorded here.
This submission-facing audit was prepared on 9 September 2026; judging runs to
23 September 2026.

- **Live:** https://marque.trade
- **Judge walkthrough:** https://marque.trade/judge
- **Repo:** https://github.com/talk2francis/Marque
- **Final demo:** [download the 2:14 MP4](https://github.com/talk2francis/Marque/releases/download/demo-2026-09-09/marque-demo.mp4) · [60-second cut](https://github.com/talk2francis/Marque/releases/download/demo-2026-09-09/marque-demo-60.mp4)

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
| 9 | LLM never signs, never prices | **PASS** | DeepSeek performs classification and disclosed blind Ledger grading; signing and pricing remain deterministic — `docs/SECURITY.md §4` |
| 10 | `safeFetch()` SSRF guard on every outbound agent call | **PASS** | `packages/probe/src/safe-fetch.ts`; sole path; `safe-fetch.test.ts` + `redirect.test.ts` |
| 11 | First-party observations never deleted | **PASS** | No delete path for probe / conformance_result / receipt / run / sealed_call / pool_tick_observation; rebuild drill truncates derived tables only |
| 12 | The Ledger: agent vs. human, blind-graded against a pre-registered rubric | **PARTIAL — provenance gaps disclosed** | All eight human repetitions have blind grades. Five agent repetitions in published batches remain ungraded; manual manifest blocks are absent. See `docs/AGENT-ADVANTAGE-REPORT.md` for the reconciled evidence. |

### TermiX Challenge — Agent Advantage Report

| # | Requirement | State | Evidence |
|---|---|---|---|
| T1 | ≥ 3 real tasks, run with a marketplace agent vs. without | **Recorded; comparison validity incomplete** | Four tasks, two human repetitions each and agent observations. Same-block and final-task execution gaps remain disclosed. |
| T2 | ≥ 1 task from trading / stock / security | **PASS** | ADV-01 is a security triage of a live BSC token contract |
| T3 | Time, cost and output quality per task, actual outputs attached | **Recorded with gaps** | Human timings and all eight blind grades are recorded. Published agent batches have five missing grades; raw outputs and cost lines remain public in the Ledger. |
| T4 | Advantage measured, not asserted | **NOT ESTABLISHED** | No speed/cost/quality victory is claimed until task and block provenance support a valid comparison. |

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
| 27 | `docs/ARCHITECTURE.md` with an SVG diagram (all text as `<text>`, full-canvas bg rect, token palette) | **PASS** | `docs/ARCHITECTURE.md` + standalone `docs/architecture.svg` (embedded as `<img>` because GitHub strips inline `<svg>` from markdown; inline copy kept in a `<details>`) |
| 28 | `docs/SECURITY.md` — SSRF, signing boundary, key handling, LLM boundaries | **PASS** | `docs/SECURITY.md` |
| 29 | `docs/SUBMISSION.md` — acceptance gate, PASS-with-evidence or honest | **PASS** | this file |
| 30 | Naming sweep — no lowercase `marque` common noun, no wax-seal / "letter of marque" framing | **PASS** | output below — zero violations |
| 31 | Demo video ≤ 2:45 | **PASS — mechanical QA** | Final hero 134.6 seconds, 60-second cut, both SRTs and `demo-video/astra/final/QA.json`; all 13 mechanical checks pass. Human listening and full-motion review remain unassessed. |

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

## Historical production verification (8 September 2026)

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

## Final demo and changing live counts

The final 2:14 film and 60-second cut are complete. Download links appear above;
subtitles, credits and QA are in `demo-video/`. The obsolete pre-production shot
list has been superseded by the finished film and remains available in Git history.

The demo was recorded at **684 completed third-party conformance runs**. The live
Standard continues to accrue runs during normal operation, so current totals may
be higher. Recorded figures are a dated snapshot, not a claim about today's total.

The film's archived Ledger capture also predates this audit. The live Ledger and
Agent Advantage Report disclose current completion and provenance gaps.
