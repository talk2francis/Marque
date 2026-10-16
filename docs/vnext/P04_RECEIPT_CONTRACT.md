# P04 receipt and evidence contract

Contract revision 1, 16 October 2026. This describes candidate source, not a deployed release.

## Existing contracts reused

| Surface | Existing source | P04 disposition |
| --- | --- | --- |
| Immutable four-proof receipt versions `1` and `2` | `packages/execution/src/receipt.ts`, `apps/web/lib/runs.ts::persistReceipt`, `packages/db/src/schema.ts::receipt` | Reuse; no replacement envelope, row rewrite or backfill. Insert-on-conflict leaves the existing body/hash intact and does not anchor a regenerated retry hash. |
| Public complete receipt and stored anchor pointer | `apps/web/app/api/v1/receipts/[id]/route.ts` | Keep all six fields; append `evidence.version=1`, computed without database writes, RPC or fetching URLs. |
| Accepted run and chronological logs | `apps/web/lib/runs.ts`, `run`, `run_event`, runs GET routes | Reuse; no fabricated timeline events or new run framework. |
| Pre-acceptance charter rejection | `startRun`, `rejectBeforeAcceptance`, `run_rejection`, runs POST | Reuse; rejectionId is not a runId or execution receipt. Quote/authority failures after acceptance remain typed failure receipts, not completed work. |
| Frozen MCS case and result | `packages/conformance/src/harness.ts`, `conformance_case`, `conformance_result` | Reuse case, response, request hashes and versioned results. Future run receipts cite the case actually graded, with MCS version/revision. |
| Indexed commercial timeline | `packages/commerce/src/quest.ts::questJob`, existing phase2 job GET | Reuse exact intent/description, token/raw amount, event transaction/log/block references. Submitted, completed, payment release and refund remain separate observations. |
| Portable chain/issuer verification | No claim from a receipt hash alone | Not implemented as a new trust framework. Anchor inclusion, issuer signatures, finality and human independence remain unchecked/unknown here. |

## Frozen digest domain

`RECEIPT_DIGEST_CONTRACT.version=1` names the existing algorithm **marque-sorted-json-v1**. For either receipt version, recursively sort object keys with JavaScript default `.sort()`, preserve array order, build objects with `Object.fromEntries`, serialize using JavaScript `JSON.stringify`, encode as UTF-8, then SHA-256. Publish `0x` plus 64 lowercase hex digits. The complete receipt JSON, including optional/unknown keys, is covered. The stored row id/hash/anchor fields and the new response evidence projection are outside this domain.

There is **no prefix**, no detached signature, no Unicode normalization and no RFC 8785 JCS claim. JavaScript enumerates integer-index keys numerically despite the earlier lexicographic sort. JSON string escaping and number serialization are JavaScript's, including negative zero becoming zero. Composed/decomposed Unicode remains different. Arrays are ordered. Do not replace this serializer with a library, normalize text, add `marque:receipt:v2:`, use Keccak, or strip unknown keys when replaying history. A genuinely different digest contract needs a separately named/versioned future format, not reinterpretation of versions 1/2.

Two synthetic complete receipt vectors freeze canonical strings and SHA-256 values in `packages/execution/src/receipt-vectors.fixture.json`. Generated independently with Python sorted compact UTF-8 JSON and hashlib for these finite-integer, non-integer-key fixtures; JavaScript-specific integer-key/escaping/negative-zero cases have separate tests. They are regression fixtures, never marketplace activity. Sealed calls also use SHA-256 over a sorted JSON object containing version 1, recommendation, blockNumber, agentId and timestamp; their fixture is separate from receipt content.

## Offline verification boundary

`verifyReceiptIntegrity(body, expectedHash)` checks the supported string version, the existing four-proof shape and JSON safety without coercion, then hashes the **original object**, never Zod's parsed/stripped output. MATCH and MISMATCH describe content only. Other outcomes are UNSUPPORTED_VERSION, INVALID_RECEIPT, INVALID_HASH and LIMIT_EXCEEDED. No arbitrary input exception escapes. Bounds: depth 64, 100,000 visited values, an aggregate 2 MiB key/string UTF-8 budget before canonicalization and 2 MiB serialized UTF-8; oversized input is not certified. Existing historical serializers remain unchanged; this strict JSON boundary applies to the new checker, not a rewriting migration.

BigInt, NaN, Infinity, undefined, accessors, dates/custom objects, sparse arrays, symbols and functions are rejected rather than silently transformed. Existing JSON numeric monetary fields remain numeric and unmodified. New raw token amounts must be decimal strings, as in the existing commerce/seller projection; this phase adds no monetary field. A historical precision loss may produce a mismatch and requires investigation, never hash repair.

## Additive public projection

