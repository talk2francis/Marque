# P01 checkpoint

Phase status: **AMBER, review checkpoint reached**. Source/operational work and scoped validation are complete. Known P01A integrity defects and advisory tap-size findings prevent an unrestricted success/release claim. P01A and P02 are not started.

## Scope and baseline

Application baseline and unchanged production release: `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Documentation baseline: `162e3185da432cb138846551325d7f94a0f88be8`. Candidate branch: `repair/vnext-v3-p01-20261016`, isolated worktree `/root/marque-vnext-p01`. Final candidate SHA is recorded in the delivery report and local git history; nothing is pushed.

Reused: existing seller/quote tables, service identity filters, probe scheduler, first-party config, all four category readers and MCS engines, buyer-wallet calls, quest/state/ratings projections, native PostgreSQL, cache helper, themes/artwork, claim rails, Caddy router-state mirror and health transport tests. No new marketplace framework, escrow, signer, contract or authority model.

Changes: exact-seller reads are filtered before global work and bounded in read-only SQL transactions; metadata/UI timeouts and retry; cache age/stale headers with unchanged JSON bodies; quest freshness and funded/submitted/completed/payment-release labels; official/local campaign distinction; operator grouping disclaimer; scoped conformance wording. See [query plan](P01_QUERY_PLAN.md), [campaign crosswalk](P01_CAMPAIGN_CROSSWALK.md), [operations](P01_OPERATIONS.md) and [support](P01_SUPPORT.md).

## Measured evidence

- Before: P00 exact metadata HTTP timeout after 60.061563 seconds, no headers/body; active global queries over 80 seconds; six hire-sheet loading failures. These dated measurements are not current traffic percentiles.
- After: one bounded, read-only identity-only candidate SELECT returned the correct outside seller in 1.929 ms execution / 3.704 ms planning. No production endpoint speedup is claimed before release. Planner costs decreased from 397894.98 global to 62.88 identity-only; costs are not time measurements.
- Isolated selected-row snapshot: all 8 candidate/service and stored-state comparisons match the existing global result; wrong service/identity rejected. Read-only role has no listing INSERT permission.
- Negative integration: an exclusive lock on the isolated snapshot's agent table produced SQL 55P03 in 1287.996 ms including driver setup. Temporary lock rolled back. No production locking or SQL mutation.
- Six reference sellers' newest stored probe quotes were all successful/signed at 05:41 UTC; prices expired 05:45-05:50 UTC. That historical health observation does not extend quote validity. No manual quote/task call was made.
- Root session safeguards: Linger no -> yes; installed narrow needrestart restart deferrals; no services restarted and recorded PIDs identical around the change. Later Marque liveness and Kerb web/API read checks succeeded. This does not guarantee future survival of explicit termination, OOM or host failure.
- Proxy asset failures: logged upstream TCP resets correlate with the P00 502s. Initiating cause UNKNOWN; one later CSS HEAD succeeded. No speculative proxy transport change.

## Checks

- `pnpm exec vitest run --maxWorkers=1 --minWorkers=1`: 49 files passed, 1 skipped; 426 tests passed, 3 skipped; 227.69 seconds. Four new test files add 14 tests. Network smoke tests remain deliberately gated.
- `pnpm -r --workspace-concurrency=1 typecheck`: exit 0; final commerce typecheck including the new quest regression: exit 0.
- `pnpm lint`: exit 0; targeted checks cover the final operator-copy files.
- `pnpm lint:copy`: host rerun passed, 843 historical dashes against baseline allowance 859. Sandbox attempt failed on child git EPERM; baseline was not weakened.
- `bash ops/http-health.test.sh`: 4 regression checks passed, including HTTP 200 plus failed body transport.
- Final Next production build: exit 0, including its type validation; standalone preview ran with static/public/standard assets copied. Installed-dependency warnings are retained in the private logs. Generated next-env reference restored; frozen source fingerprints matched; no candidate DB credential appeared in 286 public JavaScript files.
- `BASE_URL=http://127.0.0.1:3292 node scripts/incident-request-check.mjs`: 11 passed, including malformed/spoofed router-state and control-byte requests. Production's trusted-header route matched the template at port 3201.
- Real Chromium: 66 unique route/viewport/theme combinations (11 routes, 390/768/1440, Day/Night), all HTTP 200 with completed bodies; zero console errors, page exceptions, bad responses or overflow. Six wallet-selection modals opened, no wallet connected/signed. Six real theme-control -> marketplace link -> exact Plinth profile -> hire-sheet loads and Escape closes passed. No quote/try/publish POST or wallet transaction clickthrough.
- Deliberate browser transport fault: recovery visible at 17.055 seconds from initial navigation (15 second fetch deadline after hydration), second metadata attempt recovered the exact seller, Escape closed; simulated stale transport headers produced the quest warning. These are controlled failures, not production incidents.
- Candidate read sample: exact metadata HTTP 200, TCP 0.000608 s, first byte 0.840097 s, complete body 0.841011 s / 455 bytes / curl exit 0. Status HTTP 200, TCP 0.000271 s, first byte 0.147860 s, complete body 1.216322 s / 116442 bytes / curl exit 0. Selected-row staging timings do not establish production latency or p95 (UNKNOWN).
- Required `scripts/audit.mjs`: 24 route/width cases at 390/768/1024/1440. No HTTP/console/page/overflow/contrast/focus-ring issues. 20/24 flagged the simple under-24px tap-size heuristic, including inline body links and existing small controls. This is not a clean accessibility audit. Inline links have an [official WCAG exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); full spacing/exception conformance was not certified or silently waived.
- Visual review: six contact sheets covering all 66 captures, plus full mobile builder/quest and timeout/retry/hire captures inspected. Screenshots and raw reports remain private at `/root/.marque/private/vnext-p01-20261016`; no screenshots or uploaded pack are committed.
- Final continuity: all recorded PM2 applications, five shared/user-manager service PIDs and original tmux server/pane unchanged. Linger=yes; Marque and Kerb health HTTP 200 with complete bodies. Active production/source SHA still 97ef4c7; original tracked source unchanged and 23 pre-existing untracked files preserved. Temporary preview stopped and snapshot connections closed.

