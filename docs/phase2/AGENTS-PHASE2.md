# AGENTS.md section 13: PHASE 2 (SET AND EARN)

Append to `AGENTS.md`. Where this section conflicts with sections 1 to 12, this section wins. Also change line 6 of `AGENTS.md`: the production domain is **marque.trade**, not usemarque.xyz.

---

## 13.1 What changed

Phase 1 proved Marque can tell which agents work. Phase 2 makes Marque a market that real users hire from with their own wallets, on BSC mainnet, verified by BNB from chain events. The product contract changed in four ways:

1. A user's wallet now signs and funds ERC-8183 jobs. The sentence "a Charter is the only thing a user signs" is no longer true anywhere in the product.
2. Hireability and MCS qualification are separate facts (MASTER_PROMPT section 3).
3. Reference agents are ERC-8004 rows, not a hardcoded list.
4. The quest is a first-class surface with its own public API.

## 13.2 Invariants added in Phase 2

22. **Non-custodial.** Every buyer write (createJob, registerJob, setBudget, approve, fund, cancel, claimRefund, dispute, giveFeedback, allowance revoke) is signed by the user's connected wallet in the browser. No server route accepts or stores a user key. No Marque wallet is ever the client of a user's job.
23. **Exact approvals.** An ERC-20 approval to the AgenticCommerce contract equals the amount about to be funded, or the sum of a quest basket the user explicitly chose with the total shown. Never `maxUint256`. The SDK's `approveFloor` stays unused.
24. **No substitution.** The provider address funded is the provider in the signed quote returned by this exact service of this exact agent. If they differ from the registry's agent wallet or declared commerce address, the hire is refused with the reason shown. A hire never falls back to a reference agent.
25. **Hireable is not Warranted.** Two badges, two sources, shown together. The marketplace never gates Hire on MCS, and never labels an agent Warranted without a stored passing result for that exact service within the freshness window.
26. **Network per action.** Every price, hire, job, rating and receipt shows the chain it lives on, derived from that object's chain id. The header shows the campaign network. Mixed-network lists group or badge per row.
27. **Chain-derived quest.** Quest progress is computed only from indexed on-chain events bound to a Marque hire intent (SPEC-TRACKING). No row in any quest table is ever inserted by hand, by a seed script, or by a test against production. Team wallets are flagged and excluded from eligibility, never deleted.
28. **Live prices only.** A displayed price is either a signed quote (MEASURED, with its expiry) or the agent's declared price (CLAIMED). No price constant exists in UI code.
29. **Reference agents are rows.** First-party status comes from `config/first-party.json` (owner addresses and token ids), applied to rows ingested from the ERC-8004 registry. The legacy `marque:*` ids resolve through `agent_alias` for old runs, receipts and conformance results. Historical rows are never rewritten.
30. **Public repo is public.** No planning chats, competitor critiques, personal emails, prize strategy or screenshots in the repo. Planning lives off-repo. Removal is `git rm`, never history rewriting.
31. **Plain words on the money path.** Every signature request is named in the UI in plain English before the wallet opens ("Pay 0.10 USDT into escrow"). No raw library, RPC or contract error text is ever rendered.

## 13.3 Hard gates (added to the four standing gates)

| Gate | Needs | Notes |
|---|---|---|
| G-M1 | Francis writes "approved, mainnet" | Before any Marque-controlled wallet sends a mainnet tx: reference seller submit, keeper settle, smoke hires |
| G-M2 | Francis funds the wallets named in the P2-05 checkpoint | Amounts listed per wallet, BNB for gas only if the paymaster does not sponsor |
| G-C1 | New recurring cost | Cloudflare paid plan, a second VPS, paid RPC, image generation |
| G-D1 | Any schema migration that alters or drops a column in a first-party table | Additive migrations are free; destructive ones escalate |

User wallets signing their own mainnet hires in the browser are not a gate. That is the product.

## 13.4 Lanes

| Lane | Owns | Never edits without a Request line |
|---|---|---|
| **A: commerce** | `packages/commerce` (new), `packages/execution`, `packages/db` migrations, `apps/worker` (indexer, keeper, job worker, probe scheduler), `apps/web/app/api/v1/phase2/**`, `apps/web/app/api/v1/hire/**`, `agents/*/studio.toml`, `ecosystem.config.cjs`, `scripts/deploy-*` | Any `.css`, any page layout |
| **B: product** | `apps/web/app/**` pages and components, `packages/ui`, all CSS and fonts, `packages/registry` supply and classification, `apps/web/app/builders/**`, README, `docs/**` | Contracts, workers, migrations |

Shared seam: `packages/commerce/src/client/*` exports typed hooks and pure functions that Lane B calls. Lane A writes them first with typed stubs that return labelled empty states, so Lane B is never blocked.

Requests go in `docs/phase2/PROJECT_STATE.md` under "Requests": `[time] [from lane] [to lane] [file] [what]`.

## 13.5 Protected windows

- During any `pnpm build` on the VPS, never restart workers.
- From Tue 29 Sep 18:00 UTC to launch: no merges except S0 and S1 fixes, each with a written reason in `PROJECT_STATE.md`.
- During the launch window (Wed 30 Sep, first 6 hours after BNB posts): no deploys except rollback.

