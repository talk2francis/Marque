# BUILD-PROMPTS.md
## Marque Phase 2: paste-ready phases

Paste one phase at a time. Wait for its CHECKPOINT. Check the acceptance lines against the evidence. Then paste the next.

Every prompt assumes `docs/phase2/` holds this pack and `AGENTS.md` has section 13 appended.

---

## 0. Order

**Two lanes** (two Claude Code sessions in separate worktrees `../marque-a` and `../marque-b`, both off branch `phase2`, merging to `phase2` after each checkpoint):

```
Both:   P2-00
Lane A: P2-02 → P2-03 → P2-04 → P2-05 (gated) → P2-11
Lane B: P2-01 → P2-07 → P2-06 (by Sun 10:00 UTC) → P2-08 → P2-09 → P2-10
Both:   P2-12 → launch → P2-13 after launch
```

**One lane:** P2-00, P2-01, P2-02, P2-03, P2-04, P2-06 draft, P2-05, P2-06 send, P2-07, P2-08, P2-09, P2-11, P2-10, P2-12.

Hard clock: P2-06 handoff sent by **Sun 27 Sep 10:00 UTC** whatever else is unfinished, with honest statuses.

---

# P2-00. Stabilise, measure, clean (both, 2 h)

```
P2-00. Read docs/phase2/MASTER_PROMPT.md, then AGENTS.md sections 1 to 12, then docs/phase2/AGENTS-PHASE2.md.
You are starting Marque Phase 2. This phase makes the current product truthful and measures the protocol.
It changes no product behaviour except fixes.

1. SAFETY FIRST
   - pg_dump the production database to /root/.marque/backups/pre-phase2-<utc>.sql.gz. Paste the size.
   - Record the production commit and PM2 list in docs/phase2/PROJECT_STATE.md (create it with sections:
     Phase status, Protocol facts, Deviations, Requests, Evidence).
   - Create branch phase2 from main.

2. CONSTITUTION
   - Append docs/phase2/AGENTS-PHASE2.md to AGENTS.md as section 13.
   - Fix AGENTS.md line 6: the domain is marque.trade.
   - Add pnpm lint:copy: fails on U+2014 or U+2013 in apps/web/**/*.tsx string literals, README.md and docs/**.
     Report the current count; fix only files you touch in later phases (do not mass-edit historical docs now).

3. PUBLIC REPO HYGIENE (invariant 30)
   Move these out of the repo to /root/.marque/private/ on the VPS, then git rm them. Do not rewrite history.
     "Marque-Rough-Plan-Build-Critique-Preparedness.md", "Forms-Funding.md", "Marque -Master-Plan.md",
     "claude demo plan/", "demo/", _hero-l.png, _hero-l2.png, _r-docs-l.png, _r-docs-scroll.png,
     _r-hero-d.png, _r-hero-l.png, playwright-report/
   Keep demo-video/ only if README links to it. Fix any README link that pointed at a removed file.
   Add the paths to .gitignore. Paste the new root listing.

4. PROTOCOL FACTS (read only, no transactions). Write docs/phase2/PROTOCOL-FACTS.md with measured values
   on BOTH chain 56 and 97, using @bnbagent/sdk@0.6.0 NETWORKS for addresses:
   - OptimisticPolicy.disputeWindow() in seconds and in hours
   - AgenticCommerce: paymentToken(), jobCounter(), platform fee if readable,
     isPaymentTokenSupported(U, USDT, USDC, USD1) using the SDK asset catalog
   - eth_getCode at ReputationRegistry 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (56) and
     0x8004B663056A597Dffe9eCcC1965A193B7388713 (97): code length > 0 or not
   - One real JobCreated, JobFunded, JobSubmitted, JobCompleted log on 56 or 97 (any marketplace) and
     one NewFeedback log if any exist: paste tx hash and confirm topic0 equals SPEC-TRACKING section 2
   - For each reference seller: call A2A negotiate with the probe task from SPEC-COMMERCE 4.2 and paste
     chain_id, verifying_contract, price, currency, quote_expires_at, whether provider_sig recovers to
     the agent wallet
   If any measured value contradicts the pack, the measured value wins: note it under Protocol facts.

5. PROBE INCIDENT (funnel Reachable = 0 while /status shows 7,115 agents last-verdict live)
   - Diagnose with evidence: pm2 status and last 200 lines of marque-probe logs; SQL for max(checked_at)
     overall and per tier; count of probes with service_id not null in the last 24 h; how the scheduler
     chooses its 500 services.
   - Fix with a tiered scheduler in packages/probe:
       T0 reference agents' services: every 5 min
       T1 services whose last verdict was live, unbound or bad_schema within 7 days, or whose agent is
          classified into one of the five categories: every 30 min
       T2 never probed: FIFO
       T3 dead 3+ times in a row: backoff 6 h, 24 h, 72 h
     Each cycle fills T0, then due T1, then T2 and T3. Keep safeFetch, per-host limits and concurrency.
   - ACCEPT: within 60 minutes of deploy the funnel shows Reachable > 0 and Callable > 0, and /status shows
     T0 100% fresh (< 10 min) and T1 >= 95% fresh (< 60 min). Paste both.

6. /api/v1/agents RETURNS 503
   - Reproduce with curl and timing. Find the cause (unbounded query, timeout, memory).
   - Fix: pagination (limit default 50, max 200, cursor), a Redis-cached projection refreshed every 60 s,
     and a hard 5 s server timeout that returns the last good projection with its age.
   - ACCEPT: 20 sequential requests, p95 < 1.5 s, zero 5xx. Paste.

7. STALE WARRANTS
   - Warrants show 2026-09-19 "retest due". Re-run MCS for all five reference agents now.
   - Make the conform worker re-test reference agents every 12 h and hireable third parties every 24 h.
   - Warrant date shown = most recent pass. "Retest due" only if the last pass is older than 72 h.

8. Do NOT change the hire flow, the marketplace ranking or any page design in this phase.

CHECKPOINT: backup path and size; new root listing; PROTOCOL-FACTS.md content; probe diagnosis and the
after numbers; /api/v1/agents timings; new warrant dates; lint:copy count. STOP.
```

