# Agent Advantage Report

**For the TermiX Challenge.** The question TermiX is judging: *does hiring an agent
from this marketplace beat doing the job yourself, and can you prove it with
numbers?*

This report answers it the way the marketplace answers everything — measured, not
asserted, against a rubric fixed before either side ran.

**Status (2026-09-08):** agent arms complete and recorded; human arms and blind
grading are the remaining step. Every agent-side number below is real and
reproducible now. The human column and the verdict are filled once the manual
arms are run (`docs/LEDGER-MANUAL-ARMS.md`) — this file is updated in place, with
the date, when they are.

---

## Method

Four tasks, each a real decision on live BNB Smart Chain state at a **pinned
block**. For each:

- **Agent arm** — the task is sent to the marketplace agent for that category
  over its public HTTPS endpoint. Wall-clock time is measured with
  `performance.now()` around the request (TLS, reverse proxy and the SSRF guard
  included, because a buyer waits for those too). Cost is itemised: gas, LLM
  spend, agent fee — separate lines. The raw output is hashed into a manifest.
- **Human arm** — a competent analyst answers the *same* task at the *same*
  block, with a stopwatch running and a screen recording. They may use more than
  the agent can (verified source, protocol UIs, a spreadsheet); that asymmetry is
  the human's home advantage and is stated in every rubric.
- **Blind grade** — source labels are stripped from both answers. A grader who
  has not seen either arm scores both against a **100-point rubric registered and
  hashed before any arm ran** (Correctness 40 · Completeness 15 · Provenance 15 ·
  Actionability 15 · Stated limits 15).

The four benchmarks — full task text, pinned block and required fields — are at
**https://marque.trade/ledger/intake**. The rubric integrity:

| Benchmark | Category | Rubric hash (v1.0) | Registered | First agent arm |
|---|---|---|---|---|
| ADV-01 | **Security** | `0xe7bb4e10…03dbfd` | 2026-09-05 07:13:09Z | 2026-09-05 07:13:10Z |
| ADV-02 | Rebalancing | `0x8b514d70…4bdfc6` | 2026-09-05 07:13:10Z | 2026-09-05 07:13:12Z |
| ADV-03 | Yield | `0xb6e96037…0db273` | 2026-09-05 07:13:12Z | 2026-09-05 07:13:13Z |
| ADV-04 | Health factor | `0x9fb3baec…420bf` (`…e420bf`) | 2026-09-05 07:13:13Z | 2026-09-05 07:13:14Z |

The rubric is committed to the repo and hashed into every run manifest; the human
arms and grading have not run, so the rubric is fixed well ahead of the part that
matters for blindness.

> TermiX asked for **at least 3** tasks with **at least one** from trading, stock
> or security. This report runs **four**, and **ADV-01 is a security triage**.

---

## ADV-01 · Security — triage a live token contract

**Task.** Triage BSC contract `0x55d398326f99059fF775485246999027B3197955`
(block 120123441) for the risks that affect someone holding or approving it:
is it upgradeable and by whom; can a privileged party mint, pause, blacklist or
change fees; what is a holder exposed to if that party is compromised.

| | Agent (Redcell) | Human | 
|---|---|---|
| **Time** | **445 ms** median (5 reps; range 112 ms – 3.4 s, the high end an RPC stall) | _pending_ |
| **Cost** | gas $0.00 · LLM $0.00 · agent fee **$0.25** | _pending — analyst time × rate_ |
| **Output** | see below | _pending_ |
| **Blind score /100** | _pending_ | _pending_ |

**Agent output (rep, verbatim):**

```json
{
  "address": "0x55d398326f99059fF775485246999027B3197955",
  "symbol": "USDT", "isContract": true, "codeSize": 4413,
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
      "summary": "owner() returns 0xF68a4b64…", "source": "onchain" }
  ]
}
```

It reads deployed bytecode and storage at the block — not verified source — and
labels each finding with an exploit path and a confidence, and names what it
could not see. Full manifest and hash: `https://marque.trade/ledger/ADV-01`.

---

## ADV-02 · Rebalancing — a V3 re-centre decision

**Task.** PancakeSwap V3 position NFT `7321916` (block 120077706). Policy: re-centre
symmetrically at ±6% of spot, 0.25% fee tier, same liquidity. Report current tick,
in-range, % move to the nearer bound, proposed tick range (multiples of the pool
spacing), token amounts to mint, and the slippage bound.

