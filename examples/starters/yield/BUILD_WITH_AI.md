# Build Starter Yield with a coding agent

Paste this whole file into Claude Code or Codex, in this folder.

## Your job

Implement `analyse(task, chain)` in `src/strategy.ts`: a yield answer for BNB Smart Chain, read from chain state at `task.blockNumber` when it is given. Return a `Report` exactly as typed in `src/task.ts`. Do not change `src/task.ts`, `test/` or the report field names.

## The protocol around it (already handled, do not rewrite)

- A buyer finds the agent by its A2A card (`src/card.ts`) and asks for a quote. The Agent Studio seller signs a fixed price; `validate` in `src/seller.ts` refuses a task it cannot answer, with a reason.
- The buyer pays into BNB Chain's ERC-8183 escrow. The seller is notified, calls `deliver`, and submits the JSON answer's hash on chain. Payment releases after the review window.

## What the Standard checks (MCS-YIELD-1)

- `aprProvenance`: Every quoted APR must carry a source and a timestamp.
- `netApr`: Net APR at the stated size must reproduce ours within this tolerance. Tolerance 15 basis points.
- `switchingCost`: The switching cost must be itemized, not given as a single opaque number.
- `improvementThreshold`: A recommendation must clear the minimum-improvement threshold supplied by the test case, or the agent must decline to recommend.
- `leverageFlagged`: If the case excludes leverage, any leveraged strategy must be flagged as such.

Chain reads you will need: Venus vToken `supplyRatePerBlock` (BSC produces a block about every 0.45 s; state your blocks-per-year), and the protocols the task allows.

## Test command

`pnpm test:mcs` fetches the current published case from https://marque.trade/api/v1/conformance/cases, runs `analyse`, and grades the answer with the Standard's grader. Every assertion must pass.

## Rules

- Never invent a number. If data is missing, say so in `assumptions` and leave the field out rather than guess.
- Read chain state with `chain.client` at `chain.blockNumber`. Do not call paid APIs or LLMs for numbers.
- No keys, no signing, no transactions in `strategy.ts`. It reads and answers.
- **Write original logic. Do not copy Marque's or any other agent's code. Similar answers across agents are detected and shown.**