---

# P2-01. Canonical supply and the commercial axis (Lane B, 4 h)

```
P2-01. Read MASTER_PROMPT.md section 3, SPEC-COMMERCE.md sections 4 and 11, PROTOCOL-FACTS.md.
Goal: every agent the marketplace shows is an ERC-8004 row; hireability is measured from live signed quotes;
at least 3 hireable agents per category.

1. REFERENCE AGENTS AS ROWS (invariant 29)
   - Ensure the five mainnet identities 341553..341557 are ingested in `agent` (chain 56) with their services.
     If ingest missed them, fetch them directly by token id through the existing chain-identity path.
   - Add config/first-party.json (owners + tokenIds) and mark first-party rows from it.
   - Add migration agent_alias(alias pk, chain_id, token_id). Seed it with marque:bound -> 56:341553 and the
     other four. Display and search resolve aliases; historical rows are untouched.
   - Remove referenceRows() and the '0.15 U per call' constant from apps/web/lib/marketplace.ts. Keep
     reference-agents.ts only for slugs, ports and blurbs.
   - ACCEPT: the funnel counts the reference agents; "Qualified" is no longer 0 while "Warranted" is 4.

2. COMMERCIAL AXIS
   - Implement the states in SPEC-COMMERCE 4.1 as columns or a view over probe + commerce_quote:
     preview_only, quoteable, hireable, settleable.
   - Quote probe job in apps/worker (SPEC-COMMERCE 4.2), writing commerce_quote with source='probe'.
     Detection: A2A card skills include negotiate and notify_funded, or the card declares ERC-8183.
   - Hireable rules exactly as SPEC-COMMERCE 4.1, including provider_sig recovery and the
     chain_id / verifying_contract / token checks.
   - Feed settleableServiceIds in apps/web/lib/agent-state.ts from commerce_job once Lane A's indexer exists
     (stub to [] with a TODO referencing P2-03 until then).
   - Prices shown come only from commerce_quote (MEASURED with expiry) or declared metadata (CLAIMED).

3. SUPPLY AUDIT AND ACQUISITION
   - pnpm supply:audit prints per category: hireable, quoteable, preview_only, callable, with agent name,
     operator (owner), chain, price, quote age. Writes docs/phase2/SUPPLY.md.
   - Work the gaps: for each category below 3 hireable, list every candidate that is callable or quoteable
     and what it is missing. Write docs/phase2/OUTREACH.md (agent, owner, endpoint, missing piece, fix) for
     Francis. Do not contact anyone yourself.
   - If a category is still below 3 after the audit, apply the supply ladder in AGENTS 13.8 and escalate
     for the rung 3 decision (a second first-party agent) with a one-paragraph proposal per category.

4. API
   - GET /api/v1/phase2/coverage per SPEC-TRACKING 6.5.

5. Classification: the default marketplace view never shows Unclassified. Report classification coverage.

CHECKPOINT: docs/phase2/SUPPLY.md with per-category hireable counts and agent ids; /api/v1/phase2/coverage
output; proof that reference rows come from `agent`; outreach list; any rung taken. STOP.
```

