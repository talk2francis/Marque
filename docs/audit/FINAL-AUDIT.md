# Release verification audit

Date: 2026-09-21  
Branch: `hardening/third-party-marketplace`  
Baseline: `a7aedb1`  
Recommendation: **SUPERSEDED — see the authoritative current state below**

## Authoritative current state — 2026-09-21 final release pass

All findings below this section are retained as historical audit evidence.
Where an older section says OPEN or recommends NO, this section is authoritative.

| Finding | Current status | Evidence |
|---|---|---|
| Generic/exact Hire split and reference fallback | **RESOLVED** | Both paths call the same batched canonical evaluator; desktop/mobile equivalence tests pass. |
| A2A card readability labelled callable | **RESOLVED** | Card-only evidence remains `unbound`; `messageSendCallable` must be explicitly proven. |
| MCP preflight invoked the external tool | **RESOLVED** | Preflight now performs initialize/initialized/tools-list and schema selection only; `tools/call` occurs once during execution. |
| Accepted failures lacked terminal evidence | **RESOLVED** | Accepted runs produce typed terminal receipts with exact service identity. |
| Revoked/expired attempts had ambiguous receipt semantics | **RESOLVED** | Pre-acceptance attempts create immutable `run_rejection` evidence, never an execution receipt. |
| Charter inventory N+1 | **RESOLVED** | Candidate IDs are evaluated in three bounded queries by `agentStates`. |
| Global legacy capability counts | **ACCEPTED LIMITATION** | Migration 0012 is applied; current counts publish fresh coverage separately while the resumable worker re-probes the remaining population. |
| Broad independent interoperability | **PARTIALLY PROVEN / OPEN P2 breadth** | 128 targeted services inspected; independent agent 338480/service 32467 completed the production Charter → MCP result → receipt lifecycle. No unsupported service is offered for Hire. |
| Third-party payment/settlement | **OPEN P2** | Discovery is represented separately; no external payment was made or claimed. |

Production migration 0012 and additive rejection migration 0013 were applied
through Drizzle after a dual-location verified backup. Post-migration counts
showed no loss of agents, services, probes, runs or receipts. Final deployment
and smoke evidence is recorded in `FINAL-PRODUCTION-RELEASE.md`.

## Historical release-verification record (superseded where noted above)

## 2026-09-21 semantic-hardening follow-up

The generic Charter Desk now performs only a bounded candidate-ID query and
passes every identity through the same `callableAgentById → agentState →
evaluateAgentState` decision used by exact deep links. Unsupported categories
fail closed. Regression fixtures reproduce ClawdMint #2468 as card-readable
but not hireable and prove it is absent from generic inventory while an exact,
compatible MCP service is accepted by both paths.

New A2A probes now preserve `cardReadable`, `endpointDiscovered`, advertised
skills and advertised task hints, but record `messageSendCallable: null`, no
verified task kinds, and `liveness: unbound`. Historical evidence is unchanged.
Canonical evaluation additionally requires explicit genuine
`messageSendCallable: true` evidence before an A2A service can become callable.

MCP matching was tightened: a category keyword plus a schema whose required
arguments happen to be known is insufficient. The schema must be able to
represent the typed task (generic prompt/task input, or the necessary category
policy fields). This removed every false task-compatible match in the fresh
30-service sample.

Receipts now preserve exact `serviceId`, protocol, discovery endpoint,
executable endpoint and probe ID. Quote, authority, timeout, malformed response
and incompatible-interface tests assert the true terminal stage and immutable
service identity.

### Updated fresh discovery result

- 30 exact services inspected: 10 A2A, 10 MCP, 10 x402.
- 29 were protocol-reachable: ten readable A2A cards, nine successful MCP
  initialize/tools-list handshakes, ten x402 HTTP endpoints.
- 19 were demonstrably protocol-callable without an A2A task: nine MCP and ten
  x402. This is transport callability, not Marque task compatibility.
- 0 exposed a schema proven compatible with one of the four complete Marque
  tasks under the tightened matcher.
- 0 were canonical third-party Hire candidates in this fresh sample.
- 0 were safely invoked through a Marque lifecycle, because the three class-A
  read-only MCP tools were not task-compatible. See
  `EXTERNAL-EXECUTION-SAFETY.md`.

The production-derived database currently contains 355,603 registered
identities, 114,263 detail/metadata-readable identities, 39,927 identities with
a declared service, and 5 distinct identities with a historical passing
conformance result. Its pre-0012 probe rows report 26,775 fresh reachable and
6,199 legacy “live” non-A2A identities, but **6,199 is not publishable as a
canonical callable count**: legacy MCP observations include descriptor-only
GET probes and lack the new manifest/task fields. Compatible and hireable
global counts therefore remain unavailable until 0012 is applied and services
are freshly reprobed. Reporting zero or 6,199 as the global canonical value
would both be false.

### Browser, performance and security follow-up

The freshly built application passed 4/4 desktop/mobile candidate tests:
generic/exact equivalence, stale/card-only exclusion, exact compatible
selection, no reference fallback, and unsupported-category fail-closed. The
earlier live read-only suite remains 6/6. No Grant button was clicked.

The new candidate-ID query used category, service and primary-key indexes on
the 355,603-identity database, returned 84 identities in 13.161 ms, used an
in-memory 30 kB quicksort, and wrote no temp blocks. Canonical evaluation is
correct but still fan-outs per identity; batching those reads is a remaining
P2 performance improvement before large category expansion.

SSRF/private-address/redirect/size/timeout coverage, exact service mixing,
stale probe, category tampering, identity mismatch, revoked/expired binding and
duplicate receipt persistence tests pass. No mainnet write, external task call,
production migration or deployment occurred.

