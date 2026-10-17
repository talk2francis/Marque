# P09 checkpoint: deterministic suitability diagnostics

17 October 2026. **AMBER: explicit insufficient-comparable-supply fallback complete; genuine qualified-provider recommendation remains unproven.** Owner approved P08 then P09; this closes both. STOP after P09, no automatic P10 or release.

## Baseline, candidate and reuse

Baseline P08 checkpoint `d8482880d3d2c9dca5fb15bf2b4cbb8b4717306d`; final tested source `e5bd3f49c9ced72222ca5d3a375d2131cfd27bfe`, branch repair/vnext-v3-p09-20261017 in the existing isolated /root/marque-vnext-p07 workspace. Initial source91985e8, negative-evidence repaircc5f445, final asset/ID repaire5bd3f4. This checkpoint follows with documentation only. Production remains97ef4c73ea3717d1a059b649a35e8124d93bdb7f.

Reuses existing machine catalog v1 schema/category enum, exact selected service/chain/provider tuple, SDK task sanitization, stored quote provenance and existing manual category browsing. Pure module ./routing has no DB/RPC/fetch/signing/implicit clock; no new marketplace, trust score, auto-hire, escrow or task executor. SDK/lock, quote/hire writers, MCS/receipt digests, UI/theme/art/fonts, worker and ops are unchanged. CLI local-file intake is shared with P08 and retains identical behavior. See [contract](P09_ROUTING_CONTRACT.md).

Changed paths: packages/commerce/src/routing-diagnostics.ts and25tests, package.json ./routing export; scripts/explain-candidates.mts, scripts/lib/local-json.mts and P08 CLI reader extraction; docs/ARCHITECTURE.md, docs/DEVIATIONS.md, phase2/PROJECT_STATE and vnext capability/conflict/graph/deviation/contract/checkpoint docs. Existing HTTP handlers, database/schema/migrations and production configurations unchanged.

## Behavior and actual observations

Strict version1 structured input: task/category, action chain56/97, exact token-address/decimals/raw budget, explicit UTC asOf and ordered distinct objectives. The parsed request, task-text Keccak version (not a receipt/quote/description digest), selected tuple and objective trace remain inspectable. Budget arithmetic uses BigInt and only matching chain/address/decimals. Incompatible quoted token/chain stays visible. Expired/invalid quotes, stale/missing/future source, unsafe service IDs, wrong category/action chain and duplicate selection cannot qualify. Original conformance/probe/commerce observations and failures are retained; identity-level test history is not exact-service quality. First-party labels stay configured/indexed, not authenticated independence.

Current catalog has no authenticated exact-task support, endpoint commitment, service-quality binding, current ownership, confirmed settlement or charter evidence. Its adapter therefore returns **insufficient_comparable_supply**, recommended=null, eligibleSelections=[], autoHire=false. This is a real diagnostic result, not a positive provider recommendation. Price can order compatible observations for inspection; unknown evidence/settlement/authority objectives tie, followed by disclosed ASCII selection key and deterministic parsed-record serialization. No house preference or hidden global score. Manual browse is existing /register?category=...; its source parser supports that parameter. No task text is leaked into the URL.

Actual CLI execution `2026-10-17T13:53:48.561260+00:00`, explicit replay asOf2026-10-17T13:48:15.057Z against the retained P07 catalog exported10:17:11.351Z/source10:17:11.236Z:3supplied entries, snapshot total7, incomplete=true, recomputed age12663821ms, sourceStale=true. These are dated SELECT-only snapshot entries, not current production population or independent operators. Synthetic buyer intent is plainly labelled. All three inspection prices remain null. One retained entry also returns insufficient supply, not a winner. Repeated same input yields byte-identical report SHA-256 `0aa3a13bacabf85ce57dc3420bf9bd79d28fe0740ae7f9f81919c30b25b34138`. No new HTTP catalog, quote, provider task or chain request was used for this replay.

Redacted actual output sample: schema=marque.routing-diagnostics.v1; provenance=DERIVED_FROM_SUPPLIED_CATALOG_NOT_AUTHENTICATED; state=insufficient_comparable_supply; recommended=null; autoHire=false; suppliedEntries=3; catalogTotal=7; sourceStale=true; incomplete=true; manualBrowse=/register?category=health_factor. Genuine adequate independent-provider pair, live comparative price/performance, consent, settlement ranking, buyer adoption and fresh authority: **UNKNOWN**, not fabricated positive counts. Historical paid Plinth remains P06 evidence, not a current task-fit or consent claim.

## Tests and exact results

| Command | Exit | Wall seconds |
|---|---:|---:|
| `node scripts/generate-mcs-code-anchor.mjs --check` | 0 | 0.42 |
| `pnpm exec vitest run --maxWorkers=1 --minWorkers=1` | 0 | 333.11 |
| `pnpm -r --workspace-concurrency=1 typecheck` | 0 | 957.28 |
| `pnpm exec tsc --noEmit --moduleResolution Bundler --module ESNext --target ES2023 --skipLibCheck --strict scripts/replay-trial.mts scripts/explain-candidates.mts` | 0 | 95.63 |
| `pnpm lint` | 0 | 145.3 |
| `pnpm lint:copy` | 0 | 9.71 |

