# Marque Conformance Standard: MCS v1.0.0

> Generated 2026-11-06T07:44:08.516Z from `packages/conformance/src/tolerances.ts`.
> Do not edit by hand: regenerate with `pnpm standard`.
> Tolerance revision 1.

## What this standard is, and what it refuses to be

MCS tests **facts and compliance**. It does not test judgement.

A conformance check may only assert something with exactly one right answer:
arithmetic, on-chain state, legality against a pool’s own parameters, or compliance
with a policy **that the test case itself supplies**. If a check cannot be written as
an assertion with a numeric tolerance, it is not a conformance check.

This matters most where it is least convenient. There is no objectively correct
PancakeSwap V3 range in the abstract, so MCS-REB-1 does not pretend to know one:
the case supplies a policy; *"re-centre symmetrically at ±6% around spot"*; and the
test checks whether the agent’s answer is arithmetically correct, legal for the pool,
and compliant with the instruction it was given. Whether ±6% was a *wise* policy is
a question about judgement, and it is measured in the Ledger against a pre-registered
rubric, never as a pass/fail certificate.

**No LLM grades a conformance test.** Every check in this document is executed by
deterministic code against numbers we computed ourselves from chain state.

A pass is dated and can go stale. Results are re-run nightly.

## How a test is run

1. A **case** is materialised: a real BNB Smart Chain position at a fixed block, plus
   the policy the agent must comply with.
2. **We compute the ground truth ourselves** from chain state, using the same readers
   that power the rest of the product.
3. The agent is asked the same question, and its structured answer is diffed field by
   field against our ground truth using the tolerances below.
4. The result; pass or fail, with every field diff, the raw request and the raw
   response, both hashed; is written to the public record.

Ground truth is **frozen at capture**. BNB Smart Chain public RPC nodes retain only
about 64 blocks of state (roughly 30 seconds at 0.45s blocks), so a case cannot be
re-derived from a pinned block later without an archive node. Freezing is also
stronger than re-reading: every agent is graded against byte-identical inputs. The
block number and a hash of the frozen snapshot are published with every result, so
anyone with archive access can verify the snapshot against the chain itself.
Reference agents are tested against newly captured cases one at a time; the
latest snapshot below is an example, not a shared block for every agent.

An agent that cannot be reached **fails**. "We asked and it did not answer" is a
conformance outcome and belongs in the public record.

## MCS-REB-1: Rebalancing

**Reader:** PancakeSwap V3 NonfungiblePositionManager + pool slot0
**Category:** `rebalancing`

**Live case:** `REB-1-twt-wbnb-2500`

*Subject:* owner `0x7f2f4173d9A6EFA1F987d48983b3244bBcCa67D5` · tokenId `7683201` · pair `TWT/WBNB`

