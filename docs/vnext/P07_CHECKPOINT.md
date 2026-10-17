# P07 checkpoint: existing catalog and unsigned procurement plan

17 October 2026. **AMBER: scoped candidate checks complete; independent external-human adoption and production capacity are not established.** This closes the owner-approved P05-P07 batch. STOP after P07.

## Baseline and candidate

Baseline P06 checkpoint `9366e434185ebfadda051dbdc262e604d9dd7393`; final tested source `0de30852a3d4717c4beb4f688ab229fa812f0550`, branch `repair/vnext-v3-p07-20261017`. Earlier runtime source ea68f0f, test correction b352f33, output-isolation fix6231832, and final test-fixture correction0de3085. Runtime code is unchanged after6231832. This evidence-only checkpoint follows the tested source. P05/P06 checkpoint docs and source are included. Production remains97ef4c73ea3717d1a059b649a35e8124d93bdb7f.

## Existing functionality reused and changed paths

Reuse existing marketplace deduplication/filter/offset/limit/singleflight/SWR, selected service, quote/intent/current identity checks, SDK asset/config/ABI, description commitments and createJobCall. No new marketplace endpoint, generic execute service, buyer signer or settlement protocol. Default marketplace success JSON stays unchanged; opt-in format=machine is version1. Public ownership/probe/test/price scopes explicitly retain UNKNOWN and unsupported rails. Pure buildHirePlan compares independent expected selection and creates only UNSIGNED exact calldata, separate quote/job expiries and deferred setup/funding without job IDs or calldata. Client signs/spends nothing.

Changes: commerce `{catalog-contract,catalog-client,hire-plan,read-budget}` plus tests/package exports; existing supply read wrapper and scope test; web existing marketplace/receipt/conformance handlers, readReceipt/marketplace/agent-track readers and regression tests; new pure machine projection; public versioned JSON Schemas/OpenAPI; generator and standalone TS example; architecture, capability/conflict/graph/deviation/state docs. UI/CSS/art, campaign configuration, SDK pins/lock, ops/proxy/monitoring and all database schema/migrations unchanged. See [contract](P07_MACHINE_CONTRACT.md).

## Tests and exact command results

Resource-capped serial validation on final source; complete logs are private under `/root/.marque/private/vnext-p07-20261017`.

| Command | Exit/result | Wall seconds |
|---|---|---:|
| `node scripts/generate-mcs-code-anchor.mjs --check` | 0, PASS | 0.48 |
| `node --import tsx scripts/generate-machine-contracts.mts --check` | 0, PASS | 5.39 |
| `pnpm exec tsc --noEmit --moduleResolution Bundler --module ESNext --target ES2023 --skipLibCheck --strict scripts/generate-machine-contracts.mts examples/machine-marketplace.mts` | 0, PASS | 50.01 |
| `pnpm exec vitest run --maxWorkers=1 --minWorkers=1` | 0, 683 passed / 37 gated skips | 255.30 |
| `pnpm -r --workspace-concurrency=1 typecheck` | 0, PASS | 616.11 |
| `MARQUE_BUILD_DIR=.next-p07 pnpm --filter @marque/web build (ionice idle)` | 0, PASS | 891.49 |
| `python3 private/restore-generated.py` | 0, PASS | 0.39 |
| `pnpm lint` | 0, PASS | 71.94 |

Final Vitest output: `Test Files 73 passed | 4 skipped (77)`; `Tests 683 passed | 37 skipped (720)`; Vitest248.68s, runner255.30s. Build generates28static pages and a standalone artifact. Four warning messages match P06 (optional MetaMask async-storage twice, pino-pretty, viem/ox dynamic import); import traces differ. No dependency/SDK change. Next-generated tsconfig/next-env references are restored to their exact prebuild bytes. `pnpm lint:copy` exits0:842 historical em/en dashes across45files; old baseline859 unchanged.


Initial target run exposed a test-hook bug: expression-bodied beforeEach returned the reset mock, which Vitest then called as teardown after the mocked read failure. Corrected to a void block; receipt503/privacy assertions pass without changing the rejection expectation. Full R1 had681passed/37gatedskipped and one obsolete assertion expecting no transaction on global discovery. Updated to require READ ONLY/global8s/lock500ms while retaining the original unscoped-query checks. R2 was intentionally stopped after an explicit historical-clock inspection proved returned plan.token aliased the pinned asset. Final source copies token values and adds an actual mutation regression; targeted37passed, before/after alias=true/false. The first serial full type run then caught a partial synthetic MarketRow test assertion, after all other packages passed. Completed every required fixture field with a real return type, without unknown/any casting. Its12tests and focused web typecheck pass; runtime code is unchanged by that correction. The final full suite was rerun successfully on the complete fixture. All failed/interrupted logs retained. No weakened threshold or erased negative evidence.

