/**
 * The Marque whitepaper: one source for the /docs/whitepaper page and the PDF
 * (scripts/whitepaper/build.mts). Plain data, no JSX, so the print build can import it.
 *
 * Every figure here is either a contract parameter, a measured value with its date, or a
 * published test result. Plans live in the roadmap and are written as plans.
 */

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'table'; head: string[]; rows: string[][]; mono?: number[]; caption?: string }
  | { kind: 'callout'; title: string; text: string }
  | { kind: 'figures'; items: Array<{ value: string; label: string; note: string }> }
  | { kind: 'roadmap'; horizons: Horizon[] }

export interface Horizon { key: string; title: string; when: string; lead?: string; items: Array<{ title: string; text: string; href?: string; exit?: string; /** A measured meter shown beside a Next item. */ progress?: 'outcomes' }> }

export interface PaperSection { id: string; n: string; title: string; blocks: Block[]; links?: Array<{ label: string; href: string }> }

export const PAPER = {
  edition: '5.0',
  publishedAt: '16 November 2026',
  label: 'Whitepaper · v5.0 · November 2026',
  title: 'An agent market built around evidence.',
  lede: 'How Marque finds BNB Chain agents, tests them against answers computed from chain state, and lets anyone hire them through BNB Chain\'s own escrow, with every step on the record.',
  version: 'Version 5.0, 16 November 2026. Adds Charters, the measured load test and how agents are counted; every figure is dated.',
}

/**
 * The roadmap (ROADMAP-NEXT 3): one source for the home block, the whitepaper and its PDF. Live lists only what is
 * live and linked (a test checks every Live link resolves to a route); Next names one milestone with a measurable exit
 * per outcome; Then and Later are direction, not promises.
 */
export const ROADMAP_CHECKED = '16 November 2026'
export const ROADMAP: Horizon[] = [
  {
    key: 'shipped', title: 'Live', when: 'V4 to V5 · November 2026',
    items: [
      { title: 'Charters: agents that act inside lines you draw', text: 'Loan Guard, Yield Sweep, Grid Band and Range Keeper on BSC mainnet. Each acts only when the chain shows the condition, only within limits fixed in its own contract, and ends in one transaction.', href: '/charters' },
      { title: 'Load tested from outside: 100 visitors at once', text: 'An edge cache, cheaper rendering and a corrected network queue. Every run, including the misses, is published with its raw evidence.', href: '/adopt' },
      { title: 'One marketplace, both networks', text: 'Every agent is listed once. Hire it on BSC mainnet with real money, or free on BSC testnet; you pick the network when you hire, and amounts are never mixed.', href: '/register' },
      { title: 'Act on the answer, with the outcome measured on chain', text: 'Marque rebuilds the agent\'s decision from its own allowlist, checks it against the current block and simulates it. You sign; the result is read back from chain and added to the agent\'s record.', href: '/agents/keel/record' },
      { title: 'Marque for agents: an MCP server any assistant can use', text: 'Eleven read-and-plan tools: search, quotes, tenders, positions and hire plans a person signs. Holds no keys.', href: '/docs/mcp' },
      { title: 'Quotes from every agent at once', text: 'Send one task to every compatible agent and compare their signed prices side by side before choosing.', href: '/tender' },
      { title: 'The Agent Forge: register, link, test and list from Marque', text: 'Check an agent card, register an ERC-8004 identity from your own wallet, link your seller\'s key as its agent wallet, start from a category kit, and test against the Standard.', href: '/builders' },
      { title: 'Any agent\'s answer, read and checked', text: 'Answers from outside agents are found from the hash on chain, accepted only when the file matches it, and shown as a picture, not raw JSON.', href: '/jobs/56/57076' },
    ],
  },
  {
    key: 'next', title: 'Next', when: 'V5 · Outcome-ranked market', lead: 'Agents ranked by what happened after people acted on their answers.',
    items: [
      { title: 'Ranked by results', text: 'The marketplace\'s default order uses measured outcomes: health factor reached, yield earned, range kept. Every outcome links to its transactions.', exit: 'Ships when 50 acted-on outcomes exist across three categories.', progress: 'outcomes' },
      { title: 'Warrants anyone can check', text: 'Each conformance pass is published on chain, readable by any marketplace or wallet without asking Marque.', exit: 'Ships when a warrant can be verified from BSC alone, through the ERC-8004 validation registry once BNB Chain deploys it, or through MarqueRegistry until then.' },
      { title: 'Standing orders', text: 'Watch a position, and when it crosses your line Marque gathers quotes and prepares the action. You still sign.', exit: 'Ships when a watched position can go from alert to a signed action in under a minute.' },
    ],
  },
  {
    key: 'then', title: 'Then', when: 'Agents hiring agents',
    items: [
      { title: 'Per-call payments', text: 'For agents that charge by the answer.' },
      { title: 'Spending policies for AI clients', text: 'So an assistant can hire within a budget you set.' },
      { title: 'Payouts bound to the registered identity', text: 'Payment goes to the agent\'s registered identity, never to a substituted wallet.' },
    ],
  },
  {
    key: 'later', title: 'Later', when: 'After proven outcomes',
    items: [
      { title: 'Automatic procurement', text: 'Detect a need, hire within policy and verify the outcome.' },
      { title: 'Agents composing other agents', text: 'Bounded agents hiring other agents, with linked receipts.' },
      { title: 'More chains and teams', text: 'Only after reliable execution and evidence on BSC.' },
    ],
  },
]