---

# P2-02. ERC-8183 buyer rail (Lane A, 8 h)

```
P2-02. Read SPEC-COMMERCE.md in full, PROTOCOL-FACTS.md, AGENTS 13.2 invariants 22 to 24, 13.10.
Build the wallet-signed buyer rail. Testnet (97) first against the reference sellers. No Marque wallet
is ever the client of a job.

1. packages/commerce per SPEC-COMMERCE section 7. Pin @bnbagent/sdk exactly 0.6.0. Import NETWORKS,
   ABIs and buildJobDescription from the SDK. No hand-typed addresses in app code.

2. Server routes (apps/web/app/api/v1/hire/*) per SPEC-COMMERCE 7.1:
   - quote: A2A negotiate to the exact service via safeFetch; verify provider_sig recovers provider;
     verify chain_id and verifying_contract against NETWORKS; verify provider matches the agent wallet or a
     declared commerce address; store commerce_quote source='user'; return the canonical description.
   - intent: stores hire_intent (no user signature; category from the agent's classification, never from
     the request; rate limited per IP and wallet).
   - bind: reads the createJob receipt and binds per SPEC-TRACKING section 5.
   - notify: idempotent A2A notify_funded with retries (3, backoff), logged in notify_attempt.

3. Client hooks (packages/commerce/src/client):
   - useQuote, useHire (step runner), useJob, useAllowances, useRate (stub until P2-04).
   - useHire runs SPEC-COMMERCE 5.1 steps 2 to 8 with wagmi:
       createJob or createJobWithToken with evaluator = router AND hook = router
       wait for receipt, parse JobCreated jobId, POST bind
       then registerJob, setBudget(price), approve(exact) only if allowance < price, fund(price)
       then POST notify
   - EIP-5792: call wallet_getCapabilities; if atomic batching is supported on the chain, send registerJob,
     setBudget, approve and fund as one wallet_sendCalls with atomicRequired; else sequential.
     Never batch createJob.
   - expiredAt per SPEC-COMMERCE 5.2 using the measured disputeWindow.
   - Quote countdown; auto re-quote before createJob if expired.
   - Every failure mapped through packages/commerce/src/errors.ts (cover every custom error in the
     AgenticCommerce, EvaluatorRouter and OptimisticPolicy ABIs, ERC-20, wallet codes 4001, 4902, -32002).

4. Recovery paths: cancelOpen, claimRefund, dispute call per the SDK's OptimisticPolicy surface, and
   approve(0) for allowance revoke. Each as a client function with a test.

5. Replace the primary Hire path. The storefront and marketplace Hire buttons now open a minimal hire sheet
   (Lane B restyles it in P2-08) that uses useHire. /app/charter keeps working, relabelled
   "Charter sandbox (testnet)" with a line explaining it is a demonstration of action authority, not a hire.

6. Durable notify: if the web process restarts after fund, the worker (apps/worker/src/jobs.ts) finds
   hire_intent rows with a funded job and no successful notify, and notifies. Use BullMQ on the existing
   Redis, or the Postgres fallback in AGENTS 13.8.

7. TESTNET PROOF (this is real evidence, not a test fixture):
   With a fresh testnet wallet (generate with viem, fund from the faucet, record in config/team-wallets.json as a
   test wallet), run one full hire per category against Keel, Sluicegate, Lattice and Bound through the
   actual browser flow (Playwright driving a real injected signer is fine), plus: one cancel before fund,
   one approve then revoke. Paste every tx hash with testnet.bscscan.com links. Note the number of wallet
   signatures per hire and whether batching was used.

8. Tests per SPEC-COMMERCE section 13 (unit + integration). Lint rule: no maxUint256 anywhere in
   packages/commerce or apps/web.

CHECKPOINT: tx table (category, agent, jobId, createJob, registerJob, setBudget, approve, fund, submit),
signatures per hire, error-map coverage list, test counts, the relabelled charter page screenshot. STOP.
```

