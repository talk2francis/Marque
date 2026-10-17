# P06 portable receipt and commerce inspection

Revision 1, 17 October 2026. Candidate source, no deployment.

## Reuse and boundaries

Reuse immutable execution receipt versions 1/2, P04 SHA-256 vectors/checker, current receipt GET, the existing public Phase 2 job timeline, pinned SDK 0.6.0 contracts/ABIs, deterministic job projector and shared SSRF guard. No new escrow, database table, migration, wallet, signer, approval, paid call, new dependency or lockfile change. Seller SDK stays 0.5.5. An offchain bundle is not a new chain protocol, issuer signature or universal verification score.

The full inspector has its own commerce/inspection subpath. Public job export uses the small commerce/evidence module, so the heavy SDK inspector is not added to every seller or the existing root commerce entry.

## Three distinct objects and digest domains

Original Receipt.version remains the literal string 1 or 2 and its complete original JSON/hash is unchanged. An opt-in wrapper uses schema marque.receipt.bundle.v2, payload.version 2, original receipt/hash, derived task/service commitments and anchor references. Its hash covers sorted-key JSON of schema plus payload using SHA-256/UTF-8. This does not relabel an old receipt as a new receipt version. The CLI also reads the existing HTTP receipt response directly and reports bundleVersion:null.

The public job wrapper uses marque.commerce.bundle.v2 and payload.version 2, original already-public projection, selected event references, derived bindings, export observation time and separately nullable sourceComputedAt. SHA-256 covers schema plus payload through the existing SDK-compatible escaped canonical JSON. Its Unicode escaping differs from the historical receipt's unescaped sorted JSON; both contracts are explicit in inspection output. Content integrity is not issuer authentication.

Provider-envelope quoteHash version 1 is Keccak-256 of JSON.stringify of the verified parsed envelope. It is distinct from the signed negotiationHash, Keccak of the onchain description string, SDK deliverable-manifest canonical Keccak and the raw artifact-byte SHA-256. None is silently substituted for another.

Bundles are local JSON capped at 2 MiB, depth 64 and 100,000 nodes. Job source is capped at 128 event references and 16 unique transactions. Unsafe numeric block heights are refused rather than rounded by the existing numeric state projector. Unsupported formats and missing metadata remain unavailable.

## Existing GET surfaces, opt-in only

GET /api/v1/receipts/:id keeps its default fields, original body/hash and P04 evidence. Add ?format=bundle for the new container. A damaged or unsupported preserved receipt is not exported as valid evidence (422); default historical access still exposes its original integrity result. Historical anchor network/contract/block hash stay null because the rows lack them. Execution chain is never copied into the anchor. An inspector can explicitly fill missing chain/contract context; conflicting known references fail.

GET /api/v1/phase2/job/:chain/:job keeps its default projection. The same ?format=bundle selects a separate cache key and an explicit public-commitment projection, preserving CORS and cache-age/stale headers. The source computation time is not replaced by export time. Its bounded, READ ONLY selection query uses only original intent identifiers, original quote digest/mode and selected public money fields; it never publishes raw quote/task/IP/access-token data or raw endpoint URLs. Endpoint SHA-256 is a commitment only.

Preserved intent service ID is useful even if that particular environment lacks the original quote row: PARTIAL keeps the original selection and marks quote digest/mode unavailable. PRESERVED requires matching agent/service/provider/token/chain/raw amount across the original intent and quote. Do not reconstruct an original missing envelope hash from today's serialization. A stored signed mode is a record claim, not signature replay or historical registry ownership proof.

Original job events store contract roles, not emitter addresses. The container explicitly maps those roles using the pinned SDK configuration. Only subsequent confirmed RPC log checks establish the actual emitter. Unsupported historical deployment mappings cannot inherit a verified claim. Default 404/503 behavior remains; incomplete opt-in metadata returns 422 without private error text.

## Independent inspection

The libraries accept a public read client, never a wallet or database. The CLI does not load private operational configuration. Its explicit public RPC uses shared safeFetch with DNS pinning/SSRF checks, no redirects, at most 1 MiB per response, an 8-second call limit, 120-second overall network budget and 128 calls. Only eth_chainId, eth_getBlockByNumber, eth_getTransactionReceipt and eth_call are allowed. No send/sign/approve/fund/task method exists. Artifact URLs are never fetched.

Checks include actual eth_chainId, current RPC head age (120 seconds, maximum 30 seconds future skew), successful transaction status/hash, current canonical block/hash, preserved block references and at least three confirmations. A reorg/mismatch fails. A recent missing receipt is pending; an old missing historical receipt is unavailable rather than mislabelled pending. This is supplied-RPC consistency, not independent consensus or source-bytecode verification.

Anchor verification matches exact contract, Anchored event signature, original receipt leaf and block timestamp. It proves that content commitment was published, not commercial payment, quality, issuer or action authority.

Commerce inspection matches every listed event's signature/emitter/job ID/arguments/index/block against confirmed receipts, rejects duplicate substitutions and independently reads exact current job/provider/buyer/budget/token/decimals/task-description/delivery commitments at one pinned head. A final header check detects a changed tip. Missing historical events do not establish absence of later events. Indexed/source state and current chain state remain separate.

JobSubmitted is delivery, JobCompleted is completion, and PaymentReleased plus an unambiguous exact ERC-20 Transfer is payment proof. Refund is a separate event/transfer. A router verdict may follow the kernel payment/refund logs: the minimal existing-projector transition correction preserves the terminal state and does not treat that ordering as an illegal transition. Router JobFinalised is verified separately as a summary; kernel events still drive the existing projector.

Historical policy registration and current policy link are separate checks. A current empty link does not erase confirmed historical registration. Current dispute timing is returned only when the current recognized policy can be read. An exact historical fee Approval event does not prove a present allowance or an asset action charter; absent references stay unavailable. No allowance, policy or cap is changed.

Locally supplied SDK manifest bytes are shape/size checked and bound to exact job/chain/contracts before computing the SDK semantic Keccak. Changed content fails. Raw-byte SHA-256 is reported separately; formatting or omitted private/removed assets cannot acquire a retroactive original-byte proof. Unknown formats remain commitment-only. MCS replay uses its separate P05 bundle; paid settlement never implies a passing grade, buyer independence or future returns.

## Reproduction and limits

```text
node --import tsx scripts/verify-receipt.mts ./published-legacy-response.json
node --import tsx scripts/verify-receipt.mts ./receipt-bundle.json --rpc PUBLIC_RPC --anchor-chain 97 --anchor-contract REGISTRY
node --import tsx scripts/verify-receipt.mts ./job-bundle.json --rpc PUBLIC_RPC --artifact ./owner-shared-manifest.json
```

Optional --expected-receipt-hash compares an independently obtained original receipt digest. Exit 0 means the requested content/RPC checks succeeded, not that every dimension is proven; read each scoped result. Exit 1 means malformed/mismatched evidence, and 2 means requested live evidence is unavailable or pending. Legacy response mode checks only original content and never silently upgrades it.

The checkpoint contains actual old-anchor and already-paid Plinth reads, negative tests, compatibility evidence and remaining limits. Original quote signature replay, historical registry ownership, human/funding independence, source-build verification and action authority are not inferred from missing evidence. No new transaction is made to create activity. Rollback is a source revert; original observations and database rows are unchanged. P07 is already authorized after the local checkpoint; production release and any new paid/mainnet action are not.
