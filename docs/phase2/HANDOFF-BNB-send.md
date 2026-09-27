<!-- Paste-ready copy of HANDOFF-BNB.md for Google Docs (P2-06). Plain headings and tables. -->

# Marque: Set and Earn technical handoff

To: Damian (@bnb_damian), Gwen (@gwenbnb)
From: Francis, Marque (Xyndicate Labs)
Date: Sun 27 Sep 2026 (facts measured through Sun 27 Sep 2026, 10:40 UTC)

Everything below is filled from values we measured on chain or from our live API. Where something is still being finished, it says so with a date. Launch is Wed 30 Sep 2026.

---

## 1. Product

| | |
|---|---|
| Name | Marque |
| Live URL | https://marque.trade |
| One-line description | Marque is the BNB Smart Chain agent marketplace that tests agents before you hire them, holds your payment in on-chain escrow until the work is delivered, and records every hire on chain. |
| Short version (if needed, under 100 characters) | Hire BNB Chain agents that actually work, with escrowed payment and on-chain proof. |
| X | https://x.com/marquetrade |
| Support for users | X @marquetrade (https://x.com/marquetrade) and the Marque Telegram community group (https://t.me/marque_marketplace) |
| Repository | https://github.com/talk2francis/Marque |
| Brand kit | https://marque.trade/brand/marque-brand-kit.zip |
| Quest page for users | https://marque.trade/quest (live since Sat 26 Sep 2026: each step, its recommended agent and price, and the wallet's progress read from the chain; any wallet at https://marque.trade/quest?addr={address}). Contracts and events: https://marque.trade/protocol |

## 2. Network

Campaign network: BNB Smart Chain mainnet (chain 56), live since Sat 26 Sep 2026: all Marque reference agents quote and deliver on chain 56, and the first mainnet hires in every category are on chain (section 6).
The network is shown in the site header and on every price, hire, job and receipt.
Testnet (97) runs the same contracts as our staging environment and is indexed by the same API.

## 3. Contracts we read and write

All ERC-8183 and ERC-8004 contracts are BNB Chain's canonical deployments from @bnbagent/sdk 0.6.0. Marque deploys no escrow and never holds user funds; users sign every hire from their own wallet.

| Contract | Chain 56 | Chain 97 |
|---|---|---|
| ERC-8004 IdentityRegistry | 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 | 0x8004A818BFB912233c491871B3d84C89A494BD9e |
| ERC-8004 ReputationRegistry | 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (code verified: yes, ERC-1967 proxy to 0x16e0fa7f7c56b9a767e34b192b51f921be31da34) | 0x8004B663056A597Dffe9eCcC1965A193B7388713 (code verified: yes) |
| ERC-8183 AgenticCommerce | 0xea4daa3100a767e86fded867729ae7446476eba6 | 0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de |
| EvaluatorRouter | 0x51895229e12f9876011789b04f8698af06ccd6da | 0xd7d36d66d2f1b608a0f943f722d27e3744f66f25 |
| OptimisticPolicy | 0x9c01845705b3078aa2e8cff7520a6376fd766de5 (dispute window: 168 h, read on chain) | 0xd6a4217588f6b1f5657a92a3e94e6422ad771cea (0.25 h) |
| Payment token (Marque's agents) | U 0xcE24439F2D9C6a2289F741120FE202248B666666, the escrow's default token. The escrow also accepts USDT, USDC and USD1, and our API indexes any of them; third-party agents may quote in those | U (test) 0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565 |
| MarqueRegistry (our receipt anchors, no funds) | not used | 0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7 |

## 4. Events for Set and Earn

Topic0 values verified against real logs on Sat 26 Sep 2026: hire 0xb1e53c47… (https://bscscan.com/tx/0xb1e53c4714ac4333181afeb8688c55a58679dcfca09058aa733cd6922da4ec43) (chain 56), deposit 0x767be68f… (https://bscscan.com/tx/0x767be68f1e6c4c4e678679d68dcf0f703d5d6a30e8fb351fda7b47b71814f046) (chain 56), delivery 0xdc4a2b97… (https://bscscan.com/tx/0xdc4a2b97a93811d993bef30bc006071d053c7bbebcf7dff19c82e452ed178557) (chain 56), settlement 0xa17f5177… (https://testnet.bscscan.com/tx/0xa17f5177849a3e66fda01eab6b916461832d7ee1fc296882d853db1366015ed4) (chain 97), payment 0xa17f5177… (https://testnet.bscscan.com/tx/0xa17f5177849a3e66fda01eab6b916461832d7ee1fc296882d853db1366015ed4) (chain 97), rating 0x9f5941b9… (https://bscscan.com/tx/0x9f5941b912347d8d5a1f84e789737b4b829f5abfed952b71c3bad64a925d3a08) (chain 56). All 14 events we index are verified; the full list with transactions is in /api/v1/phase2/config. Settlement on mainnet happens after the 7-day window, so its first mainnet log is due on Sat 3 Oct 2026.

| Quest step | Contract | Event | topic0 |
|---|---|---|---|
| Hire | AgenticCommerce | JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook) | 0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9 |
| Deposit | AgenticCommerce | JobFunded(uint256 indexed jobId, address indexed client, address indexed provider, uint256 amount) | 0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52 |
| Job completion (agent delivered) | AgenticCommerce | JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable) | 0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e |
| Job completion (settled after the dispute window) | AgenticCommerce | JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason) | 0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444 |
| Payment to agent | AgenticCommerce | PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount) | 0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0 |
| Rating | ERC-8004 ReputationRegistry | NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) | 0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc |

