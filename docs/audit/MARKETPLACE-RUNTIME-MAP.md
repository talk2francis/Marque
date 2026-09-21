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
| Service probing | `apps/worker/src/probe.ts` -> `packages/probe/src/worker.ts::runProbeCycle` -> `probeService` | append-only `probe`, indexed by `(service_id, checked_at desc)` | Hostile network endpoint through `safeFetch` |
| A2A discovery | `packages/probe/src/liveness.ts::probeA2A` | probe liveness, skills, separately declared executable endpoint | Validated agent card; no endpoint is inferred from its URL |
| MCP discovery | `packages/probe/src/liveness.ts::probeMCP` | protocol version, session, tools and schema-compatible task kinds | Successful `initialize` → `notifications/initialized` → `tools/list`; a GET descriptor is not callable proof |
| Conformance | `apps/worker/src/conform.ts` -> `packages/conformance` | `conformance_case`, append-only `conformance_result` | Pinned test case and raw response |
| Marketplace projection | `apps/web/lib/marketplace.ts::queryThirdParty` | none; reconstructed SQL/TS view | Currently mixes identity-level and service-level facts |
| Register API | `GET /api/v1/agents` | per-service latest probe embedded beside its exact service | Identity state is aggregated from service evidence; one service cannot donate its probe to another |
| Third-party profile | `apps/web/app/agents/56/[tokenId]/page.tsx` | none | Independently reconstructs latest probe and MCS state |
| Preview | Marketplace links to profile `#preview` | none | Third-party profile currently has no executable preview control |
| Charter eligibility | `apps/web/lib/agents.ts::callableAgentById` -> canonical `agentState` | exact identity/service/probe tuple | Category and service compatibility fail closed |
| Charter grant | `POST /api/v1/charters` -> `CharterService.grant` | append-only `charter` plus testnet transaction | Returns a signed, scoped control capability once; public records do not expose it |
| Run acceptance | `POST /api/v1/runs` -> `apps/web/lib/runs.ts::startRun` | immutable identity/service/probe fields, then `run_event` | Exact service is re-resolved; charter-bound runs require its control capability |
| Adapter selection | `packages/execution/src/factory.ts::executorFor` | not persisted | First live row wins; no requested-capability resolver |
| A2A execution | `A2AExecutor` validates the selected card and POSTs `message/send` only to its declared task endpoint | raw result in `run.result` | Card and task URL remain separate evidence |
| MCP execution | `McpExecutor` initializes a session, lists tools, selects a category/schema-compatible tool, and calls only schema-declared arguments | raw result in `run.result` | Unknown required inputs fail closed; no argument is invented |
| x402/ERC-8183 | protocol-specific executors in `packages/execution/src/executors` | run events/result | Present but not a general third-party marketplace path |
| Authority | `startRun` verifies control capability and Charter binding; `execute` re-reads live state; `runHire` calls `checkAuthority` | run authority block inside receipt | Public Charter IDs grant no control; expiry/revocation are rechecked before the external call |
| Grading | `pipeline.ts::gradeAgainstCase` | receipt quality block | Only meaningful for matching published cases |
| Settlement | executor output plus commercial receipt fields | receipt commercial block | Most runs explicitly remain unsettled |
| Evidence | `pipeline.ts::buildReceipt`, `apps/web/lib/runs.ts` insert/anchor | `receipt`, receipt events, optional testnet anchor | Currently absent for failures before successful quote |
| History | Run Room, receipts, profile, Ledger and Tape query stored observations | no additional record | Several surfaces call any receipt a settled run |

## Deployed processes

PM2 currently supervises twelve Marque processes: web, ingest, probe, classify,
Pancake watcher, conformance worker, five reference agents, and health monitor.
Postgres and Redis are native services. All twelve were online with zero PM2
restarts at baseline capture.

The web build uses committed local Geist, Geist Mono and Fraunces binaries via
`next/font/local`; neither a build nor a page load depends on Google Fonts.

## Data ownership

Derived and rebuildable: `agent`, `agent_service`, `agent_category`,
`ingest_cursor`.

First-party observations and never deletable: probes, funnel snapshots,
conformance cases/results, builder listings, charters, runs/events, receipts,
Ledger records, sealed calls, and pool observations.

The live supply funnel computes independent identity counts for registered,
metadata-readable, service-declaring, reachable, callable, task-compatible,
qualified and hireable. Freshness is 24 hours and probe evidence is joined by
exact service ID; qualification never supplies missing execution capability.

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

Public API CORS is read-only. `GET`/`HEAD` evidence may be consumed cross-origin;
grant, run, claim and revoke mutations never receive a wildcard origin header.
