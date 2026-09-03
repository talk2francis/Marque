# MARQUE — Master Plan
### BNB Chain · "The Smart Money Era: Build the Era" · Submission deadline 9 Sep 2026

> **Marque** — *put your BNB Chain positions in the hands of agents you can hold to account.*

Written 3 Sep 2026. Six build days. Judging 9–23 Sep. Winner 5 Nov.

---

## 0. The single most important thing in this document

Read this section even if you read nothing else.

I spent this research pass looking for the thing everyone else is going to get wrong, and I found it in the data rather than in the marketing. I queried the 8004scan API directly. Here is the raw reality of the "200,000+ agents on BSC":

- The registry returns agents whose `description` is `null`, whose `supported_protocols` is `[]`, and whose `services` is `null`.
- 8004scan's own parser emits, on record after record: `IA002 — Missing services array (agent won't be reachable)`.
- Health checks come back `degraded`, `unhealthy`, `skipped`. Endpoints resolve to dead Cloudflare tunnels and 525s.
- 8004scan's v5.2 scoring literally has an `integrity_tier` of `"broken"` and a `discoverability_tier` of `"unavailable"`, and applies a `no_service_penalty` — because the *registry operator themselves* knows most of the inventory is not real supply.

And the one competitor who has actually shipped — Hive (`bnb.uphive.xyz`) — surfaces **five** agents on its "Available now" shelf, of which **zero** are Grid Trading and **zero** are Yield Optimisation. Two of its four mandated categories are empty on its own homepage.

So the framing in the hackathon brief — *"there's no good way to find them"* — is only half true, and the half that is false is the half everyone will build for.

> **BNB Chain does not have a discovery problem. It has a supply problem wearing a discovery problem's clothes.**
>
> Registered ≠ reachable. Reachable ≠ capable. Capable ≠ appropriate for *my* position, *my* money, *right now*.

Every team in this hackathon is going to build a search box over 200,000 registry rows and then quietly discover that fewer than a dozen BSC agents in these four categories actually answer a request. The ones who notice late will ship a beautiful directory of dead links. The judges — who wrote *"Real-time, accurate data… A user should be able to look at what you're showing and make a genuinely informed call"* — will click through and hit the graveyard.

**Marque is built on the opposite assumption from the start.** We treat supply as the hard problem and make the marketplace *manufacture* qualified supply as its core loop. That is also, not coincidentally, exactly what BNB Chain needs from whoever they adopt: not a front-end, but a **listing pipeline** that turns raw ERC-8004 registrations into agents a stranger can safely pay.

---

## 1. The wedge, in one page

Everyone will build **agent-first**: a grid of agent cards, filters, a hire button.

Marque is **position-first**.

You do not arrive at Marque to browse agents. You arrive, connect a wallet (or paste any address, or click a demo address), and Marque reads your actual BNB Chain positions from the chain in real time:

```
0x7a3f…c412                                                   BNB Smart Chain · block 118,964,203

  PancakeSwap V3 · CAKE/USDT · 0.25%          IN RANGE      4.1% from upper bound   ▓▓▓▓▓▓▓░░░  needs attention
  Venus Core · BNB collateral, USDT debt      HEALTHY       HF 1.43 · liq at $412   ▓▓▓▓▓░░░░░  watch
  Idle · 1,240 USDT in wallet                 EARNING 0%    best net APR 6.8%       ░░░░░░░░░░  idle
  Spot · 0.8 BNB                              —             grid candidate          ░░░░░░░░░░  —

  3 positions · 2 need attention · 7 agents can act on them
```

And then, and only then: **here are the agents that can act on this specific position, what each one would actually do, what it costs, what authority it needs, and what it has proven it can do.**

This one inversion is the whole strategy, and it is not a UX preference — it is the shortest path through all three published judging criteria plus the two partner prizes:

| It solves | Because |
|---|---|
| **Functionality** (criterion 1) | A judge with zero Agent Studio knowledge lands and immediately sees *their own money*, not a taxonomy. There is no "search 200,000 agents" dead end because the first screen is not a search box. The journey is: land → see problem → see who can fix it → understand → bound → hire → watch → receipt. |
| **Data Quality** (criterion 2) | Every number on the first screen is read live from BSC contracts and recomputed by us — tick math, health factors, net APR after cost. That is "real-time, accurate data that goes beyond basic counts" in the most literal possible reading. Registry counts are basic counts. Your liquidation price is not. |
| **Agent Diversity** (criterion 3) | The four categories *are* four position types. You physically cannot build position-first for rebalancing and fake the other three — each needs its own on-chain reader, its own math, its own task schema, its own conformance test. The architecture forces equal depth. Nobody who bolts on three categories can imitate this. |
| **TermiX** (30% + 30%) | Because we compute the correct answer ourselves from chain state, we own the manual baseline. The "does hiring an agent beat doing it yourself" question becomes *measurable by construction*, not a PDF written the night before. |
| **PancakeSwap** (1,000 CAKE) | Category 1 is literally Pancake V3 LP range management, and Pancake's own blog names it as the pain: *"your position only earns fees while the price stays inside the range you set — and prices move overnight."* |
| **Altana** (50,000 XP) | "Give this agent authority over *this position*, up to $100, for 24 hours" is the natural UX for a scoped session. Position-first makes the mandate concrete instead of abstract. |

**The second wedge**, which makes the first one credible: **the Conformance Test.**

No agent appears in a Marque category unless it has passed a published, deterministic, per-category test. We take a real BSC position at a pinned block, compute the ground truth ourselves, ask the agent the same question, and diff the structured answer. Pass earns a dated mark; fail is shown publicly with the exact field that was wrong. This is the Sigil/Occestra/Assay pattern you have already won with twice — **a published, versioned quality standard generated from the same code that enforces it** — applied to a marketplace instead of an artifact. Here it's the **Marque Conformance Standard (MCS v1.x)**.

**The third wedge**, which converts the second into the TermiX prize: **the Advantage Ledger.** Because the conformance harness already computes the correct answer and the wall-clock cost of getting it manually, the required Agent Advantage Report stops being a deliverable and becomes a *product surface at `/ledger`*, reproducible on demand — including by TermiX themselves.

Put together:

> **Marque = live position graph (demand) × conformance-tested agents (supply quality) × bounded mandates (safety) × reproducible advantage (proof).**

The durable asset — the thing BNB Chain would actually be adopting — is not the front-end. It is **the qualified-supply pipeline and the verified work record it produces.**

---

## 2. Naming

You disliked ChatGPT's list, and you were right to: *Prooflane, Runmark, Metria, Gauge, Merit, Pact, Trestle, Meridian, Sieve, Runway* are either generic trust-tech nouns or already-crowded semantic space. None of them mean anything specific to *delegated authority over money with defined limits*.

That is the actual concept. So the name should come from the vocabulary of **licensed, bounded, revocable authority** — which is a rich and almost entirely unused well in crypto naming.

### The name is **MARQUE**, and here is the collision you are accepting

A *letter of marque* was a sovereign instrument granting a private operator authority to act, with a defined scope, a defined target and an expiry, revocable by the grantor. A *marque* is also a maker's mark of quality. Two halves of the product in one word.

**Domain: `usemarque.xyz`, purchased.**

Now the honest part, because I got this wrong once and will not soften it now.

On the first pass I told you there was "no dominant crypto squatter." That claim rested on a single search returning nothing relevant, which is weak evidence for a negative, and I stated it as though it were strong. It isn't true. There is a live project called **Marque** on Base mainnet whose one-line pitch is *"agents that carry a budget, not your keys"* — scoped, revocable delegation, per-render settlement, a verified contract, a GitHub, an X handle at `@marque_run`, and a **hallmark-seal logo**. They arrived at the same name from the same etymology and landed on the same visual motif.

You have decided to keep the name. That is a defensible call: it is a solo hackathon project, not a funded company; it is a creative-studio/NFT product on Base, not a DeFi position marketplace on BSC; and trademark exposure from a hackathon submission is close to nil. Names do not win hackathons.

But the overlap is not zero, and it is concentrated in one specific place. **The collision is not the brand word. It is the primitive.** Their entire product is *an agent carrying a scoped, revocable budget*. If we also call our scoped revocable budget "a marque," we are naming the identical concept with the identical word, and anyone who sees both will read ours as derivative.

### The mitigation: keep the brand, move the primitive

This is the change I want, and it costs nothing because it is strictly better naming anyway:

| Product primitive | Term | Why |
|---|---|---|
| The venue | **Marque** | The brand. The maker's-mark half of the etymology, which pairs with the certificate below. |
| A scoped session over a position | **a Charter** — *grant a charter, revoke a charter* | Chartering is hiring a whole capability for a defined voyage under written terms. Plain English, a stranger understands it instantly, and it is **not what the other project calls its budget.** |
| The conformance certificate | **a Warrant** — *"Warranted for Health Factor, 5 Sep"* | A warrant of fitness is literally an inspection certificate. |
| The indexed agent universe | **the Register** | |
| The position view | **the Desk** | |
| The measured-advantage record | **the Ledger** | |
| The published standard | **MCS** — Marque Conformance Standard | |

Splitting the two ideas across two words reads better than cramming both into one, and it drops the overlap from *same concept, same word* to *shared brand word, different sectors, different chains* — which is ordinary and survivable.

### Three rules that follow from this, and they are not optional

1. **Do not ship a wax-seal or hallmark logo.** That is their mark. Our Seal interaction stays — a brass press on granting a charter is an *animation*, not an identity. The wordmark must be typographic. If the logo and the primitive both match theirs, "coincidence" stops being available to us.
2. **Do not lean on "letter of marque" in public copy.** The privateer-authority framing is their territory. Lead with the quality-mark half: *warranted, held to a standard, stands behind its work.* That is also the half that matches our actual wedge.
3. **Do not use the word "marque" as a common noun anywhere in the product.** It is a proper noun and nothing else. The session is a charter. The certificate is a warrant. Grep for lowercase `marque` before submission and fix anything that comes back.

### Optional, five minutes, non-blocking

`usemarque.xyz` works and it cost $2. If `marque.market` or `marque.trade` is under $15, take one as well and point it at the same host — a two-word URL is slightly weak for something BNB might adopt as a standalone brand, and it is cheaper to fix now than after the README is written. Not worth more than five minutes.

The display name still lives in **one constant**, `packages/ui/src/brand.ts`. Not because we expect to change it, but because a product that hardcodes its own name in forty files is a product that cannot be rebranded by whoever adopts it.

Everything below this line is written as **Marque**.

---

## 3. Why this exists (vision, mission, problem, user)

### The problem, stated so a judge understands it in five seconds

> **A registration is not a résumé, and a rating is not a plan for your money.**

You can find 200,000 agents on BSC. You cannot find out whether *any of them* can safely manage the $1,240 of USDT sitting idle in your wallet, or the LP position that stopped earning at 3am, and you certainly cannot find out what would happen if one of them went wrong.

Three gaps compound:

1. **Reachability gap.** Most registry entries have no live service endpoint. Discovery UIs that don't probe are catalogues of ghosts.
2. **Fitness gap.** "Trading agent" tells you nothing about whether it understands *your* pool, *your* fee tier, *your* collateral asset. Categories are too coarse to buy on.
3. **Containment gap.** Evidence tells you how good an agent has been. It does not tell you how bad things can get if it misbehaves *this time*. Those are different questions and every existing marketplace conflates them.

### Mission

**Make delegating money-work to software a decision an ordinary person can make responsibly.**

### Who it's for

- **Primary — the BSC DeFi holder** with an LP position, a lending position, or idle stables, who wants it managed but will not hand over a hot wallet. They arrive from a Pancake or Venus link, or from search.
- **Secondary — the agent builder** who deployed via `bag` and now has an ERC-8004 identity nobody can find. Marque is their distribution and their proof surface.
- **Tertiary — agents themselves.** Marque exposes a read API and MCP server so an agent can find and hire a sub-agent programmatically. (Ship read-only in v1; this is the Phase-2 extensibility story.)
- **The judge**, explicitly. Judges are users with four minutes. `/judge` exists and is a first-class surface, not a hack.

### The one-sentence pitch

> Marque reads your BNB Chain positions, shows you which ones need work, ranks the agents that can actually do it against a published test, lets you grant one a spending-capped mandate you can revoke, and proves on-chain what it did.

---

## 4. The core loop

```
      READ ───────► RANK ───────► PREVIEW ───────► CHARTER ───────► RUN ───────► RECEIPT
  your positions  qualified     free dry-run    bounded session  live view   verifiable
   from the chain   agents for      of the exact     with cap +        with tx      proof that
                    THIS position   proposed action  allowlist +       stream       improves the
                                                     expiry                         Register
                                                          │                              │
                                                          └───────── REVOKE ◄────────────┘
