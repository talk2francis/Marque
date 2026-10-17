# Capability inventory and reuse map

Baseline `97ef4c7`. EXISTS means an implementation is present; it does not certify every production path. This covers the V1 capability ladder reconstructed in the supplied V3 pack. The original 3 October V1 zip was not found, so line-for-line completeness against that unavailable artifact is UNKNOWN.

| Capability | Classification | Reuse and remaining delta |
|---|---|---|
| Canonical identity/service index | EXISTS | `packages/registry`, DB agent/service/category, ingest worker, canonical IDs/aliases; do not create another indexer. |
| Hostile endpoint transport | EXISTS | `packages/probe/src/safe-fetch.ts`, pinning/redirect/size tests; preserve it. Metadata shape validation remains partial. |
| No-wallet discovery, four categories | EXISTS | `/register`, `/agents`, `/positions`, `packages/positions` and category engines. All four categories present in dated ready snapshot. |
| Published category conformance | EXISTS | `packages/conformance`, generated Standard, immutable case IDs, tests for all four categories; no new grading framework. Live retesting not invoked. |
| Portable/fresh Warrant | PARTIAL | Stored own-category results, dates and 72-hour display checks exist. Independent replay/service binding/freshness contract needs audit and deltas. |
| Exact-service quote/escrow purchase | PARTIAL | `packages/commerce/{quote,hire,calls,description}`, quote/intent/bind APIs and wallet client exist. A0 expiry, proof-mode and replay/task-binding tests remain. |
| Buyer-owned signing/exact approval | EXISTS | Browser hooks and pure call builders; cancellation, refund, dispute and partial setup recovery exist. No wallet signing tested in P00. |
| Job delivery, completion, paid/refund | EXISTS | `state.ts`, indexer, Job Room and Phase 2 job API. Historical Plinth PAID verified; owner paid wording requires correction. |
| Independent commercial success | PARTIAL | Real nonreference Plinth funding/delivery/payment exists. Actor independence, consent, result bytes and reproducibility are not yet proven. |
| Builder claim/declare/test/probe/publish | PARTIAL | Both existing rails and qualityVerdict reused. Unsafe GET writes and claim/publish binding must be repaired before trusting seller counts. |
| Seller operating product | PARTIAL | Builder checklist, owner projection, job pages, quote history and worker retries exist. Compact owner-authorized conversion/earnings/recovery view missing. |
| Receipts/four proof blocks/export | EXISTS | `packages/execution`, runs, receipt API, v1/v2 SHA-256. Do not invent a new receipt primitive. |
| Independent offline receipt verifier | ABSENT as a shipped product | Private audit recomputed one digest; that is not a shipped general verifier. Extend current receipt package and API. |
| Pre-outcome seals/Ledger/benchmarks | EXISTS | `packages/ledger`, stored manifests/arms, run linkage and published methodology. Current replay and paid-outcome portability partial. |
| Enforceable user action authority | PARTIAL | `packages/mandates` Altana and registry providers, charter capability/HMAC and testnet sandbox. Registry anchoring is server-enforced policy, not validator enforcement; Altana constructor rejects mainnet. |
| Machine catalog and unsigned plan | EXISTS, product contract PARTIAL | Existing marketplace filters/pagination and `/hire/intent` already return unsigned calls. Add documentation, idempotency/provenance tests; skip duplicate `/market/*` APIs. |
| Read-only MCP client/search product | ABSENT | MCP execution adapter is present; a public read-only MCP discovery server was not found. Conditional after HTTP contract. |
| A2A/MCP paid/read side-effect model | PARTIAL | Execution adapters and capability guards exist. `message/send`, `tools/call` and even builder probes can execute work; never treat them as safe solely from names. |
| x402 buyer/payable task support | UNSUPPORTED on current reviewed buyer rail | x402 transport/metadata discovery exists, not proof of funded x402 purchasing. Inspect challenges only; no new pay rail justified in P00. |
| Fair same-task Trials | ABSENT | Existing MCS fixtures/compare are reusable but not independent equal-task experiments. Need two compatible unrelated providers and safe invocation consent. |
| Evidence Router | PARTIAL foundations, ABSENT proven routing product | Category matching/ranking exist. No fair task-relative routing should be claimed before Trials prerequisites. |
| Paid-buyer vs registry feedback | EXISTS | `reputation.ts`, ratings, `agent-track.ts` and storefront split; preserve rather than create a global score. |
| Operator graph/outcome learning | PARTIAL | Owner/host grouping and team exclusions exist; person independence, long-term outcome and funding-cluster certainty do not. |
| SDK/OpenAPI/CLI developer product | PARTIAL | Scripts, public Phase 2 contracts and source packages exist. A stable procurement client/verifier and external example remain. |
| Blue/green, proxy, monitoring, backup | EXISTS | Current slot/release, 11 proxy cases, four monitor cases and dated backup logs verified. Cold latency/static-resource failures remain. |
| New escrow/token, multichain, global AI score | UNSUPPORTED / deliberately skipped | Contrary to current invariants or no evidenced user need. |