Separate existing real-PostgreSQL fixture regressions: **34passed**, three files,78.18s: listing authorization/transfer/idempotency, seller private/public projection and hire intent access/retry/bound/expired rejection. Ordinary full suite intentionally skips those34 plus3 network-pool tests; fixture checks separately execute the34 safely. Structural JSON Schema Draft202012+FormatChecker validation passes actual quote/intent/expected input and UNSIGNED output. Schema/input structure alone is not authorization or cryptographic truth. MCS source hash remains0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433, no tolerance or receipt digest changes.

## Real observations and negative case

At09:00:36UTC, a genuine known-first-party Keel negotiation was verified by the existing quote/identity logic; exact canonical identity56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556, service31798, provider0xdf1074a272c53a1a10b96fa0201eb58bbbaafe00, chain56,0.05U (raw50000000000000000/18decimals), provider_signed. Quote48 and an unbound intent were written only in the existing isolated fixture DB. End-to-end quote/intent/retry/plan took1485ms; retry returned identical intent and create call. Buyer0x000000000000000000000000000000000000dEaD is a synthetic unsigned address, not an owned wallet or independent user. The provider's existing deterministic negotiate path clamps list price and signs offchain; no work/notify_funded/buyer signature or chain write was called. Synthetic fixture routing rows are explicitly labelled, never production observations.

Actual SELECT-only snapshot cancellation: SELECT pg_sleep(6) via exact read helper canceled with PostgreSQL57014 in4011ms; subsequent read succeeded and reported transaction_read_only=on, statement_timeout=4s. This proves SQL-side cancellation in that environment, not production latency or a whole-request cancellation. Global8s/exact4s/lock500ms are per statement; HTTP12s catalog/8s evidence deadlines do not cancel SQL or bound pool wait. Global worker discovery also uses this helper if deployed; production full-data cold capacity must be measured before release, without an unbounded production load experiment.

Built loopback candidate, **10:17:11UTC**, SELECT-only snapshot (not production population):

| Read | HTTP / total seconds / bytes |
|---|---|
| legacy | 200 4.257836 4417 |
| machine | 200 0.032388 5758 |
| machine-keel | 200 0.019354 2473 |
| machine-page2 | 200 0.029838 5769 |
| wrong-chain | 400 0.039773 105 |
| duplicate-filter | 400 0.076810 105 |
| bad-receipt-id | 400 0.021924 30 |
| conformance | 200 0.067997 951 |
| openapi | 200 0.023319 13164 |
| input-schema | 200 0.012699 9930 |

Legacy successful keys, first-page identities and source time match the versioned projection. Machine first page3of7/nextOffset3, second page3of7/nextOffset6, Keel query1of1. All three machine bodies pass JSON Schema2020-12+date formats. These seven filtered/deduplicated snapshot entries are not seven independent people or a current production total. Invalid machine network/duplicate query and malformed receipt ID fail400. Normal conformance read retains its original951-byte commitment-only body; no raw private task or endpoint is added.


Final fresh check at **2026-10-17T10:17:38.843Z**, same first-party service31798, quote**62**: actual quote/intent/retry/plan interval**4900ms**, parent helper27.10s including startup/setup. Existing intent retry is byte-identical. At **2026-10-17T10:17:47.644Z**, a separate Node client GETs the actual machine catalog and matches exact agent/service before constructing a valid **UNSIGNED** plan; wrong-chain input returns `wrong_chain`, expired input returns `quote_expired_or_too_close`. The catalog honestly still says **EXPIRED**, task support **UNKNOWN_REQUEST_EXACT_TASK_QUOTE**: the live quote is newly obtained, not a renewed snapshot price. Public example runs exit0 (6.01s), exact external client exit0 (9.11s); fresh input/output independently pass structural JSON Schemas. Client quote signature replay remains explicitly NOT_PERFORMED_SERVER_REPORTED_MODE; simulation NOT_RUN. Both offchain quote observations and all original input/results are preserved privately. No notify/work/buyer signing/spending or production intent DB write.


## Chain/environment/actor independence and limits

Historical paid Plinth56916 and receipt anchor evidence are reused from P06; no expired historical quote is renewed and no new transaction creates numbers. Snapshot counts are dated fixture/snapshot observations, not current production counts. Identity registry chain can differ from action chain and is explicit. The pure client does not recover the original provider signature, replay an original endpoint commitment, or prove current ownership/token support/unspent intent; these remain NOT_REPLAYED/server-reported mode and a required caller recheck. Simulation remains NOT_RUN. ERC-8183 is only a candidate requiring a fresh exact-task quote; x402 buyer is unsupported and discovery A2A/MCP is not proof of payment. Additional service inventory/probe observation time/task compatibility/human funding independence remain UNKNOWN. Technical external Node process is not independent-human adoption, outside-provider consent, organic demand or a paid hire.

