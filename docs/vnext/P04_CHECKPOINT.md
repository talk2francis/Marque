# P04 checkpoint

Phase status: **GREEN for scoped candidate-source acceptance**. Receipt versions, integrity replay, evidence projections and exact-case grading pass the checks below. This is not a production-release, universal chain-verification or independent-human acceptance claim. P04 is the final authorized phase in this batch; STOP after local commits.

## Baseline, candidate and reuse

Baseline `3c4f298302615fe3acd2ec700aff5298a484a6d9`, following P03 source `f4d5d568e939a19b2666598c6ac58fc5c58110c3`. Branch `repair/vnext-v3-p04-20261016`, isolated worktree `/root/marque-vnext-p01`. Production source/release remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Tested source SHA: SOURCE_SHA_BINDING_PENDING; closing documentation binds it in a documentation-only follow-up. No push.

Reused immutable receipt versions 1/2, four-proof fields and their sorted-JSON SHA-256 hashes; MCS cases/results and deterministic rules; run/run_event/run_rejection; receipt GET and phase2 job timeline. Proposed new receipt envelope/table and replacement execution/proof frameworks are SKIPPED-existing. The [receipt contract](P04_RECEIPT_CONTRACT.md) maps actual sources, canonical bytes, source kinds, trust limits and rollout.

## Minimal repairs and compatibility

- Correct SHA-256 comments for receipts, sealed calls and MCS ground truth. Contract NatSpec now identifies caller-supplied digests; executable contract statements and ABI are unchanged. `canonical`, `canonicalise`, `receiptHash` and `sealedCallHash` bodies compare equal to baseline. No old numeric/hash field changes.
- Add a JSON-safe offline checker with frozen receipt versions 1/2 and sealed-call vectors and a versioned digest descriptor. It covers original unknown keys and fails safely for malformed/unknown data, tampering, non-JSON values, excessive depth/node count and byte budgets. BigInt token amounts in new data remain strings. No JCS, Keccak or domain prefix silently replaces historical bytes.
- Append `evidence.version=1` on the existing receipt GET, leaving all six legacy fields unchanged. It separates content MATCH from receipt claims, raw-byte availability, unknown independence and unchecked chain/anchor/quality/freshness. No extra database query/write, RPC or URL fetch. HTTP404 unchanged; invalid history remains readable with a failed check.
- Bind future local run/preflight grades to the one case actually graded and stamp MCS version/revision. A second latest-case lookup is removed; a different-block task becomes ungraded instead of receiving an unrelated verdict. Existing failures, receipts, conformance and ledger observations are preserved. Phase2 commercial settlement and MCS arithmetic are unchanged.

## Commands and actual outputs

```text
pnpm exec vitest run --maxWorkers=1 --minWorkers=1
  62 files passed, 4 gated skipped; 546 tests passed, 37 skipped; 228.46s wrapper / 226.18s Vitest
Final receipt + pipeline + receipt GET + rejection selection
  4 files passed; 48 tests passed; 54.22s wrapper / 42.38s Vitest
Baseline pipeline replay with the same evidence assertions
  2 expected failures, 10 passed: second case load and different-block grading
pnpm -r --workspace-concurrency=1 typecheck
  exit0; 866.69s
pnpm lint
  exit0; 64.72s
pnpm lint:copy
  exit0; 842 em/en dashes <= baseline859; no baseline change
git diff --check
  exit0
```

The full suite preceded the narrow pre-serialization byte-budget hardening and five additional rejection cases. Final 48 covers the resulting source; no second full-suite run is claimed. The 37 skips are explicitly environment-gated integration/RPC checks, not passes. No new live database fixture or external task was needed. Original test import/undefined-version expectation failures, optional baseline launch/config failures, superseded targeted output and sandbox IPC refusal remain private; they are not counted as final proof. The superseded test unit was stopped before the corrected final run finished. No assertion or tolerance was relaxed.

Validation ran at CPUQuota 100%/MemoryMax 3 GiB/SwapMax 1 GiB/Nice 10, with auxiliary tests at 25%/1 GiB/Nice 15. No UI/client source changed, so P04 browser screenshots and standalone build are SKIPPED; P03 screenshots/build remain prior evidence, not P04 clickthrough or release proof. Next route Request/Response integration and full workspace types cover the touched server surface. A future production release still requires its own standalone build and smoke validation.

## Real observations and independent checks

At **21:22:30UTC**, actual public GET `/api/v1/receipts/944bea48-7c7e-4afc-aa93-fbe126772362` completed HTTP 200, 1821 bytes, 384 ms. Its full receipt body and hash equal the earlier P00 sample. Version 2 SHA-256 `0x5c47f22933db4c934f834a88ce986fb5a6d1fbbca8a4ca83bb6d9a6db0206792` reproduces on the final checker. `commercial.settled=false` and `quality.pass=false` stay false. A private offline projection sample uses those actual captured bytes; it is not a deployed candidate HTTP response. General production p95/current-population metrics remain UNKNOWN.

