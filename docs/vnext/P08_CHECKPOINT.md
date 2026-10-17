# P08 checkpoint: offline replay, comparison unproven

17 October 2026. **AMBER**, allowed fixture fallback complete. Owner-approved P09 follows this local checkpoint; no new phase permission is needed. Live comparison is not proven.

Baseline P07 checkpoint `2cc37819ac0ef5a5df0edd206cf1e2b83fced1d9`; tested source `d7ce3354b0659316c57d14a6f42202cbdb3ddd1e` on branch repair/vnext-v3-p08-20261017, isolated existing workspace /root/marque-vnext-p07. This follow-up is documentation/evidence only. Production stays `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`.

## Reuse and changed paths

Reuses Ledger hashContent SHA-256 and existing frozen-task/block/rubric discipline. Added pure packages/ledger/src/trial-replay.ts plus15tests, separate package exports ./trials, bounded scripts/replay-trial.mts and explicitly synthetic test/fixtures/trial-replay.synthetic.v1.json. Architecture, state, capability/conflict/graph/deviation docs updated. Existing Ledger runner, DB/first-party observations, published results, MCS math/tolerances, receipt hashes, quote/hire/API/UI/worker/SDK/lock and ops unchanged. Full behavior and safe reproduction in [contract](P08_TRIAL_CONTRACT.md).

## Actual prerequisite inspection and observations

Fresh safeFetch GET only: Plinth exact descriptor at13:26:43.843UTC, HTTP200/2083bytes/600ms; Brain at13:26:44.447UTC, HTTP200/11878bytes/294ms. SHA-256 bytes match retained P02 descriptors. Plinth advertises negotiate/notify_funded and requires funding before delivery; Brain declares those plus health/grid/yield/rebalance/LP report skills. Descriptors are provider declarations, not proven read-only operation or same-task acceptance. Task invocations0, paid calls0. No message/send, tools/call, funded notification, quote request, signature or buyer key use. GET latency is not task latency.

Candidate matrix: Plinth363619/service43279 has historical signed/PAID evidence, exact new-task acceptance/consent/independent control UNKNOWN. Brain302257/service3512 has historical identity-matched unsigned offer and declared task skills; new-task acceptance/consent/control UNKNOWN. Vitals367904/service46208 historical PAID has configured team buyer, excluded as independent demand. These are dated prior evidence, not fresh quotes or equivalent task outputs. Three distinct prerequisite checks: historical records answer unequal tasks; fresh declarations do not establish common frozen input/rubric acceptance; retained operator/consent diligence has no authenticated new-trial records. Therefore no qualified pair is established, rather than a fabricated count of zero actual providers. No external operator contacted.

Reproduction CLI returns schema marque.trial-report.v1, contextHash0xfd46fa14f445e0d58248740c4545eca2a2045fbcd7b45f3d8b8c50c250510679, provenance SYNTHETIC_FIXTURE, sampleSize2, passingReplaySamples1, comparison UNPROVEN, winner=null. Synthetic arithmetic outputs5and6 are preserved in input; costs/timing null, no financial wisdom grade. Chain97/block1/repeating1s fork is made-up test context, not chain evidence. No actual external equal-task outcome, measured trial cost, comparative latency, ground-truth provider winner or independence is available: **UNKNOWN**.

## Tests and command outputs

| Command | Exit | Wall seconds |
|---|---:|---:|
| `node scripts/generate-mcs-code-anchor.mjs --check` | 0 | 0.39 |
| `pnpm exec vitest run --maxWorkers=1 --minWorkers=1` | 0 | 268.92 |
| `pnpm -r --workspace-concurrency=1 typecheck` | 0 | 692.37 |
| `pnpm exec tsc --noEmit --moduleResolution Bundler --module ESNext --target ES2023 --skipLibCheck --strict scripts/replay-trial.mts` | 0 | 21.83 |
| `pnpm lint` | 0 | 70.5 |
| `pnpm lint:copy` | 0 | 8.85 |

Full output: `Test Files 74 passed | 4 skipped (78)` and `Tests 698 passed | 37 skipped (735)`, Vitest264.67s, runner268.92s.37gated skips are inherited fixture/network tests, not claimed executed. Targeted trial replay15/15pass. Actual local CLI succeeds on the synthetic reproduction; URL-as-path, malformed JSON and input over2MiB each exit1 with empty stdout and redacted error. Negative tests retain timeout/error, incorrect/missing/type-coerced values, changed task/input/policy/rubric, wrong fork, retrospective rubric, duplicate repetition, inherited properties and invalid/oversized schema. Same input produces identical report; empty supply remains unproven.

MCS code-anchor check passes unchanged0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433. Copy checker842historical dashes/45files, baseline859unchanged. Tests/types/lint resource-capped serial unit,3GiB memory/1GiB swap/100%CPU/nice15, no unrelated restart. Sampled cgroup memory events report no OOM. No source/test failures or threshold reductions in this phase.

## Compatibility, browser and operations

New offline version1 contracts only; no existing HTTP/API change, SQL migration, record transformation/deletion, SDK/dependency bump or production configuration. No UI/browser/rendered artifact change; browser/screenshots and new production build **SKIPPED**, not claimed performed. P07 screenshots remain dated P07 evidence. Existing routes/art/fonts/themes/four categories, Caddy trusted-header mirror and monitor sources byte-identical. Rollback candidate commits; no row rollback required. Blast radius is unreferenced pure Ledger subpath and local CLI only.

Closing2026-10-17T13:42:41.440690+00:00: all shared service/product PIDs unchanged; original tmux present, Linger=yes, tracked production clean with26pre-existing untracked media; trusted mirror matches. Complete closing samples (HTTP/connect/TTFB/total/bytes):

- marque at2026-10-17T13:42:42.547390+00:00: `200 0.002817 0.198208 0.198866 66`, curl exit0.
- kerb-api at2026-10-17T13:42:45.950377+00:00: `200 0.002059 3.303667 3.383715 308`, curl exit0.
- kerb-web at2026-10-17T13:42:46.348287+00:00: `200 0.010091 0.226256 0.307065 225052`, curl exit0.

Health bodies validate Marque ok=true, Kerb API status=ok and complete Kerb HTML. Kerb API3.38s sample is retained, not hidden or called p95. These are individual dated reads, not uptime or a performance guarantee. No candidate server/browser was started. Full private raw descriptors, CLI reports, logs and manifests stay in /root/.marque/private/vnext-p08-20261017 outside Git.

## Boundaries and remaining work

Mainnet state changes **NONE**; testnet writes **NONE**; production deployment **NONE**; push **NONE**; payments/paid tasks **NONE**; DB writes **NONE**; wallet/key access **NONE**. Descriptors do not prove owner/chain/human independence. Caller timestamps and captured costs/consent are unauthenticated, never upgraded to fair comparison. No price/rank/winner from historical unequal tasks or synthetic fixtures.

Deviation: genuine two-provider neutral trial reduced to explicitly allowed offline replay; user cost is no demonstrated comparative quality/latency. Restore with two authenticated independent consenting operators, accepted same frozen task/policy/rubric and safe operation review; obtain separate approval before paid/chain action or production deployment. No further owner approval needed for already-authorized P09. P09 prerequisite risk is missing exact-task/settlement/authority evidence; return insufficient_comparable_supply, never recommend a fabricated winner. **P08 AMBER; checkpoint complete; proceed to P09.**
