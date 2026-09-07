# Deviations

Every reduction, substitution or change of direction, logged under the AGENTS.md
degradation ladder. One entry each: **planned · shipped · why · cost · restore**.

This file is the phase report's appendix. If something in the plan is not in the
product, it is written down here.

---

## REC — Rebuild after VPS compromise (2026-09-07)

The host was root-compromised (miner + `ld.so.preload` rootkit, contained twice)
and reprovisioned. The clean-rebuild bundle carried only `database/marque.dump`
and three unrelated files; every `.env`, wallet and keystore was excluded by
design. What follows is what changed on the way back up.

### REC-01 · Secrets and the operator wallet were regenerated, not restored

- **Planned** — `/root/.marque/secrets.env` and `agents/*/.studio/` keystores
  restored from backup.
- **Shipped** — Neither was in the recovery bundle. `secrets.env` was rebuilt by
  hand from the AGENTS.md env registry plus the keys Francis re-supplied. A fresh
  throwaway testnet operator wallet was generated: **`0x9598AB46aAB33389C2e9Ffe0511effD330f67F9B`**.
  It holds no tBNB yet, so charter grant / revoke / receipt-anchor transactions
  are blocked until it is funded.
- **Why** — The excluded credentials do not exist anywhere the rebuild can reach.
- **Cost** — The 12 charters, 10 receipts and 10 sealed calls in the restored DB
  were signed by the previous operator key. They remain readable and on-chain,
  but cannot be revoked from the new key. Acceptable: all testnet, and fresh
  charters grant cleanly once the wallet is funded.
- **Restore** — Fund `0x9598…7F9B` from a BSC testnet faucet. If the old
  `secrets.env` resurfaces, its `MARQUE_TESTNET_PK` can be swapped back in.

### REC-02 · The five reference agents are not yet re-registered on ERC-8004

- **Planned** — Bound / Lattice / Sluicegate / Keel / Redcell live and registered
  as ERC-8004 #2160–2164 (per D8-05).
- **Shipped** — Their `.studio` keystores are gone, so the agent wallets that own
  #2160–2164 cannot sign. The agent source still builds and runs; the Register
  lists them from our own registry, not from an 8004scan lookup.
- **Why** — Keystores were excluded from the recovery bundle.
- **Cost** — Until re-registration, the reference agents are not discoverable via
  ERC-8004 identity resolution. Registration is discovery, not capability
  (D8-05): they still answer, and MCS results for them are in the restored DB.
- **Restore** — Generate five fresh agent wallets, fund them, re-run
  `scripts/register-when-up.sh`. New token ids; update the D8-05 table and any
  doc that cites #2160–2164.

### REC-03 · Database restored from the post-incident dump, not rebuilt from chain

- **Planned** — Derived state (invariant 12) is rebuildable from ingest cursor
  zero; first-party observations come from backup.
- **Shipped** — `marque.dump` (SHA-256 verified against the recovery manifest)
  restored whole into a non-superuser `marque` role in an isolated database.
  `pg_restore --list` showed only tables, sequences, constraints and indexes —
  no functions, extensions or triggers. Row counts: 298,817 agents, 871,252
  probes, 168 conformance results (21 passes), 12 charters, 10 receipts, 10
  sealed calls, 4 benchmarks / 17 runs, 306 funnel snapshots, 9,517 pool-tick
  observations. Newest `funnel_snapshot` is dated 2026-09-07 09:55.
- **Why** — The first-party observations (probe history, conformance results,
  warrants, Ledger manifests, receipts, pool-tick history) can never be
  recreated (invariant 12), and the Register / Standard / Ledger surfaces are
  meaningless without them. The derived tables get overwritten by the next
  ingest sweep regardless, so any tampering there does not persist.
- **Cost** — "Rebuilt from chain" is not literally true for this deployment
  until a full re-ingest runs. The recovery README is explicit that a clean
  transfer does not prove the data was never modified by the attacker.
- **Restore** — Run `marque-ingest` from cursor zero before judging to refresh
  every derived row; the first-party tables stay untouched.

### REC-04 · Drizzle migration bookkeeping was two rows behind its own schema

- **Planned** — `__drizzle_migrations` matches the migrations on disk.
- **Shipped** — The dump's schema already had migrations 0007 and 0008 applied
  (the `benchmark_run.batch` column, `pool_tick_observation`, `pool_watch`), but
  `drizzle.__drizzle_migrations` held only 7 rows. Two bookkeeping rows were
  inserted with the correct file hashes and journal timestamps so the migrator
  is a clean no-op. No DDL was replayed.
- **Why** — Running the migrator without this would have re-applied 0007/0008 and
  failed on "already exists".
- **Cost** — None. Schema and bookkeeping now agree.
- **Restore** — n/a.

### REC-05 · `pnpm-lock.yaml` gained two workspace links

- **Planned** — Lockfile is in sync with every `package.json`.
- **Shipped** — `apps/web` declares `@marque/agent-engines` and `@marque/ledger`
  as `workspace:*` dependencies that were absent from the committed lockfile. A
  fresh `pnpm install` added the two `link:` entries. This is a correction; a
  `--frozen-lockfile` CI run would have failed on the old file.
- **Why** — Pre-existing inconsistency, surfaced by installing on a clean box.
- **Cost** — None.
- **Restore** — n/a.

### REC-06 · `next dev` is not usable here; the app runs from the standalone build

- **Planned** — n/a (no doc mandates a dev-server workflow).
- **Shipped** — `next dev` (webpack) cannot resolve the workspace CSS `@import`
  in `globals.css`; `next dev --turbo` ignores the `webpack()` config in
  `next.config.mjs` and fails every `./x.js`→`./x.ts` workspace import. Iteration
  is `scripts/build-web.sh` + `pm2 reload marque-web`, which is the production
  path anyway (AGENTS.md gotcha 4).
