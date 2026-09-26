# PROJECT_STATE.md

Live record of Phase 2. Newest first inside each section. Times are UTC.

## Phase status

| Phase | State | Notes |
|---|---|---|
| P2-00 Stabilise, measure, clean | DONE, checkpoint below | Probe incident root-caused and fixed, `/api/v1/agents` fixed, warrants re-run, protocol measured, repo cleaned |
| P2-01 Canonical supply | DONE | Quote engine, worker, supply audit; yield short one agent, filled by Tidemark (D2-02-03) once it has a mainnet identity |
| P2-02 ERC-8183 buyer rail | DONE on testnet | Hire API, sheet, job page live. Proof: all 4 categories paid and answered (jobs 1343-1346), cancel 1347, revoke to zero. Browser check passed 14:31 (desktop and phone, from /register) |
| P2-03 Quest Index and API | DONE (Sat 15:17) | marque-indexer on 56 and 97; /api/v1/phase2/{config,wallet,owner,job,coverage,stats} live; drill passed; 9 of 14 topics verified on real logs (ratings, dispute, expiry, refund pending real events) |
| P2-04 Ratings | DONE (Sat 15:45) | Test wallet rated all four on testnet, /wallet ratedAll true; self-rating refused and mapped; all 14 quest topics verified on real logs |
| P2-05 Mainnet cutover | DONE (Sat 17:13) | Sellers on 56 in U; keeper live; smoke hires 56806-56810 delivered and rated on mainnet; Francis runs the browser flow himself later |
| (was) P2-05 | PART 1 DONE, waiting on G-M2 funding | Fork test passed (USDT and U); sellers prepared on branch phase2-mainnet-sellers (U, max 2x); keeper 0x781e...556a; funding table below |
| P2-06 Handoff | DRAFTED (Sat 17:40), Francis sends | HANDOFF-BNB.md filled from measured values; paste-ready HANDOFF-BNB-send.md; brand kit at /brand/marque-brand-kit.zip; README Set and Earn section. Open: send date, Francis's Telegram handle | |
| P2-07 Kerbstone foundation | DONE (Sat 22:00) | Tokens (Night/Day/System, Chamber), General Sans + Instrument Serif + Plex Mono self-hosted, new shell (header pills, nav capsule, Proof menu, account menu, drawer, quest bar, footer), 20-part component set on /_ui, /protocol, every route re-shot; axe 0 serious on 5 routes x 2 themes |
| P2-08 Hire sheet, Job Room, Quest, My Marque | BUILT (Sat 23:00), acceptance run waits on funding | Hire sheet (per-category task forms checked against each agent's parser, live price, balance and gas check before any signature, named stepper, controls), Job Room (chain timeline, deliverable per category, raw file with hash check, actions per state incl. resume, reclaim, report, rate), /quest (recommendations, live progress, completion card), /me (spending controls with revoke). Recording needs ~0.4 U and ~0.003 BNB in each of two fresh wallets (Request below) |

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

- [Sat 23:00] [P2-08] [Francis] Fund the two P2-08 acceptance wallets on BSC mainnet: **0x4bfD3f9c81a743F852Fb424FD487A1c53d7786D5** (desktop run) and **0x317C5DddfE27D7d9bAaf41f2AD38E9B83B40f99D** (390 px mobile run), each **0.45 U** (the four hires cost 0.40 U at today's quotes) and **0.003 BNB** for gas (measured 1,225,691 gas per hire at 0.05 gwei, plus four ratings). Both are on the team list, so nothing they do counts for the campaign. Then `node scripts/p2-08-accept.mjs --wallet=/root/.marque/test-wallets/p2-08-desktop.json` records the run to docs/phase2/evidence/.

- [Sat 15:20] [P2-05] Tidemark wallet holds Francis's 0.0021 BNB (registration was sponsored). Kept for mainnet submit gas pending the P2-05 funding table; whatever is not needed goes back to 0x0d8c9ad8eebb6879fefa218f0799219bcaabe999.

- [Sat 14:10] [P2-05] [Francis] Send about 0.002 BNB on BSC mainnet to Tidemark's wallet 0x8122991297DC98Dc5c735fDE90a501528922aFdC for its ERC-8004 mainnet registration (needed before it can be listed and hired). The full P2-05 funding table follows before cutover.
- [Sat 14:10] [ops] Testnet operator 0x9598...7F9B is down to about 0.03 tBNB after funding Tidemark.

- [Sat 06:10] [build] [Francis] Optional: a free NodeReal or Ankr BSC API key for `eth_getLogs` history (PF-6). Not blocking launch.
- [Sat 05:20] [build] [Francis] Send the Damian acknowledgement and the six Gwen questions (private pack, section 5). Question 2 (completion at JobSubmitted vs JobCompleted) is now urgent because the mainnet window is 7 days.
- [Sat 05:20] [build] [Francis] Support channel for real users, and personal public wallet addresses for `config/team-wallets.json`.

## Evidence

### P2-08 (Sat 26 Sep 23:20)

- Hire sheet (`_components/HireSheet.tsx`, `hire/TaskForm.tsx`): opens from `?hire=` on any page (the marketplace URL sync now keeps it), Chamber surface, bottom sheet under 1024 px. Task forms per category compose sentences each agent's own parser accepts (`lib/hire-tasks.test.ts`: Keel, Lattice, Bound, Sluicegate, Tidemark). Live signed price with countdown, live escrow fee (`platformFeeBP` 0) and review window (604,800 s) from chain, network fee from the live gas price x 1,225,691 gas (measured on job 56810). Balance and gas checked before the first signature with a Swap to U link; batch rendering when the wallet reports EIP-5792 atomic support; `useHire` now separates "in wallet" from "confirming" with the tx link.
- Job Room (`/jobs/[chainId]/[jobId]`): chain-event timeline with plain names, the buyer's own task, the deliverable rendered per category (health factor with MeasureRule and exact repay, range plan with ticks, yield ranking with sources, grid ladder with fee drag), the raw file with a keccak256 check against the on-chain hash (job 56810: matches), actions per state (finish paying, cancel, reclaim, report a problem, rate on chain, hire again), live refresh until final.
- /quest: recommendations per category (Warranted, verified-buyer rating, delivered jobs, price), five live rows from the Quest API, wallet balances with Get U, honest team-wallet note, completion card with tx links and a share link; readable with no wallet; `?addr=` for any wallet. /me: quest, active jobs, history, spending controls (allowance per token to the escrow, revoke to zero), ratings given, owned agents with their five checks and jobs received.
- Screens: 80 state PNGs (no wallet, read-only connected wallet, hire sheet from form to live price to shortfall, Job Rooms: delivered, cancelled, testnet settled) at 1440/768/390 in Night and Day, `docs/phase2/screens/p2-08/` (on the VPS). No page errors.
- axe (`docs/phase2/evidence/axe-p2-08.json`): /quest, /me, /jobs/56/56810, /protocol, /register, Night and Day: 0 violations.
- Dead-button sweep (`scripts/audit-interactions.mjs` on /quest, /me, two Job Rooms, /protocol, /_ui): copy buttons now fall back when the Clipboard API is refused; every /_ui fixture button now says what it would do. The toast buttons were flagged by the audit but do render (checked separately).
- Acceptance (fresh wallet completes the quest from /quest, recorded): `scripts/p2-08-accept.mjs` + `scripts/headless-wallet.mjs` validated up to the first signature on the candidate with fresh wallet 0x4bfD...86D5 (connect, Quest 0/5, live quote, shortfall correctly blocks). The paid run waits on the funding Request.

### P2-07 (Sat 26 Sep 22:00)

- Screens: 23 routes x 390/768/1440 x Night/Day = 138 full-page PNGs in `docs/phase2/screens/p2-07/` (on the VPS, gitignored per invariant 30; D2-07-05). Every route 200, no horizontal scroll, no console errors or hydration warnings (`scripts/shots.mjs`).
- Fonts (`scripts/verify-fonts.mjs`, computed in Chromium): body General Sans 400 15px; h1 and statements Instrument Serif 400; buttons General Sans 500; hashes IBM Plex Mono 400. Faces loaded: General Sans 400/500, Instrument Serif 400 and italic, Plex Mono 400/500. No Geist or Fraunces file requested; both removed (licences in `docs/THIRD_PARTY.md`).
- Components (`apps/web/app/_components/ui`, stories on `/_ui`): Button/ButtonLink/IconButton, Badge (Hireable, Preview only, Warranted date, Tested: failed, Untested, Retest due, Marque reference, network), PriceTag (live quote countdown MEASURED / declared CLAIMED), Stars + StarInput, Kpi, Skeleton/EmptyState/ErrorState, AddressChip/HashChip, SectionHead, Disclosure, Tabs, Tooltip, Drawer, Sheet (bottom sheet < 1024, right panel >= 1024, Chamber surface), Modal, Field/SelectField, TxStepper (waiting, wallet, confirming, done, failed, skipped, batch), ErrorNote, Toaster (+ `lib/toast.ts`), QuestTracker + QuestProgress, Tape. Shell: SiteHeader, NavLinks + Proof menu, NetworkPill + StatusPill (`/api/v1/pulse`), WalletButton (RainbowKit custom theme from tokens, account menu with quest n/5), ThemeMenu (Night/Day/System), MobileNav drawer, QuestBar, SiteFooter with the traced giant wordmark.
- axe (`scripts/axe.mjs`, WCAG 2.1 A/AA, `docs/phase2/evidence/axe-p2-07.json`): /, /register, /agents/keel, /protocol, /status in Night and Day: 0 serious or critical, 0 other. First pass found Day brass buttons at 4.39:1 (fixed, D2-07-01) and focusable links inside the Tape's hidden loop copy (fixed).
- Brand: wordmark and lockup are potrace outlines of the brand art (`scripts/trace-brand.sh`); the brand kit zip now carries the traced vector lockup and wordmark and the Phase 2 colours.

### P2-05 part 2 (Sat 26 Sep 17:13)

Mainnet smoke (`docs/phase2/evidence/mainnet-smoke.json`), wallet 0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452 (team, funded by Francis), through the public hire API:

| Category | Agent | Job | Fund tx | Delivered tx | Rating tx |
|---|---|---|---|---|---|
| yield | Sluicegate | 56806 | 0x34f1567a... | 0x37ad4a6c... | 0x7b37152a... |
| yield | Tidemark | 56807 | 0x5dc97243... | 0x8a332f73... | none |
| grid | Lattice | 56808 | 0x04683248... | 0xe860ae36... | 0x4aa37f89... |
| rebalancing | Bound | 56809 | 0x6feee514... | 0x3beecda0... | 0x89927200... |
| health_factor | Keel | 56810 | 0x767be68f... | 0xdc4a2b97... | 0x9f5941b9... |

Cancel 56811 (0xa9a03fed...), orphan 56805 cancelled (0xd8a41fa3...), approve then revoke to 0 (0x6bdf3f4c...). Full hashes in the evidence files. Keeper 0x781e...556a live on 56 (MegaFuel-sponsored settles); first settle due Sat 3 Oct.

### P2-05 part 1 (Sat 26 Sep 15:55)

- Fork (`docs/phase2/evidence/mainnet-fork-test.json`, anvil on the archive node at block 124166260, real mainnet contracts): USDT via createJobWithToken and U via createJob both reach FUNDED through register, setBudget, approve exact, fund.
- Token choice: **U**. Mainnet `paymentToken()` is U, and seller SDK 0.5.5 `verifyJob` rejects a signed currency that differs from it, so USDT fails SPEC-COMMERCE 3 rule 2 for the reference sellers.
- Sellers prepared on branch `phase2-mainnet-sellers` (worktree /root/marque-mainnet, commit ee582d0): bsc-mainnet, U, prices unchanged, max_price 2 x price. Not started.
- Keeper wallet 0x781ee69bf9f9C14E2BC496181714f4DF5348556a (keystore /root/.marque/keeper, outside the repo). Mainnet smoke wallet 0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452. Both in team-wallets.json.
- Funding (`docs/phase2/evidence/mainnet-funding-table.json`): gas measured from testnet receipts (submit 204,611, settle 135,224), mainnet 0.05 gwei. MegaFuel pm_isSponsorable: settle from the keeper SPONSORED (Pieverse); seller submit NOT sponsorable. 100 submits = 0.00102 BNB per seller.

### P2-04 checkpoint (Sat 26 Sep 15:45)

- Ratings (`docs/phase2/evidence/testnet-rating-proof.json`): yield job 1338 Sluicegate 5/5, grid 1339 Lattice 4/5, rebalancing 1340 Bound 5/5, health factor 1337 Keel 3/5, all through /api/v1/phase2/rate and the wallet's own signature. `/wallet` returns ratedAll true with each tx.
- Owner self-rating: the registry reverts `Self-feedback not allowed` (a require string, not a custom error); mapped to "You cannot rate an agent you own or operate."
- Unhappy paths staged (`docs/phase2/evidence/testnet-unhappy-paths.json`): job 1349 delivered then disputed (DISPUTED); job 1350 paid to an address that cannot deliver, expired, refunded (REFUNDED; claimRefund logs Refunded before JobExpired).
- verify-topics: all 14 events read from real logs, equal to spec and ABI.

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
