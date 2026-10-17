# Reconciled facts and unresolved conflicts

| Claim | Competing evidence | Resolution |
|---|---|---|
| Pack reviewed `main` | Actual checkout is `phase2`; same full SHA | Use current source SHA; do not switch active checkout or infer branch publication. |
| All live quotes signed | Verifier supports unsigned; ready snapshot 21 signed/5 unsigned | Public copy overstates numerator. Existing boolean distinguishes modes; reuse it. |
| Signed expiry already strict | Checked response expiry differs from top-level signed expiry precedence | New locally reproduced A0 defect; include in P01A. |
| GET is observational | Both builder-check and Phase 2 owner GET call publication helper | Block both in audit; repair both before seller metrics. |
| Claim proves the selected identity | Caller agentId is not bound to nonce tokenId; publish hardcodes chain 56 | Derive canonical identity; fresh owner and exact tuple checks on existing POST. |
| Five checks mean BNB qualification | Local qualityVerdict has five advisory checks; official build has six conditions plus public-repo rule | Keep basic listing, local quality, Warrant, hireability and organizer qualification separate. |
| Four local categories finish official campaign | Official campaign requires three distinct agents across at least two shortlisted markets | Local four-category/rating journey is an additional Marque challenge. Organizer registration and determination remain external. |
| Announced/launch date was 30 September | Older launch plans anticipate September 30; current official page/blog say October 1 | Official blog metadata: published/modified 1 October 11:59:12 UTC. Exact first X-announcement timestamp and any historical edits UNKNOWN; do not invent that cutoff. |
| No outside paid settlement | September 21 audit and October 10 delivery snapshot predate current chain events | Plinth 56916 paid October 15; Keel 56903 paid October 11. Preserve snapshots as historical. |
| Non-team wallets are independent users | Only address exclusion and distinct buyer/provider established | Actual people/operator/funding independence UNKNOWN. No organic-traction claim. |
| Owner `jobsPaid` means provider received funds | SQL counts funded_raw; Plinth owner says 10 while market settled says 3 | Version/extend semantic fields; do not silently reinterpret old clients. |
| Status has no third-party MCS passes | Current result rows and October 11 notes show passes | Unconditional status copy is stale. Do not erase failed or old rows. |
| Receipt hashes Keccak | Code and public digest reproduce SHA-256 | Preserve sorted-key JSON SHA-256, versions 1/2; comments are wrong. |
| Anchor network equals execution network | Execution receipt 56; anchor implementation testnet 97 | State both explicitly; anchor transaction not independently rechecked. |
| `/status` was down | Previous reader timed out; current curl body completed and Chromium rendered it | Accessible with observed latency. No uptime percentage or blanket healthy conclusion. |
| API last-good state is visibly stale | Phase 2 served helper strips cache age/stale metadata | Add compatible metadata; HTTP 200/max-age does not establish data freshness. |
| RPC archive issue is fixed | Fresh MCS cases avoid old state; old configured archive TLS failure recorded | Configured archive's current condition UNKNOWN without approved credential workflow. PublicNode rejected historical receipts; public dataseed returned them. |
| ABI is explorer-verified | Runtime code hashes and official ABI subset match; BscScan returned 403 and Sourcify full/partial paths 404 | Runtime/official-source corroboration established; independent verified-build linkage remains UNKNOWN. No write approval inferred. |
| Tmux loss was OOM/reboot | No reboot and no retained OOM since September 26; user-manager stop/SIGKILL logged October 15 | Direct cause is systemd user-manager termination. Logind SIGKILL occurred during unattended upgrades; initiating caller not established. Linger=no permitted session-lifetime fragility. |
| OOM protection prevents this recurrence | Existing script changes oom_score_adj only | Does not prevent systemd session/scope termination; prepare targeted lifetime protection, no global restart. |