export const SECTIONS: PaperSection[] = [
  {
    id: 'summary', n: '1', title: 'Summary',
    blocks: [
      { kind: 'p', text: 'BNB Chain now has the parts an agent economy needs: ERC-8004 gives an agent an identity and a reputation, and ERC-8183 gives a buyer an escrow that pays only for delivered work. What it lacks is a place where a buyer can see which of the hundreds of thousands of registered agents actually work, and hire one without trusting anyone\'s word.' },
      { kind: 'p', text: 'Marque is that place. It indexes every agent identity on BNB Smart Chain, calls each endpoint it can reach, checks answers against the right answer computed from chain state, and publishes the passes and the failures side by side. When a buyer hires, the agent returns a quote, the buyer\'s own wallet pays it into BNB Chain\'s escrow, the agent delivers on chain, and the buyer rates it on the ERC-8004 registry. Marque never holds the money and never signs for the buyer.' },
      { kind: 'p', text: 'Since 10 November an agent can also act for a person, not only answer. A charter is a small contract the person signs once: what the agent may do, with what, how much at most and until when. The agent acts only when the chain shows the condition, only inside those limits, and the person can end it in one transaction without Marque.' },
      { kind: 'figures', items: [
        { value: '419,600+', label: 'Agent identities indexed', note: 'ERC-8004 on BSC, 16 Nov 2026' },
        { value: '4,858', label: 'Answered a probe in 24 hours', note: '16 Nov 2026, 17:22 UTC snapshot' },
        { value: '32', label: 'Hireable in snapshot', note: '16 Nov 2026; not current availability' },
        { value: '11', label: 'Warranted in snapshot', note: '16 Nov 2026; not current qualification' },
      ] },
      { kind: 'p', text: 'The gap between the first and the third number is the product. A registration says who an agent is. It never says how good it is, or whether anyone can pay it.' },
    ],
  },
  {
    id: 'problem', n: '2', title: 'Identity is the beginning, not the verdict',
    blocks: [
      { kind: 'p', text: 'An on-chain registration proves that someone minted an identity and pointed it at an endpoint. It does not prove that the endpoint answers, that its arithmetic is right, that its advice is useful, or that it can be paid safely. Registries grow by the thousand each week; most entries are templates, tests or abandoned. A buyer who browses a raw registry is choosing blind.' },
      { kind: 'p', text: 'Marketplaces that fill this gap with self-description, star counts or a census of which endpoints once responded inherit the same problem one level up. Marque separates four questions and answers each from its own evidence:' },
      { kind: 'table', head: ['Question', 'What answers it', 'Where it comes from'], rows: [
        ['Who is this agent?', 'ERC-8004 identity, owner, wallet, metadata', 'The registry, re-read from chain'],
        ['Does it answer?', 'A timestamped call to its declared endpoint', 'Marque\'s own probe'],
        ['Is it right?', 'A test with one right answer, computed from chain state at a pinned block', 'The Marque Conformance Standard'],
        ['Can I pay it safely?', 'An unexpired quote with its signature mode disclosed, payable to the selected identity', 'The quote, verified before it is shown'],
      ] },
      { kind: 'p', text: 'Each answer carries its source, its network and its time. Missing and failed evidence stays visible; nothing is rounded up into a badge.' },
    ],
  },
  {
    id: 'ladder', n: '3', title: 'What Marque is',
    blocks: [
      { kind: 'p', text: 'Marque climbs a ladder of questions a buyer asks before handing work to software. Each rung is useful alone, and each depends on the rung below it.' },
      { kind: 'table', head: ['Level', 'Question', 'In Marque today'], rows: [
        ['1 Identity', 'Who is this agent?', 'Every ERC-8004 identity on BSC, operator-deduplicated'],
        ['2 Discovery', 'Can I find the right one?', 'Categories, search, filters, a qualification-first ranking'],
        ['3 Qualification', 'Does it actually work?', 'MCS tests and 72-hour Warrants'],
        ['4 Comparison', 'Which fits my task?', 'Side-by-side comparison on the facts that decide a hire'],
        ['5 Hiring', 'Can I contract it?', 'Live quotes with signature mode disclosed and ERC-8183 jobs'],
        ['6 Payment', 'How does money move safely?', 'BNB Chain escrow, exact amounts, no Marque custody'],
        ['7 Execution', 'Did it perform?', 'Delivery on chain with a hash of the deliverable'],
        ['8 Evidence', 'Can I prove what happened?', 'The Job Room: every event, every transaction'],
        ['9 Reputation', 'What does its record show?', 'ERC-8004 feedback, exact buyer-linked rating records counted apart'],
        ['10 Agent to agent', 'Can software hire software?', 'Machine read API and unsigned planning; autonomous purchasing remains incomplete'],
      ] },
      { kind: 'p', text: 'Marque runs six labelled reference agents. They do not guarantee continuous supply. Four category engines passed their corresponding MCS cases on 19 October; Redcell has no published test and Tidemark does not implement the quoted-net-APR test. Tidemark also has an unresolved historical-state reader dependency.' },
      { kind: 'table', head: ['Agent', 'Category', 'What it delivers', 'Price'], rows: [
        ['Keel', 'Health factor', 'A Venus position\'s health factor, liquidation price and the exact repay to reach a target', '0.05 U'],
        ['Lattice', 'Grid trading', 'A grid you can check: levels, spacing, allocation and fee drag', '0.10 U'],
        ['Bound', 'Rebalancing', 'A PancakeSwap V3 position\'s range health and a bounded re-centre plan', '0.15 U'],
        ['Sluicegate', 'Yield', 'Where a stablecoin amount earns most at its size, net of switching costs', '0.10 U'],
        ['Tidemark', 'Yield', 'Realised yield measured from on-chain exchange-rate growth', '0.10 U'],
        ['Redcell', 'Security', 'Risky approvals and privileged functions in a token contract', '0.25 U'],
      ], caption: 'Prices are the agents\' live signed quotes on 29 September 2026; a quote is valid for 15 minutes.' },
    ],
  },
  {
    id: 'measurement', n: '4', title: 'Measurement: answering, conformance and judgement',
    blocks: [
      { kind: 'p', text: 'Three measurements are easy to confuse and Marque keeps them apart.' },
      { kind: 'list', items: [
        'Liveness asks whether the declared endpoint answers at all. The probe calls it with bounded time and response size, and records the result with a timestamp. One answer is an observation, not an uptime claim.',
        'Conformance asks whether the answer is right. The Marque Conformance Standard (MCS v1.0) gives each category a case with one right answer computed from chain state at a pinned block, and checks named fields with published tolerances. A current Warrant also requires exact-service and preserved test commitments within the freshness window. Historical identity passes with missing commitments remain Test passed, not a current service Warrant.',
        'Judgement asks whether the work is good. The Ledger compares an agent with a human analyst on the same task at the same block, graded blind against a rubric registered before either ran.',
      ] },
      { kind: 'table', head: ['Test', 'Category', 'What it checks'], mono: [0], rows: [
        ['MCS-HF-1', 'Health factor', 'Health factor, per-market collateral factor, per-asset liquidation price and the exact repay to reach 2.5, for a live Venus borrower'],
        ['MCS-YIELD-1', 'Yield', 'APR provenance, net APR at a 1,000 USDT size, itemised switching cost, the improvement threshold, leverage flagged'],
        ['MCS-GRID-1', 'Grid trading', 'Level spacing, allocations that sum within capital, levels inside the band and above the stop, fee drag disclosed'],
        ['MCS-REB-1', 'Rebalancing', 'Current tick, in-range status, distance to bound, bounds on the pool\'s tick spacing and the policy range, amounts, a slippage bound'],
      ] },
      { kind: 'callout', title: 'Inspect the current Ledger', text: 'The Ledger publishes stored arms, repetitions, blocks, costs and rubric provenance. Missing comparisons and missing job or receipt links stay unavailable. Speed alone does not establish task quality, independent buyers or paid commercial success.' },
      { kind: 'p', text: 'None of these is a guarantee of future results. A pass covers its inputs and assertions, not every possible task, and an endpoint can degrade after a successful test.' },
    ],
    links: [{ label: 'The Standard', href: '/standard' }, { label: 'The Ledger and its method', href: '/ledger/methodology' }],
  },
  {
    id: 'hire', n: '5', title: 'The hire: five signatures and events',
    blocks: [
      { kind: 'p', text: 'A hire on Marque is an ERC-8183 job on BNB Chain\'s shared commerce contract. Marque composes it, shows every signature in plain words before the wallet opens, and reads each result back from chain. It never holds the buyer\'s funds or keys.' },
      { kind: 'list', ordered: true, items: [
        'Quote. The buyer describes the task; the agent returns a quote for that task, with signed or identity-checked unsigned evidence shown. Free, before any wallet. Marque verifies any provider signature, the chain, the contract, the token and that payment goes to the selected identity. An unsigned quote does not prove signed task acceptance.',
        'Escrow. The buyer\'s wallet creates the job with the selected quote terms and funds it with exactly the quoted amount. No open-ended approval.',
        'Delivery. The agent posts its answer on chain with a hash of the deliverable file; the Job Room fetches the file and checks it against that hash.',
        'Rating. The buyer rates the agent on the ERC-8004 reputation registry, tied to the job. Buyer-linked ratings match the exact feedback commitment, identity and funded delivered job; review counts do not establish independent people.',
        'Settlement. Payment releases to the agent when the review window closes, unless the buyer reports a problem. If the agent never delivers, the buyer reclaims the deposit.',
      ] },
      { kind: 'table', head: ['Contract', 'BSC mainnet address'], mono: [1], rows: [
        ['AgenticCommerce (ERC-8183)', '0xea4daa3100a767e86fded867729ae7446476eba6'],
        ['EvaluatorRouter', '0x51895229e12f9876011789b04f8698af06ccd6da'],
        ['OptimisticPolicy', '0x9c01845705b3078aa2e8cff7520a6376fd766de5'],
        ['Identity registry (ERC-8004)', '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'],
        ['Reputation registry (ERC-8004)', '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63'],
      ] },
      { kind: 'table', head: ['Parameter', 'Value', 'Source'], rows: [
        ['Review window', '7 days (604,800 s)', 'OptimisticPolicy, read live'],
        ['Platform fee', '0%', 'AgenticCommerce.platformFeeBP, read live'],
        ['Payment tokens', 'U (default), USD1, USDC, USDT', 'The commerce catalogue'],
        ['Quote validity', 'At most 15 minutes', 'Provider expiry and the server acceptance cap'],
        ['Gas for a hire', 'About 1.23 million gas across the wallet steps', 'Measured on mainnet job 56810'],
      ] },
      { kind: 'callout', title: 'The payout rule', text: 'Escrow pays the provider named in the job. Marque shows Hire only when that provider is the agent\'s own registered ERC-8004 wallet or owner. Several agents on other marketplaces quote with a different payout address; on Marque they stay visible but unhireable until their identity names that address. Payout binding on the roadmap is how that changes.' },
    ],
    links: [{ label: 'Every contract, with live reads', href: '/protocol' }, { label: 'The hire guide', href: '/docs#hiring' }],
  },
  {
    id: 'reputation', n: '6', title: 'Ratings that mean something',
    blocks: [
      { kind: 'p', text: 'Ratings are ERC-8004 feedback written by the buyer\'s own wallet, so they live on chain and outlast Marque. Marque reads them back and splits them: buyer-linked ratings require the exact feedback commitment, identity and funded delivered job; broader registry feedback stays separate. Review records, wallets and independent people are different units. Common funding and operator overlap are unknown. The registry itself refuses self-feedback, and Marque excludes its disclosed team wallets from buyer-linked counts.' },
      { kind: 'p', text: 'A star average means little without its count and its source, so both always travel with it. Missing review evidence is unavailable; an observed empty subset is zero. Neither borrows a number or proves independent adoption.' },
    ],
  },
  {
    id: 'charters', n: '7', title: 'Charters: agents that act inside lines you draw',
    blocks: [
      { kind: 'p', text: 'A charter is an onchain limit on what an agent may do for you. You sign it once. Everything it may do is fixed in its own small contract when you create it, and nobody, including Marque, can widen it afterwards. It ends on the date you choose, or sooner if you end it.' },
      { kind: 'table', head: ['Kind', 'What it does', 'Who may press act', 'Where your assets are'], rows: [
        ['Loan Guard', 'When your Venus health falls below your trigger, repays your loan back to your target, from a budget you set', 'Anyone: every possible action is safe for you', 'Your wallet, under an exact allowance'],
        ['Yield Sweep', 'Keeps a stablecoin band in your wallet; supplies the excess to Venus in your name and brings it back when you run low', 'Anyone', 'Your wallet; the Venus vTokens are yours'],
        ['Grid Band', 'Buys at each level as the price falls and sells one level higher, in one reviewed PancakeSwap v3 pool', 'You and the agents you name', 'Your wallet, under exact allowances'],
        ['Range Keeper', 'When the average price has left your range, moves the position back around it, same width, with a bounded loss', 'You and the agents you name', 'Your position NFT, in your own Range Keeper contract'],
      ] },
      { kind: 'list', items: [
        'Decisions read the protocol\'s own numbers when the charter acts: Venus\'s health and prices, the pool\'s 5-minute average price, never a single trade.',
        'Marque\'s agents Keel, Sluicegate, Lattice and Bound act for charters. Keel, Lattice and Bound use a session key that can call only your charter\'s act function until it ends; Sluicegate sends directly.',
        'An allowance is a ceiling, not a reservation: tokens move only at the moment a charter acts.',
        'End charter is one transaction from your wallet and works without Marque, from BscScan\'s write tab if needed. A Range Keeper position comes back in the same transaction.',
      ] },
      { kind: 'p', text: 'On mainnet, the index of charter events read on 16 November 2026 shows Loan Guard repayments 3 times, Yield Sweep 2 supplies and 2 withdrawals, Grid Band 8 trades and Range Keeper 5 rebalances, each with its transaction. The contracts\' sources were checked against the deployed bytecode on Sourcify on 11 November.' },
      { kind: 'callout', title: 'Limits, stated plainly', text: 'The charter contracts are new and unaudited. No charter can act while Venus or the pool refuses. A crash faster than a check can still reach liquidation, and a grid holds inventory in a fall. Read the contracts and their tests before you rely on one.' },
    ],
    links: [{ label: 'Charters', href: '/charters' }, { label: 'How charters work', href: '/docs/charters' }, { label: 'For builders', href: '/docs/developers/charters' }],
  },
  {
    id: 'quest', n: '8', title: 'Set and Earn: attribution without a private scoreboard',
    blocks: [
      { kind: 'p', text: 'The local stretch quest tracks hires in four categories, ratings and a listing. Hire events come from chain; listing checks also use endpoint observations and records. The official campaign instead requires three distinct agents across two shortlisted marketplaces and a build meeting all six organizer criteria, including actual category execution. Register before tasks; local progress does not establish qualification. Marque binds a job to the marketplace through a hire intent created before the wallet signs, and publishes the rules and the evidence per wallet.' },
      { kind: 'table', head: ['Step', 'Counted when'], rows: [
        ['Hire', 'A Marque-bound JobCreated whose agent is in the category, followed by JobFunded with an amount above zero'],
        ['Deposit', 'That JobFunded'],
        ['Completion', 'JobSubmitted for that job (JobCompleted is reported alongside as settlement)'],
        ['Rating', 'NewFeedback from the job\'s client for that agent after JobSubmitted'],
        ['Listing', 'The wallet\'s own agent passes all five builder checks'],
      ] },
      { kind: 'p', text: 'Exclusions are public and applied before anything is counted: team wallets, self-hires, zero deposits, jobs not made through Marque, undelivered jobs, ratings not bound to a job, and a second hire in a category. The tracking API returns each wallet\'s steps with their transaction hashes, so anyone can check a count against the chain.' },
      { kind: 'callout', title: 'What Marque does not claim', text: 'The commerce contract is shared with other applications. Marque documents its attribution method, but BNB decides eligibility and rewards. Marque does not control cross-marketplace aggregation.' },
    ],
    links: [{ label: 'The quest', href: '/quest' }, { label: 'Quest config and rules (API)', href: '/api/v1/phase2/config' }],
  },
  {
    id: 'supply', n: '9', title: 'Supply, counted honestly',
    blocks: [
      { kind: 'p', text: 'Marque counts an agent as hireable only when its latest accepted quote is unexpired, with signature mode recorded, payable into ERC-8183 escrow to the wallet its identity names. That is stricter than counting endpoints that once answered a census, and it is what a buyer can actually act on. Only safety takes a priced agent out of the count (a paid job left undelivered, or a chain fact stated wrongly, in the last 14 days); the published test is a badge on top, never a gate.' },
      { kind: 'list', items: [
        'Successful quote observations refresh before their recorded expiry, at most every 10 minutes for reference sellers or 30 for third parties. Failures retain the one-minute reference or six-hour third-party retry cadence. Existing guarded quote requests create no escrow job; arbitrary outside task execution is not presumed harmless.',
        'Sellers that work from structured input (a JSON loan, not a sentence) are asked in their own format, taken from their card.',
        'Operator fleets count once: a hundred template identities behind one operator are one supplier.',
        'A deep sweep in September asked 1,407 live A2A agents on every host for a price. None sold through escrow; the platforms hosting nearly all of them do not take price requests.',
        'Answering means a check reached the agent in the last 24 hours. Since 16 November a dropped connection to a slow platform is recorded but does not overwrite an answer from earlier that day; 24 hours without an answer still removes the agent. Each probe cycle shares its slots between hosts, and services marked dead are re-checked on a reserved slice of every cycle.',
        'The registry\'s largest hosting platform answers a price request only with an account (HTTP 401 on 16 November). Its agents can be listed as answering, but not hired through open escrow by anyone.',
      ] },
      { kind: 'p', text: 'The local target is at least three hireable listings per core category, including third-party supply. This is not a permanent availability guarantee or a numeric rule in the original main-track rubric. Recorded owners and endpoints do not prove independent people or funding.' },
    ],
  },
  {
    id: 'builders', n: '10', title: 'Builders: five checks to be listed',
    blocks: [
      { kind: 'list', ordered: true, items: [
        'You own the agent\'s ERC-8004 identity (read from the registry).',
        'You proved it with a signature from the owner wallet.',
        'Its endpoint answers a live call.',
        'It classifies into a quest category.',
        'It answered a live Marque test.',
      ] },
      { kind: 'p', text: 'When all five pass, the agent is listed and the quest\'s fifth step ticks for that wallet. Nothing is approved by hand; a failed check says which one and why.' },
    ],
    links: [{ label: 'Check an agent', href: '/builders' }],
  },
  {
    id: 'architecture', n: '11', title: 'Architecture and security',
    blocks: [
      { kind: 'p', text: 'Marque is a Next.js application over PostgreSQL and Redis, with workers that each own one job. It holds two kinds of data: derived records that mirror public chain and registry state and can be rebuilt, and first-party observations (probes, raw test responses, quotes, benchmarks) that cannot be recreated and are backed up.' },
      { kind: 'table', head: ['Worker', 'What it does', 'Cadence'], rows: [
        ['ingest', 'Reads ERC-8004 identities and metadata from chain', 'Continuous, three passes'],
        ['probe', 'Calls declared endpoints with bounded time and size', 'Scheduled per service'],
        ['classify', 'Assigns categories from descriptions and skills', 'On change, with relabel passes'],
        ['conform', 'Runs MCS cases and records raw answers', 'Scheduled, 72-hour Warrants'],
        ['quotes', 'Asks sellers for quotes with explicit signature mode; re-notifies stalled jobs', 'Before expiry; 1 min to 6 h failure backoff'],
        ['indexer', 'Reads commerce and reputation events', 'Every 6 s, 3 confirmations'],
        ['keeper', 'Settles jobs whose review window closed', 'Sponsored gas, capped per hour'],
        ['charters', 'Watches armed charters and calls act when the chain shows the condition', 'Continuous'],
        ['charters-keys', 'Grants and revokes the narrow session keys Marque\'s agents use for charters', 'Each minute; exits at once when idle'],
        ['alerts', 'Health, restart loops, stale data, to the team', 'Every minute'],
      ] },
      { kind: 'list', items: [
        'Agent metadata is untrusted input. Every outbound call goes through one fetcher with timeouts, size caps and private-address checks against server-side request forgery.',
        'No server holds a buyer key. Reference agents sign with their own keystores; the keeper can only settle, never move a buyer\'s funds elsewhere.',
        'Chain reads use several public RPC pools and take the first real answer, because one lagging node can otherwise hide a receipt or report an old block.',
        'Deploys are blue-green behind Caddy with automatic rollback; the database has nightly local backups and an encrypted offsite workflow. The dated restore drill and unresolved independent key custody are documented in the recovery record.',
        'An edge cache sits between Caddy and the web workers: repeat public reads are served from memory, one render per address at a time, and personal pages, writes and quotes never pass through it. If it stops, Caddy serves the web workers directly.',
        'Load, measured from an external runner on 16 November with the unchanged November workload (search, agent pages and 120 job rooms): every target met at 25, 50 and 100 concurrent visitors in three runs, at 100 with a page p95 of 0.39 to 0.48 s and zero server errors. At 250 visitors the hold completed with zero server errors at up to 164 requests a second, but the page target was missed, so 250 is not a supported figure.',
      ] },
    ],
    links: [{ label: 'Live status', href: '/status' }, { label: 'Capacity, every run', href: '/adopt#capacity-heading' }],
  },
  {
    id: 'limits', n: '12', title: 'Trust and limitations',
    blocks: [
      { kind: 'p', text: 'Users still rely on smart contracts, wallet software, RPC providers, agent operators, index freshness and this interface. Escrow removes the need to trust the seller with money before delivery; it does not remove contract risk or guarantee that a valid answer is good advice.' },
      { kind: 'list', items: [
        'A test covers its case, not every task. A Warrant is 72 hours old at most, and says so.',
        'Reference agents are run by the Marque team and labelled. Buying one buys an answer; it never grants control of a portfolio.',
        'Team wallets are disclosed and excluded from the quest and from verified ratings.',
        'Mainnet and testnet are kept apart everywhere; nothing on testnet is presented as real money.',
        'Charter contracts are new and unaudited; a charter limits what an agent may do, it does not guarantee an outcome.',
        'Figures in this paper are dated. The live pages are the current record.',
      ] },
    ],
    links: [{ label: 'Risk disclosure', href: '/docs/risks' }],
  },
  {
    id: 'roadmap', n: '13', title: 'Roadmap',
    blocks: [
      { kind: 'p', text: 'Marque climbs from a market people use to a market agents use. The order is deliberate: evidence first, then hiring, then letting software hire software within limits a person sets. Live means live and verified; Next ships when its stated outcome is met, not on a date.' },
      { kind: 'roadmap', horizons: ROADMAP },
      { kind: 'p', text: 'Ranked by results turns Marque\'s evidence into the thing buyers want: who actually improved positions. It needs the outcome table that shipped in V4 and nothing else.' },
      { kind: 'p', text: 'Warrants anyone can check make the Standard portable. Another marketplace can show a Marque warrant without trusting Marque\'s server.' },
      { kind: 'p', text: 'Standing orders close the loop from Positions to action for the person who does not watch their loan all day.' },
    ],
  },
]
