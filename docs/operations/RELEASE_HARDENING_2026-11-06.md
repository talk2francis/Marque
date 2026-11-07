# Release verification, 7 November 2026

This release completes the authorized B/C/D product batch and its remaining-limit follow-up, including the newly reported Ledger regression. The compiled runtime source is `7f6d5912443718699bb83de556ccbf7fd648d8d9`; the broader foundation acceptance is `0fb0ecaf0e2ab2db2853757f86d413581daf5288`. The earlier parser/homepage correction has [its own compiled acceptance](../evidence/veyra-parser-2026-11-07/compiled-acceptance.json). [Acceptance data](../evidence/release-hardening-2026-11-07/summary.json) identifies the actual source of each check. The [earlier local acceptance](POST_CLOSE_ACCEPTANCE_2026-11-06.md) remains a historical checkpoint, not the current deployment record.

GitHub [main](https://github.com/talk2francis/Marque/tree/main) identifies published code; public [health](https://marque.trade/api/health) identifies the active website. The immutable [operational receipts](https://github.com/talk2francis/Marque/tree/status-log/releases) record actual CI and deployment results after they happen. Pre-promotion acceptance alone is not a claim that production changed.

## What changes for users

- My Marque separates Hiring (Today, Positions, Jobs, Money) from Building (Agents, Bench, Demand). Existing money actions retain their signing code. Today prioritizes risk and deadlines; watched positions open on demand and carry real block/read times.
- Builders get a six-stage recorded evidence strip, private quote outcomes after ownership verification, and explicitly consented replay of supplied JSON at the original block. Missing historical observations remain unknown. The full campaign directory stays on Set and Earn; Forge shows three linked examples.
- Recorded answers can be compared with current chain state without replacing the original answer or grade. Minimal original-job reads, parallel pinned-block readers, bounded verified-byte caches, per-selection catalog coalescing and read-only provider failover reduce unnecessary work. They do not establish a latency or capacity guarantee.
- Public pages work without the old global streamed loading boundary. Compact controls retain usable targets, wallet fields fit phones, reference heroes remain clear and profile tabs preserve the document. The compact sage FAQ, shared answer copy, native accordion and hash links remain intact.
- Test labels use the existing 14-day validity window; the 72-hour refresh cadence is separate. The six checked Brain on BNB profiles show their actual recorded passes. Missing portraits use guarded same-origin WebP handling; one unavailable declared host keeps its labelled fallback.
- Status/Running Marque show dated capacity evidence, an outside-observation reader, security contact information and validated OpenAPI. The Status introduction now distinguishes internal activity timestamps from actual outside requests. Both web workers must initialize before promotion; the existing rollback path remains.

## The Ledger regression and its repair

The data was not lost. ADV-02 and ADV-04 still matched. ADV-01 and ADV-03 failed comparison validation because reproduction runs on **9 October 2026** upserted the registration at a later block. The public comparison correctly excluded reproduction runs, but then checked its original manifests against that later registration hash. Retained runs 41 and 40 match those later registrations exactly.

| Benchmark | Verified original block | Candidate result | Context handling |
| --- | --- | --- | --- |
| ADV-01 | 120123441 | Complete | Original task reconstructed and hash-verified; later registration block 126580730 disclosed |
| ADV-02 | 120077706 | Complete | Existing registration already matches |
| ADV-03 | 120077706 | Complete | Original task reconstructed and hash-verified; later registration block 126570170 disclosed |
| ADV-04 | 120707631 | Complete | Existing registration already matches |

Recovery requires the unchanged completion predicate, one original task hash, matching input/rubric hashes, one verifiable block across both arms, correct block-supplement task bindings and exact reconstruction of both task texts. Other mismatches remain incomplete. Future reproductions record their own task without updating registration; changed inputs/rubrics reject the attempt. The API, detail pages, status tool and frozen replay agree.

All four raw registrations, **41 runs and eight provenance supplements** retained identical row versions and full-row fingerprints. The 16 selected public runs also exactly match the previous API output. Grades, zero scores, losses, timings and costs are unchanged. Headlines computed across complete comparisons once again include all four; that can change an aggregate without changing any individual run. Complete means comparable evidence, not an agent win or a promised TermiX result. [Binding proof and unchanged scores](../evidence/release-hardening-2026-11-07/ledger.json), [compiled checks](../evidence/release-hardening-2026-11-07/ledger-browser.json), [phone context](../evidence/release-hardening-2026-11-07/ledger-context-phone.png), [desktop context](../evidence/release-hardening-2026-11-07/ledger-context-desktop.png).

## Verification

| Check | Result and provenance |
| --- | --- |
| Ordinary suite | 1365 passed, 117 environment-gated skips; 173 files passed. Actual suite source `124b3004543feae31ed8a9b4f4c7a772daad9d4d`. The subsequent Status change is verified as comments/displayed JSX text only, with an identical syntax tree for logic and literals. Exact-source GitHub CI is recorded separately after publication. |
| Production build and source checks | All 44 pages and standalone assembly; all 22 workspace typechecks, lint/copy lint, original 15-file close checksum, 48-file conformance fingerprint, validated OpenAPI, transport checks, 29 operations tests and the warm-projection regression. These broader source checks ran on foundation `0fb0ecaf0e2ab2db2853757f86d413581daf5288`; affected web/conformance typechecks, 76 focused tests and three new isolated database tests passed for the subsequent correction. Its exact production build and fresh browser/API/integrity checks are recorded separately. Exact-source GitHub CI is recorded after publication. |
| Database tests | 31 checks in an isolated, schema-only fixture database. New projection/privacy regressions are included in the CI fixture job. No test fixtures were written to production. |
| Comparisons and replay | Four category API checks returned 200. Supplied-answer replay retained the original block, consent/mismatched-block rejection and owner-private access gates. Individual response measurements are in the receipt; no end-to-end four-second guarantee is claimed. |
| Browser and accessibility | Six workspace and six presentation cases retained from their recorded source; six explicit comparisons, six lazily opened watched positions and public Pass metadata reconnection without credential requests. Four mobile cases include 24 reference hero/sticky checks and eight document-preserving switches. The broad 20-case AXE scan and 20 open FAQ/film scans are retained with actual source attribution; 18 new route/theme scans and 72 audits cover Ledger, homepage, Status and changelog on the foundation runtime. The correction adds ten fresh route/theme accessibility scans, 40 viewport audits and repeat Ledger/browser/API/close checks, recorded in its separate acceptance. |
| Visual review | The prior 80 audit, 52 mobile and 13 control captures were reviewed in this pass. All 72 new audit captures and the context images specified in the [new review record](../evidence/release-hardening-2026-11-07/ledger-review.json) were inspected. Capture hashes and source revisions are separate from review coverage; file existence alone is not called review. |
| Integrity | Four sampled original lens rows retain exact values/row versions. Candidate and earlier live nine-wallet close guards show zero eligibility differences. The protected money, worker, count, migration and inline revoke paths match the baseline, apart from the documented deployment-readiness gate. |

The parser correction's implementation fingerprint was `0x66057d145adf50c8c2a54c682bdaccc1940f9ed9363bc62c0e3d650718032418`. Grading arithmetic, tolerances and old issued fingerprints are preserved. The original close checksum and existing BSC testnet anchor remain; no new mainnet transaction was sent.

## VEYRA Keeper: platform correction

The latest recorded run, 16024 on 7 November at 02:05:10 UTC, already passed all eight MCS-REB-1 checks against BSC mainnet block 132117587. Three older 3 November failures were caused by Marque returning a valid A2A DataPart wrapper instead of its structured payload. Their original responses replay 8/8 against unchanged original ground truth with request, response and ground-truth hashes verified. All six stored records remain unchanged. This is a parser correction and offline diagnosis, not a new agent call or retroactive rewrite. The homepage now uses the latest observation per identity/test, excludes missing-field formatting failures from wrong-value highlights, and gives dates and evidence links. [Incident and raw replay](VEYRA_TEST_REVIEW_2026-11-07.md). A testnet identity tested against a BSC case is not thereby a mainnet deployment; passing the planning test does not establish autonomous on-chain execution.

## Capacity, retained failures and real limits

The load generator and application share this server. The November read mix includes cold searches and historical job pages. Stages stop on any nonzero result, preserving the raw measurement; a stopped ramp does not prove the target visitor level. These are candidate observations, not production capacity certification.

| Stage | Result | Page p95 | API p95 | Requests |
| --- | --- | --- | --- | --- |
| 25 target VUs | Stopped / thresholds failed | 11871 ms | 6872 ms | 40; statuses {"200":34,"308":6}; peak 25 VUs |

No higher stage is run after a failure. The [raw summaries](../evidence/release-hardening-2026-11-07/) and [acceptance receipt](../evidence/release-hardening-2026-11-07/summary.json) retain the measured limits. Earlier failures remain recorded, including the initial guarded-25 aborts, a yield 503, repeated comparison transport times of 7.343 s and 4.990 s, the unchanged-deadline browser retakes and one earlier close-guard transport timeout. Passing functional checks do not erase them. Concurrent search/cold-read latency is not described as fully resolved.

One artwork host remains unavailable. Historical private Bench attempts and badges that were never recorded cannot be recreated. Public Pass checks do not exercise a real passkey signature or funded hire. Mainnet anchoring still requires a verified existing destination, simulation and separate exact transaction authorization; website publication does not authorize that operation.

## Backup and activation

The first outside-workflow activation stopped in setup-node before making any requests: its automatic package-manager cache expected pnpm, although the observer uses only Node built-ins. Package-manager caching is disabled for that job, as it already is for the standalone smoke job. The [failed setup run](https://github.com/talk2francis/Marque/actions/runs/42368897719) is retained; successful activation and actual observations belong in the operational receipt.

The existing 03:17 Europe/Berlin backup ran on 7 November. Its local dump completed at 02:28:00 UTC; the encrypted Google Drive copy was verified at 02:30:45 UTC with zero differences and matching local/offsite latest pointers. No new restore test or schedule change is claimed.

Promotion uses the verified prepared artifact and existing blue/green flow, then public health/source checks, smoke, close guard, film delivery, keyless MCP metadata and actual outside observations. Production activation and process scope are recorded only after they occur in the operational receipt. No money-worker restart is required. The normal quiet window and the confirmed broken-Ledger exception are documented with the actual rollout time if the exception is used.

### MCP release metadata follow-up

The first public verification after the fe7e485 rollout passed website smoke, the nine-wallet guard, four complete Ledger comparisons, 17 exact close downloads and all six Brain profiles. It then found that the keyless MCP process's health response had no release identifier, despite its symlink serving the correct prepared release. The process now reads that identifier from its active release file; its secret filter and every other process definition are unchanged. Deployment requires the single MCP worker to report readiness for the exact release before switching traffic. Fixture checks cover valid/missing/malformed metadata, shell-value isolation and the key filter. The original failure remains recorded; subsequent public verification is in the operational receipt.

### Guarded rollback and agent-price read repair

The outside smoke job for 6f8c708 ran against the then-live fe7e485 website. It observed a 503 from `GET /api/v1/terms` while loading the marketplace. Caddy recorded `/register` itself as 200 in 221 ms and the terms read as 503 after 5.620 s. The retained 0e9f5c5 release was restored at 12:12:05 UTC on 7 November. The first rollback service lacked PM2 on its PATH and stopped before switching traffic; the corrected service used an explicit PATH and completed. These failures are retained, not classified as passing checks.

The failing request named 15 agents. A read-only query plan showed the latest-per-service lookup sorting 12,128 wide observations, including raw expiry payloads, to return 15 winners. The repair first selects the winning row IDs with the same agent, service, seven-day and timestamp/id predicates, then loads the full payloads for those rows. Last-success lookup uses the existing agent/time index per requested agent. Identical overlapping reads share a single flight; completed observations and errors are never cached. The four-second statement and 500 ms lock budgets are unchanged. New isolated fixtures cover newer failures, tied timestamps, wrong-network quotes, service-less/orphan history, the seven-day window, expiry at each caller's clock and the existing 48-agent bound.

In one repeatable read-only snapshot of that exact 15-agent request, both query result arrays were byte-for-byte equivalent after driver decoding. The latest-per-service warm plan fell from 303.414 to 79.793 ms and from 38,253 to 8,221 shared buffer hits. The last-success sample fell from 110.353 to 90.294 ms. These are individual warm database measurements, not an end-to-end or concurrency guarantee. No quote observation, price, expiry, ranking, payment or campaign-count rule was edited.

A separate localhost-only keyless MCP probe recorded a sampled peak of 729,554,944 bytes RSS, settling near 600 MB after module/catalog warm-up, above its existing 500 MiB PM2 restart threshold. Only that process's restart budget is raised to 800 MiB within the existing server; other app definitions and the key filter remain unchanged. The private probe stops automatically. The final rollout receipt records actual subsequent website, MCP and outside checks; preparation alone is not a deployment claim.

[Paired quote-query evidence](../evidence/terms-read-2026-11-07/query-equivalence.json) and [sampled keyless MCP memory](../evidence/terms-read-2026-11-07/mcp-memory.json) retain the actual observations. The price correction's compiled acceptance and final activation are recorded separately from the earlier 361d1ee application artifact.

The retained rollback release predates `/api/ready`. New promotions still require initialized web/MCP workers with the exact release tag. Rollback uses an explicit legacy check that consumes the complete `/api/health` response and still requires `ok: true` and the exact retained release tag, rather than waiting for an endpoint that the older release never had. Wrong tags, bad status and truncated bodies remain failures.

### A second held candidate and additive index repair

The 0f1418a compiled candidate passed twelve route/theme accessibility scans, 40 viewport audits, 18 Ledger checks, all four comparison APIs and the nine-wallet close guard. Its full smoke then reproduced a marketplace terms 503, so promotion remained held. Its [partial acceptance](../evidence/terms-read-2026-11-07/partial-acceptance.json) explicitly records the failure, the checks that passed and those not reached. All 78 listed captures were inspected; those checks retain source 0f1418a.

PostgreSQL's existing timeout log identified both exact price queries hitting their unchanged four-second limit while full-history catalogue queries also timed out. Migration 0030 adds three matching read indexes. They were prepared concurrently in production, validated for exact columns, ordering, predicates and readiness, then registered through the ordinary additive migration. The three indexes total 56,098,816 bytes. No observation value or count predicate was edited; no worker restart was needed.

Read-only plans after indexing took 37.864 ms for the agent service winners, 0.451 ms for last successful quotes and 568.536 ms for global service winners. Index-only scans still fetched heap pages where visibility required it. On the unchanged 0f1418a artifact, the same 25 overlapping reads all returned 200, with p50 1,612 ms, p95 1,685 ms and maximum 1,768 ms. These are measured diagnostic requests on a shared VPS, not a supported mixed visitor capacity. The earlier 5,100 ms cold p95 and failed smoke are preserved. [Index preparation and actual plans](../evidence/quote-indexes-2026-11-07/preparation.json) describe the change.

The final index build and affected acceptance are recorded separately. Prior visual/accessibility evidence is reused only for byte-identical renderer inputs; the additional changelog paragraph receives fresh checks. Exact-source GitHub CI and public activation remain separate gates.

The additive schema index declarations also change the imported-source implementation fingerprint to `0x9d575ac646f73f2200bbd0e83a2062879ad5619b84c7ed4f516b5448b1ed3947` across 48 files. The manifest differs only at `packages/db/src/schema.ts`; numeric grading code, criteria and tolerances are byte-identical. Earlier issued fingerprints and observations remain untouched. [Fingerprint comparison](../evidence/quote-indexes-2026-11-07/implementation-fingerprint.json).

### Final pinned winner-query acceptance

Source `7f6d5912443718699bb83de556ccbf7fd648d8d9` built all 44 pages and the standalone artifact from clean committed inputs. Commerce types and production-build web types passed, alongside 29 focused cases and twelve isolated quote-history regressions. The unchanged database, conformance/helper types, ten parser and ten operations cases retain their actual 13f54af source attribution; exact-source GitHub CI follows publication. Lint, copy lint, generated site docs, the 48-file source fingerprint and original 15-file close checksum passed. Counts describe separate suites and are not added as unique tests. The first fixture refused migration because its schema was admin-owned; a fresh empty application-owned fixture passed without changing existing permissions. The first isolated web typecheck hit its one-GiB default heap; the same source passed with three GiB. Both failures are retained.

Fresh compiled acceptance passed both marketplace themes, the added changelog paragraph with two AXE scans, eight viewport audits, twelve focused captures, no-script four-comparison Ledger, all four comparison APIs and consented original-block replay, nine-wallet guard, four smoke routes, 36 route/width cases, two-worker web readiness, one-worker keyless MCP readiness and exact evidence downloads. The prior 0f1418a visual/accessibility checks are reused only after a strict renderer-input comparison; one added changelog paragraph is the only renderer change and receives fresh checks. The previous failed smoke remains failed. All twenty fresh captures were inspected.

The new artifact's 25 overlapping price GETs returned 200 throughout, with p50 2099 ms, p95 2201 ms and maximum 2220 ms. Only in-flight work is shared; expiry remains caller-specific. The fresh keyless MCP probe sampled 726999040 bytes peak RSS against its 838860800-byte budget, with eleven read-only tool hints and no tool invoked.

The fresh mixed-workload run ended at the 25-visitor stage with exit 99: page p95 9320.2 ms, API p95 2990.0 ms and recorded error rate 0.0%. The stop rule prevented every higher stage. This remains an explicit capacity limit; passing functional checks do not erase the latency result. The generator shared the VPS and the private web candidate had a two-core CPU quota. No supported higher visitor capacity is claimed.

Fresh row-version and whole-row-fingerprint checks preserved four benchmark registrations, 41 runs, eight provenance supplements, six VEYRA observations and four sampled original delivered-answer rows. Payment builders, signing, worker code, count predicates and inline money actions retain their baseline implementations. The database exception is strictly additive indexing; the existing statement budgets and price interpretation remain. The implementation fingerprint remains the 9d575ac schema-metadata revision; arithmetic and tolerances are unchanged. The global discovery lookup returns the same complete rows as the earlier query while seeking one winner per service.

[Final compiled acceptance](../evidence/quote-indexes-2026-11-07/compiled-acceptance.json) contains source attribution, actual measurements, capture hashes, review coverage and retained failures. Exact-source GitHub CI and actual production activation are separate gates, recorded after they occur in the immutable operational receipt.

The initial cold Night marketplace capture omitted its optional totals panel when that projection was unavailable. A fresh warmed mobile Night context returned the panel with no page/HTTP errors or writes. The existing omission fallback is retained rather than inventing totals; cold projection latency remains a limitation. The additional commerce-state unit case passed on the final source. [Fresh phone marketplace](../evidence/quote-indexes-2026-11-07/marketplace-phone.png) and [updated changelog](../evidence/quote-indexes-2026-11-07/changelog-phone.png) are captured from the pinned candidate.