## 13.6 Definition of done (Phase 2)

A phase is done when all hold:

1. Acceptance lines in the phase prompt pass, with pasted evidence.
2. `pnpm typecheck`, `pnpm lint`, `pnpm test` green. New commerce and tracking code has unit tests, and every state transition in SPEC-COMMERCE section 6 has a test.
3. For any user-facing change: screenshots at 390, 768 and 1440 in Night and Day, looked at, defects fixed.
4. No console errors, no hydration warnings, no dead buttons on touched routes.
5. No em dash (U+2014) or en dash (U+2013) in touched copy. `pnpm lint:copy` enforces this.
6. `docs/phase2/PROJECT_STATE.md` updated: phase status, deviations, open requests.
7. Anything on chain: tx hash, chain, explorer link pasted.

## 13.7 Claims discipline

| Allowed | Forbidden |
|---|---|
| "Your payment is held in BNB Chain's ERC-8183 escrow contract until the agent delivers." | "Marque holds your funds" / "Marque guarantees" |
| "Warranted: passed MCS-HF-1 on 26 Sep" | "Verified agent" without the test and date |
| "Hireable: live quote 0.10 USDT, valid 12 min" | A price without its source |
| "N agents hireable in Yield" (a live count) | "Hundreds of agents ready" |
| "Refundable after <date> if the agent does not deliver" (measured window) | "Instant refunds" |
| "No third-party agent has passed MCS yet" (measured) | Any claim about competitors in product copy |

## 13.8 Degradation ladders

Take the highest rung that works, log the rung in `docs/DEVIATIONS.md`, continue.

**Payment token.** 1 USDT via `createJobWithToken` if supported on the network and the seller quotes in it. 2 U (the kernel default) with a "Get U" link that opens a PancakeSwap USDT to U swap. 3 Testnet U with the faucet link, network labelled loudly.

**Network.** 1 BSC mainnet for all reference sellers and the default hire path. 2 Mainnet for sellers that support it, testnet for the rest, grouped and badged. 3 Testnet only, with a banner stating that final selection requires mainnet and the date we move.

**Signing.** 1 EIP-5792 atomic batch for registerJob, setBudget, approve and fund after createJob confirms, when `wallet_getCapabilities` reports atomic support on the chain. 2 Sequential transactions with the named stepper. Never batch createJob with anything (the job id is only known after it confirms).

**Supply per category.** 1 Three or more hireable agents with at least two non-Marque operators. 2 Three or more hireable with at least one non-Marque operator. 3 The reference agent plus every hireable third-party, plus a second first-party agent with a genuinely different method, labelled "Marque reference" and listed under the reference explainer. Never a clone, never a renamed copy.

**Completion.** 1 Report `JobSubmitted` as delivered and `JobCompleted` as settled, keeper settles after the window. 2 Keeper not approved: provider-side settle by the reference sellers and a "Settle" button for the client. 3 Report delivered only, with the settle date.

**Rating.** 1 ERC-8004 `giveFeedback` on the canonical ReputationRegistry. 2 If Gwen names another primitive, an adapter behind `RatingService`. 3 If the registry has no code on the network, show the rating form disabled with the reason and log it.

**Durable work.** 1 BullMQ on the existing Redis. 2 A Postgres `job_queue` table polled by the worker with `FOR UPDATE SKIP LOCKED`.

**Deploy.** 1 Blue/green behind Caddy (two ports, health check, atomic upstream switch). 2 Current deploy script at the lowest-traffic hour with a status banner.

**Batching of pages.** If a page cannot meet 1.5 s p95, serve the last good projection from Redis with its age shown.

## 13.9 Kill list for Phase 2

Anything not in `BUILD-PROMPTS.md`, specifically: a new escrow or payment contract, a Marque router contract that becomes the job client, a token or points, a leaderboard of wallets, incentives of our own for the quest, templated one-click agent clones, any feature that asks users to paste a private key, Altana integration, a chatbot, multichain, rewriting git history, editing historical receipts, conformance rows or ledger rows.

## 13.10 Known gotchas (Phase 2)

1. `createJob` must pass `evaluator = router` and `hook = router`, exactly as `ERC8183Client.createJob` does. A zero hook breaks `registerJob`.
2. `fund` reverts with `BudgetMismatch` unless `setBudget` set the same amount first.
3. `registerJob` is client-only and single-shot. If it fails after createJob, the job is still Open: offer "Try again" or "Cancel job" (`cancelOpen`), never abandon it silently.
4. The quote in the description expires in at most 900 s. If it expires before createJob confirms, fetch a new quote. Show the countdown.
5. The dispute window may be days. Refunds for undelivered jobs become claimable only after `expiredAt`. Say the date.
6. `NewFeedback` indexes `tag1` as a hash (indexed string). Read the plain `tag1` from the data, not the topic.
7. The reference sellers are pinned to `@bnbagent/sdk 0.5.5`. The buyer package pins `0.6.0`. Both read the same deployments. Do not bump the sellers during the campaign unless a mainnet test proves a need.
8. RainbowKit stays as the connector UI (it already speaks EIP-6963 and WalletConnect for mobile). Theme it; do not replace it.
