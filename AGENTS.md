# AGENTS.md — Marque

**Read this file in full at the start of every phase, before touching any code.**
If anything you are about to do contradicts this file, stop and say so instead of doing it.

*Brand: **Marque**. Domain: `usemarque.xyz`. The display name lives in exactly one place — `packages/ui/src/brand.ts` — and is imported everywhere. Never hardcode it, because a product that hardcodes its own name in forty files cannot be rebranded by whoever adopts it.*

**Naming discipline — three rules, not optional.** There is an unrelated Base-mainnet project also called Marque whose product is an agent carrying a scoped revocable budget. We are keeping the brand and moving away from the overlap:
1. **`marque` is a proper noun and nothing else.** The scoped session is a **charter**. The certificate is a **warrant**. Never write "a marque", "grant a marque", "the Mark". Grep for lowercase `marque` before submission.
2. **No wax-seal or hallmark logo.** The Seal is an *interaction* — a brass press on granting a charter. The wordmark is typographic.
3. **No "letter of marque" framing in public copy.** Lead with the quality-mark half: warranted, held to a standard, stands behind its work.

---

## What Marque is

A marketplace on BNB Smart Chain where a person can see what they hold, find agents that can act on it, give one bounded authority, and verify what happened.

Built for the BNB Chain "Build the Era" hackathon. Deadline **9 Sep 2026**. Judging **9–23 Sep**.

**One sentence:** Marque reads your BNB Chain positions, ranks the agents that can work on them against a published test, lets you grant a spend-capped revocable charter, and proves on-chain what the agent did.

**Vocabulary** (use consistently in code and UI):
**the Desk** = position view · **the Register** = indexed agents · **a Charter** = a scoped Altana session · **a Warrant** = a conformance certificate · **the Ledger** = the measured-advantage record · **MCS** = Marque Conformance Standard.

---

## PRODUCT INVARIANTS

Not preferences. Violating one is a bug, however good the code is.

1. **Marque is a marketplace, not a portfolio of agents.** First-party reference agents exist only to guarantee category liquidity and are always visibly labelled as such.
2. **Position-first, but never position-only.** The hero is an address and its live positions. **Wallet connection is never required** to understand or use the marketplace: pasting any address, the demo address, category browsing, agent search and agent profiles all work with no wallet at all. A judge with no wallet must be able to complete the whole journey except the final signature.
3. **All four categories are first-class**: Rebalancing, Grid Trading, Yield Optimisation, Health Factor Monitoring. Each has its own reader, task schema, conformance test, comparison columns and charter template. Never share a generic implementation across categories to save time.
4. **Never display a fabricated, hardcoded, estimated or placeholder metric.** Not in a demo, not in a screenshot, not "temporarily". If a number is unavailable, show the empty state and say why. Every illustrative number in the planning docs is layout copy and must never reach the product.
5. **Every displayed metric carries provenance**: `ONCHAIN`, `MEASURED`, `TESTED`, or `CLAIMED`. `CLAIMED` is always styled weaker. Never let an unverified provider claim look like a chain-derived fact.
6. **Registration does not imply verification.** ERC-8004 identity answers *who*, never *how good*.
7. **Publish failures.** A failed conformance test, a dead endpoint, a reverted transaction — all shown, with the reason. Honest attrition is the product's most credible feature.
8. **MCS tests facts and compliance. The Ledger tests judgement.** A conformance test may only check things with one right answer: arithmetic, on-chain state, legality against the pool's own parameters, and compliance with a policy *supplied in the test case*. It may never grade whether a decision was wise. Quality of judgement, speed and cost belong in the Ledger, against a pre-registered rubric. **If you cannot write the check as an assertion with a numeric tolerance, it does not belong in MCS.**
9. **Financial execution uses bounded authority** (a charter) wherever the counterparty supports it. Unbounded approval is never the default path.
10. **The LLM never signs and never prices.** All signing and pricing is deterministic code. Any chain tool exposed to a model is read-only.
11. **BSC only** (chain id 56, testnet 97) until after judging. No multichain.
12. **Two data tiers, and do not confuse them.**
    - **Derived state** — agents, services, categories, on-chain events. Sourced from BSC and 8004scan, and **must be fully rebuildable** by running ingest from cursor zero. Nothing may exist only here.
    - **First-party observations** — probe history, conformance results and raw agent responses, run artifacts, Ledger manifests, manual benchmark recordings, sealed-call resolutions. These are **measurements we made and can never recreate.** Durably stored, backed up nightly to a second location, hash-anchored where useful. **Never included in a rebuild-from-chain drill. Never dropped.**
    *(An earlier draft said "Postgres is fully rebuildable from chain." That was wrong and would have authorised deleting the Ledger.)*
