# P05 checkpoint, 17 October 2026

Status: AMBER. Candidate implementation and reproducible historical MCS replay are complete; an independent new operator exact-service Warrant and historical issuer/source provenance are not demonstrated. All scoped source checks and the combined browser matrix pass. Existing inline tap-size advisories and unproved legacy provenance remain explicit.

Baseline: `4ff09d0ae114e080408c785f524932df7c12abfc`. Feature branch: `repair/vnext-v3-p05-20261017`. Tested candidate source: `403d218924f784610ae02b07d08667ce5af498f2`. This checkpoint is an evidence-only follow-up; no runtime file changed after that source commit. Production remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`.

## Existing functionality reused and actual change

Reused all four deterministic MCS graders, live input readers, frozen case/result rows, current adapter transports, owner/task-consent gates, published tolerances and existing test/listing/commerce projections. Added bounded offline replay, frozen-case/service/invocation/source commitments for future consented tests, public commitment-only reads, owner-returned portable bundles and truthful historical test-pass wording. No new escrow, dashboard, signer, dependency, SQL migration or paid task. Listing and hireability remain separate. Tidemark yield accounting and MCS tolerances/math are unchanged.

The new source manifest covers 41 implementation/lockfile inputs and is a SHA-256 source content commitment, not a chain anchor, signature, compiled-build identity or trust score. `generate-mcs-code-anchor.mjs --check` detects drift. Historical receipt versions 1/2 and sealed-call hashes retain their domains/vectors. See [contract](P05_WARRANT_CONTRACT.md).

## Observed metrics and negative evidence

Read-only production snapshots captured 12 real stored rows across the four categories. The same `verifyWarrantBundle` replay agrees with all 12 original verdicts/diffs/failed fields: four passes (14756-14759), four error-free failed answers (15089-15092), four protocol failures (15109-15112). Legacy code/service binding remains UNAVAILABLE; agreement is current-checker replay, never retroactive original-build proof. Four first-party identities and eight other identity IDs are not evidence of eight independent people. No observation was overwritten.

Fresh `observeCase` reads without a database, archive credentials or agent invocation covered REB/HF/GRID/YIELD. At 04:11:08-04:11:12 UTC eth_chainId was explicitly 56; source blocks were 128104084, 128104086, 128104088 and 128104088. Durations 1529/896/366/726 ms describe these individual reads only. These are four input observations, not four new agent passes or hires. Current source/actor/funding independence and new outside-operator Warrant acceptance remain UNKNOWN.

Tests reject mutated bundle/request/response/input bytes, wrong selected identity/service, fabricated pass/diffs, stale input, expired/future result, unsupported code, invalid/large JSON and malformed public metadata. Stale input causes no agent task. Protocol failures do not become arithmetic failures. Public result reads redact raw request/response, endpoint URLs and private errors; original row commitments can be compared independently. Hashes can be self-consistently fabricated, so inspectors must compare trusted external record/code/service references.

## Verification

Final frozen source manifest: `0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433`, 41 source/lockfile inputs. Final source-drift and manifest checks pass.

```text
node scripts/generate-mcs-code-anchor.mjs --check: exit 0
pnpm exec vitest run --maxWorkers=1 --minWorkers=1:
  Test Files 66 passed | 4 skipped (70)
  Tests 568 passed | 37 skipped (605); Vitest 230.30 s