Refund path, for completeness: Refunded(uint256 indexed jobId, address indexed client, uint256 amount), topic0 0x7ca5472b7ea78c2c0141c5a12ee6d170cf4ce8ed06be3d22c8252ddfc7a6a2c4.

Our rating convention: tag1 = "starred", tag2 = "marque:<category>", value 20 to 100 for 1 to 5 stars, valueDecimals = 0, feedbackURI = our job URL, feedbackHash = keccak256 of that JSON.

### BNB confirmations received from Gwen on Sun 27 Sep 2026

1. Hire and deposit confirmed: report JobCreated as the hire and JobFunded with amount > 0 as the deposit, from the canonical AgenticCommerce contract.
2. Report both completion moments: JobSubmitted is delivery by the agent; JobCompleted is settlement after the OptimisticPolicy dispute window. The API reports both separately, including each transaction hash and timestamp when present.
3. Rating confirmed: use ERC-8004 ReputationRegistry giveFeedback, observed as NewFeedback, sent by the job's client wallet.
4. Attribution is the one pending confirmation: Gwen is double-checking whether BNB will use Marque's public per-wallet API as the marketplace-attribution source. The API counts only jobs bound to a Marque hire intent and marks jobs started elsewhere as not_marque; section 5 documents the binding rule.
5. Quality should include uptime: Marque stores probe history and requires a callable answer within the last 24 hours with no newer recorded failure. Storefronts report HTTP-success discovery samples over discovery attempts. The owner API separately reports builder task-probe attempts and successes for the current declared endpoint. Neither is claimed as continuous task uptime. If BNB needs an uptime pass/fail gate, please confirm the window and threshold.
6. API shape accepted: Gwen confirmed that documenting Marque's own JSON shape is sufficient. Section 6 gives the endpoints, eligibility rules and a live response example.

## 5. How agent ids and owner wallets are recorded

- Every agent on Marque is an ERC-8004 identity on chain 56 (or 97 on staging). Agent id = the ERC-8004 token id. Owner = ownerOf(agentId) on the IdentityRegistry.
- The hired provider address is the address in the agent's signed ERC-8183 quote, and the same address appears as provider in JobCreated and JobFunded. Marque refuses a hire if that address does not match the agent's registered wallet or declared commerce address.
- Category is Marque's classification of the agent, frozen at the moment of hire.
- Because every marketplace shares the same AgenticCommerce contract, a job counts as a Marque hire only if it is bound to a Marque hire intent: Marque records the intent when the user asks for the price (no signature is asked for), and binds it only when that wallet's own JobCreated names the quoted provider, carries the quoted description hash, and lands within 30 minutes. Jobs opened elsewhere are listed as not_marque and never counted.
- Builder listings: the owner proves control of the ERC-8004 identity by signing a message with the owning wallet; Marque checks ownerOf.

## 6. API (public, no key)

| Need | Endpoint |
|---|---|
| Config: contracts, events, token, team wallets, indexer lag | https://marque.trade/api/v1/phase2/config |
| Hires per wallet (four categories, deposit, completion, rating, all tx hashes, eligibility) | https://marque.trade/api/v1/phase2/wallet/{address} |
| Agents per owner (listing and quality checks) | https://marque.trade/api/v1/phase2/owner/{address} |
| One job, full timeline | https://marque.trade/api/v1/phase2/job/{chainId}/{jobId} |
| Agents per category | https://marque.trade/api/v1/phase2/coverage |
| Totals | https://marque.trade/api/v1/phase2/stats |