13. **Do not invent new protocols.** ERC-8004 identity, ERC-8183 commerce, x402/B402 per-call payment, Altana sessions. `MarqueRegistry.sol` stays **tiny**: append-only, holds no funds, no ownership, no upgradeability, no reputation logic — an `anchor(bytes32)` event and a `sealCall(bytes32)` event, roughly forty lines. If it grows past that, you are rebuilding something that already exists.
14. **The UI must be understandable by someone with zero Agent Studio knowledge.** If a screen needs a glossary, it is wrong.
15. **Light for looking, dark for doing — but one product, not two.** Only ground, ink and rule tokens swap between daylight and cockpit. Type scale, spacing, MeasureRule, chips and buttons are identical in both. The transition is a dim, never a navigation. If it feels like two websites, it is wrong.
16. **Do not change architecture, design tokens or MCS without updating the corresponding doc in the same commit.**

---

## STOP AND ASK — the four hard escalation gates

Escalate to Francis and wait. Everything else: proceed under the degradation ladder below.

1. **Any on-chain state change on mainnet** — contract deploy, ERC-8004 registration, ERC-8183 funding, charter grant, token approval, LP action. Requires explicit written **"approved, mainnet"**.
2. **Any new recurring cost** — paid API tier, cloud runtime, hosted DB, domain.
3. **Any data deletion** — dropping tables, truncating, resetting migrations, `rm -rf` outside `/tmp` and build dirs. **First-party observations (invariant 12) are never deletable, not even to fix a migration.**
4. **Any estimate presented as a measurement.** If you cannot measure it, do not display it, and say so rather than approximating.

Private keys stay local to Francis. Never request one, never log one, never write one where the repo can see it. Testnet throwaway wallets are generated fresh (`bag wallet new`) and never reused on mainnet.

---

## THE DEGRADATION LADDER — how to get unstuck without stopping

You are building fast against third-party systems that will fail. **Being blocked is worse than being reduced.** Every phase has a timebox. When you hit it, do not stall, and do not ask permission for anything this section already grants.

**GREEN — ship it.** All acceptance criteria met. Report and stop at the checkpoint.

**AMBER — reduce scope, proceed, log it.** You have standing authority to do all of the following without asking:
- Drop an optional sub-feature to protect the phase's core outcome.
- Substitute a library, provider or approach that works for one that does not.
- Stub a downstream integration behind our own interface so the rest of the phase lands.
- Ship a category with fewer agents than hoped, clearly labelled.
- Skip a nice-to-have animation, page or filter.
- Widen a test tolerance **only if** you record the old value, the new value and why.

Log every one in `docs/DEVIATIONS.md`: *what was planned · what shipped · why · what it costs us · how to restore it.* One line each. That file is the phase report's appendix and the most useful artifact you produce.

**RED — stop and escalate.** Only these:
- One of the four hard gates.
- The phase's core outcome is impossible, not merely harder (the data does not exist at all).
- You would have to fabricate a number, weaken an invariant, or delete first-party observations to proceed.
- Two consecutive sessions with no forward progress on the same blocker.

**Before escalating, write three genuinely distinct hypotheses and test them.** Not three variations of one idea. If all three fail, escalate with all three results attached.

### Timeboxes

