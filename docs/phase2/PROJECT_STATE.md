# PROJECT_STATE.md

Live record of Phase 2. Newest first inside each section. Times are UTC.

## Phase status

| Phase | State | Notes |
|---|---|---|
| P2-00 Stabilise, measure, clean | DONE, checkpoint below | Probe incident root-caused and fixed, `/api/v1/agents` fixed, warrants re-run, protocol measured, repo cleaned |
| P2-01 Canonical supply | DONE | Quote engine, worker, supply audit; yield short one agent, filled by Tidemark (D2-02-03) once it has a mainnet identity |
| P2-02 ERC-8183 buyer rail | DONE on testnet | Hire API, sheet, job page live. Proof: all 4 categories paid and answered (jobs 1343-1346), cancel 1347, revoke to zero. Browser check passed 14:31 (desktop and phone, from /register) |
| P2-03 Quest Index and API | DONE (Sat 15:17) | marque-indexer on 56 and 97; /api/v1/phase2/{config,wallet,owner,job,coverage,stats} live; drill passed; 9 of 14 topics verified on real logs (ratings, dispute, expiry, refund pending real events) |
| P2-04 Ratings | NEXT | |
| P2-05 Mainnet cutover | queued, gated (G-M1, G-M2) | Needs Francis: "approved, mainnet" and funding |
| P2-06 Handoff | queued, due Sun 27 Sep 10:00 | |

## Production baseline (P2-00, Sat 26 Sep 05:16)

- Production commit before Phase 2: `9b47e39` (web build from `ecee45d`), then pack commit `70f8c18` pulled.
- Backup: `/root/.marque/backups/pre-phase2-20260926T051642Z.sql.gz`, 128,930,467 bytes, gzip verified, dump footer present.
- PM2 (Marque): `marque-web`, `marque-ingest`, `marque-probe`, `marque-classify`, `marque-pancake-watch`,
  `marque-conform`, `marque-bound`, `marque-lattice`, `marque-sluicegate`, `marque-redcell`, `marque-keel`,
  `marque-health`, all online.
- Branch `phase2` created from `main`.

## Protocol facts

Measured, read only: `docs/phase2/PROTOCOL-FACTS.md`. The ones that change the build:

- Mainnet dispute window is **7 days** (testnet 15 min). Completion must count at `JobSubmitted`.
- Mainnet escrow supports **USDT, USDC, USD1 and U**. Payment token ladder rung 1 is open.
- Quotes carry no provider field: the provider is the `provider_sig` signer, which must equal the ERC-8004 agent wallet.
- Public mainnet RPCs serve `eth_getLogs` only for about the newest 20,000 blocks (about 2.5 h). The indexer must tail head.
- All five reference sellers quote live on testnet 97 today, signatures valid, signer = agent wallet = owner.

## Deviations

Logged in `docs/DEVIATIONS.md` under "Phase 2". Index:

- D2-00-01 Probe tiers resized to measured load (T1 = classified agents; answering services moved to a 12 h tier).
- D2-00-02 Probe cycles bounded by a 4 min deadline and a per-host breaker.
- D2-00-03 lint:copy is a ratchet with a recorded baseline of 936 historical dashes.
- D2-00-04 Three pack files moved off the public repo (DECISIONS, 00_START_HERE, the zip).
- D2-00-05 Conformance cases cannot be re-captured (immutable since 21 Sep); retests grade the pinned case.
- D2-00-06 `config/first-party.json` created in P2-00 (planned for P2-01) because the probe T0 tier needs it.

## Requests

- [Sat 15:20] [P2-05] Tidemark wallet holds Francis's 0.0021 BNB (registration was sponsored). Kept for mainnet submit gas pending the P2-05 funding table; whatever is not needed goes back to 0x0d8c9ad8eebb6879fefa218f0799219bcaabe999.

- [Sat 14:10] [P2-05] [Francis] Send about 0.002 BNB on BSC mainnet to Tidemark's wallet 0x8122991297DC98Dc5c735fDE90a501528922aFdC for its ERC-8004 mainnet registration (needed before it can be listed and hired). The full P2-05 funding table follows before cutover.
- [Sat 14:10] [ops] Testnet operator 0x9598...7F9B is down to about 0.03 tBNB after funding Tidemark.