`GET /api/v1/receipts/:id` retains `id`, `hash`, `receipt`, `anchorTxHash`, `anchorBlock` and `issuedAt`. It appends `evidence`:

- `version:1`, `source:stored_receipt_projection`.
- `digest`: algorithm/serializer/encoding/domain contract and offline status/computedHash.
- `execution`: receipt-claimed chain, block, transaction hashes and finishedAt; blockHash is null and verification NOT_CHECKED. This is not an RPC observation or freshness measurement.
- `quality`: receipt-claimed test/case/ground-truth hash and, when actually recorded, testVersion/toleranceRevision. Old missing versions remain null. Test verification and freshness are NOT_CHECKED; a recorded pass is not replayed by this GET.
- `artifact`: JSON pointer `/receipt/agentResponse`. Its structured content is covered by the receipt digest; original transport bytes and their raw digest are unavailable in this receipt. Remote URLs are not fetched or treated as immutable content.
- `anchor`: stored tx/block reference, with chain/contract/blockHash null and verification NOT_CHECKED. Historical rows do not record those fields. Execution chain 56 or today's testnet97 anchor implementation cannot supply missing historical provenance. An unrelated anchor reference never becomes checked because the receipt digest matches.
- `independence:UNKNOWN` and explicit integrity/identity/payment/freshness/URI limitations.

Malformed or unsupported historical bodies stay in the response unchanged, with a failed/unsupported check. A mismatch does not turn a failed claim into truth, and a matching false claim remains false. Existing 404 behavior remains. No extra DB query, shared cache, outbound call or write is added.

## MCS evidence repair

Before this change, `gradeAgainstCase` loaded case A to grade, then `runHire` loaded the latest case again for receipt construction. A concurrent capture could make the receipt cite case B. The first load's immutable caseId/groundTruthHash now travel with the grade; a second lookup is removed. New grades also carry `MCS_VERSION` and `MCS_TOLERANCE_REVISION`, identifying the deterministic rules, not an independently signed source commit.

A second inspected gap allowed subject/policy matches across different blocks despite the published fixed-case contract. A different block now yields ungraded/null quality, never a pass/fail for a different observation. This affects the local legacy run/preflight pipeline, not Phase2 ERC8183 job settlement, seller qualification history or MCS arithmetic. Exact-task comparisons may therefore correctly become unavailable. No old receipt/result is changed.

## Distinct hashes and status truth

| Value | Algorithm / scope | Does not prove |
| --- | --- | --- |
| Marque receipt hash | Sorted JSON SHA-256, no prefix | Issuer identity, settlement, authority, quality or anchor inclusion |
| Sealed call | Sorted JSON SHA-256 of its named fields | A past outcome without independent pre-outcome anchor evidence |
| MCS frozen ground truth | `stableHash`, sorted JSON SHA-256 | Current chain state or independent replay |
| MCS request/response | `hash`, SHA-256 of unsorted `JSON.stringify(value ?? null)` | Original HTTP wire bytes or ordering-independent JSON replay |
| Run inputHash | SHA-256 of unsorted JSON task | Receipt canonical digest or signed buyer intent |
| Phase2 quote hash | Existing Keccak envelope contract | Always-signed quote; unsigned identity checks remain distinct |
| SDK signed description / deliverable manifest | Existing pinned SDK Keccak/canonicalization contracts | Marque receipt hash or automatic payment release |

The historical Plinth 56916 artifact/description/payment reconciliation remains P02 evidence, not a new P04 transaction or independent human pilot. Current public historical receipt 944bea48-7c7e-4afc-aa93-fbe126772362 reproduces its published hash; that does not make its false payment/quality claims pass. Dates and metrics are in the checkpoint. Its existing anchor also has a separately captured chain 97 transaction/log/block consistency proof; the GET performs no chain verification.

## Migration, release and rollback

No SQL migration, table, index, reset, backfill, executable contract, dependency or SDK change. Database schema and contract source edits only correct misleading hash comments; executable contract statements and ABI are unchanged. Rejected runs, accepted failures, immutable receipts, historical conformance and ledger observations are preserved. A new ReceiptEnvelopeV2 table/schema is SKIPPED-existing; current version 2 already represents typed failure/service evidence.

Only future actually graded receipts gain optional quality version fields. Old clients keep existing response fields and digest domains. Strict clients should permit documented optional quality fields and top-level versioned evidence. Unknown future versions fail safely. A separate future verifier can reconcile chain/contract/block/transaction/leaf and raw byte digests with explicit provenance; this phase does not stamp missing history verified.

Rollback: revert this feature's source commit to P03. No database rollback or data deletion. Any release still requires separate production approval and the established blue/green validation. No P05 work authorized by this checkpoint.
