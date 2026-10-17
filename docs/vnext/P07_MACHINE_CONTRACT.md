# P07 existing catalog and unsigned procurement contract

Revision 1, 17 October 2026. Candidate source only. No production deployment or payment authority.

## Reuse and scope

Keep GET /api/v1/marketplace and its legacy success body/filter semantics. Opt in with format=machine for marque.catalog.v1. Reuse existing operator/endpoint deduplication, exact immutable agent/service identities, four categories, commercial-state projection, quote expiry logic, pinned SDK network/asset/ABI snapshot and createJobCall. No replacement market service, registry, scoring algorithm, signing service, protocol/escrow, migration or dependency/lock change.

One marketplace entry exposes one existing selected commercial service. This is not every service registered by an identity. Page total counts filtered, deduplicated entries, never independent people, total onchain registry identities or currently payable exact tasks. Identity chain and selected commerce action chain remain separate. Indexed owner/team configuration is not a fresh onchain proof of control or human/funding independence.

## Versioned read contract

GET /api/v1/marketplace?format=machine accepts only documented query keys. Category, q, live, warranted, thirdParty, hireable, includeUnclassified, hasPrice, firstParty, network, token, iface, tab, sort, maxPrice, minRating, limit and offset map directly to existing filters. Reject unknown/duplicate keys, unsupported chains, invalid numeric/boolean values, page sizes outside 1..300, offsets beyond 1,000,000 and conflicting firstParty/thirdParty=true. Legacy parameter behavior is unchanged. Existing warranted filter is a legacy identity-test filter, not a new exact-service certificate claim.

Output includes schema/version, actual projection sourceComputedAt separate from current generatedAt, nullable sourceAgeMs, stale state, exact pagination, indexed ownership and declaration provenance, selected service, payable rails, raw price/token/decimals/action chain/expiry/mode, observed last latency, legacy identity-test result and exact hire metadata link. Probe time is absent from the existing row: sampleTime=null explicitly. Exact-task compatibility, extra service inventory, historical owner control and human independence stay UNKNOWN. A2A/MCP are discovery transports, x402 buyer remains UNSUPPORTED, ERC-8183 is only a candidate requiring a fresh exact-task quote.

Price requires an actual stored raw amount, supported asset/decimals/symbol, supported action chain, observation time and explicit unexpired quote lifetime no more than 900 seconds from current time. Expired/unknown prices have no actionable amount/token. No metadata-declared price is promoted. Quote mode requires consistent sourceClaimVersion, explicit signatureEvidence and signed boolean; it is a stored observation, not independent cryptographic replay. A legacy MCS pass is labelled IDENTITY_TEST_PASSED with service binding UNKNOWN and payment NOT_IMPLIED.

Successful machine reads allow public CORS and expose freshness/Retry-After headers. Cache at most 15 seconds and no later than observed quote expiry; stale/future/unknown projection time and all errors are no-store. Default successful catalog JSON stays byte-for-field compatible except its naturally changing values; extra provenance headers are additive. Query failures return friendly existing 503 schema without driver/SQL text.

Catalog, receipt and conformance reads use separate courtesy process-local sliding windows, 120/minute/connection, 429 with Retry-After. Existing forwarded-address trust/courtesy limits are not authentication, a distributed quota or an abuse-proof spending cap. No credentials or private diagnostics enter machine output.

## DB and HTTP bounds

Measured P00 cold global reads justified bounds, not a speculative query rewrite. All four existing catalog SQL sites (commercial supply, main base, two track queries) now run unchanged SQL in READ ONLY transactions: exact statement 4 seconds, global statement 8 seconds, lock 500 ms. Catalog HTTP deadline is 12 seconds. Existing singleflight and three-minute stale-while-revalidate remain. HTTP deadline does not cancel SQL; PostgreSQL statement timeout does. Pool wait, several sequential statements and background cache refresh have distinct lifetimes. No claim of a 12-second whole-database cancellation or production latency improvement.

Receipt GET validates UUID before SQL, adds friendly 503/read courtesy limits, and its existing reader uses READ ONLY/4-second statement/500-ms lock bound. Conformance commitments use the same read bounds and existing redaction. Their HTTP deadlines are 8 seconds. Valid default success payloads and opt-in P06 exports remain; malformed receipt IDs now return 400 instead of a database UUID error/500. No GET writes.

## Pure unsigned plan

Import buildHirePlan from @marque/commerce/plan. Input is existing PublicQuote, existing IntentResponse and explicitly independently selected/reviewed expected terms: buyer address, action chain, canonical identity, exact service, provider, original quote digest, raw amount, token address/decimals, exact description commitment and caller task. No arbitrary calldata/objective execution or remote endpoint is accepted.

