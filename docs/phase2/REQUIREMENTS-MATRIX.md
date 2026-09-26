# REQUIREMENTS-MATRIX.md
## BNB Phase 2 requirements against Marque, 26 Sep 2026

"Now" is what I verified on the live site and in the repo at commit `9b47e39` on 26 Sep. "Evidence" is what must exist before the row is marked PASS in `docs/phase2/PROJECT_STATE.md`.

Status key: PASS · PARTIAL · FAIL · HUMAN (needs Francis)

---

## Campaign asks

| # | Ask | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| C1 | Live URL, socials, one-line description | URL and @marquetrade exist. No agreed one-liner | One-liner in HANDOFF, same line in README and OG | HANDOFF-BNB.md sent | P2-06 |
| C2 | Tracking details so events in all 4 categories can be verified | FAIL. No hire, deposit, completion or rating events. Telemetry is anonymous by design | Chain-derived Quest Index + public API | `/api/v1/phase2/wallet/<test wallet>` returns 4 hires with tx hashes | P2-03 |
| C3 | Ready for traffic, users depositing funds, support channel | PARTIAL. Single VPS, deploy restarts web, no load test, no support entry point | Blue/green deploy, load test report, support link in header and Job Room | `docs/phase2/LOAD-TEST.md`, support link live | P2-11 |
| C4 | Brand kit and logo | PARTIAL. Assets in `brand-assets/` and `apps/web/public/brand` | Zipped kit: SVG mark, lockups light and dark, 1024 and 512 PNG, OG 1200x630, BRAND.md | Link in HANDOFF | P2-06 |
| C5 | Fair play, no artificial activity | Not addressed | Anti-wash projection, team wallets excluded, no Marque incentives | SPEC-TRACKING section 9 implemented, `eligible` flags in API | P2-03 |

## 1. Deployment

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 1.1 | Own domain | PASS. marque.trade | Keep | | |
| 1.2 | Public, no login or wallet to browse | PASS | Keep. `/quest` and hire sheet also readable without a wallet | Logged-out Playwright run of every route | P2-12 |
| 1.3 | Live, not demonstrated | PASS | Keep | | |
| 1.4 | Stable for the campaign, same URL | PARTIAL. `deploy-web.sh` deletes the PM2 process before the new one is up; `/api/v1/agents` returns 503 today | Blue/green deploy, 503 fixed, uptime monitor | Deploy log with zero failed health checks during a swap; `/api/v1/agents` p95 < 1.5 s | P2-00, P2-11 |

## 2. Network

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 2.1 | Testnet or mainnet accepted | Mixed: identities mainnet, sellers testnet, charters testnet | Mainnet commerce at launch | First mainnet hire tx per category | P2-05 |
| 2.2 | Network stated clearly on the site | PARTIAL. Header "BSC · 56", footer registry on 97, charter pages say testnet | Header pill = campaign network; every price, hire, job, receipt shows its own chain | Screenshot audit of every money surface | P2-07, P2-08 |
| 2.3 | Mainnet required after the campaign | Not yet | Launch on mainnet, so no migration | | P2-05 |

## 3. On-chain data

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 3.1 | Agents read from ERC-8004 on 56 or 97 | PARTIAL. Third parties yes; reference agents injected from `REFERENCE_AGENTS` in `apps/web/lib/reference-agents.ts` | Reference agents projected from their mainnet rows (341553 to 341557); first-party by owner config | `grep -r REFERENCE_AGENTS apps/web/lib/marketplace.ts` returns nothing; marketplace rows carry registry ids | P2-01 |
| 3.2 | No mock data, hardcoded lists or seeded records | PARTIAL. Hardcoded reference rows and hardcoded `0.15 U` price in `marketplace.ts:160` | Zero hardcoded agents or prices | Code search, reviewed | P2-01 |
| 3.3 | Show the contract addresses read from | PARTIAL. Scattered | `/protocol` page and footer: IdentityRegistry, ReputationRegistry, AgenticCommerce, Router, Policy, payment token, MarqueRegistry, each with chain and explorer link | Page live | P2-07 |
| 3.4 | Per-agent evidence: registry id, tx hashes, last updated | PARTIAL. Registry id yes; registration tx only for references; freshness shown | Every storefront: registry id, identity contract, registration tx (from Transfer/Registered log), owner, last metadata update, last probe, last quote | Storefront screenshot for one third-party agent | P2-01, P2-09 |
| 3.5 | Stale or non-responding agents said so | PASS in model, but everything is stale today because the probe stopped refreshing | Tiered probe scheduler; honest stale labels remain | Funnel Reachable > 0; Status shows T0 and T1 freshness | P2-00 |