| Phase | Box | If exceeded |
|---|---|---|
| P0 Foundation | 4h | Ship ingest + deploy skeleton; defer schema polish |
| P1 Position readers | 8h | Ship the readers that work, name the ones that do not, never fake them |
| P2 Probe + classify | 6h | Keyword classification only; drop the LLM pass |
| P3 Conformance | 8h | MCS-HF-1 and MCS-REB-1 fully; the other two may be spec-only for a day |
| P4 Frontend I | 10h | Desk + Register mandatory; agent profile may ship thin |
| P5 Execution | 10h | One working adapter beats four half-adapters. ERC-8183 first. |
| P6 Charters (Altana) | 8h | Fall back to `P6-lite`. Do not let an SDK burn a day. |
| P7 Cockpit UI | 8h | The Seal and revoke are mandatory; the rest can be static |
| P8a Reference agents | 10h | Three working agents beat five flaky ones |
| P8b Ledger | 8h | Two benchmarks fully done beats four half-done |
| P9 Pancake | 6h | 9a + 9b only. 9c (`/gaps`) is optional and cut by default. |
| P10 Builder rail | 6h | `/builders/test` and `/judge` first; claim rail may ship read-only |
| P11 Hardening | 6h | Monitoring, restart and backup are mandatory; load testing is not |

**P6-lite fallback.** If Altana stalls: implement `CharterService` against our own primitives — allowlist + cap + expiry recorded on `MarqueRegistry`, same UI, same revoke, same on-chain visibility. Forfeits the Altana prize, preserves the main-track safety story, and swapping Altana back in later is one implementation of one interface. **Build against `CharterService` from the start so this fallback costs nothing.**

**P8a fallback.** If the Archon port is not clean within four hours, stop pulling: ship Redcell as a thin approval-risk and privileged-function triage agent over BscScan-verified source. Still satisfies TermiX's high-stakes category. Extract the smallest portable engine, not the full feature set.

---

## Categories and their tests

| Category | Reader | Test | What is checked (all arithmetic) |
|---|---|---|---|
| Rebalancing | PancakeSwap V3 `NonfungiblePositionManager` + pool `slot0` | **MCS-REB-1** | current tick, in-range boolean, distance to bound, proposed ticks are multiples of the pool's `tickSpacing`, range matches the **policy supplied in the test case** within one spacing, amounts within 0.5% of the V3 liquidity formula, slippage bound stated |
| Grid Trading | spot balances + pair price | **MCS-GRID-1** | spacing arithmetic (type declared and correct), allocation sums ≤ capital, all levels inside stated bounds, none below the stop, **fee drag disclosed** |
| Yield Optimisation | Venus + Lista + Pancake farms | **MCS-YIELD-1** | every APR carries source + timestamp, net APR within 15bps of ours **at the stated size**, switching cost itemized, supplied threshold respected, leverage flagged when excluded |
| Health Factor | Venus Comptroller | **MCS-HF-1** | HF to 3dp, correct per-market liquidation threshold, exact repay amount for the target HF (tolerance 0.005) |

**No LLM grades a conformance test.** If a field cannot be checked by assertion, it belongs in the Ledger, not MCS. Tolerances are named constants in code and are rendered into the published standard, which is **generated from the test code** so it can never drift from what is enforced.

---

## Design system

### Tokens
```css
--paper:#EDEDE7; --paper-raised:#F7F7F3; --ink:#15160F; --ink-soft:#5C5E52; --rule:#D4D4CB;
--deck:#12140E; --deck-raised:#1B1E15; --deck-ink:#E8E9E0; --deck-rule:#2C3023;
--brass:#B0892C; --brass-lit:#D9AE45;
--holds:#2E7351; --watch:#B8721A; --breach:#A83A2C; --chain:#2B5A85;
```
Brass ≤ 8% of any viewport. Signal colours are for **state only** — never branding, never decoration.

### Type
- **Geist** for UI. **Geist Mono, tabular, for numerals inside tables, receipts and hashes only** — never for labels or eyebrows.
- **Fraunces** (one weight, wonk 0, soft low) for exactly four things: hero line, section statements, charter headings, receipt title.
- Hero 48/30. Statement 30/24. Row title 16. Body 15/1.55. Data 13.5. Caption 11.5. Line length ≤ 68ch.

### The structural device
**`MeasureRule`** — a 3px rule showing where a value sits inside its safe band with the threshold marked. Used identically for LP range, health factor, net APR and grid band. One component, four categories. This is the visual signature; do not add a second competing device.