pnpm -r --workspace-concurrency=1 typecheck: exit 0, 855.09 s
MARQUE_BUILD_DIR=.next-p05 pnpm --filter @marque/web build: exit 0, 896.09 s
restore generated Next tsconfig/next-env references: exit 0
pnpm lint: exit 0, 84.39 s
pnpm lint:copy: exit 0; 842 pre-existing em/en dashes, unchanged allowance 859
bash ops/http-health.test.sh: 4 regression checks passed
BASE_URL=http://127.0.0.1:3292 node scripts/incident-request-check.mjs: 11 passed
```

The initial full test run passed; its subsequent type check caught an optional-policy TypeScript error. It was corrected before the final source commit and source manifest regeneration; the full final suite/types/build/lint above all pass. The 37 environment-gated skips are not claimed as executed integration tests.

Real Chromium checked 12 routes at 390/768/1440 in day/night: home, Register, exact reference/external profiles, Standard, all four MCS standards, docs, FAQ and Why. Final combined matrix: **72/72**, no console/page errors, bad local responses or horizontal overflow. Actual interactions include FAQ search, scrolling to evidence sections, checking rendered historical pass/fail wording, and reading the code-reference GET; no wallet/signature or task/publication click is claimed. Six additional focused home checks pass.

Original matrix exit 1 is retained: four mobile/tablet home selectors chose a deliberately hidden duplicate callout; two long full-page PNG exports timed out. With the source/build unchanged, all six were replayed using the visible record section and bounded viewport captures, retaining the same API/console/overflow/claim checks. Original and replay reports/screenshots are linked by key in private browser-final-report.json; no failed evidence was removed. This is not a performance-speedup claim.

Stock audit algorithms and thresholds are unchanged; its private adapter changes only local Playwright/output paths, preserves prior evidence and uses viewport screenshots after the long-export issue. 24 route/width combinations completed, exit 0; no contrast, missing-alt, console, page or overflow finding. Twenty combinations retain small inline tap-target advisories; one /why1440 first-tab sample reported no focused element. Independent day/night keyboard replay reached Skip to content, brand and Marketplace with visible 2 px outlines in both themes, 76 links present; the initial transient focus result was not reproduced. These heuristics are not a full accessibility certification.

Screenshots were actually inspected: mobile home record/day and hero/night, night Standard/mobile, day FAQ/tablet search, reference verification/night tablet, external failure/day mobile, Standard/day desktop, desktop night record and visible keyboard focus. Fonts, art and layout tokens remain. Dated candidate counts come from the existing SELECT-only snapshot, not current production population.

Real candidate GET /api/v1/conformance/14402: HTTP200, 0.084245 s, 951 bytes; version1, recordedPass=false, sampleSize1, replay NOT_PERFORMED, independence UNKNOWN, payment NOT_CLAIMED. No raw request/response/endpoint/error property. Missing snapshot result1 returned404. Browser code GET returned the exact source manifest above. A scan of all 289 client JavaScript files found neither the private snapshot database URI nor its password.

## Compatibility, operational scope and rollback

Existing builder POST responses add `warrant`; existing fields and explicit task consent/owner authorization remain. Public GET conformance record/code endpoints are version 1; no-store and bounded record reads. Legacy marketplace `warranted` field/filter enums retain historical semantics; visible labels no longer imply exact-service binding. No destructive or additive migration, SDK bump, lockfile change or history rewrite. No old row acquires new proof.

No mainnet or testnet state change, paid external task, wallet/signature, key access, production deployment, Git push or external message. Existing production workers continued autonomously. Shared product services, proxy router-state protection and monitoring are preserved. Candidate preview uses only a SELECT-only snapshot and blocks non-read methods; anonymous task/publication flows are never executed for screenshots.

Closing continuity at **2026-10-17T05:18:51.343497+00:00**: shared-service and PM2 process identities unchanged, original tmux present, Linger=yes, trusted Caddy mirror matches, production tracked source unchanged and its 26 pre-existing untracked media files preserved. Complete body samples: Marque HTTP200/0.575395s/66bytes/ok=true; Kerb API HTTP200/8.987661s/306bytes/status=ok; Kerb web HTTP200/0.906287s/225063bytes/complete HTML. These are individual health samples, not uptime, latency-distribution or browser certification for Kerb.

Only own P05 preview/proxy was stopped; its loopback ports3291/3292 are clear. Browser/validation helpers completed. Artifacts and all original failure logs remain private. No production/shared service restart occurred. P06 independent source preparation and validation continued in a second worktree after P04 receipt prerequisites and P05 full tests passed; the approved batch permits this overlap and P05 was kept frozen.

Blast radius: future MCS evidence and case-age classification, public commitment metadata and test-pass copy. Existing custom worker adapters without invocation metadata remain unbound. Source rollback to P04 requires no DB rollback/deletion. See deviations for legacy binding/source/transport/independence limits and the extracted shared JSON guard.

Owner approval needed for this batch: NONE. P06 and P07 were explicitly approved, and follow each local checkpoint without seeking permission again. Production release, paid/mainnet actions and authority changes remain separately gated. No P08 authorization is inferred.

## Changed paths

```text
apps/web/app/_components/market/AgentCard.tsx
apps/web/app/_components/ui/Badge.tsx
apps/web/app/agents/_storefront/Storefront.tsx
apps/web/app/api/v1/builders/claim/test/route.ts
apps/web/app/api/v1/builders/test/route.ts
apps/web/app/api/v1/conformance/[id]/route.test.ts
apps/web/app/api/v1/conformance/[id]/route.ts
apps/web/app/api/v1/conformance/code/route.ts
apps/web/app/docs/faq/faq.ts
apps/web/app/docs/page.tsx
apps/web/app/page.tsx
apps/web/app/register/MarketFilters.tsx
apps/web/app/register/market-model.ts
apps/web/app/standard/page.tsx
apps/web/app/why/page.tsx
apps/web/lib/builder-task-boundary.test.ts
apps/worker/src/conform.ts
docs/ARCHITECTURE.md
docs/DEVIATIONS.md
docs/phase2/PROJECT_STATE.md
docs/vnext/CAPABILITY_INVENTORY.md
docs/vnext/DEVIATIONS.md
docs/vnext/FACT_CONFLICTS.md
docs/vnext/IMPLEMENTATION_GRAPH.md
docs/vnext/P05_WARRANT_CONTRACT.md
packages/conformance/src/adapters.ts
packages/conformance/src/code-anchor.ts
packages/conformance/src/harness-binding.test.ts
packages/conformance/src/harness.ts
packages/conformance/src/hash.ts
packages/conformance/src/index.ts
packages/conformance/src/portable.test.ts
packages/conformance/src/portable.ts
packages/conformance/src/types.ts
packages/conformance/src/warrant-contract.ts
packages/execution/src/receipt-integrity.ts
packages/probe/src/bounded-json.ts
packages/probe/src/index.ts
packages/ui/src/components/primitives.tsx
scripts/generate-mcs-code-anchor.mjs
scripts/verify-warrant.mts
```

Raw production snapshots, case bundles, RPC observations, screenshots, credentials and detailed validation logs remain outside Git under `/root/.marque/private/vnext-p05-20261017`. No uploaded strategy pack or private task content is committed.
