# Supply outreach

> Generated 2026-09-04T01:17:34.815Z · chain 56 · every number measured, none hardcoded.
> Regenerate with `pnpm tsx scripts/supply-report.mts`.

Marque reference agents are excluded from every third-party count in this
document by construction (0 reference owner(s) registered).

## Census coverage — read this before trusting the counts

The detail-enrichment pass is **14.72% complete**
(8,161 of 55,445 agents that declare a transport).
Service endpoints exist only on the detail record, so an agent that has not been
enriched yet cannot appear as supply. **These are lower bounds, and they will rise.**

- Indexed on BSC so far: **108,248**
- Registered on BSC (registry total): **301,121**

## Funnel

| Stage | Count | How measured |
|---|---:|---|
| Registered on BSC | 108,248 | count of indexed agents on chain 56 |
| Declares a service we can parse | 5,803 | agents with at least one agent_service row |
| Endpoint responds | 2,056 | latest probe returned a well-formed response |
| Bound and callable | 472 | latest probe found an executable endpoint or declared skills |
| Classified into a category | 195 | has a non-unclassified category label |
| Classified and callable | 1 | classified AND latest probe liveness = live |

## Per-category supply

| Category | Registered (classified) | Has service metadata | Reachable now | Third-party executable | Marque reference | Status |
|---|---:|---:|---:|---:|---:|---|
| Rebalancing | 21 | 4 | 2 | **1** | 0 | **SUPPLY_GAP** |
| Grid Trading | 7 | 1 | 0 | **0** | 0 | **SUPPLY_GAP** |
| Yield Optimisation | 11 | 6 | 4 | **0** | 0 | **SUPPLY_GAP** |
| Health Factor | 17 | 2 | 1 | **0** | 0 | **SUPPLY_GAP** |
| Security (TermiX high-stakes) | 139 | 52 | 14 | **0** | 0 | **SUPPLY_GAP** |

**Threshold:** a required category with fewer than 2 reachable third-party agents is flagged SUPPLY_GAP.

> **SUPPLY_GAP in 4 of 4 required categories:** Rebalancing, Grid Trading, Yield Optimisation, Health Factor.

## Distinct executable supply

- Live service **registrations**: 472
- Distinct live **hosts**: **5** (bnb-lp.172-104-171-139.nip.io, api.bortagent.xyz, q402.quackai.ai, ai-rook.com, agents.ai-rook.com)

Registrations overstate supply. One operator can register the same endpoint
many times under different ERC-8004 identities, and on BSC one does. The host
count is the number that reflects how many suppliers actually exist.

## How BSC agents fail

| Failure class | Count | Share |
|---|---:|---:|
| `unbound` | 1584 | 69.9% |
| `none` | 473 | 20.9% |
| `timeout` | 191 | 8.4% |
| `http_4xx` | 15 | 0.7% |
| `blocked_ssrf` | 2 | 0.1% |
| `empty_tools` | 1 | 0.0% |

## Top owners to contact

Ranked by what one conversation could unlock: live supply first, then
portfolio size, because an owner who binds one runtime can activate many agents.

Owners whose every endpoint is already covered by someone ranked above them
are marked `dup` — they are the same supplier reached through another identity.

