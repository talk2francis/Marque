# PROTOCOL-FACTS.md

Measured on Sat 26 Sep 2026 between 05:35 and 06:10 UTC, read only (no transaction signed or sent).
Where a measured value differs from the pack, **the measured value wins** and the difference is listed
at the end. Raw evidence, regenerable:

- `docs/phase2/evidence/protocol-facts.json` from `packages/commerce/scripts/protocol-facts.mts`
- `docs/phase2/evidence/mainnet-event-proof.json` from `packages/commerce/scripts/mainnet-event-proof.mts`
- `docs/phase2/evidence/quote-facts.json` from `packages/commerce/scripts/quote-facts.mts`

SDK: `@bnbagent/sdk@0.6.0`, pinned in `packages/commerce`. Addresses below come from the SDK's
`NETWORKS` and `BNB_CHAIN_ADDRESSES`, except the ReputationRegistry (not in the SDK), which is the
ERC-8004 CREATE2 address and was verified by bytecode.

## 1. Contracts

| Contract | BSC mainnet (56) | BSC testnet (97) | Verified how |
|---|---|---|---|
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | code present |
| ERC-8004 ReputationRegistry (proxy) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | 130-byte ERC-1967 proxy |
| ReputationRegistry implementation | `0x16e0fa7f7c56b9a767e34b192b51f921be31da34` | same address | 10,491 bytes; `giveFeedback`, `revokeFeedback`, `getSummary`, `readFeedback`, `getClients`, `getLastIndex` selectors all present |
| ERC-8183 AgenticCommerce (proxy) | `0xea4daa3100a767e86fded867729ae7446476eba6` | `0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de` | SDK, live reads |
| EvaluatorRouter | `0x51895229e12f9876011789b04f8698af06ccd6da` | `0xd7d36d66d2f1b608a0f943f722d27e3744f66f25` | SDK, live reads |
| OptimisticPolicy | `0x9c01845705b3078aa2e8cff7520a6376fd766de5` | `0xd6a4217588f6b1f5657a92a3e94e6422ad771cea` | SDK; whitelisted on the router on both chains |

## 2. Commerce parameters

| Value | Mainnet (56) | Testnet (97) |
|---|---|---|
| **`disputeWindow()`** | **604,800 s = 168 h = 7 days** | **900 s = 15 min** |
| Dispute vote quorum / active voters | 3 of 5 | 1 of 2 |
| `paymentToken()` (kernel default) | U `0xcE24439F2D9C6a2289F741120FE202248B666666` | U `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565` |
| `isPaymentTokenSupported` | **U, USD1, USDC, USDT all true** | U, USDC, USDT all true (USD1 not in the testnet catalog) |
| Token decimals | 18 for every catalog asset | 18 for every catalog asset |
| `platformFeeBP()` | 0 | 0 |
| `MAX_EXPIRY_DURATION` | 31,536,000 s (365 days) | 31,536,000 s |
| `jobCounter()` at measurement | 56,802 | 1,334 |
| Paused (commerce / router) | no / no | no / no |
| Paymaster (SDK) | MegaFuel `bsc-megafuel.nodereal.io`, `usePaymaster: true` | MegaFuel testnet, `usePaymaster: true` |
| Average block time (last 100,000 blocks) | 450 ms | 450 ms |

Mainnet addresses for the catalog assets: USDT `0x55d398326f99059fF775485246999027B3197955`, USDC
`0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`, USD1 `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d`.
Testnet: USDT `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`, USDC `0x64544969ed7EBf5f083679233325356EbE738930`.

## 3. Event topics against real logs

Every topic0 in SPEC-TRACKING section 2 was recomputed with viem `keccak256` and **matches the pack
exactly (14 of 14)**. Real logs found on chain, topic0 equal to the table:

| Event | Mainnet (56), job 56784, one full lifecycle | Testnet (97) |
|---|---|---|
| JobCreated | `0xf5eda93753f80553f4a8ab87fdfff019752712356822f739c95188672f3da9fe` (block 121602480) | `0x4c35e06dc2c1849997791c7d8a468d565f27a0fa85614e7108c3821843d7a983` |
| BudgetSet | `0xd2eeebe489d8acee4401ed29e11f57800df923cfcd8c541bd5ad49c1bed454a8` | `0xc198e47f76ea39a2cd4445d4db7973606c8a6381b20013fdbf771c8cedb1f9dc` |
| JobFunded | `0xd2eeebe489d8acee4401ed29e11f57800df923cfcd8c541bd5ad49c1bed454a8` (same tx as BudgetSet) | `0xeef61a10c29fe60fd7e36fef96280700af5325b8e5344f178608f85ddd28a19c` |
| JobSubmitted | `0x2bc3d6cc76687643eaa4f0632e4b52acd55bf72b5ef3ddcd0129856701e39ec0` (342 blocks after create) | `0xa55e6179004c99d5c0d950c756cbdb5af9bc430bd4413ce00b4b99cbb2fa950f` |
| JobCompleted | `0xce46670f3ead947eeddeebc631e37d6b6210df8c2842407c43c4bb62b78f46a7` (block 123833119) | `0xc70172d10f179ca452891c86eed4a1bdff7b31bd15596e57ea6e97bdf1b340a5` |
| PaymentReleased | same tx as JobCompleted | same tx as JobCompleted |
| JobRegistered (router) | not searched on 56 | `0xc597a1c53d6d39db4280596aee22093266fde698c6c53d710605769d48db512a` |
| JobSettled (router) | not searched on 56 | `0xc70172d10f179ca452891c86eed4a1bdff7b31bd15596e57ea6e97bdf1b340a5` |
| NewFeedback, FeedbackRevoked, Disputed, JobRejected, JobExpired, Refunded | not found in the log window public RPCs serve (see section 5) | same |

