# P01A checkpoint

Phase status: **GREEN for the scoped quote/listing/claim repairs and candidate acceptance checks**. Production release readiness remains AMBER: release is not authorized, independent-wallet acceptance is unknown, existing tap-target advisories remain, and one recovered ingestion-worker exit needs a separate operating investigation. P02 is explicitly approved and may proceed after this checkpoint is committed and announced; paid mainnet actions remain gated.

## Baseline, candidate and reuse

Baseline P01 HEAD: `b679adaa2a8bbabe0eee6009d2c8ef65174f6fee`. Unchanged production application/source: `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Branch `repair/vnext-v3-p01a-20261016`, isolated worktree `/root/marque-vnext-p01`. Tested source candidate: `32fd5cfeb5109984e060ef573988be8677cdb3ac`. A documentation-only follow-up binds this checkpoint to that commit; final branch HEAD is reported separately. Nothing is pushed.

Reused: existing SDK-compatible signed descriptions, simple quote support, quote/intent storage, exact-service seller lookup, safeFetch, owner nonce/claim tokens and authenticated publish POST, PostgreSQL uniqueness, MCS verdict, all four categories, wallet connector, themes/artwork, Caddy trusted-header mirror and transport monitor. No replacement marketplace/authentication framework, contract, signer, SDK upgrade or migration.

The [versioned integrity contract](P01A_INTEGRITY_CONTRACT.md) describes expiry, signature evidence, publication authority, listing-level distinctions and legacy-record transition. The repair rejects explicit expired unsigned quotes, caps unsigned acceptance at 900 seconds, reconciles signed expiry/hash fields, rejects signed task replay, rechecks stored purchases and removes expired ready/prices from cached/browser views. Public wording distinguishes provider-signed, identity-matched unsigned and unknown evidence. Homepage listing totals are measured before pagination and displayed as dated snapshots.

Both builder GETs are observational. Canonical identity and the entire fixed message bind owner claims. The existing POST rereads onchain ownership after a serialization lock, preserves old proofs, and commits publication/category atomically with retry no-ops. Chain-only testnet builders can publish an owner listing without invented registry/category rows; their navigation target is the existing builder surface, since public storefronts support mainnet. Hostile registration metadata is bounded and shape-checked through the existing SSRF guard. The checklist now separates checks from publication and provides an explicit owner action.

## Tests and concrete observations

- Regression-first quote run: 4 failed / 7 passed at baseline. It reproduced explicit expired acceptance, excess unsigned lifetime and conflicting signed expiry acceptance. These failure logs are retained privately.
- `pnpm exec vitest run --maxWorkers=1 --minWorkers=1`: 53 files passed, 2 gated files skipped; **458 tests passed, 12 skipped**, 312.69 seconds. This full-suite capture preceded three additional fixture tests; fixture coverage was then executed separately against final source.
- Final `MARQUE_INTEGRATION_DB=<isolated fixture URL> pnpm exec vitest run apps/web/lib/listing.integration.test.ts --maxWorkers=1 --minWorkers=1`: **12 tests passed**, 37.31 seconds. Only a new empty synthetic database was written. Cases cover unauthorized and transferred-owner publication, concurrent idempotency/xmin/timestamps, testnet/chain-only publication, failed MCS vs Warrant, endpoint mismatch, proof deduplication, and atomic rollback under a fixture-only category lock. Both GET mutation branches are exercised with fully qualified BUT unpublished identities and forced cache recomputation; the returned identity is asserted and no listing appears after repeated reads.
- Additional serial integrity selection: 48 tests / 7 files passed, including expired stored purchase, expired/overlong/missing expiry, domain/asset/signer/task replay, metadata null/non-array/huge shape and cached expiry.
- Serial workspace typecheck: exit 0. Final Next production build including type validation: exit 0 (`build-release.log`). Dedicated web typecheck after that build: exit 0. `pnpm lint`: exit 0. `pnpm lint:copy`: 843 historical em/en dashes, baseline permits 859; pass with no baseline relaxation.
- 8 captured real seller envelopes replayed at their original observation times: all accepted by the repaired verifier, 7 provider-signed and 1 identity-matched unsigned. Plinth's latest captured mode is signed; an older P00 observation was unsigned. These are dated selected-row observations, not the current whole marketplace population and not live purchasable offers.
- Candidate exact metadata: HTTP 200, 455 bytes, complete in 0.482103 seconds. Builder checks: HTTP 200 / 2375 bytes / 0.224129 seconds; owner: HTTP 200 / 2136 bytes / 0.210816 seconds. Both GETs work under a role that cannot insert listings.
- Candidate `/status`: TCP 0.000610 seconds, HTTP first byte 0.189443 seconds, complete body 1.000447 seconds / 116568 bytes / curl exit 0. These isolate TCP, HTTP and body outcomes; no production p95/speedup is claimed.
- `BASE_URL=http://127.0.0.1:3292 node scripts/incident-request-check.mjs`: 11 passed. `bash ops/http-health.test.sh`: 4 passed, including a 200 response with failed body transport. The production trusted Router-state mirror matches the unchanged source template at port 3201.
- Final source fingerprint matches the tested artifact; all 286 public JavaScript files were checked for the fresh snapshot password and none contained it. Build uses a sanitized read-only snapshot environment, no production secret file.

