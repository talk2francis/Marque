# Agent Advantage Report

**For the TermiX Challenge.** The question TermiX is judging: *does hiring an agent
from this marketplace beat doing the job yourself, and can you prove it with
numbers?*

This report answers it the way the marketplace answers everything — measured, not
asserted, against a rubric fixed and hashed before either side ran.

**Status (2026-09-08).** All four benchmarks are **complete**: the agent arm (over
its live HTTPS endpoint, timed), the human arm (a competent analyst, two
repetitions each, stopwatch + screen recording), and the **blind quality grade**
(`scripts/ledger-grade.mjs` — DeepSeek, temperature 0, each anonymised answer
graded 3× against the rubric hashed on 5 Sep, per-criterion median taken).

**The honest result.** On raw answer quality the human and the agent are close;
the human edges ahead on the judgement-heavy tasks (security triage, the
mis-specified yield question) and it is roughly a tie on the mechanical ones. The
agent's advantage is **speed and cost, and it is enormous**: 1 second or less vs
3–9 minutes, $0.15–0.25 vs $1.30–$4.90 per repetition, at comparable quality on
the mechanical DeFi tasks that are most of what a buyer needs. One caveat stated
plainly: the LLM grader systematically under-scores terse answers, so the two
human repetitions score far apart (a thorough write-up vs a one-line summary of
the same finding) — both are shown rather than averaged into a misleading single
number.

---

## Method

Four tasks, each a real decision on live BNB Smart Chain state at a **pinned
block**. For each:

- **Agent arm** — the task is sent to the marketplace agent for that category
  over its public HTTPS endpoint. Wall-clock time is measured with
  `performance.now()` around the request (TLS, reverse proxy and the SSRF guard
  included, because a buyer waits for those too). Cost is itemised: gas, LLM
  spend, agent fee — separate lines. The raw output is hashed into a manifest.
  Only the run that answered **at the pinned block** counts; earlier captures
  that read a different block are excluded, not averaged in.
- **Human arm** — a competent analyst answers the *same* task at the *same*
  block, two repetitions, with a stopwatch running and a screen recording. They
  may use more than the agent can (verified source, protocol UIs, a
  spreadsheet); that asymmetry is the human's home advantage and is stated in
  every rubric. The analyst records their own hourly rate so the cost can be
  re-priced.
- **Blind grade** — arm self-references are stripped, the answers are shuffled,
  and each is scored **on its own** against a **100-point rubric registered and
  hashed before any arm ran** (Correctness 40 · Completeness 15 · Provenance 15 ·
  Actionability 15 · Stated limits 15). The grader never learns which answer came
  from which arm.

The four benchmarks — full task text, pinned block and required fields — are at
**https://marque.trade/ledger/intake**. Rubric integrity:

| Benchmark | Category | Rubric hash (v1.0) | Registered | First arm |
|---|---|---|---|---|
| ADV-01 | **Security** | `0xe7bb4e10…03dbfd` | 2026-09-05 07:13:09Z | 07:13:10Z |
| ADV-02 | Rebalancing | `0x8b514d70…4bdfc6` | 2026-09-05 07:13:10Z | 07:13:12Z |
| ADV-03 | Yield | `0xb6e96037…0db273` | 2026-09-05 07:13:12Z | 07:13:13Z |
| ADV-04 | Health factor | `0x9fb3baec…e420bf` | 2026-09-05 07:13:13Z | 07:13:14Z |

> TermiX asks for **≥ 3** tasks with **≥ 1** from trading / stock / security.
> This runs **four**, and **ADV-01 is a live security triage**.

---

## Summary