- **Why** — Known Next 15 limitations; not worth destabilising the shipped
  config for a dev convenience (invariant 16).
- **Cost** — ~90s per visual iteration instead of hot-reload.
- **Restore** — A future `next.config` with a matching `turbo.resolveAlias`
  block, verified against `next build`, would restore hot reload.

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

### D1-07 · `{agentId}` resolves to the token id, not the composite agent id

- **Planned** — AGENTS.md gotcha 9: "resolve templates from the agent's own
  metadata before calling."
- **Shipped** — Templates resolve `{agentId}` to the bare ERC-8004 **token id**.
- **Why** — The composite `chain:registry:token` id is the primary key
  everywhere else, so it is the natural substitution, and it returns 404. So do
  the TermiX account id and the agent name. Only the bare token id returns 200.
  Since 763 of 767 indexed A2A endpoints are templated, getting this wrong makes
  the entire A2A supply on BSC read as dead. See docs/FINDINGS.md F-02.
- **Cost** — A publisher that means the composite would now mis-resolve. The
  composite is still exposed as `agentIdFull`, and P2's probe should try
  candidate resolutions and record which one answered.
- **Restore** — n/a.

---

## P2 — Probe and classifier

### D2-01 · Liveness is a four-way verdict, not a boolean

- **Planned** — "record ok, latency_ms, status_code, failure_class" with
  failure classes `dns | tls | timeout | 4xx | 5xx | bad_schema | blocked_ssrf |
  empty_tools`.
- **Shipped** — All of those, plus a `liveness` column with four values
  (`live | unbound | bad_schema | dead`) and a new failure class `unbound`.
- **Why** — docs/FINDINGS.md F-01. On BSC the dominant failure is an endpoint
  that answers 200, fast, with a valid agent card describing an agent that was
  never bound to a runtime. `ok = true` would be a lie and `ok = false` would
  blame a healthy endpoint. Neither is true, so the schema gained a word for it.
- **Cost** — One extra column and a slightly larger taxonomy.
- **Restore** — n/a.

### D2-02 · LLM classification pass (pass 2) not yet run

- **Planned** — "for anything still unclassified WITH a live endpoint, one LLM
  call over its metadata returning a strict Zod-validated
  {category, confidence, reason}".
- **Shipped** — Pass 1 (deterministic) only. The pass-2 gate is implemented in
  `candidates(limit, onlyLive)`, which already restricts to agents with a live
  endpoint; the LLM call itself is not wired.
- **Why** — The population pass 2 exists to serve is currently tiny: only a
  handful of distinct live third-party hosts exist on BSC, and each has been
  read by hand. Spending LLM budget to classify agents that are unreachable is
  explicitly wasteful, and the phase timebox is better spent on the supply-gap
  measurement Francis asked for.
- **Cost** — A live agent whose metadata avoids every taxonomy term stays
  `unclassified`. Given the measured live set, this currently affects a
  countable number of agents rather than a population.
- **Restore** — Implement the call behind `classifySemanticPass()`; the gate,
  storage, `method: 'semantic'` value and confidence field already exist.

### D2-03 · Classification requires a strong, category-defining term

- **Planned** — "deterministic keyword/skill/tag map".
- **Shipped** — The map, plus a rule that a category must match at least one
  `strong` term, not merely accumulate weak ones.
- **Why** — Found in review of real output. `CoinAnk.agent`, a market-data
  service, was labelled **health_factor** at confidence 1.00 because its copy
  contains the weak term "liquidation" — it reports liquidation *volumes*; it
  does not monitor anyone's loan. A false positive in this product recommends
  the wrong agent for someone's money, so precision beats recall here.
- **Cost** — Recall drops. An agent that describes itself only in weak terms is
  left unclassified rather than guessed at.
- **Restore** — Set `REQUIRE_STRONG_TERM = false` in `taxonomy.ts`.

### D2-04 · Census coverage is partial and the reports say so

- **Planned** — Implicitly, a complete funnel.
- **Shipped** — A complete funnel *of what has been enriched so far*, with the
  coverage percentage printed at the top of `docs/SUPPLY-OUTREACH.md` and
  returned by the API.
- **Why** — Service endpoints exist only on 8004scan's detail record, so supply
  can only be counted for agents that have been enriched, and enrichment is
  rate-limited to a few hundred a minute against a candidate pool of ~53,000.
  8004scan also spent part of this phase returning HTTP 500. Every supply number
  is therefore a **lower bound** and will rise. Publishing it without that
  caveat would be presenting an incomplete census as a complete one.
- **Cost** — The headline third-party count understates real supply until the
  queue drains (a few hours, unattended).
- **Restore** — n/a; the caveat disappears on its own as coverage reaches 100%.

### D2-05 · Deploying rebuilds in place, which drops the web process

- **Planned** — not specified.
- **Shipped** — `scripts/build-web.sh` builds into `.next/` under the running
  app, so `server.js` briefly does not exist and PM2 restart-loops until the
  build finishes. Observed: 32 restarts across one rebuild. The site recovered
  on its own and was serving 200s immediately afterwards.
- **Why** — Speed during the build phase.
- **Cost** — Roughly 30–60 seconds of 502s per deploy. Unacceptable during the
  9–23 Sep judging window, when a judge could hit it.
- **Restore** — P11: build to a staging directory, then swap it in and
  `pm2 reload` for a zero-downtime cutover.

---

## P3 — Conformance

### D3-01 · Cases are materialised, not re-read from a pinned block

- **Planned** — "picks a PINNED test case (real mainnet position, fixed block
  number); computes GROUND TRUTH itself using packages/positions at that block".
