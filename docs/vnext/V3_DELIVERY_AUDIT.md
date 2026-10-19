# V3 delivery audit

19 October 2026. Requested after the user found little visible progress, stale roadmap copy and inconsistent supply counts. This replaces any interpretation that finishing P15 means every future feature is delivered. Public release verification is recorded separately from source completion.

## What changed and what remains

| Phase | Implemented component and access point | Limit or remaining work |
|---|---|---|
| P01 / P01A | Organizer guidance, local quest distinction, expiry and owner-GET privacy | No official qualification certification; cross-marketplace and personal eligibility unknown |
| P02 | Exact-service quote/provider checks and hostile-endpoint boundaries | Cannot create outside supply or guarantee provider uptime |
| P03 | Seller workspace in `/builders`, public summaries and private owner diagnostics | Recorded wallets are not independent buyers; no guaranteed earnings |
| P04 | Receipt content hashing and integrity projection at `/receipts/*` | Content match is not payment, quality or execution authority |
| P05 | Exact-service MCS commitments and published code provenance at `/standard` | Historical identity passes do not create current service Warrants |
| P06 | Preserved historical Plinth job 56/56916 evidence | No newly demonstrated independent paid pilot; identity/funding independence unknown |
| P07 | `/api/v1/marketplace?format=machine`, schema/OpenAPI, typed GET reader, `buildHirePlan` | Plans remain unsigned and unsimulated. No MCP or autonomous buyer execution |
| P08 | Offline trial replay with explicit evidence limits | Independent-provider paid trials insufficient |
| P09 | Advisory routing | No proven actual-paid selection and outcome loop |
| P10 | Read-only native action policy preview at `/app/charter` | Grant, portfolio execution and revoke disabled; no Altana qualification |
| P11 | Provenance and buyer-linked review commitments | No proven commercial outcome learning or independent adoption |
| P12 | Contextual receipt, evidence, quote and limitation copy in existing UI | Incremental UX changes, not a redesign or delivery of all roadmap epics |
| P13 | GET consumer examples, local verification, beta HTTP-payment challenge inspection | No HTTP payment execution or independent human adoption proof |
| P14 | Readiness, safe deployment, persistence, query bounds, index and recovery fixes | Historical capacity and restore evidence retain their dates and limits |
| P15 | Operational handoff and recovery evidence | AMBER limitations remain. The prior handoff omitted README, changelog and roadmap reconciliation; that was a reporting defect |

## Confirmed omissions and defects

- README still described universal signed quotes, guaranteed category depth, four complete Ledger comparisons and active native charter authority. Those claims exceeded the current evidence.
- Public changelog stopped on 30 September. Roadmap still placed implemented seller and machine-read components entirely in the future, while their unfinished execution parts were not separated.
- `/api/v1/phase2/coverage` was publicly linked but returned 404.
- Third-party quotes observed with 15-minute validity were refreshed on a 30-minute success cadence, creating availability gaps. The scheduler now brings refresh forward using original expiry while retaining failure backoff, poll floors, limits and safe endpoint handling. It never extends provider terms.
- Homepage coverage came from an independent stale projection rather than the same complete matching listing population as the marketplace. Counts are now aggregated before pagination from the same observation as its headline. Expiry filtering uses a fixed observation time, avoiding Array.map passing its row index as a timestamp.
- Ready listing metadata could retain an old quote after provider renewal. Ready reads now overlay their already-read current exact-agent commercial terms without another catalog scan, with a separate internal quote observation timestamp. Metadata freshness retains its original timestamp.
- Category headers displayed task-compatible third-party supplier groups, which were easy to mistake for escrow listing counts. Both scopes are now named separately, with the local three-listing target retained.
- Tidemark still answered a real free request with a data-read error while offering quotes. New quotes now require a bounded historical-state dependency check. Its underlying archive access remains unresolved. The shared paid-work adapter also refuses to submit terminal engine errors or refusals as deliverables; old signed terms and funded-job paths are preserved.
- Identity mismatch and missing-service hypotheses were tested against the captured ready set and were not found. No speculative identity relaxation was added.

The screenshot sweep records the live baseline before these source repairs. It covers discovered public navigation and page families, including all currently hireable profiles, historical linked records, day/night and desktop/mobile states. It is not a claim to enumerate every possible registry identity URL. Screenshots and private runtime evidence are kept out of this public repo.

## Unresolved product and qualification gaps

Reliable independent third-party depth, newly proven independent paid outcomes, native portfolio authority, paid HTTP execution, MCP, autonomous procurement and commercial outcome learning remain incomplete. Tidemark's historical-state reader is unresolved. Redcell has no published MCS; Tidemark does not implement the quoted-net-APR test. Four corresponding reference engines passed their cases on 19 October; earlier failures are preserved.

The live Ledger observation in this audit reports two of four comparisons complete. The September Agent Advantage Report remains historical, not a current all-complete status. Three qualifying marketplace-hired benchmark tasks and their payment/output links are not established by engine replay.

The [official-requirements crosscheck](./HACKATHON_CROSSCHECK.md) records each verified, partial and unknown condition. No internal test total establishes full product completion or hackathon qualification.

## Release evidence

Source fixes, fresh build/test evidence, actual deployed release and worker activation must each be recorded in the release checkpoint. Until public verification succeeds, these repairs are source changes awaiting release. The previous website release was `267b46d26582ce32a67787f66d71364a7db8dadd`, with web inputs built at `78d9b64b8b32bbf9f7784fe60d3575a3c561dbd4`; repository documentation had advanced to `fb6a29f217a645ecda3a5c9b685f128174f69640`. Different source and build revisions were disclosed, not evidence that every newer repository file was deployed.

Additional release-blocking findings: the first full audit suite found concurrent publication retries returning 503. A held-lock regression reproduced the problem, and the repair gives identity serialization a bounded five-second wait while retaining one-second write locks and atomic rollback. Live captures also found asset 502s with upstream resets; the Marque proxy now uses a two-second idle-connection pool below the measured five-second Next.js timeout. Both require final-source and public release verification; neither is a completed-production claim.

Screenshot review also confirmed a long failed-test badge overflowing the mobile profile for identity 269226. A scoped wrapping correction retains the full published failure text and existing visual system.

Deeper linked Job Room review found expired unpaid jobs still prompting payment. Their recovery callback now reuses the main hire flow's current-chain identity, terms, policy, asset and budget checks, checks the payment window before each write, and never repays an already-funded job. Failure to notify the seller is shown separately from confirmed escrow funding. The audit exercised real button callbacks with mocked wallet/RPC dependencies; it created no live job, signature or transaction.

Unpaid-job prices are labelled Original quote (MEASURED), separate from an unset on-chain budget. Recovery button and transaction labels format the original amount and token directly, so a zero or stale chain budget cannot label a larger approval as zero.