```

Compare to what everyone else will ship:

```
   BROWSE CARDS ──► CLICK AGENT ──► WALLET POPUP ──► HOPE
```

Every feature in this document earns its place by strengthening one link in the first chain. Anything that doesn't is in §14 (Not Building).

---

## 5. The four categories — what "equal depth" actually costs

The brief is blunt: *"Single-category submissions score poorly. All four, equally deep, is the bar."* Depth is not four tabs pointing at the same card component. In Marque, each category ships **six artefacts**:

1. a **position reader** (live chain math, ours, not the agent's claim)
2. a **task schema** (Zod; what a hire of this category means)
3. a **conformance test** (deterministic, published, dated)
4. a **comparison table** with category-native columns
5. a **charter template** (which contracts, which cap shape, which expiry)
6. **≥1 reference agent** + every reachable third-party agent

> **What a conformance test is and is not.** This distinction is load-bearing and I got it slightly wrong on the first pass.
>
> **MCS tests correctness of facts and compliance with a supplied policy.** There is no objectively correct re-centred V3 range in the abstract — so the test case *supplies the policy* ("re-centre symmetrically at ±6% around spot, fee tier 0.25%") and then checks whether the agent's answer is arithmetically correct, legal for the pool, and compliant with the policy it was given. Facts (current tick, health factor, gross APR) have one right answer. Judgement (which range is wisest, which venue is best) does not, and never appears in a pass/fail test.
>
> **The Ledger tests judgement and advantage.** Quality of decision, speed, and cost belong there, graded against a pre-registered rubric, not in a binary certificate.
>
> Keeping these apart is what makes the standard defensible if a judge or a sponsor interrogates it. A conformance test that quietly grades taste is not deterministic, and someone will notice.

### 5.1 Rebalancing — PancakeSwap V3

**Reader.** `NonfungiblePositionManager.positions(tokenId)` → tickLower/tickUpper/liquidity/feeGrowth; `PancakeV3Pool.slot0()` → current tick, sqrtPriceX96; fee tier → tickSpacing; `collect` static-call → uncollected fees. Derive: in-range boolean, % distance to each boundary in *price* terms, capital efficiency of the current range, uncollected fees in USD, and hours-out-of-range from indexed tick history.

**Conformance test (MCS-REB-1).** Pin a real mainnet position at a specific block **and supply the range policy in the prompt** (e.g. "re-centre symmetrically at ±6% around spot"). Ask the agent for: current tick, in-range boolean, distance to nearest bound, the range implied by that policy, and the token amounts required to mint it. **Validate:** ticks are multiples of the pool's tickSpacing (this alone fails most naive agents), lower < current < upper, the range matches the supplied policy within one tick-spacing, amounts satisfy the V3 liquidity formula within 0.5%, and a slippage bound is stated. Every check is arithmetic. Whether ±6% was a *wise* policy is a Ledger question, not a conformance question.

**Mandate template.** Allowlist = NonfungiblePositionManager + SmartRouter + the two tokens' `approve`. Cap = gas + swap value. Expiry = user-chosen, default 24h. Explicitly *not* allowed: arbitrary ERC-20 transfer, unknown contracts.

### 5.2 Grid Trading

**Reader.** Spot balances, chosen pair, live price from Pancake V3 TWAP + a second source for divergence checking, realized volatility over 7/30d from indexed swaps.

**Conformance test (MCS-GRID-1).** Given price range, capital, grid count and a stop condition, validate: spacing arithmetic (arithmetic vs geometric, declared and correct), per-level allocation sums to ≤ capital, every level lies inside the stated bounds, no level below the stated stop, and **fee drag is disclosed** — an honest grid plan states that `n` levels means `n` round-trips of fees. All five are arithmetic.

*Removed from the test on review:* "expected fills at stated volatility." That is a model output, not a fact, and grading it would have made the standard quietly non-deterministic. It moves to the Ledger.

**Track record.** For grid agents TermiX wants *win rate, window, and risk taken*. We do not fabricate. See §9.4 — the **Sealed Call** mechanism.

### 5.3 Yield Optimisation

**Reader.** Venus Core markets (supply rate, distribution APY, cash/borrows), Lista, PancakeSwap farms (CAKE emissions + fee APR). Compute **gross APR → incentives → gas cost → swap/slippage cost → exit cost → net APR at the user's actual size.** Size matters and nobody shows it: a 6.8% APR on $200 is negative after gas.

**Conformance test (MCS-YIELD-1).** Constrained allowlist of protocols, a fixed asset and size, a minimum-improvement threshold. Validate: every quoted APR carries a source and a timestamp; net APR math reproduces ours within 15bps; the switching cost is itemized; the recommendation respects the improvement threshold; leveraged strategies are flagged if the user excluded them.

### 5.4 Health Factor Monitoring

**Reader.** Venus Comptroller: entered markets, collateral factors, oracle prices, borrow balances. Compute HF, per-asset liquidation price, % price drop to liquidation, and **the exact repay amount to restore a target HF** — a closed-form, checkable number.

**Conformance test (MCS-HF-1).** The most brutal and most valuable test in the set, because the answer is a single number. Agent must return HF to 3 decimals matching our on-chain computation, the correct liquidation threshold per market, and the exact repay amount for a target HF. Off by more than 0.005 → fail, publicly, with both numbers shown.

> **Why this matters strategically:** an agent that gets *your liquidation price wrong* is worse than no agent. Publishing that failure is the single most credible thing a marketplace can do, and no competitor will have the nerve. It is also the clearest possible demonstration of "data quality."

---

## 6. Supply strategy — the part nobody else has planned

This is where the hackathon is won or lost and where I most strongly diverge from ChatGPT's plan, which airily assumes "identify ≥3 viable agents per category on Day 1." From my API probing, that is optimistic for Rebalancing, and close to fantasy for Grid and Yield.

Four supply channels, run in parallel from Day 1:

### Channel A — Index everything reachable
Full 8004scan ingest filtered to `chain_id=56`, then our own probe layer on top (they health-check, but stalely — I saw `health_checked_at` values from May). We classify with an LLM pass over metadata + a deterministic keyword/skill map, and we probe every declared A2A/MCP/x402 endpoint on a 5-minute cycle.

**Apply for the 8004scan Pro tier today** (500 req/min, 100k/day, free for hackathon participants) via the Developer Hub + Pro-Tier Upgrade Form. That is a Day-0 action with a lead time you don't control.

### Channel B — TermiX's own on-chain supply *(nobody else has spotted this)*
While probing the API I found this on **chain 56**:

```
redpen.agent — 56:0x8004a169…:318810
  onchain key: termix.metadataHash
  services: A2A → platform-backend.prod.termix.live/api/v1/a2a/agents/{agentId}/card
  tags: Security Review, Smart Contract Audit, Contract Review, Testing/QA
  termix.profile.category: "Security & Verification"
