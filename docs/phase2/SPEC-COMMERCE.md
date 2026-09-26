# SPEC-COMMERCE.md
## Marque Phase 2: supply, quotes and the ERC-8183 buyer rail

Source of protocol facts: `@bnbagent/sdk` 0.6.0 (published 23 Sep 2026), read from the package source on 26 Sep. P2-00 writes the live measured values to `docs/phase2/PROTOCOL-FACTS.md`. **Measured values win over this document.**

---

## 1. Principles

1. Marque orchestrates commerce. BNB's canonical ERC-8183 contracts hold the money. The user's wallet signs.
2. We do not rebuild what exists. The reference sellers already run the Agent Studio seller runtime (`negotiate`, `notify_funded`, `submitResult`, `settle`). Any other Agent Studio seller in the registry runs the same runtime, so one buyer rail hires all of them.
3. Every commercial fact is bound to one exact service of one exact agent, on one chain.
4. Hireable and Warranted are separate (MASTER_PROMPT section 3).

---

## 2. Canonical deployments

Import from `@bnbagent/sdk/networks` (`NETWORKS`, `getAddress`). The table is for humans and for HANDOFF; code never copies it.

| Contract | BSC mainnet (56) | BSC testnet (97) |
|---|---|---|
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871B3d84C89A494BD9e` |
| ERC-8004 ReputationRegistry (CREATE2, verify code) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ERC-8183 AgenticCommerce | `0xea4daa3100a767e86fded867729ae7446476eba6` | `0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de` |
| EvaluatorRouter | `0x51895229e12f9876011789b04f8698af06ccd6da` | `0xd7d36d66d2f1b608a0f943f722d27e3744f66f25` |
| OptimisticPolicy | `0x9c01845705b3078aa2e8cff7520a6376fd766de5` | `0xd6a4217588f6b1f5657a92a3e94e6422ad771cea` |
| MarqueRegistry (ours, anchors) | not deployed | `0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7` |

Payment asset catalog (`@bnbagent/sdk/networks` assets):

| Asset | Mainnet | Testnet |
|---|---|---|
| U (kernel default) | `0xcE24439F2D9C6a2289F741120FE202248B666666` | `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565` |
| USDT | `0x55d398326f99059fF775485246999027B3197955` | `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | `0x64544969ed7EBf5f083679233325356EbE738930` |
| USD1 | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` | not listed |

All four mainnet assets use 18 decimals. Read decimals from the token anyway.

---

## 3. Network and token selection

**Campaign network: BSC mainnet (56).** Testnet (97) is staging and a fallback rail (ladder in AGENTS 13.8).

Token rule, per hire:

1. The token is whatever the seller's signed quote names (`currency`). The buyer never overrides it.
2. For reference sellers, P2-05 sets `currency` to USDT on mainnet if and only if `isPaymentTokenSupported(USDT)` is true on AgenticCommerce **and** a testnet or fork run proves the seller's `verifySignedJob` accepts a job created with `createJobWithToken(USDT)`. Otherwise U.
3. If the quote's token is not the kernel default, the buyer uses `createJobWithToken(... token)`. Otherwise `createJob`.
4. The hire sheet checks the user's balance of the quoted token and native BNB for gas before the first signature, and offers: "Get USDT" (Binance or PancakeSwap link) or "Swap to U on PancakeSwap" (deep link USDT to U with the exact amount).

---

## 4. Supply and capability model

### 4.1 State per service (replace the single funnel chain)

```
identity:    registered → metadata_readable
operational: service_declared → reachable → callable
commercial:  none | preview_only | quoteable → hireable → settleable
quality:     untested | tested_failed(field) | warranted(date) | retest_due
```

- **reachable**: protocol-shaped response within 24 h (unchanged).
- **callable**: fresh A2A or MCP interaction proves an executable interface (unchanged).
- **preview_only**: callable, answers a Marque task or a free test, but exposes no ERC-8183 negotiation. Users can "Try free". They cannot hire it for the quest.
- **quoteable**: the A2A card or skill list exposes `negotiate` (Agent Studio seller) or an equivalent ERC-8183 quote endpoint, and a negotiate call within the last 2 h returned a well-formed `NegotiationResult` with `provider_sig`, `chain_id`, `verifying_contract`, `price`, `currency`, `quote_expires_at`.
- **hireable**: quoteable, the quote's `chain_id` is a supported network, `verifying_contract` equals the canonical AgenticCommerce for that chain, `currency` is a catalog asset supported on that chain, the recovered signer equals the quote's `provider`, the provider equals the agent's registered wallet or a commerce address declared in its ERC-8004 metadata, and the agent's category is one of the four (or security, shown outside the quest).
- **settleable**: at least one indexed job for this provider reached `JobSubmitted` and then `JobCompleted` or `PaymentReleased`. Feeds `settleableServiceIds` in `apps/web/lib/agent-state.ts:138`, which is `[]` today.

MCS stays exactly as it is. It sets the quality axis only.

### 4.2 Quote probe (new worker job, first-party observations)

For every service that looks like an Agent Studio seller (A2A card skills include `negotiate` and `notify_funded`, or the card declares ERC-8183):

- Send `negotiate` with a category-appropriate probe task (fixed, harmless, no user data): `{ "task": "marque-quote-probe", "category": "<category>", "client_ref": "marque.trade" }`.
- Store the full signed result in `commerce_quote` with `source = 'probe'`.
- Never create a job from a probe quote.
- Cadence: tier 0 (reference) every 10 min, hireable every 30 min, candidates every 6 h.
- Through `safeFetch` only. Timeout 8 s. Size cap 64 KB.

### 4.3 Reference agents as rows

- `config/first-party.json`: `{ "chainId": 56, "owners": ["0x..."], "tokenIds": [341553, 341554, 341555, 341556, 341557] }`.
- The marketplace reads these agents from `agent` like every other row and marks them first-party.
- `agent_alias(alias text primary key, chain_id, token_id)` maps `marque:bound` to `56:341553` and so on. Runs, receipts, conformance results and ledger rows keep their original ids. Display and search resolve through the alias.
- Delete `referenceRows()` and the price constant from `apps/web/lib/marketplace.ts`. Keep `reference-agents.ts` only for slugs, blurbs and ports until P2-09 moves blurbs to the agents' own metadata.

### 4.4 Supply target and acquisition (P2-01)

- `pnpm supply:audit` prints per category: hireable, quoteable, preview_only, callable, with operator and chain for each.
- Target at launch: **at least 3 hireable per category, goal 5**, at least two non-Marque operators per category where they exist.
- Candidate sources: registry rows with Agent Studio seller cards; external indexes (Brain Plaza, 8004scan) only as leads, never as data. Every published row is re-read from ERC-8004 and re-probed by us.
- If a category is short after the audit: Francis gets an outreach list (agent, owner address, endpoint, what is missing) in `docs/phase2/OUTREACH.md`. The builder page (P2-10) is the fix path we send them.
- Last rung only: a second first-party agent in the short category with a genuinely different method (for example a Lista lending health monitor next to Keel's Venus monitor), registered on mainnet ERC-8004, labelled first-party. Never a clone.

---

## 5. The buyer lifecycle

### 5.1 Sequence

| # | Step | Who signs | Call | Notes |
|---|---|---|---|---|
| 0 | Quote | none | Server sends A2A `negotiate` to the exact service with the user's task; returns `NegotiationResult` | Client re-verifies `provider_sig` against `provider` before showing the price |
| 1 | Hire intent | none | `POST /api/v1/hire/intent` | Server stores intent: wallet, agent, service, category, quote hash, chain, expiry |
| 2 | Open the job | user | `createJob(provider, evaluator=router, expiredAt, description, hook=router)` or `createJobWithToken(..., token)` | `description = buildJobDescription(negotiationResult)`. Wait for receipt, parse `JobCreated` for `jobId` |
| 3 | Bind | none | `POST /api/v1/hire/bind` with tx hash | Server verifies the receipt and binds `jobId` to the intent |
| 4 | Attach buyer protection | user | `router.registerJob(jobId, policy)` | Client only, once |
| 5 | Lock the price | user | `setBudget(jobId, price, "0x")` | `price` from the quote |
| 6 | Allow exactly the price | user | `token.approve(commerce, price)` | Skip if allowance ≥ price |
| 7 | Pay into escrow | user | `fund(jobId, price, "0x")` | Emits `JobFunded` |
| 8 | Notify | none | Server sends A2A `notify_funded { jobId }` | Seller verifies on chain, works, submits |
| 9 | Delivered | provider | `submit(jobId, deliverableHash, optParams)` | `JobSubmitted`; `optParams.deliverable_url` points at the manifest |
| 10 | Settle | anyone | `router.settle(jobId)` after the dispute window | Keeper does it. `JobCompleted` + `PaymentReleased` |
| 11 | Rate | user | `ReputationRegistry.giveFeedback(...)` | SPEC-TRACKING section 8 |

Steps 4 to 7 may be one EIP-5792 atomic batch when the wallet reports atomic support for the chain. Step 2 is never batched.

### 5.2 Timing values

- `expiredAt = now + disputeWindow + deliveryAllowance`, where `deliveryAllowance = max(1 h, 3 × quote.estimated_completion_seconds)`, capped at 24 h. Reject if the result exceeds the contract's `ExpiryTooLong`.
- The provider must submit before `expiredAt − disputeWindow`.
- Refund for an undelivered job is claimable after `expiredAt`. The hire sheet prints that date before the user pays.
- Quote TTL: at most 900 s. The sheet shows a countdown. If it expires before step 2 confirms, re-quote automatically and show the new price if it changed.

### 5.3 Attribution inside the job

For reference sellers, the negotiate request carries `client_ref: "marque.trade"` and `marque_intent: "<intent id>"` inside the task, so the signed description on chain names Marque. For third-party sellers, include both fields only if their task schema accepts extra fields; attribution then rests on intent binding (SPEC-TRACKING section 5).

---

## 6. Job state machine

```
QUOTED ──(user abandons / quote expires)──▶ ABANDONED
  │
  ▼ createJob
