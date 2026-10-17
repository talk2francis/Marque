# P06 checkpoint: portable receipt and job inspection

17 October 2026. **AMBER: candidate source checks pass; missing historical provenance stays unknown.** P07 continuation is already owner approved. No release or paid action authorized.

## Baseline and candidate

- Baseline P05 checkpoint: `5a5c9c9c4d59102f53b8c325d702844e7ca2b6a0`.
- Tested source: `6dde8648ecb11f119adcc95458ab2928088a39e3` on `repair/vnext-v3-p06-20261017`. This evidence-only checkpoint follows it.
- Production remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`, tracked source clean; 26 existing untracked media files untouched.

## Reused functionality and changes

Reuse receipt V1/V2 original SHA-256, P04 vectors, existing receipt/job GETs, public timeline, pinned SDK 0.6.0 ABI/config, shared safeFetch, and job state projector. Add optional V2 containers and a standalone offline/read-only RPC inspector, without publishing private tasks or fetching artifact URLs. Separate content, confirmed anchor, actual delivery, completion, exact token payment/refund, historical/current policy and unavailable authority/independence. The small existing state transition repair accepts router settlement after a terminal kernel event; it removes an anomaly and preserves the settlement reference, rather than inventing a payment.

Changed runtime/test paths: `packages/execution/src/{chain-inspection,portable-receipt,inspection.test,index}.ts`; `packages/commerce/src/{portable-job,inspection,inspection.test,quest,state,state.test}.ts`; commerce package exports; existing receipts and phase2/job handlers and tests; `scripts/verify-receipt.mts`. Architecture, capability inventory, fact conflicts, deviations and the [inspection contract](P06_INSPECTION_CONTRACT.md) describe all domains and limits. No schema, migration, dependency/lockfile, SDK bump, CSS, design, signing or deployment change.

## Exact checks

Resource-capped serial commands on frozen source, with private logs under `/root/.marque/private/vnext-p06-20261017`:

| Command | Result | Duration |
|---|---|---:|
| `node scripts/generate-mcs-code-anchor.mjs --check` | pass; P05 code hash unchanged | 0.40 s |
| `pnpm exec vitest run --maxWorkers=1 --minWorkers=1` | **608 passed, 37 environment-gated skips**; 69 passed/4 skipped files | 483.98 s |
| `pnpm -r --workspace-concurrency=1 typecheck` | pass | 2035.02 s |
| `MARQUE_BUILD_DIR=.next-p06 pnpm --filter @marque/web build` | pass, isolated standalone | 771.48 s |
| restore only Next-generated config references | pass; original bytes restored | 0.39 s |
| `pnpm lint` | pass | 51.99 s |
| `pnpm lint:copy` | pass, 842 dashes; old baseline 859 | host rerun |

Initial targeted type runner lacked pnpm in its PATH; corrected runner passed. Initial targeted fixture expiry inconsistency was corrected and final full suite passed. Copy lint's Git child was sandbox-blocked; identical host read check passed. All attempts retained. One final EOF-only blank-line removal preceded the source commit and frozen manifest update; no logic changed after the passing full suite. All frozen source hashes still match after final checks.

Final CLI runs: legacy HTTP receipt content exit 0 (32.78 s); actual historical chain-97 anchor exit 0 (13.30 s, 5 read RPCs); preserved Plinth V2 bundle plus local SDK manifest/current mainnet reads exit 0 (18.30 s, 31 read RPCs); mutated bundle and missing required metadata each correctly exit 1 (14.10/23.20 s). Exit 0 covers only requested dimensions, never every claim.

## Real observed evidence

At **05:06:11 UTC**, chain 56 head **128111421**, existing Plinth job **56916** is independently read as **PAID** (getJob status 3). Ten listed events match confirmed receipts; PaymentReleased and an exact ERC-20 Transfer establish the .01 U payment (raw `10000000000000000`, 18 decimals). Submitted SDK manifest semantic Keccak matches `0x8108703468cd1b8e17fa932e1beae867a518db0722e0f3c269524e18f2a9bf46`; raw bytes SHA-256 is separate. This is the historical outside-provider case, not a new hire, independent human claim or permission to spend.

Current policy link is zero: current timing/authority is unavailable. Confirmed historical policy registration remains verifiable. Actual production READ ONLY selection inspection retains exact service **43279**, quote **56305**, provider, asset/raw amount and original quote digest `0x4441d5d5d59cb812c7decf29164f6dfee494662fc42da291dc4917f4a5c0ed4c`. Signed mode is the stored claim; original cryptographic envelope replay and historical registry-owner proof are not claimed. Endpoint digest was not selected in this private proof and remains null.

Old receipt `944bea48-7c7e-4afc-aa93-fbe126772362` public GET returned 200 (0.198613 s, 1821 bytes), retaining original receipt SHA-256 `0x5c47f22933db4c934f834a88ce986fb5a6d1fbbca8a4ca83bb6d9a6db0206792`. Existing chain-97 Anchored log is confirmed at registry `0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7`, tx `0x9d7f7069f6d2fd21aa5b7239009a113b01c10f2d021959d2eba2ee2a6d4e829b`. An anchor proves commitment publication; the preserved receipt still says settled=false/quality=false.

At **08:53:54 UTC**, built loopback candidate against SELECT-only snapshot: default Plinth job 200/0.928907 s/5027 bytes; optional bundle 200/0.101307 s/8769 bytes; existing conformance read 200/0.028336 s/951 bytes. Default job JSON equals bundle source after removing only opt-in selectionCommitments. Original intent retains service 43279, while snapshot lacks quote 56305: explicit PARTIAL, hash null, mode unknown. This is snapshot incompleteness, not production data loss. Both historical and absent receipt candidate requests returned 404 because this isolated snapshot lacks that receipt. No successful candidate receipt HTTP claim: real public capture plus handler regression tests cover the distinct paths.

## Negative cases and independence

Tests cover wrong chain/contract/emitter/hash/provider/token/amount/decimals/task, duplicate logs, reorg, pending/missing old receipts, expired/changed metadata, missing selection records, unsupported artifact formats, altered local artifacts, signature/domain limits and no raw private export. No wallet, signed action, simulated purchase, actor funding, permission escalation or service invocation. RPC consistency is not independent consensus. Outside provider identity differs from team configuration; human/funding independence, issuer authenticity, official campaign eligibility and original quote signature replay remain UNKNOWN.

## Compatibility, operations and rollback

Default success fields and original receipt hash domains remain. New containers are opt-in; no migrations or wholesale schema reset. Heavy inspection lives in its own package subpath. Existing Caddy trusted router-state mirror and monitoring transport source are byte-identical to P05; no operational repair needed. UI files are unchanged from P05's 72-case browser pass: **P06 browser/screenshots SKIPPED (no UI edit), no new clickthrough claim**.

At **08:53:57 UTC**, shared services, PM2 product PIDs and original tmux are unchanged, root linger=yes, Caddy mirror matches. Complete health reads: Marque 200/0.135615 s/66 bytes; Kerb API 200/1.493907 s/306 bytes; Kerb web 200/0.281370 s/225054 bytes with complete HTML. Single observations, not uptime/p95. Only this phase's loopback preview is stopped after evidence capture; no production service restart.

**Mainnet/testnet state changes NONE; production deployment NONE; push NONE; paid external job NONE; migrations NONE.** Rollback: revert candidate commits; existing rows/observations unchanged. AMBER deviations are missing historical proof, snapshot quote/receipt absence and no separate outside-user acceptance of the new verifier. Source acceptance is complete. P07 is authorized; further release/payment gates still require separate explicit approval. Stop after P07.
