# MASTER_PROMPT.md
## Marque Phase 2: Set and Earn

Read this file first in every session. Then `AGENTS.md` (all of it, including section 13), then the spec for your lane, then the phase you were given.

---

## 1. Where we are

Marque was shortlisted in the top 3 of BNB Chain's "Smart Money Era: Build the Era" main track. Phase 2 ("Set and Earn") puts the live marketplace in front of real users, promoted by BNB Chain. A user completes the quest by hiring an agent in each of the four categories (yield, grid, rebalancing, health factor) on any shortlisted marketplace, and by building and listing one quality agent of their own. BNB verifies completion from on-chain events and from each marketplace's API. The winner is announced by 13 Nov 2026 and becomes the official BNB Agent Studio marketplace. Mainnet is required for final selection.

The three shortlisted marketplaces are featured equally. Users choose where to do the quest. **The marketplace that makes the quest easiest, clearest and most trustworthy gets the traffic, and traffic is the Phase 2 evidence.**

## 2. What Marque is after Phase 2

> **Hire BNB Chain agents that actually work. Marque tests them before you pay, holds your payment in on-chain escrow until the work is delivered, and records every hire on chain.**

Three layers, all live:

1. **The market.** Browse, compare, preview and hire agents by category. Payment goes into BNB's canonical ERC-8183 escrow from the user's own wallet. The agent delivers. The user rates it through ERC-8004. A Job Room shows every step.
2. **The verification moat.** Everything Marque already built stays: whole-registry ingest, operator dedup, live probing, the Marque Conformance Standard (MCS), Warrants, the Ledger, receipts, provenance chips, published failures. It now sits beside commerce, not in front of it.
3. **The quest and builder path.** `/quest` walks a user through all four hires, the ratings, and listing their own agent. `/me` shows progress. `/builders` turns "build an agent" into a checklist with a live test at every step.

## 3. The two axes that must never collapse

Every agent has two independent facts, shown side by side:

| Axis | Values | Source |
|---|---|---|
| **Commercial** | Hireable · Preview only · Unavailable | Live signed ERC-8183 quote from this exact service, fresh probe |
| **Quality** | Warranted (dated) · Tested, failed `field` · Untested · Retest due | MCS result for this exact service |

An agent can be Hireable and Tested-failed. That is honest and useful. What we never do: hide a hireable agent because it failed MCS, or call an agent Warranted because it is hireable. This is the Phase 2 unlock for supply: the reference-grade bar stays, the Hire button stops depending on it.

## 4. What Phase 2 must deliver (in priority order)

1. **Truth first.** Fix the probe incident (0 reachable), the 503 on `/api/v1/agents`, stale warrants, wrong prices, the hardcoded reference list. Clean the public repo.
2. **Real supply.** At least 3 hireable agents per category, target 5, with non-Marque operators wherever the registry has them. Reference agents projected from their mainnet ERC-8004 rows like everyone else.
3. **Real commerce.** Wallet-signed ERC-8183 hire on BSC mainnet: quote, create, register, budget, approve exact, fund, notify, deliver, settle, rate, refund.
4. **Real tracking.** Chain-derived Quest Index and public API: hires, deposits, completions, ratings per wallet, and agents per owner, with tx hashes.
5. **Real UX.** Kerbstone design system, a hire sheet that names every signature in plain words, a Job Room, `/quest`, `/me`, a storefront per agent, a builder checklist.
6. **Real reliability.** Durable job worker, zero-downtime deploys, load-tested, monitored, CI.

Everything in `ROADMAP.md` (agent-to-agent procurement, intent routing, x402 buyer, seller dashboard, contract intelligence, monitoring) is preserved and sequenced after launch. Do not start it before P2-12 passes.

## 5. Protocol facts you must not re-derive from memory

These were read from the BNB Agent SDK 0.6.0 source on 26 Sep. `SPEC-COMMERCE.md` has the detail. P2-00 re-measures the live values.

- Canonical contracts come from `@bnbagent/sdk/networks` `NETWORKS`. Never hand-type an address in app code.
- A buyer hire is: `createJob(provider, evaluator=router, expiredAt, description, hook=router)`, then `router.registerJob(jobId, policy)` (client only, Open only, once), then `setBudget(jobId, amount)`, then an exact `approve` if allowance is short, then `fund(jobId, amount)`. `settle(jobId)` on the router is permissionless and runs after the dispute window.
- `expiredAt` must exceed `now + disputeWindow` or the provider can never submit (`SubmissionTooLate`).
- The job `description` carries the provider's signed quote (canonical JSON from `buildJobDescription`). The seller verifies it before working. Quote lifetime is at most 900 seconds.
- Mainnet supports per-job payment tokens via `createJobWithToken` (catalog: U, USD1, USDC, USDT). Support is checked with `isPaymentTokenSupported`.
- Ratings: ERC-8004 ReputationRegistry `giveFeedback(agentId, int128 value, uint8 valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)`. No agent pre-authorisation. The contract rejects the owner or an approved operator rating their own agent.

## 6. Non-negotiables (full list in AGENTS.md section 13)

- The user's wallet signs every buyer write. Marque never holds user funds or user keys.
- Exact approvals only. Never an unlimited allowance.
- The hired provider is the provider in the signed quote for this exact service. Never substitute an agent.
- Every network label comes from the action's chain id, per surface, not from a global constant.
- The quest counts only chain-verifiable facts bound to a Marque hire intent. No seeded or synthetic quest data, ever. Team wallets are excluded.
- No displayed number is invented, estimated or hardcoded. Prices are live quotes (MEASURED) or declared (CLAIMED).
- Mainnet writes from any Marque-controlled wallet need Francis's written "approved, mainnet".
- No em dashes in any user-facing copy, README or docs.

## 7. How you work

- One phase at a time from `BUILD-PROMPTS.md`. End every phase with its CHECKPOINT block and STOP.
- Paste evidence, not claims: command output, tx hashes, screenshots, test counts.
- Degradation ladder in AGENTS.md 13.8: reduce scope to protect the phase outcome, log it in `docs/DEVIATIONS.md`, keep going. Escalate only on the hard gates.
- Three distinct hypotheses before you report a blocker.
- Lane A owns packages `commerce`, `execution`, `db` migrations, workers, API routes under `/api/v1/phase2` and `/api/v1/hire`. Lane B owns `apps/web` pages, `packages/ui`, all CSS, `packages/registry` supply work, builder routes, docs. Shared files: announce in `docs/phase2/PROJECT_STATE.md` under "Requests" before editing.

## 8. Read order

1. `MASTER_PROMPT.md` (this)
2. `AGENTS.md` sections 1 to 13
3. `docs/phase2/REQUIREMENTS-MATRIX.md`
4. Lane A: `SPEC-COMMERCE.md`, `SPEC-TRACKING.md`. Lane B: `DESIGN-SYSTEM.md`, `SPEC-COMMERCE.md` sections 1, 7 and 8
5. `docs/phase2/PROTOCOL-FACTS.md` (written by P2-00, measured values win over this pack)
6. `docs/phase2/PROJECT_STATE.md`
7. The phase prompt
