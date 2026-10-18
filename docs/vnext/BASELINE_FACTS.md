# P00 baseline, 16 October 2026

This is an audit, not implementation or release acceptance. Evidence was collected on 16 October, starting at 04:43 UTC. Measurements below are dated samples, not population benchmarks. P00 status: AMBER pending review of the findings and remaining verification limits.

- Source: `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`, active branch `phase2`. A separate worktree at `/root/marque-vnext-p00` uses `audit/vnext-v3-p00-20261016`. Existing untracked Phase 2 screenshots/video were preserved in the original checkout.
- Active web slot: `marque-web-b`, port 3201, release directory `releases/97ef4c7`. Inactive slot 3200 points at `0be9ea0`. The active Caddy route retains the trusted router-state mirror. Source and active release agree at the inspected short SHA; a build reproducibility/CI attestation was not performed.
- Inventory: 1,137 tracked files and 44 API route handlers enumerated and hashed privately. Review concentrated on commerce, both listing rails, identity/metadata, conformance, runs/receipts, authority providers, projections, migrations, workers and proxy/deploy code. Enumeration is not a claim that every source line received an exhaustive security audit.
- Uploaded pack: all 55 files listed in its manifest matched their SHA-256 checksums; no stale V2 directory was substituted.
- Database: 33 public tables, 20 applied Drizzle migrations. All 20 live journal hashes match the corresponding source SQL files, including `0019_builder_checks`. No migration was run.
- No source/runtime/production configuration changes, deployment, service restart, signing request, payment, agent task invocation or database write was initiated by this audit. Existing workers, sellers and keeper continued independently.

## Current observations

| Observation | Captured value | Scope and limit |
|---|---|---|
| Lightweight health | HTTP 200, curl exit 0, 0.090 seconds | 04:47:28 UTC; does not prove dependencies healthy |
| Full status | TCP 0.002852 s, TLS 0.047718 s, TTFB 0.118918 s, total 6.920976 s, HTTP 200, curl exit 0, 116,620 bytes, closing HTML tag present | 04:47:29 UTC; full streamed response completed |
| Ready market | 26 rows/26 total; 21 signed, 5 unsigned | 04:47:37 UTC, `tab=ready&limit=120`; stored quote observations, not 26 fresh task quotes |
| Ready categories | Health 4, yield 4, rebalancing 8, grid 4, security 2, unclassified 4 | Same snapshot; identities are not independent operators |
| Third-party market | 120 returned of 774 total | 04:47:39 UTC; request took 17.995 s; never call the page size a population count |
| Indexer lag | Mainnet 14 blocks; testnet 8 | Public config sample at 04:47:36 UTC; changes continuously |
| Local eligible stats | 2 wallets, 5 deposits, 5 delivered, 2 settled, 4 ratings, 8 listed agents | Local Marque cohort at 04:47:36 UTC; excludes 5 wallets/38 hires; no claim of organizer eligibility or unique people |
| Reference quotes | Six latest sampled scheduled quotes succeeded and their signatures verified at their captured times | Database snapshot 04:52:47 UTC; rechecked cryptography and current registry ownership at 05:10 UTC; not new requests and not a current-price promise |
| Reference health | All six HTTP 200; 23-116 ms | 05:04:45 UTC, public HTTPS path; endpoint health is separate from task capability |
| Database slow read | One active query aged 34.12 seconds | 04:48:13 UTC; fingerprint recorded privately; another sample had no active queries; p95 UNKNOWN, no query rewrite justified yet |
| Hire metadata request | TCP connected in 0.006894 s; no HTTP headers/body; curl exit 28 after 60.061563 s | Exact Plinth `/api/v1/hire/agent` request, 05:18 UTC; actionable A0 operating blocker |
| Seller-candidate query waits | Concurrent query samples up to 80.40 s, with DataFileRead/BufferIO waits | 05:18:08 UTC, fingerprint `ddce4d0839edb7914b24dd4bda775cd6`; exact sheet path invokes global sellerCandidates. Probe workload may contribute; p95 UNKNOWN |
| Backups | Local/offsite marker `20261016T011702Z`; encrypted offsite checksum success 01:27:57 UTC | Existing automation logs, not a fresh remote download; local restore drill last PASS on 12 October; independent recovery-key custody UNKNOWN |

## Existing outside commerce: current evidence supersedes old snapshots

Job `56916` on BSC 56 is Plinth keeper identity `363619`, provider `0xb12a1e4e0e22a97e266ed7a6bfc4133f699b1a1b`, buyer `0x15a97307caa68c24e4b5a0b83d331a6aa1ea195f`, amount `10000000000000000` raw U (18 decimals). Public API and four directly fetched successful transaction receipts agree on creation, funding, submission and settlement. `getJob` returns contract status 3 (Completed); the separate `PaymentReleased` event establishes the application's PAID projection.

- Created: `0xb5109f7feaa5e104393df52996402b0cefeb4ea500a9b4d43f92c70bba5c10fb`.
- Funded: `0xdf180aa639c5744ff649ad1fba36ebfd22e8a4f15df5d1041ee187bb37a380aa`.
- Submitted: `0x745e0053a504b6ee1a5cc35fb4d181672d9b07a83944ad677438edc97e0ed254`.
- Completed/payment released: `0x017fb250c149053403af73a8bc78023ff87ebd5c7a682281a0706e408d4b064c`, block 127719379, 15 October 04:03:54 UTC. No refund event in the captured lifecycle.

