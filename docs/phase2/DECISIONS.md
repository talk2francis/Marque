# DECISIONS.md
## Marque Phase 2 decisions, with reasons

Each decision is binding for the coding agents until Francis changes it here.

---

## D1. Launch on BSC mainnet, validated on testnet the same day

Final selection requires mainnet. Quest users hold real USDT and BNB, not test U, and testnet adds a faucet step that loses people. Real mainnet jobs are also the "real-world usage" evidence. Testnet stays as staging and as ladder rung 3. ChatGPT proposed testnet for the deadline and mainnet later; that plans a migration during the campaign, which is the riskiest possible time to migrate.

## D2. BNB's canonical ERC-8183 and ERC-8004 contracts, no Marque escrow

Marque orchestrates, BNB's contracts hold the money, the user's wallet signs. No custody, no new contract to audit, events BNB already understands. Kept from ChatGPT.

## D3. Pay with USDT if the escrow accepts it

The SDK's mainnet asset catalog includes USDT, USDC and USD1 alongside U, and `createJobWithToken` binds a job to a token. If `isPaymentTokenSupported(USDT)` is true and the seller accepts it, users pay with the stablecoin they already hold. Missing from ChatGPT's pack. Possibly the largest single conversion lever in the campaign.

## D4. The hire is five signatures, so the UX is built around naming them

`createJob`, `registerJob` (client only), `setBudget`, `approve` (exact), `fund`. ChatGPT's hire flow listed four steps without `registerJob` and `setBudget`; as written it would revert (`BudgetMismatch`) or settle with no policy. We name each signature in plain words, batch the last four with EIP-5792 where the wallet supports it, and offer an optional bounded quest-basket approval.

## D5. Completion is reported twice

The OptimisticPolicy dispute window (the SDK prints it in days) means `JobCompleted` lands long after the agent delivers. We report `JobSubmitted` as delivered and `JobCompleted` as settled, and ask Gwen which counts. A keeper settles after the window.

## D6. Ratings through ERC-8004 now, not "pending"

The standard `giveFeedback` needs no agent pre-authorisation and the contract blocks self-rating. The canonical ReputationRegistry sits at a CREATE2 address on every chain; P2-00 confirms code on 56 and 97. ChatGPT left ratings unresolved pending Gwen; we build now behind a `RatingService` seam.

## D7. Hireable and Warranted are separate badges

Kept from ChatGPT, and it is the supply unlock: 7,437 third-party MCS runs, zero passes. Gating Hire on MCS would leave every category with one agent (ours). The standard stays the moat; it just stops being a turnstile.

## D8. Supply comes from Agent Studio sellers already in the registry

They share the same seller runtime (`negotiate`, `notify_funded`, `submitResult`), so one buyer rail hires them unchanged. Target 3 per category minimum, 5 goal, non-Marque operators first. A second first-party agent per category is the last rung only, with a genuinely different method, never a clone.

## D9. Reference agents become registry rows

Phase 2 bans hardcoded agent lists. The five reference agents already have mainnet identities 341553 to 341557. They are ingested like everyone else and marked first-party from config. Legacy `marque:*` ids resolve through an alias table; historical records are not rewritten. Kept from ChatGPT.

## D10. The charter stays, as a sandbox, and campaign hires need no action authority

All four reference agents deliver analysis and plans. A service-fee job needs no authority over the user's assets. The spend cap is the escrow amount plus an exact allowance; revoke is cancel, refund, or allowance to zero. All real on-chain actions, which is what requirement 5 asks for. The Marque-wallet-signed charter demo stays, clearly labelled as a sandbox of action authority. User-owned action charters for execution agents are post-launch.

## D11. A dedicated `/quest` page

Users choose which shortlisted marketplace to do the quest on. The one that makes the quest easiest wins the traffic. `/quest` shows balances, the five steps, the recommended agent per category, costs and time, and ticks from the chain. ChatGPT's pack put this inside My Marque; we give it its own route and the home page CTA, and mirror it in `/me`.

## D12. Kerbstone transplant

Francis's direction. Kerb's type stack, scale, component set, status pill, three-state theme, toasts, TxStepper, error map and footer, which Claude Code already built once. Marque keeps its mark, brass, art, MeasureRule and the Chamber surface for money moments. ChatGPT's pack had no design system for this.

## D13. Clean the public repo now

The root holds our private strategy chat (which names and criticises a competing project, Hive), a personal email and planning folders. BNB's technical reviewer will open this repo during a campaign that asks for fair play. `git rm` to an off-repo location, no history rewrite. ChatGPT's pack missed it.

## D14. Fix the incidents before building features

Probe freshness (0 reachable), the 503 on `/api/v1/agents`, stale warrants, wrong prices. These make an honest product look broken and cost nothing to fix first.

## D15. Phased prompts, not a monolith

ChatGPT's 3,600-line single file is an excellent reference and a poor execution vehicle: coding agents lose the thread. This pack is phases with checkpoints, ladders and gates, and keeps ChatGPT's file as background reading (`docs/phase2/reference/chatgpt-pack.md` if Francis wants it in the repo).

---

## From ChatGPT's pack: adopt, modify, reject

| Item | Verdict | Note |
|---|---|---|
| Repo audit findings (prices, HIRE_WIRED, empty settleableServiceIds, erc8183 scaffold, x402 stop, anonymous telemetry, runs durability, no CI, stale AGENTS domain) | Adopt | Each verified against the code on 26 Sep |
| Chain-first Quest Index, separate from anonymous telemetry | Adopt | |
| Service-fee escrow vs action authority separation | Adopt | Made concrete in D10 |
| No custody, user wallet signs | Adopt | |
| Durable queue, zero-downtime deploy, load test, CI | Adopt | P2-11 |
| Alias layer for `marque:*` ids | Adopt | |
| Anti-wash and team-wallet exclusion | Adopt, extended | Reason codes, flag never delete |
| Competitor synthesis and preserved roadmap | Adopt | `ROADMAP.md` |
| Hire flow steps | **Modify** | Add `registerJob` and `setBudget`, router as evaluator and hook |
| Testnet for deadline, mainnet later | **Reject** | D1 |
| Ratings pending Gwen | **Modify** | Build now, confirm later (D6) |
| Quest inside My Marque only | **Modify** | Own route (D11) |
| Token from kernel only | **Modify** | Quote's token, USDT preferred (D3) |
| Diagnose probe incident | **Modify** | Root cause plus tiered scheduler specified |
| Single 3,600-line spec as the execution brief | **Reject as brief, keep as reference** | D15 |
