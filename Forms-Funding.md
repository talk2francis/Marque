# Forms and funding — paste-ready

Do these in order. Total time: about 25 minutes.

---

## 1. 8004scan Pro tier application

Create the API key first at the **8004scan Developer Hub**, logged in with a **dedicated build wallet** — not a wallet holding real value. Then submit the Pro-Tier Upgrade Form.

| Field | Enter |
|---|---|
| Email | `chatwithnonso01@gmail.com` |
| Name | Francis Okafor |
| Hackathon registration email | `chatwithnonso01@gmail.com` — **register for the hackathon with this same address** so the two records match |
| Wallet connected to your 8004scan account | The exact `0x…` address shown on your Developer Hub account. **Never paste an API key into this form.** |

**Brief project description:**

> Marque (usemarque.xyz) is a position-first AI agent marketplace for BNB Smart Chain. A user connects or simply pastes a BSC address; Marque reads their live DeFi positions — PancakeSwap V3 liquidity, Venus lending, idle assets — and surfaces reachable ERC-8004 agents capable of acting on that specific position. Agents are compared on real-time on-chain data and deterministic, category-specific conformance tests, hired over ERC-8183 or x402, granted spend-capped revocable permissions, and every run produces a verifiable receipt.

**How will your project use the 8004scan API?**

> Marque uses 8004scan as its ERC-8004 discovery and identity layer for BNB Smart Chain. We ingest and continuously refresh BSC agent identities, service endpoints, capabilities, ownership, reputation and feedback; we use semantic search to assist classification across the four hackathon categories (Rebalancing, Grid Trading, Yield Optimisation, Health Factor Monitoring); we resolve individual agents during compare and hire flows; and we support builder claim and listing flows by agent ID or owner address.
>
> We augment this with our own independently measured endpoint liveness and deterministic conformance results, while preserving the ERC-8004 identity as the canonical agent reference. We intend to publish our category classifications and conformance results back as a free public read API, which may be useful as an enrichment feed for 8004scan.
>
> Pro-tier capacity matters for two distinct load shapes: an initial full BSC registry ingestion, and a high-frequency incremental refresh sustained through the build period and the judging window. Keys are held server-side only, per your developer guidance.

That last paragraph is the one that matters. It explains *why* the limit is justified rather than asking for 100k/day because it is free.

---

## 2. Hackathon intake form

`https://forms.gle/9g9XPNFwnYaHAz9L8` — this is both "Apply as Hacker" and "Submit Project".

Register **today** with `chatwithnonso01@gmail.com`. Registering early costs nothing, matches the 8004scan record, and puts you in whatever comms channel the organisers use.

At submission, tick **Main Track + TermiX + PancakeSwap + Altana**, and AltLayer if it appears as an option.

**Collect these as you go so submission night is not archaeology.** Keep a running `docs/SUBMISSION.md`:
- Every wallet address (Altana explicitly asks for them and people forget)
- Every mainnet tx hash: registrations, ERC-8183 jobs, charter grant, session-key execution, revocation, Pancake rebalance
- `MarqueRegistry` address
- Public URLs for `/judge`, `/ledger`, `/standard`, `/pancakeswap`

---

## 3. Funding

Three separate situations. Conflating them is how people overspend.

| Purpose | Network | Asset | Amount |
|---|---|---|---|
| Development, contract testing, all charter/revoke work | BSC testnet (97) | tBNB | Free from the faucet. ~0.01–0.02 per active test wallet. Agent Studio's own walkthrough operates on roughly 0.005 tBNB. |
| Real demo positions and proof runs | BSC mainnet (56) | BNB + USDT | **0.10 BNB + 40 USDT**, one dedicated low-value wallet |
| ERC-8183 settlement | Testnet first | **Whatever the deployed kernel reports** | Do not pre-buy |

### Do not guess the settlement token
The BNB Agent SDK resolves its commerce settlement asset from the deployed kernel at runtime. Have the code call `token_symbol()`, `token_decimals()` and `token_balance()` first, then fund exactly what it reports. Buying USDT on an assumption wastes a swap and half a morning.

### ERC-8004 registration should be gas-sponsored
Registration is sponsored via MegaFuel on both testnet and mainnet, so registering the reference agents should not burn BNB. Verify at build time rather than budgeting for it.

### Mainnet allocation of 0.10 BNB + 40 USDT

- **~0.025 BNB + 15–20 USDT** → PancakeSwap V3 position, deliberately narrow so it drifts out of range within hours. This is the Pancake proof and the ADV-02 benchmark subject.
- **~0.04 BNB** → Venus collateral, borrowing only 5–8 USDT. **Keep HF above 2.5.**
- **~15–20 USDT** → left genuinely idle so the yield reader has something real to read.
- **~0.01 BNB** → split across reference-agent wallets for job submission and session gas.
- Remainder as gas buffer. BSC at ~0.05 gwei makes 0.01 BNB extremely generous.

Most of this stays yours as BNB, USDT, LP liquidity or Venus collateral. Real burn across the whole build is roughly **$10–20** in gas, slippage, LP drift and paid agent calls.

### Do not manufacture liquidation risk

My original mock showed a Venus position at HF 1.43. That was layout copy, not an instruction. **Keep our own mainnet position comfortably above HF 2.5.** Demonstrate the dangerous case by reading a **real third-party mainnet address** — there are thousands of genuinely at-risk Venus positions readable right now — or a pinned historical block.

That is strictly better product proof anyway: reading a stranger's risky position demonstrates the reader works on arbitrary input, which is exactly what the functionality criterion asks for. Manufacturing our own liquidation risk proves nothing and can lose money.

### Cap the LLM spend

Five reference agents answering calls through two weeks of judging, with probe loops and curious judges hitting them. Set `DAILY_LLM_USD_CAP=5` globally, `PER_AGENT_LLM_USD_CAP=1.5`, and alert at 80%. Uncapped, this is the line item that quietly costs more than the entire mainnet budget.

---

## 4. Order of operations for the next hour

1. `usemarque.xyz` is purchased — point DNS at the VPS and get Caddy serving HTTPS. Optional five-minute side quest: if `marque.market` or `marque.trade` is under $15, take one too and point it at the same host. Do not spend longer than that on it.
2. Create the 8004scan API key with the dedicated build wallet; submit the Pro-Tier form with the answers above.
3. Register on the hackathon intake form with the same email.
4. Create the dedicated low-value mainnet demo wallet. Note its address.
5. Get testnet tBNB from the faucet now.
6. Commit `AGENTS.md`.
7. Paste **P0** into Codex.

**Do not mainnet-fund anything until P1 has told us the exact contracts and the readers work against a pasted address.** Testnet first, mainnet once the code can actually read what you put there.

When Codex finishes P0, send me its full phase report and the `DEVIATIONS.md`. Not the API key, not any private key. I want to see the real registry counts and the reachable-service ratio before P1 starts, because those two numbers decide how hard you personally need to push on agent-owner outreach.
