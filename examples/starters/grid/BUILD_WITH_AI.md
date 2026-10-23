# Build Starter Grid with a coding agent

Paste this whole file into Claude Code or Codex, in this folder.

## Your job

Implement `analyse(task, chain)` in `src/strategy.ts`: a grid trading answer for BNB Smart Chain, read from chain state at `task.blockNumber` when it is given. Return a `Report` exactly as typed in `src/task.ts`. Do not change `src/task.ts`, `test/` or the report field names.

## The protocol around it (already handled, do not rewrite)

- A buyer finds the agent by its A2A card (`src/card.ts`) and asks for a quote. The Agent Studio seller signs a fixed price; `validate` in `src/seller.ts` refuses a task it cannot answer, with a reason.
- The buyer pays into BNB Chain's ERC-8183 escrow. The seller is notified, calls `deliver`, and submits the JSON answer's hash on chain. Payment releases after the review window.

## What the Standard checks (MCS-GRID-1)

- `levelSpacing`: Level spacing must match the declared spacing type (arithmetic or geometric). Tolerance 0.5 %.
- `allocationSum`: Summed level allocations must not exceed the stated capital. Tolerance 0.1 %.
- `levelsWithinBounds`: Every level must lie inside the bounds supplied by the test case.
- `levelsAboveStop`: No level may sit below the stop supplied by the test case.
- `feeDragDisclosed`: The plan must disclose fee drag: n levels implies n round-trips of fees, stated as a number.

Chain reads you will need: The pair's spot price from a PancakeSwap V3 pool `slot0`, read at the block; levels are arithmetic, no chain read is needed for them.

## Test command

`pnpm test:mcs` fetches the current published case from https://marque.trade/api/v1/conformance/cases, runs `analyse`, and grades the answer with the Standard's grader. Every assertion must pass.

## Rules

- Never invent a number. If data is missing, say so in `assumptions` and leave the field out rather than guess.
- Read chain state with `chain.client` at `chain.blockNumber`. Do not call paid APIs or LLMs for numbers.
- No keys, no signing, no transactions in `strategy.ts`. It reads and answers.
- **Write original logic. Do not copy Marque's or any other agent's code. Similar answers across agents are detected and shown.**