Compare quote/intent/expected identities, services, buyer, provider, quote ID/hash/version, action chain, catalog token/symbol/decimals/default flag, all pinned contracts, positive raw amount below 2^128, quote lifetime >20 seconds and <=900 seconds, job expiry separately, exact UTF-8 description commitment and sanitized selected task. Check description money/domain/bindings and signed description hash/shape where present. Recompute createJobCall and fixed-ABI calldata; compare exact prepared to/function/args. A chain-56 identity may offer chain-97 action only when every action term actually agrees on 97. Wrong-chain or expired input fails without renewal/substitution.

Output marque.hire-plan.v1 is always UNSIGNED with exact chain/from/to/function/data/valueRaw=0, provider, service, raw token fee, distinct quote/job expiries, stable intent/buyer/quote idempotency key and simulation NOT_RUN. Later registerJob, setBudget, exact approve and fund steps contain no calldata/job ID; they require independently confirmed original created job, allowance and setup recovery checks. Never batch unknown job ID, blindly resend createJob, treat fee escrow as asset authority, or count an unsigned address as wallet ownership.

The pure builder has no DB, RPC, fetch, randomness, signer, key, wallet or spending method. It cannot prove an intent unspent, fresh registry ownership or current asset support: explicit NOT_REPLAYED/CHECK_EXISTING_INTENT_BINDING_BEFORE_SUBMISSION. PublicQuote lacks the raw signed envelope, so client ECDSA replay is explicitly NOT_PERFORMED_SERVER_REPORTED_MODE. A matching unsigned plan is not signing permission, authenticated issuer proof, simulation success or live contract-source verification.

## Client, contracts and explicit side effects

@marque/commerce/catalog exports runtime Zod, query/parser and readMachineCatalog. It uses GET only, no credentials/redirects, 15-second default deadline (100 ms..30 s configurable), 2 MiB streamed JSON cap, strict schema validation and no automatic retries. Retry-After is bounded and exposed. Base is explicitly chosen API origin, not an agent endpoint/proxy; no server capability fetches arbitrary supplied provider URLs. Normal HTTP/browser caching respects response headers.

Public OpenAPI 3.1: /api/v1/openapi.json; JSON Schema 2020-12: /api/v1/schemas/{catalog-query.v1,catalog.v1,hire-plan-input.v1,hire-plan.v1}.json. Catalog/input structural schemas are generated from the pinned runtime Zod subset by scripts/generate-machine-contracts.mts; --check catches drift. Cross-field refinements and chain/commitment/expiry rules require runtime checking beyond structural schema. Output schema and emitted top-level fields have a contract regression. No new dependency was installed.

Standalone example: node --import tsx examples/machine-marketplace.mts API_ORIGIN [LOCAL_PLAN_INPUT.json]. It reads three actual entries and optionally builds a local unsent plan from owner-provided quote/intent/expected JSON. It loads no operational environment or keys, issues no POST and omits access capability from plan output. Keep local task/input/capability files private. A failed plan sets exit 1; a schema/read failure throws a bounded public error. The example is code external to the web app, not a claim of independent human adoption.

Existing POST quote invokes selected provider negotiation and records an offchain observation, 20/min/IP. Arbitrary outside A2A message/send can cause work; never call as catalog preflight. Known first-party negotiate source is deterministic price clamp plus quote signature, separate from notify_funded/work. Existing POST intent writes an offchain intent, serializes wallet+quote retries under advisory lock, checks access capability/current identity/quote expiry and refuses bound intents. No onchain job exists until buyer's own separately approved transaction. Existing bind verifies/records that transaction; notify can trigger paid seller delivery and must not be invoked as preflight. The shipped GET-only client automates none of these writers.

## Evidence, rollback and limits

Checkpoint records actual source, full tests/types/build/lint, structural schema check, source example types, real candidate GET/schema/client, explicit negative tests and read-only DB cancellation. Actual quote/intent acceptance uses known first-party Keel, an isolated fixture DB and synthetic unsigned buyer; it is neither an organic hire nor proof of an outside operator using this client. No paid task, notify, buyer wallet, approval, chain write or public deployment is needed. Historical Plinth evidence is reused from P06, never renewed into a fresh quote.

Rollback is source revert; original observations are retained. No SQL migration, data reset, privileged role change, campaign rule alteration, copy/theme/artwork or Caddy/monitoring change. Existing UI is byte-identical to P05's browser-reviewed source; a focused candidate read-only smoke may verify transport integration without claiming wallet clickthrough. Current production cold-query performance, third-party client adoption and unknown evidence dimensions remain explicit release limits. P07 ends this authorized batch; P08/release/payment are not implied.
