# Supply outreach

> Generated 2026-09-04T01:34:40.392Z · chain 56 · every number measured, none hardcoded.
> Regenerate with `pnpm tsx scripts/supply-report.mts`.

Marque reference agents are excluded from every third-party count in this
document by construction (0 reference owner(s) registered).

## Census coverage — read this before trusting the counts

The detail-enrichment pass is **23.88% complete**
(13,240 of 55,445 agents that declare a transport).
Service endpoints exist only on the detail record, so an agent that has not been
enriched yet cannot appear as supply. **These are lower bounds, and they will rise.**

- Indexed on BSC so far: **108,248**
- Registered on BSC (registry total): **301,169**

## Funnel

| Stage | Count | How measured |
|---|---:|---|
| Registered on BSC | 108,248 | count of indexed agents on chain 56 |
| Declares a service we can parse | 7,081 | agents with at least one agent_service row |
| Endpoint responds | 6,039 | latest probe returned a well-formed response |
| Bound and callable | 535 | latest probe found an executable endpoint or declared skills |
| Classified into a category | 288 | has a non-unclassified category label |
| Classified and callable | 2 | classified AND latest probe liveness = live |

## Per-category supply

| Category | Registered (classified) | Has service metadata | Reachable now | Third-party executable | Marque reference | Status |
|---|---:|---:|---:|---:|---:|---|
| Rebalancing | 20 | 4 | 4 | **1** | 0 | **SUPPLY_GAP** |
| Grid Trading | 11 | 3 | 2 | **1** | 0 | **SUPPLY_GAP** |
| Yield Optimisation | 47 | 42 | 42 | **0** | 0 | **SUPPLY_GAP** |
| Health Factor | 17 | 2 | 2 | **0** | 0 | **SUPPLY_GAP** |
| Security (TermiX high-stakes) | 193 | 106 | 106 | **0** | 0 | **SUPPLY_GAP** |

**Threshold:** a required category with fewer than 2 reachable third-party agents is flagged SUPPLY_GAP.

> **SUPPLY_GAP in 4 of 4 required categories:** Rebalancing, Grid Trading, Yield Optimisation, Health Factor.

## Distinct executable supply

- Live service **registrations**: 535
- Distinct live **hosts**: **8** (bnb-lp.172-104-171-139.nip.io, bnb-agent-marketplace-ruby.vercel.app, api.bortagent.xyz, q402.quackai.ai, app.singularry.org, www.singularry.org, ai-rook.com, agents.ai-rook.com)

Registrations overstate supply. One operator can register the same endpoint
many times under different ERC-8004 identities, and on BSC one does. The host
count is the number that reflects how many suppliers actually exist.

## How BSC agents fail

| Failure class | Count | Share |
|---|---:|---:|
| `unbound` | 5502 | 88.7% |
| `none` | 541 | 8.7% |
| `timeout` | 134 | 2.2% |
| `http_4xx` | 16 | 0.3% |
| `bad_schema` | 4 | 0.1% |
| `blocked_ssrf` | 2 | 0.0% |
| `empty_tools` | 2 | 0.0% |

## Top owners to contact

Ranked by what one conversation could unlock: live supply first, then
portfolio size, because an owner who binds one runtime can activate many agents.

Owners whose every endpoint is already covered by someone ranked above them
are marked `dup` — they are the same supplier reached through another identity.

