# SPEC-TRACKING.md
## Marque Phase 2: Quest Index, tracking events and public API

Goal: Gwen pastes any wallet into our API and gets back every Set and Earn step that wallet completed on Marque, each with a transaction she can open on BscScan, and nothing we cannot prove.

---

## 1. Principles

1. **Chain first.** Every counted fact is an on-chain event we indexed. The database is a projection, rebuildable from chain plus our first-party intent records.
2. **Marque attribution by binding.** All marketplaces share one AgenticCommerce contract, so a job counts as "on Marque" only when it is bound to a Marque hire intent (section 5).
3. **Flag, never delete.** Ineligible activity is returned with `eligible: false` and reasons. Nothing is hidden or removed.
4. **Privacy stays.** The anonymous `product_event` telemetry is untouched. The Quest Index only holds public chain data and the wallet addresses that appear in it.

---

## 2. The events

Signatures come from the ABIs shipped in `@bnbagent/sdk` 0.6.0 and the ERC-8004 standard. Topic0 values were computed with viem `keccak256`. **P2-03 must match each topic0 against a real log on chain before HANDOFF is sent.**

| Quest meaning | Contract | Event | topic0 |
|---|---|---|---|
| **Hire** | AgenticCommerce | `JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)` | `0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9` |
| Price locked | AgenticCommerce | `BudgetSet(uint256 indexed jobId, uint256 amount)` | `0x869e2577b006bf47ee981cf6fec2e25583548081c14b98deab587f77b5068038` |
| **Deposit** | AgenticCommerce | `JobFunded(uint256 indexed jobId, address indexed client, address indexed provider, uint256 amount)` | `0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52` |
| **Completion (delivered)** | AgenticCommerce | `JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)` | `0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e` |
| **Completion (settled)** | AgenticCommerce | `JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)` | `0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444` |
| Paid to agent | AgenticCommerce | `PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)` | `0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0` |
| Rejected | AgenticCommerce | `JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)` | `0xae7362b1af91f4492868987b9c73990d780060811551b58728fbe96fd1bab275` |
| Expired | AgenticCommerce | `JobExpired(uint256 indexed jobId)` | `0x97237956f8810192811e2c3f273fd02c5d6295206fdd9c62e6fe2bfc19ba9232` |
| Refunded | AgenticCommerce | `Refunded(uint256 indexed jobId, address indexed client, uint256 amount)` | `0x7ca5472b7ea78c2c0141c5a12ee6d170cf4ce8ed06be3d22c8252ddfc7a6a2c4` |
| Protection attached | EvaluatorRouter | `JobRegistered(uint256 indexed jobId, address indexed policy, address indexed client)` | `0xab6d9121f9311dd45d0b932fc9fb1a6562295bda63d5bab95e364ff926515715` |
| Settled | EvaluatorRouter | `JobSettled(uint256 indexed jobId, address indexed policy, uint8 indexed verdict, bytes32 reason)` | `0x771fbd01246ab044986d0a55b6d9b732fcfd6d7eaa5ee0d05110b0d23cf496fc` |
| Disputed | OptimisticPolicy | `Disputed(uint256 indexed jobId, address indexed client)` | `0xcde8e21e97a7f6ec4bbf0ee44450212e0ba73be8fdfbfb2b155e861d86756bac` |
| **Rating** | ERC-8004 ReputationRegistry | `NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` | `0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc` |
| Rating revoked | ERC-8004 ReputationRegistry | `FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)` | `0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d` |

Function selectors, for Gwen if she filters calls: `createJob` `0x41528812`, `fund` `0xd2e13f50`, `setBudget` `0xdd4ae9d4`, `giveFeedback` `0x3c036a7e`. The `FeedbackRevoked` indexed layout is an assumption; P2-03 confirms it against the deployed ABI or a real log and corrects this row.

Quest mapping we propose (confirm with Gwen):

| Quest step | Counts when |
|---|---|
| Hire in category X | A Marque-bound `JobCreated` whose provider maps to an agent in category X, followed by `JobFunded` with amount > 0 |
| Deposit | That `JobFunded` |
| Completion | `JobSubmitted` for that job (delivery). `JobCompleted` reported alongside as final settlement |
| Rating | `NewFeedback` from the job's client for that agent, after `JobSubmitted` |

---

## 3. The indexer

`apps/worker/src/indexer.ts`, PM2 app `marque-indexer`.

