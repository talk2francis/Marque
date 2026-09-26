# PROJECT_STATE.md

Live record of Phase 2. Newest first inside each section. Times are UTC.

## Phase status

| Phase | State | Notes |
|---|---|---|
| P2-00 Stabilise, measure, clean | DONE, checkpoint below | Probe incident root-caused and fixed, `/api/v1/agents` fixed, warrants re-run, protocol measured, repo cleaned |
| P2-01 Canonical supply | NEXT | |
| P2-02 ERC-8183 buyer rail | queued | |
| P2-03 Quest Index and API | queued | |
| P2-04 Ratings | queued | |
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

- [Sat 06:10] [build] [Francis] Optional: a free NodeReal or Ankr BSC API key for `eth_getLogs` history (PF-6). Not blocking launch.
- [Sat 05:20] [build] [Francis] Send the Damian acknowledgement and the six Gwen questions (private pack, section 5). Question 2 (completion at JobSubmitted vs JobCompleted) is now urgent because the mainnet window is 7 days.
- [Sat 05:20] [build] [Francis] Support channel for real users, and personal public wallet addresses for `config/team-wallets.json`.

## Evidence

### P2-00 checkpoint (Sat 26 Sep)

See the checkpoint block in the P2-00 report, reproduced here as it is finalised.
