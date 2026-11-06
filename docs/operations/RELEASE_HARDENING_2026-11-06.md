# Remaining-limit fixes and release preparation, 6 November 2026

The owner authorized fixes, GitHub publication and production deployment after the earlier local B/C/D acceptance. This document records the follow-up; the [earlier acceptance report](POST_CLOSE_ACCEPTANCE_2026-11-06.md) remains a dated record of the previous candidate.

## Changes being validated

- Concurrent independent Venus reads at one supplied block, shared commitment-verified job answer bytes, independent job-room reads in parallel, and a short bounded FIFO queue for fresh comparisons. The four-second request and one-minute current-state freshness limits remain.
- Public documents without the global streamed loading boundary. The complete server-rendered page must be usable without running React's replacement script; wallet actions keep their existing requirements.
- Usable link/control boxes and wallet fields that retain their height on phones. The audit now checks the visible label of a hidden native checkbox and excludes closed content from visible-text checks, with separate open-content scans.
- Same-origin checked WebP portraits, with guarded original-artwork recovery when the registry image is missing. No identity or observation is rewritten. Two of the three originally missing images have been recovered from their actual declarations. The third declared host times out under both a two-second production read and an eight-second diagnostic read; it retains the labelled platform fallback instead of issuing browser requests for a missing file.
- The prepared outside observer will be published with the release and then verified from an actual GitHub run. Status must continue to show unavailable until real observations can be read.

Focused security, reader, answer-integrity and queue tests passed. Four source-level mainnet comparisons returned 200 in 1502/1002/915/1523 ms for grid/HF/V3/yield, respectively. These are individual source checks, not compiled-browser or capacity acceptance. Full build, browser and load evidence is pending.

## Boundaries and prerequisites

The first guarded candidate load stopped at 25 virtual users: page p95 was 3.18 s, API p95 11.14 s, and one of twelve recorded error samples was a 5xx. Higher stages were not run. A separate fully cold comparison exceeded the client's twelve-second transport deadline. These failures remain in the private acceptance receipts; they are not a capacity claim.

Follow-up changes retain sixteen exact owner-selection memos instead of one competing slot, coalesce each selection independently, and pass the job already read by the page into its answer view. A separate `/api/ready` initializes the read modules without sending a task. The deploy guard requires two distinct initialized workers; `/api/health` keeps its liveness meaning. Startup warm reads run sequentially. The outside log reader retains the monthly append-only format with an eight-MiB cap, sufficient for the scheduled six-route observations through a full month.

Buyer payment/signing handlers, campaign count definitions and original results remain frozen. The original 15-file close checksum still verifies. The actual testnet anchor is retained and is never resent. A mainnet anchor still lacks an existing verified destination and exact simulation; website release authorization does not authorize that transaction. An address question is pending while the website work proceeds.

Historical badges or private Bench attempts that were never recorded cannot be reconstructed reliably. Existing missing history stays explicitly unknown. No historical observation is fabricated to remove that limit.

No release or supported current visitor count is claimed until its actual checks complete. Deployment uses the existing prepared-artifact blue-green verifier, campaign guard and rollback path. The README, status evidence and changelog will be updated from the completed receipts.
