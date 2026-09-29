# PROJECT_STATE.md

Live record of Phase 2. Newest first inside each section. Times are UTC.

## P2-12 Crucible (in progress, Mon 28 Sep)

Verdict: **SHIP**. Golden path passed on BSC mainnet at 390 px on 28 Sep (funded and
"approved, mainnet" by Francis); every item below is PASS or PARTIAL with its reason.

### Crucible checklist (LAUNCH-RUNBOOK section 7)

| Item | Status | Evidence |
|---|---|---|
| A. Eligibility | PASS / PARTIAL (reasons below) | Matrix walk, 28 Sep 03:10 UTC |
| B. Golden path | PASS | Fixture `0xDa53...3C8a` (team list), 390 px, mainnet: yield 56839 (Sluicegate), grid 56840 (Lattice), rebalancing 56841 (Bound), health factor 56842 (Keel), each paid, delivered and rated; /quest 4 of 5 (the fifth needs an agent the wallet built; /builders shows exactly that); /me spending controls; revoke from the phone UI took a 0.01 U allowance to 0 (approve 0xcfeefa57...). Two stalls on the way were real bugs, fixed (below). Evidence `evidence/p2-12/*.json` |
| C. Protocol | PASS | All 29 transactions the wallet API lists for the fixture succeeded on chain, to AgenticCommerce (20), EvaluatorRouter (5) and the ERC-8004 ReputationRegistry (4); allowance to the escrow 0 before and after the run |
| D. Tracking | PASS | `/wallet` for the fixture: 5 hires, every hash on chain, ratedAll true, eligible false with reason team_wallet; topic0 verified (`evidence/verify-topics.json`) |
| E. Security | PASS | No `maxUint256` approval anywhere (the only hit is Redcell detecting them); `approveFloor` unused; no API route (44 scanned) takes a key or phrase; every agent call goes through `safeFetch` (27 files), 23 SSRF tests pass; quotes verified (`quote.ts` wrong_contract, negotiation hash); the five test-wallet private keys appear nowhere in the repo; no token patterns in tracked files |
| F. UX | PARTIAL | Hire-sheet messages checked live (below). A fresh 5-second test was not re-run after the refresh (the API keys are revoked); the P2-09 one passed. Job Room states: delivered and cancelled captured in P2-08; settled arrives after the 7-day window (first keeper settle due Sat 3 Oct) |
| G. Responsive, a11y | PASS | 156 captures (26 routes, 390/768/1440, Night and Day) on the release candidate: zero horizontal scroll, zero console errors after the hydration fix. Axe on 13 routes in both themes: one serious finding (a `<p>` in the home record's `<dl>`), fixed in ef6294c; all others zero (`evidence/axe-p2-12.json`). Keyboard: Hire reached by Tab, focus trapped in the sheet, fields typed, Escape closes |
| H. Reliability | PASS | LOAD-TEST.md within targets to 100 users; five blue/green swaps today with every public smoke check 200; restore drill passed (27 Sep); nightly backup ran 01:18 (109 MB); offsite OAuth still pending |
| I. Claims | PASS | Visible text of home, /quest, marketplace, a storefront and the hire sheet scanned against AGENTS 13.7: no custody, guarantee, "verified agent", instant-refund, volume or competitor claims. Marketplace appendix corrected (it said a free preview is graded, and "one agent per category"). Remaining dashes on /register are inside third-party registry text (CLAIMED), not ours; README keeps Phase 1 dashes (baseline) |
| J. Handoff | PARTIAL | Ready and answered by Gwen (27 Sep); attribution confirmation still with Gwen |

Dead-button sweep (Night, 24 routes): 81 unique internal links, 0 broken; 159
buttons clicked on fresh loads, 2 without a DOM change, both correct (the already
selected network tab on /protocol, and "Find identity" with an empty required
field, which raises the browser's own validation bubble).

### Hostile checks (live, read-only fixture wallet: nothing can be sent)

| Check | Result |
|---|---|
| Wrong network (wallet on 97) | The action reads "Switch to BSC mainnet and hire" |
| Rejected signature | "You declined the request in your wallet. Nothing was sent. Continue when you are ready." |
| Insufficient token (0.05 U for a 0.15 U hire) | "You need 0.15 U and have 0.05 U." with "Check my balance again"; no signature asked |
| Insufficient gas | Preflight balance check and error map (`insufficient_gas`: "Your wallet does not have enough BNB to pay the network fee"). No fixture holds U without BNB, so not exercised live |
| Quote expiry mid-flow | Quote shown with 14:56 left, sheet left open 16 min: it reads "Quote expired"; pressing Hire re-quoted and went on to "Lock the price at 0.05 U" (then declined in the read-only wallet). Code review found an edge case, fixed: after an earlier declined attempt, a re-quote reused the intent bound to the old quote; a fresh quote now always gets a fresh intent |
| Seller down | `marque-redcell` stopped 03:29:25; out of Ready to hire at 03:32:48 (3 min 23 s, inside one 5 min T0 cycle); restarted 03:32:57, back at 03:33:29. The storefront page cache (30 s) still offered Hire for up to that long |
| Indexer restart | Restarted 03:33:40; resumed from its cursor, lag 6 to 16 blocks throughout, Quest API 200 |
| Web restart during a job | Five blue/green swaps today, every smoke check 200; job state is chain-derived, nothing held in the web process |
| Closing the tab after funding | Job 56843: the browser was closed the moment the payment was sent (13:16:23), before its notify. Marque's worker notified Keel at 13:16:55, Keel worked at 13:16:58 and its submit was mined at 13:16:59 (block 124531233). Correction 29 Sep: an earlier note said 13:20:30; the chain says one second. Keel's runtime still waited 300 s on a receipt its RPC never served, then retried six times against the delivered job; fixed in agents/*/src/sellerCore.ts (receipt from any node; a job past FUNDED ends the retries) |

### Bugs found and fixed in this pass

- Golden path, job 56839: the seller accepted the notify, could not read the block
  that was seconds old, and dropped the job; its only retry was a sweep that was
  timing out. Sellers now retry a named job (6 tries, re-verified on chain), and
  Marque re-notifies a job still FUNDED 4 min after its last notify.
- Golden path, job 56842: bind waited on one lagging RPC node for the createJob
  receipt and the sheet stopped with the job open (the Job Room's Finish paying
  recovered it). Bind now takes the first real answer from every node in the pool.

- Hire sheet: typing into a field kept only the first character; the focus trap
  re-ran on every render and threw focus to Close (since P2-08; scripted runs used
  `fill`). Fixed in ef6294c, verified live by typing a full address.
- Connect pressed before the wallet island loaded could open nothing (e63346f).
- Pancake Desk: Bound's price, MCS status and liveness were typed constants; now
  read from its storefront record (e63346f).
- Home record list markup (axe serious), marketplace pagination dash, marketplace
  appendix copy.
- Re-quote after an expired quote reused the old hire intent (useHire).
- The `/_ui` component gallery (fixture rows) was publicly reachable; it now 404s
  in production unless `MARQUE_UI_GALLERY=1`.
- Compare: its Hire button went to /app/charter (the testnet charter sandbox), not
  the mainnet hire; its rows read Phase 1 receipts ("no receipted attempt yet" for an
  agent with paid mainnet jobs) and showed "reachable" with a red dot. Rebuilt on
  Phase 2 data: hireable with live quote, paid ERC-8183 jobs, verified buyers, Try
  free; Hire opens the hire sheet (1b8d570).
- Marketplace and storefront verdicts: the conformance worker runs all four MCS tests
  on a third party and the page showed whichever failure sorted first, so grid and
  rebalancing agents read "failed MCS-YIELD-1". A classified agent now shows only its
  own category's test; the storefront table still lists every result (1cf1f4d).

### Matrix walk (A)

| Row | Status | Evidence / reason |
|---|---|---|
| C1 URL, socials, one-liner | PASS | marque.trade, @marquetrade, t.me/marque_marketplace, one-liner in HANDOFF |
| C2 Tracking details | PASS | `/api/v1/phase2/{config,wallet,owner,job}` live; 14 topics |
| C3 Ready for traffic, support | PASS | Blue/green, LOAD-TEST.md, Telegram support in footer and docs |
| C4 Brand kit | PASS | /brand/marque-brand-kit.zip |
| C5 Fair play | PASS | Team wallets (17) excluded; anti-wash reasons in API; no incentives of our own |
| 1.1 Own domain | PASS | marque.trade |
| 1.2 Public, no wallet to browse | PASS | Logged-out sweep of 26 routes, 3 widths, 2 themes |
| 1.3 Live | PASS | |
| 1.4 Stable | PASS | `/api/v1/agents` p50 65 ms, p95 131 ms (20 requests, 03:10); zero-error swaps |
| 2.1 Mainnet | PASS | Mainnet hires 56806 to 56820 |
| 2.2 Network stated | PASS | Header pill; every price, hire, job and receipt carries its chain |
| 2.3 Mainnet after campaign | PASS | Already mainnet |
| 3.1 Agents from ERC-8004 | PASS | `REFERENCE_AGENTS` absent from lib/marketplace.ts; reference rows are registry rows |
| 3.2 No mock or typed data | PASS | Last typed price (Pancake Desk) removed in e63346f; the rest are layout copy in `/_ui` stories |
| 3.3 Contract addresses shown | PASS | /protocol, /docs#contracts (read from the pinned SDK) |
| 3.4 Per-agent evidence | PASS | Third-party 304493 shows its receipt-verified registration tx 0x1f1c…8492 |
| 3.5 Stale agents said so | PASS | T0 6 of 6 fresh; seller-down check above |
| 4.1 Four categories | PASS | |
| 4.2 Three per category | PARTIAL | Hireable 3/4/4/3 (yield/grid/rebalancing/health factor). Non-Marque operators 1/3/3/2: yield sits on rung 3 of 13.8 (a second first-party agent, Tidemark, with a different method) |
| 4.3 Few unclassified | PASS | 0 unclassified in the default view (15 rows) |
| 4.4 Detail pages | PASS | Storefront spec 8.4 on every agent |
| 5.1 Hire end to end | PASS | Eight funded acceptance hires, desktop and 390 px (P2-08) |
| 5.2 Names the agent | PASS | Hire sheet: portrait, name, category, ERC-8004 id |
| 5.3 Scoped permissions | PASS | Exact approval equal to the price |
| 5.4 Caps and revoke | PASS | Cancel 56811, approve then revoke to 0 (0x6bdf3f4c…), testnet refund on job 1350 |
| 6.1 to 6.4 Tracking | PASS | HANDOFF tables, verify-topics.json, live APIs |
| 6.5 Team wallets | PASS | 17 in config and both handoffs |
| 7.1 to 7.3 Repository | PASS | Public, README Phase 2 section, real history |
| 7.4 Nothing embarrassing | PASS | Root clean since P2-00 |
| Q1 to Q5 | PASS | /quest, /me, named stepper, /builders, support and error map |

### Waiting on Francis

1. Google Drive OAuth for recurring offsite backups (BACKUP-DRIVE.md).
2. Add @MarqueTradeBot to the Telegram group for alerts.

### Supply (28 Sep)

Hireable means a live quote signed for Marque, payable into BNB Chain's ERC-8183
escrow now. Measured on 28 Sep: 30 agents, 16 in the four jobs plus security
(yield 4, grid 4, rebalancing 5, health factor 3, security 1) and 14 outside them,
listed as Other. A deep sweep asked 1,407 never-asked live A2A agents on all 22
hosts for a price: no escrow seller among them (TermiX, bortagent and singularry,
97% of the registry's live A2A endpoints, do not quote). The classifier relabel
moved 234 agents into categories. Mandate lists 23 "hireable": its rule is an
endpoint that answered its census; 2 of those have dead escrow endpoints, 2 are web
pages, 4 are its own x402 agents with no services declared on chain.

## User-requested post-handoff refresh (27 September, deployed)

P2-12 remains held. See [REFRESH-2026-09-27.md](./REFRESH-2026-09-27.md).
Both handoffs now contain all 16 configured team wallets. Private Telegram test
delivered successfully; both monitors restarted. Green action palette, rewritten
Phase 2 docs and six library pages, desktop Docs dropdown and mobile library links
are implemented. Registration evidence is receipt-checked for third parties.
Builder callability no longer lets an earlier success hide a later failed attempt;
availability sample scope is explicit. Continuous task uptime is not yet a gate.

Verification so far: typecheck and lint pass; 383 tests pass, 3 RPC tests skipped;
copy lint passes. Release `6b0f2b5` deployed at 22:42 UTC after candidate browser,
CSP, wallet-modal and populated My Marque checks passed; all seven public smoke
checks returned HTTP 200. Initial review covered 42 routes at three widths in both
themes, followed by 72 release captures. Axe found zero violations on 11 release
routes in both themes. The click-target follow-up `62caff0` is pushed to both branches
and is deploying. No mainnet transaction was sent during this refresh.
Initial encrypted Drive archive uploaded in three parts with owner-only access;
download hashes, decryption and the scratch database restore drill passed.
Recurring OAuth setup and an independent copy of the recovery key remain outstanding.

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
| P2-06 Handoff | READY TO SEND (Sun 10:40), Francis sends | Gwen's six replies recorded; hire/deposit/rating confirmed, both completion events reported, API shape accepted, measured uptime added, attribution remains with Gwen for confirmation; Telegram support link added; placeholders removed |
| P2-07 Kerbstone foundation | DONE (Sat 22:00) | Tokens (Night/Day/System, Chamber), General Sans + Instrument Serif + Plex Mono self-hosted, new shell (header pills, nav capsule, Proof menu, account menu, drawer, quest bar, footer), 20-part component set on /_ui, /protocol, every route re-shot; axe 0 serious on 5 routes x 2 themes |
| P2-08 Hire sheet, Job Room, Quest, My Marque | DONE (Sun 00:05), acceptance passed on mainnet, desktop and 390 px |
| P2-09 Home, marketplace, storefronts | DONE (Sun 02:30) | Home per 8.1 (Phase 1 funnel moved to /why), marketplace tabs and filters with the two-axis card, one storefront for every agent with a sticky purchase panel, Try free on the agent's own endpoint; 5-second test passed first time | Hire sheet (per-category task forms checked against each agent's parser, live price, balance and gas check before any signature, named stepper, controls), Job Room (chain timeline, deliverable per category, raw file with hash check, actions per state incl. resume, reclaim, report, rate), /quest (recommendations, live progress, completion card), /me (spending controls with revoke). Recording needs ~0.4 U and ~0.003 BNB in each of two fresh wallets (Request below) |
| P2-10 Builder path | DONE (Sun 03:00) | /builders five-check list for BSC mainnet and testnet identities; verdict in packages/registry/src/quality.ts; Probe now; owner-declared category checked against the classifier; /owner returns qualityListing; throwaway testnet agent #2501 went 2 to 5 of 5 in the browser |
| P2-11 Launch hardening | Core shipped; recurring offsite setup pending | Blue/green proven under request load; original CI and 100-user load evidence below. Private Telegram delivery tested. Initial encrypted Google Drive archive downloaded and restored successfully; recurring OAuth and an independent recovery-key copy remain pending. |

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

- [RESOLVED by private-chat configuration] [P2-11] The earlier group-membership request is superseded. The user supplied a private chat destination; delivery succeeded and both alert monitors reloaded their private configuration. The public group remains the support channel, not the operational-alert destination.

- [Sun 10:40] [P2-06] Gwen confirmed `JobCreated` for hire, nonzero `JobFunded` for deposit, both `JobSubmitted` and `JobCompleted` for completion reporting, and client-sent ERC-8004 `NewFeedback` for rating. She accepted the documented JSON shape, requested good uptime as an additional quality signal, and is still checking marketplace attribution. Recorded in both handoff files.

- [DONE Sat 23:50, funded by Francis] [P2-08] [Francis] Fund the two P2-08 acceptance wallets on BSC mainnet: **0x4bfD3f9c81a743F852Fb424FD487A1c53d7786D5** (desktop run) and **0x317C5DddfE27D7d9bAaf41f2AD38E9B83B40f99D** (390 px mobile run), each **0.45 U** (the four hires cost 0.40 U at today's quotes) and **0.003 BNB** for gas (measured 1,225,691 gas per hire at 0.05 gwei, plus four ratings). Both are on the team list, so nothing they do counts for the campaign. Then `node scripts/p2-08-accept.mjs --wallet=/root/.marque/test-wallets/p2-08-desktop.json` records the run to docs/phase2/evidence/.

- [Sat 15:20] [P2-05] Tidemark wallet holds Francis's 0.0021 BNB (registration was sponsored). Kept for mainnet submit gas pending the P2-05 funding table; whatever is not needed goes back to 0x0d8c9ad8eebb6879fefa218f0799219bcaabe999.

- [Sat 14:10] [P2-05] [Francis] Send about 0.002 BNB on BSC mainnet to Tidemark's wallet 0x8122991297DC98Dc5c735fDE90a501528922aFdC for its ERC-8004 mainnet registration (needed before it can be listed and hired). The full P2-05 funding table follows before cutover.
- [Sat 14:10] [ops] Testnet operator 0x9598...7F9B is down to about 0.03 tBNB after funding Tidemark.

- [Sat 06:10] [build] [Francis] Optional: a free NodeReal or Ankr BSC API key for `eth_getLogs` history (PF-6). Not blocking launch.
- [Sat 05:20] [build] [Francis] Send the Damian acknowledgement and the six Gwen questions (private pack, section 5). Question 2 (completion at JobSubmitted vs JobCompleted) is now urgent because the mainnet window is 7 days.
- [Sat 05:20] [build] [Francis] Support channel for real users, and personal public wallet addresses for `config/team-wallets.json`.

## Evidence

### P2-11 (Sun 27 Sep 04:35)

- Deploy (`scripts/deploy-web.sh`): builds HEAD into `releases/<sha>`, starts it on the idle port (PM2 `marque-web` on 3200 or `marque-web-b` on 3201, two processes each), health-checks `/api/health` and key pages, runs verify-candidate, warms the pages, rewrites `/etc/caddy/marque-upstream.caddy` and reloads Caddy (graceful), smoke-tests through the public URL (switching back on failure), and stops the old slot after 5 min. Rollback: `bash scripts/deploy-web.sh --rollback` (restarts the previous slot if needed, switches back, cancels its pending stop); `--status` shows both slots.
- Swap proof: a curl loop on `/`, `/api/health`, `/register`, `/quest` every 0.2 s ran through four switches (3200 to 3201 at 01:06:45; 3201 to 3200 at 01:39:53; rollback to 3201 at 01:40:18; forward to 3200 at 01:40:35): 348 requests inside the switch windows, 0 not 200; 4,660 requests in all, every status 200 (4 home loads took over 20 s during a build on the old release; fixed by serving the marketplace set stale while it refreshes). Logs: `/root/.marque/p2-logs/swap-proof*.log`.
- CI: `.github/workflows/ci.yml`, run https://github.com/talk2francis/Marque/actions/runs/36286561485 green (typecheck, lint, lint:copy, unit tests, web build against an empty migrated Postgres; Playwright smoke of home, marketplace, a storefront and /quest with no wallet). Badge in README. Two earlier runs failed at the smoke job's Playwright install (fixed).
- Load: `docs/phase2/LOAD-TEST.md`. Final run: 25 / 50 / 100 users page p95 93 / 116 / 462 ms, API p95 142 / 97 / 489 ms, 0 5xx, 0 restarts; 250 users 1,123 / 1,804 ms (D2-11-04). First run (every page rendered per request) was 2.7 s p95 at 25 users; fixed by page-caching the visitor-independent pages for 30 s and two web processes per slot.
- Memory budget: in LOAD-TEST.md. Workers now run as one process so PM2's ceilings watch the real worker (they watched a 19 MB tsx wrapper); ceilings set from measured peaks; Redis capped at 256 MB.
- Alerts: `ops/marque-alerts.mjs` (PM2 `marque-alerts`, every minute): indexer lag over 200 blocks for 2 min, a reference seller with no good quote in 25 min, a quest category under 3 hireable for 5 min, 5xx over 1% for 5 min (new Caddy JSON access log), keeper BNB under 0.0005, disk over 80%, restart loops (3 in 10 min), seller process-tree memory, paid jobs with no successful notify after 10 min. `--test` fired all nine at 01:34 UTC. Bot token and group chat id were configured at 10:40 UTC; the bot must still be added as a group member before Telegram permits delivery.
- Backups: nightly dump runs (103 MB on 27 Sep); restore drill into a scratch DB passed on the 27 Sep dump with the Phase 2 tables added to the check (`/root/.marque/p2-logs/restore-drill.txt`). Offsite target needed (D2-11-02).
- Cloudflare: not touched (no approval).

### P2-10 (Sun 27 Sep 03:00)

- `/builders` (`app/builders/BuilderChecklist.tsx`): connect, pick an identity (indexed mainnet agents the wallet owns, any it has proved, or look one up by network and token id), and each check shows pass, "Needs a fix" with the exact fix, or "Not yet", with its action inline: Sign the proof (no gas), Probe now (endpoint prefilled from the identity's own record), Declare a category, Run the category's MCS test. All five: "Listed on Marque", with the quest link. Build-one panel: `pip install bnbagent-studio`, `bag` in Claude Code or Cursor, the docs, the open-source reference agents as templates, and the note that the quest needs your own agent.
- Verdict: `packages/registry/src/quality.ts` (8 unit tests), facts in `apps/web/lib/builder.ts`: ownerOf and tokenURI read live on 56 or 97; stored proofs (`builder_proof`) count only when signed by the current owner; callable within 24 h from Marque's probe or Probe now (`builder_check`, first-party observations, additive migration 0019); the owner's category counts when the classifier agrees or has no signal, otherwise it is flagged; the test counts when the answer was well-formed (a pass also earns a Warrant). When all five pass, a published `builder_listing` row is written and the quest's fifth row reads it.
- APIs: `GET /api/v1/builders/checks`, `POST /api/v1/builders/probe`, `POST /api/v1/builders/declare`; claim identity and verify take `chainId: 97`; `GET /api/v1/phase2/owner/:address` returns `qualityListing` and each agent's checks with state, reason and fix (same shape for /me and /quest).
- Acceptance (candidate, real Chromium, headless wallet): throwaway ERC-8004 #2501 on BSC testnet (registered by `scripts/p2-10-throwaway.mjs`, tx 0xb37c868e962a2a001be60712b81f980647f1d29cb0a16c59579916513111d56c, owner 0x4e9C0f537cCcA8Db4BDD16FBA9Ff306F86a82505 on the team list). States: found `pass fail fail pass pending`, proved `pass pass fail pass pending`, probed `pass pass pass pass fail`, tested `pass pass pass pass pass`, listed. `/owner` returned `qualityListing: true` with all five `pass`; `/wallet` returned `ownAgentListed: { done: true, agentKey: 97:0x8004a818...:2501 }` (`docs/phase2/evidence/p2-10-accept.json`). A non-owner wallet sees `fail pending pass pass pass`. Screens in `docs/phase2/screens/p2-10/` (on the VPS).
- Found and fixed: the public Test-your-agent harness had failed on every run since 21 Sep (D2-10-03).

### P2-09 (Sun 27 Sep 02:30)

- Home (`app/page.tsx`, `lib/home-data.ts`): serif hero with the quest and marketplace CTAs over a text-free crop of the Field art, and a live card of the newest delivered mainnet hire (quote, escrow, delivery and rating steps with tx links); the Tape of real Marque hires and ratings (team wallets tagged); four category tiles from `/coverage` (hireable count against a MeasureRule with 3 as the market line, operators, cheapest live quote, best verified rating); six Ready-to-hire cards mixing categories; how a hire works with the three protections; Why Marque (pass and fail pair, one-line funnel with live counts, Ledger headline from complete benchmarks); the builders checklist. The Phase 1 long funnel, evidence and charter band moved whole to `/why` (linked from the home, the Proof menu and the footer).
- Marketplace (`/register`): tabs Ready to hire (default), Try free, All tested, Registry (the graveyard table); filters for network, token, max price, verified rating, Warranted only, Marque reference only or third-party only, interface, live now; sorts Recommended, Cheapest, Fastest (measured paid-to-delivered median, else probe latency), Best rated, Recently tested; the card (`_components/market/AgentCard.tsx`) shows both axes (Hireable and live price, Warranted or the dated failure) plus verified rating, delivery time and quote age; FLIP reorder and the compare tray kept. API: `tab`, `network`, `token`, `maxPrice`, `minRating`, `firstParty`, `sort=rated`; each row carries `track` (`lib/agent-track.ts`: verified-buyer rating apart from all feedback, jobs by outcome, delivery median, from chain events).
- Storefront (`app/agents/_storefront`, `lib/storefront.ts`): one page for reference and third-party agents at `/agents/<slug>` and `/agents/56/<token>`; sticky purchase panel (live quote with age, delivery time, verified rating, jobs delivered, Hire, Try free, "What you authorise"), a bottom bar under 1024; sections in order: what it does (CLAIMED), what you get (the latest delivered job's deliverable with its on-chain hash check), track record (paid, delivered, settled, refunded, disputed; verified buyers beside all registry feedback; reviews with tx links), Marque verification, how it works (review window read from chain), permissions, identity and evidence with BSC mainnet links. The old hardcoded "0.15 U per call" and the Hire link into the charter sandbox are gone.
- Try free: `POST /api/v1/hire/try` sends the buyer's task to the agent's free face through safeFetch (the same service Hire pays, or its live A2A service), and the hire sheet runs it from `?hire=<id>&try=1` or "Try it free first". Keel answered a real task in 6.3 s.
- Fixes on the way: Job Room deliverable fetch now goes through safeFetch (`lib/manifest.ts`); prices read 0.10 U, not 0.1 U; copy buttons no longer hang when the clipboard permission is never answered; footer gained a live chain line (block, quest index lag, reference sellers answering), a Follow column, every hidden page (/why, /app/charters, /judge, brand kit) and a brighter giant wordmark.
- 5-second test, 1440 Night home, fresh model, first attempt: "This is Marque, a marketplace on BNB Smart Chain where you hire AI agents to do on-chain jobs, such as checking a health factor or rebalancing. Marque tests each agent before you pay, holds your payment in an escrow contract until the work is delivered, and records every hire on chain. You can browse agents or start the 'Set and Earn' quest without connecting a wallet, and you only need to connect one when you want to hire an agent. The main thing I wasn't sure about was the 'team test' tags on the latest hire and the activity ticker..." The tag now reads "team wallet" and the card explains it in a sentence (D2-09-04 on how the test was run).
- Screens: home, marketplace, Keel, Brain on BNB and /why at 390, 768 and 1440 in Night and Day (30 full pages, `docs/phase2/screens/p2-09/`, on the VPS), no console errors. axe (`docs/phase2/evidence/axe-p2-09.json`): 0 violations on all five routes in both themes.
- Lighthouse mobile (candidate): home 56 / 100 / 100 / 91, marketplace 54 / 99 / 100 / 91, Keel 50 / 100 / 100 / 91, Brain on BNB 53 / 100 / 100 / 91 (performance, accessibility, best practices, SEO); desktop home 88, LCP 1.5 s. The SEO gap (no meta description on the home) is fixed; mobile performance is D2-09-01.

### P2-08 acceptance (Sat 26 Sep 21:54 to 22:04 UTC, BSC mainnet)

Fresh wallets funded by Francis, driven from `/quest` on production by `scripts/p2-08-accept.mjs` (real Chromium, RainbowKit Connect, `scripts/headless-wallet.mjs` signing). Every row ticked from the chain; the Quest API returns `ratedAll: true` for both. Recordings and stills stay on the VPS (`docs/phase2/evidence/*.mp4|png`, gitignored, invariant 30); the run logs are `docs/phase2/evidence/p2-08-accept-*.json`.

| Wallet | Width | Yield | Grid | Rebalancing | Health factor |
|---|---|---|---|---|---|
| 0x4bfD…86D5 | 1440 | 56813 Sluicegate | 56814 Lattice (55 s) | 56815 Bound (63 s) | 56816 Keel (49 s) |
| 0x317C…9f9D | 390 | 56817 Sluicegate | 56818 Lattice (63 s) | 56819 Bound (69 s) | 56820 Keel (74 s) |

Seconds are from clicking Hire to the sheet showing Delivered (all signatures included). Each job: fund, deliver and rating tx on BscScan via `/jobs/56/<id>`.

Found and fixed during the run (c348252, deployed): the "Delivered" toast sat over the sheet's "Open the job room" button (toasts now sit beside the panel on desktop and above the bottom sheet on phones); the status pill flapped to Degraded because T0 probes landed every ~10 min against a 10 min window (probe cycles now take services due within 90 s). The first desktop attempt stalled on that toast after job 56813 was paid and delivered; the resumed run rated it and continued.

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
- [Sun 27 Sep] Support channels: X @marquetrade (official) and the Marque Telegram community group at https://t.me/marque_marketplace.
- [Sat 26 Sep] Damian acknowledgement sent. Gwen's six questions pending; Francis is following up.