```

**TermiX registers its platform agents as ERC-8004 identities on BSC mainnet with live A2A endpoints.** That means TermiX's agent roster is *indexable supply for us*, and it means we can surface **security agents** — the exact category TermiX weights above general-purpose in its 20% "high-stakes" criterion.

Implication: build a **TermiX-namespace adapter** (`aacp-platform` namespace, `{agentId}` card resolution) as a first-class execution adapter. When a TermiX judge lands on Marque and sees their own agents properly classified, health-probed, conformance-tested and comparable — with a working hire path — that is a very hard impression to beat. Do this on Day 2.

### Channel C — Claim & List rail (this is what makes us a marketplace, not a portfolio)
```
/builders/claim
  → paste ERC-8004 token ID or owner address
  → we fetch the identity from chain
  → owner signs a SIWE-style message proving control
  → guided listing: category, service type, inputs/outputs, price, endpoint
  → run the conformance test live, in the browser, with the result shown
  → publish
```
Six minutes, no email, no approval queue. **This is the answer to "we're asking for the marketplace itself, not a portfolio of agents"** — a marketplace is a two-sided venue with an onboarding rail, and if BNB adopts us, this rail is the thing they operate. Ship it by Day 5 and get **at least three genuine third-party listings before Sep 9** by DMing the owners of every reachable BSC agent we index and every `bag`-deployed agent we can find. That is direct outreach work you can do yourself while the bots build.

### Channel D — Reference agents as designated market makers
Four first-party agents, one per category, honestly and visibly labelled **"Marque Reference Agent"** with a link to why they exist.

The framing that defuses the "portfolio" objection completely, and which I want in the README verbatim:

> Every exchange with thin books runs designated market makers. Marque's reference agents exist so that no category is ever empty and no judge ever lands on a dead link. They are labelled, they are held to the same conformance test as everyone else, and they are ranked by the same rules — including when a third-party agent beats them.

Built with the BNB Agent Studio CLI (`bag`) so they are genuinely ERC-8004 + ERC-8183 + x402 native, then **self-hosted on your VPS** (the emitted TypeScript is yours; `bag deploy --provider bnb` is only a 48-hour testnet trial and AWS/Azure cost money you shouldn't spend). Register identities on BSC **mainnet**.

| Agent | Category | What it sells | Price |
|---|---|---|---|
| **Bound** | Rebalancing | V3 range health → re-centre plan → bounded execution | 0.15 U |
| **Lattice** | Grid Trading | Constrained grid plan with fee-drag disclosure + execution path | 0.10 U |
| **Sluicegate** | Yield | Net-APR route across Venus/Lista/Pancake at your size | 0.10 U |
| **Keel** | Health Factor | HF, liquidation price, exact restore amount, optional repay | 0.05 U |

Plus, for TermiX specifically:

| **Redcell** | Security *(high-stakes)* | BSC contract + approval risk triage | 0.25 U |

**Redcell is your unfair advantage and ChatGPT had no way to know it exists.** You already built **Archon** — an ERC-8004 trustless smart-contract auditor with a Slither/solc pipeline and an on-chain proof registry, which placed Top 30 and #1 in AI DevTools at the Mantle Turing Test. Port Archon's audit core to a BSC-registered ERC-8004 agent and you enter the TermiX "high-stakes categories" criterion (20%) with a *battle-tested, competition-placed* engine while everyone else enters with a GPT wrapper written on Sunday. Budget half a day. Do not rebuild it — wrap it.

**Prices are deliberately low.** TermiX's rubric is "real working agents at a price and speed that beat the alternative." A $0.05 agent that answers in 6 seconds beats a $2 agent that impresses. Cheap and reliable wins this rubric.

---

## 7. Product surfaces — every page, every sub-page

### Public

```
/                       The Desk — position-first landing
/desk                   Authenticated position view (same component, real wallet)
/register               The Register — all indexed BSC agents
/register/rebalancing
/register/grid-trading
/register/yield
/register/health-factor
/agents/56/[tokenId]    Agent profile
/compare?a=…&b=…&c=…    Category-native comparison
/task/new               Task builder (deep-linked from a position)
/runs/[id]              Run Room — live execution
/receipts/[id]          Public verifiable receipt
/ledger                 The Advantage Ledger (TermiX report, live)
/ledger/[benchmarkId]   One benchmark: inputs, both outputs, rubric, hashes
/standard               MCS v1.0 — the published conformance standard
/standard/[testId]      One test: spec, ground-truth method, current pass list
/pancakeswap            The Pancake Desk
/pancakeswap/gaps       Liquidity Gap report
/charters/[id]          Public mandate view: scope, cap, expiry, spend, revocation
/judge                  Judge Mode — 90-second guided flow
/status                 Live system status, probe coverage, index freshness
/docs                   Integration docs (human + agent)
/api/v1/*               Public read API
/mcp                    Read-only MCP server for agent-side discovery
```

### Authenticated

```
/app/positions          Your positions across all four categories
/app/charters            Active charters: spend meters, expiry timers, revoke
/app/jobs               ERC-8183 jobs, quotes, settlement
/app/receipts           Your run history
/app/watch              Alerts: HF thresholds, range boundaries, APR deltas
```

### Builders

```
/builders               Why list on Marque
/builders/claim         Claim an ERC-8004 identity (SIWE proof)
/builders/agents/[id]   Listing, capabilities, pricing, conformance, analytics
/builders/test          Run the conformance test against any endpoint, free, no signup
```

> `/builders/test` is a small feature with outsized effect: it is a **free public tool** that any BSC agent developer can use immediately, which means it generates real usage during the judging window from people who aren't judges. That matters for the "real-world usage" criterion that BNB's own press release named but the tracks page omitted.

### 7.1 `/` — The Desk

Not a hero-with-a-search-box. The hero **is the product**.

Above the fold, left: a single line of type, then the address field. Right: the live Desk, pre-loaded with a **real demo address that has real positions** (fund one yourself on Day 1 — this is the most important $40 you'll spend).

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Marque                        Register  Ledger  Standard  Builders   ○ ● │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Your positions, worked by                │  ┌──────────────────────────┐  │
│  agents you can hold to account.          │  │ 0x7a3f…c412              │  │
│                                            │  │ block 118,964,203 · 3s ago│ │
│  Marque reads what you hold on BNB Chain, │  ├──────────────────────────┤  │
│  finds agents that can act on it, and     │  │ PancakeSwap V3 CAKE/USDT │  │
│  gives them only the authority you set.   │  │ in range · 4.1% from top │  │
│                                            │  │ ├──────●───┤  watch      │  │
│  [ 0x… or .bnb            ] [ Read chain ] │  ├──────────────────────────┤  │
│                                            │  │ Venus · HF 1.43          │  │
│  or look at a live example →               │  │ liq at BNB $412          │  │
│                                            │  │ ├────●─────┤  healthy    │  │
│                                            │  └──────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────────┤
│  ◂ Keel · Venus check · 0.05 U · 6.2s · settled 2m ago ◂ Bound WARRANTED for  │
│    Rebalancing ◂ charter #018 revoked · 0x9f…21 ◂ Lattice · grid plan ◂     │
└───────────────────────────────────────────────────────────────────────────┘
```

Then, down the page — each section earning its place:

1. **"Two of these three positions are losing money right now."** The four categories introduced *as problems, not as products*, each with a live count of qualified agents. Not four identical cards: four rows, each with the category's own measure device rendered with real data.
2. **"A registration is not a résumé."** The supply funnel, with today's *real* numbers pulled live: `214,882 registered on BSC → 1,140 with a parseable service → 61 responding → 23 classified into a category → 11 Warranted`. Publishing the honest attrition is the single most persuasive thing on the site, and it is the thing no competitor will dare show.
3. **"Trust the agent. Cap the damage."** The mandate explained in plain language with a real, live charter card — spend meter draining, expiry counting, revoke button live.
4. **"Measured, not asserted."** Two rows from the Ledger with real numbers and a link to reproduce.
5. **Recent runs** — three real receipts with tx links.
6. **For builders** — Claim & List in one line, with the free test tool.

No testimonials. No logo soup. No "the future of autonomous intelligence."

### 7.2 `/register/[category]` — dense, terminal-grade

Default filter is **Working** (reachable + classified + priced). A visible toggle reveals `Registered but unreachable (1,079)` with the specific parse error per row — `IA002 · no services array`. Showing the graveyard *and labelling it correctly* is data quality.

Category-native columns. For Rebalancing: pools supported, fee tiers, tick-spacing awareness, observed p95 latency, Warranted date, verified runs, price, permission shape. For Health Factor: protocols, action modes (monitor / alert / repay / add collateral), HF accuracy on last test, response latency, max spend.

Agent row, ~64px, 8 visible per screen:

```
  Bound                                  WARRANTED  5 Sep    live · 3s
  PancakeSwap V3 range management                          0.15 U
  ─────────────────────────────────────────────────────────────────
  MCS-REB-1  pass (tick 0 err, amounts 0.11%)   19 runs   p95 6.4s
  Pancake V3 · ERC-8004 · ERC-8183 · Altana         [Compare] [Open]
```

### 7.3 `/agents/56/[tokenId]` — three questions, in order

**What it does** · capabilities, protocols, inputs/outputs, price, delivery time.
**What it has proved** · conformance result with the actual diff, run history, observed probe success with sample size and window, and — separated, always — *paid-run-verified feedback* vs *unverified ERC-8004 feedback*. That separation is a small thing that reads as enormous integrity.
**What it needs from you** · exact contracts, spend shape, duration, worst case.

Every number carries a **provenance chip**: `ONCHAIN` / `MEASURED` / `TESTED` / `CLAIMED`. Click it and the evidence drawer opens with method, source, timestamp, and tx where applicable. **`CLAIMED` is styled deliberately weakly** — an unverified provider metric must never look like a chain-derived one.

### 7.4 `/task/new` — the Preview (free dry run)

The conversion feature and the judge-comprehension feature simultaneously.

```
  Bound would do this to CAKE/USDT #482910

  Current   ▏1.281 ──────●──── 1.362▕   price 1.347 · 4.1% from upper
  Proposed  ▏1.289 ────●────── 1.418▕   re-centred, 0.25% tier, spacing 50

  3 contract calls · decreaseLiquidity → collect → mint
  Agent fee 0.15 U · gas ~0.0019 BNB · max slippage 0.40%
  Authority required: PositionManager, SmartRouter, CAKE approve, USDT approve

  No transaction has been submitted.

  [ Preview another agent ]                        [ Grant a charter → ]
```

Free where the agent supports a read-only mode; a cheap paid probe otherwise.

### 7.5 The Charter Desk — the one bold moment

Grant flow, in the dark "cockpit" surface (see §8):

```
  CHARTER  #024                                         BNB Smart Chain

  Bound may                          Bound may not
  ✓ read position #482910            ✕ transfer arbitrary tokens
  ✓ call PositionManager             ✕ call unlisted contracts
  ✓ call SmartRouter                 ✕ withdraw to any address
  ✓ spend up to  100.00 USDT         ✕ act after 5 Sep 14:30 UTC

  Wallet: Altana Smart Agentic Wallet · session registered in Keystore

                        [ Grant this charter ]
```

Active state, always visible in `/app/charters`:

```
  CHARTER #024 · ACTIVE          73.40 USDT remaining  ▓▓▓▓▓▓▓░░░
                                19h 41m remaining     ▓▓▓▓▓▓▓▓░░
  2 contracts permitted · 1 call used            [ Revoke now ]
```

**Revoke must be one click, must fire a real on-chain transaction, and must visibly resolve.** Altana's criteria name user-facing revocation explicitly. Make it impossible to miss — put a permanently visible active-mandate strip in the header whenever one exists.

### 7.6 `/runs/[id]` — the Run Room

```
  14:03:18  quote accepted                    0.15 U
  14:03:24  ERC-8183 job funded               0x3f…a1  ↗
  14:03:25  agent accepted
  14:03:31  position read at block 118,964,401
  14:03:35  plan validated against MCS-REB-1  pass
  14:03:36  permission check                  within charter #024
  14:03:42  transaction submitted             0x8b…4c  ↗
  14:03:44  included · block 118,964,405
  14:03:47  result delivered
  14:04:01  receipt sealed                    keccak 0x91…
```
Tabs: Activity · Result · Transactions · Authority · Evidence.

### 7.7 `/ledger` — the Advantage Ledger

Not a PDF. A product. See §9.

### 7.8 `/judge` — Judge Mode

A judge has four minutes. Give them a guided, pre-filled, real run against the funded demo address:

`Intent recognised → 3 agents ranked with reasons → compare → preview → grant charter → hire → run room → receipt → revoke`

Ends with a checklist drawer that maps what they just saw onto the rubric: *ERC-8004 discovery · live chain data · four-category parity · conformance evidence · ERC-8183 commerce · Altana bounded authority · PancakeSwap execution · verifiable receipt.*

This is not a gimmick. It is respect for the judge's time, and it guarantees they see the good part.

---

## 8. Design & front-end — the section you asked me to fight for

### 8.1 Where I disagree with the obvious answer

ChatGPT proposed warm graphite + bone + hairlines + sparse BNB-yellow + editorial grain. It's competent. It is also, precisely, the current default output of every design-capable model: near-black ground, hairline rules, broadsheet columns, all-caps eyebrow labels, `A · B · C` middot strings, monospace for small labels, `→` appended to buttons, `01 / 02 / 03` numbering. Two problems:

1. It reads as generated to anyone who has looked at a lot of AI-made sites in 2026, and judges have.
2. **Hive already looks like that.** Light ground, hairlines, `01 Rebalancing / 02 Grid Trading / 03 Yield / 04 Health Factor`. If we ship the same language we become Hive's cousin, and cousins lose.

You also said Assay's dark theme felt unexciting for normies. You're right about that too, and the fix is not "light everywhere."

### 8.2 The idea: **light for looking, dark for doing**

Marque is a light interface — a daylight instrument panel — **except on the surfaces where money moves**, which drop into a warm near-black cockpit: the Charter Desk, the Run Room, the receipt seal.

This is not a theme toggle and not decoration. It is **semantic**: the interface visibly changes state when you stop browsing and start committing capital. A judge feels the gear change without being told. Every competitor will be uniformly dark (crypto default) or uniformly light (Hive). Nobody will do this, and it is defensible in one sentence when someone asks why.

It also lets us use both aesthetics you actually like — Occestra's daylight editorial and the Treasure Okure dark-olive grain — without a gimmick.

### 8.3 Tokens

```css
/* DAYLIGHT — discovery, register, profiles, ledger, standard */
--paper:        #EDEDE7;   /* cool drafting vellum, not cream, not white */
--paper-raised: #F7F7F3;
--ink:          #15160F;
--ink-soft:     #5C5E52;
--rule:         #D4D4CB;

