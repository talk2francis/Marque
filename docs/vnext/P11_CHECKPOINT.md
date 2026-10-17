# P11 checkpoint: exact review links and honest outcome references

17 October 2026. Local checkpoint complete: AMBER. Exact review/read-only paths are validated; commercial Ledger linkage and human independence remain unproven.

Baseline P10 checkpoint `4b40705f0f69172acc87009f360d473870b87514`, frozen P11 source `63386e04c663259e4a071bdcea1b7b564ae7e599`; local branch `repair/vnext-v3-p11-20261017`, validation workspace `/root/marque-vnext-p07`. Production remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Browser/build/API candidate uses the preexisting SELECT-only `marque_vnext_p01_snapshot_20261016`, not the production database; fixture tests use a third isolated database. Production SQL scope observations below explicitly query database marque in a read-only transaction. Never treat newly read snapshot counts/quote ages as current production availability. User approves P10 then P11; STOP after P11, no automatic P12. Source preparation was independent while P10 validation ran, then merged with the completed P10 checkpoint. The preserved preparation worktree is detached. Full expensive checks run serially on the isolated original workspace, using its normal Next cache without copying secrets or dependency directories.

## Reused functionality and exact delta

Reuse ERC-8004 feedback, stored rating preparation commitments, exact hire intents/jobs/events, published team configuration, existing marketplace/storefront/compare, P03 owner-only seller projection (30-day cohort and per-token raw PaymentReleased/Refunded amounts), P06 portable job/receipt proof and existing Ledger records. No replacement dashboard, global reputation score, rating protocol, fee/escrow rail or mutable history.

New shared buyer-feedback predicate requires exact feedback commitment, chain/token/client/stars, original intent identity/job/buyer/provider/asset/raw funded amount, positive escrow funding, delivered state, and submission by feedback block. A provider wallet shared by several identities is insufficient. Self-provider and team records stay outside buyer-linked counts; broader nonrevoked feedback is retained. Current provider-wallet matching is conservative for transfers; human/provider/operator independence remains UNKNOWN. Submission timing is bounded by block number; existing rating rows lack feedback log order, so same-block ordering is UNKNOWN and not certified. This projection trusts original stored preparation relations and does not independently authenticate the original issuer/build or replay each feedback transaction.

Opt-in existing ratings `?format=evidence` returns nested schema marque.rating-evidence.v1: review records, distinct normalized addresses and chain/job keys are separate units, with deterministic graph and repeated-wallet pending-review labels. Feedback tx/index/block/time references remain explicit. Graph caps200wallets, references100events, flags disclose truncation, complete indexed-subset counts do not silently become payload counts. independentHumans=null, commonFunding/counterfeitEndorsements=NOT_CHECKED; no numerical confidence score. Existing default ratings shape stays unchanged, including legacy verifiedBuyers.count as review-record count. Separate/versioned cache keys prevent old looser positives from serving as new evidence.

Track lookup failure is UNAVAILABLE, not zero. Successful empty subsets retain actual projection timestamp and stale state. UI says escrow funded, delivered, completed separately; COMPLETED does not imply PaymentReleased. Exact buyer linkage has both ONCHAIN and MEASURED provenance. Existing homepage, register, quote identity, all four categories, fonts/art/themes and wallet-owned signing remain.

Opt-in existing Ledger `?format=outcomes` returns marque.ledger-outcome-references.v1/no-store: only original reference/block/time metadata, up to200+moreAvailable, with invalid-record rejection positions. Missing linkage is UNAVAILABLE; an explicit syntactic pointer remains unverified. No join by agent/date/task/anchor; no invented ROI, drawdown or pre/post result. Default benchmarks/seals body unchanged. Metadata query is bounded read-only; timeout returns503, not empty success. Original runs, receipts and manifests remain untouched. See [contract](P11_REPUTATION_CONTRACT.md).

Changed paths: packages/commerce feedback-proof implementation/unit/isolated-PG tests, rating and package subpath export; web ratings/Ledger existing routes/tests; agent-track and availability tests, storefront, marketplace/home/quest cache versions, outcome-links/tests and ledger-outcomes; existing AgentCard/Stars/Storefront/compare/home/register/Ledger UI and FAQ/whitepaper explanations; architecture/project/deviation/capability/conflict/graph/contract/checkpoint docs. No migration, worker/ops, SDK/dependency lock or production config change. Package export adds a source subpath, not an installed dependency.

