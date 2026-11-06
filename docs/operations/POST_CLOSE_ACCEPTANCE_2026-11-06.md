# Local candidate acceptance, 6 November 2026

This batch is validated locally and has not been pushed or deployed. The final production-format runtime artifact is `db6b6ca111d96ade02bf488b04fa5dc8f805272f`; later documentation changes do not alter that compiled application. Functional browser suites were completed on `4fad0b183a0302c295c0e8fab0ffe1e8002e60cc`. The sole application change between those builds is the compact network-count foreground correction. Final accessibility, route, artifact and control checks ran on `db6b6ca`. The live release remains `0e9f5c59444a0036a05f0f9e0d0bf742864abdbf`. Capacity, mainnet preparation and the other limits below remain AMBER.

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
| Four live read-only comparisons | On the final artifact at approximately 13:40 UTC, grid 57125, HF 57185, V3 57121 and yield 56982 returned 200 with 1, 3, 3 and 2 comparison rows, in 594, 884, 450 and 793 ms respectively after the standard candidate warm-up. Individual samples are not a capacity result. |
| Supplied-answer replay | The verified original answer for job 57185 returned three matching checks at its original block 131771231. Consent rejection returned 428; a contradictory declared block returned 422. No agent endpoint task or payment was started. |
| Original results | Row-version and full-row fingerprints of all four sampled original lens records were identical before and after comparison/replay. The 15 checksummed close files and 48-file conformance source fingerprint also verify. |
| Presentation browser checks | All six combinations of 390/768/1440 and Night/Day passed: accordion, keyboard, hash landing, malformed hash, compact Forge showcase, retained campaign directory and recorded Brain test label. No runtime error or unexpected write. |
| Control browser checks | On the final artifact, explicit HF recheck and lazily opened watched positions passed at all six sizes/themes. Read time, block, alert line and displayed HF matched actual responses. Public Marque Pass metadata opened Jobs and Money without a credential request or application error. These checks use public connector metadata, not a real passkey signature or payment. |
| Workspace, routes and downloads | Six functional workspace cases passed with no client errors, failed API responses or unexpected writes, including both owned agents' actual six-node records. On the final artifact, 17 downloads matched exact source bytes, all six Brain profiles showed recorded passes without the incorrect retest badge, and 24 shared page/API responses returned 200. The standard verifier passed all 36 route/width combinations, the real wallet modal, the profile contract and Jobs navigation without a document reload. The four-route smoke check passed. |
| Accessibility and screenshot audit | The complete 20-case scan on runtime 4fad0b1 found one serious Day contrast issue affecting two compact network-count badges. The final artifact passes all six targeted visible-count scans and the complete 20-case scan, with zero violations. The broader audit completed 80 cases across ten routes, four widths and two themes. All 80 retain small-target warnings; four Day home cases also flag text inside the closed film. These are classified below, not reported as a clean audit. All 201 captures listed in the evidence manifest were visually reviewed. |
| Campaign guard and film | Both live and final-candidate nine-wallet guards passed with zero eligibility differences and zero live-read warnings. Film verification passed against the existing files and public HTTP delivery, including byte ranges. |
| Frozen source | Payment and signing components, commerce builders, worker source, deployment scripts, standing/supply definitions, protected campaign APIs and database migrations match the live baseline. The inline allowance-revoke action is unchanged. |

## Visual audit review

The repository's broad heuristic audit reported controls under 24 pixels in every case, including inline text/hash links, native checkboxes and the existing address input. These are retained usability warnings. Its report had no client errors, horizontal overflow, missing alt text or missing focus indication. Eight marketplace cases recorded 40 blocked image attempts across three external 8004scan image URLs (`net::ERR_BLOCKED_BY_ORB`); subsequent direct reads of all three returned 404 with JSON content. Those failures are preserved in the audit review. The existing avatar component and its platform-mark fallback are unchanged. Screenshot review covered the requested 390/768/1440 layouts in both themes and the audit's additional 1024 width. No overlapping text or horizontal clipping was found on the reviewed new surfaces.

