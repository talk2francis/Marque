# P02 checkpoint

Phase status: **AMBER, allowed diagnostic/historical-evidence fallback**. Scoped source and candidate acceptance checks pass. A historical outside-identity paid case is verified, but buyer/provider human independence and authenticated operator/new-pilot consent records are UNKNOWN. The historical signed quote and explicit notification establish protocol acceptance. No new paid transaction is justified. P03 is not authorized and will not start automatically.

## Baseline and candidate

Baseline P01A HEAD: `05aad6088f943d060597b62fe46bffbc8bb2cab3`. Branch `repair/vnext-v3-p02-20261016`, isolated tree `/root/marque-vnext-p01`. Production checkout/deployed application remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Tested-source SHA and final documentation HEAD are bound after validation; no Git push.

Reuse: existing seller lookup, user/probe quote records, signed/unsigned verifier, SDK-compatible description/hash, hire intents/indexer binding, browser wallet connector, exact approvals, existing metadata/quote/intent/notify routes, provider retry observations, job room, safeFetch, all four categories, reference previews, artwork/themes, Caddy mirror and transport protections. No new contract, signer, payment protocol, dashboard, dependency or schema migration.

## Concrete changes and why

- Selected service ID survives marketplace/storefront links, filter URL synchronization, sheet metadata, quote request and retry. Explicit selection cannot fall back to another service/free endpoint. Stale or mismatched quote responses cannot replace the selected service.
- Quote/purchase use a current, same-block registry owner/wallet proof with chain/head checks; no index fallback on failure. The existing hard quote domain, signature or unsigned evidence, task replay, expiry, amount, decimals and asset/provider checks remain.
- Outside A2A liveness no longer implies a free task. Existing GET metadata exposes versioned observational diagnostics; unreviewed outside `Try free` calls fail before seller contact. Six audited reference previews remain.
- New browser quotes opt into version-2 task-access capabilities; intent validates the bearer token. Existing clients/rows retain the original legacy contract and its weaker access model. No user asset authority is added.
- Buyer/quote intent retries serialize in a bounded transaction and reuse the same terms; already-bound quotes cannot issue another create response. A known create transaction is rebound on retry. Payment continuation checks exact current chain terms and sends only missing registration/budget/approval/fund steps; it never funds a funded/delivered/completed job again. Refreshed prices require another buyer decision. Calls explicitly name the buyer account.
- Initial quote errors are rendered before any successful quote; the browser negative revealed the old error display was unreachable when quote was null. Rejected mismatched-service quotes still cannot reach wallet setup. Expired stored prices are distinguished from a failed price request; missing indexed previews are distinguished from no public deliverable. This wording correction came from actual browser review after the functional build.
- Reserved notify parameters cannot be overridden; closed/delivered jobs do not trigger work. Explicit rejection cannot become acceptance merely because a reply mentions a job ID. Three retained historical accepted replies still parse as accepted. Pending/rejected notification is distinct from funding, submission and payment release in the sheet.

The [commerce evidence and adapter contract](P02_COMMERCE_EVIDENCE.md) contains the candidate ladder, exact historical transactions/hashes, current dated observations, protocol boundaries, known limitations and next pilot prerequisites. Private operator contact draft/testnet plan is prepared and **not sent**.

## Validation and observed facts

Validation completed on the frozen candidate; a documentation-only follow-up binds the tested source SHA. `pnpm exec vitest run --maxWorkers=1 --minWorkers=1`: 487 passed / 23 gated skipped, 58 files passed / 3 skipped, 329.41 seconds. This full run preceded the strict notification parser and expanded metadata tests. Final targeted integrity/notification/metadata selection: 74 passed / 10 files, 38.71 seconds. Metadata constructor/type correction plus actual HTTP404 assertion: 5 passed, 5.39 seconds. Final real PostgreSQL intent fixture: 8 passed, 5.49 seconds. No live wallet signing or mainnet execution is claimed.

