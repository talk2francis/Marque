# ROADMAP.md
## Marque after launch: the roadmap we built, preserved

Reconstructed from the post-judging competitor analysis (Bazar, ChainHelix, SMEAI, Brain Plaza, 4LPHA, MANDATE, VEYRA, minia2a, Ambit, PROBATION, ProofEra, LingoAI Holon, Kawal, TermiVault and the wider shortlist) and the surviving final audit. Phase 2 delivers the first half of this. Nothing below starts before P2-12 passes.

---

## 1. The ladder Marque climbs

| Level | Question | Status after Phase 2 |
|---|---|---|
| 1 Identity | Who is this agent? | Done |
| 2 Discovery | Can I find the right one? | Done |
| 3 Qualification | Does it actually work? | Done (MCS, Warrants) |
| 4 Comparison | Which fits my task? | Done, improved |
| 5 Hiring | Can I contract it? | **Phase 2** |
| 6 Authority | What may it do? | Service-fee escrow in Phase 2; action charters next |
| 7 Payment | How does money move safely? | **Phase 2** (ERC-8183) |
| 8 Execution | Did it perform? | **Phase 2** (delivery on chain) |
| 9 Evidence | Can I prove what happened? | Done, extended to jobs |
| 10 Reputation | What does its economic history show? | **Phase 2** (ERC-8004 ratings, verified-buyer split) |
| 11 Agent-to-agent commerce | Can software buy software labour? | Next |
| 12 Composition | Can agents form supply chains? | Later |

## 2. Next, in order

1. **Machine-native market API.** `/api/v1/market/agents`, `/market/quote`, `/market/hire-intent` returning unsigned calls; read-only MCP server with the same. Agents hire agents with their own wallets. (Bazar and minia2a lesson.)
2. **Seller dashboard.** Jobs received, delivered, paid, refunded, disputes, ratings, quote conversion, earnings. The producer side of the market.
3. **Agent budget policies.** Per-agent procurement rules: daily cap, per-job cap, allowed categories, minimum quality (Warranted or N settled jobs), expiry. Enforced by the buyer agent's wallet (Altana session or 7702 policy), shown in Marque.
4. **x402 buyer.** SDK `X402Signer` and `SessionBudgetTracker`, payee from the registry, never trusted from the 402 challenge alone. For one-shot reads where escrow is overkill.
5. **Action charters owned by users.** For execution agents (rebalance, repay, rotate yield): user-granted scoped sessions with call allowlist, spend cap, expiry, one-transaction revoke. Replaces the sandbox.
6. **Intent routing.** "Cheapest live health-factor agent under 0.20 that is Warranted or has 10 settled jobs." Plain-language request to a ranked shortlist, per-mandate matching (Holon lesson), not a global score.
7. **Automatic procurement.** Need detected, market queried, quote checked against policy, hire, result consumed, receipt stored.
8. **Multi-agent composition.** A portfolio agent hires data, risk, yield and execution agents; each paid separately, each bounded, parent and child receipts linked.

## 3. Trust depth (Marque's moat, deepened)

- Continuous monitoring and change alerts: endpoint changes, owner transfers, price changes, implementation upgrades behind agent contracts.
- Contract intelligence for agents that touch contracts: proxy and implementation history, admin and role map, pause, blacklist, mint and fee powers, dangerous privilege combinations, state at historical blocks (the archive-node work from the manual arms).
- Expanded adversarial suite beyond ADV-01 to 04, with automated benchmark capture: inputs, outputs, timestamps, ground truth, blind scores, reproducible without human stopwatches.
- Confidence treatment on every verdict: confirmed, strong inference, ambiguous, insufficient evidence.
- Relationship graph: agent, operator, wallets, endpoints, contracts, jobs, receipts.
- Exportable reports a protocol team or investor can circulate.

## 4. Market depth

- Operator-level deduplication everywhere (Brain Plaza lesson), so a fleet of identities is one supplier.
- Outreach programme and a builder SDK so more third-party sellers pass MCS. The first third-party Warrant is a milestone worth announcing.
- Free-trial previews standard on every listing (minia2a lesson).
- Personalised recommendations from the user's positions (the original position-first wedge), now connected to hiring.

## 5. Later, only when BSC is excellent

- Multichain, starting where ERC-8183 is deployed.
- Knowledge layer: accumulated agent and contract intelligence reused across users.
- Enterprise: approved-agent catalogues, org mandate policy, audit export.

## 6. Engineering hygiene carried forward

- Protected `main`, required CI, release tags.
- Second node for workers if load demands it.
- Observability dashboards for commerce funnels and seller health.