## Browser and operational evidence

Actual Chromium:18read-only page smoke cases (home, tested marketplace, Keel profile x390/768/1440 xday/night) have HTTP200, no page/console/local HTTP errors or horizontal overflow. They are page navigation, not wallet/funding clickthrough. Initial screenshots used a750ms wait; visual inspection caught the marketplace's temporary0count from default SSR before its tested-tab fetch completed. **Those six initial market screenshots are not proof of populated listing readiness.** All originals remain.

A stronger6-case rerun waits for the real tested catalog HTTP200 response and a visible exact Keel card, then captures populated UI. All6pass: actual snapshot total7/API rows7/visibleKeel1, no errors/writes/overflow. No product-source change was needed. Readiness rerun41.22s; original page smoke131.92s. Independently inspected home day390, initial market night390, reference day390, loaded market day390 and loaded market night1440. Loaded views retain reference labels, Test passed, expired/no-current-price explanation and existing four-category controls. Preview header status UNKNOWN is not production health.

Screenshots inspected: [loaded mobile day](/root/.marque/private/vnext-p07-20261017/market-loaded/market-loaded-day-390.png), [loaded desktop night](/root/.marque/private/vnext-p07-20261017/market-loaded/market-loaded-night-1440.png), [reference mobile day](/root/.marque/private/vnext-p07-20261017/browser/reference-day-390.png). Full raw reports/screenshots stay outside Git. No full wallet/modal/paid-flow claim. UI component/style/art/font sources are byte-identical to P06/P05; stock visual audit not repeated because UI source is unchanged, and inherited P05 tap-size advisories are not claimed fixed.

Existing incident transport script:11/11expected statuses, exit0 in6.29s, including malformed/spoofed router headers and control-byte400. Monitoring/proxy source remains unchanged. Known database URI/password/private-path and both quote capabilities are absent from all289built client JS files; this is a scoped known-value scan, not a universal secret audit.


Closing **2026-10-17T10:23:15.618762+00:00**: shared service and PM2 product PIDs unchanged, original tmux present, root `Linger=yes`, trusted sanitized Caddy mirror matches. Production SHA `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`, tracked source unchanged and26pre-existing untracked media files preserved. Production/candidate workspace package links independently resolve to their own checkouts. Both owned previews stopped;3291/3292clear.

Complete closing reads (curl exit0; fields HTTP/connect/TTFB/total/bytes):

- marque at2026-10-17T10:23:15.981222+00:00: `200 0.003061 0.128298 0.128746 66`.
- kerb-api at2026-10-17T10:23:16.491073+00:00: `200 0.001933 0.471526 0.471800 306`.
- kerb-web at2026-10-17T10:23:16.636911+00:00: `200 0.019749 0.106789 0.111341 224872`.

Marque body ok=true, Kerb API status=ok, Kerb web ends with complete HTML. These are dated single samples, not uptime/p95. Mid-run09:38:41UTC checks and first post-proof10:20:15UTC checks also preserved separately. Only owned candidate units/processes were started/stopped. One optional host status query timed out in automatic approval; direct read-only cgroup files completed the resource check, so no permission blocker remains. No OOM events observed.


## API compatibility, migration, blast radius and rollback

Valid default marketplace JSON and existing receipt/conformance success payloads preserved; new machine contract is opt-in/versioned. Additive freshness/CORS/Retry-After headers, friendly503, courtesy120/minute/connection read limits and malformed receipt UUID400 replace prior driver error/500. Courtesy limits are process-local, not authentication or distributed protection. No GET writes. Existing quote/intent writers retain capability/expiry/idempotency behavior; no new writer or auto-call. JSON Schemas are structural; runtime cross-field/ABI/commitment/freshness checks remain mandatory.

Blast radius: candidate-only catalog/evidence read paths, global/scoped commercial discovery and pure client. No SQL migration/schema reset, dependency upgrade, campaign rules, new recurring cost, new authority or operational restart. Rollback is candidate source revert to P06; no original rows/observations need deletion or transformation. Existing Caddy trusted-header mirror and monitoring transport remain intact.

**Mainnet state changes NONE; testnet writes NONE; production deployment NONE; git push NONE; paid job NONE; buyer wallet/key use NONE.** Only first-party offchain quote observations and synthetic fixture rows were added privately. Remaining AMBER deviations: one service per deduplicated entry, missing exact observation/signature/independence data, outside-human adoption unproven, production cold capacity unmeasured. No additional approval needed for completed batch work; a future production release or real paid/chain action needs its separate authorization. **STOP after P07.**