/* COCKPIT — mandate, run room, receipt */
--deck:         #12140E;   /* warm near-black olive */
--deck-raised:  #1B1E15;
--deck-ink:     #E8E9E0;
--deck-rule:    #2C3023;

/* BRAND — oxidised brass. BNB-adjacent, not Binance yellow. ≤8% of viewport. */
--brass:       #B0892C;
--brass-lit:   #D9AE45;   /* seal bloom + active charter only */

/* SIGNAL — state only. Never decoration. Never a brand colour. */
--holds:        #2E7351;   /* in range / healthy / pass */
--watch:        #B8721A;   /* approaching a bound */
--breach:       #A83A2C;   /* out of range / at risk / fail */
--chain:        #2B5A85;   /* verified on-chain */
```

**Deliberate rejections:** no Binance yellow as a field colour (it screams template and BNB's own brand guidelines make it a trap); no purple; no glassmorphism; no neon; no gradient washes; no rounded-card grid; no glowing anything.

### 8.4 Typography

Two families, clearly distinct, neither a default reach.

- **UI, data, labels — Geist** (with **Geist Mono strictly for numerals inside tables, receipts and hashes**, never for labels or eyebrows). Tabular figures mandatory anywhere numbers stack.
- **Statements — Fraunces**, one weight, `wonk` at 0, `soft` low. Used for **exactly four things**: the hero line, the six section statements on `/`, charter document headings, and the receipt title. Never on card titles, never on buttons.

Scale — restrained, as you asked, roughly Occestra's proportions:

| Role | Desktop | Mobile |
|---|---|---|
| Hero (Fraunces) | 48px / 1.05 | 30px |
| Section statement (Fraunces) | 30px / 1.15 | 24px |
| Card / row title (Geist 500) | 16px | 15px |
| Body (Geist 400) | 15px / 1.55 | 15px |
| Data cell (Geist Mono, tabular) | 13.5px | 13px |
| Caption / provenance chip | 11.5px | 11.5px |

Line length ≤ 68ch. **No all-caps labels anywhere** except the provenance chips, where four fixed tokens (`ONCHAIN` `MEASURED` `TESTED` `CLAIMED`) function as a controlled vocabulary rather than decoration — that's the one justified exception, and it stays at 10.5px with generous tracking.

### 8.5 The structural device — **the measure rule**

One idea, used everywhere, that makes four different categories legible at a glance and makes "equal depth" *visible*.

Every quantitative claim gets a **measure**: a 3px-tall rule showing where the value sits inside its safe band, with the threshold marked.

```
  In range      ▏1.281 ─────────●──── 1.362▕    price 1.347
  Health factor ▏1.00 ──────●──────── 3.00▕     HF 1.43, liq 1.00
  Net APR       ▏0% ──●──────────── 9.4%▕       you 0.0%, best 6.8%
  Grid band     ▏0.94 ───────●────── 1.18▕      12 levels, 3 filled