Real observations: Plinth56916 current chain status3, four successful lifecycle receipts, explicit payment-release event and 0.01U escrow-to-provider Transfer; original signed quote/description and canonical artifact hash match. Keel56903 control artifact/payment also match, first-party excluded. Vitals56924 newly discovered current paid case has four confirmed lifecycle receipts and a configured team buyer, so it is excluded from independent demand. Two non-reference-identity PAID intent jobs were returned by a cap20 query at13:23:10UTC; this is not an all-chain total. Independent-human paid cases verified here: **UNKNOWN**, not a fabricated positive count.

Negative evidence: first two Plinth IPFS gateways429, third returned verified manifest; historical ownerAtCreate RPC failed, no inference; current Plinth stored quote expired at the dated snapshot; Brain unsigned evidence remains unsigned; no consented new pilot available. Source fixtures cover wrong service/owner/chain/head/asset/policy/budget, quote expiry/access, concurrent/repeated intent and partial setup. These use synthetic actors and mocked chain, not real customers.

## Final checks and browser evidence

```text
Full suite:       58 files passed, 3 gated skipped; 487 passed, 23 skipped
Final selection:  10 files passed; 74 tests passed
Metadata rerun:    5 tests passed (actual 404 assertion retained)
PostgreSQL fixture:8 tests passed
Final build:      exit 0; detached service success/exited
Workspace types:  exit 0 (serial); final Next type validation also passed
Lint:             full/changed source exit 0; final two UI files exit 0
Copy checker:     843 <= 859, exit 0; original checker/baseline unchanged
Caddy protection:11 observed regression outcomes passed
HTTP transport:   4 regression checks passed
```

The final same-source detached build recorded peak2530983936bytes and459.851seconds CPU. The earlier terminal-bound wrapper ended143 after its completed route table; the initiating cause is UNKNOWN. Kernel/OOM and shared-process checks did not establish a production incident. The successful detached rerun preserves the same resource caps and source; no memory-cap increase or unrelated restart was used. Existing optional installed-dependency warnings (MetaMask async storage/pino-pretty/ox-tempo) remain, with no dependency upgrade.

Chromium at390/768/1440 and Day/Night:

- Functional candidate:48 route/context runs across home, both marketplace tabs, two exact outside profiles, quest, builders and historical paid job; HTTP200 rendered pages, no observed console/page errors or horizontal overflow. Only two UI files changed after this build, for observed wording/error display defects.
- Final artifact:12 signed/unsigned quote-sheet cases passed; each requested exact service43279 and quoteAccessVersion2, with mode/unsigned-limit wording and no unproven external free action.
- Final artifact:6 mismatched-service negatives passed the SAME assertion that originally failed; error is visible, rejected quote cannot reach wallet setup, no seller request/wallet transaction. Original six failed reports are retained.
- Final artifact:12 corrected outside-storefront reruns passed, including scoped preview wording, no expired-as-request-failure assertion and no external free links.
- Final artifact:6 actual theme-control/navigation runs passed;54 viewport captures physically scrolled all9home sections, then marketplace -> exact Plinth -> sheet -> Escape, retaining selected service43279. Full-page screenshots alone are insufficient because Chromium can skip offscreen content-visibility paint.
- All6route contact sheets were visually reviewed, plus final mobile storefront/error view, signed desktop/unsigned mobile sheets and actual home viewport. No wallet-connected signing/funding or full paid clickthrough is claimed. Existing P01A tap-target advisories remain; no full accessibility certification.

First final candidate metadata GET:HTTP200/795bytes/0.263400seconds, reporting preflight.version1, observationalOnly=true, sellerRequests=0, service43279, outside freePreview unsupported and dated quote evidence. `/status` separately measured TCP0.000339seconds, first byte0.319683seconds, complete body1.614667seconds/116576bytes/curl exit0. These are candidate samples, not production p95. Builder/owner observational GETs also passed under SELECT-only credentials. Frozen25source files match;286final public JS files scanned with no snapshot credential. Screenshots/raw evidence remain private, outside Git.

## Compatibility, migration and blast radius

