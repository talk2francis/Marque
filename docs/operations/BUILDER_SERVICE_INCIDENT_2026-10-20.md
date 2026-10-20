# Builder and registry service incident, 20 October 2026

Status: repair deployed on 20 October 2026. Web release/build source and probe/quote worker implementation are `af39ea3660c373f3efa5abbecc16d05cda64315d`. The owner subsequently approved the seven live A2A capability questions; their actual results and the Lattice follow-up are recorded below.

Read-only production checks reproduced two defects for BSC identities 302257, 302258, 304493, 304494, 310460 and 363709, and card-only callability behavior for reference Lattice 341554. Current registry metadata and every card were readable. The owner projection still contained old indexed endpoints.

Causes:

- The discovery safety change intentionally removed automatic A2A task sends. The builder action reused that discovery path, leaving no way to validate message/send there and treating an untested card as a failed call.
- Detail enrichment only selected identities never enriched before. Changes to tokenURI declarations did not create new current service bindings.
- The builder identity parser called web and x402 services `other`, so exact-kind comparison could incorrectly label an unchanged web endpoint undeclared.
- Callable evidence was aggregated across different services, allowing a failed MCP endpoint to invalidate a separate successful A2A check. It also admitted ordinary web discovery success; callable checks now require the exact declared A2A or MCP protocol.

The repair adds a permission-based call check, both standard response variants, shared service parsing, additive current-declaration fields, a durable URIUpdated change queue plus bounded registry reconciliation and fresh-declaration projection. Old bindings, published listings, failed probes, quotes and MCS results are retained. No MCS criterion, category requirement, freshness limit, query budget, price, wallet authority or chain action is relaxed.

API usage: omit `taskConsent` for discovery. Send `{chainId:56,tokenId:"302257",endpoint:"<exact current declared card URL>",taskConsent:true}` only with permission for the free capability question. A passing call check is neither an MCS pass nor permission to hire. Runtime acceptance still requires explicit live verification; local tests cannot substitute for it.

A registry update does not rewrite a previously published listing assertion. At 11:53 UTC all six have `listedOnMarque:true` and five local checks passing, but `listingEvidence.ownerListed:false` and `qualityListed:false`. Their preserved published records belong to the previous address `0x73809f69916fcf7ddc5bb1315fbdf96a569a5963` and still assert old runtime endpoints. The current owner must review and republish through the owner flow; Marque cannot transfer that assertion or invent the owner's signature. No automatic withdrawal was found and no listing or failed observation was erased.

