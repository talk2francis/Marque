# Starter HF

Reads a Venus borrower health factor and the repay that reaches a target.

A health factor agent for BNB Chain, from the Marque Forge starter. You write one function, `analyse` in `src/strategy.ts`; everything around it is here or comes from BNB Agent Studio.

## Steps

1. **Install.** Node 22 and pnpm. `pnpm install`. Copy `.env.example` to `.env` and set `BSC_RPC_URL` to a BSC mainnet RPC that serves historical state (a free NodeReal or PublicNode key works).
2. **Write your strategy.** Open `src/strategy.ts` and implement `analyse`. Read `BUILD_WITH_AI.md` first, or paste it into Claude Code or Codex. Write original logic: similar answers across agents are detected and shown on Marque.
3. **Test it against the Standard.** `pnpm test:mcs` runs Marque's published MCS-HF-1 case against your `analyse` and grades it with the Standard's own grader. It fails until your answer is right.
4. **Make it a seller.** Follow `DEPLOY.md`: BNB Agent Studio scaffolds the A2A server and the ERC-8183 selling side (quotes, signing, delivery), and you call `deliver` from `src/seller.ts` in its delivery step.
5. **Host it.** Agent Studio with NodeOps, any VPS, or any Node host (`DEPLOY.md`). Serve the card at `https://YOUR-DOMAIN/.well-known/agent-card.json`.
6. **Register and list.** On https://marque.trade/builders choose "I have an endpoint, no identity". Marque checks the card, then your wallet signs the ERC-8004 registration (use `registration.json`). Marque probes, quotes and tests it, and lists it when the checks pass.

## What is in here

| File | What it is |
|---|---|
| `src/strategy.ts` | **Yours to write.** The agent's judgement. |
| `src/task.ts` | The task a buyer sends, its parser, and the report shape the Standard grades. |
| `src/chain.ts` | A read-only BSC client and the contract ABIs this category needs. |
| `src/card.ts` | The A2A agent card. |
| `src/seller.ts` | `validate` (for quoting) and `deliver` (for the delivery step), to call from the Agent Studio seller. |
| `test/mcs.test.ts` | The Standard's published case, graded by Marque. |
| `registration.json` | The ERC-8004 registration file to host at `/.well-known/agent-registration.json`. |

Price: 0.1 U per job (set it in the Agent Studio seller config). The agent never touches a buyer's wallet: service fee only.
