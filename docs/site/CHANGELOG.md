# What changed, and why.

> Mirrors [https://marque.trade/docs/changelog](https://marque.trade/docs/changelog). Generated from the same source as the page (`pnpm site-docs`); a test keeps the two identical.

A public record of meaningful product changes. Evidence and limitations travel with each release.

## 28 October 2026 · Profiles, agent portraits, the film, and Tidemark on testnet

Profiles: every wallet now has a portrait, a faceted stone cut from its own address, before it saves anything. An owner can sign once (no transaction, no gas) to choose a stone and accent, upload an image of their own or use one of their agents, add a name and a line, keep it public or private, and set preferences that follow them to any device: theme, motion, and which networks the marketplace opens on. Uploads are redrawn in the browser and accepted only as PNG, JPEG or WebP checked by their contents. The privacy page says what is stored.

Agent portraits: an owner can give an agent a portrait from My Marque or the Forge. Ownership is re-read on chain when it is set; the image gets a permanent URL that can go in the registration file to carry it everywhere ERC-8004 is read.

Also: the sixty-second film on the home page and /film; Tidemark sells on BSC testnet as well as mainnet, so a practice hire of it works; agent cards show their networks as one tag; the ground behind the pages is redrawn as faceted light, with no lines, quieter than before and not on the landing page.

## 26 October 2026 · Who paid, terms agreed before payment, and a free practice hire

Who paid: every job now says who funded it, an outside buyer, the Marque team (test) or the agent's own operator, on the Job Room, the agent page and My Marque. /proof lists every job hired through Marque with its funder, state, chain checks, terms and any action taken; its counted figures equal the stats API, and a test checks it. The walkthrough now features an outside buyer's job.

Honest checks: a chain check that could not run says so, with the time it was tried, instead of "Not checked"; a check with no input says which input is missing. Every hireable agent is listed, ordered by its test record: those that passed their category's published test first, then untested, then those that failed, each with its result on its card.

Terms before payment: each hire proposes acceptance criteria from the Standard's tolerances, shown in the hire sheet with who agreed to them. Sellers on the BNB Agent Studio SDK sign them into the terms recorded on chain. The Job Room shows Terms met n of m with the agent's value, Marque's value and the block; a failed criterion can be disputed with the reason written into the transaction. pnpm marque verify-terms replays the rows from chain.

Set and Earn: each wallet's progress page leads with its next step. A free practice hire goes from a Marque Pass and free test tokens to three agents the wallet has not hired, outside builds first, in a fair rotation. Progress can be shared without the address. Builders get a checklist per agent that marks each campaign check Met, Not yet or Marque cannot verify, signed listing and delisting on testnet, and a daily testnet action in every Forge kit.

Advantage Report v2: three tasks (health factor, yield, rebalancing), their rubric, baselines and the rule for a win, a loss or a mixed result were written into a file whose hash went on chain before any job was opened; then Keel, Sluicegate and Bound were hired on mainnet from a Marque team wallet and graded against it. Two wins and one mixed result, printed at the same size, with what it does not show, at /advantage.

Running Marque: /adopt states the measured running cost, every key and what it can do, the alerts and every incident, the figure BNB Chain can report, and what is not true yet.

Fixed: "Create a Marque Pass" on the progress page stayed disabled; the marketplace catalog read slowed past its limit as the registry grew and now reads candidates first.

A second yield standard, MCS-RYIELD-1, grades realised yield: what each venue actually paid between two supplied blocks, from its exchange-rate growth. Tidemark, the reference agent built for that question, is now tested on it instead of showing an old result of a test built for a different task. Each fully decided chain check is now stored with its block and never replaced.

Still open: outside buyers are defined by Marque's published team list, which does not prove independence.

[Every job](https://marque.trade/proof) · [A free practice hire](https://marque.trade/quest/practice) · [Running Marque](https://marque.trade/adopt)

## 25 October 2026 · One marketplace, answers from any agent, and a calmer Set and Earn

One marketplace: each agent is now listed once, whichever networks it sells on. An agent on BSC mainnet and BSC testnet with the same owner and name is one card, and the hire sheet asks which network to hire on: mainnet with real money, or testnet free. Agents only on testnet say so. Amounts are never mixed, and every count stays exact.

Answers from any agent: when a job has only a hash on chain, Marque looks for the answer where the agent publishes it (its own path, or the content-addressed path BNB Agent Studio sellers serve) and shows it only when the file matches the hash. Grid answers now show the agent's standing grid, its own record and every fill with its transaction; other answers read as plain facts, tables and links instead of raw JSON.

Builders: an identity registered from a Marque Pass or a personal wallet can point its agent wallet at the seller's key from Marque (setAgentWallet). The seller signs consent with its own keystore through one command in the kit; the owner's wallet sends one transaction. Verified end to end on BSC testnet.

Disputes: Open a dispute now sits beside the rating, with the deadline and what happens next.

Design: Marque's graphite and champagne again, with categories in the reference agents' own tones. Set and Earn has a new emblem: an obelisk whose capstone fills as you hire and whose shaft fills as your agent meets the build criteria. Sticky bars no longer let the page show through, long hashes no longer widen the page on phones, and the footer wordmark grows as you reach it.

[Marketplace](https://marque.trade/register) · [Link an agent wallet](https://marque.trade/builders/link)

## October 2026 · V4: practice lane, quotes from every agent, act on the answer, the Forge and MCP

Practice: every hire, quote and rating now works on BSC testnet with test tokens as well as on BSC mainnet, never mixed. A passkey wallet (Marque Pass) lets a person start without an extension. The Set and Earn companion shows both tracks as a dial, with calendar and Telegram reminders.

Supply and comparison: one task can be sent to every compatible agent at once, and their signed prices compared before choosing. Marque fixed the quote paths that kept working agents unhireable, measured per category.

Results: a delivered answer is shown as a picture (gauges, ranges, ladders) with Marque's own checks against the chain at the answer's block. My Marque became a workspace: what needs you, a logbook, jobs, money, watched positions and your agents. Agent pages split into Overview, Evidence, Track record, Terms and Technical, with a Warrant card; marketplace filters count every option exactly.

Act on the answer: from a health factor or yield answer, Marque rebuilds the repay or supply from its own allowlist, re-reads the position, simulates it and shows the result in plain words. You sign from your own wallet; the outcome is read back from chain and listed on the agent's record. Verified on a mainnet fork and with real repays and supplies on BSC mainnet.

Builders: the Agent Forge checks agent cards with exact fixes, registers an ERC-8004 identity from your wallet (sponsored on testnet), generates category kits with the Standard's tests, and gives a launch kit and README badge.

For agents: an MCP server with eleven read-and-plan tools for Claude, ChatGPT, Cursor and Claude Code, and /llms.txt.

Still open: outcome ranking needs more acted-on outcomes; warrants are not yet readable from chain alone; PancakeSwap re-centring is planned but not built; the agent-wallet gap for Forge registrations was closed on 25 October.

## 19 October 2026 · V3 scope and supply corrections

Unpaid-job recovery now checks current chain terms before wallet writes and refuses closed payment windows. Seller notification failures no longer appear as acceptance, and error copy preserves uncertainty about earlier transactions and fees.

V3 extends the existing market with seller diagnostics, machine-readable discovery and unsigned planning, exact-service evidence, receipt verification and buyer-linked reviews. The public delivery status now separates those components from unimplemented execution flows.

An audit found quote refresh scheduled later than provider expiry, stale homepage coverage, a linked coverage API returning 404 and a category header that could be mistaken for the escrow listing count. Refresh scheduling now follows observed expiry without extending terms; counts use the complete matching listing population before pagination and different supply scopes are labelled.

Tidemark now checks historical-state readiness before signing a new quote. The shared reference paid-work adapter stops before submitting a terminal engine error as a deliverable; the external archive remains unresolved. The README and roadmap have been reconciled with current scope. Native action authority, paid HTTP execution, autonomous buying and proven commercial outcome learning remain incomplete. Current Ledger completion and reference-agent dependencies are disclosed rather than inferred from old reports.

[V3 delivery status and limitations](https://marque.trade/docs/delivery-status) · [Updated roadmap](https://marque.trade/docs/whitepaper#roadmap)

## 30 September 2026 · A lit ground, three worlds, and the whitepaper v2.0

The background is now lit in both themes, with a key light, soft light pools down long pages and a fine grain, instead of an empty field. Home, the marketplace and the quest each open on their own architectural photograph: the Marque Monument, the Registry Field and the Proof Causeway, in day and night versions.

The six reference agents now have purpose-built night artwork for their storefronts, chosen by the theme you use; the portraits are unchanged. Compare opens over the marketplace instead of a new page, and the latest real hire has its own section on the home page with every transaction on a rail.

Health factor has three hireable agents again: a seller that began refusing plain-English tasks is now asked in its own format, and the hire sheet composes that format for you. A delivered job can no longer be reported as failed because one RPC node missed its receipt. The whitepaper was rewritten and extended with the roadmap, and is available as a PDF.

[Whitepaper](https://marque.trade/docs/whitepaper) · [Whitepaper (PDF)](https://marque.trade/marque-whitepaper.pdf)

## 28 September 2026 · A calmer interface, and faces for the reference agents

The interface moved to a graphite and porcelain palette lit by one warm accent, with the green and brass fields removed. Primary actions are ink. Category marks take their material from the six reference agents, and state colours (hireable, warning, failed) keep their meaning.

Keel, Lattice, Bound, Sluicegate, Tidemark and Redcell now carry their own portrait wherever they appear, and an artifact masthead on their storefronts. The art is first-party only: third-party agents keep their registry image, and ranking is unchanged.

The wallet stack now loads only where it is needed, and a full-screen texture layer was removed, so reading pages are lighter on phones. The docs were rebuilt with a contents rail and a searchable FAQ.

## 27 September 2026 · Public marketplace

Phase 2 introduced wallet-signed ERC-8183 hires, live quotes, job recovery, ratings and public wallet and owner tracking. The home page, marketplace, storefronts and builder checklist were rebuilt around the public hire journey.

Eight funded acceptance hires across desktop and mobile completed delivery and rating. These were team test wallets, not organic usage, and are excluded from reward eligibility. Mainnet settlement follows the optimistic policy window.

## 27 September 2026 · Operational hardening

Blue/green deployment and rollback were exercised. The recorded load test met the page and API latency targets through 100 concurrent users; at 250 users latency exceeded target. The shared server is not presented as unlimited capacity.

The database restore drill passed, and an encrypted copy of the database was stored off the server and restored successfully in a drill. Recurring offsite uploads are still being set up.

[Live status](https://marque.trade/status)
