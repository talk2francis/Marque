# Interface clarity, 7 November 2026

This follows verified live release `02aacc8512ef9270d35f1044abf83104ae44fea3`. Its scope is the homepage FAQ/category/hero help, My Marque agent entries and shared delivery record, and Today spacing/answer-selector controls. The user then added optional owner-uploaded agent banners. Other surfaces retain their current design.

## What changes

- The FAQ reaches the viewport edges using the existing hire band's textured sage material and shared content width. Questions retain native expansion, single-answer behavior, deep links and unchanged search-engine answer copy.
- Category doors prioritize a short explanation, measured mainnet availability, snapshot price and a clear Browse link. Supporting ratings, checks, operator counts, testnet availability, times and the supply-target measure remain in explicit disclosures. Expanding one card does not stretch its closed neighbours.
- Wallet-free browsing, Marque Pass and Agent Forge help moves from the hero to the FAQ footer.
- Personal agent entries separate identity, recent activity, management buttons, campaign checklist, delivery record, job history and owner-only profile controls. Every original evidence link and timestamp remains reachable.
- Today separates the task board and answer-check panel. Rating links have clear affordances; the answer-selector is a primary button with its existing expansion behavior. Actual comparisons still run only after the existing explicit per-answer action, with a bordered 44-pixel button. Mobile activity labels reserve space so their values align.

- Owners can optionally upload a hero banner after listing/registration or in profile tools. A banner uses the reference masthead layout with the owner’s own art and portrait. Without a saved banner the current header stays. [Owner guide](AGENT_BANNERS.md).

## Preservation

Existing price, count, test, observation, campaign and signed money paths retain their rules. The banner adds a separate presentation reader/write endpoint, additive table 0031 and a guard against deleting active banner images during wallet-profile cleanup. The existing session verification and canonical on-chain ownership reader are reused. No testnet or mainnet transaction is required for this work. Documentation and generated changelog are updated together.

## Verification, completed 8 November 2026

The final application was built from `d518b2493e73b0c6271f8d292629d845427df58d`. GitHub CI [42415062380](https://github.com/talk2francis/Marque/actions/runs/42415062380) passed typecheck, lint/copy, build, 1,393 ordinary tests (134 skipped), 121 isolated database tests and 15 Act/fork checks. These groups overlap. The final published revision must also pass its own main-branch CI before promotion.

| Check | Actual result |
| --- | --- |
| Home and public workspace interactions | Six cases at 390, 768 and 1440, Night and Day; 18 accessibility scans without serious or critical findings; 48 captures reviewed. Evidence retains source `c45455f`; strict source comparison proves those rendering inputs unchanged in the final application. |
| Final owner banner editor | All six size/theme cases passed; no accessibility violations, including heading order. Choosing, moving and zooming upload nothing. Cancelled signatures retain the crop and send no session or image write. |
| Actual prepared image | Six isolated PostgreSQL tests passed using the browser's real 960 by 320 WebP. Signed-session save/read, invalid session, changed owner, shared artwork, profile cleanup and pointer removal were checked. |
| Final profile headers | Twelve isolated banner/default cases passed across the same six size/theme combinations, without reference badges or overflow. All 18 final editor/header captures were reviewed. |
| Repository browser audit | Four routes, four widths including 1024, both themes: 32 combinations, zero issues. All captures reviewed; navigation snapshots include loading states, complemented by the settled interaction cases above. |
| Read-only answer action | Mainnet job 57125 returned HTTP 200 with one compared field. The testnet example returned an honest `nothing_to_recheck`; not every recorded answer has a supported comparison. |
| Preserved records | Nine-wallet close guard passed. Four Ledger comparisons and six Brain on BNB profile checks passed. Original benchmark, answer and selected test row fingerprints remain unchanged. |
| Source and document preservation | Money/revoke and sign-in handlers, portrait cropper, reference masthead CSS, workers, commerce rules, dependencies and first-party configuration retain their existing behavior. All 21 README image-reference lines and its Mermaid block remain. |

The auditor now uses the existing strict JSON-RPC read classifier rather than blocking all POST requests. Its ten guard tests pass; signing, broadcast and arbitrary POST requests remain blocked. Query strings containing equals signs are preserved in its route arguments. Earlier failed harness attempts are retained separately and are not counted as passes.

Additive migration 0031 was applied successfully. Production banner storage was verified empty before activation; no production owner image or funded hire was submitted for these checks. Real read-only registry checks accepted the expected owner and rejected another address for one mainnet and one testnet identity. The signed save path was exercised on an isolated database with throwaway actors. No real Marque Pass credential was used.

## Activation and limits

Promotion uses the existing prepared-artifact checks, both-worker readiness, route verifier, blue/green switch and rollback checks. The [live release endpoint](https://marque.trade/api/health) identifies the promoted revision; a verification report is not itself a deployment claim. Public release summaries are retained in the repository's [release record](https://github.com/talk2francis/Marque/tree/status-log/releases).

CI keeps push and pull-request concurrency groups separate. A merged pull-request run must not cancel the main-branch release checks. The cancelled run remains recorded; promotion still requires successful checks for the exact published revision.

The existing short storefront page cache remains. The editor confirms storage immediately and explains that the public profile may take a moment to update. The earlier capacity limit remains unchanged: the guarded 25-visitor run failed latency targets and higher stages were not established. This presentation work makes no new capacity claim.
