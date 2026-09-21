# Marque final production release

Date: 2026-09-21
Release branch: `hardening/third-party-marketplace`

## Release outcome

This document is the authoritative release record. It distinguishes software
safety from the breadth of independent supply. Unsupported registry entries
remain discoverable but cannot expose Hire.

The hardened application was merged and deployed. Production verification
completed against the public HTTPS service and production database.

## Database migration

- Production database: local PostgreSQL 16 database `marque`, role `marque`.
- Pre-migration counts: 355,659 agents; 40,997 services; 2,438,752 probes; 27
  runs; 23 receipts.
- Backup: `marque-pre-release-20260921T152226Z.sql.gz`, stored in both configured
  backup locations; both copies SHA-256
  `e2841d2695311d1483f4642b645ff3799e74604313dbe0ad2f7a4504141e4b97`;
  gzip verification passed.
- Migrations 0012 and 0013 first passed through Drizzle on persistent isolated
  database `marque_release_20260921` (14 journal entries).
- Production application used the supported Drizzle migrator. The probe writer
  alone was paused. Two nine-hour read-only legacy aggregate queries blocking
  the additive lock were cancelled; no mutation was cancelled.
- Post-migration journal contains 0012 (`created_at=1790037600000`) and 0013
  (`created_at=1790037601000`). All intended columns and five indexes exist.
- Post-migration counts: 355,662 agents; 40,997 services; 2,438,752 probes; 27
  runs; 23 receipts; 0 initial rejections. The small agent increase was the
  concurrently running ingest worker; no historical evidence row was lost.

## Canonical fresh funnel

Measured 2026-09-21T17:58:40Z after migration. Fresh-model coverage began at
2026-09-21T15:25:00Z and continued in the background:

| State | Count |
|---|---:|
| Registered identities | 355,699 |
| Metadata-readable identities | 114,331 |
| Identities declaring a service | 39,958 |
| Exact declared services | 41,001 |
| Freshly evaluated exact services | 2,628 |
| Freshly evaluated identities | 2,608 |
| Reachable identities, fresh 24h | 22,737 |
| Callable identities, fresh 24h | 6,894 |
| Complete-task-compatible services / identities | 1 / 1 |
| Qualified identities | 0 |
| Canonically hireable independent identities | 1 |

These are coverage-bounded measurements, not estimates of the unprobed
population. The append-only worker is rate-limited, host-limited, resumable and
prioritises services lacking current-model evidence.

## External interoperability evidence

- 128 unique targeted independent services were freshly inspected: 50 A2A, 50
  MCP and 28 x402.
- 54 completed protocol discovery without an A2A work request.
- A2A card reads remain card/discovery evidence only; no card was promoted to
  callable.
- One exact external MCP service, Venus Liquidation Guard service 32467,
  exposes a schema-compatible read-only health-factor analysis using the
  deterministic aliases `borrower` and `targetHealthFactor`.
- The historical `unclassified` label was preserved. A new additive
  capability-derived `health_factor` label records service 32467 as provenance.
- Production completed one independent lifecycle for that exact service:
  Marketplace/profile → bounded testnet Charter → MCP initialize/initialized/
  tools/list/tools/call → external result → immutable receipt → testnet anchor.
- Identity and service continuity held throughout: agent `338480`, service
  `32467`, probe `2438821`, run/receipt
  `5e3a6cab-d203-491e-bff3-7df5ce06d7fc`.
- External execution succeeded in 818 ms. Its response then failed MCS-HF-1,
  proving that callable/executed and qualified remain separate states.
- No external payment, wallet signature, token approval, delegated authority,
  provider mutation, mainnet transaction or state-changing tool was invoked.
- Raw evidence:
  `docs/evidence/third-party/candidate-discovery/2026-09-21T15-29-49Z.json`.
- Production lifecycle manifest:
  `docs/evidence/third-party/338480/production-lifecycle-2026-09-21.json`.

## Engineering results

- Generic Charter inventory and exact deep links use one canonical evaluator.
  Batched evaluation replaces the per-identity N+1 while preserving exact
  service/probe identity and the shared freshness clock.
