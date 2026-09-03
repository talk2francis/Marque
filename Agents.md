# AGENTS.md — Marque

**Read this file in full at the start of every phase, before touching any code.**
If anything you are about to do contradicts this file, stop and say so instead of doing it.

---

## What Marque is

A marketplace on BNB Smart Chain where a person can see what they hold, find agents that can act on it, give one bounded authority, and verify what happened.

Built for the BNB Chain "Build the Era" hackathon. Deadline **9 Sep 2026**. Judging **9–23 Sep**.

**One sentence:** Marque reads your BNB Chain positions, ranks the agents that can work on them against a published test, lets you grant a spend-capped revocable mandate, and proves on-chain what the agent did.

---

## PRODUCT INVARIANTS

These are not preferences. Violating one is a bug, regardless of how good the code is.

1. **Marque is a marketplace, not a portfolio of agents.** First-party reference agents exist only to guarantee category liquidity and are always visibly labelled as such.
2. **Position-first, not agent-first.** The primary entry point is an address and its live positions, never a search box over the registry.
3. **All four categories are first-class**: Rebalancing, Grid Trading, Yield Optimisation, Health Factor Monitoring. Each has its own reader, task schema, conformance test, comparison columns and mandate template. Never share a generic implementation across categories to save time.
4. **Never display a fabricated, hardcoded, estimated or placeholder metric.** Not in a demo, not in a screenshot, not "temporarily". If a number is unavailable, show the empty state and say why.
5. **Every displayed metric carries provenance**: `ONCHAIN`, `MEASURED`, `TESTED`, or `CLAIMED`. `CLAIMED` is always styled weaker than the others. Never let an unverified provider claim look like a chain-derived fact.
6. **Registration does not imply verification.** ERC-8004 identity answers *who*, never *how good*. Never render a registry entry as if it were qualified.
7. **Publish failures.** A failed conformance test, a dead endpoint, a reverted transaction — all are shown, with the reason. Honest attrition is the product's most credible feature.
8. **Financial execution uses bounded authority** (Altana scoped session) wherever the counterparty supports it. Unbounded approval is never the default path.
9. **The LLM never signs and never prices.** All signing and pricing is deterministic code. Any chain tool exposed to a model is read-only.
10. **BSC only** (chain id 56, testnet 97) until after judging. No multichain.
11. **Chain is canonical; Postgres is a materialized view** that must be fully rebuildable from BSC + 8004scan by running the ingest workers from genesis cursor. No data may exist only in Postgres.
12. **Do not invent new protocols.** ERC-8004 for identity, ERC-8183 for commerce, x402/B402 for per-call payment, Altana for sessions. If a BNB standard already solves it, use it.
13. **The UI must be understandable by someone with zero Agent Studio knowledge.** If a screen requires a glossary, it is wrong.
14. **Do not change architecture, design tokens or the conformance standard without updating the corresponding doc in the same commit.**

---

## STOP AND ASK — the four hard escalation gates

Escalate to Francis and wait. Everything else: self-debug with three distinct hypotheses, make implementation compromises freely, report at session start and end.

1. **Any on-chain state change on mainnet** — contract deploy, ERC-8004 registration, ERC-8183 funding, session grant, token approval, LP action. Requires explicit written **"approved, mainnet"**.
2. **Any new recurring cost** — paid API tier, cloud runtime, hosted DB, domain.
3. **Any data deletion** — dropping tables, truncating, resetting migrations, `rm -rf` outside `/tmp` and build dirs.
4. **Any estimate presented as a measurement** — if you cannot measure it, do not display it, and tell Francis rather than approximating.

Private keys stay local to Francis. Never request one, never log one, never write one to a file the repo can see. Testnet throwaway wallets are fine and must be generated fresh (`bag wallet new`) and never reused on mainnet.

---

## Categories and their tests

