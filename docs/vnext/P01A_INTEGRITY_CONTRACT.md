# Quote and listing integrity contract, version 1

This supplements the Phase 2 commerce/tracking specifications for the local P01A candidate. Production still runs 97ef4c7 until an independently authorized release. The change reuses the existing verifier, stored observations, claim tokens and publish route. No contract, signer, payment primitive or migration is introduced.

## Quote evidence

`sourceClaimVersion: 1` is additive. Existing `signed` stays boolean on new accepted quotes and nullable on historical projections. `signatureEvidence` is `provider_signed`, `identity_matched_unsigned`, or `unknown` for incomplete historical observations. A missing historical signed flag never becomes cryptographic proof.

| Mode | Evidence | Limitation |
|---|---|---|
| Provider-signed negotiation | Recomputed SDK-compatible description hash, recovered provider signature, allowed identity, chain, canonical escrow and supported asset | Describes the quoted task and terms. Does not prove delivery, quality, independent demand or settlement. |
| Identity-matched unsigned quote | Positive price, supported asset/chain/escrow and named provider matching the selected identity | No cryptographic proof that this provider accepted these task bytes. The UI says so. |
| Unknown | Incomplete historical evidence | No current-ready claim; request a fresh quote. |

No provider/task substitution is introduced. Signed descriptions and historical quote/receipt hashes retain their existing algorithms and bytes. Receipt SHA-256 v1/v2 remains separate from the quote's existing Keccak envelope digest.

Signed expiry uses the same authoritative fields as the SDK description. Conflicting top-level/nested expiry or negotiation timestamps fail. Negotiated time is explicit, permits up to 30 seconds of future clock skew, and signed lifetime cannot exceed 900 seconds. Expiry itself has no grace extension. Signed requests replayed for another task fail the exact task comparison in `requestQuote`; mutated signed content fails hash validation.

Unsigned explicit expiry at or before observation time fails. A future expiry is capped at observation time + 900 seconds. Only an omitted expiry receives a server-assigned deadline. `expirySource` distinguishes `provider_signed`, `provider_capped` and `server_assigned`. Revalidating a stored unsigned purchase uses its original observation time, not a renewed clock. Purchase also retains the existing 20-second minimum remaining lifetime and rechecks exact service endpoint, provider, price, token/decimals and envelope.

Latest failed observations remain failed. Latest rows tie-break by ID. Stored expired prices and unknown signature modes cannot be hireable. Marketplace memoized rows are checked again on serving; storefront projections lose expired price labels. Client cards remove expired measured prices. Cached homepage numbers are explicitly dated snapshots; the ready-listing total is obtained before pagination. These are measured listing snapshots, not independent-user counts or availability guarantees.

## Listing authority

Both `GET /api/v1/builders/checks` and `GET /api/v1/phase2/owner/:address` only read. Neither publishes, tests a seller task or records a proof. The existing authenticated `POST /api/v1/builders/claim/publish` remains the publication rail; no duplicate endpoint is added.

A claim binds the entire fixed message and canonical `(chain, registry, tokenId, agentKey)` tuple. Registry must be the supported network's configured identity registry. Tokens reject malformed/future issuance and unsupported tuples. Verify rereads ownership; publish rereads ownership after its per-identity serialization lock. A transfer between proof and publication fails closed. An RPC timeout cannot authorize publication. Ownership can change after any read; this is a fresh observation, not a permanent ownership guarantee.

Publication verifies the indexed tuple, retains the network, and commits listing/category together. Existing unique keys plus a transaction lock serialize retries. Identical proof and payload leave listing/category row versions and timestamps unchanged. Proof recording is also serialized/idempotent. Older listing-only proofs are appended to `builder_proof` before the mutable listing projection is refreshed. Existing observations are not deleted or rewritten.

Basic owner publication deliberately does not require passing MCS or all five checks. Listing levels remain separate:

- `listed` / `listedOnMarque`: compatible stored publication state.
- `listingEvidence.version: 1`: `ownerListed` requires the current owner and canonical stored tuple; `qualityListed` additionally requires five local checks and matching published category/interface/endpoint. `localChecksPassed` describes the checklist itself, even before publication.
- Warrant: separate exact-service test evidence and date. A failed but well-formed MCS answer can satisfy the local "tested" check; it never becomes a Warrant through publication.
- Hireability: current accepted quote, independent from listing and MCS.
- Marque's four-category stretch: existing local journey; not official BNB campaign qualification.
- Official qualification: `not_determined`; BNB judges decide under their current rules.

Existing published records are retained in place. No bulk requalification, withdrawal, history rewrite or automatic enrollment occurs. A legacy record with mismatched tuple, old owner or different endpoint fails the new evidence projection until the current owner explicitly republishes. An unindexed mainnet identity receives the existing `not_indexed` conflict. A chain-proved testnet identity can publish a builder listing without an agent/index row; no derived registry row or orphan category row is invented. Its existing navigation target is `/builders`, because public agent storefronts currently support mainnet only. The additive `chainId` and `indexStatus` fields describe this scope.

The checklist now offers explicit publication after local checks and links to the existing claim form for other listing details. No-wallet visitors can read the product; owner proof and publication require their connected wallet signature.

## Other boundaries

Remote metadata still uses shared `safeFetch` (6 second timeout, 256 KiB body cap). Inline JSON is restricted to JSON data URIs, 768 KiB encoded / 256 KiB decoded. Roots must be objects; declared endpoint arrays must be arrays with at most 64 entries each. Null/primitive entries, overlong URLs and control characters are not treated as services. This does not certify endpoint safety: every eventual request still passes the shared SSRF guard.

Phase2 existing bodies/fields are retained with additive evidence. Legacy owner `jobsPaid` historically means funded; it is not silently repurposed. New `jobEvidence.version: 1` separates funded from indexed `PAID` payment release, includes network/time/scope, and returns null for unavailable new counts. Provider-wallet aggregates do not prove marketplace origin or independent buyers.

Caddy trusted-header protections, monitor transport checks, all four categories, buyer signing, exact approvals, SDK versions, workers and existing schema remain intact. Rollback is reverting the candidate commit before release; no database reversal is required. A production release and any new mainnet write retain separate owner approval gates.