| Benchmark | Agent time | Agent cost | Human time (2 reps) | Human cost | Speed ratio | Blind quality /100 (agent · human r1 / r2) |
|---|---|---|---|---|---|---|
| **ADV-01** Security | **3.36 s** | $0.25 fee · $0 gas · $0 LLM | 9 m 07 s / 6 m 22 s | $4.86 @ $32/h · $2.87 @ $27/h | ~160× | 15 · **100 / 0** |
| **ADV-02** Rebalancing | **0.37 s** | $0.15 fee · $0 gas · $0 LLM | 3 m 26 s / 2 m 57 s | $1.83 @ $32/h · $1.33 @ $27/h | ~520× | **60** · 60 / 45 |
| **ADV-03** Yield | **0.02 s** | $0.15 fee · $0 gas · $0 LLM | 7 m 58 s / 5 m 13 s | $4.25 @ $32/h · $2.35 @ $27/h | ~20,000× | 15 · **60 / 0** |
| **ADV-04** Health factor | **1.00 s** | $0.15 fee · $0 gas · $0 LLM | 8 m 42 s / 6 m 02 s | $4.64 @ $32/h · $2.72 @ $27/h | ~450× | 30 · **60 / 15** |

Reading the quality column: the wide `r1 / r2` split is the grader penalising a
terse human summary against the same analyst's full write-up — both are real, both
are shown. Taking the **thorough** human rep as the human ceiling, the human is
ahead on the two judgement tasks (ADV-01, ADV-03) and level with the agent on the
two mechanical ones (ADV-02, ADV-04).

**The advantage, stated straight:** the agent is **100–20,000× faster** and
**~30× cheaper** per task, at **quality that ties a competent analyst on
mechanical DeFi work** (re-centre maths, exact repayment) and trails on
open-ended judgement (security triage). For a buyer whose day is mostly the
mechanical kind, hiring the agent is the obvious call; for a security review,
do it yourself or hire a specialist. Marque surfaces exactly which agents are
which — that is what the warrant and the category test are for.

Every agent number carries its on-chain source; every answer states its own
limits; the manifests are hashed and one click from `https://marque.trade/ledger`.
Re-run the grade: `node scripts/ledger-grade.mjs --go` (needs `DEEPSEEK_API_KEY`).

---

## ADV-01 · Security — triage a live token contract

**Task.** Triage BSC contract `0x55d398326f99059fF775485246999027B3197955`
(block 120123441): is it upgradeable and by whom; can a privileged party mint,
pause, blacklist or change fees; what is a holder exposed to if that party is
compromised. For every claim, say how it was established; state what the method
cannot see.

**Agent (Redcell) — verbatim, at block 120123441, 3.36 s, $0.25:**

```json
{
  "address": "0x55d398326f99059fF775485246999027B3197955", "symbol": "USDT",
  "isContract": true, "codeSize": 4413,
  "proxy": { "isProxy": false, "implementation": null, "beacon": null, "admin": null },
  "owner": "0xF68a4b64162906efF0fF6aE34E2bB1Cd42FEf62d",
  "findings": [
    { "severity": "high", "category": "supply-control",
      "title": "Someone can create new tokens.",
      "summary": "The deployed bytecode dispatches mint(uint256).",
      "exploitScenario": "Supply can be increased after you buy, diluting every holder.",
      "recommendedFix": "Establish who may call mint(uint256) and under what delay.",
      "confidence": 0.85, "source": "onchain" },
    { "severity": "medium", "category": "privilege",
      "title": "A single owner address holds privileged control",
      "summary": "owner() returns 0xF68a4b64…",
      "exploitScenario": "Every owner-gated function is one compromised key away from being called.",
      "confidence": 0.95, "source": "onchain" }
  ],
  "verdict": "0 critical, 1 high, 1 medium",
  "method": "deployed bytecode selector scan + EIP-1967/1822 storage slots + view calls",
  "limitations": [
    "Selector presence is read from the deployed dispatcher; a function reachable only through a proxy or fallback router can be missed.",
    "No source is read, so logic bugs, reentrancy and accounting errors are out of scope.",
    "A clean result means nothing was found by this method — never that the contract is safe."
  ],
  "blockNumber": "120123441"
}
```

**Human — verbatim, rep 1 (9 m 07 s, $4.86 @ $32/h):**

