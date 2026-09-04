# Supply outreach

> Generated 2026-09-04T00:52:34.381Z · chain 56 · every number measured, none hardcoded.
> Regenerate with `pnpm tsx scripts/supply-report.mts`.

Marque reference agents are excluded from every third-party count in this
document by construction (0 reference owner(s) registered).

## Census coverage — read this before trusting the counts

The detail-enrichment pass is **3.12% complete**
(1,682 of 53,883 agents that declare a transport).
Service endpoints exist only on the detail record, so an agent that has not been
enriched yet cannot appear as supply. **These are lower bounds, and they will rise.**

- Indexed on BSC so far: **104,057**
- Registered on BSC (registry total): **301,121**

## Funnel

| Stage | Count | How measured |
|---|---:|---|
| Registered on BSC | 104,057 | count of indexed agents on chain 56 |
| Declares a service we can parse | 804 | agents with at least one agent_service row |
| Endpoint responds | 714 | latest probe returned a well-formed response |
| Bound and callable | 35 | latest probe found an executable endpoint or declared skills |
| Classified into a category | 268 | has a non-unclassified category label |
| Classified and callable | 0 | classified AND latest probe liveness = live |

## Per-category supply

| Category | Registered (classified) | Has service metadata | Reachable now | Third-party executable | Marque reference | Status |
|---|---:|---:|---:|---:|---:|---|
| Rebalancing | 24 | 1 | 1 | **0** | 0 | **SUPPLY_GAP** |
| Grid Trading | 14 | 2 | 1 | **0** | 0 | **SUPPLY_GAP** |
| Yield Optimisation | 18 | 5 | 5 | **0** | 0 | **SUPPLY_GAP** |
| Health Factor | 29 | 2 | 1 | **0** | 0 | **SUPPLY_GAP** |
| Security (TermiX high-stakes) | 183 | 14 | 13 | **0** | 0 | **SUPPLY_GAP** |

**Threshold:** a required category with fewer than 2 reachable third-party agents is flagged SUPPLY_GAP.

> **SUPPLY_GAP in 4 of 4 required categories:** Rebalancing, Grid Trading, Yield Optimisation, Health Factor.

## Distinct executable supply

- Live service **registrations**: 35
- Distinct live **hosts**: **1** (q402.quackai.ai)

Registrations overstate supply. One operator can register the same endpoint
many times under different ERC-8004 identities, and on BSC one does. The host
count is the number that reflects how many suppliers actually exist.

## How BSC agents fail

| Failure class | Count | Share |
|---|---:|---:|
| `unbound` | 678 | 84.1% |
| `timeout` | 85 | 10.5% |
| `none` | 35 | 4.3% |
| `http_4xx` | 5 | 0.6% |
| `blocked_ssrf` | 2 | 0.2% |
| `empty_tools` | 1 | 0.1% |

## Top owners to contact

Ranked by what one conversation could unlock: live supply first, then
portfolio size, because an owner who binds one runtime can activate many agents.