### Forbidden (templated tells; a competitor already uses several)
ALL-CAPS eyebrow labels · `01 / 02 / 03` numbering · `A · B · C` middot strings · `→` appended to button text · identical rounded cards in a grid · uniform drop shadows · gradient washes · glassmorphism · neon · purple · Binance yellow as a field colour · robot mascots · glowing brains.

### Motion
One bold moment: **the Seal** on granting a charter (dim to cockpit 260ms → charter composes line by line at 60ms stagger → brass mark presses with a short bloom → tx hash writes in as it confirms).
Everything else quiet: measure fill once on data arrival (400ms, `cubic-bezier(.16,1,.3,1)`, 30ms stagger), FLIP reorder on filter change, real-time spend meter, one 200ms pulse on tx inclusion, a Tape of **real** events only.
**Banned:** scroll fade-ups, per-card hover lifts, parallax, blobs, particles.
Every animation needs a `prefers-reduced-motion` fallback. 60fps mid-laptop. LCP < 2.0s.

### Copy
Plain verbs, sentence case, no filler. The button that says **Grant a charter** produces **Charter granted**. Errors state what failed and what to do next. Empty states invite action.

---

## Stack

Node 22 · TypeScript strict · pnpm workspaces · Next.js 15 App Router (`output: "standalone"`) · Tailwind · framer-motion · viem/wagmi · Zod on every external payload · Drizzle + Postgres (native) · Redis (native) · Hono if the API outgrows route handlers · PM2 + Caddy on the Contabo VPS · Playwright for audits · Foundry for `MarqueRegistry.sol`.

**No Docker. No Railway. No serverless for anything stateful.**

---

## Security — treat agent endpoints as hostile

- **`safeFetch()` with an SSRF guard on every outbound call to an agent endpoint**: resolve DNS first, reject private/reserved/link-local/metadata ranges, re-validate after every redirect, hard timeout, response size cap. Written once, used everywhere, including in execution.
- Never `eval`. Never render raw HTML from agent metadata. Parse every external response through Zod and drop unknown fields.
- API keys (8004scan, RPC, LLM) are server-side only. Never in client bundles, never in `studio.toml`, never in a form or a screenshot.
- Strict CSP. Rate limit probes, quotes, benchmarks, executions.
- Before any write transaction: resolve destination, render the exact human-readable action, simulate where possible, enforce cap and allowlist, require explicit consent.
- The demo/judge wallet is separate and low-value. Never reuse a funded personal wallet in agent runtime tests.
- **Our own mainnet Venus position stays above HF 2.5.** Demonstrate risky positions by reading third-party addresses, never by manufacturing our own liquidation risk.

---

## Definition of done, per phase

1. Acceptance criteria met, with real output pasted as evidence.
2. `pnpm typecheck` and `pnpm lint` clean. No new `any`. No `@ts-ignore` without a scoped one-line justification.
3. Unit tests for new deterministic logic. **Position math and conformance engines require tests** — these are the numbers people will trust with money.
4. For any front-end phase: `node scripts/audit.mjs` run, screenshots **looked at**, issues fixed.
5. No placeholder data in the shipped path.
6. Conventional commit. Docs updated in the same commit if behaviour changed.
7. `docs/DEVIATIONS.md` updated for anything reduced.
8. A short report: what shipped, what was reduced and why, what is unblocked, what Francis must decide.

---

## Known gotchas (paid for once — do not repeat)