```

Same device, four categories, one component. It is not a card grid, it is not a chart library, and it communicates risk position instantly to someone who has never used DeFi. This is the memorable thing.

### 8.6 Motion — spend it in one place

**The one bold moment: the Seal.** On granting a charter, the daylight dims to cockpit over 260ms, the charter composes line by line (allowlist, then cap, then expiry, 60ms stagger), and the brass mark presses down with a short bloom — your Occestra wax-seal moment, reborn as an authority stamp. Then the session tx hash writes in beneath it, character by character, as it confirms. That is the screenshot that goes in your submission and on X.

Everything else stays quiet and functional:

- **The Tape.** A slow horizontal chartere of real settled runs, marks awarded, and revocations — the CrabTalk reference, but every item is a real event and clicks through to its receipt. Pauses on hover. Never loops fake data; if there are no events, it doesn't render.
- **Measure fill.** Measures animate 0→value once on data arrival, 400ms cubic-bezier(.16,1,.3,1), 30ms stagger. Once. Not on scroll.
- **FLIP reorder.** When a filter or ranking changes, rows physically move to their new position. This shows *what changed*, which is the only good reason for motion.
- **Spend meter.** Drains in real time on active charters.
- **Confirmation pulse.** One 200ms brass pulse when a tx is included. Nothing else.

**Banned:** scroll-triggered fade-up on every section, hover-lift on every card, parallax, bouncing anything, animated gradient blobs, particle fields, 3D robots. Every animation has a `prefers-reduced-motion` fallback. Performance floor: 60fps on a mid laptop, LCP < 2.0s, zero console errors.

### 8.7 Texture

The Treasure Okure instinct is right but must be subtle. A monochrome grain overlay at **1.5% opacity** on the cockpit surfaces only, generated as an inline SVG `feTurbulence` (no image request), `pointer-events: none`, disabled under reduced-motion-safe conditions and on low-DPR. Daylight surfaces stay clean — grain on light reads as noise, grain on near-black reads as material.

### 8.8 Copy voice

Plain verbs. Sentence case. Say what happens. The button that says **Grant a charter** produces a state that says **Charter granted**. Errors state what failed and what to do. Empty states are invitations:

> *No agent has passed MCS-GRID-1 yet. If you run a grid agent on BSC, test it here — it takes about a minute.*

And the four lines worth keeping, in order of how much work they do:

- **"A registration is not a résumé."**
- **"Trust the agent. Cap the damage."**
- **"Measured, not asserted."**
- **"See what it has done before you decide what it may do."**

### 8.9 Quality floor (non-negotiable, enforced by an audit script)

Playwright script `scripts/audit.mjs` screenshots every route at 1440/1024/768/390, checks horizontal overflow, console errors, missing alt text, focus visibility, and colour contrast, and writes a report. **Every front-end phase ends by running the audit, looking at the screenshots, and iterating.** This loop is what produced Occestra's finish; it is not optional.

---

## 9. TermiX — the track we intend to win outright

$6,000 for first. Scored independently: **30% value of services · 30% proven advantage · 20% high-stakes categories & track record · 20% marketplace quality.**

And the line that should govern all engineering priority:

> *"TermiX will hire from your marketplace themselves and see what comes back."*

### 9.1 The dominant risk, and the counter

The #1 way we lose TermiX is not a weak report. It is: **a TermiX evaluator clicks Hire, and the agent is slow, hangs, or returns garbage.** Design excellence is worth zero in that moment. So:

- **Reliability SLO on all five reference agents:** p95 < 8s, p99 < 20s, ≥99% probe success across the judging window. Watchdog + PM2 auto-restart + a health endpoint monitored every 60s with a Telegram alert to you.
- **Fail loud and cheap.** Circuit breaker: if an upstream (RPC, LLM, price feed) is degraded, return a structured, honest failure in <3s rather than hanging. A fast honest error beats a 90-second timeout by a mile in a judge's mind.
- **Warm the caches.** Pre-index the demo positions, pool state, and Venus markets so a cold hire doesn't pay for a cold RPC.
- **Free preflight on every agent.** Let TermiX see the output shape before spending anything. Removes the "is this a scam" hesitation entirely.
- **Price at $0.05–$0.25.** Cheap and correct.

### 9.2 The Advantage Ledger (`/ledger`) — the 30% criterion, built as a product

Because the conformance harness already computes ground truth, the report generates itself.

```
  BENCHMARK  ADV-02 · Pancake V3 range decision            trading · 2 runs

                                    manual        agent (Bound)
  wall clock                       12m 41s              18.4s
  direct cost                          $0              $0.15
  gas                                  —          0.0019 BNB
  correct tick spacing                yes                yes
  amount error vs formula           1.9%              0.11%
  slippage policy stated               no                yes
  rubric score (blind graded)      74/100             96/100

  [ manual output ]  [ agent output ]  [ rubric v1.0 ]  [ receipt ]  [ reproduce ]
```

**Methodology, published at `/ledger/methodology`, and this is what makes it credible:**

- **Pre-registered rubric**, version-hashed and committed *before* any run.
- **Identical inputs**, pinned to a block number, input hash published.
- **Real wall-clock**, measured, never estimated.
- **Itemized cost** — agent fee, gas, LLM/API spend where measurable.
- **Blind grading** — source labels stripped before scoring.
- **Every run repeated ≥2×.** (The X commentary on the TermiX track specifically read the requirement as *three tasks run twice*. We over-deliver: 3 tasks × 2 arms × 2 repetitions = 12 runs, plus a 4th task if time allows.)
- **Immutable evidence manifest** per benchmark: `benchmark_id, task_hash, input_hash, manual_output_hash, agent_output_hash, agent_id, block, job_id, tx_hashes, cost, elapsed_ms, rubric_version, score_breakdown` — keccak'd and anchored.

### 9.3 The three (four) benchmarks

| ID | Task | Category | Why |
|---|---|---|---|
| **ADV-01** | Triage approval risk + privileged functions on a live BSC contract | **Security** ← satisfies the mandatory high-stakes task | Redcell (Archon-derived) vs a manual analyst with BscScan. Our strongest hand. |
| **ADV-02** | Compute a correct re-centred V3 range + required amounts + slippage envelope for a live position | **Trading** | Manual arm requires the V3 liquidity formula by hand — humans get tick spacing wrong constantly, which produces a large, *honest* advantage. Also feeds the Pancake prize. |
| **ADV-03** | Best net-of-cost yield route for 1,000 USDT across Venus/Lista/Pancake under constraints | Yield | Manual arm must gather five APRs and net out gas + swap cost. Slow and error-prone by hand. |
| **ADV-04** *(stretch)* | Exact repay amount to restore Venus HF to 1.35 | Health factor | Single deterministic number. Manual arm frequently wrong. Cheapest to run, highest clarity. |

**Do the manual arms yourself, honestly, with a screen recording and a timer.** If an agent's advantage is small on a task, publish that. A ledger that shows one narrow win is far more credible than one showing four blowouts, and TermiX are explicitly rewarding *measurement*, not marketing.

### 9.4 Track record without fabrication — the **Sealed Call**

TermiX wants trading agents to show *win rate, the window, and the risk taken*. We have days, not months. Fabricating is disqualifying and you'd never do it. So:

Every recommendation a Marque agent issues is hashed (`keccak(recommendation ‖ block ‖ agentId ‖ timestamp)`) and written to a small `MarqueRegistry` contract on BSC at the moment of issue. Later, we score it against what the chain actually did and publish the result.

The profile then shows, honestly:

```
  Sealed calls   14 over 4 days  ·  window 5–9 Sep  ·  n is small, treat accordingly
  Resolved       9 · in-range held 7 · re-entry required 2
  Method         /standard/sealed-call        Every call verifiable on BscScan
```

An honest n=14 with a published method, an on-chain timestamp proving the call preceded the outcome, and a visible warning about sample size is **more persuasive to a serious evaluator** than "81% win rate" with no window — and TermiX's rubric asks for exactly the things we're providing. Meanwhile any competitor showing a bare win-rate percentage should be flagged in our comparison as `CLAIMED`.

### 9.5 The legitimate tactical move

Ship a filter: **`Advantage measured`**. It surfaces the agents whose performance we have already benchmarked. That is not gaming the test — it is a marketplace doing curation and being transparent about what curation means. When TermiX arrives and starts hiring, they land on agents we know survive contact.

---

## 10. PancakeSwap — 1,000 CAKE, treated as a must-win

The brief: *"a real benefit to PancakeSwap traders or liquidity providers."* Their own blog names the pain: *"your position only earns fees while the price stays inside the range you set — and prices move overnight."*

### 10.1 Don't submit "we integrated PancakeSwap." Submit the loop.

> Marque finds your Pancake V3 position, tells you it has stopped earning, ranks the agents that can fix it against a published test, lets you give one a capped mandate over only the PositionManager and the router, executes, and proves the before/after with transaction hashes.

That wins the *marketplace* story and the *Pancake benefit* story with the same artefact.

### 10.2 `/pancakeswap` — the Pancake Desk

- Connect wallet → **all** V3 positions with the measure rule showing price-within-range
- Uncollected fees, and **hours out of range** (this is the number that makes an LP feel the loss)
- Per position: the agents that support that exact pool and fee tier
- Preflight → mandate → execute → receipt with old range / new range / gas / realised slippage / fees collected
- Guardrails stated and implemented exactly as Pancake's own agent guide prescribes: **slippage caps, ≤5-minute deadlines, exact-amount approvals, atomic multicall, token safelist**

### 10.3 One real mainnet rebalance

Budget **$25–40** of your own capital. Open a deliberately tight CAKE/USDT or BNB/USDT V3 range so it drifts out within hours, then let Bound rebalance it under an Altana charter. Capture everything:

```
  before   ▏1.281 ────────────●▕  OUT OF RANGE · 6h 12m · 0 fees accrued
  action   decreaseLiquidity → collect → mint       tx 0x…, 0x…, 0x…
  after    ▏1.289 ─────●──────▕  IN RANGE · fees resumed at block 118,9xx,xxx
  cost     0.15 U agent · 0.0021 BNB gas · 0.18% realised slippage
  bounded  charter #024 · cap 100 USDT · 2 contracts · expired 14:30 UTC
