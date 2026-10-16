# P03 checkpoint

Phase status: **AMBER**. Scoped source, candidate API, browser and regression acceptance pass. A newly consented independent human builder/wallet run is not demonstrated; reliable seller diagnostics and the existing historical paid case are the bounded outcome. P04 is explicitly authorized after this local checkpoint. No deployment or new paid job.

## Baseline, candidate and reuse

Baseline P02 HEAD `4509846a2a0912c3a876b5b6176921598fe7a7e4`; branch `repair/vnext-v3-p03-20261016`; isolated worktree `/root/marque-vnext-p01`. Production source/release remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Tested source commit `f4d5d568e939a19b2666598c6ac58fc5c58110c3`. This documentation-only follow-up binds that identifier; final documentation HEAD is recorded in the closing report and private manifest. No push.

Reused `/builders`, the owner projection, nonce/claim signatures, fresh owner publication, category declaration, discovery/conformance adapters, existing quote/intent/notify tables and indexed jobs/events. No new dashboard, claim framework, hosting product, migration, contract, dependency or SDK upgrade. Existing four categories, art, fonts, marketplace/hire flows, Caddy mirror and transport protection are preserved.

The [seller contract](P03_SELLER_CONTRACT.md) freezes additive `seller.version1`: disconnected owner lookup; public dated service/quote/job observations; owner-only aggregate diagnostics; exact-intent attribution; raw-unit earnings; explicit unknowns. Private diagnostics use the existing claim in an authorization header, recheck current same-block registry ownership, and omit tasks, buyer addresses, IPs and raw provider bodies. Transfer or unavailable current proof fails closed. Missing verification configuration is an explicit no-store503, not an unhandled500 or a fallback to private data.

Discovery no longer sends A2A tasks. Conformance POSTs require explicit task consent before capture/work; owner-recorded tests also recheck control and the declared endpoint. Category changes recheck control. Publication reuses the existing authenticated idempotent POST. The seller guide links official current Studio quickstart/deployment documentation and distinguishes discovery from payable adapters. The v4 announcement and current deploy reference differ in listed targets; no extra hosting capability is inferred or installed.

## Test commands and actual results

```text
pnpm exec vitest run --maxWorkers=1 --minWorkers=1
  60 files passed, 4 gated skipped; 513 tests passed, 32 skipped; 254.92s
Isolated PostgreSQL listing/seller/hire regression selection
  3 files passed; 30 tests passed; 20.43s
Final builder-task-boundary + metadata selection
  2 files passed; 18 tests passed; 22.38s
Final isolated PostgreSQL seller integration
  1 file passed; 14 tests passed; 24.44s
pnpm -r --workspace-concurrency=1 typecheck
  exit0; 745.04s; final Next type validation also passed
Final standalone build (.next-p03, SELECT-only snapshot)
  exit0; 555.89s; generated references restored with assertions
pnpm lint (after generated-reference restoration)
  exit0; 67.69s
pnpm lint:copy
  842 <= 859; exit0; no baseline relaxation
Caddy protection: 11 observed regression outcomes passed
HTTP transport: 4 regression checks passed
```

The full suite preceded the narrow endpoint-error, auth-configuration and mobile repairs. Final targeted tests, fixture tests, lint and build cover those changes; it is not claimed as a second full-suite run. Earlier build successes, the reproduced503-vs422 failure, the original mobile failures and the generated-reference lint failure are retained. Existing optional dependency warnings remain; no dependency change was used to hide them.

## Browser and API proof

Real Chromium: **36 final cases**, six routes (`/builders`, `/builders/claim`, `/builders/test`, `/docs/sellers`, marketplace and quest), 390/768/1440, Day/Night. All rendered HTTP200, zero observed console/page errors, failed local responses or horizontal page overflow. All six disconnected seller flows read an owner, explicitly select Plinth identity363619/service43279, display that exact service, receive null private diagnostics and expose no owner action buttons. All six public test forms start disabled until consent; no task is submitted. These are real page interactions, not HTTP navigation alone.

Actual scrolled mobile/desktop earnings views show raw amount10000000000000000 for token0xce24439f2d9c6a2289f741120fe202248b666666, chain56, one cohort job. Mobile guide code remains available in an internal724px/356px scroller without widening the page. Original seller screenshots were visually reviewed at all six contexts, plus the actual earnings, guide/code and consent screens. Private screenshots are not in Git. Optional contact-sheet tooling was unavailable/timed out at automatic permission review; direct original-image review completed the visual work without installing tools.

The initial mobile builder grid expanded to425px from the longer current install command; a minmax(0,1fr) track and bounded sidebar fix it. The guide now uses the existing scrollable-code style. Seller observations use a neutral rule, including failed/unknown states. Assertions were not weakened. The stock audit ran16 route/width cases including1024;12 have only the small-inline-tap-target heuristic advisory. No full accessibility certification or real wallet signing/funding clickthrough is claimed.

Final candidate HTTP samples (isolated database snapshot, not production performance): builder checks200/4286bytes/2.892872s; owner200/4047bytes/0.603494s. `/status`: TCP0.000489s, HTTP first byte0.412983s, complete body1.893304s/116580bytes/curl0. Missing task consent returns428 before work. Deliberately missing candidate claim configuration returns503; malformed authorization returns401. Configured invalid-token401 and transferred-owner403 cases are covered by the fixtures. All21 frozen source/style files match;287 public JavaScript files contain neither the snapshot credential nor the private server guard.