Additive existing HTTP routes: optional service selector, versioned metadata diagnostics, opt-in quote access v2, intent wallet field. Legacy agent-only and unversioned quote clients remain accepted; old clients do not gain version-2 privacy. New version-2 rows require their bearer token. Expired/changed-owner/bad-envelope purchases and unreviewed outside free calls intentionally fail closed. No wholesale schema reset, migration, historical proof rewrite or deletion.

Application blast radius: commerce helpers/hook and existing hire routes, marketplace links/free filter, external storefront and hire sheet. Production has not loaded this code. Existing raw quote/notify observations remain append-oriented. Source rollback is the feature-branch revert/baseline checkout; no database rollback is needed. Any later release must run the existing blue/green health/smoke/rollback procedure under separate approval.

## Actor, environment and operations boundaries

Chain evidence is public **BSC mainnet56, read-only**. Fixtures are isolated PostgreSQL and synthetic/offline keys; no genuine provider acceptance, paid testnet call or organic user is inferred. Browser quotes are conspicuously controlled fixtures; metadata/navigation reads use the candidate snapshot. Wallet-connected transaction flow is **NOT executed**; RPC/receipt replay and pure recovery tests are the substitute evidence, with that limitation retained.

Mainnet state changes: **NONE**. Testnet state changes: **NONE**. Production deployment: **NONE**. Git push: **NONE**. Messages to outside operators: **NONE**. Real wallet/session/key access: **NONE**. No SDK/dependency/contract/migration/Caddy/router-state change. Final continuity at16:58:44UTC confirms unchanged shared-service and PM2 PIDs, original tmux present, linger=yes, unchanged production source,26 pre-existing media and matching trusted Caddy mirror. Marque health, Kerb API and Kerb web each returned complete HTTP200 bodies/transport exit0. All candidate preview/browser/build units were stopped and ports3291/3292 are clear.

## Deviations and approval boundary

P02 uses the explicitly permitted AMBER path because consent and human independence cannot be established from addresses/chain alone. Existing settled jobs are reconciled instead of manufacturing another hire. MCP/x402 paid execution remains unsupported rather than guessed; public discovery is not payable capability. Offscreen screenshot paint is handled by actual scroll captures. Existing accessibility advisories are not a full accessibility certification. Browser-only session loss and deliberate duplicate contract submission are outside an exactly-once guarantee.

Owner input still needed to establish who controls the Plinth buyer/Vitals provider and the authenticated provider consent record. This is factual diligence, not another P02 permission request. New mainnet payments/writes and production deployment remain separately gated by root/pack operating instructions. No next prompt phase starts automatically.

## Changed paths

```text
apps/web/app/_components/HireSheet.tsx
apps/web/app/agents/_storefront/Storefront.tsx
apps/web/app/api/v1/hire/agent/route.test.ts
apps/web/app/api/v1/hire/agent/route.ts
apps/web/app/api/v1/hire/intent/route.ts
apps/web/app/api/v1/hire/quote/route.ts
apps/web/app/api/v1/hire/try/route.ts
apps/web/app/register/Marketplace.tsx
apps/web/app/register/exact-service.test.ts
apps/web/app/register/market-model.ts
apps/web/lib/marketplace.ts
docs/phase2/PROJECT_STATE.md
docs/vnext/DEVIATIONS.md
docs/vnext/P02_CHECKPOINT.md
docs/vnext/P02_COMMERCE_EVIDENCE.md
packages/commerce/src/calls.ts
packages/commerce/src/chain.ts
packages/commerce/src/client/useHire.ts
packages/commerce/src/hire-integrity.test.ts
packages/commerce/src/hire-p02.integration.test.ts
packages/commerce/src/hire.ts
packages/commerce/src/identity-fresh.test.ts
packages/commerce/src/notification.test.ts
packages/commerce/src/notification.ts
packages/commerce/src/notify-p02.test.ts
packages/commerce/src/preflight.test.ts
packages/commerce/src/quote.ts
packages/commerce/src/recovery.test.ts
packages/commerce/src/try.ts
```