Real measured result: simultaneous identical publications create one fixture listing; subsequent identical publication changes neither listing nor category xmin/timestamps. A forced category lock yields a controlled failure with no committed listing/proof. Stored stale purchase is refused before intent insertion. These are controlled regression measurements, not marketplace demand or production latency.

## Browser and visual evidence

Real Chromium: **78 unique page/width/theme cases**, 13 routes at 390/768/1440, Day/Night. All response bodies complete with HTTP 200; zero console/page errors or bad HTTP responses. The initial mobile register assertion incorrectly required a ready agent from an empty build-time snapshot; its failure remains in the record. A focused final-artifact rerun has 6 real selected-cohort rows, HTTP 200, no console errors or overflow. This resolves the assertion assumption without manufacturing a quote or deleting the original failure.

Six real theme-control -> actual scroll through nine home sections -> All tested marketplace -> exact Plinth profile -> hire metadata -> Escape-close sequences pass, with 54 actual viewport captures. Full-page Chromium screenshots skip offscreen `content-visibility:auto` paint; actual scrolled viewport evidence was captured instead of modifying product CSS.

Twelve controlled signed/unsigned quote-sheet cases at three widths/two themes pass. They visibly disclose unsigned limits and server-assigned expiry and preserve the selected agent. The quote POST is intercepted locally and every such screenshot is marked CONTROLLED UI FIXTURE. Four controlled grid/list expiry cases in Day/Night remove measured prices and active Hire links and show the actual expiry explanation. Visible-row screenshots were separately captured and inspected. No provider was contacted, no wallet connected, no payment initiated in those tests. Six wallet-selection modals opened in the read-only page audit; signing/funding clickthrough is not claimed.

The repository stock audit ran 28 route/width cases (also 1024). Only its small-tap-target heuristic flags 24 cases, including existing inline links and controls. No contrast/focus/overflow/console/page-error issues were reported. Thresholds were not weakened; full WCAG conformance is not certified. All six page contact sheets and representative full mobile builder, quote, expiry, register and actual home-scroll viewports were visually inspected. Raw screenshots and reports remain private outside Git.

## Production continuity and operating limits

No production application deployment, reload, shared-service restart or source edit. Marque and Kerb health bodies completed successfully: Marque 200 / 0.274743 seconds, Kerb API 200 / 3.376739 seconds, Kerb web 200 / 0.612427 seconds. Web slots, Kerb processes, Caddy/PostgreSQL/Redis/PM2 manager, original user manager and tmux remain at their original PIDs. Linger=yes and the prior P01 needrestart policy remain installed.

One existing `marque-ingest` process exited and PM2 recovered it: old PID 4056703 -> 2599211, PM2 exit at 14:16:09 CEST and online at 14:16:15; application start logged 14:16:48. It has resumed sweep/enrichment/funnel work. No retained kernel OOM event is present in the checked window. PM2 source defaults a missing signal to SIGINT, so its label does not establish a signal sender. The 500 MB configured memory cap has no matching exceed-limit log in this event. Initiating cause remains UNKNOWN; no unsupported attribution or speculative production restart is made. Existing workers' autonomous activity is not attributed to candidate execution.

Untracked baseline reconciliation: the older "23 files" count describes 23 porcelain status entries. They contain 26 individual files, including collapsed video directories; newest mtime is 28 September. No new production media file was created or removed by this phase. All tracked production source remains unchanged at 97ef4c7.

## Boundaries, API and rollback

Chains/environments/actors: real BSC 56 public reads and captured envelopes; synthetic isolated owner/signature fixtures labelled 56/97. Fixture actor addresses are not independent marketplace users. Provider/buyer human independence and original provider consent remain UNKNOWN for the P02 historical pilot. Independent human wallet acceptance is UNKNOWN.