1. `bag` CLI: never grant blanket `bag:*` permission; deploy and payment commands live under it. Approve each shell command.
2. `bag deploy --provider bnb` is a **48-hour testnet trial** in the operator's cloud — signing material leaves your control. Throwaway wallet only, never mainnet. For Marque, self-host the emitted TypeScript on the VPS.
3. Local deliverable storage fails Studio deploy readiness by design — IPFS if deploying via `bag`.
4. Next.js self-host: `output: "standalone"`, run `node .next/standalone/server.js` behind Caddy, copy `static` and `public` per Next docs.
5. 8004scan: query filters are not reliably honoured on all endpoints. **Always re-filter results server-side on `chain_id === 56`.**
6. 8004scan `health_checked_at` can be months stale. Never present their health as current — run our own probe and label it `MEASURED` with our own timestamp.
7. **Expect heavy attrition from registered → reachable.** Many entries carry `services: null` and `parse_status.info: IA002`. Build the funnel to *measure* this, and **never hardcode a ratio anywhere — display only what our ingest counts today.** *(An earlier draft quoted "~99%". That was an estimate and had no business in this file.)*
8. Parse services from **both** the top-level `services` object **and** `raw_metadata.offchain_content.services`. They disagree; the array is often richer. Record which source won.
9. Some service endpoints are **URL templates** containing `{agentId}` and will 404 if fetched literally. Resolve templates from the agent's own metadata before calling.
10. Postgres and Redis are native (no Docker). `systemd` for them, PM2 only for our processes.
11. viem: pool at least three BSC RPC endpoints with failover; a single provider will rate-limit during indexing.
12. Pancake V3: proposed ticks **must** be multiples of the pool's `tickSpacing` for its fee tier. Most common agent failure and the highest-signal conformance check.
13. Do not pre-buy a settlement token for ERC-8183. Resolve it from the deployed kernel at runtime (`token_symbol()`, `token_decimals()`, `token_balance()`), then fund exactly that.

---

## Env registry (never committed)

`MARQUE_PUBLIC_URL` · `DATABASE_URL` · `REDIS_URL` · `BSC_RPC_URLS` (comma-separated) · `SCAN_API_KEY` · `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `ALTANA_API_KEY` · `MARQUE_REGISTRY_ADDRESS` · `MARQUE_TREASURY` · `DEMO_ADDRESS` · `DAILY_LLM_USD_CAP` (default **5**) · `PER_AGENT_LLM_USD_CAP` (default 1.5) · `PORT`

---

## Working agreement

- Self-debug before reporting. Three genuinely distinct hypotheses before asking.
- Batch updates to session start and end. Do not interrupt for anything the degradation ladder covers.
- Reduce scope freely under AMBER; record it in `DEVIATIONS.md`.
- If you claim something is done, paste the evidence. Claims without evidence have burned this project before.
- If you are about to reframe a requirement so it becomes easier, stop and flag it instead of doing it quietly.

Standing rules for every phase

Append this to any prompt where an agent has been drifting:

REMINDERS:
- No fabricated, hardcoded or estimated numbers anywhere in the shipped path. Empty states instead.
- Every metric needs a provenance chip. CLAIMED is styled weaker than the rest.
- All four categories stay equally deep. Do not implement one well and stub three.
- safeFetch() with the SSRF guard on every outbound call to an agent endpoint.
- The LLM never signs and never prices.
- Mainnet requires my written "approved, mainnet". Testnet is free.
- If you claim it's done, paste the evidence.
- If you are about to reframe a requirement to make it easier, stop and flag it instead.
- You are AMBER-authorised: reduce scope to protect the phase outcome and log it in
  docs/DEVIATIONS.md rather than stalling or asking.
- MCS checks facts and supplied-policy compliance only. Judgement goes in the Ledger.
- Never delete a first-party observation (probe history, conformance results, run artifacts,
  Ledger manifests). They cannot be recreated.


17. First-party supply is always labelled. Every Marque reference agent carries a visible Marque reference agent mark wherever it appears, linking to a one-line explanation of why first-party agents exist. Never let one sit in the Register looking like third-party supply.

18. One agent, one name. An agent has exactly one display name, resolved from a single source, and it is identical on the Register, the profile, the Ledger, the charter builder and every receipt. Three names for one agent is a bug, not a cosmetic issue.

19. Never display a query limit as a count. Any number describing a population is a COUNT(*). If the underlying query is capped, the UI says 200+ or nothing at all. This is the same rule as invariant 4 and it applies with extra force on a product competing on data quality.

20. Network context is local, never global. Every surface that shows or produces a transaction states its own chain — BSC mainnet · 56 or BSC testnet · 97 — and every explorer link inherits that context. A footer label does not establish the network for a page.

21. Two container widths. Prose surfaces cap at 680px because that is a readable measure. Data surfaces — Register, Standard results, Ledger, Charters, profiles — run to 1240px. Nothing uses a single width for both.