- **Shipped** — Ground truth is computed from chain state exactly as specified,
  but it is then **frozen** into `conformance_case` with its block number and a
  hash. Every agent is graded against that identical snapshot.
- **Why** — Measured: every free BSC RPC endpoint retains only **64 blocks** of
  state, about 30 seconds at 0.45s blocks. Re-reading a pinned block a minute
  later fails on all six providers tested. Archive access is a paid tier, which
  is a hard escalation gate (AGENTS.md gate 2, new recurring cost).
- **Cost** — A case cannot be re-derived from chain by us. Mitigated: the block
  number and a hash of the snapshot are published with every result, so anyone
  with archive access can verify it. Freezing is also *stronger* for fairness —
  every agent sees byte-identical inputs, which re-reading cannot guarantee
  because the chain moves between runs.
- **Restore** — Point `BSC_RPC_URLS` at an archive provider and grade against a
  live re-read; the case row already carries everything needed.

### D3-02 · A2A is a two-step protocol, and the first implementation got it wrong

- **Planned** — "sends the agent the same question over its adapter".
- **Shipped** — The adapter now GETs the agent card, reads the callable endpoint
  from its `url` field, and POSTs `message/send` there.
- **Why** — The first implementation POSTed JSON-RPC directly at
  `/.well-known/agent-card.json`. Every third-party agent returned 404, which
  reads exactly like a broken agent and was in fact a broken client. Publishing
  those results would have libelled roughly thirty real projects.
- **Cost** — None.
- **Restore** — n/a.

### D3-03 · An absent answer is not a decline (vacuous pass)

- **Planned** — MCS-YIELD-1 treats a correct refusal to recommend as a pass,
  which is right: an agent that says "nothing beats your position by enough" is
  obeying the supplied policy.
- **Shipped** — A decline must now be **explicit** (`recommend: false`). A
  response with no `recommend` field fails.
- **Why** — Caught in the first real run. A live third-party agent returned no
  recognisable fields at all and scored **PASS** on MCS-YIELD-1, because the
  absent field read as "declined" and every later check returned early. A
  standard that cannot distinguish silence from a decision certifies nothing.
- **Cost** — None.
- **Restore** — Do not.

### D3-04 · MCP agents are reported as "no compatible interface", not graded wrong

- **Planned** — Run the tests against whatever real agents exist.
- **Shipped** — MCP servers are inspected for a tool that plausibly answers a
  position question. Where none exists, the result records
  `no_compatible_interface` rather than a graded failure.
- **Why** — MCP exposes named tools, not a free-form task endpoint. Calling an
  unrelated tool and grading its answer as wrong arithmetic would attribute our
  own mis-addressing to the agent. The distinction matters because these results
  are published.
- **Cost** — An MCP agent that could answer via an unusually-named tool is
  recorded as untestable rather than tested.
- **Restore** — Widen the tool-matching heuristic in `mcpAdapter`.

---

## P4 — Frontend, daylight surfaces

### D4-01 · `/mnt/skills/public/frontend-design/SKILL.md` does not exist here

- **Planned** — "read /mnt/skills/public/frontend-design/SKILL.md and follow it".
- **Shipped** — `/mnt` does not exist on this VPS and no skill by that name is
  installed. AGENTS.md §8 (Design & front-end) was used as the brief instead,
  which is considerably more specific to this product than a generic skill would
  be: it names the tokens, the type scale, the signature device, the motion
  budget and an explicit list of forbidden templated tells.
- **Cost** — Any guidance in that skill not already covered by AGENTS.md §8 is
  missing. Worth a second pass if the file can be supplied.
- **Restore** — Provide the file and re-read it.

### D4-02 · Signal colours carry a per-surface text variant

- **Planned** — The token block in AGENTS.md gives one value per signal.
- **Shipped** — Each signal has a `-mark` value (exactly as specified, used for
  measure markers, rules and borders) and a text value that changes between
  daylight and cockpit.
- **Why** — Measured by the audit script: `--watch` at `#B8721A` gives 3.27:1 on
  `--paper`, and `--chain` at `#2B5A85` gives 2.56:1 on `--deck`. Both fail WCAG
  AA and are genuinely hard to read at 11.5px. One value cannot serve both
  surfaces, and adapting per surface is exactly what the ground/ink/rule tokens
  already do.
- **Cost** — Two extra token names per signal.
- **Restore** — Do not; this fixes a real legibility failure.

### D4-03 · `/_ui` is a `%5Fui` folder

- **Planned** — "Storybook-style page at /_ui".
- **Shipped** — The route serves at `/_ui` exactly as specified, but the folder
  is named `%5Fui`.
- **Why** — Next.js App Router treats an underscore-prefixed folder as a private
  folder and excludes it from routing, so `app/_ui/page.tsx` returned 404. The
  URL-encoded folder name is Next's own documented escape hatch.
- **Cost** — A slightly odd folder name.
- **Restore** — n/a.

### D4-04 · Category counts are distinct suppliers, not registrations

- **Planned** — "the four categories as PROBLEMS with live qualified-agent
  counts".
- **Shipped** — The count is **distinct callable suppliers**, by endpoint host.
  The registration count is returned alongside and the page says which it shows.
- **Why** — The first version reported "42 callable" for Rebalancing. There were
  **7**. One operator registers the same endpoint under dozens of ERC-8004
  identities, so a registration count quotes our own inventory at roughly six
  times its real size. This is the same inflation the supply report already
  guards against, and it had leaked into the headline number on the homepage.
- **Cost** — The headline numbers are smaller, and true.
- **Restore** — Do not.

### D4-05 · Sections with no data ship empty states, not mock data

- **Planned** — "a real live charter card (placeholder state until P6)",
  "two real Ledger rows (empty state until P8)".