## Dated observations and negative evidence

Read-only snapshot2026-10-17T14:59:47.271675Z:182mainnet indexed feedback records/nonrevoked182/14distinct rater addresses;32testnet/31nonrevoked/13distinct addresses. Whole indexed-table scope includes team and broader registry activity; no independent-customer claim. Prepared comments30mainnet/5testnet.41benchmark runs have0explicit job IDs and0explicit receipt IDs in inspected metadata;29receipt rows have0explicit job IDs in inspected keys. Thus a commercial Ledger-to-receipt outcome is UNAVAILABLE. Existing published Ledger response has4benchmarks/10capped returned seals, not41commercial cases.

At15:01:12.990457Z, bounded pre-check before team exclusions:182mainnet feedback,30old provider/client-linked starred,30exact-linked,0old-only. This does not demonstrate current count inflation. Later code also binds original intent token/raw amount; do not claim this earlier snapshot measured that later revision. Future wrong-identity/hash/job cases are tested in isolated synthetic fixtures.

Existing Plinth job56/56916 rechecked by the existing read-only receipt CLI at2026-10-17T15:00:19.855Z/head128190608:PAID; separate delivery/completion/exact ERC20payment and supplied artifact verifiable.31allowlisted RPC reads, no paid call or wallet. U token0xcE24439F2D9C6a2289F741120FE202248B666666, raw10000000000000000/18decimals=0.01U. Payment release tx0x017fb250c149053403af73a8bc78023ff87ebd5c7a682281a0706e408d4b064c. Provider0xb12a1e4e0e22a97e266ed7a6bfc4133f699b1a1b; buyer0x15a97307caa68c24e4b5a0b83d331a6aa1ea195f. This is a preserved historical hire, not a newly created independent user or linked Ledger outcome. Refund event absent; human/operator/funding independence UNKNOWN, asset action authority unproven, private quote signature not replayed. Raw artifact SHA-256, SDK semantic Keccak and receipt SHA-256 are different commitments; no arbitrary hash joins.

## Validation and browser evidence

Early focused run:30passed,5files,149.30sVitest/170.99srunner, including14isolated PostgreSQL attacks. Later availability/reference/provenance refinements require the final checks below; early results alone do not prove the final source.

The first full validation attempt on efbf755 was stopped during tests for the final public-copy alignment; its logs are preserved as interrupted, never claimed as a pass. Final browser matrix includes48states across8routes at390/768/1440 and two themes, including FAQ search/open answer and the whitepaper reputation section. The original30SepPDF remains explicitly labelled as an archive. Final results below retain the original attempts and focused reruns.

Final MCS anchor: exit0/0.39s, unchanged0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433. Final full suite `pnpm exec vitest run --maxWorkers=1 --minWorkers=1`: exit0/872.30srunner,865.28sVitest; `Test Files 84 passed | 5 skipped (89)`, `Tests 774 passed | 51 skipped (825)`. The51gated DB/network tests are skipped, not claimed run. Explicit guarded fixture battery `pnpm exec vitest run packages/commerce/src/feedback-proof.integration.test.ts apps/web/lib/seller.integration.test.ts apps/web/lib/listing.integration.test.ts packages/commerce/src/hire-p02.integration.test.ts --maxWorkers=1 --minWorkers=1`: exit0/95.17srunner,86.90sVitest,4files/48tests passed, including14new exact-feedback cases and34existing listing/seller/hire regressions. Serial workspace typecheck `pnpm -r --workspace-concurrency=1 typecheck`: exit0/2172.63s, including web, worker, shared packages and all six reference agents. These throttled wall times include shared-host contention and are not product performance measurements. Standalone build `MARQUE_BUILD_DIR=.next-p10 pnpm --filter @marque/web build`: exit0/1321.29s; compiled with the existing optional MetaMask async-storage/pino-pretty and viem/ox dependency warnings, Next generated route types and all28static pages passed. Restore-generated exit0/0.71s; `pnpm lint` exit0/240.50s; `pnpm lint:copy` exit0/32.41s (823em/en dashes across40files, existing baseline allows859). No thresholds or dependencies changed. Final browser coverage:48distinct route/width/theme cases validated across the original and focused runs,78custom screenshots reviewed. The20-case DOM audit completed with inline tap-target advisories; it is not a clean accessibility audit. Closing health/PID/source checks pass; details below. Private evidence /root/.marque/private/vnext-p11-20261017; no raw API records, private config or screenshots committed.