Sources: exact HEAD handlers, private source probes/API/chain snapshots, `docs/phase2/PROJECT_STATE.md`, `INCIDENT-2026-10-09.md`, and the current [official campaign page](https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn) and [announcement](https://www.bnbchain.org/en/blog/set-and-earn-hire-and-build-ai-agents-on-bnb-chain-win). Official page was captured 16 October; local observations are not an organizer eligibility decision.


## P04 dated follow-up, 16 October 21:27 UTC

The table above preserves P00 observations. Candidate P04 corrects SHA-256 comments in receipt/sealed-call code, DB ground-truth NatSpec and contract NatSpec; receipt hashing and executable contract statements are unchanged. Frozen versions 1/2 vectors and a JSON-safe offline checker now exist. No historical row is rewritten.

The public receipt 944bea48-7c7e-4afc-aa93-fbe126772362 was fetched again at 21:22:30UTC: identical receipt body and published SHA-256, still settled=false/quality.pass=false. Its existing testnet anchor was independently rechecked at 21:27:08UTC: successful tx0x9d7f7069f6d2fd21aa5b7239009a113b01c10f2d021959d2eba2ee2a6d4e829b, chain 97, registry0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7, block135788370, matching Anchored leaf and block hash0x11cd0ee1b5b17f8f74b2f357d966e3a7b9ef45d8368663baa68c4c26c74d181d. PublicNode returned no receipt; the public BNB dataseed returned it. Neither that failure nor the successful fallback proves configured archive health. This resolves the earlier untested-anchor statement for this sample only; the generic receipt GET remains NOT_CHECKED because it performs no chain read and historical rows omit anchor chain/contract.

Source inspection and baseline replay also proved that the local run pipeline could grade case A then cite a later case, and could grade against a different block. P04 binds future quality evidence to the single case actually graded and leaves different-block tasks ungraded. Existing historical claims remain unchanged. See [P04 contract](P04_RECEIPT_CONTRACT.md).


## P05 dated follow-up, 17 October 2026

Historical identity-level test passes do not prove an exact selected service, code build or operator independence. Candidate badges/counts say Test passed / Test passes while legacy API names remain compatible. New explicitly consented tests can return frozen portable evidence; no historical row is relabelled or overwritten. Twelve actual historical rows replay identically with the current deterministic checker: four passes, four failed answers and four protocol failures. Code/service provenance for these legacy rows remains unavailable.

Correction to the P04 digest table: current runConformance already uses sorted stableHash for request and response. The old unsorted hash helper is a known legacy variant, not a description of every current record. Portable verification reports the matching variant explicitly. Receipt versions 1/2 and sealed-call canonicalization are unchanged. Fresh read-only input collection covered all four categories on chain 56; it was not an agent invocation or a new hire. See P05_WARRANT_CONTRACT.md and the dated checkpoint.


## P06 dated follow-up, 17 October 2026

Receipt SHA-256, provider-envelope quote Keccak, signed negotiation hash, description Keccak, SDK manifest Keccak and raw artifact SHA-256 are separate domains. The new containers declare their own SHA-256 encoding and preserve every old digest. Actual default public job events contain role labels (commerce/router/policy), not historical emitter addresses; a pinned-SDK mapping becomes verified only after exact receipt-log checks.

The finalized independent inspector rechecked the original testnet receipt anchor and existing mainnet Plinth56916. At 05:06:11 UTC, pinned mainnet head128111421, Plinth remained Completed/onchain status3 with confirmed PaymentReleased plus the exact token transfer and matching original SDK artifact. The historical policy-registration event is proven while the current router policy link is empty; do not label that absence a revoked charter or erase history. No new transaction was sent.

A bounded production metadata SELECT retains agent363619/service43279/quote56305, original envelope hash0x4441d5d5d59cb812c7decf29164f6dfee494662fc42da291dc4917f4a5c0ed4c and stored signed mode. The separate SELECT-only snapshot lacks that quote row; this is not evidence production lost it. The new projection retains the original intent selection even in that reduced environment. Current inspector does not replay a private quote signature or establish historical registry owner/human independence from those commitments.

Real router JobSettled follows PaymentReleased. The existing projector previously retained PAID but recorded an unnecessary anomaly and omitted that settlement reference. The candidate accepts that terminal summary ordering, with regression tests, without rewriting historical rows.


## P07 fact boundaries, 17 October 2026

Existing catalog generation time is the base projection computation time, not each observation. Machine output retains it separately from export time; null probe timestamp stays null. Deduplicated entries/identities are not independent persons. Existing selected service is not complete inventory, category is not exact-task acceptance, A2A/MCP discovery is not payable rail, and stored signed quote mode is not independent signature replay. Chain of identity may differ from quoted action chain. The pure plan can compare all supplied terms but cannot establish an unspent intent/current owner without external read. Real first-party quote plus fixture intent is a technical integration check, not organic demand, outside-provider consent or settlement.


P08, 17 October 13:26UTC: both public descriptors still GET200, byte hashes unchanged from P02; declared operations are not consent, read-only task acceptance or operator independence. Historical paid Plinth and Brain declarations do not demonstrate equal frozen input. Replay pass is not fair comparison; report always UNPROVEN.


P09: fresh catalog export is not fresh source evidence; recompute age at explicit asOf. Catalog-v1 identity-level MCS pass, quoted price and category do not prove exact-task fit, confirmed payment or least authority. Two IDs do not establish two operators; new diagnostics keep these UNKNOWN and return no recommended winner.


P09 closing, 17 October14:19UTC: successful health/PID continuity is not proof of zero performance impact. A7.78sKerb API mid-sample preceded a0.79sclosing sample; both complete/status=ok, cause UNKNOWN. Reduced only owned validation CPU50%, without modifying Kerb/Marque. Do not erase the slower result or infer production p95/capacity. P09's3supplied entries/7snapshot total remain dated10:17UTC source data; a fresh CLI execution does not renew source freshness, task acceptance, quote expiry or operator independence.
