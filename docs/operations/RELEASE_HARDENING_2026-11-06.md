# Remaining-limit fixes and release preparation, 6 November 2026

The owner authorized fixes, GitHub publication and production deployment after the earlier local B/C/D acceptance. This document records the follow-up; the [earlier acceptance report](POST_CLOSE_ACCEPTANCE_2026-11-06.md) remains a dated record of the previous candidate.

## Changes being validated

- Concurrent independent Venus reads at one supplied block, shared commitment-verified job answer bytes, independent job-room reads in parallel, and a short bounded FIFO queue for fresh comparisons. The four-second request and one-minute current-state freshness limits remain.
- Public documents without the global streamed loading boundary. The complete server-rendered page must be usable without running React's replacement script; wallet actions keep their existing requirements.
- Usable link/control boxes and wallet fields that retain their height on phones. The audit now checks the visible label of a hidden native checkbox and excludes closed content from visible-text checks, with separate open-content scans.
- Same-origin checked WebP portraits, with guarded original-artwork recovery when the registry image is missing. No identity or observation is rewritten. Two of the three originally missing images have been recovered from their actual declarations. The third declared host times out under both a two-second production read and an eight-second diagnostic read; it retains the labelled platform fallback instead of issuing browser requests for a missing file.
- The prepared outside observer will be published with the release and then verified from an actual GitHub run. Status must continue to show unavailable until real observations can be read.

Focused security, reader, answer-integrity and queue tests passed. Four initial source-level mainnet comparisons returned 200 in 1502/1002/915/1523 ms for grid/HF/V3/yield, respectively. These individual samples do not establish capacity.

The clean pinned candidate `a586a814f30e744edbd24878a9120eaa8c3c7ae2` completed the production build and all 44 static pages, 1,344 ordinary tests with 117 explicit environment-gated skips, all 22 workspace typechecks, lint, copy lint, 34 operations regressions and 31 isolated PostgreSQL checks. Nine compiled public documents and native FAQ interactions passed with JavaScript disabled. The original blank FAQ element capture was retained; computed visibility and the actual viewport capture confirmed the FAQ was readable. It was a capture defect, not an additional application fix.

Readiness passed for both workers, but the first comparison batch still exposed a limit: grid took 3,918 ms and HF returned the existing 503 after 4,151 ms. The failed batch is retained. A safe timing trace found that a comparison loaded the buyer's other hires and rating bindings. The follow-up uses a minimal read-only original-answer projection, starts the committed file, task and current head together, and batches Venus membership and oracle reads at the same block. Twenty-nine focused checks pass, including the new binding and concurrency regressions. Four actual jobs retain exact provider, content hash, response URL, category and submission-transaction parity with the existing full job projection. An individual source HF sample then completed in 2,332 ms; it is not a controlled before/after benchmark. Final compiled acceptance and rollout are still pending at this checkpoint.

## Boundaries and prerequisites

The first guarded candidate load stopped at 25 virtual users: page p95 was 3.18 s, API p95 11.14 s, and one of twelve recorded error samples was a 5xx. Higher stages were not run. A separate fully cold comparison exceeded the client's twelve-second transport deadline. These failures remain in the private acceptance receipts; they are not a capacity claim.

Follow-up changes retain sixteen exact owner-selection memos instead of one competing slot, coalesce each selection independently, and pass the job already read by the page into its answer view. A separate `/api/ready` initializes the read modules without sending a task. The deploy guard requires two distinct initialized workers; `/api/health` keeps its liveness meaning. Startup warm reads run sequentially. The outside log reader retains the monthly append-only format with an eight-MiB cap, sufficient for the scheduled six-route observations through a full month.

The refreshed 48-file conformance implementation fingerprint is `0xee74a1285f3e7d6400dc910c43df40c8c03c878d51edd9a1b3590d1a2b4152ad`. It describes the changed read ordering and existing explicit image dependency. Arithmetic, tolerances and previously issued result fingerprints are preserved.

Buyer payment/signing handlers, campaign count definitions and original results remain frozen. The original 15-file close checksum still verifies. The actual testnet anchor is retained and is never resent. A mainnet anchor still lacks an existing verified destination and exact simulation; website release authorization does not authorize that transaction. An address question is pending while the website work proceeds.

Historical badges or private Bench attempts that were never recorded cannot be reconstructed reliably. Existing missing history stays explicitly unknown. No historical observation is fabricated to remove that limit.

No release or supported current visitor count is claimed until its actual checks complete. Deployment uses the existing prepared-artifact blue-green verifier, campaign guard and rollback path. The README, status evidence and changelog will be updated from the completed receipts.

## 7 November read-budget and audit follow-up

Serialized compiled acceptance still reached the comparison guard for HF after 3,903 ms. The shared pool allowed four seconds for one provider, which could exhaust the comparison's entire deadline before failover. The follow-up isolates current comparisons in a read-only client with the same configured URLs and a 750 ms per-provider timeout. A regression uses the real pool with a hanging provider, verifies failover and the original block parameter, and rejects transaction submission before any HTTP call. Supplied-answer replay now uses the minimal exact original-job binding instead of the buyer's full job/rating history. Its original block and grading rules are unchanged. Twenty-six focused checks passed, including the yield reader's required gas-price read. Four source-level comparisons then returned 200 in 1,302/1,027/1,207/800 ms for grid/HF/V3/yield. These individual samples are not a capacity result; new compiled acceptance remains required.

The visual audit retained 77 first passes and three failed cases. One Forge failure was a chunk-load exception after the private test adapter returned 502 for two JavaScript files. Production Caddy serves static files directly; the corrected adapter does too. Both files then returned 200 with exact artifact hashes, and all three scoped retakes passed under the original navigation deadline. Original reports and failed screenshots remain archived. The audit command now records each case incrementally, includes its theme on navigation failure, and exits unsuccessfully on broken documents or runtime errors. Heuristic-only warnings remain separately reviewable. A separate query-plan diagnostic emitted no JIT section, so no JIT or database setting was changed.

## 7 November Ledger regression

The owner reported that four previously complete ADV comparisons appeared incomplete. Live inspection found ADV-02 and ADV-04 complete; ADV-01 and ADV-03 failed only the task-hash binding. All four selected manifests in each affected benchmark match its original task at block 120123441 (ADV-01) or 120077706 (ADV-03), with matching input/rubric hashes and original blind grades. The later raw registration used block 126580730 or 126570170, respectively. Public reproduction incorrectly called the registration upsert.

The fix prevents that write and exposes a strict verified-original-task recovery in the read view, including both hashes and blocks. Incomplete evidence still fails completion. It does not regrade, improve an agent's score, rewrite the original records or promise a TermiX result. Focused regression and live read-only verification are recorded with final acceptance.
