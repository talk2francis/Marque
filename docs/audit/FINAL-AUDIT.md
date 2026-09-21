# Release verification audit

Date: 2026-09-21  
Branch: `hardening/third-party-marketplace`  
Baseline: `a7aedb1`  
Recommendation: **NO — do not deploy**

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

### P0 — No independent external end-to-end lifecycle is proven

- **Symptom:** zero independent external agents have yet completed
  Marketplace → profile → exact Charter → external task → result → receipt in
  this release candidate.
- **Evidence:** fresh discovery covered 30 endpoint-deduplicated services. A
  real external task pass was prepared, but the execution environment refused
  remote `execute()` calls because an operator may implement side effects even
  for a plan-only prompt. No call was sent.
- **Status:** OPEN. Release rule 3 requires recommendation NO.

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