OPEN ──cancelOpen──▶ CANCELLED
  │ registerJob
  ▼
REGISTERED
  │ setBudget
  ▼
BUDGETED
  │ fund
  ▼
FUNDED ──(no submit by expiredAt − window)──▶ AWAITING_EXPIRY ──expiredAt──▶ EXPIRED ──claimRefund──▶ REFUNDED
  │ submit
  ▼
SUBMITTED ──client disputes within window──▶ DISPUTED ──settle──▶ REJECTED ──▶ REFUNDED
  │ window elapses, settle
  ▼
COMPLETED ──▶ PAID (PaymentReleased)
  │
  ▼ giveFeedback
RATED (orthogonal flag)
```

- Chain events drive every transition after QUOTED. The UI state is a projection of `commerce_job` + `commerce_event`, never of browser memory.
- Every state has a user-facing name and next action in DESIGN-SYSTEM section 8.6.
- Unit test every transition and every illegal transition.

---

## 7. Package layout

```
packages/commerce/
  src/
    config.ts          networks, addresses, assets from @bnbagent/sdk (pinned 0.6.0), disputeWindow cache
    abi.ts             re-export SDK ABIs (agenticCommerceAbi, evaluatorRouterAbi) + ERC-20 + Reputation
    quote.ts           server: A2A negotiate via safeFetch; verify provider_sig; normalise
    description.ts     buildJobDescription wrapper; size checks
    intent.ts          server: create intent, bind job from receipt
    state.ts           pure state machine + projections
    errors.ts          custom error name → plain sentence (both contracts, ERC-20, wallet)
    keeper.ts          worker: settle after window (gated wallet)
    notify.ts          server: notify_funded with retries
    client/
      useQuote.ts      TanStack Query hook
      useHire.ts       wagmi: step runner with EIP-5792 capability check, exact approve
      useJob.ts        polls /api/v1/phase2/job/:chainId/:jobId
      useAllowances.ts read + revoke
      useRate.ts       giveFeedback