| Category | Reader | Test | Ground truth |
|---|---|---|---|
| Rebalancing | PancakeSwap V3 `NonfungiblePositionManager` + pool `slot0` | **MCS-REB-1** | tick spacing validity, in-range boolean, distance to bound, proposed range legality, amounts within 0.5% of the V3 liquidity formula, slippage policy present |
| Grid Trading | spot balances + pair price + realized vol | **MCS-GRID-1** | spacing arithmetic, allocation sums ≤ capital, no level below stop, **fee drag disclosed**, fill expectation internally consistent |
| Yield Optimisation | Venus + Lista + Pancake farms | **MCS-YIELD-1** | every APR has source + timestamp, net APR within 15bps of ours at the user's size, switching cost itemized, threshold respected, leverage flagged |
| Health Factor | Venus Comptroller | **MCS-HF-1** | HF to 3dp, correct per-market liquidation threshold, exact repay amount for a target HF (tolerance 0.005) |

Tests are **deterministic**. No LLM grades a conformance test. The standard page at `/standard` is generated from the test code itself so it can never drift from what is enforced.

---

## Design system

### Semantics: light for looking, dark for doing
Discovery, register, profiles, ledger, standard → **daylight**.
Mandate Desk, Run Room, receipt seal → **cockpit**.
This is meaningful, not decorative. Do not add a theme toggle.

### Tokens
```css
--paper:#EDEDE7; --paper-raised:#F7F7F3; --ink:#15160F; --ink-soft:#5C5E52; --rule:#D4D4CB;
--deck:#12140E; --deck-raised:#1B1E15; --deck-ink:#E8E9E0; --deck-rule:#2C3023;
--marque:#B0892C; --marque-lit:#D9AE45;
--holds:#2E7351; --watch:#B8721A; --breach:#A83A2C; --chain:#2B5A85;
```
Brass ≤ 8% of any viewport. Signal colours are for **state only**, never branding, never decoration.

### Type
- **Geist** for UI. **Geist Mono, tabular, for numerals inside tables/receipts/hashes only** — never for labels or eyebrows.
- **Fraunces** (one weight, wonk 0, soft low) for exactly four things: hero line, section statements, mandate headings, receipt title.
- Hero 48/30. Statement 30/24. Row title 16. Body 15/1.55. Data 13.5. Caption 11.5. Line length ≤ 68ch.

### The structural device
**`MeasureRule`** — a 3px rule showing where a value sits inside its safe band with the threshold marked. Used identically for LP range, health factor, net APR, and grid band. One component, four categories. This is the visual signature; do not add a second competing device.

### Forbidden (these read as templated and one competitor already uses them)
ALL-CAPS eyebrow labels · `01 / 02 / 03` numbering · `A · B · C` middot strings · `→` appended to button text · identical rounded cards in a grid · uniform drop shadows · gradient washes · glassmorphism · neon · purple · Binance yellow as a field colour · robot mascots · glowing brains.

### Motion
One bold moment: **the Seal** on granting a marque (dim to cockpit 260ms → mandate composes line by line 60ms stagger → brass mark presses with a short bloom → tx hash writes in as it confirms).
Everything else quiet: measure fill once on data arrival (400ms, `cubic-bezier(.16,1,.3,1)`, 30ms stagger), FLIP reorder on filter change, real-time spend meter, one 200ms pulse on tx inclusion, a live Tape of **real** events only.
**Banned:** scroll fade-ups, per-card hover lifts, parallax, blobs, particles.
Every animation needs a `prefers-reduced-motion` fallback. 60fps mid-laptop. LCP < 2.0s.

### Copy
Plain verbs, sentence case, no filler. The button that says **Grant a marque** produces **Marque granted**. Errors state what failed and what to do next. Empty states invite action. Never write "the future of autonomous intelligence" or anything like it.

---

## Stack

Node 22 · TypeScript strict · pnpm workspaces · Next.js 15 App Router (`output: "standalone"`) · Tailwind · framer-motion · viem/wagmi · Zod on every external payload · Drizzle + Postgres (native) · Redis (native) · Hono for the API if it outgrows route handlers · PM2 + Caddy on the Contabo VPS · Playwright for audits · Foundry for `MarqueRegistry.sol`.

