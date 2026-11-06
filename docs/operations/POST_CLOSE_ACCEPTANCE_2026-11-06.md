# Local candidate acceptance, 6 November 2026

This batch is local and has not been pushed or deployed. The production-format runtime artifact is `4fad0b183a0302c295c0e8fab0ffe1e8002e60cc`; later verifier and documentation changes do not alter that compiled application. The live release is `0e9f5c59444a0036a05f0f9e0d0bf742864abdbf`. Final browser checks are still being completed; the table below distinguishes completed checks from pending ones.

## Product changes

- B: dated September and November capacity evidence on Status and Adopt, a corrected load-run stop guard, an outside-check workflow prepared for later publication, security.txt, private vulnerability reporting and validated OpenAPI 3.1.
- C: the original close record and downloads, its checksum verifier, an actual BSC testnet anchor and unsigned mainnet preparation. No mainnet anchor was sent.
- D: Today/Positions/Jobs/Money, Agents/Bench/Demand, current-state comparisons of recorded answers, six-step agent evidence, private quote outcomes and consented supplied-answer replay. Existing financial actions remain unchanged.
- Presentation: the existing 14-day test validity is used consistently, all campaign agents remain in the full directory while Forge shows three linked examples, and the home FAQ uses a compact sage section.

See [workspace scope](POST_CLOSE_WORKSPACE.md), [presentation scope](POST_CLOSE_PRESENTATION.md), [capacity and operations](POST_CLOSE_STATUS.md) and [mainnet prerequisite](CLOSE_MAINNET_ANCHOR.md).

## Validation

| Check | Evidence and outcome |
| --- | --- |
| Source checks | All 22 workspace typechecks passed; final web typecheck, lint and copy lint passed. The verifier maintenance change has its own clean lint result. |
| Ordinary test suite | 167 files passed, 18 environment-gated files skipped; 1,326 tests passed and 117 skipped. The earlier command-session interruption is retained separately and is not counted as a completed run. |
| Isolated PostgreSQL checks | Three new projection tests and 16 existing seller/privacy tests passed against a schema-only fixture database. No production rows were inserted for these tests. |
| Runtime build | Next.js compilation, type validation, all 44 static pages and standalone assembly completed successfully from the clean pinned runtime commit. |
| Four live read-only comparisons | Grid 57125, HF 57185, V3 57121 and yield 56982 returned 200 with 1, 3, 3 and 2 comparison rows, in 2,225, 735, 722 and 651 ms respectively after the standard candidate warm-up. Individual samples are not a capacity result. |
| Supplied-answer replay | The verified original answer for job 57185 returned three matching checks at its original block 131771231. Consent rejection returned 428; a contradictory declared block returned 422. No agent endpoint task or payment was started. |
| Original results | Row-version and full-row fingerprints of all four sampled original lens records were identical before and after comparison/replay. The 15 checksummed close files and 48-file conformance source fingerprint also verify. |
| Presentation browser checks | All six combinations of 390/768/1440 and Night/Day passed: accordion, keyboard, hash landing, malformed hash, compact Forge showcase, retained campaign directory and recorded Brain test label. No runtime error or unexpected write. |
| Control browser checks | Explicit HF recheck and lazily opened watched positions passed at all six sizes/themes. Read time, block, alert line and displayed HF matched actual responses. Public Marque Pass metadata opened Jobs and Money without a credential request or application error. |
| Workspace, routes and downloads | Pending final compiled acceptance. |
| Accessibility and screenshot audit | The complete 20-case scan on runtime 4fad0b1 found one serious Day contrast issue affecting two compact network-count badges. The scoped secondary-ink correction is prepared; its fresh compiled build and final audit are pending. All other scanned route/theme combinations had no serious or critical issue. |
| Campaign guard and film | Live nine-wallet guard passed with zero eligibility changes. Film verification passed against the existing files and public HTTP delivery, including byte ranges. Candidate guard pending. |

## Limits and retained failures

The first API call immediately after the new process reported ready exceeded the test client's 12-second timeout. After the repository's existing runtime-projection warm-up protocol, all four comparisons passed. The failed cold-start log is preserved. The route's four-second comparison deadline was not increased. This does not establish cold-start or concurrent-user capacity.

A subsequent repeated HF browser comparison reached the four-second guard and returned 503 while two browser runs were active. That failure is also retained. The guard preserves the original answer rather than substituting a value. Browser acceptance was then serialized on the shared host; passing individual comparisons do not negate the observed concurrent-read failure.

JavaScript-disabled browser acceptance found a pre-existing application-shell limitation. Both the live baseline and candidate return 200 but retain the main page in a hidden Next.js streamed container (`S:0`); the rendered body is empty without script execution. The FAQ has native details markup and works in normal browsers, but full no-script browser usability is **not** verified or claimed. A shared shell/streaming change is deferred from this scoped batch. The failed check and direct baseline comparison are preserved.

The initial Pass browser assertion looked for Connect before automatic reconnection settled. The actual page had already restored Marque Pass. Waiting for the connected state, then checking its real job history and Money tab, passed with zero credential calls. The agent-loop screenshot harness also initially inspected hidden retained tab panels; final checks target visible agent rows. These are recorded test corrections, not product fixes or suppressed application errors.

November capacity remains a failed measurement, without a supported current visitor count. The outside workflow has not been published or activated. Historical winner badges and private Bench attempts that were never recorded remain unavailable; no retrospective data was invented. Mainnet anchoring lacks a verified existing destination and exact gas simulation. These limits are not replaced by testnet evidence.

Detailed machine receipts and private screenshots are retained on the operator host. Public evidence contains no planning chat or personal screenshots. Final receipt references will be added when acceptance completes.
