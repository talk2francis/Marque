> Current release, 20 October 2026: see the [V3 release audit](./V3_RELEASE_AUDIT.md) for web source `ac0f469`, quote reader `785ba45`, current validation and remaining limits. Earlier release descriptions below are dated historical evidence.

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

# P15 operational handoff, 18 October 2026

Status and actual release metadata are recorded below. The owner authorized the
P14/P15 repairs, push and production deployment. No further deployment approval
is pending. New mainnet operations, paid providers or wallet authority remain
separate decisions.

Read [final claims](P15_FINAL_CLAIMS.md), [security checkpoint](P14_CHECKPOINT.md),
[risk register](P14_RISK_REGISTER.md) and [recovery](P15_RECOVERY.md). Optional
features are frozen. The final claims document contains the recording script,
current official campaign links, deferred work and measurable revival triggers.
It is a script, not a claim that a new screencast or paid pilot was produced.

## Review the product

Browse home, Register and all four categories without a wallet. Inspect the exact
identity, service, provider, signature mode, quote expiry, chain and token units.
Open Builders, Quest, Status and Judge in both themes and on a phone. Judge reads
independent position/catalog observations and previews policy; it does not grant
native asset authority. Escrow service fees are a separate buyer-signed flow.
Unavailable sources, stale tests and expired terms remain explicit.

Preserved Plinth job 56/56916 has separately verified submission, completion and
ERC-20 payment, with a matching SDK deliverable manifest. It is one historical
outside-provider case. Provider/person/funding independence remains UNKNOWN.
The team-buyer Vitals case is excluded from independent-buyer claims. No new paid
job was created for this release. Receipt 944bea48-7c7e-4afc-aa93-fbe126772362 is a
separate record: its canonical SHA-256 and mutation detection do not establish
payment, quality or a link to Plinth.

## Inspect and reverse

From `/root/marque`, run `bash scripts/deploy-web.sh --status`. The active
`/api/health` release metadata must match the slot's `RELEASE_SHA`. The prepared
artifact also stores `BUILD_SOURCE_SHA` and `SHA256SUMS`. Its source/runtime input
agreement is checked before the candidate can take traffic. Deployment metadata
is not cryptographic proof of source integrity by itself.

For a web regression, run `bash scripts/deploy-web.sh --rollback`. It cancels the
previous slot's retirement, starts it if necessary, checks complete responses,
saves PM2 state and switches only the Marque upstream with a graceful Caddy
reload. Verify public bodies afterwards. Previous release files are retained;
no observation data should be reset. Private rehearsal timing is not a public
rollback SLA. Source/worker reversal is a separate scoped operation using the
captured source checkpoint; never restart all PM2 applications or shared services.

Only probe, quote, indexer and conformance readers are included in worker
activation. Allow graceful shutdown. Conformance startup must defer the existing
reference schedule and retain the outside-task quarantine. Keeper, the other five sellers,
Kerb and other products are outside the restart scope. Preserve observations and
SDK pins. Release migration 0020 adds the latest-probe index; it was created concurrently and registered before activation. Existing tables and observations are retained. Dependencies and SDK pins are unchanged.

After a reboot, compare the Caddy upstream, slot symlinks and PM2 state before
calling the application healthy. A reboot before old-slot retirement can restore
both slots. Save any corrected state. Tmux processes cannot survive host power
off; persistent session history, checkpoint files and frozen validation records
provide the recovery path. The latest power event initiator remains unknown.

## Remaining boundaries

There is no proven new independent paid pilot, compatible payable HTTP seller,
buyer-owned native action session, independent fair-trial winner or linked
commercial quality-learning case. Existing discovery, planning, inspection and
buyer-signed service escrow remain separate from those deferred capabilities.
The full unclassified cold catalog and conditional dependency advisories remain
maintenance work. No uptime percentile, independent-user count or profit claim
is inferred from the release samples. Original main-track judging is historical;
Set & Earn follows organizer rules and review, not local listing badges.

Maintain the documented experimental-feature freeze on 3 November at 12:00 UTC.
No hidden follow-on work or new signer is scheduled by this handoff. Use the
existing approved backup workflow; local restore proof and the nightly encrypted
backup check do not establish independent recovery-key custody.

## Candidate release record

Prepared at 2026-10-18T17:23:59.334971+00:00. Tested web source
`07307a5cb962622cc8b3aef98347451bbc15bd7d`; the release SHA is assigned after
this handoff commit and written to the artifact and slot metadata. Later
nonruntime documentation does not change that tested build. No deployment is
claimed by this candidate entry.

The complete candidate gates are in P14_CHECKPOINT.md. Prior static assets are
retained as a public compatibility layer; the original prepared files remain
unchanged. The previous static release is recorded as a reference, including
legacy directory names where old releases have no full metadata file.

The historical payment block is 127719379 on BSC mainnet (56), timestamp
2026-10-15T04:03:54Z, block hash
`0xaf6ffcf2f051321d8224e7a292b4356caa9029b39a179fe156c8477220e3d0d0`.
A single public RPC block-header read at 2026-10-18T17:15:44.122598+00:00 matched the indexed
timestamp. It is a read observation, not a consensus or source-build attestation.
See [block](https://bscscan.com/block/127719379) and the
[payment transaction](https://bscscan.com/tx/0x017fb250c149053403af73a8bc78023ff87ebd5c7a682281a0706e408d4b064c).
The 11:10:52 UTC chain/artifact refresh separately validated delivery, completion
and exact payment. Refund and historical raw quote-signature proof remain
unavailable; current policy link is empty. No missing linkage is invented.

## Actual reader activation

| Reader | Drain/restart seconds | Prior graceful stop observed | New status |
|---|---:|---|---|
| marque-conform | 358.1 | false | online |
| marque-probe | 10.29 | true | online |
| marque-quotes | 24.1 | true | online |
| marque-indexer | 7.1 | true | online |

Conformance scheduling is deferred, as verified in its real startup record. Public read-only acceptance creates no task, signature or transaction. A stop deadline is not described as graceful completion when no stop event was observed.