At **21:27:08UTC**, public testnet RPC independently returned the existing successful anchor transaction `0x9d7f7069f6d2fd21aa5b7239009a113b01c10f2d021959d2eba2ee2a6d4e829b`, chain 97, registry `0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7`, block 135788370. Its Anchored leaf equals the receipt hash; block hash `0x11cd0ee1b5b17f8f74b2f357d966e3a7b9ef45d8368663baa68c4c26c74d181d` and timestamp 1791551739 agree with the fetched block. PublicNode returned no receipt first; the public BNB dataseed returned the consistent proof. That does not certify configured archive health or deployed-source compilation linkage. The anchorer is the documented first-party recovery address, not an independent buyer.

Seven private offline consistency negatives reject altered chain, status, transaction, block, contract, block hash or absent leaf against that captured proof. Product GET does not execute this reconciliation and explicitly remains NOT_CHECKED for all anchor references, including unrelated ones. This proof resolves one old anchor uncertainty without backfilling any row.

Tests also show one-byte mutation and array changes fail, key reorder replays, composed/decomposed Unicode differs, unknown/v0 schemas fail safely, huge/repeated strings are bounded, original string money survives, and unrelated anchor references never inherit execution chain 56. Pre-acceptance missing/unauthorized/identity-mismatched/revoked/expired charters insert only a synthetic rejection, with no run, receipt, quote or agent execution. No authenticated live wallet or human independence is inferred from fixtures or distinct addresses.

## Environment, operations and remaining limits

Closing continuity at **2026-10-16T21:38:45.666445+00:00**: shared-service and PM2 PIDs unchanged, surviving tmux present, Linger=yes, trusted Caddy mirror unchanged, production tracked source clean and 26 pre-existing untracked media files preserved. Complete transport/body samples: Marque 200/0.099473s/66bytes/ok=true; Kerb API 200/3.109785s/305bytes/status=ok; Kerb web 200/0.514726s/226722bytes/complete HTML. These are health samples, not browser or uptime certification. No candidate web server/port was started in P04. All six own validation units are inactive and candidate ports3291/3292/3293 are clear; the one superseded targeted unit was stopped specifically.

No mainnet state changes initiated; no testnet changes, paid/provider tasks, real wallets/signing sessions, secret/key access, production deployment, Git push or external message. Existing workers/keeper continued autonomously. P04 did not restart product/shared services, run a migration, delete data or rewrite history. Existing 20 migration SQL hashes are inventoried; no new/applied migration. Contract and database source changes outside execution are comments only.

Generic chain/issuer/finality replay, old missing anchor-network/contract metadata, original transport byte digests, exact historical source-build provenance and actual person/funding independence remain UNKNOWN/unchecked unless specifically established above. Hash matching is not quality, payment, authority or identity proof. No Warrant, rating or organic demand is backfilled. Current API fields remain compatible with additive evidence 1 and optional future quality-version fields; strict clients should permit those documented additions.

Blast radius: receipt GET metadata plus legacy local run/preflight quality comparability. Different-block tasks may correctly lose their previous grade. Four categories, buyer-owned commerce, seller/owner flows, theme art/fonts, proxy protections, monitoring and SDK pins are untouched. Rollback is a source revert to P03; no database rollback. See vNext deviations and architecture update.

Owner approval needed: none for the completed P03/P04 work. Production deployment, any new mainnet/paid operation and P05 or later work require their separate approvals. **STOP after P04.**

## Changed paths

```text
apps/web/app/api/v1/receipts/[id]/route.test.ts
apps/web/app/api/v1/receipts/[id]/route.ts
apps/web/lib/receipt-evidence.ts
apps/web/lib/runs-rejection.test.ts
contracts/src/MarqueRegistry.sol
docs/ARCHITECTURE.md
docs/DEVIATIONS.md
docs/phase2/PROJECT_STATE.md
docs/vnext/CAPABILITY_INVENTORY.md
docs/vnext/CRITICAL_SOURCE_RECHECK.md
docs/vnext/DEVIATIONS.md
docs/vnext/FACT_CONFLICTS.md
docs/vnext/IMPLEMENTATION_GRAPH.md
docs/vnext/P04_CHECKPOINT.md
docs/vnext/P04_RECEIPT_CONTRACT.md
packages/db/src/schema.ts
packages/execution/src/index.ts
packages/execution/src/pipeline.test.ts
packages/execution/src/pipeline.ts
packages/execution/src/receipt-integrity.ts
packages/execution/src/receipt-vectors.fixture.json
packages/execution/src/receipt.test.ts
packages/execution/src/receipt.ts
```

Raw bodies/RPC proof/logs/private fixtures and validation manifests remain under `/root/.marque/private/vnext-p04-20261016`, outside Git. Uploaded build-pack/research/screenshots/credentials are not committed. The closing manifest binds the exact source and documentation commits.