## Boundaries and remaining gates

Chains/environment: BSC 56 read-only observations; historical BSC testnet 97 funding/refund receipts independently read from public RPC. Testnet job 1350's funding and refund receipts both succeeded with equal raw amount 10000000000000000. The buyer is a known team test wallet. No new wallet, signature, paid task, approval or transaction. Different addresses do not establish independent people/funding. New independent human smoke approval is UNKNOWN.

Mainnet state changes: NONE. Production application deployment: NONE. Approved live operations changes: session persistence and shared-service restart policy only. Existing Marque/Kerb code, release pointers, processes, Caddy routes, databases and workers are not deployed/restarted by this work.

API compatibility/migration: Phase2 JSON bodies and existing quest flags are preserved. Cache provenance headers are additive, exposed through CORS; stale responses are no-store. Public endpoints and SDK versions unchanged. SQL filters are optional internal arguments. No migrations or schema reset, no production rows deleted or rewritten. A separate small snapshot database/SELECT-only role is private validation infrastructure.

P01A remains required for expired/overlong unsigned quotes, signed-expiry agreement, cached quote validity and signed/unsigned claims; both builder GET writers, canonical identity/fresh-owner publication/idempotency; hostile metadata validation and listing/MCS distinctions. Those source defects are not claimed fixed by this phase. Global discovery performance and the initiating upstream reset cause remain separate measured operating risks. Do not release this candidate or begin P02 on the strength of P01 alone.

Rollback: candidate has no traffic; production remains at its baseline release. Host safeguard rollback and the deferred daemon-patch maintenance obligation are documented in P01_OPERATIONS. First-party evidence is preserved. Preview/snapshot data is not public marketplace evidence.

Owner approval needed: review P01, authorize P01A explicitly before its implementation. A production release and any mainnet write keep their separate gates. No automatic next phase.

Additional observed P01A UI repair: the now-loadable outside Plinth sheet still says every quote is signed and displays Bound-specific rebalancing help. Exact evidence: HireSheet.tsx price copy and TaskForm.tsx rebalancing help. The actual selected agent/service remains Plinth; no quote or transaction was invoked. Remove these unproven guarantees/name assumptions in the next approved integrity phase. Initial immediate Escape visibility samples were replaced by a bounded wait for the close transition; all six final interaction runs closed successfully.


## Deviations and proof limits

P01 is the stopping boundary requested by the owner; P01A implementation awaits the next approval. Quote probes were already healthy, so worker/cadence restarts are SKIPPED. New fund/refund writes are SKIPPED because historical receipts plus deterministic calldata/state tests cover this phase safely. No global query rewrite, index migration, protocol/SDK upgrade, design regeneration or production rollout.

Browser data is an explicitly limited real-row snapshot, not a full population or organic usage test. Full wallet signing/payment and independent human acceptance are UNKNOWN. Tap-size heuristics remain advisory findings for targeted review. The preview's initial new root Caddy autosave was retained privately and state paths isolated; production Caddy's account/config/PID were unaffected. A copy-lint sandbox spawn failure was resolved with a read-only host rerun. Final source edits required a final incremental build, whose compiled text and source fingerprint were checked.


## Changed paths

- `apps/web/app/_components/CampaignNotice.module.css`
- `apps/web/app/_components/CampaignNotice.tsx`
- `apps/web/app/_components/HireSheet.tsx`
- `apps/web/app/_components/shell/useQuest.ts`
- `apps/web/app/api/v1/hire/agent/route.test.ts`
- `apps/web/app/api/v1/hire/agent/route.ts`
- `apps/web/app/builders/BuilderChecklist.tsx`
- `apps/web/app/builders/page.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/quest/QuestView.tsx`
- `apps/web/app/quest/page.tsx`
- `apps/web/app/register/Marketplace.tsx`
- `apps/web/app/register/[category]/page.tsx`
- `apps/web/app/register/page.tsx`
- `apps/web/app/status/page.tsx`
- `apps/web/lib/campaign-rules.ts`
- `apps/web/lib/phase2-api.test.ts`
- `apps/web/lib/phase2-api.ts`
- `docs/phase2/PROJECT_STATE.md`
- `docs/vnext/DEVIATIONS.md`
- `docs/vnext/P01_CAMPAIGN_CROSSWALK.md`
- `docs/vnext/P01_CHECKPOINT.md`
- `docs/vnext/P01_OPERATIONS.md`
- `docs/vnext/P01_QUERY_PLAN.md`
- `docs/vnext/P01_SUPPORT.md`
- `docs/vnext/PROJECT_STATE.md`
- `packages/commerce/src/hire.ts`
- `packages/commerce/src/quest.test.ts`
- `packages/commerce/src/supply-scope.test.ts`
- `packages/commerce/src/supply.ts`