- **Shipped** — Empty states that name what is missing, why, and which phase
  brings it. No mock charter, no illustrative Ledger row, no fake receipts, and
  the Tape does not render at all rather than showing invented activity.
- **Why** — Invariant 4, and the specific risk that a screenshot of a mock
  charter ends up in a submission. An honest empty state is also a better
  argument than a fake row: it says the product does not invent things.
- **Cost** — The page has more empty space until P6 and P8 land.
- **Restore** — n/a.

### D4-06 · `/standard` is not yet a route

- **Planned** — Implied by the audit route list and linked from `/`.
- **Shipped** — The standard is generated and committed at
  `docs/standard/MCS-v1.0.md` (P3), and `/standard` is linked but not yet built
  as a page.
- **Why** — P4's brief is 4a–4d and ends at the agent profile. The link is left
  in place because the content genuinely exists in the repo.
- **Cost** — One link on `/` currently 404s.
- **Restore** — Render the generated Markdown at `/standard`. Small.

---

## P5 — Execution

### D5-01 · No TermixExecutor, exactly as instructed — and it was not needed

- **Planned** — The phase brief explicitly says do NOT build one, and that
  A2AExecutor must handle TermiX agents via a generic template resolver.
- **Shipped** — Exactly that. `executorFor()` maps `termix` to `A2AExecutor`,
  and the `{agentId}` resolver lives in `packages/registry` (built in P0).
- **Cost** — None.
- **Restore** — n/a.

### D5-02 · A2A endpoint resolution refuses to guess

- **Planned** — "agent card resolution, JSON-RPC task send, artifact retrieval".
- **Shipped** — Card resolution reads the `url` field. Where a card names no
  callable endpoint, the executor returns `no_compatible_interface` rather than
  falling back to the service origin.
- **Why** — The first version fell back to the origin. TermiX cards name no
  `url` at all, so it POSTed JSON-RPC at a page that is not an A2A endpoint, and
  the resulting garbage failed all five MCS fields — attributing our own
  mis-addressing to twenty real projects. This is the third instance of the same
  class in this build (P3: POSTing at the card; P3: silence read as a decline).
  The rule now applied everywhere: **never guess on behalf of a counterparty,
  because the guess gets published as their failure.**
- **Cost** — Agents whose card omits `url` are reported untestable rather than
  tested. That is the true statement.
- **Restore** — Do not.

### D5-03 · A hire is graded only when it asks the published case's question

- **Planned** — "validate the result against the relevant MCS test".
- **Shipped** — The result is graded against the live MCS case **only when the
  hire's policy matches the case's policy**. Otherwise the receipt's quality
  proof is null, meaning "not graded against the published standard".
- **Why** — Caught in the acceptance run. A hire asking for health factor 1.6
  was graded against a case that fixes 2.5. It **passed** — because the
  reference agent's target parser had silently defaulted to 2.5 and returned the
  case's answer. The grade certified the bug. A published case fixes a subject,
  a block AND a policy; grading a different question against it is meaningless
  in both directions.
- **Cost** — Hires with bespoke policies carry no warrant. Correct: they were
  not tested against anything published.
- **Restore** — Do not.

### D5-04 · Reference agent Keel is served publicly, not on loopback

- **Planned** — Implied by "three end-to-end runs against our own reference
  agent".
- **Shipped** — Keel runs on 127.0.0.1:8610 and is exposed at
  `https://marque.trade/agents/keel/`, reached through the same `safeFetch`
  guard as any third party.
- **Why** — `safeFetch` blocks loopback, which is correct, so our own agent was
  unreachable from our own pipeline. The fix is to serve it properly rather than
  to carve an exception into the SSRF guard for first-party endpoints — that
  exception is exactly how such guards rot.
- **Cost** — One Caddy path.
- **Restore** — n/a.

### D5-05 · ERC-8183 write paths are described, not executed

- **Planned** — "job create, fund, provider fulfil, buyer settle".
- **Shipped** — The settlement asset is resolved from the deployed kernel at
  runtime (`token_symbol` / `token_decimals` / `token_balance`), exactly as
  gotcha 13 requires. Every WRITE path returns `blocked` with the job it *would*
  create, including the resolved asset and the buyer's balance.
- **Why** — Two reasons. Creating and funding a job is an on-chain state change,
  which on mainnet is escalation gate 1; and no ERC-8183 kernel address has been
  supplied for BSC testnet yet, so there is nothing to write to. Settlement is
  additionally never automated: releasing money to a provider is the buyer's
  decision, and the code says so rather than implying it.
- **Cost** — P5 acceptance (b) has no ERC-8183 counterparty. No kernel was found
  among indexed BSC agents either, so this is an absence of supply as much as an
  absence of implementation.
- **Restore** — Supply a testnet kernel address and set `allowWrites` with a
  funded signer.

### D5-06 · MarqueRegistry deployed to BSC testnet — RESOLVED

- **Shipped** — Deployed to BSC testnet (97) at
  **`0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7`**, deploy tx
  `0x068f9474ee84dd19e9dc0d945a92a4c947f803a4235eb0304e70aee5622ac931`.
  14 Foundry tests green including fuzzing.
- **Verified against the live contract, not just in tests:** a real P5 receipt
  hash was anchored (tx `0x8b0da973e1203949e9a0046c09a50aeabd0311bf6aa60c36fde2f787e935414c`),
  read back as anchored at block 129,051,524; a sealed call was written
  (tx `0x67964616eb3cac4ad39e66ac509779137016e160d9ee20be8ea46b4ec273b9fd`)
  and **re-sealing the same hash did not move its block** — the immutability
  guarantee the sealed-call track record depends on, confirmed on real chain
  state rather than in a test harness.