Source tree manifest and API method inventory are retained privately. Planning graphs, competitor details and screenshots were not added to the public repository.


## P04 candidate delta, 16 October 2026

The baseline inventory above remains dated. A bounded offline receipt content checker and frozen versions 1/2 SHA-256 vectors now EXIST in the execution package; public receipt GET adds version 1 evidence pointers without writes, remote calls or a new receipt table. Chain/issuer/authority/MCS replay and human independence are separate, not implied by MATCH. One historical anchor has a separately captured chain 97 log/block consistency proof. Future local run grades retain their exact case/block/version. A universal portable chain verifier remains PARTIAL, not a shipped generalized product.


## P05 candidate delta, 17 October 2026

Portable frozen-case MCS replay, explicit service/invocation commitments for future adapter tests and a deterministic source manifest now EXIST. Historical test-pass rendering no longer implies exact-service Warrant binding. New public conformance reads expose only commitments and source hashes; owners can choose to share their returned raw test bundle. Existing deterministic engines/tolerances and paid hire remain unchanged. An independent new operator's exact-service Warrant is NOT DEMONSTRATED; historical binding, issuer authentication and person/funding independence remain UNKNOWN.


## P06 candidate delta, 17 October 2026

Opt-in version2 receipt/job wrappers, direct legacy-response digest inspection, standalone bounded read-only RPC inspection, exact emitter/event/canonical-block checks, separate payment/refund transfers and local SDK deliverable verification now EXIST. Actual original anchor and already-paid Plinth case pass the CLI; corrupt bytes and missing metadata fail safely. Existing APIs, body versions/hashes and data remain. Owner/person/funding independence, missing original bytes, absent historical allowance/action charter, source-build attestation and unexported private quote signature replay remain separate UNKNOWN states, not universal verification.


## P07 candidate delta, 17 October 2026

EXISTS (candidate validated at source0de3085; see P07_CHECKPOINT.md): opt-in versioned existing catalog, runtime/generated structural schemas, GET-only typed client/example, deterministic unsigned exact-term plan, separate deferred funding, read courtesy/SQL/HTTP bounds. REUSED: existing dedup/filter/pagination, quote/intent and ABI. PARTIAL: one commercial service per existing entry; provider current control and task compatibility require fresh checks. UNSUPPORTED: x402 buyer, generic execute, automatic signing/spending; UNKNOWN: exact probe timestamp, extra services, independent human adoption, current source-bytecode verification. See P07_MACHINE_CONTRACT.md; no live deployment claim.


P08: offline same-context replay EXISTS locally; genuine neutral two-independent-provider comparison UNSUPPORTED by current evidence. Fixture-only primitive equality checks are not financial judgement or a quality ranking. Existing Ledger and MCS unchanged.