- Chains: 56 (primary) and 97 (staging). Contracts: AgenticCommerce, EvaluatorRouter, OptimisticPolicy, ReputationRegistry.
- Start block: the block of the first Marque intent minus 1,000, stored in `chain_cursor`. Backfill is not needed for other marketplaces' history, but the indexer records every event it sees so that `settleable` evidence for providers is complete.
- Loop every 6 s: `eth_getLogs` in 2,000-block chunks with the topic filters above, through the existing RPC failover pool. Confirmations: 3 blocks. Re-scan the last 50 blocks each loop and upsert on `(chain_id, tx_hash, log_index)`, which makes reorgs harmless.
- On each event: upsert `commerce_event`, then recompute `commerce_job` for that job from all its events (pure function in `packages/commerce/src/state.ts`).
- Lag alarm: if head minus cursor exceeds 200 blocks, `/status` shows it and the health monitor alerts Telegram.
- Rebuild drill: truncate derived tables in a scratch DB, re-run from start block, diff with production. Never touch `hire_intent`.

---

## 4. Identity mapping

| Field | Source |
|---|---|
| `agentId` | ERC-8004 token id on the IdentityRegistry of the job's chain |
| `agentKey` | `chainId:identityRegistry:tokenId` (existing canonical key) |
| `owner` | `ownerOf(agentId)` at index time, refreshed on `Transfer` |
| `agentWallet` | ERC-8004 agent wallet from metadata (existing ingest) |
| `provider` | Address in the signed quote and in `JobCreated.provider` |
| `category` | Marque classification at hire time, frozen into `hire_intent.category` so later reclassification cannot move a completed quest step |

A provider maps to an agent through the intent (exact service) or, for unbound jobs, through `agent_wallet = provider`. Jobs whose provider maps to no agent are stored and shown as "unknown provider", never counted.

---

## 5. Attribution: binding a job to Marque

1. `POST /api/v1/hire/intent` stores the intent with wallet, exact service, quote hash and the canonical description hash. The category is taken from Marque's classification of the agent, never from the request. No signature is asked for: an intent cannot be abused because it only binds when that wallet itself sends a matching `createJob`, and every field that matters comes from the quote or the registry. Intents are rate limited per IP and per wallet.
2. After `createJob`, the browser posts the tx hash to `/api/v1/hire/bind`. The server reads the receipt and binds only if: `JobCreated.client == intent.wallet`, `JobCreated.provider == quote.provider`, `keccak256(description) == intent.description_hash`, chain matches, and the tx is within 30 minutes of the intent.
3. If the browser never posts (tab closed), the indexer auto-binds on the same conditions when it sees the `JobCreated`.
4. A job created elsewhere is never bound to Marque, even if the same wallet has a Marque intent for the same agent.

---

## 6. Public API

All responses: `Cache-Control: public, max-age=15`, CORS open for GET, JSON, documented at `/docs#tracking`, examples captured from real responses (never invented).

### 6.1 `GET /api/v1/phase2/config`

```json
{
  "product": "Marque", "url": "https://marque.trade", "campaignNetwork": 56,
  "networks": [{
    "chainId": 56,
    "identityRegistry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    "reputationRegistry": "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    "agenticCommerce": "0xea4daa3100a767e86fded867729ae7446476eba6",
    "evaluatorRouter": "0x51895229e12f9876011789b04f8698af06ccd6da",
    "optimisticPolicy": "0x9c01845705b3078aa2e8cff7520a6376fd766de5",
    "paymentTokens": [{ "symbol": "USDT", "address": "0x55d3...7955", "decimals": 18 }],
    "disputeWindowSeconds": 0
  }],
  "events": { "hire": { "name": "JobCreated", "topic0": "0xb0f0...79b9" }, "deposit": { }, "delivered": { }, "settled": { }, "rating": { } },
  "teamWallets": ["0x..."],
  "questRules": "https://marque.trade/docs#quest-rules",
  "indexer": { "chainId": 56, "cursorBlock": 0, "headBlock": 0, "lagBlocks": 0 }
}
```

### 6.2 `GET /api/v1/phase2/wallet/:address`

```json
{
  "wallet": "0xabc...", "asOfBlock": { "56": 0 },
  "quest": {
    "categories": {
      "yield":         { "done": true,  "jobKey": "56:1234" },
      "grid":          { "done": false, "jobKey": null },
      "rebalancing":   { "done": false, "jobKey": null },
      "health_factor": { "done": true,  "jobKey": "56:1240" }
    },
    "ratedAll": false,
    "ownAgentListed": { "done": false, "agentKey": null },
    "eligible": true, "reasons": []
  },
  "hires": [{
    "jobKey": "56:1234", "chainId": 56, "jobId": "1234",
    "agent": { "agentKey": "56:0x8004...a432:341555", "agentId": "341555", "name": "Sluicegate",
               "owner": "0x...", "provider": "0x253F...5e84", "category": "yield", "firstParty": true },
    "amount": "100000000000000000", "token": { "symbol": "USDT", "decimals": 18 },
    "state": "SUBMITTED",
    "tx": { "created": "0x...", "registered": "0x...", "budgetSet": "0x...", "funded": "0x...",
            "submitted": "0x...", "completed": null, "paymentReleased": null, "rating": "0x..." },
    "timestamps": { "created": "2026-09-30T10:01:02Z", "funded": "...", "submitted": "...", "completed": null },
    "rating": { "value": 5, "tx": "0x..." },
    "eligible": true, "reasons": []
  }],
  "totals": { "hires": 2, "deposits": 2, "delivered": 2, "settled": 0, "ratings": 1 }
}
```

