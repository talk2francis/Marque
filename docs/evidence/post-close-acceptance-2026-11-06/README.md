# Local acceptance evidence, 6 November 2026

This is a local candidate record, not a deployment receipt. The complete [acceptance report](../../operations/POST_CLOSE_ACCEPTANCE_2026-11-06.md) states scope, retained failures and remaining limits.

| File | Meaning |
| --- | --- |
| [summary.json](summary.json) | Source artifacts, completed test counts, four actual current-state comparisons, original-block replay, exact downloads, recorded Brain profiles and the broad audit's retained warnings. |
| [screens.json](screens.json) | SHA-256 hashes and actual source artifact for 201 privately retained and visually reviewed captures. No images are published here. |
| [audit-review.json](audit-review.json) | The 80-case audit's small-target warnings, external-image failures and direct 404 reads, plus the closed-film contrast classification and opened-content AXE checks. |
| [Final AXE report](../../audit/2026-11-close/candidate.json) | Twenty route/theme checks on the final compiled artifact, with zero violations. |

Runtime artifact: `db6b6ca111d96ade02bf488b04fa5dc8f805272f`. The earlier functional suites use `4fad0b183a0302c295c0e8fab0ffe1e8002e60cc`; the only application difference is the compact marketplace network-count foreground correction. Capture records preserve this distinction. Later documentation commits do not change the compiled runtime.

The ordinary suite passed 1,326 tests with 117 environment-gated skips. Nineteen PostgreSQL checks ran separately against a schema-only fixture database. The final source/build, browser controls, 36 route/width combinations, four smoke routes and nine-wallet campaign guard passed. Passing samples do not establish capacity or successful future third-party deliveries.

The original 15 close files and four sampled original lens rows remain unchanged. Verify the immutable close files with `node scripts/verify-close-record.mjs`, and the conformance source closure with `node scripts/generate-mcs-code-anchor.mjs --check`. Neither command sends a transaction or changes a result.

The failed November capacity measurement, cold/concurrent read timeouts, JavaScript-required streamed shell, small-target warnings, missing external images, unpublished outside observer and missing mainnet registry/gas prerequisite remain explicit limits. No main push, application deployment, production restart or mainnet write accompanies this record.
