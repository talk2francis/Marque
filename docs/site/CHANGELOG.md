# What changed, and why.

> Mirrors [https://marque.trade/docs/changelog](https://marque.trade/docs/changelog). Generated from the same source as the page (`pnpm site-docs`); a test keeps the two identical.

A public record of meaningful product changes. Evidence and limitations travel with each release.

## 5 November 2026 · Set and Earn closed; the record at the close, the film for after, questions answered

Set and Earn closed on Thursday 5 November at 12:00 UTC. The release live at that moment is tagged set-and-earn-close-2026-11-05 in the repository, so anyone can compare later changes against it. The record at the close is saved with the code: every job hired through Marque before the close, the funnel, both coverage lanes and the campaign stats, each with the time it was read, and a checksum file over all of them. After every deploy until 20 November, a guard re-reads the Set and Earn record of six outside and three team wallets and fails if anything that decides eligibility has moved.

The site now speaks of the campaign in the past tense. The home page leads to Find an agent and List your agent, the campaign companion says when the winners are announced and links to Check any wallet, and no countdown shows after the close. The quest page stays up as a record you can check for any wallet.

A new 60-second film plays from the close, its figures read from Marque's public record at 12:00:24 UTC. Two more outside jobs, created in the last three minutes before the close, were indexed after that read; the notes under the film say so. The home page ends with eight plain questions and answers, plus one about the close for 60 days; the escrow fee in them is read from the contract, and the agent counts are the page's own. The FAQ and docs now name the Job Room's Open a dispute button by its own words.

Linked reviews also count in two more cases, from 4 November: a buyer who opened the job on chain and rated through Marque, and an older practice hire made under a Marque agent's mainnet identity. Team wallets still never count, and Set and Earn eligibility is read separately and is unchanged.

## 4 November 2026 · Every delivered answer read, whatever its form; faster search

Delivered answers: when an agent built on the BNB Agent Studio SDK stores its answer off chain, its submission names the file's address and commits to the manifest's canonical JSON. Marque now follows that address and recomputes that hash, as the SDK defines it; before, such answers showed as not yet published. It also reads an answer linked by IPFS or Arweave, a hash of the answer content alone, and plain-text or markdown answers, each accepted only when it matches the hash on chain.

Search waits for a pause in typing before asking, and the evidence ladder is counted only in the view that shows it, so one search runs at a time instead of one per keystroke.

More answers read: a survey of every agent's latest delivery found answers Marque had stopped reading. A network node drops the receipts of older transactions, so older jobs are now verified by the job as the escrow holds it (same provider, same hash). Answers stored on IPFS are read through several gateways, since the main public one now refuses server reads. A provider that is a contract submits through its own call, and its answer is now found inside that call. Every answer is still accepted only on a hash match. Of 41 agents whose latest answer was unread, 21 are now read; the rest point at a local address, a host that no longer answers, or a file that changes on every read.

Act on the answer for any wallet: when the answer is about a wallet you do not hold, such as a smart account or a wallet another product runs, Act builds the same plan for it. It gives the exact calls, the predicted health factor and a Safe batch file, for whoever controls that wallet to send. Nothing is signed or recorded through Marque for it. When the answer leaves out the target, the target the buyer set in the task is used, and only if the agent read a health factor.

Linked reviews count in two more cases. A buyer who opened the job on chain rather than through the hire form, paid, received the answer and rated through Marque now counts, when the agent's wallet belongs to that agent alone on the network. An older practice hire made under a Marque agent's mainnet identity now counts for its practice identity, and the practice ratings read the practice identity itself. Reviews from Marque's own test wallets still do not count.

## 3 November 2026 · Answers read from more sellers, live examples in every hire form, a sharper tender

Delivered answers: Marque now reads answers where more sellers publish them, always verified against the hash on chain. Besides the content-addressed path, it now tries the per-job paths sellers use (by job and network, or by job, network and hash). A grid stated as separate buy and sell order lists is now read and checked. On the first pass this turned unreadable deliveries into checked ones, such as a health factor answer agreeing with Venus 2 of 2.

Checked includes warranted: a Warrant is the strictest chain check there is, so warranted agents are now part of the checked count, and the page shows one proven group with the Warrant as its top part.

Hire forms show up to five live examples, each read from BNB Chain when the form opens: Venus loans that are borrowing now, with their health factor and size; PancakeSwap V3 positions, in range or out; well-known token contracts for a token check; typical sizes for yield. The buyer still picks or types their own.

Tender asks and ranks agents by what is proven now (a Warrant, then a chain-checked answer, then delivered work), never asks an agent pulled for safety, and marks the best proven price among the quotes. The marketplace lists every hireable agent in one list, and the quest countdown reads the true close before scripts run.

## 2 November 2026 · Hireable means hireable; the test is a badge, not a gate

Hireable now means an agent answered in the last day and a buyer's wallet can pay it through BNB Chain's ERC-8183 escrow, to the agent's own wallet, at a live signed price. Only safety takes one out of the count: its latest paid job closed without a delivery, or it stated a chain fact outside tolerance, in the last 14 days, with nothing agreeing since. Pulled agents are listed apart with the reason. Earlier the count also required a pass of Marque's test, which hid agents with many delivered jobs.

Every card now answers three questions separately. Checked: an answer it gave, in a paid job or in Marque's daily read-only check call, agreed with BNB Chain in the last 30 days. Track record: its delivered, settled and refunded jobs. Warranted: it passed its category's published test, in the test's exact format, in the last 14 days. The Standard and its tolerances are unchanged.

A test run where every failing field was left out, or the call errored, is shown as "Answer not in the test's format" and counts as untested, never as a failure. Every earlier failure on record was of that kind; none stated a wrong value. A test that asks about a different job than the agent describes (a vault keeper under the range-rebalancing test) reads "No Marque test fits this agent yet".

Once a day Marque asks every hireable agent its category's question through its public free path (A2A, or a read-only MCP tool), reads the answer in whatever layout it uses and compares the chain facts it states. One call, no payment, never counted as a hire. An operator opts out with "marqueChecks": false in its agent card. Every delivered job's answer is checked against the chain the same way.

A testnet copy with the same owner and endpoint carries what its mainnet identity earned, marked as earned on mainnet. A category an agent states about itself ("category: yield") is used as its category. The funnel reads Listed, Answering, Priced, Hireable, Checked, Warranted, with delivered paid work as its own line. Hire on a list row is never disabled by a lapsed stored quote, and the grid form starts at a band of 10 percent around the live price.

The marketplace opens with one command bar (search, network with its counts, filters, sort, layout), the categories and one results line with a Show picker; the evidence ladder appears in the All listed view, where its rungs filter. Every job (/proof) has one scorecard row per network and filters by agent, job number or wallet, network, where the job stands, chain checks and who paid. Agents built during Set and Earn that Marque can reach but cannot price right now are listed with the reason. Testnet services that had never been probed are now probed ahead of routine re-probes, so practice-lane builds get checked, priced and listed.

The marketplace opens with the depth of the market on BSC mainnet in one line, listed, answering, live price, hireable and warranted, each step opening its list. Listed now also counts any agent with a live price, and a template deployed many times counts once, so its hireable and warranted equal the count on every other page. Judge mode opens with every job and who paid.

## 2 November 2026 · One count everywhere, and labels that say who paid

Hireable now means one thing on every page and API: the agent passed the latest test in its category and has a live price. The home page, the record, the category tiles, the coverage and funnel APIs, /why and llms.txt all read the same count, and a test fails the build if two of them disagree. Priced, failed and not yet tested are shown beside it, never inside it, and mainnet and testnet are never added together.

Ready to hire lists agents that passed first, then a Not yet tested section; their buyer-linked ratings stay visible, marked as not a test result. Agents that failed their latest test leave the list and every hireable count and are listed apart, with the failing field and date. The price badge reads Live price, so it is not confused with hireable.

An outside wallet that also owns or runs an agent listed on Marque is labelled so on /proof, Job Rooms, the hires carousel and /judge: a builder hiring another builder's agent. /proof and the Set and Earn stats each state their scope. The quest says it reads hires recorded on BNB Chain's ERC-8183 escrow, and marks which shortlisted marketplaces it can read there.

U is defined where prices first appear, the escrow sentence is the same everywhere, the hires tape shows one entry per transaction and only ratings from wallets that hired that agent through Marque, and the category counts no longer read as stray digits without scripts.

Built during Set and Earn: the quest page and the Agent Forge list outside agents registered since the campaign was announced, priced on Marque in the last 24 hours, newest first and labelled by network. Each shows how many more completed hires from other wallets its builder needs. Participants hire with their own wallet at their own cost; Marque funds and pairs no one.

Price truth: the price on a card and an agent page is the live quote a hire through Marque charges, on BNB Chain's ERC-8183 escrow. When the agent's own registry description states another price or rail, such as 0.05 USD1 over x402, that is shown beside it, labelled as the operator's own.

Readable without scripts: the home page carries its supply numbers as structured data as well as text, and each release is checked before it goes live for the counts and agent cards in the plain HTML. Job Rooms say the date a delivery releases to the agent. The settle keeper now also settles practice jobs on testnet once their 15-minute review window closes, so builders' testnet hires complete. /judge lists every recorded action taken from an agent's answer, with its transaction, and /adopt has a monthly cost table, with amounts not yet provided marked so, and the public address of every key.

[The marketplace](https://marque.trade/register) · [Every job, who paid](https://marque.trade/proof) · [Supply funnel](https://marque.trade/api/v1/funnel)

## 1 November 2026 · Separate agent workspace and more precise hire tasks

Your agents now has its own page at /builders/my-agents. The Agent Forge keeps its starter, registration and listing paths near the top. Existing owner and agent workspace links redirect to the new page.

An exact service with one explicitly escrow-enabled work skill can show its own published task example and input guidance. A broad marketplace category no longer forces that service to answer a different task. The buyer edits the task and still obtains a fresh identity-checked quote before any payment. Provider-specific tasks do not silently inherit unrelated category acceptance criteria.

My Marque keeps jobs with unlinked agent identities readable instead of passing a missing identity to the avatar renderer. This repairs the application error for affected wallet histories, including Marque Pass accounts. Unknown payment-asset units remain explicit. The Every job table explains why a shared payment wallet cannot identify an individual agent.

Health-factor answer layouts adapt to their available column width and keep long market addresses clear of the value bars, with legend markers beside their labels. Agent section links prepare nearby sections when visible or approached, keep document navigation local and announce a pending section. Outcome history is read only for the track-record section.

The rebalancing test subject roster was refreshed after all three former positions were withdrawn. The replacement TWT/WBNB position was observed on chain before the agent was tested. Its arithmetic policy and tolerances are unchanged; previous cases, results and answers remain stored.

Marketplace search answers faster. A new search term used to read the newest quote of every service again, about two seconds before any filtering. Those reads are now shared for a few seconds across searches, so a new term costs an in-memory filter. Quote expiry is still checked on every response. The owner-signed quote report sits in the workspace's Quote outcomes tab: price attempts, acceptances, funding and a next step for each failure.

Needs you in My Marque is one board in lanes: what has a clock first, then unfinished hires, ratings and allowances. A rating is one row per agent however many of its jobs were delivered, each lane opens its remaining rows in place, and every clock says what it counts down to.

Signed prices are accepted in both common EIP-191 forms: over the negotiation hash written as text, as the BNB agent SDK signs, and over its 32 bytes. Either way the signature must recover to the agent's own registered wallet or owner, so payment still only goes to the identity you chose. Agents that signed the byte form were indexed but could not be hired; they become hireable at their next price check.

[Your agents](https://marque.trade/builders/my-agents) · [Agent Forge](https://marque.trade/builders) · [Rebalancing standard](https://marque.trade/standard/MCS-REB-1)

## 31 October 2026 · An agent workspace and readable on-chain answers

The Agent Forge puts your agent workspace before the starter paths. Look up an owner without connecting, switch between agents and networks, see the next useful fix, inspect recent jobs and endpoint checks, and manage the public profile from the owning wallet. Private quote reports still require a fresh ownership signature. Identity lists have an actual total and a next page instead of silently stopping at eight.

Funded jobs, recorded deliveries and released payments are shown separately. Job counts are scoped to this agent's Marque hire intents in a dated 30-day window, not described as independent demand. Known payment assets use their pinned network units; unknown tokens remain explicitly raw. Mainnet money and test tokens are never added together.

A complete JSON answer embedded in a successful direct escrow submission can now be read without a separate file URL. The reader checks the canonical escrow event, job, provider, transaction and exact answer bytes, recognising either keccak256 or SHA-256 and naming the algorithm. Published files keep their existing guarded path. Missing or mismatched answers are not invented. Agent section links now navigate without reloading the document.

## 30 October 2026 · A balanced home-page film layout

The opened film on the home page starts with its chapter timestamps, keeping the evidence notes and full transcript link underneath. The introductory paragraph beside the video is removed. Desktop chapter spacing aligns the column with the player and its rail; phones and tablets keep the chapters below the video.

## 30 October 2026 · Mobile wallet menu and agent navigation

The mobile navigation drawer keeps the connected-wallet account card within its width and brings it into view when opened. Its actions scroll with the drawer, including on short phone screens. The header account menu also stays within the phone viewport. Long wallet names yield space to the logo and menu button on narrow phones.

Agent section links stay below the site header while scrolling on phones and tablets. The mobile Hire bar has priority over the floating quest companion, keeping the price and Hire action unobstructed. Set and Earn remains available in navigation; desktop presentation is unchanged.

## 29 October 2026 · Wallet recovery and editing an agent’s registration

The six reference-agent banners now sit above a clear background. The animated faceted ground starts below their mastheads and follows the page as you scroll. Other agent pages and the rest of the site retain their existing backgrounds.

Wallet connections restored after a reload retain their live signing connector and current selection. Recovery waits for an unavailable wallet to be discovered, preserves a wallet’s current accounts and lets disconnect remove its connection. It does not request a signature.

An identity owner can edit an agent’s name, description and registry image from My Marque. The owner signs one transaction on the identity’s own network; services and extension fields stay in the registration. Cancelling during a network switch prevents a later signature request from that attempt. A confirmed chain update and a delayed Marque index refresh are reported separately, so an index error does not ask the owner to pay again.

Builder diagnostics now read their bounded probe history and latest quote using the existing ordered indexes. This fixes timeouts that could leave an owner’s cached seller snapshot old. The original observations and exact-service bindings are preserved; a query-plan regression checks the work against a large synthetic history.

The registration editor has Cancel and Try again when its initial read fails. Cleared descriptions are removed from the index, and previous probe observations are preserved when services change. Marque Pass describes the registry update before confirmation. A viewport overflow fix removes sideways scrolling seen on phone documentation pages while retaining vertical scrolling and the sticky header. The FAQ now describes the cross-marketplace quest tracker, and the earlier V3 delivery audit is explicitly historical. The README links to the release reported by the live service.

[My agents](https://marque.trade/me?view=agents) · [FAQ](https://marque.trade/docs/faq) · [Live release](https://marque.trade/api/health)

## 28 October 2026 · Profiles, agent portraits, the film, and Tidemark on testnet

Profiles: every wallet now has a portrait, a faceted stone cut from its own address, before it saves anything. An owner can sign once (no transaction, no gas) to choose a stone and accent, upload an image of their own or use one of their agents, add a name and a line, keep it public or private, and set preferences that follow them to any device: theme, motion, and which networks the marketplace opens on. Uploads are redrawn in the browser and accepted only as PNG, JPEG or WebP checked by their contents. The privacy page says what is stored.

Agent portraits: an owner can give an agent a portrait from My Marque or the Forge. Ownership is re-read on chain when it is set; the image gets a permanent URL that can go in the registration file to carry it everywhere ERC-8004 is read.

The evidence ladder: the marketplace now shows every listed agent and how far each has proved itself, on one line that is also a filter: listed (in a category, and answering at its endpoint in the last 24 hours or holding a test result), answering a task, a live signed price, passed its published test, and delivered a paid job to an outside buyer, each count exactly the agents its rung opens, beside the number registered on the network. A new All listed view holds the whole listed set. An outside buyer is a wallet that is not Marque's team, the agent's owner or its own wallet; that does not prove the buyer is unrelated.

Also: the sixty-second film on the home page (folded to one line, opening beside its chapters) and /film; Tidemark sells on BSC testnet as well as mainnet, so a practice hire of it works; agent cards show their networks as one tag; the ground behind the pages is redrawn as faceted light, with no lines, quieter than before and not on the landing page.

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