Mainnet job 56784 shows the shape users will live with: delivered **342 blocks (about 2.5 min)**
after creation, settled (JobCompleted + PaymentReleased) about 2.23 M blocks later, after the 7-day
dispute window. In the same mainnet tx, a funded job emits BudgetSet and JobFunded together, which
means that buyer batched setBudget and fund.

`NewFeedback` and `FeedbackRevoked` layouts could not be checked against a live log in this window.
The implementation bytecode carries the standard ERC-8004 selectors; P2-04 confirms the event layout
against the first rating it writes on testnet before HANDOFF claims it.

## 4. Reference sellers: live signed quotes

A2A JSON-RPC `message/send` to `https://marque.trade/agents/<slug>/` with a `negotiate` data part.
Each quote verified with the SDK's own `verifyQuoteSignature`.

| Seller | chain_id | verifying_contract canonical | price | currency | TTL | signature | signer = ERC-8004 agent wallet = owner (97 and 56) |
|---|---|---|---|---|---|---|---|
| Keel | 97 | yes | 0.05 | U (testnet) | 900 s | valid, EIP-191 | `0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00`, yes |
| Sluicegate | 97 | yes | 0.10 | U (testnet) | 900 s | valid, EIP-191 | `0x253F7Ad5D52099C4a2293418a661e9974DfB5e84`, yes |
| Lattice | 97 | yes | 0.10 | U (testnet) | 900 s | valid, EIP-191 | `0x5aAF7b5B2170986C59279682Bd714c475ae8C718`, yes |
| Bound | 97 | yes | 0.15 | U (testnet) | 900 s | valid, EIP-191 | `0x5B1c9fBc684a1722Bb5C66C0B22F149dA69768d6`, yes |
| Redcell | 97 | yes | 0.25 | U (testnet) | 900 s | valid, EIP-191 | `0x1F0D0eF5a279888E3b86c8a99A8A99F19fCEc587`, yes |

Latency 41 to 125 ms. `estimated_completion_seconds` is 600 for all five.

## 5. Differences from the pack (measured value wins)

| # | Pack assumed | Measured | Consequence |
|---|---|---|---|
| PF-1 | `NETWORKS` is imported from `@bnbagent/sdk/networks` | `NETWORKS` is exported from the package root; `/networks` exports `BNB_CHAIN_ADDRESSES`, `getAddress`, `listAssets` | `packages/commerce` imports from both; codegen snapshots them (P2-02) |
| PF-2 | Dispute window "printed in days" | Mainnet **7 days**, testnet 15 minutes | `expiredAt >= now + 7 d + allowance` on mainnet. Refund for an undelivered job is claimable only after that date. Settlement (JobCompleted) lands a week after delivery. **The quest must count delivery (JobSubmitted), or no user completes inside a week.** Question 2 to Gwen is now urgent |
| PF-3 | USDT support unknown | **USDT, USDC, USD1 and U all supported on mainnet** | Ladder rung 1 for payment token is available. Sellers must quote in USDT and accept `createJobWithToken(USDT)` jobs (P2-05 verifies on fork and testnet) |
| PF-4 | Quote has a `provider` field | `NegotiationResult` carries no provider address. The provider is the address `provider_sig` recovers to | Quote verification recovers the signer, then requires signer == ERC-8004 agent wallet (or owner) for that exact token id. `createJob(provider = signer)` |
| PF-5 | Reputation code "verify at CREATE2 address" | Proxy of 130 bytes; implementation `0x16e0...da34` carries every ERC-8004 selector on both chains | Rating ladder rung 1 is available on 56 and 97 |
| PF-6 | Indexer reads logs through "the existing RPC failover pool" | Public mainnet RPCs serve `eth_getLogs` only for about the newest 20,000 blocks (about 2.5 h at 450 ms). bnbchain dataseed refuses getLogs, blockrazor caps ranges at 25 blocks, 1rpc's quota is exhausted, publicnode serves 5,000-block ranges near head. Our QuickNode archive plan caps getLogs at 5 blocks | The indexer tails head through publicnode and never falls behind more than about 2 h. A catch-up after a longer outage, and the rebuild drill, go through the archive node in 5-block ranges or by state binary search. A free log-capable key (NodeReal or Ankr) would remove the constraint: **Request to Francis, optional** |
| PF-7 | Cancel before funding is `cancelOpen` | SDK `cancelOpen(jobId)` calls `AgenticCommerce.reject(jobId, reason, optParams)` while the job is Open | Client-side cancel calls `reject` with a zero reason |
| PF-8 | Sellers quote on mainnet | All five sellers quote on **testnet 97** today (`[network] default = "bsc-testnet"`), currency testnet U | P2-05 moves them to 56 behind "approved, mainnet" |
| PF-9 | Mainnet sellers need BNB for gas | SDK marks both networks `usePaymaster: true` (MegaFuel), and the five mainnet ERC-8004 registrations on 8 Sep had `effectiveGasPrice 0` | P2-05 tests whether MegaFuel sponsors `submit` on mainnet before asking for BNB |