Example, live response for our mainnet smoke-test wallet (a team wallet, so eligible: false with reason team_wallet; its hires array is cut to one job here):

    {
      "wallet": "0x5ac2448fc79ef8d33710b1bced5aeff90138b452",
      "chainId": 56,
      "asOfBlock": {
        "56": 124180294
      },
      "quest": {
        "categories": {
          "yield": {
            "done": true,
            "delivered": true,
            "jobKey": "56:56806"
          },
          "grid": {
            "done": true,
            "delivered": true,
            "jobKey": "56:56808"
          },
          "rebalancing": {
            "done": true,
            "delivered": true,
            "jobKey": "56:56809"
          },
          "health_factor": {
            "done": true,
            "delivered": true,
            "jobKey": "56:56810"
          }
        },
        "ratedAll": true,
        "ownAgentListed": {
          "done": false,
          "agentKey": null
        },
        "eligible": false,
        "reasons": [
          "team_wallet"
        ]
      },
      "hires": [
        {
          "jobKey": "56:56810",
          "chainId": 56,
          "jobId": "56810",
          "agent": {
            "agentKey": "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556",
            "agentId": "341556",
            "name": "Keel",
            "owner": "0xdf1074a272c53a1a10b96fa0201eb58bbbaafe00",
            "provider": "0xdf1074a272c53a1a10b96fa0201eb58bbbaafe00",
            "category": "health_factor",
            "firstParty": true
          },
          "amount": "50000000000000000",
          "token": {
            "address": "0xce24439f2d9c6a2289f741120fe202248b666666",
            "symbol": "U",
            "decimals": 18
          },
          "state": "SUBMITTED",
          "marque": true,
          "intentId": "68e060a2-6d04-43e1-8369-ea72d3168327",
          "tx": {
            "created": "0xfa59181e5765c1b24f7b8db1efa4b3b86591f600d8e903b051126943b90989dc",
            "registered": "0x930a3bf80f6d43012b581b0cd999c6e3c9c27a8ec11d4c0c0bcc3ba69ea30db8",
            "budgetSet": "0x6ced5a2bb6caa19a812e6c5086dd5e9686ad4467f9e81245298260246ed3938a",
            "funded": "0x767be68f1e6c4c4e678679d68dcf0f703d5d6a30e8fb351fda7b47b71814f046",
            "submitted": "0xdc4a2b97a93811d993bef30bc006071d053c7bbebcf7dff19c82e452ed178557",
            "completed": null,
            "paymentReleased": null,
            "rejected": null,
            "refunded": null,
            "rating": "0x9f5941b912347d8d5a1f84e789737b4b829f5abfed952b71c3bad64a925d3a08"
          },
          "timestamps": {
            "created": "2026-09-26T17:11:24.000Z",
            "funded": "2026-09-26T17:11:29.000Z",
            "submitted": "2026-09-26T17:11:39.000Z",
            "completed": null
          },
          "rating": {
            "value": 60,
            "stars": 3,
            "tx": "0x9f5941b912347d8d5a1f84e789737b4b829f5abfed952b71c3bad64a925d3a08",
            "revoked": false
          },
          "eligible": false,
          "reasons": [
            "team_wallet"
          ]
        }
      ],
      "totals": {
        "hires": 7,
        "deposits": 5,
        "delivered": 5,
        "settled": 0,
        "ratings": 5
      }
    }

Tracking responses use a 15-second cache and open CORS. Wallet and stats endpoints accept ?chainId=97; job URLs include the chain in the path. Owner results include a chainId on each identity and can contain both networks. Also available: https://marque.trade/api/v1/phase2/ratings/{agentId} (verified-buyer and registry-wide averages, kept apart).

Owner JSON shape: { owner, qualityListing, agents }. Each agent includes agentKey, chainId, agentId, name, category, listedOnMarque, qualityListing, quality, availability, jobsReceived and jobsPaid. quality contains listing, passed and checks; each check contains id, label, pass, state, reason, fix and note. availability contains windowHours, attempts, successes, firstAt, lastAt and scope. Timestamps are ISO strings or null; sample counts are integers, not uptime percentages. The current response evaluates up to eight discovered identities per owner, not an exhaustive owner inventory. An owner with more identities should contact us if their intended listing is absent.

Eligibility rules (reasons are returned, nothing is hidden): team wallets excluded; self-hire (client is the provider, owner or operator) excluded; zero deposits excluded; jobs not started on Marque excluded; ratings count only from the job's client after delivery; one hire counted per category per wallet.

## 7. Team wallets

Every address Marque or its team controls. Activity from these is returned with team_wallet and never counts. Live copy in /api/v1/phase2/config.

