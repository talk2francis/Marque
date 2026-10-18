# P13 checkpoint: local read client and beta payment inspection

18 October2026UTC. Baseline P12checkpoint78043b0e3d9dcc1d532de03d75cde1f86f8dc91f. Local branch repair/vnext-v3-p13-20261018 in /root/marque-vnext-p07; source SHA/frozen1128runtime files in private frozen-source.json. P13 preparation preserved detached at0c0ec1c in /root/marque-vnext-p13. Completed P12 incorporated through0601e67; documentation append conflicts retained both phase records, no runtime conflicts. Production97ef4c73ea3717d1a059b649a35e8124d93bdb7f remains separate. User approves P12 thenP13; STOP afterP13, no automaticP14.

## Reused contracts and minimal delta

Reuse P07 typed catalog GET and pure exact-selection unsigned plan, P06 portable SHA-256/content/job/chain verifiers, P03 seller rail and docs shell. Added commerce/read-only browser entry, execution/evidence Node entry, probe/payment-challenge and bounded-json explicit subpaths. Pure verifiers import the explicit bounded helper, avoiding worker/database barrel initialization; digests and original immutable records unchanged. No SDK replacement, public npm release, new registry, dashboard, hosting or API tier.

Changed paths: packages/{commerce,execution,probe}/package.json additive exports; commerce/{read-client,portable-job}; execution/{evidence,portable-receipt,receipt-integrity,executors/x402,executors/x402-observation.test}; probe/{liveness,payment-challenge,payment-challenge.test,payment-liveness.test}; conformance/{code-anchor,portable.test}; examples/read-client/{browser,server,package,tsconfig,README}; web docs/{developers,sellers,_ui/library,_ui/DocShell}; public/api/v1/schemas/seller-examples.v1.json; ARCHITECTURE,DEVIATIONS,phase2/PROJECT_STATE and vnext evidence documents. No worker/deployment/proxy/dependency-version/lock/ABI/migration changes.

New inspector only accepts bounded captured {status,headers,body}; numeric v1body/v2PAYMENT-REQUIRED header; up to16offers, canonical uint256 strings, explicit56/97 CAIP2 labels, no guessed decimals/currency. All options remain CLAIMED, none selected. Optional reviewed expected chain/asset/payee/rawcap comparison is declared terms only, not authentication or authority. Relative timeout is not absolute expiry. Payer/payee authentication, token support, replay, idempotency, settlement remain NOT_CHECKED/UNAVAILABLE; executionAllowed alwaysfalse. MPP/mixed protocols, malformed/version/encoding/null/oversized/conflicting inputs remain invalid/unsupported. No fetch, wallet, signing or replay in this pure function.

Actual defect: legacy X402Executor treated every non402 (including discovery200/404/503) as a free task, and POSTed from preflight/execute without a proven consented exact-service adapter. Quote/inspect remain one guarded unpaid GET; never free-price or task-support inference. Preflight/execute now block before network. Existing parseChallenge remains legacy display-only, not atomic amount/payment verification; numeric stripping removed. Existing ERC8183 exact hire/buyer wallet/SDK seller0.5.5 and buyer0.6.0 unchanged. This deliberately restricts the unproven legacy HTTP task rail; no paid execution is claimed.

Separate examples use existing checkout packages/tools from another directory, no installation, wallet/database/Redis configuration or public publication. Node server uses bounded2MiB+1read from an opened captured file, no retry. Only explicit reviewed catalog base triggers one GET; no default production URL. Parsed bad proof/rejected plan exits2, raw I/O/parse errors sanitized. Browser example bundles separately and only reads catalog, makes unsigned plans, inspects captured payment data. A valid plan has simulationNOT_RUN and no signature replay/fresh-chain proof. Caller independently chooses expected terms. Real expired original P07 input is retained and rejected; synthetic interop input is clearly separate, chain97/unsigned, never provider data. Illustrative seller schema uses .invalid hostnames/no price or identity claim. Existing docs shell links current official BNBStudio v4/quickstart/deployment and existing builder/seller rail.

## Actual provider observations and independence limits

Production metadata read-only transaction17October22:01:08Z:57x402service declarations/39registry identities, chain56. These are not57providers/independent humans/payable agents. Selected metadata-driven oneGETeach through safeFetch,5stimeout/64KiB/0redirects/no auth/payment/task/retry at22:01:32Z:

