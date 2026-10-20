# Builder and registry service incident, 20 October 2026

Status: candidate repair under validation; production deployment and live runtime POST acceptance are not yet claimed.

Read-only production checks reproduced two defects for BSC identities 302257, 302258, 304493, 304494, 310460 and 363709, and card-only callability behavior for reference Lattice 341554. Current registry metadata and every card were readable. The owner projection still contained old indexed endpoints.

Causes:

- The discovery safety change intentionally removed automatic A2A task sends. The builder action reused that discovery path, leaving no way to validate message/send there and treating an untested card as a failed call.
- Detail enrichment only selected identities never enriched before. Changes to tokenURI declarations did not create new current service bindings.
- The builder identity parser called web and x402 services `other`, so exact-kind comparison could incorrectly label an unchanged web endpoint undeclared.
- Callable evidence was aggregated across different services, allowing a failed MCP endpoint to invalidate a separate successful A2A check. It also admitted ordinary web discovery success; callable checks now require the exact declared A2A or MCP protocol.

The repair adds a permission-based call check, both standard response variants, shared service parsing, additive current-declaration fields, a durable URIUpdated change queue plus bounded registry reconciliation and fresh-declaration projection. Old bindings, published listings, failed probes, quotes and MCS results are retained. No MCS criterion, category requirement, freshness limit, query budget, price, wallet authority or chain action is relaxed.

API usage: omit `taskConsent` for discovery. Send `{chainId:56,tokenId:"302257",endpoint:"<exact current declared card URL>",taskConsent:true}` only with permission for the free capability question. A passing call check is neither an MCS pass nor permission to hire. Runtime acceptance still requires explicit live verification; local tests cannot substitute for it.

A registry update does not rewrite the owner's previously published listing assertion. `listedOnMarque` remains separate from current endpoint qualification. No automatic withdrawal was found in this path. Owners can republish an updated endpoint after reviewing current checks; no listing or failed observation is silently erased.

Protocol reference: [A2A 0.3 specification](https://a2a-protocol.org/v0.3.0/specification/) permits Message or Task results for message/send.

Validation and rollout evidence: pending.
