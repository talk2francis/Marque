# Handoff

Where the build is, what is proven, and where the next session picks up.
Written 4 Sep 2026, after P6.

## Read these first, in this order

1. `AGENTS.md` — the constitution. Invariants, the four escalation gates, the
   degradation ladder. Read in full at the start of every phase.
2. `docs/FINDINGS.md` — what we measured that changed the plan. F-01 is the
   single most important fact in the build.
3. `docs/DEVIATIONS.md` — every reduction and every correction, with why.
4. This file.

## Status

**P0–P6 shipped.** Live at https://marque.trade.

| Phase | What it left behind |
|---|---|
| P0 | monorepo, Postgres, RPC failover pool, 8004scan ingest |
| P1 | four position readers, provenance enforced by the type system |
| P2 | `safeFetch` SSRF guard, body-grading probe, auditable classifier |
| P3 | MCS v1.0 — four tests, standard generated from the enforcing code |
| P4 | design system, the Desk, the Register, agent profiles, `/standard` |
| P5 | four executors, run pipeline, four-proof receipts, MarqueRegistry |
| P6 | CharterService — Altana sessions, plus a working P6-lite fallback |

Verification: 149 vitest, 14 Foundry, typecheck across 12 packages, lint clean,
Playwright audit clean at four widths on every route.

## Proven on chain (BSC testnet 97)

| What | Hash |
|---|---|
| MarqueRegistry | `0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7` |
| deploy | `0x068f9474ee84dd19e9dc0d945a92a4c947f803a4235eb0304e70aee5622ac931` |
| charter grant | `0x14268464271d9ccea0abd200f87291bcfc5105f72fa678390548f096eb964943` |
| execute through session | `0x8375f7d65e5ea1e8eab66c48cc314a3743f637ff5b67f0436f954e8a262c8b4f` |
| revoke | `0x191172f062c624a170bc8c14d403951a419fa65d5e90eb77c2f099a37a2551d6` |

Nothing has touched mainnet. Both charter providers **refuse to be constructed
for chain 56** — that is escalation gate 1 and needs written approval.

## The one thing to internalise

Five separate bugs in this build were the same mistake:

> **Never guess or default on behalf of a counterparty.** The guess gets
> published as their failure, or it certifies your own bug.

A strict schema that discarded agents; a template resolved to the wrong id;
POSTing at a card instead of the endpoint inside it; silence read as a decline;
a regex that swallowed a period and silently defaulted a target. Each looked
like a third party's fault and was ours. When something fails, check whether we
addressed it correctly before publishing the failure.

## Where P7 starts

P7 is the Cockpit: the Charter Desk and the Seal. `CharterService` is built and
proven, so the UI binds to **our** interface and never to Altana's SDK — an SDK
problem cannot block the phase. Cockpit tokens, Grain and MeasureRule already
exist in `packages/ui` and are demonstrated at `/_ui`.

Per AGENTS.md: the Seal and revoke are mandatory, everything else can ship
static. End by running `node scripts/audit.mjs` and **looking at** the
screenshots.

## What needs attention beyond the phase order

- **A watchdog, urgently.** An OOM killed a foreign process on this shared VPS
  and took the PM2 daemon with it — all five apps died and the site served 502
  until `pm2 resurrect`. It was found by a failing test, not an alert. Nothing
  restarts PM2 itself. This is P11 work that matters more than its position
  suggests, because the judging window is two weeks long.
- **Supply.** Three of four categories clear the two-supplier bar, but yield has
  one and no third-party agent has passed any MCS test. `docs/SUPPLY-OUTREACH.md`
  ranks who to contact; regenerate it before using it.
- **Mainnet funding.** The deployer is empty by design. Nothing needs it until
  there is written approval.