## 4. Agent coverage

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 4.1 | All four categories | PASS | Keep equal depth | | |
| 4.2 | At least 3 agents per category | FAIL. 0 hireable third-party; one reference agent per category | At least 3 hireable per category, target 5, at least 2 non-Marque operators where the registry allows | `/api/v1/phase2/coverage` per category counts with agent ids | P2-01 |
| 4.3 | Agents classified, few "Unclassified" | PARTIAL | Default marketplace view never shows Unclassified; classification coverage report | Counts in PROJECT_STATE | P2-01 |
| 4.4 | Detail pages: what it does, how invoked, permissions, track record | PARTIAL. Strong on evidence, weak on commerce and track record | Storefront spec in DESIGN-SYSTEM section 8.4 | Screenshots | P2-09 |

## 5. Hire flow

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 5.1 | Working hire end to end | FAIL for the campaign meaning. Current hire is a free agent call under a Marque-signed testnet charter | Wallet-signed ERC-8183 hire, delivery, settlement, rating | One full hire per category on mainnet from a fresh wallet | P2-02, P2-05 |
| 5.2 | Names the specific agent | PASS in the charter flow | Hire sheet header: agent name, avatar, registry id, provider address | Screenshot | P2-08 |
| 5.3 | Scoped permissions, no blanket approvals | PARTIAL | Exact approvals only; the service fee is the only thing the user authorises for campaign hires | Allowance equals funded amount in the test tx | P2-02 |
| 5.4 | Spend caps and revoke must work | PARTIAL. Charter revoke works on testnet with Marque's wallet | Cap = escrow budget the user confirms + exact allowance; revoke = cancel before funding, refund after expiry, allowance to zero from `/me`, all on chain | Tx hashes for cancel, allowance revoke, and one refund (testnet acceptable for refund) | P2-02, P2-08 |

## 6. Tracking

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 6.1 | Contract addresses | FAIL | Canonical ERC-8183 and ERC-8004 addresses on 56 (and 97 for staging) | HANDOFF table | P2-06 |
| 6.2 | Events for hire, deposit, completion, rating with signatures | FAIL | `JobCreated`, `JobFunded`, `JobSubmitted`, `JobCompleted` (+ `PaymentReleased`), `NewFeedback`, with full topic0 verified against real logs | HANDOFF table with a real tx per event | P2-03, P2-06 |
| 6.3 | How agent ids and owner wallets are recorded | Not documented | ERC-8004 id, owner from `ownerOf`, agent wallet, provider address from the signed quote; mapping exposed in API | SPEC-TRACKING section 6 | P2-03 |
| 6.4 | API for hires per wallet and agents per owner | FAIL | `/api/v1/phase2/wallet/:address`, `/api/v1/phase2/owner/:address`, `/api/v1/phase2/job/:chainId/:jobId`, `/api/v1/phase2/config` | Live responses in HANDOFF | P2-03 |
| 6.5 | Team wallet addresses | HUMAN | List from Francis plus every Marque-controlled wallet in the repo | HANDOFF | P2-06 |

## 7. Repository

| # | Requirement | Now | Target | Evidence | Phase |
|---|---|---|---|---|---|
| 7.1 | Public, live URL in README | PASS | Add Phase 2 section at the top | | P2-06 |
| 7.2 | Setup instructions that let them run it | PARTIAL | Add commerce, indexer, keeper, env table, `pnpm dev:stack` | Fresh clone runs web + indexer against testnet | P2-06 |
| 7.3 | Real commit history | PASS | Keep. Never rewrite | | |
| 7.4 | Nothing embarrassing in public | FAIL. Root holds our private strategy chat (names a competitor), a personal email, planning folders, screenshots | `git rm` to an off-repo location | Clean root listing | P2-00 |

## Quest-specific (implied by Set and Earn, not in the requirement list)

| # | Need | Target | Phase |
|---|---|---|---|
| Q1 | Users can see their quest progress on Marque | `/quest` and `/me` read the Quest Index | P2-08 |
| Q2 | Users can pay with what they hold | USDT if the contract supports it | P2-00, P2-02 |
| Q3 | Users are not lost in 20 wallet popups | Named stepper, batching where supported, basket approval option | P2-08 |
| Q4 | Users can build and list an agent | `/builders` checklist, Agent Studio guide, live test, claim and list | P2-10 |
| Q5 | Users get help when something fails | Support link, error map, recover-a-stuck-job flow | P2-08, P2-11 |
