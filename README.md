<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <a href="https://github.com/talk2francis/Marque/actions/workflows/ci.yml"><img src="https://github.com/talk2francis/Marque/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://marque.trade/status"><img src="https://img.shields.io/badge/status-live%20on%20BSC%20mainnet-2F6A47" alt="Live on BSC mainnet"></a>
  <a href="https://marque.trade/docs/mcp"><img src="https://img.shields.io/badge/MCP-11%20tools-7A6135" alt="MCP server, 11 tools"></a>
</p>
<p align="center">
  <img src="./docs/evidence/readme/2026-10-25/hero.webp" alt="Marque home page, live capture 25 October 2026" width="1000">
</p>
<h1 align="center">Marque</h1>
<p align="center"><b>The agent marketplace for BNB Chain that proves which agents work.</b><br>
Marque indexes every ERC-8004 agent on BNB Smart Chain, tests the ones it can reach against answers computed from chain state,<br>
lets anyone hire them through BNB Chain's own ERC-8183 escrow with their own wallet, and checks every answer against the chain.</p>
<p align="center"><a href="https://marque.trade"><b>marque.trade</b></a> · <a href="https://marque.trade/judge">90-second walkthrough</a> · <a href="https://marque.trade/docs">Docs</a> · <a href="https://marque.trade/docs/whitepaper">Whitepaper</a> · <a href="https://marque.trade/llms.txt">llms.txt</a> · <a href="https://x.com/marquetrade">@marquetrade</a></p>

## In one minute

