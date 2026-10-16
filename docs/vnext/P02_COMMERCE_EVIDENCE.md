# P02 commerce evidence and adapter contract

Observed 16 October 2026. This is a source/candidate result, not a production release. Raw records, artifacts, signatures, screenshots and operator diligence remain in the private VPS evidence directory. No new hire, funding, approval, wallet session or provider work request was executed.

## Historical case, independently rechecked

The original Plinth job **56/56916**, identity **56/363619**, service **43279**, is marketplace-attributed by an existing bound `hire_intent`. The original user quote **56305** was provider-signed. It verifies at its original observation time, and rebuilding its SDK-compatible description reproduces both the stored intent hash and the current chain description hash:

`0xd950e0b91c9816fe1daeb704dba7d2c8d3ce3703146413c58d63c4d617453265`

These are historical terms, not a current purchasable quote. Signature validation matches the historical paid provider; current registry owner/wallet were independently read at block **127984461**. Historical `ownerOf` at creation failed on the public RPC, so registry ownership at creation is UNKNOWN rather than inferred from today's owner.

| Stage | Existing BSC mainnet transaction |
| --- | --- |
| Create | [0xb5109f7f…](https://bscscan.com/tx/0xb5109f7feaa5e104393df52996402b0cefeb4ea500a9b4d43f92c70bba5c10fb) |
| Fund | [0xdf180aa6…](https://bscscan.com/tx/0xdf180aa639c5744ff649ad1fba36ebfd22e8a4f15df5d1041ee187bb37a380aa) |
| Submit | [0x745e0053…](https://bscscan.com/tx/0x745e0053a504b6ee1a5cc35fb4d181672d9b07a83944ad677438edc97e0ed254) |
| Complete and release | [0x017fb250…](https://bscscan.com/tx/0x017fb250c149053403af73a8bc78023ff87ebd5c7a682281a0706e408d4b064c) |

All four receipts succeeded. Current contract status is `3` (Completed); the final receipt contains `JobCompleted`, `PaymentReleased` and `JobSettled`, verdict 1. A U-token Transfer independently confirms **0.01 U** from escrow to the quoted provider. This is PAID, separately established from submission. It does not certify output quality or a keeper trade.

The submit calldata selector matches the pinned SDK's `submit(uint256,bytes32,bytes)`; decoding `optParams` yields `ipfs://QmPPndEVE1rJEW9TRupYsUmCmPd8d3tHG53KvyZsVVHRau`. Two guarded gateway GETs returned HTTP 429. A third returned the 1944-byte v1 manifest. `DeliverableManifest.fromDict(...).manifestHash()` from the installed SDK reproduces the onchain deliverable:

`0x8108703468cd1b8e17fa932e1beae867a518db0722e0f3c269524e18f2a9bf46`

The raw downloaded bytes have SHA-256 `1214831153a47057d700842b61fa8e31553353d0135343ba303286b5940bd9e7`. Their raw Keccak differs from the canonical manifest hash, as expected. This job's SDK manifest commitment is distinct from the existing Marque receipt canonical SHA-256 algorithm; neither algorithm was changed. IPFS address and body hashes do not establish service quality.

The buyer `0x15a97307caa68c24e4b5a0b83d331a6aa1ea195f` is not in the configured team exclusion list, but its human control and funding independence remain **UNKNOWN**. The original signed quote and retained explicit funded-notification acknowledgement establish historical protocol acceptance. Authenticated human/operator relationship diligence, consent to a new pilot and permission for any nonpublic case publication remain **UNKNOWN**. Different addresses are insufficient proof. No independent-user acquisition metric is derived.

## Current history changes the old plan

A bounded read-only query at **13:23:10 UTC** found two non-reference-identity PAID jobs with marketplace intents: Plinth **56916** and Vitals **56924**. The non-reference query was capped at 20 and returned 2; a separate latest-paid query was capped at 30 and returned 30. These scopes are not all-chain commerce totals.

Vitals is identity **367904**, service **46208**. Four existing receipts and current chain status independently confirm completion/payment release, including [settlement 0x164c73e7…](https://bscscan.com/tx/0x164c73e795797567247af08a585abdaf554f9df2dfc4535a523616c11a69d6cd). Its buyer is the explicitly excluded team wallet `0x0d8c9ad8eebb6879fefa218f0799219bcaabe999`. Its provider is the same address as Plinth's buyer. Therefore this case is **team-buyer commerce**, not independent demand; overlapping roles are recorded without inferring common human control. Original signed quote 59666 verifies at its observation time; its description matches both intent and current chain. The existing public artifact returned HTTP200 and its hash matches onchain `0x68b319285d95158b812ebfbceab5ef91891cd520b21021a3fd2a55147d1b92c8`. This additional integrity evidence does not remove the team-buyer exclusion.

Keel **56903** is a reference-provider control case. Its original signed quote and chain description match; its public 802-byte response's raw Keccak matches `0xd2b3434e10e8e41e87ea64680a08967d25512ae1a9ca064ed1ae2e662034f2df`. Payment release and the **0.05 U** transfer are confirmed. It is not independent supply.

At the same dated snapshot the latest observations for all six reference sellers were accepted, signed and unexpired. Plinth's latest accepted stored quote had expired; Brain's was unexpired but unsigned. These are eight selected service observations, not live UI promises or a population conversion rate. Current mainnet U/USD1/USDC/USDT each reported 18 decimals and escrow support; no allowance or transfer was submitted by this work.

## Candidate ladder and failure matrix

| Gate | Plinth 363619 / 43279 | Brain 302257 / 3512 | Vitals 367904 / 46208 |
| --- | --- | --- | --- |
| Exact service/identity | Current registry read; historical bound intent | Current registry read; indexed exact service | Existing bound intent; chain provider verified |
| Descriptor | Exact card GET 200, 2083 bytes | Card GET 200, 11878 bytes | New paid case discovered; no task invoked |
| Operation | Vault report declared; keeper actions are separate | Health-factor calculation declared | Historical task, no new invocation |
| Quote | Original signed quote verified; current stored offer expired at snapshot | Selected stored offer identity-matched unsigned | Original signature/description/artifact verified |
| Historical result | Artifact hash and PAID verified | No exact-service independent pilot verified here | PAID verified, team buyer excluded |
| Independent people / new pilot consent | UNKNOWN; historical protocol acceptance proved | UNKNOWN | Team buyer known; no independent demand |
| New paid hire | Not executed | Not executed | Not executed |

There is no fully verified independent-human case with the required operator diligence in this phase. Historical protocol acceptance is not discarded or confused with permission for new work. Use the allowed AMBER fallback: adapter diagnostics, a private contact draft and testnet-only plan. Do not manufacture another payment to create a number.

## Adapter operations and actual limits

| Protocol | Existing observational capability | Work/payment boundary | P02 behavior |
| --- | --- | --- | --- |
| A2A | Guarded agent-card discovery and stored probe/quote observations | `message/send` may initiate work; even declared skills are not execution proof | Existing metadata GET sends no seller task. Outside free execution fails with `free_preview_unsupported`; audited reference previews remain. Explicit quote request uses the existing negotiate skill; funding notification is separate. |
| MCP | Existing initialize/tools-list discovery | `tools/call` can mutate; read-only annotations are hints, not enforcement | No tool was invoked. No automatic MCP payment adapter is claimed. |
| x402 | Existing unpaid challenge detection | A signed payment header and settlement are separate from discovery; metadata prices are not quotes | No payment header, payment retry or paid endpoint was invoked. No x402-to-escrow adapter is claimed. |
| ERC-8183 | Registry, contract state, receipts, events, artifact bytes | Buyer owns signing; create/register/budget/approval/fund are separate stages | Exact service retained; fresh registry proof, quote verification and chain-driven payment recovery. No new chain action. |

Primary references, inspected this phase: [A2A 0.3 specification](https://a2a-protocol.org/v0.3.0/specification/), [MCP tool specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [Coinbase x402 flow](https://docs.cdp.coinbase.com/x402/how-it-works), [official BNB SDK repository](https://github.com/bnb-chain/bnbagent-sdk). The locally pinned SDK, recorded contract reads and receipts establish the exact implementation evidence here. Explorer/Sourcify verified deployed-build provenance remains unproven from P00; do not convert SDK ABI compatibility into a verified-source claim.

## Additive API and recovery contract

- Marketplace/storefront links carry `serviceId`; filter URL synchronization retains it and `try`. Metadata GET validates the selected ID and refuses service substitution. An omitted ID retains the legacy agent-default lookup; metadata returns the chosen ID so the next quote is exact.
- Metadata adds `preflight.version=1`, observational-only, zero seller requests, outside free-preview unsupported, latest quote mode/failure/time and next action. This reuses existing observations; it does not certify a live quote, MCS pass or independent operator.
- Quote and intent recheck the canonical registry tuple on a fresh same-block owner/wallet read. RPC chain and head age are checked, and failure returns 503 without an indexed-owner fallback. Transfer can invalidate an earlier quote. Registry/payment chains remain explicit and distinct.
- Browser quote requests opt into `quoteAccessVersion:2`. The response includes a random 256-bit bearer capability; only its SHA-256 is stored in the existing quote JSON. Intent requires that capability for version-2 rows. It authorizes task access, not asset control. Legacy quote clients/rows retain the original contract, with its weaker numeric-ID access; no retroactive privacy promise is made.
- Quote/intent responses carry the selected agent/service/quote ID and unchanged stored envelope hash, and the browser checks the prepared terms before signing. `quoteHashVersion:1` identifies the existing schema-parsed provider-envelope `JSON.stringify` digest; JSONB key ordering means it must not be recomputed as a canonical storage digest. The signed negotiation/description hashes and receipt SHA-256 remain separate and unchanged.
- Existing stored quote signature/domain/task/expiry/amount/token/provider/decimals checks remain mandatory. A fresh price is shown for another buyer decision rather than silently replacing the terms before signing. No token price is inferred from a card.
- A short PostgreSQL transaction/advisory lock serializes intent retries by buyer and quote. Concurrent/repeated requests reuse immutable intent terms; an already-bound quote returns 409. There is no new table or migration and no historical record rewrite. This does not prevent a wallet from deliberately submitting the same contract call twice.
- A known create-transaction hash is rebound rather than recreated after a receipt/bind timeout. Payment continuation reads the exact buyer/provider/description/expiry/token/router/policy/budget/status and constructs only missing steps. Exact approval remains bounded to the quote price; funded/delivered/completed jobs are never funded again. Existing indexer binding and job-room recovery remain authoritative after a lost browser session.
- New quote responses for another agent/service are rejected. Generation guards discard obsolete quote responses after sheet selection changes; wallet calls explicitly name the buyer account. Browser refresh is not a universal exactly-once guarantee, nor is an RPC snapshot a finality guarantee.
- Notification parameters cannot override `skill` or `job_id`; delivered/closed jobs are not sent another work request. Pending/rejected notification is shown separately from funding, delivery and payment release. Existing provider retry observations remain append-oriented. A third party's internal deduplication and eventual delivery are not guaranteed by this source change.

## Next independent pilot, without paid action now

The private operator contact draft points to public descriptor/organization channels where available and the registry owner proof; it is **not sent**. Request a signed control/consent statement, relationship to buyer/team, exact report operation and task, supported chain/asset/fee, seller job-level idempotency, public artifact format/URL and review/refund timing. Unknown public contact details remain unknown.

Rehearse deterministic failures with synthetic actors and isolated data first. A future BSC testnet pilot requires a provider-controlled testnet endpoint, explicit consent, confirmed test-wallet provenance, a fixed cost cap and approval for any uncertain seller effects. Capture selected identity/service/provider/endpoint, signed task and quote hashes, precise token decimals, each setup receipt, partial recovery, artifact integrity, submission/review and PAID/refund separately. Never send `message/send`, a tool call or payment as a discovery probe. Any new real mainnet write still requires separate explicit approval.

## Closing operating observation

A separate bounded read-only refresh at **16:49:51 UTC** again found all six selected reference sellers with accepted, signed, unexpired latest quotes. Brain's selected quote was identity-matched unsigned; Plinth's stored signed quote had expired at16:47:47UTC. These are dated observations; no outside quote was renewed by this work. The quest cursor updated at16:49:48.636UTC, 2.613seconds before the database clock; distance from current chain head was not sampled in this closing refresh and is UNKNOWN. Public Marque health, Kerb API health and Kerb web each returned HTTP200 with complete bodies and curl transport exit0. This is health/continuity evidence, not a p95 or production performance improvement claim.
