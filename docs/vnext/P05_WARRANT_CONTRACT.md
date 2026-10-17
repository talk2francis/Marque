# P05 portable MCS and Warrant contract

Revision 1, 17 October 2026. Candidate source only; not a deployment or general certification.

## Reuse and delta

Existing deterministic MCS arithmetic, published tolerances, four categories, immutable case/result rows and per-field failures remain. No table, migration, contract, SDK, signature, approval, signer or payment rail is added. Existing case/result JSON fields carry new evidence; old records are never rewritten. The existing owner-authorized and explicit-consent builder test routes return an additive portable bundle to their caller. The public read API publishes commitments only, never task/response content.

P04's table described the historical unsorted `hash()` helper too broadly. Actual current `runConformance` writes request/response digests using **stableHash**, recursively sorted JSON SHA-256. The helper still exists for known legacy variants. The verifier reports which representation matches; it never rewrites either. Receipt and sealed-call hash functions are unchanged. Their existing regression vectors pass through the shared JSON boundary.

## Versioned bundle and exact selection

`schema:marque.warrant.v1` wraps `payload.version:1`, the exact frozen test case/ground truth and original outcome, plus SHA-256 of sorted JSON payload. It is a distinct format from Marque receipt versions 1/2. The domain is identified by the schema/version envelope; no historical digest gains a prefix. Source block and raw numeric/string representations stay exact; no new token amount uses floating-point math.

New harness requests preserve prompt/caseId and add `evidence.version:1`: full frozen case commitment, ground-truth hash, recorded capture time, current test-code source commitment, selected discovery surface, actual executable endpoint/operation, decoded UTF-8 response-text digest, selection source and explicit UNKNOWN independence / NOT_CLAIMED payment. Structured output has its existing separate digest. A2A and MCP adapters generate invocation metadata after the real response; custom adapters without this evidence remain unbound. Numeric serviceId is optional; the immutable service tuple includes canonical agent ID, protocol, discovery surface, serviceId when known, and actually invoked endpoint. No endpoint or house-agent substitution.

Owner-claim testing reuses the existing current-owner/declared-endpoint proof and task consent. Reference testing is explicitly first_party_config. A user-declared public endpoint is not automatically registry-verified. An input more than five minutes old, or dated in the future, produces case_stale before an agent task is sent; it is not an arithmetic failure. This guard is distinct from the 72-hour result freshness window and does not widen MCS tolerances. Existing full-sweep custom adapters can still produce historical test observations but lack exact portable binding; no stronger claim is invented.

## Offline method and limits

`verifyWarrantBundle` needs supplied JSON and local source only, with no database, RPC, agent call, signer or key. Optional expected agent/service/request/response commitments let the inspector compare independently selected subjects and published record references. It checks:

- Supported format and bounded JSON, complete payload commitment, original request/response digests and frozen ground-truth digest.
- Exact case/test/category/input-chain/block/prompt binding and the new full case commitment when present.
- Canonical service identity and actual operation binding, rejecting a caller's different agent/service.
- Source-manifest hash, MCS version/tolerance revision, result age and input age at the run.
- Current deterministic MCS replay against preserved input/output; exact pass/failed-fields/diffs agreement with the stored result. Transport and stale-case failures stay unavailable, not wrong arithmetic.

Results separate integrity, record agreement, PASS_FOR_RECORDED_TEST, FAILED_TEST, EXPIRED, FAILED or UNAVAILABLE, exact recorded service, current-checker code, input freshness, NOT_REPLAYED chain ground truth, NOT_PROVIDED issuer authentication, UNKNOWN independence and NOT_CLAIMED payment. Original transport bytes are not included merely because a decoded-text hash was recorded. No `verified:true`, global trust score, expected return or future performance promise.

A malicious party can assemble a self-consistent hash bundle. Compare its request/response commitments against the stored public record and its code hash against trusted source. A content match alone never proves who issued it, registry ownership at that historical time, source-chain truth, funding independence or settlement. Legacy fields without service/code evidence remain unknown even when current-checker arithmetic agrees with the historical pass. Negative history stays intact.

```text
node scripts/generate-mcs-code-anchor.mjs --check
node --import tsx scripts/verify-warrant.mts ./owner-shared-bundle.json [expectedServiceKey] [expectedRequestHash]
```

CLI exit0 means consistent inspection, including an honestly failed test; the JSON verdict must be read. It does not mean a passing Warrant or paid service. Files are local and capped at 2 MiB; URLs are never fetched by this CLI.

## Test-code content commitment

`MCS_CODE_ANCHOR` is generated from the 41 current local conformance/positions/chain/probe/db implementation files and dependency lockfile listed by the manifest. SHA-256 of the ordered file/hash list identifies this source set, not compiled bytecode or an onchain publication. The generated file excludes itself and test files. The generator check fails on source drift. No tolerance or MCS arithmetic changed. The manifest is public at `/api/v1/conformance/code`; it is a digest reference, not a signature. Exact tested source and manifest hash are bound in the checkpoint.

## Public and owner APIs

- Existing builder test POSTs keep all old fields and add `warrant`. They still require taskConsent:true and retain existing owner checks. No route is invoked during read-only browser checks.
- New `GET /api/v1/conformance/:id` is version1, no-store, indexed positive result ID only, 8-second read bound. It exposes stored identity/test/version/case/input-chain/block/date/pass and request/response commitments. Raw request, response, endpoint URLs and raw errors are not disclosed. Missing bundle/raw content stays null, replay NOT_PERFORMED. Legacy binding/code fields remain null. Invalid ID400, absent404, unavailable503.
- New `GET /api/v1/conformance/code` publishes the source commitment without database access. This is the missing code-reference surface, not a replacement marketplace or execution service.
- Legacy marketplace `warranted`/qualification field names and filters remain compatible as **historical identity test-pass semantics**. Visible default badges and counts now say Test passed / Test passes. They do not imply exact-service evidence. Badge supports an explicit serviceBound flag for a future verified caller; existing callers never set it from old identity-only history. Listing and paid hire remain independent of conformance results.

## Actual proof and remaining gaps

Private read-only production snapshots contain 12 real historical cases: four passes, four transport failures and four error-free failed-answer cases across all four categories. They are replayed with the same checker; exact agreement is reported in the checkpoint. All are legacy and do not acquire present-day source/service provenance. No new agent task or paid job was needed to manufacture a number.

Separately, `observeCase` reuses the existing four live readers without persistence. Fresh public BSC input reads succeeded first at blocks 128102591, 128102592 and 128102594. A second read at 04:11:08-04:11:12 UTC on 17 October explicitly checked eth_chainId=56 and succeeded at blocks 128104084 (REB), 128104086 (HF), 128104088 (GRID/YIELD); every result records its exact subject/policy/block/digest. No archive credentials or substitute historical state. These input reads are not four agent passes, hires, independent users or settlement evidence. First-party historical actors retain their labels; actual person/funding independence remains UNKNOWN.

Tidemark's realized/unrealized-yield distinction and all category arithmetic/tolerances are unchanged. No new outside-provider consent, human wallet action or portable exact-service external pass is claimed. A future owner can explicitly test and choose to share their returned bundle; that consent is not inferred here.

## Rollback and release

Revert candidate source to P04; no data rollback or deletion. New request JSON is additive, immutable and interpretable as an ordinary historical result by old readers. New portable evidence must never be added retroactively to old rows. Rendering/copy changes preserve fonts, artwork and layout tokens. A separate approved production release is required. Owner already authorized P06 and P07 after this local checkpoint; no fresh phase approval is needed. No P08 authorization is inferred.
