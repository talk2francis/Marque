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