Final full output: `Test Files 75 passed | 4 skipped (79)`; `Tests 723 passed | 37 skipped (760)`; Vitest326.10s, runner333.11s.25new diagnostics tests plus15P08 replay tests:40/40targeted pass in4.90s.37gated database/network tests are skipped here, not claimed executed; the unchanged34fixture cases retain their separate dated P07 evidence. Full workspace types and both CLI type checks pass. No production build or deployment was run.

Negative cases: amount above Number precision, wrong token/decimals/chain, expiry including cached expired state, unknown/stale/future source, zero/invalid/overlong quote, wrong category/action chain, mixed identity/action chains, duplicate selection, unsafe numeric ID, empty and one-entry/partial pages, unsupported intent/fields/budget/objective duplication, no implicit clock/fetch/input mutation, historical failed test/dead probe/seller timeout retention. Actual CLIs both reject URL-as-file, malformed JSON, over2MiB, invalid UTF8 and directory:10negative invocations, exit1/empty stdout/redacted errors. These ran before report-only enrichment; unchanged reader bytes independently match91985e8. Final P08 replay CLI output is byte-identical to its P08 frozen example. No network/paid/wallet calls in these tools.

Review corrections are retained: initial R1 stopped intentionally to include existing conformance/probe/seller failures instead of hiding them behind unknown task fit; R2 stopped to expose quoted token/chain and reject unsafe service IDs. Neither interrupted run is claimed a complete success. Both logs and reasons are preserved privately. Final full run is entirely on e5bd3f4; no assertion/tolerance/baseline was weakened.

MCS anchor check unchanged0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433; immutable receipt SHA-256 and quote envelope/negotiation hashes unchanged. Copy checker842historical dashes/45files, baseline859unchanged. Runtime/test/protocol input manifest14files matches final source. No package install or SDK/dependency upgrade.

## Operational evidence and browser scope

Resource-capped serial checks:3GiB memory/1GiB swap/nice15/idle I/O, initially100%CPU. Mid-validation at14:01:30UTC shared/product PIDs, tmux/linger/proxy/production source unchanged; complete Marque/Kerb responses200. Kerb API took7.778119s with status=ok and ongoing observations. This slow sample is preserved, not erased by a retry. Cause **UNKNOWN**; six visible CPUs and available memory were sampled, validation memory about209MB and no OOM event. As a precaution only our unit was reduced to50%CPU, verified cpu.max50000/100000. No product restart, query rewrite or configuration change. Full type-check wall time includes that reduced share. This is not a proof of zero performance impact or a production capacity/p95 claim.

Closing2026-10-17T14:19:45.406521+00:00: shared service and PM2 product PIDs unchanged, original tmux present, Linger=yes; production tracked source unchanged,26pre-existing media files retained, trusted sanitized Caddy mirror matches. Complete closing readings HTTP/connect/TTFB/total/bytes:

- marque at2026-10-17T14:19:45.919379+00:00: `200 0.009087 0.062098 0.062626 66`, curl exit0.
- kerb-api at2026-10-17T14:19:46.722437+00:00: `200 0.002393 0.786388 0.786661 306`, curl exit0.
- kerb-web at2026-10-17T14:19:46.869890+00:00: `200 0.019049 0.120902 0.129679 224989`, curl exit0.

Bodies validate Marque ok=true, Kerb API status=ok and complete Kerb HTML. Individual dated health reads are not uptime or p95. No owned web/browser preview was started; candidate ports3291/3292are clear at closing. Existing Caddy/router-header and monitoring sources unchanged, not a claim of a new transport test run. API/UI source unchanged, so browser/screenshots/new web build **SKIPPED**; no new clickthrough or wallet-flow proof. P07 browser proof remains dated P07 evidence, not re-labelled P09.

## Compatibility, rollback, deviations and approvals

New local versioned input/output/library export/CLI only. Existing public API and P08 replay success/negative behavior preserved. No HTTP writer, database migration/record rewrite/deletion, new authority, dependency/SDK change, recurring cost or production rollout. Rollback candidate source to P08d848288, including restoring its original inline CLI file reader; no data rollback required. Blast radius is unused pure commerce export and offline scripts.

Deviation: full evidence recommendation reduced to explicit insufficient-supply diagnostics because adequate exact-task evidence is absent. Price inspection is not qualified-provider ranking. To restore, establish two consented genuine adequate independent providers and current task/service/endpoint/quote/quality/settlement/authority evidence through existing portable contracts; never accept arbitrary booleans as authentication or auto-hire. P08 same-task comparison also remains UNPROVEN. Slow Kerb health causality and production cold capacity remain unmeasured operational limits; no speculative fix was applied to another product.

Mainnet state changes **NONE**; testnet writes **NONE**; paid/provider tasks **NONE**; buyer wallet/key/session **NONE**; production deployment **NONE**; git push **NONE**; production/fixture DB writes **NONE**. No external operator contacted. Chain context is supplied or dated prior evidence, not newly rechecked here; independence is not inferred from differing addresses. No approval needed for completed authorized code. Production release, paid or chain writes, new authority and operator consent remain their separate gates. **P09 AMBER; P08-P09 batch complete; STOP.**