| Address | Role | Chains |
|---|---|---|
| 0x5B1c9fBc684a1722Bb5C66C0B22F149dA69768d6 | reference seller Bound (agent wallet and owner) | 56, 97 |
| 0x5aAF7b5B2170986C59279682Bd714c475ae8C718 | reference seller Lattice | 56, 97 |
| 0x253F7Ad5D52099C4a2293418a661e9974DfB5e84 | reference seller Sluicegate | 56, 97 |
| 0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00 | reference seller Keel | 56, 97 |
| 0x1F0D0eF5a279888E3b86c8a99A8A99F19fCEc587 | reference seller Redcell | 56, 97 |
| 0x8122991297DC98Dc5c735fDE90a501528922aFdC | reference seller Tidemark (second first-party yield agent) | 56, 97 |
| 0x781ee69bf9f9C14E2BC496181714f4DF5348556a | keeper (router.settle, P2-05) | 56, 97 |
| 0x9598AB46aAB33389C2e9Ffe0511effD330f67F9B | testnet operator (charter sandbox, receipt anchors) | 97 |
| 0x2e010AaDFdFEbC2AdFCAFA5F83e9687ffA47C573 | mainnet deployer (PancakeSwap proof run); also Francis personal wallet | 56, 97 |
| 0xC83d716523C1958bcC48d19854ef1eb360bEf878 | test wallet (P2-02 testnet hire proof) | 97 |
| 0x0d8c9ad8eebb6879fefa218f0799219bcaabe999 | Francis personal wallet | 56, 97 |
| 0x99186e9a933fd83c0813d7ee694464ca55aeb7f9 | Francis personal wallet | 56, 97 |
| 0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452 | test wallet (P2-05 mainnet smoke hires) | 56 |
| 0x4bfD3f9c81a743F852Fb424FD487A1c53d7786D5 | P2-08 desktop acceptance wallet | 56 |
| 0x317C5DddfE27D7d9bAaf41f2AD38E9B83B40f99D | P2-08 mobile acceptance wallet | 56 |
| 0x4e9C0f537cCcA8Db4BDD16FBA9Ff306F86a82505 | P2-10 builder acceptance fixture (testnet only) | 97 |

## 8. Category coverage at Sat 26 Sep 2026, 17:22 UTC

| Category | Hireable agents | Of which third-party | Cheapest live quote |
|---|---|---|---|
| Yield | 3 (Sluicegate, Tidemark, Brain on BNB Venus Yield Ranking) | 1 | 0.1 U |
| Grid | 4 | 3 | 0.1 U |
| Rebalancing | 4 | 3 | 0.1 U |
| Health factor | 3 | 2 | 0.05 U |

Hireable means a signed or provider-verified quote in the last 2 hours, from the agent's own ERC-8004 wallet, on chain 56, bound to the canonical escrow. All counted agents are on chain 56. Live: https://marque.trade/api/v1/phase2/coverage

First mainnet hires, one per category, from our smoke-test wallet (team wallet, not counted): yield job 56806 (Sluicegate) and 56807 (Tidemark), grid 56808 (Lattice), rebalancing 56809 (Bound), health factor 56810 (Keel). Each was delivered on chain in 21 to 35 s and rated. Transactions: /api/v1/phase2/wallet/0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452.

## 9. Hire flow

A user picks an agent, gets a live signed quote, and signs from their own wallet: open the job, attach the policy, set the price, approve exactly that amount, and fund escrow. The agent delivers on chain; payment releases after the dispute window. No blanket approvals. The spend cap is the escrow amount the user confirms. Revoke paths: cancel before funding, reclaim after expiry if undelivered, and allowance revoke from the user's page. Each is a real transaction.

## 10. Builder path ("build and list one quality agent")

https://marque.trade/builders. A listing counts as quality when: the wallet owns an ERC-8004 identity, proves it by signature, the agent's endpoint answered a callable request within the last 24 hours, it is classified into a category, and it answers a live Marque test for that category. Each check and its fix is returned by /api/v1/phase2/owner/{address}. Availability is disclosed as separate 24-hour discovery reachability and builder task-probe samples. These irregular samples are not continuous task uptime, and no BNB uptime pass threshold has been specified.

## 11. Readiness

Hosting: dedicated VPS behind Caddy with blue/green deploys that roll back automatically when checks fail; no Cloudflare. On Sun 27 Sep, the final load test passed at 25, 50 and 100 virtual users: page p95 was 93, 116 and 462 ms; API p95 was 142, 97 and 489 ms; there were no errors or process restarts. At 250 users there were still no errors or restarts, but the shared VPS was saturated and p95 rose to 1,123 ms for pages and 1,804 ms for APIs. Monitoring checks nine conditions every minute: indexer lag, reference-seller quotes, per-category hireable supply, HTTP 5xx rate, keeper balance, disk, restart loops, seller memory and stuck paid jobs. All nine alert paths fired in test. Private Telegram operations alerts are connected; a setup message was delivered successfully on 27 September. Public user support is the community group below. Status page: https://marque.trade/status.

Contact: Francis via X @marquetrade or the Marque Telegram community group: https://t.me/marque_marketplace.