```

Lane B imports only from `packages/commerce/src/client` and `state.ts`.

### 7.1 Hire API (web, Lane A)

| Route | Method | Body / params | Returns |
|---|---|---|---|
| `/api/v1/hire/quote` | POST | `{ agentKey, serviceId, category, task }` | `{ quote, verified: true, expiresAt, token: {address, symbol, decimals}, chainId, providerMatchesRegistry }` |
| `/api/v1/hire/intent` | POST | `{ wallet, quoteHash }` (no signature: nothing in an intent is user-controlled except the wallet, and a job binds only if that wallet itself sends `createJob`) | `{ intentId, expiredAt, description, calls }` |
| `/api/v1/hire/bind` | POST | `{ intentId, txHash }` | `{ jobId, state }` |
| `/api/v1/hire/notify` | POST | `{ chainId, jobId }` | `{ accepted }` (idempotent) |

Rate limits: quote 20 per minute per IP, intent 10 per minute per wallet. Idempotency key on every POST.

---

## 8. Seller side (reference agents)

- Keep `@bnbagent/sdk 0.5.5` and `@bnbagent/studio-runtime 0.0.13`.
- P2-05 sets in each `studio.toml`: `[network] default = "bsc-mainnet"`, `currency` per section 3, `price` as today (Keel 0.05, Lattice 0.10, Sluicegate 0.10, Bound 0.15, Redcell 0.25), `max_price` set to 2 × price (today it is empty, which the file itself says to set before going live).
- If running testnet sellers in parallel for staging, run them as separate PM2 apps on separate ports with `-testnet` suffixes. Watch memory (P2-11).
- Deliverables must survive restarts: write manifests to durable storage (existing IPFS/Pinata if configured, else a persistent directory served by Caddy at `https://marque.trade/deliverables/<hash>.json`). The `deliverable_url` must resolve for the life of the campaign.
- Each seller's own `settle` path stays available as the ladder rung if the keeper is not approved.