---

# P2-03. Quest Index and tracking API (Lane A, 4 h)

```
P2-03. Read SPEC-TRACKING.md in full.

1. Migrations (additive): commerce_job, commerce_event, rating, chain_cursor, hire_intent, commerce_quote,
   notify_attempt per SPEC-COMMERCE section 11.
2. Indexer worker marque-indexer per SPEC-TRACKING section 3, chains 56 and 97, all events in section 2.
   Add it to ecosystem.config.cjs with max_memory_restart 400M.
3. Job projection: pure function in packages/commerce/src/state.ts from events to state; unit tests for every
   path in SPEC-COMMERCE section 6.
4. Binding and auto-binding per SPEC-TRACKING section 5.
5. APIs: /api/v1/phase2/config, /wallet/:address, /owner/:address, /job/:chainId/:jobId, /coverage (if Lane B
   has not), /stats. Shapes per SPEC-TRACKING section 6. Validate address params. Cache 15 s.
6. Anti-wash projection per section 9; config/team-wallets.json loaded at startup (list every Marque
   wallet found in the repo and ecosystem config; Francis adds his).
7. Topic verification: a script scripts/verify-topics.mts that fetches one real log per event from chain and
   asserts topic0 equals the table. Paste its output.
8. Feed settleable evidence back to Lane B's capability code (replace the stub).
9. /status: indexer cursor, head, lag per chain; quest stats.

ACCEPT: /api/v1/phase2/wallet/<P2-02 test wallet> on chain 97 returns all four categories done with every tx
hash; /job returns the full timeline; /config lists verified topics; killing the indexer for 5 minutes and
restarting loses nothing (paste the before and after counts).

CHECKPOINT: API responses pasted, verify-topics output, rebuild drill result, lag numbers. STOP.
```

---

# P2-04. Ratings (Lane A, 2 h)

```
P2-04. Read SPEC-TRACKING.md section 8.

1. RatingService in packages/commerce with the ERC-8004 adapter: giveFeedback(agentId, stars*20, 0, "starred",
   "marque:<category>", endpoint, feedbackURI, feedbackHash). Store the optional comment in a first-party
   table and serve it at the feedbackURI JSON.
2. Guards: connected wallet == job client, job state >= SUBMITTED, wallet is not owner or operator
   (read the Identity Registry; the contract also enforces it; map its revert).
3. useRate hook; minimal rating control in the Job Room (Lane B styles it).
4. Indexer: NewFeedback and FeedbackRevoked into `rating`; read plain tag1 from data, not the indexed topic.
5. Storefront data: verified-buyer average (raters with a Marque-bound delivered job) and registry-wide
   average, never mixed.
6. If PROTOCOL-FACTS shows no code at the ReputationRegistry address on a chain, take rung 3 of the rating
   ladder for that chain and log it.

ACCEPT: the P2-02 test wallet rates all four reference agents on testnet; /wallet shows ratedAll true with
rating tx hashes; an owner self-rating attempt shows the mapped error.

CHECKPOINT: rating txs, API output, screenshot of the rating control. STOP.
```

---

# P2-05. Mainnet cutover (Lane A, 2 h, GATED)