| # | Owner | Agents | Live | Unbound | Categories | Contact | Priority |
|---:|---|---:|---:|---:|---|---|---|
| 1 | `0xf6f47e39261472b76a73073871b2c9d708df5450` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x5ad132a9de987da9f30f93cf3a219a536770651c8be945a465ceff3da0ca65aa | HIGH |
| 2 | `0x72ca44769e0d5563548dc47231bcb6f3bc55566c` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x0262ae50e6a3e1021aaa77f8b76b77d48355dde7849a7881d509da59b5a07945 | HIGH |
| 3 | `0x8b134acabf5d951de85b0dc6ddf13c2cec59ce4e` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x8fc146c4e1af8e597601947105e16847b9ee77a88c8584ddda10755a9f664d8e | HIGH |
| 4 | `0x0d87d759f9f5476431cf2ca83ab98c2e943049ae` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x0726525b20da01d6a315732a34d127c0fb0c0332e8db5b3ca196884d6c2d981a | HIGH |
| 5 | `0x7520205a959d63fe8bdb8ae04847feeb176821d5` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x6490fcb2c60cee9c56bf263724e298f14a9d3e1591bb826df694f8f962ec3b88 | HIGH |
| 6 | `0xcefab34b9efa384de34f5b2bcaaf3a1fdd8aa394` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x7bae82454f41a83b38dccba54e7cb4f203271535656502de07f67b5adb4cde10 | HIGH |
| 7 | `0xdfc6a801fd1105678e5fde37e0617b69fe0f6077` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x1da583a4680b8858b704165b5664b29fd60f03d1992dcaa9d457106d160509c1 | HIGH |
| 8 | `0x9ffda330e2f7a2ddb35c1b2eb7830e9a8a6a9629` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xc12516f3f6b094963ad09a677969d1dbdc5abecd8c319a7eb9b44346d2dfe3dd | HIGH |
| 9 | `0xa79493e8d54f02d48c2c697b2733e86236f7ebd7` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xf4a456c19d36e0a3d53f3e6b6d75de9d659cb0b87f625846990e675858717daf | HIGH |
| 10 | `0xda3f0ec9e83c63d1a67885d870240143cc2532ec` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xc7864257f7e5de1359ca83a01e7674c3d1c2fdbb4eb8de6add71b904eba23adf | HIGH |
| 11 | `0x9cd3a5d596aad295c0b21ce36f6d90468a157a25` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xaaf85449df920325f5e52c42a99c6e7fdefd4638c2baf849eda54bd4d8abcd0f | HIGH |
| 12 | `0x0d325fce5ad772b61dd2fbbb45efb98a85efe96f` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x7bd7f7a468615aeddefb5a469b12eade49607884423fbcb8e8c232c2b0e139e9 | HIGH |
| 13 | `0x9ea2c4f574a5b29cdb550075e06530e1c3713dd1` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x73fbd84ebdfa5026feca5783241c452a246bf00a25e6c98e30010483ef5e6ce2 | HIGH |
| 14 | `0xe0cee02658617171f1dc0d6980916ace573dfb0e` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x6a39c0c01faa15b350fd659845f6c45f6e46dd0a5d392755b12a86857680045c | HIGH |
| 15 | `0x4303c81d327b8b2a6cbb85c25683e8341f413762` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x028b7e1b04d08495d5c16c00477099ebd44a4020bb3390c00338df50588e3fa8 | HIGH |
| 16 | `0xd26b42ff411e9de79ae61f06f068af351d41c2ec` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x82215ee95c445ac1ceb47458b5af76ddc2efec48b7147dbf8a0515ea7cc3713f | HIGH |
| 17 | `0x2b47f85fc8abaefc4b2abdc146ebbaf65fd02f01` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x96628249257595fb6999e36f50d897321d3114c368c9296d5e1e05a2f88cd5f6 | HIGH |
| 18 | `0x024d24a2252836d4e667a52d284464b589d94a0f` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xecffb8c0dd2746d9f01508ef9c4425df4e2918d0d1dc823c6435a1ea8a9d2d6d | HIGH |
| 19 | `0x697a2ecbadb7e06371745ed716102dcf4f57eb50` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xd360afdad099a874d5e642fedee9061ca491edbbc1f5ee1754705c0103474b59 | HIGH |
| 20 | `0x69d1bf7e4f4ff0484b37e29048a04d92e704aa39` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x000e536a0bc968c41745b31850da9af33641a03a9c3f85ee7286c4ded614b70f | HIGH |
| 21 | `0x8aae0100fa9ef8f65f0ecdc30c8e37183c41754b` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x57b798513e3bb6c0f7d3f3f8ab546a7d1b153358d5cb3e445385cb9548ae21e7 | HIGH |
| 22 | `0x3cb0158e25d1093679775f2b6eb14c4f5846bf5c` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x0ab1f77687c70149c170bc11c729dba38591cbbddbbff3a77cc37b36e12e27af | HIGH |
| 23 | `0x501a811dc5b5e0e497fd81e8d7b69ada1a55b370` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0x018b1dfb7afb960ea4645a8cbe3d3a6fd139777a70f7f337ccb4671d94ccc1af | HIGH |
| 24 | `0x350c310f7a33c8691d957d6a4228b1b83896653b` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xff13d0d602bb81234909ee8d0f93f551eafb5f12177b0efe2d5813f864223092 | HIGH |
| 25 | `0x404a9a67060a54cb0923175ddb5ad93e20a0acdc` | 1 | 1 | 0 | — | https://q402.quackai.ai/api/wallet/agentic/agent-metadata/0xd91dd8a2cd52e8db46f6d890295b35d203d0df61e759809a8cf97aeb4cff7f21 | HIGH |

## Prospect records

Full records in `SUPPLY-OUTREACH.json` and `SUPPLY-OUTREACH.csv`.