## 9. Keeper

- `apps/worker/src/keeper.ts`: every 5 min, for Marque-bound jobs in SUBMITTED whose window has elapsed, call `router.settle(jobId)` with the keeper wallet.
- Mainnet keeper requires G-M1 and G-M2. Hard caps: max 50 settles per hour, stop and alert if the keeper's BNB balance drops under the threshold P2-05 prints.
- Settle is permissionless and moves no keeper funds except gas.

## 10. Refund, cancel, dispute

| Situation | User action | Call |
|---|---|---|
| Changed mind before paying | Cancel job | `cancelOpen(jobId)` (Open only) |
| Agent did not deliver | Reclaim payment (available after expiredAt, date shown) | `claimRefund(jobId)` |
| Delivered work is wrong | Report a problem (within window) | Policy dispute call per SDK; show that a vote decides |
| Allowance left over | Revoke | `approve(commerce, 0)` from `/me` |

## 11. Data model (Drizzle, additive migrations only)

First-party (never deleted): `commerce_quote`, `hire_intent`, `notify_attempt`.
Derived (rebuildable from chain): `commerce_job`, `commerce_event`, `rating`, `chain_cursor`.
Config: `config/first-party.json`, `config/team-wallets.json`.

```
commerce_quote(id, chain_id, agent_key, service_id, provider, price_raw, token, quote_expires_at,
               negotiation_hash, provider_sig, raw jsonb, source 'probe'|'user', created_at)
hire_intent(id uuid, wallet, agent_key, service_id, category, chain_id, quote_id, description_hash,
            state, job_id null, create_tx null, created_at, bound_at)
commerce_job(chain_id, job_id, client, provider, evaluator, hook, token, budget_raw, expired_at,
             description_hash, state, intent_id null, created_block, updated_block)   pk(chain_id, job_id)
commerce_event(chain_id, tx_hash, log_index, block_number, block_time, contract, name, job_id, args jsonb)
             pk(chain_id, tx_hash, log_index)
rating(chain_id, agent_id, client, feedback_index, value, value_decimals, tag1, tag2, feedback_uri,
       feedback_hash, tx_hash, block_time, revoked bool)   pk(chain_id, agent_id, client, feedback_index)
chain_cursor(chain_id, contract, last_block, updated_at)
```

## 12. Threat model

| Threat | Control |
|---|---|
| Hostile agent card or quote payload | safeFetch, Zod, size caps, never render raw HTML |
| Quote from someone other than the agent | Verify `provider_sig` recovers `provider`; provider must match registry wallet or declared commerce address |
| Quote for the wrong chain or contract | Check `chain_id` and `verifying_contract` against `NETWORKS` |
| Price swap between quote and fund | `setBudget` and `fund` use the quote price; the sheet shows it at each step; `fund` checks `expectedToken` |
| Unlimited allowance | Exact approve only; lint rule forbids `maxUint256` in `packages/commerce` and `apps/web` |
| Stranded job after a web restart | State lives on chain; notify retried by the worker from `hire_intent`; Job Room rebuilds from chain |
| Double notify or double delivery | Seller runtime is idempotent; notify has an idempotency key |
| Self-hire or wash | Flagged in the quest projection (SPEC-TRACKING section 9); never blocked at the contract, never counted |
| Replay of an intent | Intent bound once; second bind returns the first job |
| Keeper drain | Settle only moves gas; hourly cap; balance alarm |

## 13. Tests

- Unit: state machine, description building, quote verification (good sig, wrong signer, wrong chain, wrong contract, expired), exact-approve logic, error map coverage for every custom error in both ABIs.
- Integration (testnet): full hire per category against the reference sellers; cancel before fund; approve then revoke; one expired job reaching refund (use a deliberately short-allowance test seller or a job the seller refuses).
- Fork (mainnet): `anvil --fork-url` BSC mainnet, run createJobWithToken(USDT) through fund against the real contracts with an impersonated funded account, to prove token support before any real mainnet spend.
- Browser: Playwright with an injected EIP-1193 mock that signs against the fork.