| # | Owner | Agent | Agents | Live | Unbound | Categories | Host | Contact | Why contact them | Priority |
|---:|---|---|---:|---:|---:|---|---|---|---|---|
| 1 | `0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b` | BNB LP Range Rebalancer | 1 | 1 | 0 | rebalancing | bnb-lp.172-104-171-139.nip.io | — | Live supply in rebalancing — a required category. Highest-value contact on the list. | HIGH |
| 2 | `0xa2a2012e52fd075c0f3146e37e833e7294ee52b5` | marketplace-operated-grid-planner | 1 | 1 | 0 | grid | bnb-agent-marketplace-ruby.vercel.app | — | Live supply in grid — a required category. Highest-value contact on the list. | HIGH |
| 3 | `0x73809f69916fcf7ddc5bb1315fbdf96a569a5963` | Brain on BNB — Portfolio Rebalance Pricer | 4 | 0 | 0 | rebalancing, grid, health_factor | agent.brainonbnb.com | https://brainonbnb.com/logo-200x200.png | Has 4 agent(s) in rebalancing, grid, health_factor that are registered but not bound. One deploy unlocks a category we have no supply for. | HIGH |
| 4 | `0xbad35fa6e368e90fc4faf63507f2d0a2fdf94baf` | positioncrew-lending-rescue.agent | 4 | 0 | 4 | health_factor, rebalancing, yield | platform-backend.prod.termix.live | https://platform-backend.prod.termix.live/api/v1/a2a/agents/{agentId}/card | Has 4 agent(s) in health_factor, rebalancing, yield that are registered but not bound. One deploy unlocks a category we have no supply for. | HIGH |
| 5 | `0x4e21f74143660ee576f4d2ac26bd30729a849f55` | Sentinels Grid Trader | 3 | 0 | 0 | grid | bedrock-agentcore.us-east-1.amazonaws.com | https://github.com/agntcy/oasf/ · https://blob.8004scan.app/sanitized-images/v1/959cce6d11b2a4c9691dd803020977890eabadfb507f005038505119b47fd1f6.webp | Has 3 agent(s) in grid that are registered but not bound. One deploy unlocks a category we have no supply for. | HIGH |
| 6 | `0x97e8f3b4bffc1982b2791b21609c3b2542c5eb50` | AlphaHunter | 5 | 5 | 0 | — | api.bortagent.xyz | https://gray-key-salamander-905.mypinata.cloud/ipfs/QmWk6yh7ne4Jkrbwy21DwDQLay94pwRBybJq2iTLwYjY8F | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |
| 7 | `0xfeaf9ee9e828a3029f8a6d7c65d39aed372d4673` | Q402 Agent (by Quack AI) | 5 | 5 | 0 | — | q402.quackai.ai | https://q402.quackai.ai/icon.svg | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |
| 8 | `0xa4475225997cd5019f6640c67b5defef62e4fcd1` | SolarVoyager | 1 | 1 | 0 | — | app.singularry.org | https://x.com/singularryai · https://github.com/singularry/sly-agent-runtime | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |
| 9 | `0xb680b333211ac2b670b080bee6267d1173c81049` | Rook Trading Intelligence | 1 | 1 | 0 | — | ai-rook.com | https://agents.ai-rook.com | Running live, callable supply. Worth listing even outside the four required categories. | HIGH |

Suppressed as duplicate suppliers: 2063 owner(s) pointing at hosts already listed above.

## Prospect records

Full records in `SUPPLY-OUTREACH.json` and `SUPPLY-OUTREACH.csv`.