**No Docker. No Railway. No serverless for anything stateful.**

---

## Security — treat agent endpoints as hostile

- **SSRF guard on every outbound call to an agent endpoint**: resolve DNS first, reject private/reserved/link-local/metadata ranges, re-validate after each redirect, hard timeout, response size cap.
- Never `eval`. Never render raw HTML from agent metadata. Parse every external response through Zod and drop unknown fields.
- API keys (8004scan, RPC, LLM) are server-side only. Never in client bundles, never in `studio.toml`.
- Strict CSP. Rate limit probes, quotes, benchmarks, executions.
- Before any write transaction: resolve destination, render the exact human-readable action, simulate where possible, enforce cap and allowlist, require explicit user consent.
- The demo/judge wallet is separate and low-value. Never reuse a funded personal wallet in agent runtime tests.

---

## Definition of done, per phase

A phase is done when **all** of these are true:

1. Every acceptance criterion in the phase prompt passes, demonstrated with real output pasted into the report.
2. `pnpm typecheck` and `pnpm lint` are clean. No `any` added. No `@ts-ignore` without a scoped one-line justification.
3. Tests exist and pass for new deterministic logic (position math and conformance engines require unit tests — these are the numbers people will trust with money).
4. `node scripts/audit.mjs` has been run for any front-end phase, the screenshots have been **looked at**, and issues fixed.
5. No placeholder data anywhere in the shipped path.
6. Committed with a conventional message. Docs updated in the same commit if behaviour changed.
7. A short report: what shipped, what was compromised and why, what is now unblocked, anything Francis must decide.

---

## Known gotchas (paid for once — do not repeat)

1. `bag` CLI: never grant blanket `bag:*` permission; deploy and payment commands live under it. Approve each shell command.
2. `bag deploy --provider bnb` is a **48-hour testnet trial** in the operator's cloud — signing material leaves your control. Use a throwaway wallet, never mainnet. For Marque, self-host the emitted TypeScript on the VPS instead.
3. Local deliverable storage fails Studio deploy readiness by design — use IPFS if deploying via `bag`.
4. Next.js self-host: `output: "standalone"`, run `node .next/standalone/server.js` behind Caddy, copy `static` and `public` per Next docs.
5. 8004scan API: query params are inconsistently honoured on some endpoints — **always re-filter results server-side by `chain_id === 56`** rather than trusting the request filter.
6. 8004scan `health_checked_at` can be months stale. Never present their health as current — run our own probe and label it `MEASURED` with our timestamp.
7. Most registry entries have `services: null` / `parse_status.info: IA002`. Expect a ~99% attrition rate from registered → reachable. Build the funnel around that, don't fight it.
8. Postgres and Redis are native (no Docker). Use `systemd` for them and PM2 only for our own processes.
9. viem: pool at least three BSC RPC endpoints with failover; single-provider will rate-limit during indexing.
10. Pancake V3 tick math: proposed ticks **must** be multiples of the pool's `tickSpacing` for its fee tier. This is the most common agent failure and the highest-signal conformance check.

---

## Env registry (never committed)

`MARQUE_PUBLIC_URL` · `DATABASE_URL` · `REDIS_URL` · `BSC_RPC_URLS` (comma-separated) · `SCAN_API_KEY` · `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `ALTANA_API_KEY` · `MARQUE_REGISTRY_ADDRESS` · `MARQUE_TREASURY` · `DEMO_ADDRESS` · `DAILY_LLM_USD_CAP` (default 15) · `PORT`

---

## Working agreement

- Self-debug before reporting. Three distinct hypotheses before asking.
- Batch updates to session start and end. Do not interrupt for things you can resolve.
- Make implementation compromises freely; record them in the phase report.
- If you claim something is done, paste the evidence. Claims without evidence have burned this project before.
- If you are about to reframe a requirement so it becomes easier, stop and flag it instead.
