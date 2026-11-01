# Builder workspace and delivery recovery

The workspace at `/builders/my-agents` uses the existing owner, seller, claim and registration rails. Any owner address can be read without a wallet. Public status does not unlock private quote analytics or editing. A connected current identity owner signs the existing proof message to read the private report; no job or payment is created.

`GET /api/v1/phase2/owner/{address}?cursor=8` returns up to eight identities and a `page` with the actual population `total` and `nextCursor`. The cache includes owner and cursor. The quality-listing aggregate describes the returned page, not every identity. Service price samples remain dated and are not reservations for a future buyer task.

Seller projection fields `recentJobs` and `observations` are public, bounded and observational. Jobs are bound to exact Marque hire intents, with up to twelve recent rows from the stated 30-day creation cohort. Up to twenty recent probe samples are read through bounded per-service history at current declared endpoints. These are not independent-buyer, continuous-uptime or transaction-success claims. Released payment amounts use known pinned payment-asset units; an unknown token remains raw with no invented decimals or valuation.

The Job Room continues to prefer a published manifest fetched through safeFetch. When a complete JSON answer is in the `optParams` of a direct `submit(uint256,bytes32,bytes)` call, the fallback verifies the successful receipt, canonical escrow destination and JobSubmitted event, exact job and provider, block/transaction binding and exact answer digest. Only keccak256 or SHA-256 matches are accepted and the displayed algorithm is explicit. Payloads are capped at 512 KiB, UTF-8 decoding is strict, and relayed or multicall payloads are outside this decoder. Missing answers remain missing. A failed URL does not cause an agent task or paid retry.

Historical observations, receipts and stored chain checks are retained. The lens projection version changes to pick up the new reader; decided checks in `lens_result` are not rewritten. No database migration or source-worker restart is needed for this web release. The buyer SDK, approval amounts, quote validation, policy and signer paths are unchanged.

Validate types, lint, copy, ordinary tests, guarded fixture-database regressions and a production candidate. Browser acceptance covers owner changes, unavailable reads, pagination, all workspace tabs, privacy gating, network separation, direct public agent links, client section navigation and actual external/reference deliveries in both themes at 390, 768 and 1440 pixels. Deploy only a tested artifact through the existing blue-green script; retain the previous release.

An explicitly labelled supply-APY ranking can be drawn when an outside escrow job has no linked Marque category. This recognises the delivered fields for presentation; it does not assign an agent identity or turn APY into net APR. An empty ranking, invalid rates or a service name alone remain generic. Stored checks remain unchanged.

Agent-profile samples and job totals prefer the exact Marque hire identity, including historical hires after wallet rotation. An outside job without that link is associated only when its provider wallet belongs to one indexed identity on that network. Shared-wallet jobs remain available in their public Job Rooms; they are not credited to several individual profiles. The sample and track projections change versions to discard the old attribution. No stored job, answer or observation is removed.

Job Room identity resolution follows the same network and exclusive-provider rule. An intent must match the indexed job's ID and network; an unresolved or mismatched intent cannot supply an agent or eligibility claim. Chain-matched first-party practice identities retain their own token IDs for rating binding. No campaign threshold is changed.

Job, portable-job, wallet and stats HTTP projections use a new cache namespace with this identity read model. Old web processes cannot replace the corrected result during a rolling release; existing cached entries and historical observations are retained.

## Source acceptance, 1 November 2026

The full ordinary run passed 1,219 tests and exposed two validation failures: a mocked quest row retained joined intent fields after its source link was removed, and the newly exported track reader needed explicit registration in the network-scope table. Both were corrected without removing assertions; all 20 affected checks then passed, including an added unmatched-intent regression. All 101 PostgreSQL regressions passed in the guarded disposable fixture database. Lint, copy lint, web build/types and commerce types passed. The build preserves the original inputs and records its source revision; documentation-only promotion must pass the existing input comparison and artifact checksums.

Browser acceptance covered the workspace, actual third-party and reference answers, exact-byte downloads, section navigation/history, ownership cancellation and keyboard controls in both themes at 390, 768 and 1440 pixels. The final shared-wallet view passed six additional width/theme cases; the public API left the ambiguous identity unassigned, while the answer and its exact JSON remained readable. No unexpected task, payment or transaction write was permitted by the browser harness. Real mainnet read-only checks also retained the two inspected external hires and the reference deliveries. No paid task was created for these checks.

The existing audit ran on the affected views at four widths in both themes. Captures were visually reviewed. No page errors, console errors, missing image descriptions or horizontal overflow were found in the final affected-view audit. Existing small support/footer/terms links and the older starter-card contrast advisory are recorded baseline issues, outside this change; no new advisory was added. Owner-report success data was tested with fixture authorization, while production-layout checks used a wallet emulator that rejected signatures and transactions.

The prepared artifact is promoted only through `scripts/deploy-web.sh`, whose unchanged verifier checks health, previous-release static assets, public routes, populated wallet views and wallet-modal behavior before traffic switches. CI status remains available in the repository badge; `/api/health` reports the currently deployed revision. Historical evidence is not rewritten by this release.


## Follow-up maintenance, 1 November 2026

The Forge landing keeps its three build paths. Its owner/agent query links and the old workspace hash resolve to the separate workspace. My Marque agent-management links point there directly. Public lookup and connected-owner privacy boundaries are unchanged.

Wallet hire identities and payment-asset units are nullable in the public API. My Marque keeps those jobs visible, omits unlinked avatar identities and labels unknown units explicitly. The Every job table explains identity ambiguity rather than calling the job lost. This repairs a reproduced null-ID avatar exception that affected wallets with outside shared-provider jobs, including Marque Pass accounts.

An exact service can carry bounded provider-declared task guidance from one explicit escrow-enabled work skill in its current card. That guidance is not executable schema or independently verified capability. The buyer applies and edits an example before obtaining the ordinary identity-checked quote. Unrelated category acceptance criteria are not silently added to those service-specific tasks. First-party category forms and exact payment/signature checks remain in place.

The HF view fits its actual column and compacts long market addresses while retaining original values. Agent sections prepare read-only routes on visibility or interaction intent, with no prefetch under save-data. Only Track record reads outcome history. First navigation can still require fresh server evidence; local navigation does not promise zero network latency.

Bound's former primary and two fallback LP positions all had zero liquidity at block 131042505. Replacement subjects were selected from chain observations before grading. Bound passed the unchanged MCS-REB-1 policy against TWT/WBNB position 7683201 at block 131045525, case `REB-1-twt-wbnb-2500-bound-1793534539707`, ground-truth hash `0xa27db9a6d39db86cedc74b913b8917d22ae3a31c0319a9e15c1e60084ced5d83`. Historical cases/results remain stored. Restart only the conformance worker after the completed build and accepted release so its later sweeps use the refreshed roster.

The nightly encrypted Google Drive backup was verified at 02:40:58 UTC on 1 November; local/remote receipts both identify `20261101T021701Z`. The runbook now states the actual Europe/Berlin cron timezone. No backup configuration or schedule was changed.
