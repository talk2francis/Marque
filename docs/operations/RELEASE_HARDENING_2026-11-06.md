# Release verification, 7 November 2026

This release completes the authorized B/C/D product batch and its remaining-limit follow-up, including the newly reported Ledger regression. The compiled runtime source is `361d1ee5b82d40374654dd854b16575db0920b82`; the broader foundation acceptance is `0fb0ecaf0e2ab2db2853757f86d413581daf5288`. The final parser/homepage correction has [its own compiled acceptance](../evidence/veyra-parser-2026-11-07/compiled-acceptance.json). [Acceptance data](../evidence/release-hardening-2026-11-07/summary.json) identifies the actual source of each check. The [earlier local acceptance](POST_CLOSE_ACCEPTANCE_2026-11-06.md) remains a historical checkpoint, not the current deployment record.

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

The conformance implementation fingerprint is now `0x66057d145adf50c8c2a54c682bdaccc1940f9ed9363bc62c0e3d650718032418`. Grading arithmetic, tolerances and old issued fingerprints are preserved. The original close checksum and existing BSC testnet anchor remain; no new mainnet transaction was sent.

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

The existing 03:17 Europe/Berlin backup ran on 7 November. Its local dump completed at 02:28:00 UTC; the encrypted Google Drive copy was verified at 02:30:45 UTC with zero differences and matching local/offsite latest pointers. No new restore test or schedule change is claimed.

Promotion uses the verified prepared artifact and existing blue/green flow, then public health/source checks, smoke, close guard, film delivery, keyless MCP metadata and actual outside observations. Production activation and process scope are recorded only after they occur in the operational receipt. No money-worker restart is required. The normal quiet window and the confirmed broken-Ledger exception are documented with the actual rollout time if the exception is used.