- service1452, token268285, agents.ai-rook.com:200/443B/472ms, discovery only. Its Base/USDC description is an unverified outside claim, not proven BSC payment support.
- service11153,token322885,agensea-health-factor.vercel.app/x402:404/85B/41ms.
- service18209,token268954,stockanalyst-agents.fly.dev/x402/price:503/63B/566ms.

No402challenge or payer/payee/currency/decimals/consent/nonce/idempotency/paid work was established for these3. Other54declarations untested. This is dated evidence, not permanent unavailability or an exhaustive market absence. Optional paid buyer SKIPPED; beta read-only diagnostics and actual failure evidence shipped instead. No new transaction invented for a metric. No same-operator addresses counted as independent people; no contact message sent.

## Source provenance and negative attempts

Initial anchor check correctly failed before tests because existing generated manifest includes all probe source. Regenerated42-file local MCS implementation source hash0x3c871134132086241c3e9cf1ddfab7303709de6c28b395a59f442b817adcda3e; prior41-file0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433 retained for historical proofs. Difference: liveness source entry and new payment-challenge source. Math, MCS_VERSION1.0.0, tolerances and historical observations unchanged. Existing portable verifier returns UNSUPPORTED/UNAVAILABLE for old-code agreement separately from successful arithmetic replay/content integrity; regression asserts it. This is source metadata, no onchain anchoring transaction.

A partial initial full suite exposed an obsolete fallback assignment to const hasChallenge; only owned validation units stopped, original output preserved, no full success claimed. Removed fallback, added explicit200reachability assertion and regenerated manifest. Corrected focused47tests pass19.02sVitest/24.81srunner. Final full source validation and browser/consumer evidence appended below; earlier partial runs do not count as passes.

## Compatibility, blast radius, restoration and boundaries

Default marketplace/phase2/receipt JSON remains unchanged; additive versioned static seller examples and package subpaths. No DB migration, destructive operation, historical row/bundle rewrite, SDK/lock/contract change. Historical MCS code mismatch is explicit, not reissued under new source. Existing ERC8183 money path and P10 disabled native authority remain separate. P12 layout/art/themes/fonts retained.

Validation uses the16October SELECT-only snapshot, no Redis or signing-key environment. External consumer replays original public-content bundles and clearly labelled synthetic plan; no live current-chain verification/independent human adoption inferred. Chain56provider metadata and chain97unsigned fixture are distinct. Mainnet changes NONE; testnet writes NONE; paid provider jobs NONE; wallet sessions/signing/key handling NONE; production deploy NONE; Git push NONE. Unit mocks and fixture values are not live activity. No operating service/proxy/worker tuning or restart.

Owned checks serialized with CPU50%ofoneCPU, reduced to25%for final UI rebuild/proof after the slower07:27Kerb sample; weight1/nice15/idleIO/3GiBmemory/1GiBswap retained. Wall times reflect throttled shared-host tests, not product performance. Runtime1128files checked against frozen hashes after generated-config restoration. No query rewritten or cold production capacity/p95 claim. Public production health and PID/source/proxy continuity are separately dated below.

No release occurred, so no production rollback/data rollback needed. For candidate regression use a new branch with targeted source reverts; retain safe blocked x402 task rail, exact ERC8183 checks, immutable historical provenance and Caddy defenses. No data deletion/history rewrite. Restoring paid HTTP tasks requires exact service/task-compatible adapter, consenting independent provider, verified supported token/deployed payment contract, authenticated terms, payer/payee binding, cap/expiry/replay/idempotency/recovery and separate applicable payment/release authorization. No owner action is needed for the authorized local phase. Any deployment, payment or new authority remains separately gated. Phase AMBER: usable local developer/read-only diagnostic surface, paid compatibility/cold production/full independent adoption unproven. STOP afterP13.


## Full source tests

