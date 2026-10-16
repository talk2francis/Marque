# Seller projection v1

The existing `GET /api/v1/builders/checks` identities and public `GET /api/v1/phase2/owner/:address` agents gain an additive `seller.version=1`. Existing response keys remain. The owner projection cache namespace advances to v3; it never caches private diagnostics. No migration, schema reset, dependency or worker change.

## Public observation

The projection declares chain, agent key, observation time and a 30-day job creation cohort. Jobs are attributed through the exact chain/job/intent/identity relation, never merely a shared provider wallet. Funded, submitted, completed, released and refunded counts are overlapping lifecycle facts, not a funnel of independent humans. Unknown current head lag stays null. The existing legacy owner `jobsPaid` field continues to mean funded, as its v1 evidence already states; use `seller.jobs.paid` for indexed payment release.

Earnings sum indexed PaymentReleased amounts; refunds are a different kind and belong to the buyer. Amounts are decimal strings in raw units per chain/token, with decimals null and no inferred USD conversion. A single latest release/refund event per job is counted, consistent with the immutable terminal state; conflicting provider/token bindings are excluded. These are historical identity-cohort amounts: after an identity transfer they can include payments to a former provider, not the current owner's wallet balance. Index data is a projection, not a new independent chain verification of every event.

Registry owner/wallet proof uses the existing P02 bounded same-block proof, including actual chain and head freshness. Public proof failure becomes explicit UNKNOWN rather than using an old owner as current. This is not proof of separate human operators. Public quote observations use only scheduled probe records, newest attempt per exact service. An old successful price cannot override a later failure. A current sample needs a currently declared service, runtime endpoint match, current registered provider, chain, successful original validation and unexpired lifetime. It remains a dated probe, not a buyer reservation or substitute for exact-task verification. Current proof/quote requests are read-only; no provider task is invoked here.

At most 16 service rows are exposed, with explicit truncation. Latest discovery plus good/bad timestamps are bounded to the last 100 scheduled samples per service. These samples do not measure continuous uptime. Owner-listed, quality-listed, Warrant, hireability, Marque's four-category stretch and BNB review remain distinct. Old identity-level conformance results cannot establish a historically immutable exact-service binding: Warrant in this projection is explicitly UNKNOWN, rather than promoted from an unrelated test. Existing test/receipt records remain intact.

## Owner diagnostics

The builder GET accepts the existing short-lived claim token only in `Authorization: Bearer ...`. It must match the requested owner, network and single identity. Fresh registry ownership must still equal the claim owner before any diagnostic SQL executes. Invalid proof returns401 when verification is configured; missing verification configuration returns an explicit no-store503 while anonymous public status remains readable; different identity/owner or current ownership unavailable returns403. Responses are no-store and vary by Authorization; tokens never enter URLs. A current RPC outage cannot reveal private aggregates by falling back to the index.

Diagnostics contain counts of user exact-task quotes (accepted/rejected/signed/unsigned/unknown), top failure codes with remediation, accepted-quote to indexed-funding conversion and latest per-job notification acceptance/rejection/unknown. Quote and notification windows/denominators are explicit. Historical notifications retain their historical parsing semantics. No task, buyer address, IP, raw response, bearer token or signing material is returned. Public `seller.diagnostics` is null. A public owner address alone grants no private access.

## Mutation and task boundary

Both existing GETs remain observational. Publication reuses P01A's owner-authorized, fresh-proof, idempotent POST; it is not rebuilt. Category declaration now also rechecks current ownership. Owner-recorded tests require current ownership and the exact currently declared endpoint/kind before capturing or sending a task.

`Probe now` is now discovery only. A2A reads the card and does not send message/send. MCP uses discovery initialize/notification/tools-list only. A readable A2A card alone cannot be labelled task acceptance. Discovery refuses endpoints absent from the identity's current metadata, retaining shared safeFetch guards. This operation can store a measurement after an explicit POST; no GET starts it.

Both existing conformance POSTs require explicit `taskConsent:true`; omission/false returns428 before case capture or task execution. This intentional fail-closed addition protects old callers from unintended task side effects. The checklist/claim flow show confirmation; the public tool starts unchecked and resets consent when its endpoint changes. Test callers must have permission and use an endpoint configured for a test without payment or other side effects. A provider's HTTP402 stops the existing adapter; no automatic payment or payment header is added. Consent is a caller assertion, not cryptographic proof of the outside operator's consent or universal side-effect prevention.

## Rollback and limits

Candidate only. Revert the feature commit or return to P02's baseline; no database rollback is needed. No production deployment, push, wallet session, mainnet/testnet write, provider task, contract change or SDK upgrade is performed by this phase. Historical records are not retroactively rewritten or promoted to stronger evidence. Private raw validation stays outside Git.
