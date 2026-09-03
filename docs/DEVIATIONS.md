# Deviations

Every reduction, substitution or change of direction, logged under the AGENTS.md
degradation ladder. One entry each: **planned · shipped · why · cost · restore**.

This file is the phase report's appendix. If something in the plan is not in the
product, it is written down here.

---

## P0 — Foundation

### D0-01 · Domain is `marque.trade`, not `usemarque.xyz`

- **Planned** — `usemarque.xyz`, named throughout the master plan and AGENTS.md.
- **Shipped** — `marque.trade`. Caddy block, `packages/ui/src/brand.ts` and all
  copy use it.
- **Why** — Francis purchased `marque.trade`; the master plan itself flagged a
  two-word `usemarque.*` URL as slightly weak for a brand BNB might adopt, and
  recommended `marque.trade` as the upgrade if cheap. It was.
- **Cost** — None. The display name and domain live in one constant, which is
  exactly the case this indirection was built for.
- **Restore** — Change `BRAND.domain` / `BRAND.url` and the Caddy site block.

### D0-02 · `AGENTS.md` renamed from `Agents.md`

- **Planned** — Phase prompts say "if AGENTS.md does not exist, stop".
- **Shipped** — Renamed via `git mv`. Linux is case-sensitive, so the literal
  filename in the prompts did not resolve.
- **Why** — Every phase prompt opens by reading this exact path. A case mismatch
  would break the one file that survives a context reset.
- **Cost** — None.
- **Restore** — n/a.

### D0-03 · Ingest is two passes, not one; only service-declaring agents get detail

- **Planned** — "Paginate with limit/offset, normalize into agent +
  agent_service", implying one pass that fetches everything.
- **Shipped** — Pass 1 sweeps the list endpoint for **every** BSC agent (cheap,
  100 per request, gives honest funnel denominators). Pass 2 fetches the detail
  record **only** for agents whose cheap list columns declare a transport
  (`has_a2a` / `has_mcp` / `x402_supported`).
- **Why** — `services` exists only on the detail endpoint, so a single-pass
  ingest means one request per agent: 301,121 requests, over three days of the
  100k/day Pro budget. An agent declaring no transport can never be reachable,
  so the detail record cannot change its status. This makes a full index
  affordable — roughly 30k detail calls instead of 301k — without dropping a
  single agent from the funnel.
- **Cost** — An agent that declares no protocol in the list response but does
  carry a service in its detail record would be missed. Measured below; if that
  set turns out to be non-trivial, pass 2's candidate filter widens.
- **Restore** — Delete the `WHERE` clause in `enrichDetails`'s candidate query.

### D0-04 · Schema carries `funnel_snapshot`, beyond the five specified tables

- **Planned** — `agent`, `agent_service`, `agent_category`, `probe`,
  `ingest_cursor`.
- **Shipped** — All five, plus `funnel_snapshot`.
- **Why** — AGENTS.md gotcha 7 forbids hardcoding any registered→reachable
  ratio, and invariant 4 forbids fabricated metrics, but the homepage has to
  render that funnel. A dated table of measured stage counts is the only way to
  show it honestly: the UI divides two measured numbers and prints when they
  were taken. It is a first-party observation and is marked as such.
- **Cost** — One extra table.
- **Restore** — n/a; removing it would force a hardcoded ratio.

### D0-05 · Ports 3200/3201, not 3000/3001

- **Planned** — apex → `apps/web:3000`, `api.<domain>` → `apps/api:3001`.
- **Shipped** — web on **3200**, api reserved on **3201**.
- **Why** — This VPS is shared with several live projects. 3000, 3001, 3010,
  3100, 3101 are already bound (Archon, Sluice, Occestra, Assay). Binding 3000
  would have taken down a running product.
- **Cost** — None.
- **Restore** — n/a.

### D0-06 · Detail schema is permissive; only identity fields are strict

- **Planned** — "Zod on every external payload" (AGENTS.md, Security).
- **Shipped** — Zod still parses every payload, but on the detail record only
  the identity fields (`agent_id`, `chain_id`, `token_id`, `contract_address`)
  are strictly typed. Everything else is `z.unknown()` and coerced at the point
  of use.
- **Why** — This was found the expensive way. `health_status` ships as **both**
  a string and an object depending on the record. A strict schema rejected the
  whole agent over that one field, and the original `catch { return null }`
  swallowed the reason — so ~80% of enrichment candidates were silently
  discarded and permanently marked as fetched. The failure was invisible in the
  logs and only surfaced when the service count looked implausibly low.
- **Cost** — Slightly weaker compile-time guarantees on non-identity fields.
  Mitigated: every coerced field goes through an explicit coercion function, and
  parse failures are now counted and logged rather than swallowed.
- **Restore** — Do not. Re-tightening this re-introduces the data loss.

### D0-07 · Free-tier assumption dropped; Pro tier was already granted

- **Planned** — "Key from `SCAN_API_KEY` if present, otherwise anonymous",
  budgeting for 30 rpm and a possible wait for Pro approval.
- **Shipped** — The supplied key already carries Pro limits: **600 req/min,
  100,000 req/day**, confirmed from live `x-ratelimit-*` response headers.
- **Why** — Measured, not assumed. Anonymous fallback is still implemented.
- **Cost** — None; this is strictly more headroom than planned.
- **Restore** — n/a.

### D0-08 · `chain_id` filter *is* honoured, but server-side re-filtering was kept

- **Planned** — AGENTS.md gotcha 5: filters "are not reliably honoured", always
  re-filter on `chain_id === 56`.