Corrected source0850b72: node scripts/generate-mcs-code-anchor.mjs --check exits0/0.48s,42files/source hash0x3c871134132086241c3e9cf1ddfab7303709de6c28b395a59f442b817adcda3e. Focused47/47pass. Full pnpm exec vitest run --maxWorkers=1 --minWorkers=1:819passed/51gatedskipped,88filespassed/5skipped(93),709.17sVitest/713.39srunner,exit0.51RPC/DB-gatedcases are not claimed tested here; prior isolated fixtures are separate earlier evidence. Expected mock timeout/unavailable logs remain in output, not live incidents. No tolerances/thresholds/assertions weakened. At06:25:09.635314Z own unit memory peak324538368B, OOM/max/high events0, CPU cap500mspersecond; this is a dated resource sample, not a production-performance measurement.

Browser receipt cryptography is deliberately not ported: the browser entry provides catalog/unsigned plan/captured-payment inspection; the existing canonical receipt/job verifier remains Node-only and is consumed from a separate project. This avoids a second incompatible hash implementation. A future browser receipt port must prove canonical-byte equivalence first. This is a declared capability boundary, not universal browser verifier support.

Midrun18October06:37:37.458168Z: product/shared/PM2 PIDs, original Marquecodex tmux/linger, production97ef4c7/tracked source/26media and trusted Caddy mirror unchanged. Complete public samples Marque200/0.079539s/66B(ok=true),KerbAPI200/1.329244s/308B(status=ok),Kerbweb200/0.578347s/219412B(completeHTML). These individual readings do not establish p95, cold capacity, causality or zero impact; earlier slower samples retained.

Full serial pnpm -r --workspace-concurrency=1 typecheck:20of21workspace projects,exit0/1566.51s, covering shared packages, all6reference agents, worker and web on frozen0850b72. These capped wall times are not product benchmarks. Standalone build follows before consumer/browser proof; source remains unchanged.

## Observed docs failure and final UI-only correction

All14external consumer steps met expected exits on0850b72 (strict copied-project types112.65s, total208.47s); compiled browser consumer exits0/20.62s,1interceptedGET,chain97UNSIGNED/simulationNOT_RUN, no auth/payment header or extra request. Bundle228276bytes/438inputs/no forbidden server dependency. Actual code endpoint200/no-store/5676bytes/42source files/current0x3c871134132086241c3e9cf1ddfab7303709de6c28b395a59f442b817adcda3e at07:13:47.366Z. Browser replay catalog count7/stale=false refers to fresh transport/projection of16October snapshot, not current underlying quote/probe/production availability. Original expired source input remains unchanged and rejected.

First docs browser attempt retained390day/night failures: moderate duplicate complementary landmarks, developer schema-link pointer/response wait failed, last seller case interrupted when only owned unit stopped. Independent normal click and touch diagnostics retained: link not requested under pointer, other sections intercept events; actual nominal390mobile context expands innerWidth774/innerHeight1886, visualViewport.offsetTop936. Keyboard Enter fetched the real illustrative schema200but did not count as passing touch navigation. New developer snippets lacked existing docs.code class, leaving unconstrained long preformatted lines. Reuse that bounded native horizontal-scroll class, name shared DocShell navigation/support aside landmarks, and add actual innerWidth assertion to browser harness. No forced click, CSS injection, zoom workaround, source data fabrication or product assertion weakened. New sourceef7f492 changes only2runtime files versus0850b72: docs/developers/page.tsx and docs/_ui/DocShell.tsx. No new stylesheet, token, design, API, dependency, math, threshold or payment/verifier logic. Final webtypes/rebuild/affected ESLint/copy and16docs/16audit/proxy proofs follow. Full819logic/20type and14consumer/compiled-example results retain0850b72 scope; final exact runtime hashes are separately frozen.


At18October07:27:51.566537Z continuity stillpasses all original service/PM2 PIDs, tmux/linger, production97ef4c7/trackedsource/26media and proxy mirror. Complete Marque200/0.284286s/66B(ok=true),KerbAPI200/4.207830s/306B(status=ok),Kerbweb200/9.483865s/219361B(completeHTML). Slower sample retained, cause/p95UNKNOWN. Reduced only owned validation-r4/proof-r4 CPU50to25%ofoneCPU, retaining weight1/nice15/idleIO/memory3GiB; no product/global tuning or restart. Follow-up observations remain separate, not replacements for this sample.

