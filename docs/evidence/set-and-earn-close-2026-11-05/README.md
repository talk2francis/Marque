# The record at the close of Set and Earn

Set and Earn ran from **1 October 2026, 12:00 UTC to 5 November 2026, 12:00 UTC**. These files hold Marque's public record at the close, read from Marque's own public APIs. States after the close may still change (settlements, ratings); the set of jobs does not.

The close itself is tagged in git as `set-and-earn-close-2026-11-05`, on commit `0fb7ba5`, the release that was live at 12:00 UTC.

| File | What it is | Read from | Read at (UTC) |
|---|---|---|---|
| `proof.json` | Every job hired through Marque created before 2026-11-05T12:00:00Z, on BSC mainnet and testnet, with its state as read at `readAt` | `/api/v1/proof` | 2026-11-05 15:49 |
| `funnel.json` | Registered, reachable and hireable counts on BSC mainnet | `/api/v1/funnel` | 2026-11-05 15:49 |
| `coverage-56.json` | Hireable, checked and warranted supply on BSC mainnet | `/api/v1/phase2/coverage?chainId=56` | 2026-11-05 15:49 |
| `coverage-97.json` | The same for the practice lane, BSC testnet | `/api/v1/phase2/coverage?chainId=97` | 2026-11-05 15:49 |
| `stats.json` | Jobs that count under Set and Earn rules | `/api/v1/phase2/stats` | 2026-11-05 15:49 |
| `close-figures.json` | The figures Francis read for the film at 12:00:24 UTC, exactly as recorded | the same APIs | 2026-11-05 12:00:24 |
| `quest/<wallet>.json` | The quest record of the six outside mainnet wallets and three team wallets, the baseline `scripts/close-guard.mjs` compares against after every deploy | `/api/v1/quest/<wallet>` | 2026-11-05 15:48 to 15:49 |
| `SHA256SUMS` | SHA-256 of every file above. This README is not in it, so the anchor hash can be written here | `sha256sum` | |

Each file carries its own `readAt` (or `observedAt`) and the API it came from.

## Two figures moved between 12:00:24 and the later read

`close-figures.json` says 48 outside jobs on BSC mainnet, 45 of them delivered, and the last job created at 06:50:32 UTC. `proof.json` holds **50** outside jobs created before the close, **46** delivered. The two more are jobs 57188 and 57189, created at 11:57:42 and 11:58:48 UTC from the same outside wallet, already one of the six. They were indexed after the 12:00:24 read. Every other figure matches: 6 wallets, 34 jobs from wallets that also run agents listed on Marque, 27 settled, 78 of 81 chain checks agreeing, 25 team test jobs, 24 outside jobs on BSC testnet.

## How to check it

Download the files, run `sha256sum -c SHA256SUMS`, and compare any row in `proof.json` with the job on BscScan through its `hireTx` and `verifyUrl`.

## Testnet timestamp anchor, 6 November 2026

Keccak-256 of the original `SHA256SUMS` file's exact bytes: `0x7ee2aa98522bb14615bd9b494ab9d08552734de4f8d21a483b7ec63ede58aa76`. The manifest and every file it covers are unchanged. This README is excluded from that manifest.

Anchored on BSC testnet (97) at block 141098389, 2026-11-06T06:05:53.000Z: [transaction](https://testnet.bscscan.com/tx/0x86a8bafbca9824e872d3bf5754a51dac9e2d7204425389b0c0b70c06c4c5a24d). Registry `0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7`, anchoring wallet `0x9598AB46aAB33389C2e9Ffe0511effD330f67F9B`. The receipt succeeded and its `Anchored` event, leaf and first anchored block were checked against the chain. [Receipt](../close-anchor-2026-11-06.json).

This proves these checksum bytes existed by that testnet block. It does not prove the figures, independence, quality, payment or official eligibility, and it does not backdate the later API read to the close. No mainnet anchor has been submitted. Run `node scripts/verify-close-record.mjs` from the repository to check the files and digest offline.
