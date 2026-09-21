# Marque final production release

Date: 2026-09-21
Release branch: `hardening/third-party-marketplace`

## Release outcome

This document is the authoritative release record. It distinguishes software
safety from the breadth of independent supply. Unsupported registry entries
remain discoverable but cannot expose Hire.

The final production SHA, merge SHA, deployment result and post-deployment
smoke results are filled from the deployed host after the release commit is
merged and verified.

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

Measured 2026-09-21 after migration, with fresh-model coverage beginning
2026-09-21T15:25:00Z:

| State | Count |
|---|---:|
| Registered identities | 355,688 |
| Metadata-readable identities | 114,324 |
| Identities declaring a service | 39,957 |
| Exact declared services | 41,000 |
| Freshly evaluated exact services | 2,128 |
| Freshly evaluated identities | 2,111 |
| Reachable services / identities | 256 / 245 |
| Callable services / identities | 54 / 45 |
| Complete-task-compatible services / identities | 1 / 1 |
| Fresh qualified identities | 4 |
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
- No external payment, signature, approval, transaction or state-changing tool
  was invoked.
- Raw evidence:
  `docs/evidence/third-party/candidate-discovery/2026-09-21T15-29-49Z.json`.

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

- P0: none known before deployment.
- P1: production deployment and smoke verification pending at the time this
  section was written.
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

## Forbidden claims

- Every indexed identity is callable, compatible or hireable.
- A readable A2A card proves `message/send` works.
- Arbitrary third-party agents can complete a Marque task.
- Third-party payment or settlement is generally proven.
- A receipt by itself proves settlement, correctness or MCS qualification.

## Deployment record

- Production commit: pending
- Main merge commit: pending
- Deployment: pending
- Production smoke: pending
- Production URL: https://marque.trade
- Final recommendation: pending post-deployment smoke