- **Mainnet:** not deployed. Escalation gate 1, requires written approval.

---

## P6 — Charters (bounded authority)

### D6-01 · Altana works; P6-lite is built and proven anyway

- **Planned** — "TIMEBOX 8 HOURS. If Altana integration is not working by then,
  ship P6-LITE."
- **Shipped** — **Both.** Altana integrated well inside the timebox, with real
  grant, execution, refusal and revocation transactions on BSC testnet. The
  P6-lite `RegistryCharterService` is also complete and exercised through the
  same acceptance script.
- **Why build the fallback anyway** — It cost about twenty minutes because the
  work was done against `CharterService` from the start, and a fallback written
  *after* an SDK has burned a day is written under pressure. It also gives the
  product a second, independent path if Altana's testnet relay is unavailable
  during judging.
- **Cost** — One extra provider to keep compiling.
- **Restore** — n/a.

### D6-02 · P6-lite anchors the policy but does not enforce it at a validator

- **Planned** — "identical UI, identical revoke, identical on-chain visibility".
- **Shipped** — Identical interface, identical revoke, and the policy hash and
  its revocation are both anchored on MarqueRegistry and publicly readable.
- **The difference, stated rather than glossed** — Altana's sessions revert **at
  the on-chain validator**; a call outside the allowlist cannot be included.
  P6-lite enforces the allowlist and cap **in the service, before signing**. The
  policy is publicly auditable either way, but only one of them is enforced by
  the chain, and the UI must say which is in use rather than let a reader assume
  equivalence.
- **Cost** — P6-lite is a weaker guarantee. It is the fallback, not the plan.
- **Restore** — n/a; Altana is the shipped path.

### D6-03 · Refusal reasons are classified from real relay responses

- **Planned** — Implicit in "an attempt to call a contract outside the
  allowlist, rejected".
- **Shipped** — Refusals are classified into `revoked` / `expired` / `over_cap`
  / `outside_allowlist`, from patterns observed in actual relay output.
- **Why** — The first classifier reported `over_cap` for a **revoked** charter,
  because the relay's message ("key hash … is unknown") happened to contain a
  word its regex matched. Telling a buyer they hit a spend cap when their
  authority was revoked is a false explanation of why they were stopped. A
  wrong specific reason is worse than an honest vague one, so anything
  unmatched now stays `unknown`.
- **Cost** — None.
- **Restore** — n/a.

### D6-04 · Session keys are held in memory, never written to our database

- **Planned** — Not specified.
- **Shipped** — `Session` objects live in the granting process for its lifetime.
  Our database stores the charter's public facts (id, allowlist, cap, expiry,
  tx hashes); the durable, publicly verifiable record is the Keystore entry.
- **Why** — A session key is signing material. AGENTS.md is explicit that keys
  are never written where the repo can see them, and a session key in a database
  row is a session key in every backup of that database.
- **Cost** — A charter cannot be executed from a different process than granted
  it. Acceptable now; if it becomes limiting, the fix is a keystore, not a
  database column.
- **Restore** — Do not.

### D6-05 · ERC-8183 buyer side and x402-server not attempted

- **Planned** — "Bonus (do it if the first five land cleanly)".
- **Shipped** — Not attempted. The SDK exports `hireErc8183Agent`,
  `submitErc8183Deliverable` and `settleErc8183Job`, and testnet has a $U faucet
  paying 10 $U per address every 30 minutes, so the path is open.
- **Why** — The five required items landed and were verified on chain; the bonus
  is genuinely optional and P7 is the higher-value next move. Recorded rather
  than silently skipped.
- **Restore** — `hireErc8183Agent(wallet, signer, { provider, task, budget })`
  against the testnet kernel, funded from the $U faucet at
  `0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3`.

### D6-06 · An OOM event took every PM2 process down, and PM2 did not come back

- **Observed** — Mid-P6 the whole site returned 502 and `pm2 list` was **empty**.
  Cause: the kernel OOM-killer fired
  (`Out of memory: Killed process 1359616 (systemx86)`, ~2.1 GB RSS). The killed
  process was **not one of ours** — this VPS is shared with several projects —
  but the PM2 daemon died with it, taking `marque-web`, `marque-ingest`,
  `marque-probe`, `marque-classify` and `marque-keel` with it.
- **Recovered** — `pm2 resurrect` restored all five from the saved dump; the
  site and the reference agent returned 200 immediately.
- **Why it matters** — PM2 restarts a crashed *app*, but nothing was restarting
  PM2 itself. `pm2 startup` is configured, so a reboot is covered; a daemon
  death without a reboot was not. During the 9–23 Sep judging window this is the
  difference between a blip and a judge finding a dead site.
- **Cost** — Unknown downtime; it was found by a failing test, not by an alert,
  which is itself the finding.
- **Fix (P11)** — A systemd watchdog that checks `/api/health` and the reference
  agent every 60s and runs `pm2 resurrect` when the daemon is absent, plus an
  alert. Deploy downtime (D2-05) folds into the same work.

---

## P7 — Cockpit UI

### D7-01 · The web app grants charters through the REGISTRY provider, not Altana

- **Planned** — P6 proved both `CharterService` implementations on testnet.
  The obvious default for P7 was Altana, because it carries a prize.
- **Shipped** — The web process constructs `RegistryCharterService` (P6-lite),
  and the UI names the provider on every charter and states plainly what it does
  and does not give you.
- **Why** — Altana's implementation holds its session signer in process memory
  by design, which is right for a key and wrong for a marketplace whose only
  revoke path runs through it. A charter granted before a deploy would come back
  after the deploy with a revoke button that could not work. The registry
  provider signs with the operator key against a durable Postgres record, so a
  charter survives a restart with its revoke intact.
