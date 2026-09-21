# Marketplace runtime map

Audit baseline: 2026-09-21. Source HEAD: `48255bcb45caecc477ea680c9276d7c6d5f5b859`.
Commit `7fb5331` is its direct parent and is not yet on `origin/main`.

This document describes the code that runs, not the intended architecture.

## Runtime topology

| Stage | Runtime path | Durable record | Trust boundary |
|---|---|---|---|
| ERC-8004 discovery | `apps/worker/src/ingest.ts` calls `sweepChainIdentities`, `sweepList`, and `sweepListDeep` | `agent`, `ingest_cursor` | BSC RPC and 8004scan |
| Metadata enrichment | `packages/registry/src/ingest.ts` and `normalize.ts` | `agent.raw_metadata`, normalized identity fields | Untrusted registry metadata |
| Service extraction | `packages/registry/src/normalize.ts::extractServices` reads top-level, off-chain array, and flat fields | `agent_service` | Untrusted URLs, protocol and price claims |
| Classification | `apps/worker/src/classify.ts`, `packages/registry/src/classify.ts` | `agent_category` | Derived heuristic, not executable proof |
| Service probing | `apps/worker/src/probe.ts` -> `packages/probe/src/worker.ts::runProbeCycle` -> `probeService` | append-only `probe` | Hostile network endpoint through `safeFetch` |
| A2A discovery | `packages/probe/src/liveness.ts::probeA2A` | probe liveness, skills, separately declared executable endpoint | Validated agent card; no endpoint is inferred from its URL |
| MCP discovery | `packages/probe/src/liveness.ts::probeMCP` | protocol version, session, tools and schema-compatible task kinds | Successful `initialize` → `notifications/initialized` → `tools/list`; a GET descriptor is not callable proof |
| Conformance | `apps/worker/src/conform.ts` -> `packages/conformance` | `conformance_case`, append-only `conformance_result` | Pinned test case and raw response |
| Marketplace projection | `apps/web/lib/marketplace.ts::queryThirdParty` | none; reconstructed SQL/TS view | Currently mixes identity-level and service-level facts |
| Third-party profile | `apps/web/app/agents/56/[tokenId]/page.tsx` | none | Independently reconstructs latest probe and MCS state |
| Preview | Marketplace links to profile `#preview` | none | Third-party profile currently has no executable preview control |
| Charter eligibility | `apps/web/lib/agents.ts::callableAgentById` | none | Currently treats an agent-level live probe as proof for an A2A/MCP row |
| Charter grant | `POST /api/v1/charters` -> `CharterService.grant` | append-only `charter` plus testnet transaction | BSC testnet; public endpoint provisions a demo owner |
| Run acceptance | `POST /api/v1/runs` -> `apps/web/lib/runs.ts::startRun` | `run`, then `run_event` | Re-resolves service independently of Marketplace/Charter |
| Adapter selection | `packages/execution/src/factory.ts::executorFor` | not persisted | First live row wins; no requested-capability resolver |
| A2A execution | `A2AExecutor` validates the selected card and POSTs `message/send` only to its declared task endpoint | raw result in `run.result` | Card and task URL remain separate evidence |
| MCP execution | `McpExecutor` initializes a session, lists tools, selects a category/schema-compatible tool, and calls only schema-declared arguments | raw result in `run.result` | Unknown required inputs fail closed; no argument is invented |
| x402/ERC-8183 | protocol-specific executors in `packages/execution/src/executors` | run events/result | Present but not a general third-party marketplace path |
| Authority | `startRun` reads Charter; `runHire` calls `checkAuthority` | run authority block inside receipt | Must be audited for expiry, revocation, cap and race enforcement |
| Grading | `pipeline.ts::gradeAgainstCase` | receipt quality block | Only meaningful for matching published cases |
| Settlement | executor output plus commercial receipt fields | receipt commercial block | Most runs explicitly remain unsettled |
| Evidence | `pipeline.ts::buildReceipt`, `apps/web/lib/runs.ts` insert/anchor | `receipt`, receipt events, optional testnet anchor | Currently absent for failures before successful quote |
| History | Run Room, receipts, profile, Ledger and Tape query stored observations | no additional record | Several surfaces call any receipt a settled run |

## Deployed processes

PM2 currently supervises twelve Marque processes: web, ingest, probe, classify,
Pancake watcher, conformance worker, five reference agents, and health monitor.
Postgres and Redis are native services. All twelve were online with zero PM2
restarts at baseline capture.

## Data ownership

Derived and rebuildable: `agent`, `agent_service`, `agent_category`,
`ingest_cursor`.

First-party observations and never deletable: probes, funnel snapshots,
conformance cases/results, builder listings, charters, runs/events, receipts,
Ledger records, sealed calls, and pool observations.

## Broken joins and duplicated decisions

There is no canonical capability resolver. `marketplace.ts`, the third-party
profile, `agents.ts`, and `runs.ts` each decide availability independently.
They use different probe granularity and endpoint precedence. Consequently an
agent can be labelled callable by one surface, admitted to Charter by another,
and fail because execution chose a third service.

Operator/host deduplication is a presentation concern. It must never choose the
execution identity. The current marketplace aggregate independently selects ID,
name, category, protocol and price from a group and can create a fictional
composite.

## Required target invariant

Every action carries an immutable tuple from selection through evidence:

`identity ID + service ID + protocol + discovery endpoint + executable endpoint + capability + probe observation + task input hash`.

Marketplace, profile, Charter admission and run execution must consume one
server-side capability result for that tuple. Qualification remains an
independent observation and never supplies missing execution compatibility.