### 6.3 `GET /api/v1/phase2/owner/:address`

Agents whose ERC-8004 `ownerOf` is this address on 56 or 97, with: agentKey, name, category, listed on Marque (bool, listing tx or signature time), owner verification (signature), liveness, last probe, commercial state, quality state, quality-agent verdict (section 10) with reasons, jobs received and paid.

### 6.4 `GET /api/v1/phase2/job/:chainId/:jobId`

Full job projection: all events with tx hashes, intent (if Marque-bound), agent, token, amount, state, deliverable hash and URL, window end, refund date, rating, eligibility.

### 6.5 `GET /api/v1/phase2/coverage`

Per category: hireable count, agent keys, operators, first-party flag, cheapest live quote, freshest quote age. Used by BNB to check requirement 4.2 and by our homepage tiles.

### 6.6 `GET /api/v1/phase2/stats`

Totals since launch, eligible only: wallets with at least one hire, hires per category, deposits, delivered, settled, ratings, agents listed. Shown on `/status`.

---

## 7. Quest progress in the product

`/quest` and `/me` call `/api/v1/phase2/wallet/:address` for the connected wallet. The UI never computes progress itself. A step flips to done only after the indexer sees the event (typically under 15 s), and the UI says "Waiting for the chain" in the meantime with the pending tx link.

## 8. Ratings

- Contract: canonical ERC-8004 ReputationRegistry for the job's chain (P2-00 confirms code exists at the CREATE2 address on 56 and 97).
- Allowed only when: the connected wallet is the job's client, the job reached SUBMITTED, and the wallet is not the agent's owner or operator (the contract also enforces this).
- Call: `giveFeedback(agentId, value, 0, "starred", "marque:<category>", endpoint, feedbackURI, feedbackHash)`
  - `value`: stars × 20 (1 star = 20, 5 stars = 100), `valueDecimals = 0`. This matches the common 0 to 100 "starred" convention so other ERC-8004 readers average it correctly.
  - `endpoint`: the exact service URL hired.
  - `feedbackURI`: `https://marque.trade/api/v1/phase2/job/<chainId>/<jobId>`.
  - `feedbackHash`: `keccak256` of the canonical JSON `{ chainId, jobId, agentId, client, stars, comment }`. The comment (optional, 280 chars) is stored in our first-party table and served at the URI.
- One quest-eligible rating per (wallet, agent). Later ratings are shown, not counted twice.
- Storefronts show: average stars from `NewFeedback` by clients with a Marque-bound delivered job ("verified buyers"), and separately the registry-wide average ("all ERC-8004 feedback"). Never mixed.

## 9. Anti-wash projection

Computed per job and per wallet. Returned as `eligible` plus `reasons[]`. Never blocks a user, never deletes.

| Rule | Reason code |
|---|---|
| Client is a team wallet | `team_wallet` |
| Client equals provider, agent owner, or agent operator | `self_hire` |
| Funded amount is zero | `zero_deposit` |
| Job not bound to a Marque intent | `not_marque` |
| Job refunded or rejected before delivery | `not_delivered` |
| Rating before delivery, or rater is not the job client | `rating_unbound` |
| More than 1 counted hire per category per wallet | `duplicate_category` (the first counts) |
| Wallet funded by a team wallet within 24 h before its first hire | `team_funded` (flag only, reviewable) |

`config/team-wallets.json` lists every Marque-controlled address (reference agent wallets, keeper, deployer, Francis's wallets). Loaded at startup, exposed in `/config`.

## 10. The "quality agent" definition (default until Gwen confirms)

An owner's agent counts as a **quality listing** on Marque when all hold:

1. ERC-8004 identity on 56 (or 97) owned by the wallet (`ownerOf`).
2. Ownership proved on Marque by a signed message from that wallet.
3. At least one declared service reached **reachable** and **callable** within the last 24 h.
4. Classified into one of the four categories (or security).
5. It answered a live Marque test call for its category (the `/builders/test` harness) with a well-formed response. Passing MCS is **not** required; if it passes, the listing also earns a Warrant.

The owner endpoint returns each check with pass or fail and the fix, so a builder always knows the next step. If Gwen defines quality differently, only `packages/registry/src/quality.ts` changes.