```
P2-05. Read AGENTS 13.3 gates G-M1 and G-M2, SPEC-COMMERCE sections 3, 8 and 9.

PART 1 (no approval needed):
1. Fork test: anvil --fork-url <BSC mainnet RPC>. Impersonate a USDT-rich address. Run createJobWithToken(USDT)
   -> registerJob -> setBudget -> approve exact -> fund against the real mainnet contracts. Then the same with
   U via createJob. Report which tokens work end to end.
2. Prepare the seller changes on a branch (do not start them): studio.toml [network] default = "bsc-mainnet",
   currency = the token chosen per SPEC-COMMERCE 3, max_price = 2 x price, prices unchanged.
3. Prepare the keeper wallet (generate locally on the VPS, keystore outside the repo) and print its address.
4. Print a funding table: each reference agent wallet and the keeper, current mainnet BNB balance, the amount
   needed for 100 submits or settles at the measured gas price, and whether the MegaFuel paymaster sponsors
   the call (test with a dry-run or the SDK's sponsorship check; do not send).
STOP HERE and ask Francis for "approved, mainnet" and funding per the table.

PART 2 (only after Francis writes "approved, mainnet" and confirms funding):
5. Start the mainnet sellers (new PM2 apps or switch, per memory budget), verify /status shows them answering,
   verify a probe quote on chain 56 for each.
6. Start the keeper on 56 with caps (50 settles per hour, balance alarm).
7. Smoke: Francis's funded test wallet (listed in team-wallets.json, so never counted) hires one agent per
   category on mainnet through the real browser flow. Paste every tx with bscscan.com links.
8. Set the campaign network to 56 in config. Testnet stays as staging.

CHECKPOINT: fork results, funding table, the approval quote, mainnet tx table per category, keeper status. STOP.
```

---

# P2-06. Handoff to BNB (Lane B, 1.5 h, send by Sun 27 Sep 10:00 UTC)

```
P2-06. Read docs/phase2/HANDOFF-BNB.md.

1. Fill every bracket in HANDOFF-BNB.md from measured facts only: PROTOCOL-FACTS.md, verify-topics output,
   live API responses, SUPPLY.md, team-wallets.json, the latest tx hashes. If a thing is not done yet,
   say so plainly with the date it will be done. Never write a value you did not read.
2. Brand kit: zip apps/web/public/brand + brand-assets into docs/phase2/brand-kit/marque-brand-kit.zip with:
   mark SVG light and dark, lockup SVG and PNG light and dark, square 1024 and 512 PNG, OG 1200x630,
   BRAND.md (name, one-liner, URL, X handle, colours, clear space, do and do not). Host it at
   https://marque.trade/brand/marque-brand-kit.zip.
3. README: add a "Set and Earn (Phase 2)" section at the top: what changed, the network, the tracking API
   links, how to verify a wallet, the builder path. Update setup instructions for commerce, indexer, keeper
   and the env table. Keep the Phase 1 judge table below it.
4. Export HANDOFF-BNB.md to a Google-Doc-friendly version (plain headings, tables) in
   docs/phase2/HANDOFF-BNB-send.md for Francis to paste.

CHECKPOINT: the filled handoff (paste it), the brand kit URL, README diff summary. STOP.
Francis sends it.
```

---

# P2-07. Kerbstone foundation (Lane B, 4 h)

```
P2-07. Read DESIGN-SYSTEM.md sections 1 to 7. You own all CSS. Port patterns from the Kerb repo you built
(github.com/Franlinozz/Kerb): tokens layering, theme bootstrap, Toaster, TxStepper, error display, Field,
Skeleton/Empty/Error states, SectionHead, status pill, footer. Never Kerb's brand, mark, art or copy.

1. Tokens per DESIGN-SYSTEM section 3, keeping existing variable names as aliases so no page breaks.
2. Fonts per section 4, self-hosted with next/font/local. Verify computed font-family in the browser. Licences
   in docs/THIRD_PARTY.md. Remove Geist and Fraunces only after every route is checked.
3. Themes: Night, Day, System, bootstrap before paint, no flash. Chamber surface token block.
4. SiteHeader with the network pill, status pill and quest progress bar slot; MobileNav drawer.
5. RainbowKit themed from tokens (custom theme object), ConnectButton.Custom showing address, network,
   quest n/5.
6. Component set from section 6 in apps/web/app/_components/ui. Each with a story on /_ui.
7. /protocol page (section 8.9).
8. Every existing page renders correctly inside the new shell.

Screenshot loop (mandatory): every route at 390, 768, 1440, Night and Day. Look. Fix. Re-shoot. Save finals in
docs/phase2/screens/p2-07/.

CHECKPOINT: screenshots, font verification, component list, axe summary on 5 key routes. STOP.
```