All 40 home contrast text/color matches in the sampled 1440 Day case belonged to the closed film details. The heuristic inspected hidden descendants; the raw warnings remain in the evidence. Opening the film and individually opening all nine FAQ answers, then running scoped AXE checks on the actual open content, produced zero violations. This classification does not erase the small-target warnings or claim complete accessibility compliance.

The 201 reviewed captures comprise 102 functional workspace/presentation images from `4fad0b1`, 80 final audit images, six final visible-count contrast images, 12 final recheck/watched-position images and one final Pass image. Each manifest entry records its actual source artifact and SHA-256. Images remain private on the operator host.

## Limits and retained failures

The first API call immediately after the new process reported ready exceeded the test client's 12-second timeout. After the repository's existing runtime-projection warm-up protocol, all four comparisons passed. The failed cold-start log is preserved. The route's four-second comparison deadline was not increased. This does not establish cold-start or concurrent-user capacity.

A subsequent repeated HF browser comparison reached the four-second guard and returned 503 while two browser runs were active. That failure is also retained. The guard preserves the original answer rather than substituting a value. Browser acceptance was then serialized on the shared host; passing individual comparisons do not negate the observed concurrent-read failure.

An initial shared-route batch on the final artifact exceeded its 30-second client timeout and stopped before writing a complete report. The failure is retained. A later run under the same deadline, with per-route logging added, completed all file, profile and shared-response checks. This is not evidence of a latency guarantee.

JavaScript-disabled browser acceptance found a pre-existing application-shell limitation. Both the live baseline and candidate return 200 but retain the main page in a hidden Next.js streamed container (`S:0`); the rendered body is empty without script execution. The FAQ has native details markup and works in normal browsers, but full no-script browser usability is **not** verified or claimed. A shared shell/streaming change is deferred from this scoped batch. The failed check and direct baseline comparison are preserved.

The initial Pass browser assertion looked for Connect before automatic reconnection settled. The actual page had already restored Marque Pass. Waiting for the connected state, then checking its real job history and Money tab, passed with zero credential calls. The agent-loop screenshot harness also initially inspected hidden retained tab panels; final checks target visible agent rows. These are recorded test corrections, not product fixes or suppressed application errors.

November capacity remains a failed measurement, without a supported current visitor count. The outside workflow has not been published or activated. Historical winner badges and private Bench attempts that were never recorded remain unavailable; no retrospective data was invented. Mainnet anchoring lacks a verified existing destination and exact gas simulation. These limits are not replaced by testnet evidence.

## Evidence and release boundary

The [sanitized acceptance receipt](../evidence/post-close-acceptance-2026-11-06/summary.json), [capture hash manifest](../evidence/post-close-acceptance-2026-11-06/screens.json), [visual audit classification](../evidence/post-close-acceptance-2026-11-06/audit-review.json) and [final AXE report](../audit/2026-11-close/candidate.json) record the completed checks. Detailed command logs, retained failures and private screenshots remain on the operator host. Public evidence contains no planning chat, credentials or personal screenshots.

The close manifest still hashes to `0x7ee2aa98522bb14615bd9b494ab9d08552734de4f8d21a483b7ec63ede58aa76`. Its BSC testnet anchor is transaction [0x86a8bafbca9824e872d3bf5754a51dac9e2d7204425389b0c0b70c06c4c5a24d](https://testnet.bscscan.com/tx/0x86a8bafbca9824e872d3bf5754a51dac9e2d7204425389b0c0b70c06c4c5a24d), block 141098389. No mainnet transaction was sent. No application/worker release, production restart, migration, outside-workflow activation or code push is part of this batch.

Final host closure at 17:45 UTC confirmed the public home and health endpoint return 200 on `0e9f5c5`. All 46 PM2 entries retain their original process IDs, states and restart counts. Both temporary preview listeners are stopped; the separate existing development preview remains untouched. All detailed acceptance and failure logs are retained.