Separate07:31UTC follow-up after lowering own cap: complete Marque200/0.405703s/66B(ok=true),KerbAPI200/2.207666s/308B(status=ok),Kerbweb200/0.388565s/219361B(completeHTML). Improvement does not establish why the earlier9.483865s occurred: caching/cold path and other shared-host activity remain possible, causality/p95UNKNOWN. Earlier slower evidence retained; keep only owned units at25%, no product/query/global change.


Finalef7f492web-only gate: anchor0/0.20s,webtypes0/92.63s,standalonebuild0/1600.12s(29pages),guardedconfigrestore0/0.99s,affectedESLint0/47.06s,copy0/14.48s. CPU50then25%ofoneCPU as separately recorded, not product-performance evidence. One cold candidate code read hit its unchanged8sbudget (runner10.66s), retainedfailure; explicit second8sread passes0/0.67s at07:53:20.151607Z,200/no-store/42files/expectedsourcehash. No product query/deadline change or automatic retry. First accepted mobile docs cases now have actualinnerWidth390, native schema-link touchGET200, zeroaxeviolations; full matrix still pending at this observation. At07:46:46Z direct owned cgroup read shows CPUusage440537803usec versus303004068usec at07:37, memorycurrent614010880B/peak2539950080B, OOM/max/high0. Automatic approval review for an earlier complex counter read timed out; safe normal-sandbox direct cgroup read completed, no blocked action or privilege expansion.


Finalef7f492browser matrix16/16passes,exit0/636.53s: allactualwidths390/768/1024/1440,day/night,no unexpectedconsole/page/HTTPerrors/overflow/missingalt,zeroaxeviolations.8native schema-link activations200, no forced click/viewport workaround.24custom+16audit images actuallyviewed in2+2contact sheets,3accepted originals and before image inspected. DOMaudit16/16HTTP200exit0/259.20s; all16 retain only inline-link size advisories (developers9except3908, sellers5;18-20pxheight). These repeated-per-viewport findings are not unique defect/customer counts or certification. Lowcontrast/focus/overflow/missingalt/console/page/network checks clean. Proxy11casesexit0/11.09s, malicious/malformedRSC/spoofedmirror/unsupportedaction/controlbyte400. Final1128runtime hashes match frozenef7f492,0mismatches.


## Final candidate commands and observed outputs

Frozen source `ef7f4925f9e5c597af7a5f6582a84f4851b32f1f`, baseline `78043b0e3d9dcc1d532de03d75cde1f86f8dc91f`. Final web rebuild/type/lint/browser checks use this source, including completed P12 repairs. Full819tests/20workspace types and14consumer checks ran0850b72; the only later runtime delta is2docs markup files (existing code class and landmark names). Read/client/payment/verifier/conformance/SQL source remains byte-identical; no repeated full819/20 checks is claimed. Frozen source matches final artifact scope after restoration.

- anchor: exit0, 0.48s runner.
- focused: exit0, 24.81s runner.
- tests-full: exit0, 713.39s runner.
- types: exit0, 1566.51s runner.
- build: exit0, 867.71s runner.
- restore-generated: exit0, 0.39s runner.
- lint: exit0, 126.38s runner.
- copy: exit0, 11.44s runner.

Final UI-only ef7f492 gate:

- anchor: exit0, 0.2s runner.
- web-types: exit0, 92.63s runner.
- build: exit0, 1600.12s runner.
- restore-generated: exit0, 0.99s runner.
- lint: exit0, 47.06s runner.
- copy: exit0, 14.48s runner.

Build command: MARQUE_BUILD_DIR=.next-p10 pnpm --filter @marque/web build. Next default generated-type validation included. Restore only guarded generated custom-directory config references, no permanent config edit. pnpm lint and pnpm lint:copy passed. Existing optional dependency/build warnings retained; no dependency upgrade or threshold change.

- package: exit0, 1.07s runner.
- api-proof: exit1, 10.66s runner.
- browser: exit0, 636.53s runner.
- audit: exit0, 259.2s runner.
- proxy: exit0, 11.09s runner.
- frozen-source: exit0, no frozen-source mismatches.