| # | Owner | Agent | Agents | Live | Unbound | Categories | Host | Contact | Why contact them | Priority |
|---:|---|---|---:|---:|---:|---|---|---|---|---|
| 1 | `0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b` | BNB LP Range Rebalancer | 1 | 1 | 0 | rebalancing | bnb-lp.172-104-171-139.nip.io | — | Live supply in rebalancing — a required category. Highest-value contact on the list. | HIGH |
| 2 | `0xbad35fa6e368e90fc4faf63507f2d0a2fdf94baf` | positioncrew-yield-optimizer.agent | 4 | 0 | 4 | yield, health_factor, rebalancing | platform-backend.prod.termix.live | https://platform-backend.prod.termix.live/api/v1/a2a/agents/{agentId}/card | Has 4 agent(s) in yield, health_factor, rebalancing that are registered but not bound. One deploy unlocks a category we have no supply for. | HIGH |
| 3 | `0x73809f69916fcf7ddc5bb1315fbdf96a569a5963` | Brain on BNB — Venus Health Factor Monitor | 4 | 0 | 0 | health_factor, rebalancing | agent.brainonbnb.com | https://brainonbnb.com/logo-200x200.png | Has 4 agent(s) in health_factor, rebalancing that are registered but not bound. One deploy unlocks a category we have no supply for. | HIGH |
| 4 | `0x4e21f74143660ee576f4d2ac26bd30729a849f55` | Sentinels Grid Trader | 3 | 0 | 0 | grid | bedrock-agentcore.us-east-1.amazonaws.com | https://github.com/agntcy/oasf/ · https://blob.8004scan.app/sanitized-images/v1/7f6004c748b8adb00da78f476bcfd16705c8f2f1d600585404118ea9bc248fa1.webp | Has 3 agent(s) in grid that are registered but not bound. One deploy unlocks a category we have no supply for. | HIGH |
| 5 | `0xfeaf9ee9e828a3029f8a6d7c65d39aed372d4673` | Q402 Agent (by Quack AI) | 5 | 5 | 0 | — | q402.quackai.ai | https://q402.quackai.ai/icon.svg | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |
| 6 | `0x97e8f3b4bffc1982b2791b21609c3b2542c5eb50` | bnbagent | 3 | 1 | 0 | — | api.bortagent.xyz | https://gray-key-salamander-905.mypinata.cloud/ipfs/QmTEggcqeLj8rAX3HuCdsX21sH7BH3afYrbnA7rCcUsUN2 | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |
| 7 | `0xb680b333211ac2b670b080bee6267d1173c81049` | Rook Trading Intelligence | 1 | 1 | 0 | — | ai-rook.com | https://agents.ai-rook.com | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |
| 8 | `0x4d09af0beac3f65c5bdbf1d19f31caca7924b7ec` | QwibiBNB | 1 | 0 | 0 | — | bedrock-agentcore.us-east-1.amazonaws.com | https://raw.githubusercontent.com/ezekiel6262/QwibiBNB/main/public/qwibi-bnb.svg | 1 registered agent(s), none bound yet. | LOW |
| 9 | `0x999561c6c239c9ef660dfbe38cc2ce6bd0c2ecba` | lean-agente-aprendizaje | 1 | 0 | 0 | — | example.com | https://example.com/status | 1 registered agent(s), none bound yet. | LOW |
| 10 | `0x08407662bcf644802174dc70d28ce0c1c7ec42ba` | Mood Check | 1 | 0 | 0 | — | api.bitagent.io | https://api.bitagent.io/aip/mood_check | 1 registered agent(s), none bound yet. | LOW |

Suppressed as duplicate suppliers: 2567 owner(s) pointing at hosts already listed above.

## Prospect records

Full records in `SUPPLY-OUTREACH.json` and `SUPPLY-OUTREACH.csv`.

### Rebalancing — 4 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| BNB LP Range Rebalancer | `265375` | `0x20f1ca5d1e…` | a2a | live (1092ms) | Ready now: endpoint answers and exposes 2 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| positioncrew-lp-rebalance.agent | `266231` | `0xbad35fa6e3…` | a2a | unbound (335ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| test.agent | `302610` | `0xd94c5f81f8…` | a2a | unprobed | Not yet probed. | LOW |
| Brain on BNB — Portfolio Rebalance Pricer | `304494` | `0x73809f6991…` | a2a | unprobed | Not yet probed. | LOW |

### Grid Trading — 1 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| Sentinels Grid Trader | `330536` | `0x4e21f74143…` | a2a | dead (361ms) | Not yet probed. | LOW |

