# Findings

Measured facts about BSC agent supply that changed how Marque is built. These
are not reductions (see `DEVIATIONS.md`) — they are things we learned by
querying the chain and the registry rather than by reading the marketing.

Every number here is dated and reproducible. None of it is hardcoded into the
product; the product renders `funnel_snapshot`, which is measured continuously.

---

## F-01 · The reachability cliff is not where the plan expected it

**Measured 4 Sep 2026, chain 56.**

The master plan's central thesis is that BNB Chain has "a supply problem wearing
a discovery problem's clothes", and predicted the failure mode would be dead
endpoints — "Cloudflare tunnels and 525s", "fewer than a dozen BSC agents that
actually answer a request".

The thesis is right. The mechanism is completely different, and it is worse.

| Stage | Count | How measured |
|---|---|---|
| Registered on BSC | **301,127** | 8004scan `/agents?chain_id=56` total |
| Declare A2A | **25,415** | `has_a2a=true` |
| Declare MCP | **5,335** | `has_mcp=true` |
| Declare x402 | **70,321** | `x402_supported=true` |
| Yield a parseable service endpoint | **~48% of enriched candidates** | our own parser |
| **Endpoint answers HTTP 200** | **98%** (59/60 sampled) | our own probe |
| **Actually bound to a runtime** | **0 of 120 sampled** | the card's own fields |

Endpoints are not dead. They answer, fast, with valid JSON. **The agents behind
them do not exist yet.** Every one of 120 sampled A2A cards returned:

```json
{ "status": "UNBOUND", "presence": "offline", "endpoint": null, "skills": [] }
```

An agent is registered on-chain, resolvable, and discoverable — and has no
executable endpoint, no declared skills, and has never been bound to a runtime.

### Why this matters more than the original framing

**A competitor probing for HTTP 200 will report ~98% healthy and be
confidently, completely wrong.** That is the single largest differentiator
available in this hackathon, and it is invisible unless you read the card body
rather than the status code.

It also sharpens the wedge. "Reachable" has stopped being a useful filter,
because nearly everything is reachable. The questions that matter are the two
the plan already built for:

- **Is it bound?** — a liveness check that inspects `status`, `presence`,
  `endpoint` and `skills`, not just the HTTP status. This is now a first-class
  probe requirement, not an implementation detail.
- **Is it capable?** — which is what MCS exists to answer.

### Consequences for the build

1. **The probe layer (P2) must grade the response body, not the status code.**
   A `failure_class` of `unbound` is added: reachable, well-formed, and unable
   to do any work. It is not a failure of the endpoint and must not be reported
   as one.
2. **The homepage funnel gets a new stage** between "responding" and
   "classified": *bound*. It is the most honest number on the site and no
   competitor will show it.
3. **Reference agents move from "guaranteeing a floor" to "being most of the
   market."** Channel D is not a nicety; on current evidence it is close to the
   entire executable supply in these four categories. They stay clearly
   labelled, per invariant 1.
4. **The Claim & List rail (Channel C) is the most valuable growth surface**,
   because the gap between registered and bound is exactly the gap a builder
   closes by listing with us.

### Caveat, stated plainly

The 120-card sample is drawn from TermiX-published agents, which dominate the
templated A2A population. This is a statement about the largest publisher on
BSC, not proof that no capable third-party agent exists anywhere. Non-TermiX
supply is thin but non-zero — see F-03. The probe worker will replace this
sample with a continuous census.

---

## F-02 · Template resolution is the difference between 4 and 767 endpoints

**Measured 4 Sep 2026.**

AGENTS.md gotcha 9 warns that some service endpoints are URL templates
containing `{agentId}` and will 404 if fetched literally. Measured reality on
BSC: **763 of 767** indexed A2A endpoints are templated — 99.5%. Without a
resolver, the entire A2A population of the chain reads as unreachable.

The gotcha understates the trap in one specific way that cost real time. It is
not enough to resolve the template; you have to resolve it to the **right
identifier**, and the obvious choice is wrong:

| Substitution for `{agentId}` | Result |
|---|---|
| `56:0x8004a169…:320933` (8004scan's composite id) | **404** |
| `cmth2evmo3abjmh0187bu7a2k` (TermiX account id) | **404** |
| `mimsopon.agent` (agent name) | **404** |
| **`320933`** (bare ERC-8004 token id) | **200** |

Verified 8/8 on a random sample, then 59/60 across a wider one. The composite id
is the natural choice — it is the primary key everywhere else in the registry —
and it silently produces a 404 that looks exactly like a dead agent.

`templateVars()` therefore maps `agentId` to the token id and offers the
composite as `agentIdFull` for publishers that mean it.

---

## F-03 · Non-TermiX supply is thin but real

Of 804 indexed service rows, 40 point somewhere other than TermiX, across four
distinct hosts. One is genuinely alive and capable:

- **`q402.quackai.ai/api/mcp/info`** — a real EIP-8004 MCP service
  (`https://eips.ethereum.org/EIPS/eip-8004#service.mcp`) with x402 support,
  answering 200 with a well-formed descriptor.
- `example.com` — a placeholder someone registered on mainnet.
- Two AWS-hosted endpoints, one of which 404s.

This is worth stating in the product exactly as it is: a handful of real
third-party services, named, rather than a headline count of 301,127.

---

## F-04 · BSC block time is 0.45s, which breaks the Compound APR convention

Compound-family lending code conventionally hardcodes `blocksPerYear` for
3-second blocks (10,512,000). BSC now produces a block every **0.45 seconds** —
**70,080,000 blocks a year**, measured over spans of 100, 1,000 and 20,000
blocks and consistent across all three.

Using the conventional constant understates every Venus APR by a factor of 6.7.
The yield reader measures block time on every read instead.

---

## F-05 · Venus lists a dead market reporting 1.05 × 10^14 % APR

The Venus comptroller still lists a UST market with zero liquidity whose
`supplyRatePerBlock` compounds to an APR of about **105,332,860,337,509%**.
Ranked by APR it sorts first, so the naive "best yield" query returns it.

This is a fabricated-looking metric arriving through an entirely legitimate
contract read, which is the most dangerous kind. The yield reader now requires
a market to hold at least $25,000 of cash and report under 200% APR, and
publishes every exclusion with its reason rather than filtering silently.