This is a release-gate report, not a declaration of completion. Production was
not migrated, modified, or deployed during verification.

## Release blockers

### P0 — Charter browse path bypasses canonical hireability

- **Symptom:** `/app/charter?category=yield` enables Grant with a reference
  agent preselected and offers third-party services that their exact profile
  and exact deep link describe as not callable/not hireable.
- **Root cause:** `callableAgents()` in `apps/web/lib/agents.ts` independently
  selects the latest `probe.liveness = 'live'` A2A/MCP row. It does not call
  `agentState()`/`evaluateAgentState()`, enforce the 24-hour freshness limit,
  require `task_kinds`, or bind the selected service/probe evidence.
- **Evidence:** live profile `/agents/56/2468` said ClawdMint was “not
  callable”; its exact Charter deep link failed closed, while the generic Yield
  Charter selector offered both ClawdMint A2A and MCP entries. The generic desk
  had Grant enabled.
- **Status:** OPEN. Release rule 5 fails.

### Historical P0 — No independent external end-to-end lifecycle was proven (RESOLVED)

- **Symptom:** zero independent external agents have yet completed
  Marketplace → profile → exact Charter → external task → result → receipt in
  this release candidate.
- **Evidence:** fresh discovery covered 30 endpoint-deduplicated services. A
  real external task pass was prepared, but the execution environment refused
  remote `execute()` calls because an operator may implement side effects even
  for a plan-only prompt. No call was sent.
- **Status:** RESOLVED on 2026-09-21. Independent identity `338480`, exact MCP
  service `32467`, completed production Charter → external read-only result →
  immutable receipt. Its result failed MCS-HF-1 and remains unqualified. See
  run `5e3a6cab-d203-491e-bff3-7df5ce06d7fc` and
  `docs/evidence/third-party/338480/production-lifecycle-2026-09-21.json`.

### P1 — A2A “live” is not proof of callability

- **Symptom:** all ten sampled A2A cards received `ok: true`/`liveness: live`
  after only a GET of the card. The advertised `message/send` endpoint was not
  exercised.
- **Root cause:** `probeA2A()` in `packages/probe/src/liveness.ts` treats a
  parseable card containing a URL and skills as live. This proves readable
  metadata and a declared service, not a callable task interface.
- **Status:** OPEN. Reachable and callable remain collapsed in persisted probe
  evidence for A2A.

### P1 — Required browser matrix remains incomplete

Six read-only checks passed on desktop and mobile: no-wallet Marketplace and
profile, exact unavailable-agent fail-closed behavior, reload, and browser
history. Reference success, real A2A/MCP success, failure receipts, revoked and
expired Charters, stale probes, and post-grant run/receipt identity continuity
are not yet browser-proven.

## Migration result

Migration `0012_capability_evidence` was applied transactionally to isolated
database `marque_release_verify_20260921`. It preserved seeded historical rows,
classified legacy receipt artifacts from their bodies, and created the three
intended indexes. Raw replay failed atomically on duplicate columns, as
expected; Drizzle journal application is the supported idempotency mechanism.
Production was not migrated. Full unit/type/lint/build gates passed after the
migration correction. See `MIGRATION-0012-VERIFICATION.md`.

## External discovery

The balanced fresh pass attempted 30 exact services: ten A2A, ten MCP, and ten
x402. Discovery succeeded for 29. Q402's advertised `/api/mcp/info` endpoint
returned HTTP 405 to MCP initialize and was correctly retained as a failure.
Fresh MCP handshakes found working initialize/tools-list negotiation at
ClawdMint, 4LPHA, Singularry, OpenOdds, Fly, HeyAnon, Topaz, and Brain On BNB.
This is discovery evidence, not proof that any tool is compatible with a
Marque task or that execution succeeds.

Machine-readable evidence:

- `docs/evidence/third-party/candidate-discovery/2026-09-21T11-38-05Z.json`
- `docs/evidence/third-party/candidate-discovery/2026-09-21T11-37-09Z.json`

## Browser result

`MARQUE_E2E_BASE_URL=https://marque.trade pnpm exec playwright test
e2e/release-readonly.spec.ts` passed 6/6 tests across desktop Chromium and a
Pixel 7 viewport. For ERC-8004 #2468, the direct Charter deep link preserved
the exact query identity across reload/history, selected no substitute, and
kept Grant disabled. This proves the repaired exact-unavailable path, not the
complete lifecycle.

## Capability claims currently supportable

| Capability | Tested | Live verified | Release status |
|---|---:|---:|---|
| ERC-8004 discovery | yes | yes | supported |
| Exact third-party profile | yes | yes | supported |
| Fresh MCP initialize/tools-list | yes | yes | supported for sampled services |
| Exact unavailable Hire fails closed | yes | yes | supported |
| No reference substitution on tested deep link | yes | yes | supported |
| Third-party A2A execution | no | no | unsupported |
| Third-party MCP task execution | no | no | unsupported |
| Third-party Charter-to-receipt lifecycle | no | no | unsupported |
| Third-party payment/settlement | no | no | unsupported |
| Generic Charter shortlist equals canonical Hire | yes | no | false |
| Every accepted failure produces a typed receipt | unit only | no | unproven live |

## Deployment recommendation

**NO.** This follows mechanically from the absolute release rules: zero
independent external full lifecycles are proven, and the generic Charter Desk
can offer agents that the canonical capability evaluator says are not
hireable. Do not merge or deploy until both are repaired and the missing
browser/runtime gates pass.
