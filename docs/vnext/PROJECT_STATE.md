# P14/P15 production release completed, 2026-10-19T09:45:18.102462+00:00

Live at https://marque.trade. Web release is `267b46d26582ce32a67787f66d71364a7db8dadd`; the tested web build source is
`78d9b64b8b32bbf9f7784fe60d3575a3c561dbd4` on slot 3200. The owner explicitly authorized repairs, push and
production deployment. Main and phase2 contain the release; later documentation
commits do not change this tested web artifact. Previous release `97ef4c7` is
retained for rollback. Feature scope remains AMBER for the documented limits;
production activation and acceptance have passed.

Final local validation: 929 tests in 102 files, zero skips, including 65 isolated
PostgreSQL cases and three public read-only RPC cases. Fifty-seven focused checks cover
catalog/capability state, quotes, freshness, concurrency and reference errors.
Web types, build, lint, copy and packaging passed on `78d9b64b8b32bbf9f7784fe60d3575a3c561dbd4`;
The release uses this exact tested web build source.
All tracked hashes matched their respective frozen source manifests. Exact-source [CI](https://github.com/talk2francis/Marque/actions/runs/39211372994) passed.
Five freshness regressions and controlled stale/error browser cases verify that
old server-rendered counts are refreshed rather than presented as a new zero.
The final candidate ran against current production data through verified
read-only database sessions: 42 page/theme/width states (390, 768, 1440),
30 catalog AXE states, 13 complete-body HTTP samples, 11 proxy protection cases,
MCS code provenance and private reversal passed. Contact sheets were inspected.
Nine additional Node regressions verify that the deploy browser allows only valid eth_call reads at the existing exact public BSC RPC; transaction/signature methods, mixed batches and other endpoints stay blocked. The fourth stage passed every page check but its old guard misclassified RPC POST reads as writes; this tooling-only repair changes no web build input.
Earlier source `07307a5` separately passed the 102-state broader UI matrix,
four synthetic wallet cases and 40 custom DOM-audit states; these are dated
separate scopes, not 102 new-source or 40 AXE cases.

Actual production acceptance passed 36 read-only browser states at 390/1440
in day/night, including profile, historical job, receipt, builder wallet modal,
quest, Judge and status. Thirteen complete-body HTTP samples, eight catalog
queries (including the default full page and all four categories), 11 proxy
cases and the 42-file MCS source manifest regenerated for the additive database index passed. No wallet signature or
paid task was performed. Public screenshots and interactions were inspected.

Prepared checksums cover 1022 files. All 986 immutable
release files matched; only generated HTML/RSC/metadata for positive-revalidation
manifest routes, including on-demand dynamic routes whose positive literal
revalidate value is verified against the frozen tested source, may change. Actual ISR hash
changes are retained in private evidence. The private checker originally
missed on-demand categories absent from the static route list; that negative
verification and the corrected source-backed exception list are retained. Prior public static files are an
explicit compatibility layer, not source-code replacements. The real staged
cached-client asset verifier passed before Caddy switched traffic.

The four authorized readers (conformance, probe, quotes, indexer) were activated
and PM2 state saved. Conformance startup defers its existing schedules and keeps
unconsented outside tasks quarantined. Graceful stop was observed for
3 of four prior processes; individual timing and stop outcomes are recorded
in the handoff. Keeper, the other five sellers, other products, shared service PIDs and global
Caddy configuration match the post-reboot baseline. The trusted Marque upstream
mirror is preserved. Both slot cluster instances match saved PM2 state; the
recovered Marquecodex session and linger remain present. Owned preview ports
are released. All 26 pre-existing untracked media/evidence paths are preserved;
no new untracked release asset is being published.

The first four production candidates were rejected before cutover, with live
traffic kept on the recovered baseline. Repairs scope service aggregation to
complete owner groups, batch exact-service canonical capability reads and run
independent catalog/quote/track observations together. Latest quote IDs are selected before loading historical raw payloads; scheduled probe reads are narrowed to complete selected owner groups. Category selection is scoped before sorting; a single read-only statement snapshot returned identical complete rows before and after for both catalog and seller projections. Two fresh two-worker clusters passed current-data, read-only preflight on separate runtime copies of the tested web build; the original canonical prepared checksums remain unchanged. Release/build input equivalence is checked for the tooling-only source commit. Existing SQL, HTTP,
freshness, signing and provenance boundaries were not widened. Read-only
production observations of 10.684 seconds before read overlap and 4.233 seconds
after it are separate dated samples, not a percentile or frozen-dataset proof.

The original interruption was an orderly host power-off after an ACPI power-key
event; its initiator is UNKNOWN. A stale PM2 dump then restored the live slot
stopped, producing HTTP 502. Recovery restored it; deployment now saves both
available slots before cutover and saves retirement state afterwards.

A subsequent owner-requested first-party check recorded four fresh MCS passes
(Bound, Lattice, Sluicegate and Keel) after activation. Tidemark and Redcell
were skipped because they declare no compatible published standard; neither
has been certified or given a synthetic pass. Historical 502 and failed-task
observations remain retained. Only the first-party free interfaces were asked;
no outside provider task or paid job was created. Tidemark alone was restarted
with SIGTERM after its executor was idle to activate endpoint-error redaction
across its free and paid answer paths. Its configured archive provider remains
unavailable; the tested public alternatives did not serve the required state.
Its realised-yield reader is still unavailable pending a working archive source.

Only additive migration 0020 was required. The matching latest-probe index was
created concurrently and registered through the existing migrator; all twenty
prior migration rows and hashes were retained unchanged. No column or observation
was altered or deleted. MCS version 1.0.0, tolerance revision 1 and all grading
arithmetic are unchanged; the source manifest reflects the schema index.
No dependency or SDK update, new paid provider, new wallet authority,
mainnet/testnet transaction or observation deletion was required. No new organic
pilot, independent people/funding, payable HTTP seller, native action session or
receipt-linked commercial-quality outcome is claimed. Residual P2 conditions,
backup evidence, claim boundaries and revival triggers remain in the linked
risk register and handoff. P15 is handed over; no hidden follow-on work is queued.

---

# P14/P15 candidate accepted, 18 October 2026

Owner-authorized rollout is ready to stage. Web source07307a5 passes896tests
(96files,55isolatedDBcases,3publicread-onlyRPCcases,0skips), types/build/lint/copy,
102browserstates,4syntheticwalletstates,11proxycases,11completeHTTPsamples and
private rollback. Forty DOM-audit states have only inline prose-link target
advisories. All132custom+40audit captures reviewed through contact sheets.
PM2 reboot persistence and cached-client asset continuity are repaired in
deployment tooling; positive staged asset verification remains a cutover gate.
See P14_CHECKPOINT.md, P14_RISK_REGISTER.md and P15_HANDOFF.md. Production is
still97ef4c7 at this dated candidate entry; actual activation follows below.
No new paid task, wallet authority, chain transaction, migration or data deletion.
Historical entries remain below; the newest dated release entry takes precedence.

---

# P14/P15 recovery and release validation, 18 October 2026

The owner authorizes completing P14/P15, justified repairs, push and production
deployment. The host powered off during the final build after an ACPI power-key
event. A stale PM2 snapshot then left the live web slot stopped after boot.
The existing release was restored and saved; see [recovery](P15_RECOVERY.md).

Validated web source: `2eaac0775823bd94414db99434d6fbe3ae0371b0`. All 891 tests
in 96 files, web types, production build, lint, copy and packaging pass. Remote
code validation passed; its old-live smoke failed separately. Private proxy,
complete-body API and corrected four-state hire-dialog checks pass. Full browser
acceptance and production cutover remain pending. Deployment tooling now saves
available slots before switching and saves retired state afterwards. No web
build input changed in that operational repair. Earlier records below are
historical and do not supersede this release scope. No new chain or paid task.

---

# P01A checkpoint, 16 October 2026

Quote/listing/claim repair acceptance passes at tested source `32fd5cfeb5109984e060ef573988be8677cdb3ac` on the isolated feature branch. See [P01A checkpoint](P01A_CHECKPOINT.md) and the versioned integrity contract. No push, production deployment or chain write. P02 explicitly approved by the owner, begins after local commit/announcement; paid mainnet and production release gates remain. Existing recovered ingestion-worker exit has unknown initiating cause; web/Kerb/shared services remain healthy. Historical P00/P01 entries below are retained.

# P01 latest checkpoint, 16 October 2026

Status AMBER. Tested application candidate `8ccdd9a2072daac0b22721c20c741c17c53cd453`. See [P01_CHECKPOINT](P01_CHECKPOINT.md) for the full acceptance record, metrics, source scope, failures and next approval. Local repair branch only; production application release remains 97ef4c7. Root session persistence and the reviewed shared-service restart policy are installed, without production service restarts. P01A/P02 not started; stop for owner review.

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


## 19 October: user-directed V3 product and hackathon audit (active)

The previous P15 phase-execution handoff did not establish full product completion. A new audit found stale/overstated README, public roadmap and changelog scope; a missing coverage API; quote refresh later than actual expiry; independent stale homepage counts; and ambiguous category supply labels. Source repairs and regression checks are in progress on `fix/v3-live-audit-20261019`. Public deployment and worker activation are not yet claimed. Requirements and per-phase scope are in `HACKATHON_CROSSCHECK.md` and `V3_DELIVERY_AUDIT.md`.

Official campaign criteria have been re-read on 19 October. Shortlisting is verified; independent completed buyers, category execution across days, registration/personal eligibility and qualifying new-build timing remain unestablished. The local three-listing category target is retained. No new paid task, wallet authority, recurring provider cost, transaction or evidence deletion is authorized by this audit.


Additional audit defect: on 19 October at 11:26:57 UTC a fresh free Tidemark read still returned only a redacted error while negotiation could issue terms. Its new-quote path now checks historical-state readiness. The shared paid adapter previously serialized terminal engine errors as deliverables; it now throws before submission. Neither fix repairs the external archive or proves official category execution. Existing funded-job verification, old signed terms, pricing, MCS, settlement and refunds are unchanged. Activation requires all six reference sellers plus quotes, individually and gracefully after build checks; no new financial task or transaction is part of verification.