- **Cost** — The Altana prize track is not exercised by the live UI. The policy
  is anchored on chain and publicly readable either way, but it is enforced by
  Marque before signing rather than by a validator, and the Authority tab and
  the receipt both say so rather than letting a reader assume equivalence.
- **Restore** — Set `MARQUE_CHARTER_PROVIDER=altana` once Altana sessions can be
  rehydrated across processes, or once a resident signer process exists for them
  to live in. One implementation of one interface; no surface changes.

### D7-02 · Public grants are rate limited, and the cap is deliberately small

- **Planned** — Nothing was specified.
- **Shipped** — Two grants a minute per client, and a durable 40-a-day ceiling
  counted in Postgres.
- **Why** — Granting writes a transaction and the testnet wallet holds a finite
  amount of tBNB. An unmetered public grant button drains the faucet, and the
  failure lands during judging.
- **Cost** — A determined visitor can exhaust the daily ceiling. The message
  says so in plain words and points at the charters already granted, which are
  all still real and still revocable.

### D7-03 · Receipt hashes are SHA-256, and the page says SHA-256

- **Observed** — `receiptHash()` has always used SHA-256 over the canonical
  receipt; a comment in that file called it "keccak-style", and the phase brief
  calls the anchored value "the keccak leaf".
- **Shipped** — The receipt page names it as SHA-256 over the canonical form.
- **Why** — Both are 32 bytes and both anchor identically, so nothing about the
  proof changes. But a page that says keccak while computing SHA-256 gives a
  verifier the wrong recipe, and a hash nobody else can reproduce proves nothing.
- **Cost** — None. **Restore** — n/a; switching to keccak256 would be a one-line
  change in `packages/execution/src/receipt.ts` plus this label.

### D7-04 · The Run Room timeline shows only events the pipeline emitted

- **Planned** — "Timeline with real timestamps as events stream in."
- **Shipped** — Exactly that, and nothing else. There is no synthesised
  "connecting…", no interpolated progress, and a run that produced two events
  shows two.
- **Why** — Invented intermediate steps are a fabricated metric wearing a clock
  (invariant 4). A two-line timeline that is true is worth more than a ten-line
  one that is decorated.
- **Cost** — A fast failure looks sparse. That is the honest shape of a fast
  failure.

---

## P8a — Reference agents

### D8-01 · Agents are served on paths, not subdomains

- **Planned** — `bound.<domain>`, `lattice.<domain>`, `sluicegate.<domain>`,
  `keel.<domain>`, `redcell.<domain>`, each its own Caddy site.
- **Shipped** — `https://marque.trade/agents/<name>/`, one Caddy block, five
  reverse proxies to 8610–8614. All five return 200 on `/health` and serve a
  real agent card at `/.well-known/agent-card.json`.
- **Why** — Five subdomains are five DNS records and five certificate issuances
  on a domain that already carries the live product two weeks before judging.
  A wildcard would need a DNS-01 challenge and an API token for the registrar,
  which is new credential surface for zero user-visible gain. Nothing in the
  ERC-8004 or A2A resolution path cares whether an agent is a host or a path.
- **Cost** — The agent cards advertise a path, so an agent cannot later be moved
  to its own host without the card URL changing, and a card URL is what a
  registry stores. Moving after registration means re-registering.
- **Restore** — Five A records, five Caddy blocks, and `AGENT_PUBLIC_URL` per
  agent in `ecosystem.config.cjs`. Roughly an hour, best done before any
  mainnet registration rather than after.

### D8-02 · Redcell took the Archon fallback in the first hour, not the fourth

- **Planned** — Extract the smallest portable engine from Archon — the finding
  schema, the severity model, and whichever of the Slither/solc pipeline runs
  cleanly against BscScan-verified source — with a four-hour timebox.
- **Shipped** — The finding schema, the severity model and the dedupe key were
  ported. The Slither/solc pipeline was not, and the fallback agent named in
  AGENTS.md was built instead: approval-risk and privileged-function triage
  (unlimited approvals, ownable/privileged selectors, proxy status,
  pausability, mint authority, blacklist functions).
- **Why** — The port could not be clean, and the reason was dependencies rather
  than effort: `solc` and `slither` are not installed on this VPS and a BscScan
  API key is a new external dependency. Installing a Python toolchain and
  fetching verified source for a security agent is a day, not four hours. The
  timebox exists precisely for this, so it was taken immediately rather than
  burned down first.
- **Cost** — No dataflow analysis, no reentrancy detection, no bytecode
  decompilation. Redcell triages authority and approvals; it does not audit.
  Every response says so.
- **Restore** — `apt install solc`, `pipx install slither-analyzer`, a BscScan
  key in the env registry, and the Archon pipeline behind the same `Engine`
  interface. The interface was built to accept it.

### D8-03 · Redcell ships with no MCS test, and is listed as untested

- **Planned** — "Each must PASS its own MCS test before being listed. If one
  fails, list it as failing."
- **Shipped** — Four of five are tested and all four pass. Redcell is published
  as **NOT TESTED**, with the reason on the page rather than a silent omission.
- **Why** — AGENTS.md invariant 8 is explicit: if a check cannot be written as
  an assertion with a numeric tolerance, it does not belong in MCS. There is no
  security question with one right answer and a tolerance — "is this contract
  safe" is judgement, and judgement belongs in the Ledger. Writing an MCS test
  for our own security agent that no third party could be measured against
  would be worse than having none: it would manufacture a warrant.
- **Cost** — The highest-priced agent (0.25U) carries no warrant. That is the
  honest state and the marketplace shows it.
- **Restore** — Not by writing an MCS test. Redcell's evidence belongs in the
  Ledger as ADV-01, graded against a pre-registered rubric versus a manual
  analyst, which is exactly what P8b builds.

