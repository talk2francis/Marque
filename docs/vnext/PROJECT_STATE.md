# P00 checkpoint

Status: **AMBER, audit complete enough for review; implementation and release blocked on A0 findings. STOP.**

## Baseline and candidate

Application SHA: `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`, unchanged. Active release short SHA is `97ef4c7`. Local branch: `audit/vnext-v3-p00-20261016`; separate worktree `/root/marque-vnext-p00`. Documentation candidate commit is reported at delivery. No remote branch was created or pushed.

Reused: current registry and canonical IDs, safeFetch, all four category readers/MCS engines, quote and buyer-wallet commerce, exact approvals, job state projection, ratings, builder claim rail, receipt v1/v2 canonicalizer, Ledger, charter sandbox, proxy/deploy/monitor/backup system. No replacement subsystem was built.

Changed paths: `docs/vnext/*` audit documents and the short P00 entry in `docs/phase2/PROJECT_STATE.md`. No application, worker, contract, asset, configuration or migration file changed. Raw tests/screenshots/competitive material stay private off-repo.

## Actual validation

| Command or check | Observed result |
|---|---|
| `pnpm exec vitest run --maxWorkers=1 --minWorkers=1` | 45 test files passed, 1 skipped; 412 tests passed, 3 skipped; 176.70 s. Network smoke explicitly remains skipped. |
| `pnpm -r --workspace-concurrency=1 typecheck` | Exit 0, serial low-priority run, 897.29 s. |
| `pnpm lint` | Exit 0, 111.11 s, zero warnings allowed. |
| `pnpm lint:copy` | Initial sandbox child `git` EPERM; host rerun PASS: 844 em/en dashes in historical scope, baseline permits 859. No baseline update. |
| `bash ops/http-health.test.sh` | Four cases passed, including HTTP 200 plus transport exit 28. |
| `BASE_URL=https://marque.trade node scripts/incident-request-check.mjs` | 11 cases passed: normal/valid RSC 200; malformed/spoofed/unsupported/control-byte paths 400. |
| Private source probes | 12 passed by asserting current behavior. Expired unsigned acceptance, signed expiry disagreement, cached expired-ready state, wrong identity claim and malformed metadata reproduced. These demonstrate defects, NOT successful repairs. |
| Chromium, no wallet, three widths/two themes | 60 route cases; 59 completed HTTP 200, one charter navigation timeout; 3 CSS/font 502 console errors, zero page exceptions. Five wallet selection modals opened; no connection/signature. |
| Real UI interactions | Six theme-control and marketplace-to-exact-agent link sequences worked; six hire-sheet content assertions failed on a loading skeleton. No successful full quote/hire journey claimed. |
| Protocol evidence | Live view calls/code hashes on chains 56/97; 112 generated ABI entries match official source subset. Explorer verified-build link UNKNOWN. |
| Historical job proof | Eight successful receipts across jobs 56916/56903 independently decoded; funding, submission, completion and PaymentReleased agree with API. |
| Receipt digest | Public v2 receipt independently reproduces SHA-256; tampering and key-order fixtures checked. Anchor confirmation not repeated. |
| Migration journal | All 20 source hashes match live journal. No migration run. |

Real observed metric: Plinth metadata TCP connected but produced no HTTP response/body within 60.061563 seconds; seller-candidate SQL sampled at up to 80.40 seconds with I/O/buffer waits. The public ready snapshot has 26 identities, of which 21 signed and 5 unsigned. Neither sample is a performance percentile or independent-user count.

Negative cases: unsupported provider/token/chain/escrow still rejected in isolated tests; current expired quotes and wrong-identity claim accepted under the reproduced defects. Public malformed RSC correctly rejected. A missing/failed MCS does not become Warranted through a paid job or digest match.

Chain/environment/actors: mainnet 56 and testnet 97 read only; synthetic local keys used only for mocked signature tests; no browser wallet connected. Historical buyers are non-team-listed addresses, not verified unrelated people. No new provider consent or buyer-funding independence established.

Mainnet state changes initiated: **NONE**. Testnet writes: **NONE**. Production deployment/reload/restart: **NONE**. Existing keeper and products continued independently; their activity is not audit-initiated activity.

API compatibility: unchanged responses; shape samples are observations, not a new normative schema. Additive verification/freshness/funded/paid semantics need explicit compatibility work in P01A. Database migration: **NONE**. Historical observations and hashes preserved.

Screenshots: private `browser/` full-page captures plus six contact sheets and interaction-failure captures. Visual review includes no-wallet pages, outside Plinth profile/paid job, receipt, status and wallet selection. Actual wallet approval/funding/refund and new external task calls were not attempted. One general-font 502 and profile CSS/font 502 are retained as failures.

The CSS failure visibly broke the 768px night profile layout. The first 390px day quest capture lacked its checklist, and some status captures displayed a dependency-timeout warning. HTTP 200 alone was not accepted as a pass. After probing stopped, a final read-only DB sample returned no active Marque queries, existing inspected Marque/Kerb web and PM2 PIDs were unchanged, and Caddy/Postgres/Redis/PM2 were active.

Deviations: see [DEVIATIONS.md](DEVIATIONS.md), including discovered owner-GET mutation call site, source-only integration gaps, unavailable original V1 zip, external verified-source access limits, skipped private archive probe and read-only production load limits.

Owner decisions: review the findings; authorize the next bounded P01/P01A branch work. Tmux lifetime protection and shared-service maintenance policy have a concrete private proposal and are not applied under P00. Production release and any mainnet write remain separate approvals. The root agreement requires explicit `approved, mainnet` for the latter.

Next: resolve the measured A0 operating blocker and exact quote/listing authorization defects before any new commercial feature. P02 should reconcile existing Plinth proof before proposing another hire. Do not automatically continue to P01/P01A/P02/P03.