---

# P2-08. Hire sheet, Job Room, Quest, My Marque (Lane B with Lane A hooks, 6 h)

```
P2-08. Read DESIGN-SYSTEM.md sections 8.2, 8.5, 8.6, 8.7 and 9. Use only packages/commerce/src/client hooks.

1. Hire sheet: overlay available from any page, deep link ?hire=<agentKey>. Chamber surface. Sections: task
   form (category preset), price (PriceTag with countdown, fees, refund date), TxStepper with the plain names
   from 8.5, "Your controls" disclosure. Balance and gas checks before the first signature with Get USDT /
   Swap to U links. Batch-mode rendering when EIP-5792 is active. Mobile bottom sheet.
2. Job Room /jobs/[chainId]/[jobId]: timeline from /api/v1/phase2/job, deliverable renderers for the four
   categories (use MeasureRule), raw manifest with hash check, actions per state (table in 8.6), rating
   control from P2-04, support link.
3. /quest per 8.2: wallet checks, five rows from /api/v1/phase2/wallet, recommendations from /coverage,
   optional basket mode (bounded approval of the shown total), "Waiting for the chain" states, completion
   card with tx links. Readable without a wallet (shows the steps and costs).
4. /me per 8.7 including Spending controls (allowance per token with Revoke to zero).
5. Header quest progress bar wired to the wallet API.
6. Every error through the error map. No raw text anywhere. Dead-button sweep on these routes.

ACCEPT: on testnet (or mainnet after P2-05), a fresh wallet completes all four hires and ratings from /quest
without leaving it, and every step ticks from the chain. Screen-record it (a GIF or MP4 in
docs/phase2/evidence/). Mobile 390 run of the same flow.

CHECKPOINT: recording path, screenshots of each state in 8.6, mobile screenshots, dead-button sweep. STOP.
```

---

# P2-09. Home, marketplace, storefront (Lane B, 5 h)

```
P2-09. Read DESIGN-SYSTEM.md sections 8.1, 8.3, 8.4.

1. Home per 8.1: hero with the serif statement and the two CTAs, the Tape from real Marque hires (hidden if
   none), four category tiles from /coverage, "Ready to hire now" cards, how-a-hire-works strip with the three
   protections, the short "Why Marque" band (pass/fail pair, one-line funnel with live numbers, Ledger
   headline), builder CTA. Remove the Phase-1 long funnel from the home page (it stays on /standard or a
   /why page, linked).
2. Marketplace per 8.3: tabs Ready to hire (default), Try free, All tested, Registry; filters; the card with
   both axes; FLIP reorder on filter change; compare tray stays.
3. Storefront per 8.4: sticky purchase panel, sections in order, verified-buyer rating separate from registry
   rating, identity evidence with network-correct links, sample deliverable.
4. The 5-second test: give a fresh model only the 1440 Night home screenshot and ask "What is this and what
   can I do here?" Paste the answer. Iterate until it says it is a marketplace to hire BNB Chain agents.

CHECKPOINT: screenshots (both themes, three widths) for home, marketplace, one first-party and one
third-party storefront; the 5-second answer; Lighthouse mobile scores. STOP.
```

---

# P2-10. Builder path (Lane B, 3 h)

```
P2-10. Read DESIGN-SYSTEM.md section 8.8 and SPEC-TRACKING section 10.

1. /builders as the five-check list reading the connected wallet: identity owned (ownerOf across 56 and 97),
   ownership proved (existing claim signature), endpoint live and callable (existing probe, with a "Probe now"
   button that runs a single safeFetch probe), classified (with owner-declared category option that the
   classifier must agree with or flag), answered a live test (existing /builders/test harness).
2. packages/registry/src/quality.ts implements the quality verdict with per-check reasons; /api/v1/phase2/owner
   returns it.
3. "Build one" panel: BNB Agent Studio path (pip install bnbagent-studio, bag, link to official docs), link to
   Marque's open-source reference agents as templates, and a short note that the quest needs your own agent.
4. After all five checks pass: "Listed on Marque" state and the quest row ticks.

ACCEPT: with a throwaway testnet agent (registered on 97 by the bot with a throwaway wallet, listed in
team-wallets.json), all five checks go green in the UI and /owner returns qualityListing true.

CHECKPOINT: screenshots per check state, owner API output. STOP.
```