### D8-04 · Four of 250 latency calls did not answer, and are reported as refusals

- **Planned** — p95 < 8s over 50 real calls each.
- **Shipped** — All five pass with large margin (worst p95 888ms). 246 of 250
  calls answered; 4 returned a structured refusal because a BSC public RPC was
  momentarily unreadable (`comptroller_unreadable`, and one upstream 400).
- **Why** — Not a deviation in the result but in what the number means, and the
  distinction is the product: an agent that cannot read the chain says so.
  Every one of the four is a legible refusal naming the upstream, not a
  fabricated answer and not a hang. Invariant 4 makes that the only acceptable
  behaviour, and gotcha 11 predicted the cause.
- **Cost** — A buyer sees an occasional refusal under RPC degradation. The
  alternative — retrying silently until an answer appears — would hide a real
  property of the network behind a better-looking number.
- **Restore** — n/a. Widening the RPC pool reduces the rate; it should never
  reach zero by suppression.

### D8-05 · ERC-8004 registration is blocked by an 8004scan outage, not shipped

- **Planned** — Acceptance (a): all five agents live, **registered on BSC**,
  passing their MCS tests.
- **Shipped** — Live: yes, all five. Passing: four of five, with the fifth
  published as untested (D8-03). **Registered: no.** The five agent wallets are
  funded with 0.01 tBNB each and `scripts/register-agents.sh` is the one
  remaining command.
- **Why** — `bag erc8004 register` brokers registration through the 8004scan
  API, and 8004scan's database is down: a plain authenticated read of
  `/api/v1/agents?chain_id=56&limit=1` returns 500 `{"code":"DATABASE_ERROR"}`
  with a key that has worked all week. Three hypotheses were tested — global
  outage, our key, our code — and the failure is theirs: their host routes
  fine, our key is unchanged, and our own site still serves from its database.
  There is no direct-to-contract path in the CLI to route around it.
- **Cost** — The reference agents are not discoverable through ERC-8004
  identity until this runs. Nothing else depends on it: they are reachable,
  they answer, they pass conformance, and the marketplace lists them from our
  own registry. Registration is discovery, not capability.
- **Restore** — `./scripts/register-agents.sh` once 8004scan answers 200. Under
  five minutes, and it is idempotent per agent.
- **RESOLVED 2026-09-05 17:54 CEST.** Two things were wrong, not one. The SDK
  calls `www.8004scan.io/api/v1/agents` with **no API key at all** — the host
  308-redirects to the API, arriving unauthenticated, and unauthenticated reads
  now fail. That is an SDK bug and no paid tier would fix it, because no key is
  ever sent; `chunk-TKWQT3DN.js` in the globally installed SDK is patched to
  forward `SCAN_API_KEY` (original kept as `.orig`). On top of that their
  database was genuinely flapping — the same keyed read returned 200 and 500
  minutes apart. `scripts/register-when-up.sh` polled for a healthy window and
  registered all five the moment one appeared:

  | Agent | ERC-8004 id | Wallet |
  |---|---|---|
  | Bound | **#2160** | `0x72b99eFf53a7DbA31f66F7a98116bE7D84d4810B` |
  | Lattice | **#2161** | `0x7d7216A4e4Ee5F2663aE273d492fE99D495E4e44` |
  | Sluicegate | **#2162** | `0x6d5767Ca6e48B7103F3E660A2ff78148D2Ec6Ab4` |
  | Keel | **#2163** | `0x35e2EcBcC9DCA14A85Cf99CC76eb6899c6f29566` |
  | Redcell | **#2164** | `0x5d47Ac7b6A73b4ebA1105677258e9baf904f9309` |

  P8a acceptance (a) — all five live, registered on BSC, passing their MCS
  tests — is complete.

---

## P8b — The Ledger

### D8-06 · Three benchmarks are half-complete, because the manual arm is Francis's to run

- **Planned** — Acceptance (c): three benchmarks complete, two reps per arm,
  manifests hashed, outputs attached.
- **Shipped** — All four benchmarks registered with their rubrics hashed before
  any arm ran; the agent arm run twice for each, manifests hashed and published
  at `/ledger/<id>`. **The manual arms have not run**, so no benchmark is a
  comparison yet and every one is labelled incomplete on the page.
- **Why** — Not a reduction, a dependency. The phase brief assigns the manual
  arms to Francis with a timer and a screen recording, and the intake exists
  for exactly that. Simulating a human analyst would take an hour and would
  make every number on `/ledger` worthless, which is the one outcome worth
  avoiding more than an incomplete page.
- **Cost** — `/ledger` publishes four half-benchmarks. It says so in those
  words rather than showing a filled-in comparison.
- **Restore** — `/ledger/intake`: pick the benchmark, paste the analysis, enter
  the stopwatch time. Two repetitions each for ADV-01, ADV-02 and ADV-03
  completes acceptance (c). Blind scoring runs after both arms exist.

---

## P9 — PancakeSwap

### D9-01 · The Desk's default address is not DEMO_ADDRESS

- **Planned** — One demo address across the product.
- **Shipped** — `/pancakeswap` defaults to `PANCAKE_DEMO_ADDRESS`, a real BSC
  liquidity provider holding a live BTCB/USDC 0.25% position. Everywhere else
  still uses `DEMO_ADDRESS`.
- **Why** — Caught by looking at the audit screenshot, which the audit itself
  passed clean: `DEMO_ADDRESS` holds Venus and spot but **no V3 liquidity**, so
  the flagship page for a 1,000 CAKE prize opened on "No PancakeSwap V3
  liquidity at this address". Correct, and indistinguishable from broken.
- **Cost** — Two demo addresses to keep alive. If the LP closes that position
  the page opens empty again.