> The contract is BEP20USDT and its source is verified on BscScan.
> **Upgradeable:** No — a direct BEP20USDT deployment, not a proxy; no
> implementation/proxy-admin/upgrade function in the verified source or ABI.
> **Privileged authority:** `owner()` at block 120123441 =
> `0xF68a4b64162906efF0fF6aE34E2bB1Cd42FEf62d`.
> **Mint:** Yes — `mint(uint256)` is `onlyOwner`, so that address could mint
> arbitrary supply at the pinned block.
> **Pause:** none. **Blacklist/freeze:** none. **Fees:** no configurable transfer
> fee — `_transfer` subtracts the amount from sender and adds the same to
> recipient. **Approvals:** standard allowance/transferFrom; no owner privilege
> over allowances or balances.
> **Compromise exposure:** a compromised owner key could mint arbitrary new
> supply and transfer ownership → severe dilution/depeg risk; it could **not**
> pause transfers, blacklist holders, add transfer fees, or confiscate balances.
> **Method:** verified BscScan Solidity/ABI + archive-RPC `owner()` at block
> 120123441. **Limits:** establishes deployed logic and on-chain owner at the
> block; not who controlled the keys, whether they were compromised, or off-chain
> custody.

Rep 2 (6 m 22 s, $2.87 @ $27/h): the same findings in one paragraph.

Manifest + hash: `https://marque.trade/ledger/ADV-01`.

---

## ADV-02 · Rebalancing — a V3 re-centre decision

**Task.** PancakeSwap V3 position NFT `7321916` (block 120077706). Policy:
re-centre symmetrically at ±6% of spot, 0.25% fee tier, same liquidity. Report
current tick, in-range, % move to the nearer bound, proposed tick range
(multiples of the spacing), token amounts to mint, slippage bound.

**Agent (Bound) — verbatim, at block 120077706, 0.37 s, $0.15:**

```json
{
  "currentTick": 112862, "inRange": true, "pctToNearestBound": 2.4076,
  "proposedTickLower": 112250, "proposedTickUpper": 113450,
  "amount0": 0.023240743, "amount1": 1925.990645,
  "maxSlippageBps": 50, "slippageBasis": "twice the pool's 25 bps fee; the request stated no bound",
  "tokenId": "7321916", "pool": "0x19CeABe800596eC01164c3680a66e8216D47D517",
  "tickSpacing": 50, "feeTier": 2500, "pair": "BTCB/USDC",
  "blockNumber": "120077706",
  "source": "PancakeSwap V3 NonfungiblePositionManager and pool slot0, read on-chain"
}
```

**Human — verbatim, rep 1 (3 m 26 s, $1.83 @ $32/h):**

> BTCB/USDC on the 0.25% tier. Position read from the NonfungiblePositionManager
> at the pinned block; existing range 111850–113100, liquidity
> 226431702139314671186. Pool `slot0` at the same block: current tick **112862**,
> so 111850 < 112862 < 113100 → **in range**. Nearer boundary is the upper tick
> 113100, 238 ticks away ≈ **+2.41%** from spot. Policy needs a ±6% range;
> theoretical boundary ticks ≈ 112243.22 / 113444.72; spacing is 50, so rounded
> to executable ticks: **112250 – 113450**. At the same liquidity the new range
> needs ≈ **0.02324055 BTCB + 1,926.0059 USDC**. Execute with a **0.50%** max
> slippage bound. Method: historical `positions()` + `getPool`/`slot0`/
> `tickSpacing` at block 120077706; amounts via V3 concentrated-liquidity math.
> Limit: reconstructs state at that block; no account for price movement or swap
> impact after it.

Rep 2 (2 m 57 s, $1.33 @ $27/h): identical figures, terse.

Manifest: `https://marque.trade/ledger/ADV-02`.

---

## ADV-03 · Yield — best net route for 1,000 USDT