- A2A card readability, endpoint discovery, endpoint reachability,
  `message/send` callability and task compatibility remain distinct.
- MCP follows initialize → initialized notification → tools/list → tools/call.
  Preflight no longer invokes a tool; execution invokes it once.
- Semantic schema adaptation is narrow and provenance-preserving. Unknown or
  ambiguous required arguments still fail closed.
- Accepted runs terminate in typed receipts. Attempts rejected before
  acceptance create immutable `run_rejection` evidence instead of a fabricated
  execution receipt.
- Exact agent ID, service ID, protocol, discovery endpoint, executable endpoint
  and probe ID survive run and receipt construction.

## Test and performance evidence

- Unit/integration: 273 passed; 3 chain-pool tests explicitly skipped because
  they require configured live RPC endpoints.
- Typecheck: passed all 18 workspaces.
- Lint: passed with zero warnings.
- Production build: passed. Three known optional dependency/critical-expression
  webpack warnings remain; no build error.
- Playwright: 10/10 passed across desktop Chromium and Pixel 7 against the
  migrated, isolated release-candidate database.
- Production Playwright: 6/6 read-only no-wallet, fail-closed and navigation
  tests passed across desktop Chromium and Pixel 7.
- Production query plans: health-factor Charter candidate lookup used category,
  service and identity indexes and completed in 38.664 ms; exact service probe
  lookup completed in 34.811 ms. Neither spilled to disk.

## Security result

SSRF/private ranges, redirect revalidation, response-size limits, timeouts,
malformed protocol responses, schema incompatibility, identity/service mixing,
stale evidence, unsupported category, Charter binding, duplicate receipt and
preflight double-execution tests pass. Mutation routes remain capability-bound.
No mainnet state change occurred during this release audit.

## Remaining issues

- P0: none known after production smoke.
- P1: none known after production smoke.
- P2: most indexed services still lack fresh-model evidence; broad external
  compatibility remains narrow; third-party payment/settlement is unproven;
  A2A task callability remains unproven without a real work interaction.

## Defensible claims

- Marque indexes BSC ERC-8004 identities and truthfully separates registration,
  service declaration, reachability, callability, task compatibility,
  qualification and Hire eligibility.
- Exact third-party selection cannot silently substitute a reference agent.
- MCP discovery is standards-shaped and task invocation is schema-derived.
- Unsupported agents fail closed and remain inspectable.
- Every accepted run terminates in evidence; pre-acceptance rejection is a
  different immutable artifact.
- One independent external MCP operator has completed the production Charter
  → external result → receipt lifecycle without payment or mutation.

## Forbidden claims

- Every indexed identity is callable, compatible or hireable.
- A readable A2A card proves `message/send` works.
- Arbitrary third-party agents can complete a Marque task.
- Third-party payment or settlement is generally proven.
- A receipt by itself proves settlement, correctness or MCS qualification.

## Deployment record

- Production application commit: `ecee45d29983ce9dc07779dba8a084e81a2b84ec`.
- Main merge commit: `ecee45d29983ce9dc07779dba8a084e81a2b84ec`.
- Deployment: successful through `scripts/deploy-web.sh`; `marque-web` and all
  Marque workers are online under PM2; Caddy, PostgreSQL and Redis are active.
- Production migration: Drizzle journal rows 13/14 present. Post-proof counts:
  355,699 agents, 41,001 services, 2,441,380 probes, 28 runs, 24 receipts and
  0 pre-acceptance rejections.
- Production smoke: public health, homepage, Register/category, third-party
  profile, exact Hire, Charter Desk, run, latest receipt, Judge, Ledger,
  PancakeSwap proof, positions, Standard, Compare, Docs, Status and funnel API
  returned 200. Canonical routes were used.
- Production URL: https://marque.trade
- Final recommendation: **DEPLOYED / GREEN for truthful limited inventory**.
  Breadth remains narrow: one independent operator/service is compatible and
  hireable; A2A execution and third-party settlement remain unproven.