*Why this subject:* A third-party TWT/WBNB position on PancakeSwap V3’s 0.25% tier, observed with nonzero liquidity at BSC block 131043602 on 1 November 2026. Its owner and NFT were selected from chain liquidity events before testing the agent. The former BNCB/WBNB primary (#7650656) and both old fallback positions had zero liquidity at block 131042505; their historical cases and results remain stored. Two newly observed positions with different owners are added ahead of the retained old fallback roster. Ownership and liquidity are read again at every fresh capture; if none survives, no passing result is invented. The policy, arithmetic assertions and tolerances are unchanged. The fixture measures V3 arithmetic, not the investment merits of its tokens.

*Policy supplied to the agent:* "re-centre the position symmetrically at ±6% around the current spot price, on the 0.25% fee tier, keeping the same liquidity"

*Latest captured example:* case `REB-1-twt-wbnb-2500-bound-20261105195925070-269560cf` · block `131876922` · ground-truth hash `0x02e1050aed0cb4646ca2aaf20aa69500180364abefbfefdfaa5c7e028f4acbbb`
*Actual subject in that snapshot:* pair `TWT/WBNB` · owner `0x7f2f4173d9A6EFA1F987d48983b3244bBcCa67D5` · tokenId `7683201`

| Check | Bound | What is asserted |
|---|---|---|
| `currentTick` | ±0 ticks | Reported current tick must equal the pool tick at the pinned block, exactly. |
| `proposedTickSpacing` | must hold (boolean) | Every proposed tick must be an exact multiple of the pool’s tickSpacing. |
| `policyRange` | ±1 tick spacings | Proposed bounds must match the range implied by the policy SUPPLIED IN THE TEST CASE, within one tick spacing. |
| `amounts` | ±0.5 % | Proposed token amounts must satisfy the V3 liquidity formula within this tolerance. |
| `inRange` | must hold (boolean) | The in-range boolean must match the chain. |
| `distanceToBound` | ±0.5 percentage points | Distance to the nearest bound, in price terms. |
| `slippageBound` | must hold (boolean) | A slippage bound must be stated, as a positive number. |

**Why these bounds**

- **`currentTick`**; The tick is a single integer read from slot0 at a fixed block. There is no ambiguity and therefore no tolerance.
- **`proposedTickSpacing`**; The pool contract reverts on a tick that is not a multiple of its spacing, so a plan that violates this is not merely suboptimal, it is unexecutable. This is the single highest-signal check in the set and the most common failure in naive agents.
- **`policyRange`**; There is no objectively correct V3 range in the abstract, so the case supplies the policy and we check compliance with it. One spacing of slack is the minimum the pool’s own granularity permits: the ideal tick is rarely itself a valid multiple.
- **`amounts`**; The formula is exact, but agents legitimately round for slippage and gas. 0.5% admits sane rounding while rejecting an agent that has not actually run the maths.
- **`inRange`**; Derived from tickLower <= tick < tickUpper. One right answer.
- **`distanceToBound`**; Derived arithmetic from the tick and the two bounds. The half-point band absorbs differences in rounding convention, not differences in method.
- **`slippageBound`**; An execution plan with no slippage bound is unsafe to sign regardless of how good its range is. We check only that a bound is stated, never whether the chosen value was wise; that is a Ledger question.

## MCS-GRID-1: Grid Trading

**Reader:** spot balances + pair price
**Category:** `grid`

**Live case:** `GRID-1-bnb-usdt`

*Subject:* address `0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf` · pair `BNB/USDT`

*Why this subject:* Bounds and a stop that are close enough together that a careless plan places levels below the stop, and a level count that makes fee drag material rather than a rounding error.

*Policy supplied to the agent:* "build a 12-level grid for BNB/USDT between 600 and 850 using 2,000 USD of capital, with a stop at 580, and disclose the fee drag at 25 bps per trade"

*Latest captured example:* case `GRID-1-bnb-usdt-lattice-20261105195925070-269560cf` · block `131876929` · ground-truth hash `0x1f6ae5e1e722542d6a20d0e80fb3666ed6e1bccf217200f7c2d7d93bf08946b8`
*Actual subject in that snapshot:* pair `BNB/USDT` · address `0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf`

| Check | Bound | What is asserted |
|---|---|---|
| `levelSpacing` | ±0.5 % | Level spacing must match the declared spacing type (arithmetic or geometric). |
| `allocationSum` | ±0.1 % | Summed level allocations must not exceed the stated capital. |
| `levelsWithinBounds` | must hold (boolean) | Every level must lie inside the bounds supplied by the test case. |
| `levelsAboveStop` | must hold (boolean) | No level may sit below the stop supplied by the test case. |
| `feeDragDisclosed` | must hold (boolean) | The plan must disclose fee drag: n levels implies n round-trips of fees, stated as a number. |

**Why these bounds**

- **`levelSpacing`**; The agent declares which type it used; we then verify the levels actually follow it. Declaring geometric and shipping arithmetic is a factual error, not a matter of taste.
- **`allocationSum`**; Spending more than the capital supplied is unexecutable. The 0.1% band covers floating-point summation, nothing more.
- **`levelsWithinBounds`**; Compliance with a constraint the case supplied. One right answer.
- **`levelsAboveStop`**; A level below the stop would be filled and then immediately stopped out.
- **`feeDragDisclosed`**; A grid plan that omits fee drag overstates its own return, and the omission is invisible to the buyer. We check disclosure only; whether the drag is acceptable is the buyer’s call.

## MCS-YIELD-1: Yield Optimisation

**Reader:** Venus Core markets
**Category:** `yield`

**Live case:** `YIELD-1-usdt-1000`

*Subject:* asset `USDT`

*Why this subject:* Idle stablecoins are the most common real position on BSC. The 50 bps threshold and the 1,000 USD size make the net-of-cost arithmetic decide the answer, which is exactly the thing agents get wrong by quoting gross APR.

*Policy supplied to the agent:* "find the best net-of-cost route for 1,000 USD of USDT across the allowed protocols, only recommending a move that beats the current 0% by at least 50 bps, and excluding leveraged strategies"

*Latest captured example:* case `YIELD-1-usdt-1000-sluicegate-20261105195925070-269560cf` · block `131876931` · ground-truth hash `0x761e4ef538f8bfe98700c8dfbc303ec9869fa234b485bb3105da72121ab52509`
*Actual subject in that snapshot:* asset `USDT`

| Check | Bound | What is asserted |
|---|---|---|
| `aprProvenance` | must hold (boolean) | Every quoted APR must carry a source and a timestamp. |
| `netApr` | ±15 basis points | Net APR at the stated size must reproduce ours within this tolerance. |
| `switchingCost` | must hold (boolean) | The switching cost must be itemized, not given as a single opaque number. |
| `improvementThreshold` | must hold (boolean) | A recommendation must clear the minimum-improvement threshold supplied by the test case, or the agent must decline to recommend. |
| `leverageFlagged` | must hold (boolean) | If the case excludes leverage, any leveraged strategy must be flagged as such. |

**Why these bounds**

- **`aprProvenance`**; An APR with no source and no timestamp cannot be checked by anyone, including the buyer. This is the yield-category equivalent of a provenance chip.
- **`netApr`**; Both sides compute from the same on-chain rates at the same block, so the only legitimate divergence is gas and compounding convention. 15bps is generous for that and far tighter than the differences between real venues.
- **`switchingCost`**; Gas, swap and exit costs behave differently with size. A lump sum hides which one dominates at the buyer’s size.
- **`improvementThreshold`**; Compliance with a supplied constraint. Declining is a pass: an agent that correctly says "nothing beats your current position by enough" is behaving well.
- **`leverageFlagged`**; Presenting a looped position as a plain deposit misstates the risk the buyer is taking.

## MCS-HF-1: Health Factor

**Reader:** Venus Comptroller
**Category:** `health_factor`

**Live case:** `HF-1-venus-at-risk`

*Subject:* address `0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf`

*Why this subject:* A genuinely at-risk third-party Venus account carrying real debt across multiple collateral markets. Chosen precisely because it is not ours: it proves the reader works on arbitrary input, and AGENTS.md forbids manufacturing our own liquidation risk for a demo.

*Policy supplied to the agent:* "report the account’s current health factor and the exact USD of debt that must be repaid to restore a health factor of 2.5"

*Latest captured example:* case `HF-1-venus-at-risk-keel-20261105195925070-269560cf` · block `131876946` · ground-truth hash `0xce8716a9651d0b53789b3b12db9ddf75e2629b05784a65370afc5166e069e53e`
*Actual subject in that snapshot:* address `0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf`

| Check | Bound | What is asserted |
|---|---|---|
| `healthFactor` | ±0.005 HF | Reported health factor must match ours to three decimal places. |
| `collateralFactor` | ±0.001 fraction | Per-market collateral factor must match the Comptroller. |
| `repayToTarget` | ±0.005 HF | The repay amount must, when applied, restore the target health factor within this tolerance. |
| `liquidationPrice` | ±1 % | Per-asset liquidation price must match ours within this tolerance. |

**Why these bounds**

- **`healthFactor`**; Both sides read the same Comptroller state at the same block, so this is pure arithmetic. 0.005 is half of the third decimal place; tight enough that an agent using the wrong collateral factor fails, loose enough to survive rounding.
- **`collateralFactor`**; Read directly from markets(vToken). Getting this wrong is what makes an HF wrong.
- **`repayToTarget`**; Checked by APPLYING the agent’s number to the snapshot and recomputing, not by comparing to ours. An agent that reaches the target by a different but valid route passes.
- **`liquidationPrice`**; A closed-form function of collateral, debt and collateral factors. One percent admits oracle rounding, not method error.

## MCS-RYIELD-1: Realised Yield

**Reader:** Venus vToken exchangeRateStored at two archived blocks, with their timestamps
**Category:** `yield`

**Live case:** `RYIELD-1-usdt-7d`

*Subject:* asset `USDT`

*Why this subject:* A quoted rate is a promise about the next block; a realised rate is a fact about the last week. Seven days of Venus USDT supply is the most common question a stablecoin holder asks, and two archived exchange-rate reads at supplied blocks give it exactly one right answer.

*Policy supplied to the agent:* "measure what each Venus USDT supply market actually paid between the two supplied blocks, from its exchange-rate growth, and recommend a venue only if the numbers in your own ranking support it"

*Latest captured example:* case `RYIELD-1-usdt-7d-tidemark-20261105195925070-269560cf` · block `131876957` · ground-truth hash `0xcdc876c127cc5d7c36ff68ecc68d993636a5dbd7104bc6478a1b1084551c821f`
*Actual subject in that snapshot:* asset `USDT`

| Check | Bound | What is asserted |
|---|---|---|
| `window` | ±0 blocks | The measurement window must be exactly the two blocks the test case supplies. |
| `realisedApr` | ±1 basis points | Each venue's realised APR must reproduce ours within this tolerance: the growth of its on-chain exchange rate between the two blocks, annualised over the true time between them (simple, not compounded). |
| `netNotAboveGross` | must hold (boolean) | A venue's realised APR net of switching cost may not exceed its realised APR. |
| `realisedSource` | must hold (boolean) | Every realised figure must name the on-chain read it came from. |
| `decision` | must hold (boolean) | The answer must state recommend explicitly, and a recommended venue must be the one with the highest net realised APR in the answer's own ranking. |

**Why these bounds**

- **`window`**; Realised yield is a fact about a stated interval. Answering for a different interval answers a different question, so the blocks must match exactly.
- **`realisedApr`**; Both sides read the same exchange rates and block timestamps, so the only legitimate divergence is rounding of the reported figure. One basis point admits four-decimal rounding and nothing more.
- **`netNotAboveGross`**; A cost can only lower a return. A net figure above the gross one is an arithmetic error.
- **`realisedSource`**; A realised rate is checkable only if the buyer can see which contract and which reads produced it.
- **`decision`**; Internal consistency, not judgement: the test does not say which venue is wise, only that a recommendation agrees with the numbers the agent itself reported.

## Deliberately not tested

A standard is defined as much by what it refuses to grade as by what it grades.
Each of these was considered and excluded, because grading it would make the
standard quietly non-deterministic.

| Excluded check | Test | Why it is excluded |
|---|---|---|
| Expected number of fills at a stated volatility | MCS-GRID-1 | A model output wearing the clothes of a fact. Two honest agents can differ and both be right, so grading it would make the standard quietly non-deterministic. Moved to the Ledger. |
| Whether the chosen range is the wisest available | MCS-REB-1 | There is no objectively correct V3 range in the abstract. The test case supplies a policy and we check compliance with it; the quality of the policy is a Ledger question. |
| Whether the recommended venue is the best one | MCS-YIELD-1 | Judgement. We check that the arithmetic is right, the sources are cited and the supplied threshold is respected; not that the choice was optimal. |
| Speed, price and helpfulness of the response | MCS-HF-1 | Measured and published, but in the Ledger against a pre-registered rubric, never as a pass/fail certificate. |

These are not ignored; they are measured in the Ledger, against a rubric that is
version-hashed and published before any run, and reported as a score rather than as
a certificate.

## Versioning

This is MCS v1.0.0, tolerance revision 1. Every result row records the
version and revision it was graded under, so a tightened tolerance never silently
invalidates or flatters an older result.