```

**Mainnet, not testnet, for this prize.** A tiny real transaction beats an elaborate testnet simulation in the eyes of a protocol team.

### 10.4 The extra that nobody will do: `/pancakeswap/gaps`

Pancake's brief explicitly lists *"researching market movements to find demand where creating PancakeSwap pools could improve liquidity efficiency."* Almost every submission will ignore this sentence.

Ship a small, honest **Liquidity Gap** report: index BSC swap routing, find pairs with meaningful volume that currently route multi-hop or through thin V3 liquidity, and rank candidate pool/fee-tier creations by fee revenue per unit of liquidity at current volume. Two hundred lines of indexer plus a table. It directly answers one of their four listed examples and costs half a day.

---

## 11. Altana — cheap to win because it's core UX anyway

Requirements, mapped one-to-one to what we're building regardless:

| Altana requirement | Marque surface |
|---|---|
| Agents on their own Altana wallets | Each reference agent provisioned with an Altana Smart Agentic Wallet |
| Sessions with call allowlist, spend cap, expiry | The Charter Desk, verbatim |
| Sessions registered in Keystore | On grant, before any execution |
| Real on-chain tx through a session key | The Pancake rebalance + one Venus repay |
| User-facing visibility and revocation | `/app/charters` + the persistent header strip + one-click revoke |
| *Bonus:* ERC-8183 buyer side | `hireErc8183Agent` via `docs.altana.network/sdk/erc8183` |
| *Bonus:* sell over x402/B402 | `@altananetwork/x402-server` on the reference agents |

Do at least one **mainnet** session (they said mainnet is stronger); keep the rest on testnet where the Paymaster covers gas. Include every wallet address in the submission form — they asked for it explicitly and people forget.

---

## 12. AltLayer / 8004scan

- **Apply for Pro tier on Day 0.** Developer Hub → create key → Pro-Tier Upgrade Form. 500 req/min, 100k/day, free for participants. Lead time is not under your control.
- Use `/agents` with `chain_id` filtering, `/agents/search/semantic` for classification assist, `/agents/{chainId}/{tokenId}` for detail, `/feedbacks` for reputation. Keys stay **server-side only** — their docs say so explicitly and a leaked key in client JS is an embarrassing finding in a code review.
- **Give something back**, which is the Phase-2 extensibility play: publish our category classifications, probe history, and conformance results as a free public read API and offer them to AltLayer as an enrichment feed. A marketplace that improves the registry it reads from is a far stronger adoption candidate than one that merely consumes it.

---

## 13. Architecture

Production-shaped, not distributed theatre. Six days, one operator, no Docker (house rule), chain as the canonical source and Postgres as a rebuildable materialized view — the Agora lesson, applied.

```
                      ┌──────────────────────────────────┐
                      │   charter.market  ·  Next.js 15   │
                      │   App Router · standalone · Caddy│
                      └──────────────┬───────────────────┘
                                     │
                  ┌──────────────────▼──────────────────┐
                  │            Marque API                │
                  │  positions · register · conformance  │
                  │  quotes · jobs · charters · ledger    │
                  └───┬──────────┬───────────┬───────────┘
                      │          │           │
          ┌───────────▼──┐  ┌────▼─────┐  ┌──▼────────────┐
          │  PostgreSQL  │  │  Redis   │  │  Artifact     │
          │  materialized│  │ queues + │  │  store (local │
          │  view only   │  │  cache   │  │  + IPFS pin)  │
          └──────────────┘  └────┬─────┘  └───────────────┘
                                 │
              ┌──────────────────▼───────────────────┐
              │        Workers  (PM2, 6 procs)        │
              │  ingest · probe · classify · conform  │
              │  index (BSC log cursor) · bench       │
              └───┬────────┬──────────┬───────────┬───┘
                  │        │          │           │
        ┌─────────▼──┐ ┌───▼──────┐ ┌─▼────────┐ ┌▼──────────────┐
        │ 8004scan   │ │ BSC RPC  │ │ Agent    │ │ Protocol      │
        │ API (Pro)  │ │ pool ×3  │ │ endpoints│ │ readers       │
        └────────────┘ └──────────┘ │ A2A/MCP/ │ │ Pancake V3    │
                                    │ x402/    │ │ Venus / Lista │
                                    │ ERC-8183/│ └───────────────┘
                                    │ TermiX   │
                                    └──────────┘

        ┌────────────────────────────────────────────────┐
        │  Altana session layer — allowlist / cap /       │
        │  expiry / Keystore registration / revoke        │
        └────────────────────────────────────────────────┘

        ┌────────────────────────────────────────────────┐
        │  Reference agents (bag-generated, self-hosted)  │
        │  bound · lattice · sluicegate · keel · redcell  │
        │  ERC-8004 mainnet identities · ERC-8183 · x402  │
        └────────────────────────────────────────────────┘
```

### Monorepo

```
apps/
  web/            Next.js 15 App Router
  api/            Hono (or Next route handlers if it stays small)
  worker/         PM2 entrypoints
packages/
  db/             Drizzle schema + migrations
  chain/          viem clients, RPC pool, BSC log cursor
  registry/       8004scan ingest + normalizer + classifier
  probe/          liveness, latency, schema validation, SSRF guard
  positions/      four readers: pancakeV3, venus, lista, spot
  conformance/    MCS tests + ground-truth engines + report renderer
  execution/      adapters: erc8183 | x402 | a2a | mcp | termix
  mandates/       Altana sessions
  ledger/         benchmark runner, rubric, manifest hashing
  ui/             design system
agents/
  bound/ lattice/ sluicegate/ keel/ redcell/
contracts/
  MarqueRegistry.sol      sealed calls + receipt anchors