Mainnet state changes initiated: **NONE**. New testnet state changes: **NONE**. Paid external task/quote call initiated: **NONE**. Production deployment: **NONE**. Git push: **NONE**. No recurring cost or schema migration/reset. No first-party production observation deleted or rewritten. Existing listing records stay stored; new evidence projections separate stored publication, current owner proof, local quality, exact-service Warrant evidence and official qualification. Old listing-only proofs are preserved before an authorized refresh.

APIs retain existing fields and routes, with additive versioned quote/listing/job evidence. Legacy owner jobsPaid continues to mean funded and is explicitly distinguished from indexed payment release in jobEvidence.version1; unavailable new counts are null. Public chain aggregates do not establish independent buyers or marketplace origin. GET side effects are deliberately removed; publication uses the existing owner-authorized POST. Testnet indexStatus/navigation are explicit. No wholesale schema reset, contract or SDK change.

Rollback: candidate has no production traffic. Revert the candidate commit before release; no data reversal is needed. A future release needs a separately approved clean build/blue-green rollout and health/body checks. Candidate snapshot/fixture data must never be counted as public market activity. Private validation evidence is retained at `/root/.marque/private/vnext-p01a-20261016`.

Deviations: optional CPU-quota adjustment hit automatic review timeout, so the build retained its original cap. Early deliberately stopped candidate builds and final incremental builds are retained in logs. A typecheck run concurrently with Next cleanup hit missing generated `.next/types`; a final build and subsequent dedicated typecheck pass. Initial empty-state/free-tab/list-label assumptions in private browser scripts were corrected with actual returned states and navigation; original failures are retained. Uploaded private build pack, competitor research, raw data, credentials and screenshots remain outside Git.

Owner approval needed: P01A and P02 are already approved. Production release and any new mainnet state change still need their separate approvals under root/pack AGENTS. Next: P02, read existing paid-job history and independent-provider proof first, ship diagnostics/testnet plan if safe independent consent cannot be established. Do not start P03 automatically.

## Changed paths

- `apps/web/app/%5Fui/Gallery.tsx`
- `apps/web/app/_components/HireSheet.tsx`
- `apps/web/app/_components/hire/TaskForm.tsx`
- `apps/web/app/_components/market/AgentCard.tsx`
- `apps/web/app/_components/ui/PriceTag.tsx`
- `apps/web/app/agents/_storefront/Storefront.tsx`
- `apps/web/app/api/v1/builders/checks/route.ts`
- `apps/web/app/api/v1/builders/claim/identity/route.ts`
- `apps/web/app/api/v1/builders/claim/publish/route.ts`
- `apps/web/app/api/v1/hire/quote/route.ts`
- `apps/web/app/api/v1/phase2/owner/[address]/route.ts`
- `apps/web/app/builders/BuilderChecklist.tsx`
- `apps/web/app/docs/faq/faq.ts`
- `apps/web/app/docs/page.tsx`
- `apps/web/app/docs/whitepaper.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/register/Marketplace.tsx`
- `apps/web/app/register/market-model.ts`
- `apps/web/lib/builder-metadata.test.ts`
- `apps/web/lib/builder.ts`
- `apps/web/lib/claim.test.ts`
- `apps/web/lib/claim.ts`
- `apps/web/lib/home-data.ts`
- `apps/web/lib/listing.integration.test.ts`
- `apps/web/lib/marketplace-expiry.test.ts`
- `apps/web/lib/marketplace.ts`
- `apps/web/lib/quote-expiry.ts`
- `apps/web/lib/storefront.ts`
- `docs/phase2/PROJECT_STATE.md`
- `docs/vnext/DEVIATIONS.md`
- `docs/vnext/P01A_CHECKPOINT.md`
- `docs/vnext/P01A_INTEGRITY_CONTRACT.md`
- `docs/vnext/PROJECT_STATE.md`
- `packages/commerce/src/calls.ts`
- `packages/commerce/src/client/useHire.ts`
- `packages/commerce/src/hire-integrity.test.ts`
- `packages/commerce/src/hire.ts`
- `packages/commerce/src/quote-integrity.test.ts`
- `packages/commerce/src/quote.ts`
- `packages/commerce/src/supply-scope.test.ts`
- `packages/commerce/src/supply.ts`
- `packages/registry/src/quality.ts`