Negative cases cover wrong identity/shared provider, feedback hash, chain, buyer, missing/incorrect funding, undelivered, feedback before submission, self-provider, wrong stars, team and revoked feedback; repeated feedback remains2records/1wallet/1job and repeated reads preserve row xmin. Fixtures only append synthetic rows in the explicitly guarded preexisting isolated marque_vnext_fixture database; no production mutation/deletion. Tests also cover unavailable vs known-empty index, deterministic caps/dedup/large block strings, malformed/hostile reference metadata, no inferred job URL without chain, default API compatibility and503timeout. No test pretends to establish independent humans or quality.

## Compatibility, rollout and status

No migration or first-party data rewrite. Existing GET responses preserved by default; opt-in versioned evidence, additive track metadata and derived cache namespace bumps. Source-only rollback restores previous derived labels/cache keys; do not silently re-enable looser buyer claims. No data rollback. Candidate must be separately reviewed/released before live traffic; no release authorization is inferred from this phase.

Mainnet state changes NONE; testnet writes NONE; paid/provider tasks NONE; real wallet/operator-key/session use NONE; unit-test cryptography is offline synthetic evidence; production deployment NONE; git push NONE. Public/production DB operations are read-only; synthetic isolated fixture writes are explicitly separate. Chain scopes56/97; actor independence UNKNOWN. No owner action is required for the completed authorized local work. Separate approval is required before production release, real mainnet/paid activity or new wallet authority. Phase status AMBER; receipt-linked learning and independence remain explicit gaps. STOP after P11; P12 is not authorized.

Mid-run2026-10-17T19:04:21.424097Z: shared service/PM2 PIDs, original Marquecodex tmux, Linger=yes, production97ef4c7/tracked source/26preexisting media and sanitized Caddy mirror unchanged. Complete public GETs: Marque200/0.175232s/66bytes (ok=true), KerbAPI200/2.515253s/306bytes (status=ok), Kerbweb200/0.217061s/225050bytes (complete HTML). Host CPU pressure avg10=32.23/load4.71on6CPUs; retained25%CPU validation cap. Individual samples do not establish causality, p95 or zero performance impact. Candidate config has no signing-secret variables and no Redis connection; isolated derived caches do not write production Redis.

Browser boundary clarification: telemetry attempts are intercepted and answered204 locally; all other non-GET/HEAD/OPTIONS requests are blocked and fail the run. Report no server-persisted telemetry or paid writes, not an unsupported assertion that the browser attempted no telemetry. P10 checkpoint wording is clarified here without changing its tested runtime.


### Preserved browser failures and focused verification

Initial custom Chromium run on source63386e0:48route/width/theme cases,42passed; six register cases failed the harness assumption of two Ready-to-hire comparison controls. Actual candidate UI reported0ready records, HTTP200/no console errors/no overflow. No availability was fabricated to satisfy that test. A focused rerun selects actual All tested records, retaining the default empty state and testing the comparison sheet with their real identities. Successful cases are retained, not rerun wholesale.

The stock full-page screenshot audit timed out at its30s capture deadline, after fonts loaded. Original logs/artifacts remain. The private audit copy keeps its page-wide DOM checks but uses viewport screenshots with reduced motion/animations disabled; no full-page clickthrough is claimed. The first focused runner also stopped safely at a local startup race (Caddy ready before Node; local502); both preview children were cleaned up. The corrected runner waits for both owned loopback listeners. No product source change or new build was needed for these harness corrections. Additional profile captures bring the new review boxes, evidence link and timestamp into view; the initial screenshots mostly showed the track-section start.