docs/
```

### The Execution Adapter (the thing that makes heterogeneous supply work)

```ts
interface AgentExecutor {
  inspect(): Promise<CapabilityManifest>
  quote(task: StructuredTask): Promise<Quote>
  preflight?(task: StructuredTask): Promise<PreflightResult>
  execute(task: StructuredTask, ctx: ExecutionContext): Promise<Run>
}
```
Implementations: `Erc8183Executor`, `X402Executor`, `A2AExecutor`, `McpExecutor`, `TermixExecutor`. The user only ever sees **price → authority → execute → receipt**.

### Security — non-negotiable, and a Phase-2 differentiator

Agent endpoints are hostile input. This is not hackathon garnish; if BNB adopts this, it's the first thing their security team looks at.

- **SSRF guard** on every probe and execution: resolve DNS, reject private/reserved/link-local ranges and cloud metadata IPs, re-check after redirects, hard timeout, response size cap.
- **No eval, ever.** Agent responses parsed through Zod. Metadata sanitized before render — no raw HTML from `description` fields.
- **LLMs never sign.** All signing is fixed code paths. Chain tools exposed to any LLM are read-only. (This mirrors Agent Studio's own posture and is worth saying out loud in the README.)
- **Keys server-side**, `.env.local` only, never in `studio.toml`, never in client JS.
- **Judge/demo wallet is separate and low-value.** Never reuse a wallet holding real funds for agent runtime testing.
- **Before any write**: resolve destination, render the exact human-readable action, simulate where possible, enforce cap and allowlist, require explicit consent.
- Strict CSP. Rate limits on probes, quotes, benchmarks, and execution.

---

## 14. What we are deliberately not building

Broad is fine. *Unfocused* loses. Cut, with prejudice:

token · DAO · points · NFTs · agent social feed · general chatbot · multichain (BSC only until judged) · a custom identity standard · a custom escrow protocol · a custom wallet · a custom payment rail · a visual multi-agent workflow builder · launchpad · prediction markets · referrals · mobile app · 3D globe · AI avatars · forums · a "290,000 agents" vanity counter on the homepage.

Each of these makes the product **bigger and less winnable.** The rubric has three lines. Four categories is already broad. Depth beats breadth here.

---

## 15. Six-day build plan

Judging deadline **9 Sep**. Treat **8 Sep** as the engineering deadline. You have Codex on backend/infra and Claude Code on frontend, running continuously.

### Day 0 — Today, 3 Sep · Foundation (the only day where speed of setup beats quality)
- Domain purchased; DNS to VPS; Caddy + HTTPS live with a holding page
- Repo, monorepo skeleton, `AGENTS.md` committed **first**
- **8004scan Pro tier application submitted** ← do this before anything else
- Postgres + Redis native on VPS; Drizzle schema
- Design tokens + type scale + `MeasureRule` primitive
- 8004scan ingest running, `chain_id=56` only; first probe pass
- **Fund the demo wallet: open a tight Pancake V3 position, a small Venus borrow, park idle USDT.** Everything downstream depends on this existing.
- Register on the intake form so you're in the system

**Do not spend today making the hero beautiful.**

### Day 1 — 4 Sep · Read the chain
- Four position readers, tested against the demo wallet and three known mainnet addresses
- Classifier: metadata + semantic search → four categories + `unclassified`
- Probe worker: 5-min cycle, latency, schema check, SSRF guard, failure taxonomy
- `/` and `/desk` with real position data and real measures
- `/register` + four category pages, `Working` default, graveyard toggle with parse reasons
- **Gate: a stranger can paste an address and see their positions correctly.**

### Day 2 — 5 Sep · Qualify the supply
- Conformance harness + all four MCS tests + ground-truth engines
- `/standard` published, versioned, generated from the test code itself
- Agent profiles with provenance chips + evidence drawers
- `/compare` with category-native columns
- **TermiX adapter** — index and probe TermiX-registered BSC agents
- Reference agent **Bound** live: `bag`-scaffolded, ERC-8004 mainnet identity, self-hosted, MCS-REB-1 passing
- **Gate: discover → understand → compare works end to end with zero placeholder numbers.**

### Day 3 — 6 Sep · Hire
- Quote → ERC-8183 job → funding → fulfilment → settlement
- x402 path for per-call agents
- Preflight (free dry run)
- Run Room + receipts + `MarqueRegistry` anchoring
- Reference agents **Keel**, **Sluicegate**, **Lattice** live
- **Start the Ledger. Run ADV-01 and ADV-02 today.** Do not defer this to Day 5.
- **Gate: ≥3 successful end-to-end paid hires with public receipts.**

### Day 4 — 7 Sep · Bound authority + partner surfaces
- Altana wallets on all reference agents; Charter Desk; Keystore registration; the Seal moment
- Real session-key transaction; revoke working and visible
- `/pancakeswap` Pancake Desk + **one real mainnet rebalance under a charter**
- **Redcell** (Archon-derived security agent) live and registered
- ADV-03 run; repetition passes for ADV-01/02
- **Gate: a judge can grant, watch, and revoke a real mandate.**

### Day 5 — 8 Sep · Proof, polish, freeze
- Ledger complete: 3 benchmarks × 2 arms × 2 reps, outputs attached, manifests hashed, methodology published
- `/pancakeswap/gaps`
- `/builders/claim` + `/builders/test`; **outreach to ≥5 real agent owners**
- `/judge` Judge Mode
- Full Playwright audit at four widths; mobile; keyboard; reduced motion; empty states; failed-endpoint states; wallet-rejection states
- **Hostile judge test**: fresh browser, no extension, no localStorage, mobile, slow 3G
- README, demo video, screenshots, status page, uptime monitor, PM2 restart policy, DB backup
- **Feature freeze at 18:00.**

### Day 6 — 9 Sep · Submit
- Verify all four categories populated; 3–5 fresh hires; every link in the README; all tx hashes; all wallet addresses; video plays; production healthy
- Submit via the intake form (`forms.gle/9g9XPNFwnYaHAz9L8`), tick TermiX, PancakeSwap, Altana, AltLayer
- **Do not turn anything off.**

### Days 7–20 — 10–23 Sep · The judging window

Judging runs 9–23 September. Almost every team will go dark on the 9th. Eligibility requires the submission to be *functional and publicly accessible during judging* and *agents live on BSC*. But — and this is a correction to my first draft — **the rules do not authorise materially changing the judged product after the deadline, and I should not have framed continued feature-shipping as "free points."** A judge comparing to a Sep-9 snapshot could reasonably treat post-deadline features as unfair.

Split it into three buckets and behave differently in each:

**Unambiguously allowed — do all of it, daily.**
Uptime, monitoring, security patches, bug fixes, keeping agents live, keeping the index fresh.

**Not shipping, just working — this is the real free-points bucket.**
A marketplace that indexes new agents, records new probes, resolves sealed calls, accepts self-serve third-party listings and serves real users during judging is not *changing*; it is *operating*. Data accrual is the product doing its job. Every one of those is evidence for a criterion BNB's own press release named — *"real-world usage"* — that the tracks page omits. This survives either ruling.

**Ambiguous — ask before doing.**
New features, new pages, redesigns. On 9 Sep, email the organisers and ask in one line: *"Is post-deadline iteration permitted during judging, or should the submitted build be frozen?"* Record the answer in `SUBMISSION.md`. If yes, ship. If no, freeze features and keep operating.

Asking costs one email and removes the entire risk. Assuming costs the prize.

Also during this window: post daily on X with real receipts rather than marketing, and keep the `/status` page honest.

## 15b. Funding — what you actually pay for

Three separate situations, and conflating them is how people overspend.

| Purpose | Network | Asset | Amount |
|---|---|---|---|
| Development and contract testing | BSC testnet (97) | tBNB | Free from the faucet. ~0.01–0.02 tBNB per active test wallet. Agent Studio's own walkthrough runs on roughly 0.005 tBNB. |
| Real demo positions and proof runs | BSC mainnet (56) | BNB + USDT | **0.10 BNB + 40 USDT** into one dedicated low-value wallet |
| ERC-8183 paid-job settlement | Testnet first | **Whatever the deployed kernel reports** | Do not guess |

**On the settlement asset: do not pre-buy an assumed "ERC-8183 token."** The BNB Agent SDK resolves its commerce settlement asset from the deployed kernel at runtime. Have the code call `token_symbol()` / `token_decimals()` / `token_balance()` first, then fund exactly what it reports. Guessing USDT and being wrong wastes a swap and half a morning.

**ERC-8004 registration is gas-sponsored** via MegaFuel on both testnet and mainnet, so registering the reference agents should not burn BNB. Verify this at build time rather than budgeting for it.

Mainnet allocation of the 0.10 BNB + 40 USDT:

- **~0.025 BNB + 15–20 USDT** → PancakeSwap V3 BNB/USDT or CAKE/USDT position, deliberately narrow so it drifts out of range within hours. This is the Pancake proof.
- **~0.04 BNB** → Venus collateral, borrowing only 5–8 USDT.
- **~15–20 USDT** → left genuinely idle so the yield reader has something real to read.
- **~0.01 BNB** → split across reference-agent wallets for job submission and session gas.
- Remainder as operational gas buffer. BSC gas at ~0.05 gwei makes 0.01 BNB extremely generous.

Most of this stays yours. Real cost is gas, slippage, LP drift and paid agent calls — call it $10–20 burned across the whole build.

**One correction to my own earlier example.** The mock on `/` shows a Venus position at HF 1.43. That was illustrative layout copy, not an instruction. **Do not deliberately run a mainnet position near liquidation for presentation.** Keep our own mainnet Venus position comfortably above HF 2.5. Demonstrate the dangerous case against a **real third-party mainnet address** — there are thousands of genuinely at-risk Venus positions readable right now — or a pinned historical block.

That is strictly better anyway: reading a stranger's risky position proves the reader works on arbitrary input, which is precisely the functionality criterion. Manufacturing our own liquidation risk proves nothing and can lose money.

**Also budget agent LLM spend.** Five reference agents answering calls for two weeks of judging. Cap it: `DAILY_LLM_USD_CAP=5` globally with per-agent sub-caps, and an alert at 80%. Left uncapped, a probe loop plus a curious judge can burn real money overnight.

**Every illustrative number in this document — 214,882 registered, 61 responding, HF 1.43, $0.18 fees — is layout copy.** None of it ships. The product displays only what ingest and the readers actually measure.

## 16. Acceptance gates — put this in `SUBMISSION.md` and refuse to add polish until every line passes

| Gate | Required |
|---|---|
| Four category pages, each with ≥2 listed agents | ✔ |
| Every category has a live chain-derived position reader | ✔ |
| Zero placeholder or hardcoded metrics anywhere | ✔ |
| Every displayed metric carries a provenance chip | ✔ |
| Address → positions works for arbitrary BSC addresses | ✔ |
| Search → compare → preview → hire with no dead end | ✔ |
| New user completes a hire without reading docs | ✔ |
| ≥3 successful paid ERC-8183 or x402 runs with public receipts | ✔ |
| All four MCS tests published with real pass/fail results | ✔ |
| At least one public conformance **failure** shown honestly | ✔ |
| Altana session: allowlist + cap + expiry, Keystore-registered | ✔ |
| Real session-key transaction on-chain | ✔ |
| In-product revoke works and is visible | ✔ |
| Real mainnet PancakeSwap V3 rebalance, before/after receipted | ✔ |
| Ledger: 3 benchmarks × 2 arms × 2 reps, outputs attached | ✔ |
| ≥1 Ledger benchmark from trading/stock/security | ✔ |
| ≥3 third-party (non-Marque) agents listed | ✔ |
| Builder claim rail works end to end | ✔ |
| Mobile 390px clean; keyboard navigable; reduced motion respected | ✔ |
| No console errors on any route | ✔ |
| Production uptime monitored, auto-restart configured | ✔ |
| README leads with judge links, not install instructions | ✔ |
| Demo video ≤ 2:45 | ✔ |

---

## 17. Submission kit

### README — first screen is for the judge, not the developer

```
# Marque
Put your BNB Chain positions in the hands of agents you can hold to account.