Protocol reference: [A2A 0.3 specification](https://a2a-protocol.org/v0.3.0/specification/) permits Message or Task results for message/send.

## Live results and remaining limits

Caddy switched to the new web slot at **11:19:28 UTC**. Probe and quote workers started the same implementation at **11:22:22** and **11:22:43 UTC**, after builds finished. Only these workers and the web slots changed; the six reference runtimes were not restarted. Later documentation-only commits do not change this artifact or worker code.

At **11:53 UTC**, the public owner endpoint returned all six identities with all **24 current A2A/MCP/x402/web declarations indexed**, including unchanged DeFi web service ID `43291`. Old A2A rows remain historical with `declaredNow:false`. All six local checklists show **5/5**, supported by fresh MCP initialize/tools-list handshakes. These are protocol checks, not six MCS passes or seven verified A2A capability-question responses. Current A2A card observations correctly say `discovered`, with no invented last-good or last-bad call.

Four agents (302257, 302258, 304493, 304494) had current A2A quote samples. LP Placement 310460 and DeFi 363709 still had `NOT_HIREABLE`: no recognized quote for Marque's sample task. Retained failed samples have no raw response, so provider omission versus parser incompatibility is unproven. All six x402 discovery responses were HTTP 402 rejected by the current inspector as `invalid_challenge_shape_or_version`; this does not establish which side is incompatible. No payment was sent or paid adapter enabled.

Existing API clients must opt into `taskConsent:true`, or use the new **Check live call** confirmation, to request the fixed free capability question. Omitting it performs discovery only. The validator accepts standard JSON-RPC Message and Task results in regression tests; the initial seven approved live fixed-question checks produced six valid Brain Messages and one invalid Lattice Task, as recorded below.

## Validation and preservation

- Exact deployed-source CI passed on [main](https://github.com/talk2francis/Marque/actions/runs/39411729756) and [phase2](https://github.com/talk2francis/Marque/actions/runs/39411730009): workspace types, lint, copy, migrations, build and public smoke. Main's general step passed 966 cases with 94 skipped; the separate guarded database step passed 91 cases. Three network-only cases are not represented as executed by the general CI step.
- The preceding implementation `cd69542` separately passed the complete local suite: 1,053 cases in 118 files with zero skips, including network and guarded PostgreSQL checks. Protocol follow-up passed 61 focused cases and 33 database cases; final neutral-history follow-up passed 16 seller database cases. These scopes are not a newly executed complete local suite on `af39ea3`.
- Final frozen-source web build and prepared-file checksums passed. Current-data candidate acceptance passed 36 route/width cases and wallet-modal/read-only RPC checks. The synthetic owner confirmation-cancel test sent no task POST and requested no signature.
- Four affected live routes were captured before and after at 390, 768 and 1440 pixels in both themes: 24 states each, with contact boards inspected. All final states passed browser/layout checks; accessibility scanning covered eight final states and all 24 before states. The repository audit additionally ran 16 night states at four widths: eight retain small-target heuristic advisories on Builders/category links; no overflow, browser-error, missing-alt or contrast issue was reported. Its unscrolled full-page screenshots retain content-visibility blank regions; the principal capture prepaints by scrolling. No full accessibility certification is claimed.
- Production migration `0023_service_declarations.sql` added only two nullable derived-service columns. All 24 source migration hashes match the ledger; the prior 23 entries are unchanged. Before/after/final checks preserved all-field digests for **23,575 pre-existing records** across probes, quotes, builder checks, MCS results and listings for the six Brain identities plus Lattice. All eight original service identities remain. This is scoped preservation evidence, not a new whole-database restore drill.
- A same-snapshot, read-only seller query comparison returned the same 766 rows and fields before reconciliation: new query 1,305 ms, original 606 ms, under the unchanged eight-second limit. A later aggregate preservation read exceeded that limit; bounded 500-row reads with session-local JIT disabled passed without increasing it. Original failed attempts remain private.
- Twelve minute-spaced live samples retained the web release; all 24 declarations stayed indexed after reconciliation. Subsequent registry refresh cycles completed with zero refresh failures and no worker SQL/cycle errors through 11:49 UTC; actual provider failures remain published. Durable URI-event and service-walk cursors exist. The initial event bootstrap covers recent blocks; older changes rely on the priority/rolling repair, not an asserted full event-history replay.
- The 26 protected neighboring PM2 processes, shared services, global Caddy configuration, tmux sessions and 26 existing untracked evidence files were preserved. Marque and both checked Kerb public health surfaces returned HTTP 200. No mainnet/testnet write, paid task, new signature or outside-provider message was initiated by this incident work.

Screenshots, bounded raw diagnostics, failed attempts and runtime proofs remain private off-repository. The README, architecture, deviation and migration records link this incident. MCS arithmetic, tolerances, freshness limits, category thresholds and prices are unchanged.


## Approved live A2A verification, 20 October 2026

After explicit user approval, seven checks ran through the deployed public builder API from **13:21:26 to 13:22:38 UTC**, with `taskConsent:true` and the unchanged question **What can you do?** The requests respected the existing six-per-minute limit. No payment, wallet signature, funded job or follow-up task was sent.

| Identity | Initial live result | Recorded builder check |
|---|---|---|
| Brain 302257 | PASS, matching JSON-RPC Message | 352 |
| Brain 302258 | PASS, matching JSON-RPC Message | 353 |
| Brain 304493 | PASS, matching JSON-RPC Message | 354 |
| Brain 304494 | PASS, matching JSON-RPC Message | 355 |
| Brain 310460 | PASS, matching JSON-RPC Message | 356 |
| Brain 363709 | PASS, matching JSON-RPC Message | 357 |
| Lattice 341554 | FAIL, completed Task omitted `id` and `contextId` | 358 |

All six Brain responses were HTTP 200, matched the request ID and contained an agent Message with parts. Lattice also answered HTTP 200, but its shared free-face Task wrapper omitted required task/context identifiers; its artifact lacked `artifactId` too. The validator correctly rejected it. The reference adapter repair adds those identifiers and preserves the request ID and answer bytes. Two new regressions failed before the repair; all **105 focused tests in eight files** passed afterward. The MCS source anchor is unchanged. Runtime activation and post-repair verification are separate from this initial failure; original evidence is retained.