Keel job `56903` is also PAID, independently cross-checked with four successful receipts; its settlement is `0x2eb143fd04b928b29eaf5d0ac4f6efd6ac1ddfcb1b26d511a8b3fb912d6a2f57` on 11 October. Keel is first-party. Plinth is nonreference and both buyers are absent from the published team list. Those facts do not establish unrelated people, consent, funding independence, organic acquisition or official qualification. Plinth's public job API lacks the deliverable URL; submitted bytes/integrity remain unverified. No new transaction is needed merely to update the old payment snapshot.

## Receipt check

Public receipt `944bea48-7c7e-4afc-aa93-fbe126772362` is version 2. Independent sorted-key JSON SHA-256 reproduces `0x5c47f22933db4c934f834a88ce986fb5a6d1fbbca8a4ca83bb6d9a6db0206792`. It records `commercial.settled=false` and `quality.pass=false`; digest integrity does not turn either into success. Receipt execution references chain 56; the anchoring implementation uses testnet 97. Anchor receipt confirmation was not independently repeated. Historical content was preserved.

## Evidence location

Raw API bodies/headers/timings, source-tree hashes, browser captures, private source probes, chain receipts, operational logs and competitive diligence remain outside this public repository, in `/root/.marque/private/vnext-p00-20261016`. They are neither committed nor uploaded. The supplied pack remains at `/root/MARQUE_vNext_V3_Independent_Reviewed_Build_Pack/marque-vnext-v3`.

Browser summary: 60 direct route/theme/viewport cases, 59 completed HTTP 200 navigations and one 45-second charter timeout. Three console resource failures (CSS/font 502), zero captured page exceptions; five wallet selection modals opened without connecting. Six additional real theme and marketplace-to-Plinth link sequences succeeded to the profile, but all six failed the 15-second hire-sheet content assertion and retained loading-skeleton screenshots. No full quote/wallet/hire clickthrough is claimed. Production probing stopped after the measured long-query blocker. Screenshots/contact sheets were inspected; source defects and browser failures remain unresolved.

Visual findings beyond HTTP status: the 768px night Plinth profile lost its layout when its stylesheet returned 502; the 390px day quest capture contained the hero/footer without the checklist at that capture time; status captures sometimes showed their own dependency-timeout warning. These are incomplete/broken observations, not successful route acceptance. No repeat was used to erase them. At the final read-only drain check, no active Marque queries were returned; the inspected Marque/Kerb web PIDs and PM2 PID matched the initial observation, and Caddy/Postgres/Redis/PM2 remained active.


## P07 closing observations, 17 October 2026

Candidate source0de30852a3d4717c4beb4f688ab229fa812f0550; production97ef4c73ea3717d1a059b649a35e8124d93bdb7f unchanged. Final full683tests/37gatedskips,34fixture cases separately pass, full types/build/lint pass. At10:17:11UTC candidate catalog has7filtered/deduplicated snapshot entries (not current production population), exact Keel service31798 is found by an external Node client, live first-party quote62+fixture intent makes a valid UNSIGNED plan at10:17:47UTC. Buyer0xdead is synthetic/unsigned, not independent demand; no job/payment or chain write. At10:23:15UTC shared/product PIDs, tmux, linger and proxy intact, complete Marque/Kerb health bodies pass; own preview ports clear. See P07_CHECKPOINT.md for exact timings/negative cases and all limits. No new live registry/seller/user-count claim or verified-source attestation.


## P08-P09 local checkpoint, 17 October 2026

P08 baseline2cc37819/source d7ce335/checkpointd848288 uses the explicitly permitted synthetic offline replay fallback; fresh guarded public descriptor GETs at13:26UTC prove Plinth/Brain reachability only. No independent consenting same-task pair is established. P09 baseline d848288/source e5bd3f4 adds structured-intent/catalog diagnostics and preserves negative observations, exact assets and service tuple. Same input yields byte-identical output; dated3of7snapshot entries at explicit13:48UTC are stale, partial and never a current market total. No provider qualifies through catalog-v1; insufficient_comparable_supply/manual browse, no recommendation or automatic hire.

Final P09 suite723passed/37gated skips, full workspace/CLI types and lint/copy/anchor pass. No HTTP/UI/DB/SDK/worker/ops change, paid task, wallet, mainnet/testnet write, deployment or push. At14:19:45UTC shared/product PIDs, original tmux, linger, proxy and production97ef4c7 remain unchanged; complete health reads200:Marque0.062626s,Kerb API0.786661s,Kerb web0.129679s. Mid-validation Kerb API7.778119s with status=ok is retained; cause UNKNOWN. Only the owned validation unit CPU was reduced100%to50% as a precaution. These are individual samples, not uptime/p95 or a zero-impact guarantee. See P08_CHECKPOINT.md/P09_CHECKPOINT.md for exact commands and scope. Both phases AMBER; STOP after P09.


P12 closes18October: full782general/51gatedskip scoped to b739fd7;42affectedreceipt/job/API tests on8d9db96; finalc476d56 webtypes/build/lint/copy and wallet/receipt browser checks pass.168custom+56audit screenshots inspected, no serious/critical accepted axe findings;20audit combinations retain advisories. Production97ef4c7/PIDs/proxy unchanged at06:10UTC, complete Marque/Kerb responses200. No release or chain write.


P13 final frozen sourceef7f4925f9e5c597af7a5f6582a84f4851b32f1f:819passed/51gatedskip;47focused;20workspace types/build/lint/copy on0850b72 pass; final2docs-only-file correction passes webtypes/rebuild/lint/browser. Separate example14steps, compiled browser consumer,16docs Chromium+16viewport audit and11proxy cases pass. Source manifest42files/hash0x3c871134132086241c3e9cf1ddfab7303709de6c28b395a59f442b817adcda3e.57x402declarations/39identities and3HTTP200/404/503samples are dated17October observations, not current payable supply or independent operators. Production97ef4c7 unchanged at2026-10-18T08:07:31.846018+00:00.