Initial final-artifact code read hit the unchanged8sbudget (runner10.66s), no HTTP/body success claimed for that attempt. Separate explicit follow-up with the same8sbudget passed0/0.67s at07:53:20Z and returned200/no-store/expected42-filehash. Original failure retained in api-proof.log/post-r4-exits.json, follow-up in api-proof-r2.log/api-proof-r2-exits.json. Cold capped-runtime limitation remains AMBER; no application deadline or query changed.

Separate /tmp/marque-p13-consumer-20261018 copies5example files and links the reviewed checkout packages/existing tools; no install or wallet/DB/Redis env. Its strict types and all14harness steps meet expected exits on0850b72; those implementation files are unchanged in final candidate. Positive receipt: VERIFIABLE/MATCH, paymentUNAVAILABLE. Mutated receipt exits2/stateFAILED. Archived Plinth job content: VERIFIABLE, no current chain replay or new paid case. Synthetic chain97 plan: UNSIGNED/simulationNOT_RUN, no actual quote/provider. Unchanged expired P07 input exits2/quote_expired_or_too_close. Three actual17October captures remain NOT_PAYMENT_REQUIRED/offers[]/executionAllowedfalse. Synthetic malformed402capture exits2/INVALID. Browser bundle 228276bytes/438inputs, forbidden server dependencies[].

Retained unchanged-client Chromium proof executes compiled example with exactly1interceptedGET to catalog.invalid, replaying captured16October snapshot catalog; unsigned chain97 synthetic plan and captured503 inspection remain unsigned/unexecuted. No auth/payment header or unexpected network, no wallet/DB config. Captured projection reports count7/stale=false; that flag is not proof the16October snapshot has current underlying probes/quotes or production availability. This is a separate technical consumer, not independent human adoption or deployed API proof. See private browser-consumer.json.

Actual local candidate GET /api/v1/conformance/code returns200, no-store, testVersion1.0.0/toleranceRevision1, sourceFiles42, hash0x3c871134132086241c3e9cf1ddfab7303709de6c28b395a59f442b817adcda3e. Existing stored commitment/code endpoints are no-store; no cached current-code verification is reused. Default API schema unchanged; source hash naturally changes.

## Browser and visual evidence

16/16actual docs route/width/theme cases: /docs/developers and /docs/sellers,390/768/1024/1440,day/night,reduced motion,touch390.24custom screenshots including payment sections; real static illustrative-schema link clicks return200/schema marque.seller-examples.v1/ILLUSTRATIVE notice. Zero accepted serious/critical axe findings; unexpected errors/overflow/missing-alt fail the harness. Separate16case viewport DOM audit completed; detailed advisories retained in private audit report and visual-review.json. Viewport captures do not prove full-page screenshot completion or funded wallet behavior.24custom+16audit screens actually inspected via contact sheets and selected originals. Existing typography/themes retained; no art/hero/nav redesign.

## Closing operational evidence and stop

At2026-10-18T08:07:31.846018+00:00 production/shared service and PM2 PIDs, original tmux/linger, production97ef4c7/tracked source/26media and sanitized proxy mirror unchanged. Bounded complete public responses:

- marque: curlExit0; HTTP/connect/TTFB/total/bytes 200 0.003371 1.387340 1.388599 66; observed2026-10-18T08:07:34.959503+00:00.
- kerb-api: curlExit0; HTTP/connect/TTFB/total/bytes 200 0.089111 4.903129 4.904189 308; observed2026-10-18T08:07:40.036618+00:00.
- kerb-web: curlExit0; HTTP/connect/TTFB/total/bytes 200 0.079747 0.609621 0.686028 219396; observed2026-10-18T08:07:40.754136+00:00.

Marque ok=true, KerbAPI status=ok and complete Kerb web HTML checked separately from HTTP status. Earlier slower observations retained; no zero-impact/p95/cold-capacity claim. Only owned preview processes cleaned up;3291/3292free, no product restart/deploy.

No owner action required for this completed local batch. Phase AMBER: paid HTTP work, issuer authentication, operator independence and production cold capacity are unproven; inline-link audit advisories remain. Receipt cryptography remains Node-only as documented. No mainnet/testnet/paid write, production deploy or Git push. Separate applicable approval before release/payment/new authority. STOP afterP13; no automaticP14. Full private evidence /root/.marque/private/vnext-p13-20261018; no screenshots/raw operational records/secrets committed.