### Yield Optimisation — 6 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| positioncrew-yield-optimizer.agent | `266232` | `0xbad35fa6e3…` | a2a | unbound (350ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| fid_up79.agent | `305950` | `0xf4e047eda1…` | a2a | unbound (361ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| GvPuHKg.agent | `327022` | `0x550f892585…` | a2a | unbound (343ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| dROumWv.agent | `330286` | `0x7e83fe7f5c…` | a2a | dead (8001ms) | Declared endpoint does not respond (timeout). Either the host is gone or the URL in their registry metadata is stale — worth telling them, since it is invisible from their side. | MEDIUM |
| GoVIhMYLY.agent | `327900` | `0xdd58333289…` | a2a | unbound (337ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Pubg.agent | `301934` | `0x8f7d175a21…` | a2a | unprobed | Not yet probed. | LOW |

### Health Factor — 2 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| positioncrew-lending-rescue.agent | `266229` | `0xbad35fa6e3…` | a2a | unbound (348ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Brain on BNB — Venus Health Factor Monitor | `302257` | `0x73809f6991…` | a2a | unprobed | Not yet probed. | LOW |

### Security (TermiX high-stakes) — 24 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| soCQCG.agent | `330995` | `0x9589d05553…` | a2a | unbound (335ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| yPMVIaOa.agent | `330676` | `0x2e85b02fc1…` | a2a | unbound (335ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| eth5k.agent | `328093` | `0xe1116b8286…` | a2a | unbound (340ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| thanhtung.agent | `327154` | `0x1893a3a427…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| tungthanh.agent | `327155` | `0x1893a3a427…` | a2a | unbound (346ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| cFbaui.agent | `327077` | `0xf5d2525a6d…` | a2a | unbound (341ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| xOSoj.agent | `327030` | `0x05b676f0f9…` | a2a | unbound (350ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Dillah.agent | `331210` | `0x898c3100d7…` | a2a | unbound (350ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| behre.agent | `304643` | `0x209c9e8a21…` | a2a | unbound (338ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| QMRdshM.agent | `327460` | `0x705b451012…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Sumon6251.agent | `327075` | `0xaf29c978f9…` | a2a | unbound (349ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| gnORC.agent | `331548` | `0xb59c783ef2…` | a2a | unbound (338ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| huonglien.agent | `330405` | `0x7c591da943…` | a2a | unbound (344ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| kmvng.agent | `327136` | `0x34d099ba24…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| antispam.agent | `301721` | `0xdbe78dec8d…` | a2a | unprobed | Not yet probed. | LOW |
| hype.agent | `301759` | `0x8a2042b381…` | a2a | unprobed | Not yet probed. | LOW |
| vana.agent | `302042` | `0xdb98539023…` | a2a | unprobed | Not yet probed. | LOW |
| bsc.agent | `301715` | `0x8a2042b381…` | a2a | unprobed | Not yet probed. | LOW |
| kujeng.agent | `298748` | `0xdb98539023…` | a2a | unprobed | Not yet probed. | LOW |
| Black_Diamond.agent | `304125` | `0x384aaff760…` | a2a | unprobed | Not yet probed. | LOW |
| linhcu11.agent | `302314` | `0x831bbc4349…` | a2a | unprobed | Not yet probed. | LOW |
| linhcu.agent | `302286` | `0x831bbc4349…` | a2a | unprobed | Not yet probed. | LOW |
| 0xnana.agent | `306040` | `0x3b74978d03…` | a2a | unprobed | Not yet probed. | LOW |
| jui.agent | `303607` | `0x629ad9c3d6…` | a2a | unprobed | Not yet probed. | LOW |

### Unclassified — 2963 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| bnbagent | `270339` | `0x97e8f3b4bf…` | a2a | live (759ms) | Ready now: endpoint answers and exposes 7 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268188` | `0xfeaf9ee9e8…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268193` | `0xfeaf9ee9e8…` | mcp | live (42ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268189` | `0xfeaf9ee9e8…` | mcp | live (15ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268195` | `0xfeaf9ee9e8…` | mcp | live (19ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268192` | `0xfeaf9ee9e8…` | mcp | live (39ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265066` | `0xc7eaa6512f…` | mcp | live (58ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265067` | `0xc7eaa6512f…` | mcp | live (22ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265069` | `0xc7eaa6512f…` | mcp | live (55ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265071` | `0xc7eaa6512f…` | mcp | live (14ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267906` | `0xc59ee7521a…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267905` | `0xc59ee7521a…` | mcp | live (29ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267620` | `0x63094ea04a…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267621` | `0x63094ea04a…` | mcp | live (44ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268615` | `0x631b88b3d0…` | mcp | live (38ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267777` | `0xb0ddebe55c…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268614` | `0x631b88b3d0…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267779` | `0xb0ddebe55c…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268619` | `0x764e45ad6e…` | mcp | live (37ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268618` | `0x764e45ad6e…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268330` | `0x2ea2ce7bb6…` | mcp | live (29ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265002` | `0x1f79251052…` | mcp | live (21ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265057` | `0xde749fade0…` | mcp | live (181ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `283572` | `0xaccc6d61f0…` | mcp | live (33ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268211` | `0x1388b5d70b…` | mcp | live (56ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `276454` | `0x27fba42113…` | mcp | live (23ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265091` | `0xdc40f4c12c…` | mcp | live (21ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268416` | `0x0ba67c585b…` | mcp | live (76ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268413` | `0x37c63601a9…` | mcp | live (29ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268399` | `0x5272ee25be…` | mcp | live (71ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
