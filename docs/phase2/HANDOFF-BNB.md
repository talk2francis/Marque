# Marque: Set and Earn technical handoff

To: Damian (@bnb_damian), Gwen (@gwenbnb)
From: Francis, Marque (Xyndicate Labs)
Date: [UTC timestamp when sent]

Everything below is filled from values we measured on chain or from our live API. Brackets are filled by P2-06 before sending. Where something is still being finished, it says so with a date.

---

## 1. Product

| | |
|---|---|
| Name | Marque |
| Live URL | https://marque.trade |
| One-line description | **Marque is the BNB Smart Chain agent marketplace that tests agents before you hire them, holds your payment in on-chain escrow until the work is delivered, and records every hire on chain.** |
| Short version (if needed, under 100 characters) | Hire BNB Chain agents that actually work, with escrowed payment and on-chain proof. |
| X | https://x.com/marquetrade |
| Support for users | [channel from Francis] |
| Repository | https://github.com/talk2francis/Marque |
| Brand kit | https://marque.trade/brand/marque-brand-kit.zip |
| Quest page for users | https://marque.trade/quest |

## 2. Network

Campaign network: **BNB Smart Chain mainnet (chain 56)**. [If P2-05 not yet approved: "Mainnet from [date]; testnet (97) live now."]
The network is shown in the site header and on every price, hire, job and receipt.
Testnet (97) runs the same contracts as our staging environment and is indexed by the same API.

## 3. Contracts we read and write

All ERC-8183 and ERC-8004 contracts are BNB Chain's canonical deployments from `@bnbagent/sdk` 0.6.0. Marque deploys no escrow and never holds user funds; users sign every hire from their own wallet.

| Contract | Chain 56 | Chain 97 |
|---|---|---|
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871B3d84C89A494BD9e` |
| ERC-8004 ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` [code verified: yes/no] | `0x8004B663056A597Dffe9eCcC1965A193B7388713` [yes/no] |
| ERC-8183 AgenticCommerce | `0xea4daa3100a767e86fded867729ae7446476eba6` | `0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de` |
| EvaluatorRouter | `0x51895229e12f9876011789b04f8698af06ccd6da` | `0xd7d36d66d2f1b608a0f943f722d27e3744f66f25` |
| OptimisticPolicy | `0x9c01845705b3078aa2e8cff7520a6376fd766de5` [dispute window: X h] | `0xd6a4217588f6b1f5657a92a3e94e6422ad771cea` [X h] |
| Payment token | [USDT `0x55d398326f99059fF775485246999027B3197955` or U `0xcE24439F2D9C6a2289F741120FE202248B666666`] | [test token] |
| MarqueRegistry (our receipt anchors, no funds) | not used | `0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7` |

## 4. Events for Set and Earn

Topic0 values verified against real logs on [date] ([tx links]).

| Quest step | Contract | Event | topic0 |
|---|---|---|---|
| Hire | AgenticCommerce | `JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)` | `0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9` |
| Deposit | AgenticCommerce | `JobFunded(uint256 indexed jobId, address indexed client, address indexed provider, uint256 amount)` | `0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52` |
| Job completion (agent delivered) | AgenticCommerce | `JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)` | `0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e` |
| Job completion (settled after the dispute window) | AgenticCommerce | `JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)` | `0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444` |
| Payment to agent | AgenticCommerce | `PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)` | `0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0` |
| Rating | ERC-8004 ReputationRegistry | `NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` | `0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc` |

Refund path, for completeness: `Refunded(uint256 indexed jobId, address indexed client, uint256 amount)`, topic0 `0x7ca5472b7ea78c2c0141c5a12ee6d170cf4ce8ed06be3d22c8252ddfc7a6a2c4`.

Our rating convention: `tag1 = "starred"`, `tag2 = "marque:<category>"`, `value` 20 to 100 for 1 to 5 stars, `valueDecimals = 0`, `feedbackURI` = our job URL, `feedbackHash` = keccak256 of that JSON.

## 5. How agent ids and owner wallets are recorded

- Every agent on Marque is an ERC-8004 identity on chain 56 (or 97 on staging). Agent id = the ERC-8004 token id. Owner = `ownerOf(agentId)` on the IdentityRegistry.
- The hired provider address is the address in the agent's signed ERC-8183 quote, and the same address appears as `provider` in `JobCreated` and `JobFunded`. Marque refuses a hire if that address does not match the agent's registered wallet or declared commerce address.
- Category is Marque's classification of the agent, frozen at the moment of hire.
- Because every marketplace shares the same AgenticCommerce contract, a job counts as a Marque hire only if it was bound to a Marque hire intent: the wallet signed the intent, and the `JobCreated` client, provider and description hash match it. Our API lists only those jobs.
- Builder listings: the owner proves control of the ERC-8004 identity by signing a message with the owning wallet; Marque checks `ownerOf`.

## 6. API (public, no key)

| Need | Endpoint |
|---|---|
| Config: contracts, events, token, team wallets, indexer lag | https://marque.trade/api/v1/phase2/config |
| Hires per wallet (four categories, deposit, completion, rating, all tx hashes, eligibility) | https://marque.trade/api/v1/phase2/wallet/{address} |
| Agents per owner (listing and quality checks) | https://marque.trade/api/v1/phase2/owner/{address} |
| One job, full timeline | https://marque.trade/api/v1/phase2/job/{chainId}/{jobId} |
| Agents per category | https://marque.trade/api/v1/phase2/coverage |
| Totals | https://marque.trade/api/v1/phase2/stats |

Example: [paste the live /wallet response for the smoke-test wallet, with a note that it is a team wallet and marked ineligible]

Eligibility rules (reasons are returned, nothing is hidden): team wallets excluded; self-hire (client is the provider, owner or operator) excluded; zero deposits excluded; jobs not started on Marque excluded; ratings count only from the job's client after delivery; one hire counted per category per wallet.

## 7. Team wallets

[List from config/team-wallets.json: reference agent wallets, keeper, deployer, Francis's wallets, test wallets. Each with its role.]

## 8. Category coverage at [timestamp]

| Category | Hireable agents | Of which third-party | Cheapest live quote |
|---|---|---|---|
| Yield | [n] | [n] | [price] |
| Grid | [n] | [n] | [price] |
| Rebalancing | [n] | [n] | [price] |
| Health factor | [n] | [n] | [price] |

Live: https://marque.trade/api/v1/phase2/coverage

## 9. Hire flow

A user picks an agent, gets a live signed quote, and signs from their own wallet: open the job, attach the policy, set the price, approve exactly that amount, and fund escrow. The agent delivers on chain; payment releases after the dispute window. No blanket approvals. The spend cap is the escrow amount the user confirms. Revoke paths: cancel before funding, reclaim after expiry if undelivered, and allowance revoke from the user's page. Each is a real transaction.

## 10. Builder path ("build and list one quality agent")

https://marque.trade/builders. A listing counts as quality when: the wallet owns an ERC-8004 identity, proves it by signature, the agent's endpoint is live and callable, it is classified into a category, and it answers a live Marque test for that category. [Replace with BNB's definition if Gwen provides one.]

## 11. Readiness

Hosting: dedicated VPS behind Caddy with zero-downtime deploys, [Cloudflare yes/no]. Load test: [p95 numbers from LOAD-TEST.md]. Monitoring with alerts on indexer lag, seller availability and error rate. Status page: https://marque.trade/status.

Contact: Francis, [Telegram handle].