- [Sat 06:10] [build] [Francis] Optional: a free NodeReal or Ankr BSC API key for `eth_getLogs` history (PF-6). Not blocking launch.
- [Sat 05:20] [build] [Francis] Send the Damian acknowledgement and the six Gwen questions (private pack, section 5). Question 2 (completion at JobSubmitted vs JobCompleted) is now urgent because the mainnet window is 7 days.
- [Sat 05:20] [build] [Francis] Support channel for real users, and personal public wallet addresses for `config/team-wallets.json`.

## Evidence

### P2-03 checkpoint (Sat 26 Sep 15:17)

- Wallet API: `GET /api/v1/phase2/wallet/0xC83d716523C1958bcC48d19854ef1eb360bEf878?chainId=97` returns yield 97:1338, grid 97:1339, rebalancing 97:1340, health_factor 97:1337, all done and delivered, every tx hash, `eligible: false, reasons: ["team_wallet"]` (it is our test wallet). Later proof jobs carry `duplicate_category`; cancelled ones `zero_deposit, not_delivered`.
- Job API: `/api/v1/phase2/job/97/1348` returns 6 events and the public deliverable URL.
- Lag at deploy: mainnet 8 blocks, testnet 4.
- Drill: indexer stopped 15:05:05 to 15:10:11 while testnet job 1348 was created, paid and delivered. Before 72 events / 11 jobs; after 78 / 12 (exactly job 1348's six events), caught up 7 s after restart.
- verify-topics (`docs/phase2/evidence/verify-topics.json`): JobCreated, BudgetSet, JobFunded, JobSubmitted, JobCompleted, PaymentReleased, JobRejected, JobRegistered, JobSettled read from real logs and equal to the spec and ABI. Disputed, JobExpired, Refunded, NewFeedback, FeedbackRevoked: ABI equals spec, no live log yet.
- Finding: mainnet publicnode now serves only about 9,500 blocks of logs (P2-00 measured about 20,000). Catch-up after a longer outage goes through the archive node in 5-block ranges (D2-03-01).

### Incident: marketplace API 503 (found Sat 14:15, fixed 14:29)

`/api/v1/marketplace` returned 503 for every visitor ("SELECT DISTINCT ON expressions must match initial ORDER BY"), so `/register` listed no agents while its page answered 200. Cause: `canonicalAgentIdSql` binds ids as parameters and was written in both DISTINCT ON and ORDER BY. Fixed in c9d8496; the deploy smoke test now checks the marketplace API. The first redeploy failed at build (pnpm had resolved commerce's `@wagmi/core: "*"` peer to 3.x); peers pinned in c4bc48a, deployed c4bc48a.

### P2-02 testnet proof (Sat 26 Sep 14:04)

`docs/phase2/evidence/testnet-hire-proof.json`. Fresh wallet 0xC83d...f878, public API at https://marque.trade, five signatures per hire.
Sluicegate job 1343, Lattice 1344, Bound 1345, Keel 1346: each paid, delivered on chain in 37 to 47 s, and the public deliverable read back as a real answer (the proof now checks this). Cancel before paying: job 1347. Approve then revoke: allowance 0.
Two failures found and fixed on the way: job 1337 and the presets (tasks in plain English refused, D2-02-01) and job 1341 (upstream timeout on the paid path, D2-02-02).

### P2-00 checkpoint (Sat 26 Sep)

See the checkpoint block in the P2-00 report, reproduced here as it is finalised.

## Decisions from Francis

- [Sat 26 Sep] No LingoAI outreach. Build a second first-party yield agent instead (approved): done as Tidemark. Brain on BNB stays the key third-party seller.
- [Sat 26 Sep] Team public wallets sent and added to `config/team-wallets.json`. Deployer key held back until the mainnet phase; he funds addresses himself.

- [Sat 26 Sep] **"I APPROVE MAINNET"** (G-M1) for Phase 2: reference sellers, keeper and smoke hires on BSC mainnet. Funding (G-M2) per the P2-05 table; Francis sends from his own wallet, no private key is ever shared.
- [Sat 26 Sep] Support channels: X @marquetrade (official) and a Marque Telegram community group (link to follow).
- [Sat 26 Sep] Damian acknowledgement sent. Gwen's six questions pending; Francis is following up.