First post run retained passing package0/7.00s, proxy0/7.81s, API proof0/1.29s and frozen-source0mismatches. Six GETs at2026-10-17T20:32:37Z onward: default Plinth ratings200/0.109297s/261bytes (same dated body); evidence Plinth200/0.073425s/1370bytes; evidence Keel200/0.103896s/4007bytes; invalid token400/0.081683s/91bytes; default Ledger200/0.104445s/71470bytes with unchanged benchmarks/seals keys; opt-in outcomes200/0.013552s/12495bytes, no-store. Candidate snapshot returned outcome scope41records/0invalid/moreAvailable=false, stateUNAVAILABLE/verifiedReceiptLinkedOutcome=null. All remain read-only and no verified commercial linkage is invented.

At2026-10-17T20:05:08.453545Z own validation unit: memoryCurrent1661784064bytes, measured peak-so-far2392231936bytes, no restarts, memory max/OOM events all0, CPUQuota25%. At20:06:30.368716Z production service/PM2 PIDs, tmux/linger/source/media/trusted proxy unchanged; complete Marque200/0.172894s/66bytes, KerbAPI200/2.094521s/308bytes, Kerbweb200/0.295705s/225062bytes. Earlier19:35:27.134165Z samples Marque200/0.129693s, KerbAPI200/3.105422s, Kerbweb200/2.200863s are preserved; bodies valid. These varying individual readings do not establish p95 or zero impact. No other service was restarted or tuned.

Catalog scope correction: at2026-10-17T21:23:45.857538Z, candidate snapshot ready0/total0, tested7/total7. All seven tested quotes are expired_or_unproven, with stored expiries on16October. This is not a production supply count or current seller health. The ready GET succeeded200/13.810350s in the bounded follow-up; tested200/0.509239s. Prior cold503 is retained as a separate observed failure, not erased or counted as zero. Underlying cold DB/app/CPU contributions remain UNKNOWN; no query rewritten.


## Final browser result and remaining risk

Actual no-wallet Chromium coverage:8routes (home, register, Keel, exact Plinth identity, exact two-agent compare, Ledger, FAQ and whitepaper),390/768/1440, day/night. Final48distinct cases combine retained successes and focused reruns on unchanged source63386e0. Original48:42passed/6register harness failures; focused register6:5passed/1response-wait timeout; profile12:12passed with closer review/scope captures; final768night readiness case passed after waiting for page/network/actual handler readiness and warming the read-only catalog. The earlier timeout is retained, not retrospectively called a pass; its precise cause is not independently established. Requests, actual themes, failures and screenshot provenance are preserved in private browser-final/report.json.

Final readiness case exit0/100.02srunner: real tested API200/7returned records, actual compare sheet selected Keel and Sluicegate (both labelled reference), opened/closed, no console/page/HTTP errors, no non-telemetry writes, no overflow. Preceding catalog warmup200/23.011s under25%CPU remains an explicit cold-read limitation; the earlier503 and13.810350s sample remain. These are snapshot/capped-runtime observations, not production p95 or a reason to silently renew prices or rewrite queries. Production cold capacity and pool/CPU contributions need separate measured review before release.

Accepted78custom images are composed from preserved source attempts; all represented through inspected contact sheets, with nine originals inspected. Additional20audit viewport images reviewed. New review boxes, ONCHAIN+MEASURED provenance, exact job units, scope timestamps, unknown human/operator status, truthful unavailable quotes and both themes are visible. Existing delivery captions retain mobile ellipsis; optional compact-caption polish is deferred. Private visual-review.json records exact viewed sources. No full wallet or paid-provider clickthrough is claimed.

Viewport DOM audit exit0/338.68s,20/20HTTP200, zero console/page errors, no overflow/missing-alt/sampled-contrast/focus issues. All20combinations flag small inline targets: home8-9, register5, Keel41, Plinth14, Ledger4 per viewport. These repeated-per-viewport findings are not unique defect or customer counts. They include inline evidence links and older link patterns; accessibility tap-area polish is explicitly deferred under AMBER. The earlier full-page screenshot timeout is retained; viewport capture is not full-page screenshot proof. No DOM assertion, MCS tolerance or application deadline was weakened.

Final runtime hash comparison:0mismatches. No further test reruns after the passing build/lint because only evidence docs and private harness readiness/capture changed. Private final-evidence.json links validation, API/proxy and focused proof outputs. Own loopback3291/3292 are free; no owned P10/P11 validation service remains running. Disk available93144043520bytes at closing; no cleanup/deletion required.