### Rebalancing — 1 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| positioncrew-lp-rebalance.agent | `266231` | `0xbad35fa6e3…` | a2a | unbound (335ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Grid Trading — 2 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| Sentinels Grid Trader | `330536` | `0x4e21f74143…` | a2a | dead (331ms) | Not yet probed. | LOW |
| positioncrew-bounded-grid.agent | `266234` | `0xbad35fa6e3…` | a2a | unbound (344ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Yield Optimisation — 5 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| positioncrew-yield-optimizer.agent | `266232` | `0xbad35fa6e3…` | a2a | unbound (350ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| fid_up79.agent | `305950` | `0xf4e047eda1…` | a2a | unbound (352ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| GvPuHKg.agent | `327022` | `0x550f892585…` | a2a | unbound (343ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| dROumWv.agent | `330286` | `0x7e83fe7f5c…` | a2a | unbound (337ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |
| GoVIhMYLY.agent | `327900` | `0xdd58333289…` | a2a | unbound (335ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Health Factor — 2 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| Sentinels Health Guard | `330663` | `0x4e21f74143…` | a2a | dead (341ms) | Not yet probed. | LOW |
| positioncrew-lending-rescue.agent | `266229` | `0xbad35fa6e3…` | a2a | unbound (348ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | HIGH |

### Security (TermiX high-stakes) — 9 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| Sentinels Security Scout | `330831` | `0x4e21f74143…` | a2a | dead (369ms) | Not yet probed. | LOW |
| yPMVIaOa.agent | `330676` | `0x2e85b02fc1…` | a2a | unbound (339ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| soCQCG.agent | `330995` | `0x9589d05553…` | a2a | unbound (350ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| eth5k.agent | `328093` | `0xe1116b8286…` | a2a | unbound (354ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| thanhtung.agent | `327154` | `0x1893a3a427…` | a2a | unbound (336ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| tungthanh.agent | `327155` | `0x1893a3a427…` | a2a | unbound (346ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| cFbaui.agent | `327077` | `0xf5d2525a6d…` | a2a | unbound (341ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| xOSoj.agent | `327030` | `0x05b676f0f9…` | a2a | unbound (350ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |
| Dillah.agent | `331210` | `0x898c3100d7…` | a2a | unbound (348ms) | Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable. | MEDIUM |

### Unclassified — 481 prospect(s)

| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |
|---|---|---|---|---|---|---|
| Q402 Agent (by Quack AI) | `266099` | `0xf6f47e3926…` | mcp | live (24ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `320836` | `0x72ca44769e…` | mcp | live (139ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266094` | `0x8b134acabf…` | mcp | live (15ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266105` | `0x0d87d759f9…` | mcp | live (18ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306094` | `0x7520205a95…` | mcp | live (778ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266097` | `0xcefab34b9e…` | mcp | live (25ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266103` | `0xdfc6a801fd…` | mcp | live (20ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306075` | `0x9ffda330e2…` | mcp | live (25ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306123` | `0xa79493e8d5…` | mcp | live (746ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306130` | `0xda3f0ec9e8…` | mcp | live (122ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266318` | `0x9cd3a5d596…` | mcp | live (39ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266320` | `0x0d325fce5a…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266322` | `0x9ea2c4f574…` | mcp | live (25ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306113` | `0xe0cee02658…` | mcp | live (143ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266412` | `0x4303c81d32…` | mcp | live (24ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `320862` | `0xd26b42ff41…` | mcp | live (136ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266418` | `0x2b47f85fc8…` | mcp | live (21ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266411` | `0x024d24a225…` | mcp | live (17ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266415` | `0x697a2ecbad…` | mcp | live (22ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306042` | `0x69d1bf7e4f…` | mcp | live (26ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266410` | `0x8aae0100fa…` | mcp | live (21ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306098` | `0x3cb0158e25…` | mcp | live (154ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266092` | `0x501a811dc5…` | mcp | live (19ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266095` | `0x350c310f7a…` | mcp | live (24ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266414` | `0x404a9a6706…` | mcp | live (18ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266413` | `0xc5de3c875b…` | mcp | live (22ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266416` | `0xa6d945f244…` | mcp | live (17ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `266106` | `0x9a94d7f23a…` | mcp | live (24ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `330805` | `0xd3a0dc7f21…` | mcp | live (16ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
| Q402 Agent (by Quack AI) | `306082` | `0x68eccf2995…` | mcp | live (613ms) | Ready now: endpoint answers and exposes 46 callable skill(s). Needs only a conformance run and a listing. | HIGH |