▶ LIVE            https://charter.market
▶ 90-SECOND FLOW  https://charter.market/judge
▶ VIDEO           …

MAIN TRACK
  Rebalancing         /register/rebalancing        n agents · n Warranted
  Grid Trading        /register/grid-trading       n agents · n Warranted
  Yield Optimisation  /register/yield              n agents · n Warranted
  Health Factor       /register/health-factor      n agents · n Warranted

DATA QUALITY
  Live position readers        /desk?address=0x…
  Published standard           /standard
  Honest supply funnel         /   (section 2)
  A public conformance failure /standard/MCS-HF-1

PROOF
  Receipts        /receipts
  Sealed calls    MarqueRegistry 0x…  (BscScan)
  Runs            n settled

TERMIX
  Advantage Ledger      /ledger
  Methodology           /ledger/methodology
  Security benchmark    /ledger/ADV-01
  Raw outputs + hashes  /ledger/ADV-01#artifacts

PANCAKESWAP
  Pancake Desk          /pancakeswap
  Mainnet rebalance     tx 0x…, 0x…, 0x…
  Liquidity gaps        /pancakeswap/gaps

ALTANA
  Charter Desk          /app/charters
  Session registration  tx 0x…
  Session-key execution tx 0x…
  Revocation            tx 0x…
  Wallets               0x…, 0x…

ARCHITECTURE, SECURITY, RUNBOOK  ↓
```

### Demo video — 2:45, no cinematics

| Time | Content |
|---|---|
| 0:00–0:12 | The problem, with the real funnel numbers on screen. "214,882 registered. 61 answer." |
| 0:12–0:35 | Paste an address. Positions appear. Two need attention. |
| 0:35–0:55 | Three agents ranked for *this* position, with reasons. Compare. |
| 0:55–1:15 | Preview: exactly what would happen. Nothing submitted. |
| 1:15–1:35 | Grant a charter. The Seal. Cap, allowlist, expiry visible. |
| 1:35–1:55 | Run Room → transaction → receipt → revoke. |
| 1:55–2:15 | All four categories, each with its own depth. |
| 2:15–2:35 | The Ledger: manual vs agent, with the methodology link. |
| 2:35–2:45 | Pancake before/after, and the Claim rail. Close. |

---

## 18. Business model

**During the hackathon: 0% marketplace fee.** Friction is the enemy and volume is the evidence.

Afterwards, in order of defensibility:

1. **Settlement fee**, 0.5–2% on economic activity routed through Marque. Never on failed runs.
2. **Builder Pro** — conversion funnels, benchmark history, uptime alerting, listing analytics. The people who most want this are the agent builders BNB wants to retain.
3. **Enterprise / treasury** — approved-agent catalogues, org-level mandate policy, multi-signer approval, audit export. This is where mandates become genuinely valuable.
4. **Decision API** — the qualified-supply feed and conformance results, sold to wallets and protocols that want to embed *"find an agent to manage this position."*
5. **Sponsored placement**, clearly marked, **never mixed into ranking.** A sponsor can buy a labelled slot. A sponsor cannot buy a Warrant. That separation is stated publicly and is part of the brand.

The long game: Marque is not a crypto Fiverr. It is **the procurement and delegation layer for autonomous software** — the place where a buyer (human or agent) says *"here is my outcome, my budget, my risk tolerance, and the authority I will delegate,"* and something trustworthy resolves who, how much, what it may touch, how it's contained, and what it did.

---

## 19. Competitive read

| Competitor | Genuinely strong at | Structural weakness we exploit |
|---|---|---|
| **Hive** (`bnb.uphive.xyz`, timokonkwo/Hive) | Shipped early, clean light UI, 8004scan-backed, four categories named, receipts language, good taxonomy copy | **Two of its four categories are empty on its own homepage.** Five agents on the shelf. Agent-first, not position-first — no wallet-aware demand side, so no reason to return. `01/02/03` template chrome. No published test, no measured advantage, no bounded mandates. |
| **minia2a** | Real traffic (382k API requests), 300 x402 services, honest public stats, submitted Aug 7 | It is a **Base/USDC API catalogue**, not a BSC DeFi surface. Its four-category claim is a bolt-on. By its own published admission: *"no agent identity/reputation layer"*, *"transaction volume is tiny."* Zero position awareness. Will score badly on Agent Diversity as BNB defines it. |
| **Agent Mart** | Shows the four BNB categories, funded/submitted BSC jobs | Job-board framing. No evidence layer, no chain-derived position data. |
| **TermiX / agent.family** | Mature escrow, challenge windows, reputation, real volume, agents registered on BSC | They're a **sponsor**, not a rival — and their agents are supply we can index. Do not rebuild their economics. Be their front door for humans. |
| **8004scan** | The registry itself: identity, semantic search, feedback, APIs | It is an explorer, not a purchase decision. It cannot tell you whether an agent can manage *your* position. We consume it and enrich it. |
| **OKX.AI** | Mature two-sided marketplace, escrow, dual rails, evaluator economy | Generic and cross-domain. No BSC-DeFi position awareness, no protocol-native math, no bounded financial authority. Our technical depth in four narrow categories exceeds their breadth. |

The line that should be in your pitch:

> They can tell you there are 200,000 agents. Marque tells you which three can manage *this* position, what each has proved, what it may touch, and what it did.

---

## 20. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Not enough live third-party agents for four categories | **High** | Four supply channels (§6). TermiX-registered BSC agents are the sleeper pool. Reference agents guarantee the floor and are honestly labelled. |
| A reference agent is down when a judge or TermiX hires | Medium | Watchdog + PM2 restart + 60s health monitor + Telegram alert + circuit breaker returning fast honest failures. |
| BSC RPC rate-limits or degrades mid-judging | Medium | Three-provider RPC pool with failover; aggressive caching of pool/market state; `/status` shows degradation honestly rather than serving stale numbers silently. |
| 8004scan Pro key not granted in time | Medium | Apply Day 0. Anonymous tier (30 rpm) plus our own cache is survivable for a 56-filtered index. |
| Altana SDK friction burns a day | Medium | Timebox to Day 4. Testnet is explicitly acceptable; mainnet is a bonus, not a blocker. Build the Mandate UI against our own interface so the SDK is swappable. |
| Mainnet rebalance fails or loses money | Low | $25–40 cap. Simulate first. If it fails, **publish the failure** — a receipted failed run with a correct revert reason is still evidence of a real system. |
| Phase 2 introduces unpublished criteria | **High** | Design for what adoption actually needs: uptime, security posture, maintainability, a builder rail, an ops runbook, real usage. All in scope already. |
| Coding agents lose product intent over days | **High** (you've lived this) | `AGENTS.md` as constitution, read at the top of every phase; acceptance tests written as behaviour not tasks; phase checkpoints; see the separate prompt pack. |
| Scope creep kills the last two days | High | §14 is a contract. Freeze 18:00 on 8 Sep. |

---

## 21. Honest scoring, aggressively

You asked me not to inflate. Against the published rubric, if the plan ships as specified:

| Criterion | Score | Reasoning |
|---|---|---|
| Functionality | **88 / 100** | Position-first removes the dead end that will kill most entries. Loses points only where third-party agent flakiness is outside our control. |
| Data Quality | **93 / 100** | Live chain math with provenance on every number, a published test, and an honest funnel is well past "beyond basic counts." This is our strongest criterion by some distance. |
| Agent Diversity | **80 / 100** | Architecturally equal, and genuinely deeper than anyone else in each category — but Grid and Yield third-party supply will be thin no matter what we do, and reference agents are visible in those columns. The honest labelling protects us; it doesn't fully compensate. |
| **Main track, blended** | **≈87** | Enough to make the top 3 shortlist comfortably if we execute. Phase 2 then decides it. |
| **TermiX** | **≈90** | Value (cheap, fast, working), advantage (measured by construction), high-stakes (Archon-derived security agent + honest sealed-call record), marketplace quality (strong). I rate this our **most winnable prize**, and I would take it over a coin-flip on the main prize. |
| **PancakeSwap** | **≈88** | The loop, a real mainnet rebalance, the guardrails they published, and the liquidity-gap report that answers a sentence nobody else read. |
| **Altana** | **≈85** | Every listed requirement met as core UX rather than a bolt-on. Loses only if another team goes deeper on multi-agent session architecture. |

Where we lose, if we lose: **third-party supply depth in Grid Trading and Yield.** That is the number-one thing to attack with your own hands (outreach) while the bots build.

---

## 22. What I'd tell you if you only had one hour today

1. Buy the domain and point it at the VPS.
2. Submit the 8004scan Pro tier application.
3. **Fund the demo wallet and open the positions.** A tight Pancake V3 range, a small Venus borrow, some idle USDT. Nothing works without this.
4. Commit `AGENTS.md`.
5. Register on the intake form.

Then start Phase 0 from the prompt pack.

---

*Two documents accompany this one: `AGENTS.md` (the repo constitution your coding agents read at the top of every phase) and `MARQUE-BUILD-PROMPTS.md` (the paste-ready phase prompts). Read this plan once. Work from those two.*