## Current facts versus the browser snapshot

Browser/runtime API validation uses `marque_vnext_p01_snapshot_20261016` with SELECT-only credentials and no production signing/auth secret. Stored quote/probe dates remain visible. Its old observations and footer counts are **not** reported as current production counts. Registry owner/wallet reads are current public chain reads, separately identified by block.

A separate explicitly read-only production SQL sample at **18:26:52UTC** records six reference probe quotes accepted, signed and unexpired; Brain's outside sample unsigned and then unexpired; Plinth's latest signed sample expired at18:18:54UTC. This does not renew it or promise an exact-task quote. Plinth's exact-intent30-day cohort has received1/funded1/submitted1/completed1/paid1/refunded0, latest job block127719379, consistent with P02's independently checked settlement. The index cursor was128026191, updated3.011984seconds earlier. Current head lag is UNKNOWN; cursor update age is not head lag.

One initial private cohort query selected the first SDK registry (testnet97) with chain56 and returned0. That is invalid evidence, retained as a negative diagnostic, not an activity count. It was corrected by explicitly selecting numeric chain56 from the pinned SDK. Runtime seller attribution already uses the canonical chain-aware agent key and was unaffected.

## Negative cases, actors and unknowns

Real PostgreSQL fixtures demonstrate exact large-integer preservation beyond JavaScript's safe integer range; no private task/failure-body leakage; repeated GETs leave stored rows/xmin unchanged; invalid/mismatched authorization; transferred ownership; unavailable RPC/configuration; later failed quotes superseding old good samples; supported owner-signed quotes with a separate agent wallet; funding mismatch; refunds excluded from earned releases; unrelated same-provider jobs excluded; and MCP discovery explicitly unsupported as an escrow hire adapter. Existing publication concurrency/idempotency and stored stale-quote regressions were rerun.

Historical Plinth56916 payment/artifact evidence is reused from P02. Human buyer/provider independence, authenticated new-pilot consent and an independent human's connected-wallet acceptance remain **UNKNOWN**. Synthetic actors do not become organic users. Old identity-level conformance results cannot prove an immutable exact-service Warrant binding; the new projection says UNKNOWN. Raw amounts carry token/chain/time scope; decimals, valuation and current head lag are not guessed. Historical identity-cohort earnings can belong to earlier providers after transfer, not the current owner's wallet balance.

## Operations, compatibility and rollback

Closing continuity at **18:44:48UTC**: shared-service and PM2 PIDs unchanged, original tmux present, linger=yes, trusted Caddy mirror unchanged, production tracked source clean and26 pre-existing media files preserved. Health bodies complete with curl0: Marque200/0.097273s, Kerb API200/2.497959s, Kerb web200/0.316720s. Earlier Kerb API20s timeout and successful retry are retained; no restart or initiating cause was invented. All candidate units were stopped and ports3291/3292 are clear.

Mainnet state changes **NONE**; testnet changes **NONE**; production deployment **NONE**; Git push **NONE**; paid/provider task invocation **NONE**; real wallet/session/private-key access **NONE**. Writes were candidate files and isolated synthetic fixtures only. Existing production workers continued autonomously.

Existing builder/owner fields remain; additive seller v1 and owner cache namespacev3. Legacy jobsPaid still means funded with its existing explanation; seller.jobs.paid means indexed payment release. Private responses are no-store and vary by Authorization. Existing conformance callers now need taskConsent:true or receive428: deliberate fail-closed correction, documented and current callers updated. No migration/reset/backfill/deletion or historical hash rewrite. Existing quality/listing observations remain intact; service/history caps are explicit.

Application blast radius is the builder/owner read surfaces, existing test/discovery controls, documentation and scoped builder layout. Rollback is a feature-branch revert to P02; no DB rollback is needed. A future release requires separately approved blue/green validation. P03/P04 implementation is already approved; deployment, new mainnet actions, paid hosting and a newly paid outside pilot retain their separate gates. P04 may proceed after the commit; P05 is not authorized.

## Changed paths

```text
apps/web/app/api/v1/builders/checks/route.ts
apps/web/app/api/v1/builders/claim/test/route.ts
apps/web/app/api/v1/builders/declare/route.ts
apps/web/app/api/v1/builders/probe/route.ts
apps/web/app/api/v1/builders/test/route.ts
apps/web/app/api/v1/phase2/owner/[address]/route.ts
apps/web/app/builders/BuilderChecklist.tsx
apps/web/app/builders/SellerSummary.tsx
apps/web/app/builders/checklist.module.css
apps/web/app/builders/claim/ClaimFlow.tsx
apps/web/app/builders/page.tsx
apps/web/app/builders/test/TestForm.tsx
apps/web/app/builders/test/page.tsx
apps/web/app/docs/_ui/library.ts
apps/web/app/docs/page.tsx
apps/web/app/docs/sellers/page.tsx
apps/web/lib/builder-task-boundary.test.ts
apps/web/lib/builder.ts
apps/web/lib/listing.integration.test.ts
apps/web/lib/seller.integration.test.ts
apps/web/lib/seller.ts
docs/DEVIATIONS.md
docs/phase2/PROJECT_STATE.md
docs/vnext/DEVIATIONS.md
docs/vnext/P03_CHECKPOINT.md
docs/vnext/P03_SELLER_CONTRACT.md
```