### Rebalancing — 4 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| BNB LP Range Rebalancer | `265375` | `0x20f1ca5d1e…` | a2a | live (1092ms) | Ready now: endpoint answers and exposes 2 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| test.agent | `302610` | `0xd94c5f81f8…` | a2a | unbound (361ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Brain on BNB — Portfolio Rebalance Pricer | `304494` | `0x73809f6991…` | a2a | bad_schema (105ms) | Endpoint answers but the payload does not match the protocol it declares. A small fix on their side makes it discoverable everywhere, not just here. | MEDIUM |
| positioncrew-lp-rebalance.agent | `266231` | `0xbad35fa6e3…` | a2a | unbound (342ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Grid Trading — 3 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| marketplace-operated-grid-planner | `303779` | `0xa2a2012e52…` | a2a | live (187ms) | Ready now: endpoint answers and exposes 3 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Sentinels Grid Trader | `330536` | `0x4e21f74143…` | a2a | dead (369ms) | Not yet probed. | LOW |
| Brain on BNB — BSC Grid Planner | `302258` | `0x73809f6991…` | a2a | bad_schema (26ms) | Endpoint answers but the payload does not match the protocol it declares. A small fix on their side makes it discoverable everywhere, not just here. | MEDIUM |

### Yield Optimisation — 42 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| sunshine.agent | `298864` | `0x1020ce4436…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| NovaMind.agent | `304354` | `0xfc3ea87e2a…` | a2a | unbound (342ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| positioncrew-yield-optimizer.agent | `266232` | `0xbad35fa6e3…` | a2a | unbound (357ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Binkhalil.agent | `299258` | `0x3cd6c37528…` | a2a | unbound (342ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| monir.agent | `299349` | `0xf80e24e3cb…` | a2a | unbound (342ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| fid_up79.agent | `305951` | `0xf4e047eda1…` | a2a | unbound (344ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Ashim111.agent | `303512` | `0xa8187235ff…` | a2a | unbound (352ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| fid_up79.agent | `305950` | `0xf4e047eda1…` | a2a | unbound (361ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| nexpaid.agent | `299948` | `0x7ee2b3ab0a…` | a2a | unbound (349ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| GvPuHKg.agent | `327022` | `0x550f892585…` | a2a | unbound (360ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Chandan.agent | `299043` | `0x57fa602c35…` | a2a | unbound (1015ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Beginers.agent | `301890` | `0xb075eb5c6c…` | a2a | unbound (347ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| goblay.agent | `302653` | `0x04dc8c100e…` | a2a | unbound (340ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Bourbons.agent | `300920` | `0x04335b41bd…` | a2a | unbound (371ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Hasibboy.agent | `303844` | `0x6edf8ec852…` | a2a | unbound (345ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| ffcrypto.agent | `300706` | `0xcc2005844a…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| uygkkk.agent | `306981` | `0xe54884bb5e…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| Connects.agent | `303626` | `0x1b23e3346a…` | a2a | unbound (352ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| dROumWv.agent | `330286` | `0x7e83fe7f5c…` | a2a | unbound (346ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| fact.agent | `302511` | `0xf85166d646…` | a2a | unbound (345ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| tealive.agent | `303828` | `0x42e7529234…` | a2a | unbound (363ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| njiuhb.agent | `307045` | `0xe54884bb5e…` | a2a | unbound (345ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| iopoi.agent | `307046` | `0xd5f776f826…` | a2a | unbound (337ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| bichphuong.agent | `302201` | `0x9eee0c77a8…` | a2a | unbound (342ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| gfdrfc.agent | `306998` | `0x442645a094…` | a2a | unbound (346ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| erolpulluk.agent | `299195` | `0xa7e666c6b2…` | a2a | unbound (346ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| caobang.agent | `300779` | `0x6d178e2bbd…` | a2a | unbound (344ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| ffrolpetroff.agent | `303635` | `0xf3604fa7ed…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| adhais23.agent | `300132` | `0xe740981d5a…` | a2a | unbound (349ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| airdrop136.agent | `304357` | `0x76bf0b7d61…` | a2a | unbound (340ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Health Factor — 2 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| Brain on BNB — Venus Health Factor Monitor | `302257` | `0x73809f6991…` | a2a | bad_schema (126ms) | Endpoint answers but the payload does not match the protocol it declares. A small fix on their side makes it discoverable everywhere, not just here. | MEDIUM |
| positioncrew-lending-rescue.agent | `266229` | `0xbad35fa6e3…` | a2a | unbound (364ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Security (TermiX high-stakes) — 60 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| uusbaseeth.agent | `298825` | `0xfc3ea87e2a…` | a2a | unbound (348ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| antispam.agent | `301721` | `0xdbe78dec8d…` | a2a | unbound (392ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| yki.agent | `303874` | `0x90945be9bf…` | a2a | unbound (338ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Black_Diamond.agent | `304125` | `0x384aaff760…` | a2a | unbound (348ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| vana.agent | `302042` | `0xdb98539023…` | a2a | unbound (344ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| kujeng.agent | `298748` | `0xdb98539023…` | a2a | unbound (361ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| hype.agent | `301759` | `0x8a2042b381…` | a2a | unbound (343ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| bsc.agent | `301715` | `0x8a2042b381…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| ojimon.agent | `302649` | `0xfe45351f6f…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Monzo.agent | `303640` | `0x16b5df0502…` | a2a | unbound (341ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| linhcu11.agent | `302314` | `0x831bbc4349…` | a2a | unbound (348ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| linhcu.agent | `302286` | `0x831bbc4349…` | a2a | unbound (354ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| zay.agent | `307204` | `0xeea5b26b94…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| okluuu.agent | `306999` | `0xead85e7829…` | a2a | unbound (349ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| 0xnana.agent | `306040` | `0x3b74978d03…` | a2a | unbound (338ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Kaykay.agent | `305946` | `0xe423aa8512…` | a2a | unbound (341ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| web3prowler.agent | `305862` | `0x7dbaf79e9e…` | a2a | unbound (345ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| donya.agent | `304673` | `0xcf52df3ad3…` | a2a | unbound (346ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| amberbutler1707.agent | `304423` | `0x6d54d3e422…` | a2a | unbound (361ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| baoquynh031999.agent | `304419` | `0x2150cb7a64…` | a2a | unbound (345ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| jui.agent | `303607` | `0x629ad9c3d6…` | a2a | unbound (340ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| god.agent | `303511` | `0x4889d0c7f3…` | a2a | unbound (349ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Jangsurra.agent | `301794` | `0xb075eb5c6c…` | a2a | unbound (355ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| PCS.agent | `301116` | `0x01d945b00d…` | a2a | unbound (352ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Pisces.agent | `301049` | `0x01d945b00d…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| zhyan33.agent | `303740` | `0x1b9dd4fbe3…` | a2a | unbound (351ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Alpha_Romeo.agent | `303732` | `0xb267b37b43…` | a2a | unbound (344ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| DCA.agent | `300809` | `0x6d178e2bbd…` | a2a | unbound (353ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| zaram.agent | `300276` | `0xa591d576f6…` | a2a | unbound (347ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| fxhabib9k_forex.agent | `299318` | `0x1b1f7a1166…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |

### Unclassified — 2889 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| AlphaHunter | `236013` | `0x97e8f3b4bf…` | a2a | live (5662ms) | Ready now: endpoint answers and exposes 7 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| AlphaHunter | `236012` | `0x97e8f3b4bf…` | a2a | live (238ms) | Ready now: endpoint answers and exposes 7 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| bnbagent | `270339` | `0x97e8f3b4bf…` | a2a | live (759ms) | Ready now: endpoint answers and exposes 7 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| OnlyUp | `304427` | `0x97e8f3b4bf…` | a2a | live (252ms) | Ready now: endpoint answers and exposes 7 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Simple | `303795` | `0x97e8f3b4bf…` | a2a | live (245ms) | Ready now: endpoint answers and exposes 7 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268193` | `0xfeaf9ee9e8…` | mcp | live (42ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268188` | `0xfeaf9ee9e8…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268195` | `0xfeaf9ee9e8…` | mcp | live (19ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268192` | `0xfeaf9ee9e8…` | mcp | live (39ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268189` | `0xfeaf9ee9e8…` | mcp | live (15ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265067` | `0xc7eaa6512f…` | mcp | live (22ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265069` | `0xc7eaa6512f…` | mcp | live (55ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265066` | `0xc7eaa6512f…` | mcp | live (58ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265071` | `0xc7eaa6512f…` | mcp | live (14ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267905` | `0xc59ee7521a…` | mcp | live (29ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268614` | `0x631b88b3d0…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268618` | `0x764e45ad6e…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268619` | `0x764e45ad6e…` | mcp | live (37ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267779` | `0xb0ddebe55c…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267906` | `0xc59ee7521a…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267621` | `0x63094ea04a…` | mcp | live (44ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267777` | `0xb0ddebe55c…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `268615` | `0x631b88b3d0…` | mcp | live (38ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `267620` | `0x63094ea04a…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265276` | `0xd20aaa6730…` | mcp | live (22ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265047` | `0x807fb8045b…` | mcp | live (34ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265049` | `0xc5392fb133…` | mcp | live (28ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306082` | `0x68eccf2995…` | mcp | live (38ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `265422` | `0x76adeb6718…` | mcp | live (19ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `330805` | `0xd3a0dc7f21…` | mcp | live (29ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
