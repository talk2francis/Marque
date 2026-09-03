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
