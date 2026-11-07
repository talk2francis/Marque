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

## Verification status

Initial native web typecheck, scoped lint/copy and 41 existing FAQ, lifecycle, daily-work and original-answer comparison regressions passed. Initial interface source `8cefc3d61fd2511342dab434e083f4867640cb14` built all 44 pages and passed six viewport/theme interaction cases and eighteen AXE scans. Nineteen banner model/authority/HTTP cases and six isolated PostgreSQL cases passed, including real signed-session HTTP persistence. The final combined build, banner browser review and exact-source CI are the next gates. Final acceptance and activation will be added after actual results; this candidate description alone does not claim deployment.

The first combined-source browser pass at `c45455f` passed all six interface cases and eighteen accessibility scans with no serious or critical findings. Six editor cases and actual cropped-image persistence also passed. Editor review found a moderate heading-order issue; the final polish changes its heading level without changing its appearance and clarifies the normal profile-update delay. Final-source acceptance remains pending.