## Closing live observations and decision

Production continuity2026-10-17T21:43:43.648016Z: original shared service/PM2 PIDs, original Marquecodex tmux and Linger=yes unchanged. Production remains97ef4c73ea3717d1a059b649a35e8124d93bdb7f, no tracked diff,26preexisting untracked media retained. Sanitized trusted Caddy mirror matches: source SHA256bd15efda8961a42c2283791a0f7c0c09b9c4e5364a887d4e73553e2c5bb04a55; livef72e282be2ea26689966a4e91a09a5fb9d985339b8813ed88f98f0c19d1e3ec8. Complete public health responses: Marque200/0.308249s/66bytes/ok=true, KerbAPI200/2.332143s/304bytes/status=ok, Kerbweb200/0.303644s/224852bytes/completeHTML. This proves these dated samples and continuity, not zero performance impact or universal uptime.

Production database marque metadata refreshed read-only at2026-10-17T21:43:49.039823Z (Postgres emitted23:43:49.039823+02:00),5sstatement/500mslock bounds, rollback, exit0. Counts unchanged: chain56feedback182/nonrevoked182/14rater addresses, chain97feedback32/nonrevoked31/13addresses; prepared comments30/5.41Ledger runs still have0explicit job IDs/0explicit receipt IDs in inspected fields;29receipts have0explicit job IDs in inspected keys. Existing Plinth56/56916 remains indexedPAID, raw10000000000000000, service43279, last event block127719379. This fresh metadata observation is separate from snapshot browser/API data and the earlier15:00actual chain/artifact verification; it creates no new hire, receipt link or independent-person claim.

Decision: source-level reputation integrity and explicit unavailable outcomes are complete locally. Real linked quality learning, human/operator/funding independence, native authority, production release, cold production capacity and deferred accessibility polish remain unproven or separate gates. Source-only rollback changes derived labels/cache namespaces, never deletes observations or resets schema; review before restoring looser buyer claims. Mainnet/testnet writes, paid jobs, deployment and push NONE. Existing SDK pins, campaign rules, four categories, buyer signing, MCS anchor and operational protection remain. Commit this checkpoint on the feature branch and STOP; no automatic P12.

## Exact changed-path inventory

Compared with baseline4b40705; generated by git diff --name-only plus this new checkpoint.

```text
apps/web/app/_components/market/AgentCard.tsx
apps/web/app/_components/ui/Stars.tsx
apps/web/app/agents/_storefront/Storefront.tsx
apps/web/app/api/v1/ledger/route.test.ts
apps/web/app/api/v1/ledger/route.ts
apps/web/app/api/v1/phase2/ratings/[agentId]/route.test.ts
apps/web/app/api/v1/phase2/ratings/[agentId]/route.ts
apps/web/app/compare/CompareTable.tsx
apps/web/app/compare/page.tsx
apps/web/app/docs/faq/faq.ts
apps/web/app/docs/whitepaper.ts
apps/web/app/docs/whitepaper/page.tsx
apps/web/app/ledger/page.tsx
apps/web/app/page.tsx
apps/web/app/register/Marketplace.tsx
apps/web/lib/agent-track.test.ts
apps/web/lib/agent-track.ts
apps/web/lib/home-data.ts
apps/web/lib/ledger-outcomes.ts
apps/web/lib/marketplace.ts
apps/web/lib/outcome-links.test.ts
apps/web/lib/outcome-links.ts
apps/web/lib/quest-recs.ts
apps/web/lib/storefront.ts
docs/ARCHITECTURE.md
docs/DEVIATIONS.md
docs/phase2/PROJECT_STATE.md
docs/vnext/CAPABILITY_INVENTORY.md
docs/vnext/DEVIATIONS.md
docs/vnext/FACT_CONFLICTS.md
docs/vnext/IMPLEMENTATION_GRAPH.md
docs/vnext/P10_CHECKPOINT.md
docs/vnext/P11_CHECKPOINT.md
docs/vnext/P11_REPUTATION_CONTRACT.md
packages/commerce/package.json
packages/commerce/src/feedback-proof.integration.test.ts
packages/commerce/src/feedback-proof.test.ts
packages/commerce/src/feedback-proof.ts
packages/commerce/src/rating.ts
```