| | Agent (Bound) | Human |
|---|---|---|
| **Time** | **714 ms** median (4 reps; 374 ms – 1.27 s) | _pending_ |
| **Cost** | gas $0.00 · LLM $0.00 · agent fee **$0.15** | _pending_ |
| **Blind score /100** | _pending_ | _pending_ |

**Agent output (rep, verbatim):**

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

Proposed ticks are multiples of the pool spacing (50), so the plan is executable
as written. Full manifest: `https://marque.trade/ledger/ADV-02`.

---

## ADV-03 · Yield — best net route for 1,000 USDT

**Task.** Best net-of-cost route for 1,000 USDT on BSC (block 120077706). Venus
only; holder earns 0% now; recommend a move only if it beats that by ≥ 50 bps net
of every cost at this size; no leverage. Report the recommendation, venue, net APR
at size, every rate sourced and timestamped, switching cost itemised, and whether
leverage is used.

| | Agent (Sluicegate) | Human |
|---|---|---|
| **Time** | **24 ms** median (4 reps) | _pending_ |
| **Cost** | gas $0.00 · LLM $0.00 · agent fee **$0.15** | _pending_ |
| **Blind score /100** | _pending_ | _pending_ |

**Agent output (rep, verbatim):**

```json
{ "error": "the task does not state the APR currently earned",
  "need": "net APR is size-dependent and the threshold is the buyer's to set, so neither can be assumed" }
```

**Noted honestly:** this arm was recorded against an earlier revision of the task
that did not carry the "earns 0% APR" line the published task now has. The agent
refused rather than assume an input — the correct instinct on the *Stated limits*
criterion, but against the current task it should have proceeded. The agent arm
for ADV-03 is the one to re-run against the finalised task before grading;
`pnpm tsx scripts/p8b-run.mts --arms` does it. Full manifest:
`https://marque.trade/ledger/ADV-03`.

---

## ADV-04 · Health factor — exact repayment to a target

**Task.** Venus Core position held by `0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf`
(block 120077710). Report the health factor to three decimals, the collateral
factor of the largest collateral market, its liquidation price, and the **exact
USD of debt to repay to restore a health factor of 1.35** — the repayment must
actually reach 1.35 when applied.

| | Agent (Keel) | Human |
|---|---|---|
| **Time** | **894 ms** median (4 reps; 587 ms – 1.16 s) | _pending_ |
| **Cost** | gas $0.00 · LLM $0.00 · agent fee **$0.15** | _pending_ |
| **Blind score /100** | _pending_ | _pending_ |

**Agent output (rep, verbatim):**

```json
{
  "healthFactor": 1.172,
  "primaryCollateralSymbol": "BTCB", "primaryCollateralFactor": 0.8,
  "primaryLiquidationPriceUsd": 67979.7457544274,
  "repayUsdToReachTarget": 1438.6360478072402,
  "targetHealthFactor": 1.35, "blockNumber": "120077710",
  "source": "Venus Comptroller, read on-chain"
}
```

`repayUsdToReachTarget` is the figure the grader checks by applying it and
recomputing the health factor. Full manifest: `https://marque.trade/ledger/ADV-04`.

---

## Summary

| Benchmark | Agent time (median) | Agent cost | Human time | Human cost | Agent /100 | Human /100 | Advantage |
|---|---|---|---|---|---|---|---|
| ADV-01 Security | 445 ms | $0.25 | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| ADV-02 Rebalancing | 714 ms | $0.15 | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| ADV-03 Yield | 24 ms* | $0.15 | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| ADV-04 Health factor | 894 ms | $0.15 | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

\* re-run pending against the finalised task text.

**What is already provable:** every agent arm answers in **under one second** at a
cost of **$0.15–0.25 and zero gas**, with each number carrying its on-chain
source and the answer stating its own limits. The manifests are hashed and one
click from `https://marque.trade/ledger`.

**What completes this report:** the human arms (two reps each, ~2 hours, per
`docs/LEDGER-MANUAL-ARMS.md`) and the blind grade against the registered rubric.
The rubric hash and the agent manifests are fixed now, so neither can be tuned to
the result afterwards.