---

# P2-11. Reliability (Lane A, 5 h)

```
P2-11. Read LAUNCH-RUNBOOK.md sections 2 and 3.

1. Blue/green deploy: scripts/deploy-web.sh builds into releases/<sha>, starts the candidate on the idle port
   (3200 or 3201), health-checks /api/health and one page, switches the Caddy upstream atomically, reloads
   Caddy, keeps the old process 5 minutes, then stops it. Rollback command documented. Prove a swap under
   a curl loop with zero non-200s.
2. CI: .github/workflows/ci.yml with typecheck, lint, lint:copy, unit tests, web build, and one Playwright
   smoke (home, marketplace, storefront, /quest readable logged out). Badge in README.
3. Load test with k6 (scripts/load/): read mix 25, 50, 100, 250 virtual users on /, /register,
   /register/yield, one storefront, /quest, /api/v1/phase2/coverage, /api/v1/phase2/wallet/<addr>. Targets:
   p95 < 800 ms for cached pages, < 1.5 s for APIs, 5xx < 0.5%, no PM2 restarts. Write
   docs/phase2/LOAD-TEST.md with the numbers and the box's CPU and memory during each stage.
4. Memory budget: sum PM2 max_memory_restart against 12 GB minus Postgres and Redis; adjust.
5. Health monitor: alert Telegram on indexer lag > 200 blocks, quote failures for any reference seller for
   10 minutes, keeper balance under threshold, 5xx rate > 1% for 5 minutes.
6. Cloudflare only if Francis approved (G-C1 not needed for the free plan, but DNS change needs him).
7. Backups: nightly pg_dump to a second location; restore drill into a scratch DB.

CHECKPOINT: deploy swap proof, CI run URL, LOAD-TEST.md, alert test, restore drill. STOP.
```

---

# P2-12. Crucible (both, Tue 29 Sep, before 18:00 UTC)

```
P2-12. Read LAUNCH-RUNBOOK.md section 5 (Crucible checklist) and REQUIREMENTS-MATRIX.md.

1. Walk every row of REQUIREMENTS-MATRIX.md and mark PASS / PARTIAL / FAIL with evidence in
   docs/phase2/PROJECT_STATE.md.
2. Golden path, logged out then with a fresh mainnet wallet on a phone-sized viewport: land, /quest, four
   hires, four ratings, builder checks, /me controls, allowance revoke. Record it.
3. Hostile checks: wrong network, rejected signature at each step, quote expiry mid-flow, insufficient
   token, insufficient gas, closing the tab after fund (job still notifies and appears), web restart during
   a job, indexer restart, a seller down (marketplace shows it within one probe cycle).
4. Claims audit: every sentence on the money path against AGENTS 13.7.
5. Dead-button sweep on every route, both themes.
6. Freeze at 18:00 UTC. Tag v2.0.0.

CHECKPOINT: the matrix with statuses, recording, hostile check table, claims audit, tag. STOP.
```

---

# P2-13. After launch (only after P2-12 passes and launch is stable)

Work from `ROADMAP.md` in its order. First three, each its own phase prompt written then:

1. **Machine-native market API**: `GET /api/v1/market/agents`, `POST /api/v1/market/quote`, `POST /api/v1/market/hire-intent` returning unsigned calls, so agents can hire agents with their own wallets. Read-only MCP server exposing the same.
2. **Seller dashboard** on `/me` for agent owners: jobs, earnings, completion rate, ratings, quote conversions.
3. **x402 buyer** using the SDK's `X402Signer` and `SessionBudgetTracker` with the payee taken from the registry, never from the 402 challenge alone.

---

## If a session drifts, paste this

```
Stop. Re-read docs/phase2/MASTER_PROMPT.md and AGENTS.md section 13. Only the phase you were given is in scope.
User wallets sign every buyer write. Exact approvals only. Never substitute an agent. Network per action.
Quest data only from indexed chain events bound to Marque intents. No invented numbers. No em dashes.
Mainnet writes from Marque wallets need "approved, mainnet". Report the CHECKPOINT for what exists now.
```