- **Restore** — One address holding positions in every category would collapse
  them back. We do not control one, and manufacturing V3 liquidity to demo
  against is real money for a screenshot.

### D9-02 · Third-party agents are summarised, not listed one by one

- **Planned** — "the agents that support that exact pool and fee tier, ranked,
  with reasons."
- **Shipped** — Bound in full with its reasons; then the shared caveat once;
  then the twelve indexed third parties counted, three named, the rest behind
  a disclosure.
- **Why** — Every third party is in an identical state (never tested, never
  probed), so listing them individually produced twelve identical paragraphs —
  the prose form of the identical-cards tell AGENTS.md forbids. A caveat
  repeated twelve times stops being read, which defeats disclosing it.
- **Cost** — A reader must expand to see all twelve names. The count is always
  visible, so nothing is hidden, only folded.
- **Restore** — Trivial, and it becomes right the moment agents start
  differing: `notable` already splits out any agent that has been tested or
  probed and renders it in full.

### D9-03 · Pool-level support cannot be verified for third parties

- **Planned** — "agents that support that exact pool and fee tier".
- **Shipped** — Category and liveness are verified. Pool and fee-tier support
  is verified for our own agent only, and marked `unknown` for every third
  party, with the reason stated once above the list.
- **Why** — ERC-8004 metadata has no field for it. No indexed BSC agent
  declares which pools or tiers it handles, so a claim either way would be
  invented. Bound is `yes` because it reads the pool's own `tickSpacing` rather
  than carrying a fixed table, which is checkable from its code.
- **Cost** — The ranking answers "can work on this category and answers when
  called", not "supports this pool". The page says exactly that.
- **Restore** — Needs a declaration that does not exist yet. The nearest real
  fix is running MCS-REB-1 against a case pinned to the pool in question, which
  the harness can already do.

### D9-04 · 9b not started, 9c cut

- **9b** requires Francis's written "approved, mainnet" and $25–40 of funding,
  and a deliberately tight range opened so it drifts out. Hard gate 1. Nothing
  on mainnet has been touched.
- **9c** `/pancakeswap/gaps` is cut by default per the phase brief. It is only
  attempted if 9a and 9b are stable with time to spare, and 9b has not run.

---

## P10 — Builder rail, Judge Mode, standard pages

Continued 2026-09-07 after the rebuild (REC-*). P10b/c/d/e shipped before the
compromise; this session picks up 10a.

### D10-01 · `/builders/claim` reads identity from chain first, not from 8004scan

- **Planned** — "fetch identity from chain".
- **Shipped** — Exactly that, and 8004scan is demoted to best-effort. The owner
  is `ownerOf(tokenId)` read live from the ERC-8004 identity contract; that is
  the only value a signature can be checked against. 8004scan is used, with a
  6-second cap and no hard dependency, for two things it does better than a bare
  chain read: naming the exact registry contract, and a name/description to
  pre-fill the form. When it 500s (D8-05: their DB flaps), the flow falls back
  to `BSC_ERC8004_REGISTRY` (the known BSC registry, configurable, never
  guessed) and still completes.
- **Why** — During build the index was returning 500s on ~half of reads. A
  claim rail that goes down with the indexer is not a claim rail. The chain is
  always up and is the authority anyway.
- **Cost** — If an identity lives in a registry not listed in
  `BSC_ERC8004_REGISTRY` *and* 8004scan is down, it cannot be resolved. Adding
  the address to the env fixes it. One known registry covers every BSC agent
  seen so far.
- **Restore** — n/a; this is stronger than the brief.

### D10-02 · Lookup by owner address needs 8004scan; lookup by token id does not

- **Planned** — "Paste an ERC-8004 token id or owner address".
- **Shipped** — Both. The token-id path is chain-only (above). The owner-address
  path lists the address's identities through 8004scan, because there is no
  cheap chain-only way to enumerate an address's ERC-721 holdings without an
  indexer or a log scan. When 8004scan is unavailable the address path returns
  an honest "unavailable right now, paste the token id instead" rather than
  hanging.
- **Cost** — Owner-address lookup is only as available as 8004scan. The token-id
  path — the primary one — is not.
- **Restore** — A `Transfer`-event index of the identity contract would make the
  address path chain-only too; out of scope for P10.

### D10-03 · Publishing writes a first-party listing, not an `agent` row

- **Planned** — "guided listing … publish".
- **Shipped** — Publish writes `builder_listing` (first-party: the ownership
  proof, the builder's listing fields, the conformance run) and upserts
  `agent_category` so the identity appears under its category. It does **not**
  create or edit the `agent` row — that is derived state and must stay
  rebuildable from ingest (invariant 12). If the identity is not indexed yet,
  publish returns "the chain is swept every few minutes; try again shortly"
  rather than materialising a derived row by hand.
- **Cost** — A brand-new ERC-8004 registration (minutes old, not yet swept)
  cannot be published until the next ingest sweep picks it up.
- **Restore** — n/a; this is the correct tier boundary. Migration `0009` adds
  `builder_listing`; it is marked FIRST-PARTY in `schema.ts` and is never part
  of a rebuild-from-chain drill.

### D10-04 · The live conformance run during a claim is persisted; the free tester's is not

- **Planned** — "run the conformance test LIVE in the browser with the result
  shown".
- **Shipped** — `/builders/claim` runs the same harness as `/builders/test` but
  with `persist: true`, attached to the real ERC-8004 `agentId`, so the result
  shows on the profile and counts on `/standard` — pass **or** fail
  (invariant 7). `/builders/test` still keeps nothing, because testing
  work-in-progress should not publish it. A builder can also publish without
  running the test and is listed as "not yet tested".
- **Cost** — None. The distinction is deliberate and stated on both pages.
- **Restore** — n/a.
