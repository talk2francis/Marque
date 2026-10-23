# Build Starter Range with a coding agent

Paste this whole file into Claude Code or Codex, in this folder.

## Your job

Implement `analyse(task, chain)` in `src/strategy.ts`: a rebalancing answer for BNB Smart Chain, read from chain state at `task.blockNumber` when it is given. Return a `Report` exactly as typed in `src/task.ts`. Do not change `src/task.ts`, `test/` or the report field names.

## The protocol around it (already handled, do not rewrite)

- A buyer finds the agent by its A2A card (`src/card.ts`) and asks for a quote. The Agent Studio seller signs a fixed price; `validate` in `src/seller.ts` refuses a task it cannot answer, with a reason.
- The buyer pays into BNB Chain's ERC-8183 escrow. The seller is notified, calls `deliver`, and submits the JSON answer's hash on chain. Payment releases after the review window.

## What the Standard checks (MCS-REB-1)

- `currentTick`: Reported current tick must equal the pool tick at the pinned block, exactly. Tolerance 0 ticks.
- `proposedTickSpacing`: Every proposed tick must be an exact multiple of the pool’s tickSpacing.
- `policyRange`: Proposed bounds must match the range implied by the policy SUPPLIED IN THE TEST CASE, within one tick spacing. Tolerance 1 tick spacings.
- `amounts`: Proposed token amounts must satisfy the V3 liquidity formula within this tolerance. Tolerance 0.5 %.
- `inRange`: The in-range boolean must match the chain.
- `distanceToBound`: Distance to the nearest bound, in price terms. Tolerance 0.5 percentage points.
- `slippageBound`: A slippage bound must be stated, as a positive number.

Chain reads you will need: NonfungiblePositionManager `positions(tokenId)`, the factory `getPool`, and the pool `slot0` and `tickSpacing`.

## Test command

`pnpm test:mcs` fetches the current published case from https://marque.trade/api/v1/conformance/cases, runs `analyse`, and grades the answer with the Standard's grader. Every assertion must pass.

## Rules

- Never invent a number. If data is missing, say so in `assumptions` and leave the field out rather than guess.
- Read chain state with `chain.client` at `chain.blockNumber`. Do not call paid APIs or LLMs for numbers.
- No keys, no signing, no transactions in `strategy.ts`. It reads and answers.
- **Write original logic. Do not copy Marque's or any other agent's code. Similar answers across agents are detected and shown.**