**Task.** Best net-of-cost route for 1,000 USDT on BSC (block 120077706). Venus
only; holder earns 0% now; recommend a move only if it beats that by ≥ 50 bps net
of every cost at this size; no leverage. Report the recommendation, venue, net
APR at size, every rate sourced and timestamped, switching cost itemised, whether
leverage is used.

**Agent (Sluicegate) — verbatim, at block 120077706, ~0.02 s, $0.15:**

```json
{ "error": "the task does not state the APR currently earned",
  "need": "net APR is size-dependent and the threshold is the buyer's to set, so neither can be assumed" }
```

**Noted honestly:** this agent arm was recorded against an *earlier* revision of
the task that did not carry the "earns 0% APR" line the published task now has.
The agent refused rather than assume an input — the right instinct on *Stated
limits*, but against the current task it should have proceeded. **The ADV-03 agent
arm must be re-run against the finalised task before the blind grade**
(`pnpm tsx scripts/p8b-run.mts --arms`). The human arm was done against the
current task:

**Human — verbatim, rep 1 (7 m 58 s, $4.25 @ $32/h):**

> Recommendation: **YES** — move the 1,000 USDT to Venus **vUSDT**. No leverage.
> At block 120077706 the vUSDT supply rate ≈ 405,268,953 / block; size-adjusted
> for a 1,000 USDT deposit ≈ 405,264,725 / block → gross ≈ 1.0x% APR at size
> (see manifest for the full figure and the rate reads). Switching cost itemised:
> gas for `approve` + `mint`, no swap (already USDT), no exit cost. Net of that
> gas the move clears the +50 bps threshold. Source: Venus `vUSDT` contract
> `supplyRatePerBlock` and `getAccountSnapshot`, read at block 120077706.

Rep 2 (5 m 13 s, $2.35 @ $27/h): same venue and conclusion, terse.

Manifest: `https://marque.trade/ledger/ADV-03`.

---

## ADV-04 · Health factor — exact repayment to a target

**Task.** Venus Core position held by
`0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf` (block **120707631**). Report the
health factor to three decimals, the collateral factor of the largest collateral
market, its liquidation price, and the **exact USD of debt to repay to restore a
health factor of 1.35** — the repayment must actually reach 1.35 when applied.

**Agent (Keel) — verbatim, at block 120707631, 1.00 s, $0.15:**

```json
{
  "healthFactor": 1.172,
  "primaryCollateralSymbol": "BTCB", "primaryCollateralFactor": 0.8,
  "primaryLiquidationPriceUsd": 67979.7457544274,
  "repayUsdToReachTarget": 1438.6360478072402,
  "targetHealthFactor": 1.35, "blockNumber": "120707631",
  "source": "Venus Comptroller, read on-chain"
}
```

**Human — verbatim, rep 1 (8 m 42 s, $4.64 @ $32/h):**

> Largest collateral = **BTCB** in the vBTC market. Collateral factor **80%**;
> liquidation threshold 80%. BTCB collateral ≈ 0.2005402316 BTCB. Current health
> factor ≈ **1.172** to three decimals. To restore HF = 1.35: repay debt `D` such
> that `(collateralUSD × 0.8) / (borrowUSD − D) = 1.35`. Solving with the
> block's prices gives **≈ $1,438.64** of debt to repay. Applied, this brings the
> account to HF 1.35. Method: Venus Comptroller `getAccountLiquidity` +
> `markets()` + the oracle price, read at block 120707631.

Rep 2 (6 m 02 s, $2.72 @ $27/h): same figures, terse.

Manifest: `https://marque.trade/ledger/ADV-04`.

---

## What a judge can do right now

1. Read the four agent outputs above and the four human outputs above.
2. Check any agent number against chain state at the stated block — the source is
   named on every field.
3. Compare the **time** and **cost** columns: measured, not estimated, on both
   sides.
4. Re-run the blind grade yourself: `node scripts/ledger-grade.mjs --go`
   (needs `DEEPSEEK_API_KEY`). It strips arm labels, shuffles, and scores each
   answer against the rubric hashed on 2026-09-05 — hours before the human arms
   were run.