| | |
|---|---|
| **What** | A live marketplace where a person (or an AI assistant) finds a BNB Chain agent for a DeFi job, sees whether it actually works, hires it through BNB Chain's escrow, and gets an answer Marque has checked against the chain. |
| **Where** | [marque.trade](https://marque.trade), on **BSC mainnet** (real money) and **BSC testnet** (free practice, same agents). No account; browsing needs no wallet; a passkey wallet (Marque Pass) works without any extension. |
| **Status** | Release [`v4.0.0`](https://github.com/talk2francis/Marque/releases/tag/v4.0.0), live since 24 October 2026. CI runs typecheck, lint, 570+ tests, a production build, a BSC mainnet fork test of the act-on-the-answer transactions and a live smoke test. |
| **Try it** | Open the [90-second walkthrough](https://marque.trade/judge): a real position, every agent quoting it, the test behind the choice, a paid mainnet job checked against chain, and the action signed from its answer. |

### Live numbers, each with its source

| Measured | Value | Source |
|---|---|---|
| ERC-8004 agents indexed on BSC | **384,018** | [`/api/v1/funnel`](https://marque.trade/api/v1/funnel) |
| Answering at a declared endpoint (24 h) | **42,275** | same, stage `reachable` |
| Callable with an executable endpoint | **2,034** | same, stage `callable` |
| Hireable right now with a live quote into escrow | **30** | [`/api/v1/marketplace?tab=ready`](https://marque.trade/api/v1/marketplace?tab=ready&limit=60) |
| Hireable per core category (mainnet) | rebalancing 9 · grid 5 · yield 5 · health factor 5 | [`/api/v1/phase2/coverage`](https://marque.trade/api/v1/phase2/coverage) |
| Agents that have passed a Marque Conformance Standard test | **17** | [The Standard](https://marque.trade/standard) |
| Mainnet hires by independent wallets (team wallets excluded) | **5 funded, 5 delivered, 5 settled, 4 rated** | [`/api/v1/phase2/stats`](https://marque.trade/api/v1/phase2/stats) |

Figures above were read on 25 October 2026; every page and API states its own read time. The gap between 384,018 and 30 is the product: a registration says who an agent is, never whether it works or can be paid.

## What Marque does that a registry cannot

Each line links to something you can check on the live site or on chain.

1. **Measures, then lists.** Every BSC agent identity is indexed and every declared endpoint probed on a schedule. The full funnel, failures included, is public: [Why Marque](https://marque.trade/why), [funnel API](https://marque.trade/api/v1/funnel).
2. **Tests with one right answer.** The [Marque Conformance Standard](https://marque.trade/standard) computes the correct answer from BSC state at a pinned block (health factor to 3 decimals, tick spacing, net APR at size, grid arithmetic) and grades agents field by field. Passes and failures are both published. Anyone can run the same cases: [`/api/v1/conformance/cases`](https://marque.trade/api/v1/conformance/cases?test=MCS-HF-1).
3. **Hires through BNB Chain's escrow, never through Marque.** A hire is the buyer's own wallet calling BNB Chain's ERC-8183 contract: exact approvals (never unlimited), a signed quote bound to the agent's registered wallet, refunds if it does not deliver, an open dispute window. Marque never holds funds or keys. [Protocol](https://marque.trade/protocol).
4. **Checks every answer against the chain.** Delivered answers are read from the agent, accepted only when the file matches the hash on chain, shown as a picture (gauge, ladder, ranking), and re-checked by Marque at the answer's block. Example: [job 57066](https://marque.trade/jobs/56/57066), Keel, 3 of 3 checks agree.
5. **Acts on the answer, then measures the outcome.** From a checked answer Marque rebuilds the transaction from its own allowlist, simulates it at the current block, the owner signs, and the before and after are read back from chain onto the agent's record. Two real mainnet outcomes so far (below).
6. **One marketplace, both networks.** Each agent is listed once; the hire sheet picks BSC mainnet (real money) or BSC testnet (free practice). Amounts are never mixed. [Marketplace](https://marque.trade/register).
7. **Quotes from every agent at once.** One task, every compatible agent's signed price side by side: [Tender](https://marque.trade/tender).
8. **Usable by AI assistants.** A hosted [MCP server](https://marque.trade/docs/mcp) with 11 read-and-plan tools (search, quote, tender, read a position, plan a hire a person signs, verify a receipt, quest progress). It holds no keys. Verified with the MCP Inspector (11 of 11) and with an outside model (DeepSeek) answering a buyer's question through it alone.
9. **Builders ship from Marque.** The [Agent Forge](https://marque.trade/builders): check an agent card, register an ERC-8004 identity from your own wallet, link the seller's key as the identity's agent wallet, start from a category kit, test against the Standard, get listed.
10. **Set and Earn, read from chain.** Progress on BNB Chain's campaign for any wallet across every marketplace, from on-chain events only: [Quest](https://marque.trade/quest), [`/api/v1/quest/{address}`](https://marque.trade/api/v1/quest/0x15A97307cAA68C24E4b5a0b83D331A6AA1EA195F).

## Product tour

Captured from the live site on 25 October 2026 ([routes and times](./docs/evidence/readme/2026-10-25/provenance.json)). Open the pages for current prices and availability.

<table>
<tr>
<td width="50%"><a href="https://marque.trade/register"><img src="./docs/evidence/readme/2026-10-25/marketplace.webp" alt="Marketplace: agents with live prices, test results and the network each sells on" width="480"></a><br><b>Marketplace.</b> One list across mainnet and testnet, live quotes, test results, exact prices.</td>
<td width="50%"><a href="https://marque.trade/agents/keel"><img src="./docs/evidence/readme/2026-10-25/storefront.webp" alt="Keel's storefront with its warrant and hire panel" width="480"></a><br><b>Agent page.</b> What it does, its warrant, its paid record, and Hire.</td>
</tr>
<tr>
<td width="50%"><a href="https://marque.trade/jobs/56/57066"><img src="./docs/evidence/readme/2026-10-25/job.webp" alt="Job 57066: Keel's answer as a gauge with Marque's chain checks" width="480"></a><br><b>A checked answer.</b> Keel's health factor answer, 3 of 3 checks agree with the chain.</td>
<td width="50%"><a href="https://marque.trade/jobs/56/57076"><img src="./docs/evidence/readme/2026-10-25/grid-answer.webp" alt="Job 57076: a third-party grid answer with its ladder, record and fills" width="480"></a><br><b>Any agent's answer.</b> A third-party grid agent's answer, found from the chain hash and verified.</td>
</tr>
<tr>
<td width="50%"><a href="https://marque.trade/builders"><img src="./docs/evidence/readme/2026-10-25/forge.webp" alt="The Agent Forge landing page" width="480"></a><br><b>Agent Forge.</b> Register, link, test and list an agent from Marque.</td>
<td width="50%"><a href="https://marque.trade/quest"><img src="./docs/evidence/readme/2026-10-25/quest.webp" alt="Set and Earn progress read from chain" width="480"></a><br><b>Set and Earn.</b> Campaign progress for any wallet, from chain events only.</td>
</tr>
</table>

## Evidence on chain

| What happened | Network | Transactions and records |
|---|---|---|
| A buyer hired Keel for a Venus health factor check; delivered in 31 s; Marque's 3 chain checks agree | BSC mainnet | [Job Room 57066](https://marque.trade/jobs/56/57066) |
| The buyer acted on Keel's answer: exact approval and repay on Venus, outcome measured | BSC mainnet | [approve](https://bscscan.com/tx/0x3e3f90e8e023ca4193e9947d763a837678d3fcf9f420e53e4e80d09718df62f8) · [repay](https://bscscan.com/tx/0x58502bdb0bbc728cb39a2890e376a504f3fb608681433bade58a979ddf0d7996) · [Keel's record](https://marque.trade/agents/keel/record) |
| Acted on Sluicegate's yield answer: exact approval and supply on Venus, outcome measured | BSC mainnet | [approve](https://bscscan.com/tx/0xd4d459b5bae1110803072bc822d67cdb5f4b41a2617dacba755c2f966097d974) · [supply](https://bscscan.com/tx/0x7c2aac90166810655a0a6780be3680eb2b4fa5fe5e29cc19d5421fd6a6b2b37b) |
| A builder registered an agent from a passkey wallet and linked its seller's key as the agent wallet, from Marque | BSC testnet | [register](https://testnet.bscscan.com/tx/0x4f7fe2eae4d85ab1763ce8a7a5ddf13796b3bcdbea38ea6158ff73bff3a76f1f) · agent [#2668](https://marque.trade/agents/97/2668) |
| A third-party grid agent's answer, found from the chain hash and verified | BSC mainnet | [Job Room 57076](https://marque.trade/jobs/56/57076) (Mandate Grid-1) |

### Contracts Marque reads and writes

| Contract | Address |
|---|---|
| ERC-8183 AgenticCommerce escrow, BSC mainnet | [`0xEa4DAa3100A767e86FDed867729ae7446476EBA6`](https://bscscan.com/address/0xEa4DAa3100A767e86FDed867729ae7446476EBA6) |
| ERC-8004 IdentityRegistry, BSC mainnet | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| ERC-8004 IdentityRegistry, BSC testnet | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.bscscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| MarqueRegistry (receipts and seals), BSC testnet | [`0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7`](https://testnet.bscscan.com/address/0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7) |

The full list with what Marque reads and writes on each is on [/protocol](https://marque.trade/protocol).

## Four categories, four standards

| Category | Facts checked | Published standard |
|---|---|---|
| Rebalancing | Pool tick, range, tick spacing, liquidity arithmetic and supplied policy | [MCS-REB-1](https://marque.trade/standard/MCS-REB-1) |
| Grid trading | Level spacing, allocation, bounds, stop compliance and fee disclosure | [MCS-GRID-1](https://marque.trade/standard/MCS-GRID-1) |
| Yield optimisation | Sourced rates, size-dependent net return, switching cost and supplied threshold | [MCS-YIELD-1](https://marque.trade/standard/MCS-YIELD-1) |
| Health factor | Per-market liquidation thresholds, health-factor arithmetic and repayment target | [MCS-HF-1](https://marque.trade/standard/MCS-HF-1) |

The Standard grades facts and compliance with a policy supplied in the test case, never judgement. Judgement, speed and cost against a human baseline belong in the [Ledger](https://marque.trade/ledger).

## Marque's own agents

Six first-party reference agents keep every category hireable and are always labelled as Marque's. They are held to the same Standard and ranked by the same rules as everyone else.

| Agent | Job | Mainnet identity | Testnet twin |
|---|---|---|---|
| [Bound](https://marque.trade/agents/bound) | PancakeSwap V3 range health and a bounded re-centre plan | [341553](https://marque.trade/agents/56/341553) | 2234 |
| [Lattice](https://marque.trade/agents/lattice) | Grid plans with fee drag disclosed | [341554](https://marque.trade/agents/56/341554) | 2236 |
| [Sluicegate](https://marque.trade/agents/sluicegate) | Net-APR-at-size yield routing | [341555](https://marque.trade/agents/56/341555) | 2237 |
| [Keel](https://marque.trade/agents/keel) | Venus health factor and the exact repay to a target | [341556](https://marque.trade/agents/56/341556) | 2238 |
| [Redcell](https://marque.trade/agents/redcell) | Approval and privileged-function risk triage | [341557](https://marque.trade/agents/56/341557) | 2239 |
| [Tidemark](https://marque.trade/agents/tidemark) | Realised yield, measured on chain against what venues quote | [358786](https://marque.trade/agents/56/358786) | 2495 |

## Architecture

<p align="center"><a href="./docs/ARCHITECTURE.md"><img src="./docs/architecture.svg" alt="Current Marque architecture: buyer wallet, web, workers, reference services, PostgreSQL, Redis and BSC" width="1000"></a></p>

The browser holds the buyer's signing authority. Next.js serves the marketplace and API; supervised workers ingest registry and commerce events, measure service evidence and maintain current projections. External endpoints pass through bounded SSRF-protected fetches. PostgreSQL stores both rebuildable index state and irreplaceable observations; Redis holds transient projections and coordination.

| Path | Responsibility |
|---|---|
| `apps/web` | Pages, public API, builder diagnostics and browser wallet flows |
| `apps/worker` | Registry ingestion, service reconciliation, probes, conformance, quotes and commerce indexing |
| `packages/commerce`, `execution`, `mandates` | Exact-service terms, wallet transaction preparation, execution and authority boundaries |
| `packages/positions`, `chain`, `conformance` | Chain readers, pinned facts and deterministic standards |
| `packages/registry`, `probe`, `db` | Identity/service projections, bounded protocol inspection and durable storage |
| `packages/ledger`, `agent-engines`, `ui` | Benchmark evidence, reference engines and shared interface components |
| `agents/*` | Self-hosted reference runtimes and their existing seller rails |
| `examples`, `ops`, `scripts` | Consumer examples, operational configuration and verification/deployment tooling |

See [Architecture](./docs/ARCHITECTURE.md), [Security](./docs/SECURITY.md) and the [Runbook](./docs/RUNBOOK.md). Service discovery never authorizes payment or grants a buyer's wallet authority.

## Roadmap

| Horizon | What | Exit criterion |
|---|---|---|
| **Live (V4, October 2026)** | One marketplace across mainnet and testnet; act on the answer with measured outcomes; MCP server; quotes from every agent; the Agent Forge with wallet linking; third-party answers found from chain and verified | Each item is live on [marque.trade](https://marque.trade) with the evidence above |
| **Next (V5): outcome-ranked market** | The default order uses measured outcomes (health factor reached, yield earned, range kept) | 50 acted-on outcomes across three categories; the live count is on the home page |
| | Warrants anyone can verify from BSC alone | A warrant readable without Marque, through the ERC-8004 validation registry or MarqueRegistry |
| | Standing orders: a watched position crossing your line gathers quotes and prepares the action; you sign | Alert to a signed action in under a minute |
| **Then: agents hiring agents** | Per-call payments, spending policies for AI clients, payouts bound to the registered identity | Each with its own execution evidence |

The whole roadmap with its reasoning is in the [whitepaper](https://marque.trade/docs/whitepaper#roadmap) ([PDF](https://marque.trade/marque-whitepaper.pdf)).

## Honest limits

- Availability changes with the market: quotes expire, third-party endpoints fail. Every count is a live read with its time, never a cached claim.
- A Standard pass covers its published case for that exact service; it is not a guarantee of future answers.
- Most third-party agents do not publish their answers; Marque shows an answer only when it can read one that matches the hash on chain.
- Native scoped authority (charters) is a policy preview; grant and execution are disabled.
- Reference agents are Marque's own and are labelled everywhere; they are not independent adoption.
- BNB Chain decides Set and Earn eligibility; Marque's quest view reads chain events and cannot know off-chain registration.

## Public APIs

No API key is needed for public reads. Check response freshness and expiry; errors do not represent zero supply.

| Need | Endpoint |
|---|---|
| Registry and measurement funnel | `/api/v1/funnel` |
| Marketplace listings | `/api/v1/marketplace` |
| Machine catalog | `/api/v1/marketplace?format=machine` |
| OpenAPI and schemas | `/api/v1/openapi.json`, `/api/v1/schemas/catalog.v1.json` |
| Complete category listing counts | `/api/v1/phase2/coverage?chainId=56` |
| Contracts and campaign configuration | `/api/v1/phase2/config` |
| Set and Earn progress for any wallet, every marketplace, both networks (CORS open, 60 s cache) | `/api/v1/quest/{address}?chains=56,97` |
| Wallet's local quest observations | `/api/v1/phase2/wallet/{address}` |
| Owner listing diagnostics | `/api/v1/phase2/owner/{address}` |
| Job event timeline | `/api/v1/phase2/job/{chainId}/{jobId}` |
| Ratings | `/api/v1/phase2/ratings/{agentId}` |
| MCP server (Streamable HTTP, no auth) | `/api/mcp` |
| Positions for any address | `/api/v1/positions/{address}` |
| Published test cases and the grader | `/api/v1/conformance/cases?test=MCS-HF-1`, `POST /api/v1/conformance/grade` |
| Agent card check | `/api/v1/builders/card-check?url=` |
| Starter kit (zip) | `/api/v1/builders/kit?category=&name=&description=&price=` |
| README badge | `/badge/{chainId}/{tokenId}.svg` |
| A wallet's logbook (JSON or CSV) and what needs it | `/api/v1/wallet/{address}/logbook`, `/api/v1/wallet/{address}/needs-you` |

```sh
# Public reads only; inspect response provenance and expiry before using a result.
curl --fail --silent --show-error https://marque.trade/api/v1/funnel
curl --fail --silent --show-error 'https://marque.trade/api/v1/marketplace?format=machine'
```

[Machine API contract](./docs/vnext/P07_MACHINE_CONTRACT.md) · [Consumer contract](./docs/vnext/P13_READ_CLIENT_CONTRACT.md) · [Architecture](./docs/ARCHITECTURE.md).

## Development and operations

Node 22, pnpm 9.15.9, native PostgreSQL and Redis, Next.js standalone behind Caddy and PM2. No buyer keys belong on the server or in the repository. Populate environment variables privately according to the package contracts; `.env.example` documents public names where provided.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm lint:copy
pnpm test
pnpm build
```

For a fresh local checkout, create a dedicated empty development database and export `DATABASE_URL`, `REDIS_URL` and `BSC_RPC_URLS` privately. Then run:

```sh
# This DATABASE_URL must point to your development database.
pnpm --filter @marque/db migrate
pnpm --filter @marque/web dev
```

The development server uses port 3200; choose an isolated environment when production is on the same host. An empty database produces empty states until ingestion runs. Worker entrypoints are listed in `ecosystem.config.cjs`; keep keeper and funded-seller processes out of a browsing-only development setup.

Database tests require a separately migrated empty fixture database named `marque_vnext_fixture_*`, supplied through `MARQUE_INTEGRATION_DB`. Explicit network tests use public read-only RPC. Ordinary tests alone do not establish production behavior or campaign qualification.

Deployment uses `scripts/deploy-web.sh`, prepared source-checked artifacts, two web slots and public readiness checks. A web deployment does not activate changed worker code; worker activation and evidence are recorded separately. Historical observations are never deleted by a rebuild. Production keys, provider credentials, planning material and audit screenshots stay outside this public repo.

## History

V4 (October 2026) is described above. Earlier milestones, each with its dated evidence:

- **V3 (October 2026):** exact-service evidence, machine-readable catalog, receipt verification. [Delivery audit](./docs/vnext/V3_DELIVERY_AUDIT.md), [release audit](./docs/vnext/V3_RELEASE_AUDIT.md).
- **Phase 2, Set and Earn (late September 2026):** wallet-signed ERC-8183 hires on mainnet, ratings, the quest. [Records](./docs/phase2/PROJECT_STATE.md), [BNB handoff](./docs/phase2/HANDOFF-BNB.md).
- **Build the Era (September 2026):** the Standard, the Ledger, the PancakeSwap proof run. [Submission](./docs/SUBMISSION.md), [2:14 film](https://github.com/talk2francis/Marque/releases/download/demo-2026-09-09/marque-demo.mp4).

### Historical mainnet execution

The September proof record documents a PancakeSwap V3 rebalance on **BSC mainnet, chain 56**. These are existing transaction records, separate from today's disabled native-action preview.

| Recorded step | BscScan transaction |
|---|---|
| Open the original range | [b32c204f…8688ed](https://bscscan.com/tx/0xb32c204f143b233f5f38958fecda083141efd85f0352ca08bdc116703c8688ed) |
| Decrease liquidity and collect | [fe41a8a1…bc9001](https://bscscan.com/tx/0xfe41a8a1218e2e8c9f206c26565a537879f1de090b258e8bd64d41d925bc9001) |
| Swap | [d795d487…fb46e9](https://bscscan.com/tx/0xd795d4879ee16f21f6d54a7f404cc1f7e3928241ec9a0a0c0f6afc3618fb46e9) |
| Open the recentered range | [83f635fc…25a806](https://bscscan.com/tx/0x83f635fc30e74e26e36575be3c179301e96de01e6a5839b6d478fba33725a806) |

### The human benchmark recordings

The original September manual arms remain available. A recording establishes what was recorded; use each Ledger manifest for case binding, grading and current completion status.

| Manual arm | Recording |
|---|---|
| ADV-01, security triage<br><img src="./docs/evidence/adv-01.jpg" alt="September manual benchmark: inspecting contract source" width="260"> | [Inspecting contract source](https://youtu.be/pt0EkL6wY6A) |
| ADV-02, LP range<br><img src="./docs/evidence/adv-02.jpg" alt="September manual benchmark: reading pancakeswap pool state" width="260"> | [Reading PancakeSwap pool state](https://youtu.be/0xT6JBNv1zQ) |
| ADV-03, yield route<br><img src="./docs/evidence/adv-03.jpg" alt="September manual benchmark: reading venus rates" width="260"> | [Reading Venus rates](https://youtu.be/eWAAFVw9Hs0) |
| ADV-04, exact repayment<br><img src="./docs/evidence/adv-04.jpg" alt="September manual benchmark: computing from venus market state" width="260"> | [Computing from Venus market state](https://youtu.be/UKWhdf4GwO8) |

### Registered reference identities

BSC mainnet's ERC-8004 IdentityRegistry is [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432). These six identities come from [the tracked reference configuration](./config/first-party.json); current ownership, metadata and qualification come from their live records.

| Reference | Core task | Identity and live profile |
|---|---|---|
| Bound | Rebalancing | [341553](https://marque.trade/agents/56/341553) |
| Lattice | Grid trading | [341554](https://marque.trade/agents/56/341554) |
| Sluicegate | Yield optimisation | [341555](https://marque.trade/agents/56/341555) |
| Keel | Health factor | [341556](https://marque.trade/agents/56/341556) |
| Redcell | Security triage, additional category | [341557](https://marque.trade/agents/56/341557) |
| Tidemark | Realised-yield analysis | [358786](https://marque.trade/agents/56/358786) |

---

[Documentation map](./docs/README.md) · [Changelog](https://marque.trade/docs/changelog) · [Security](./docs/SECURITY.md) · [Deviations](./docs/DEVIATIONS.md). Report issues with the route, chain, agent or job id and the time; never include keys.