- **Shipped** — Re-filtering kept exactly as specified, and the drop count is
  returned as `droppedOffChain` and logged every sweep. Measured reality on
  `/agents`: the filter **is** honoured — `droppedOffChain` has been 0 across
  every page swept so far.
- **Why** — The guard costs nothing and the gotcha may still hold on other
  endpoints. Reporting the drop count turns an assumption into a live
  measurement: if 8004scan ever regresses, the number moves off zero instead of
  quietly poisoning the index.
- **Cost** — None.
- **Restore** — n/a.

---

## P1 — Position readers

### D1-01 · Readers validated against real third-party addresses, not DEMO_ADDRESS

- **Planned** — "DEMO_ADDRESS is in env and has: one PancakeSwap V3 position,
  one Venus supply+borrow, idle USDT, and some BNB."
- **Shipped** — Validated against live third-party BSC mainnet addresses found
  by scanning `IncreaseLiquidity` and `Borrow` events. The deployer wallet is
  not yet funded, so no Marque-owned demo position exists.
- **Why** — Not a reduction; it is stronger evidence. Reading a stranger's
  position proves the reader works on arbitrary input, which is precisely what
  the functionality criterion tests. The master plan makes this point itself
  about the risky-Venus demo. It also removed funding from P1's critical path.
- **Cost** — None. `DEMO_ADDRESS` still plugs in unchanged once funded.
- **Restore** — n/a.

### D1-02 · Blocks per year is measured, not the Compound 3s constant

- **Planned** — Implicit in "APR" — Compound-family code conventionally
  hardcodes `blocksPerYear = 10_512_000` (3-second blocks).
- **Shipped** — Block time is measured from two real block timestamps on every
  read. BSC now produces a block every **0.45s**, i.e. **70,080,000 blocks a
  year**.
- **Why** — The conventional constant would have understated every Venus APR by
  a factor of 6.7. This was caught because the measured figure disagreed with
  the constant, and the measured one produces plausible rates (USDT 3.05%,
  USDC 2.92%) while the constant does not.
- **Cost** — Two extra `getBlock` calls per yield read.
- **Restore** — Do not.

### D1-03 · Yield venues are filtered for credibility, and exclusions are published

- **Planned** — "available venues: Venus supply markets, Lista, PancakeSwap V3
  farms".
- **Shipped** — Venus markets, with two guards: a market must hold at least
  $25,000 of cash, and must report an APR under 200%. Every excluded market is
  returned in an `excluded[]` array with its reason and detail, so the funnel is
  published rather than silently filtered (invariant 7).
- **Why** — Venus still lists a dead UST market that reports a supply APR of
  **1.05 × 10^14 %**. Ranked by APR it sorts first, so without this guard the
  headline yield on the site would have been a hundred-trillion-percent number
  from a market with $0 of liquidity. That is a fabricated metric reaching the
  product (invariant 4) by way of a real contract read.
- **Cost** — A legitimate new market with under $25k of cash would be hidden
  from the ranked list, though it still appears in `excluded[]` with the reason.
- **Restore** — Lower `MIN_CASH_USD`.

### D1-04 · Lista and PancakeSwap farm venues not yet implemented

- **Planned** — Yield reader covers Venus, Lista and PancakeSwap V3 farms.
- **Shipped** — Venus supply markets only. The `YieldVenue.protocol` field is a
  union already, so adding venues is additive rather than a refactor.
- **Why** — P1's timebox. Venus alone proves the load-bearing claim (net APR as
  a function of size, with real measured gas), and the other two are more value
  in the same shape rather than new capability.
- **Cost** — MCS-YIELD-1 compares "net APR across Venus/Lista/Pancake"; until
  the other two land, that test can only be run against Venus routes.
- **Restore** — Implement two more `YieldVenue` producers behind the same shape.

### D1-05 · Incentive APR is honestly zero, not estimated

- **Planned** — "DERIVE per venue: grossApr, incentiveApr, …".
- **Shipped** — `incentiveApr` is `0` with `ONCHAIN` provenance until a real XVS
  distribution reader exists.
- **Why** — Invariant 4. An estimated incentive APR is exactly the kind of
  plausible-looking fabricated number the constitution forbids. Zero-and-honest
  beats approximate-and-wrong, and the field is already in the shape it needs.
- **Cost** — Venus yields read slightly low against sites that include XVS.
- **Restore** — Read the Venus distribution speeds and fill the field.

### D1-06 · The "negative net APR" wedge on BSC is holding period, not size

- **Planned** — "A 6.8% APR on $200 is negative after gas and the UI has to be
  able to say so."
- **Shipped** — The model does return negative net APR, and the acceptance test
  proves it. But the premise needs correcting for BSC: a round trip into Venus
  costs about **$0.021** at a 0.05 gwei base fee, so a simple supply held for a
  year only turns negative below roughly **$0.70**, not at $200.
- **Measured** — for the live USDT market at 3.051% gross:
  - $0.10 for a year → **−18.4%**; $0.50 → **−1.2%**; break-even **$0.70**
  - $200 held **one day** → **−0.86%**
  - $10,000 held one week through a 30bps swap → **−12.6%**
- **Why this matters** — The Yield category's honest wedge on BSC is
  **holding period and swap cost**, not gas-versus-size. `netAprAtSize` takes a
  holding period for exactly this reason. The UI copy should say "you will lose
  money moving this for a week", not "your position is too small".
- **Cost** — None to the code; it is a correction to the pitch.
- **Restore** — n/a.
