/**
 * The FAQ (27 Sep docs rebuild). Plain answers, each pointing at the page that
 * shows it. Claims follow AGENTS.md 13.7: no guarantees, no invented numbers,
 * the escrow belongs to BNB Chain's contract, never to Marque.
 */
export interface Faq { q: string; a: string; href?: string; link?: string }
export interface FaqGroup { group: string; intro: string; items: Faq[] }

export const faqSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const FAQ: FaqGroup[] = [
  {
    group: 'The basics',
    intro: 'What Marque is, who runs the agents, and what you can do without a wallet.',
    items: [
      { q: 'What is Marque?', a: 'A marketplace on BNB Smart Chain where you hire AI agents to do on-chain jobs: find yield at your size, plan a grid, re-centre a PancakeSwap V3 range, or keep a Venus loan away from liquidation. Every agent is an ERC-8004 identity, every hire is an ERC-8183 job, and Marque publishes deterministic test evidence where available. Hiring is not gated on a test pass.', href: '/docs', link: 'How to use Marque' },
      { q: 'Do I need a wallet to look around?', a: 'No. The marketplace, every storefront, the test results, the Ledger and the Quest API are public. Supported Marque reference services also offer an ungraded Try free preview. A wallet is needed only to pay, rate, or change an allowance.', href: '/register', link: 'Browse the marketplace' },
      { q: 'Who runs the agents?', a: 'Listings are provided by their registered operators. Marque also runs six reference agents (Keel, Lattice, Bound, Sluicegate, Tidemark and Redcell) to support category supply. Availability and test results can change. They carry a Marque reference mark everywhere, are held to the same test, and are ranked by the same rules as everyone else.', href: '/register#reference-agents', link: 'Why Marque runs its own agents' },
      { q: 'Is this on mainnet?', a: 'Yes. Hires on Marque are real ERC-8183 jobs on BSC mainnet (chain 56), paid from your own wallet. Testnet records use chain 97 and are labelled per action. The current charter preview grants no authority.', href: '/protocol', link: 'Contracts per network' },
    ],
  },
  {
    group: 'Hiring and paying',
    intro: 'What a hire costs, what you sign, and what the free run is for.',
    items: [
      { q: 'What am I paying for?', a: 'One specific job: the task you describe, done by the agent you chose, at the selected quote price with its signature mode shown. The payment goes into BNB Chain\'s ERC-8183 escrow contract and is released to the agent only after the required completion and settlement steps. It is a fee for work, not a deposit into a strategy.' },
      { q: 'Which token do I pay in?', a: 'The token in the agent\'s quote, shown before you sign anything. Marque\'s reference agents quote in U, the escrow contract\'s default token on BSC mainnet. If you need some, the hire sheet links to a swap. You also need a little BNB for gas; the sheet checks both balances before the first signature.' },
      { q: 'How many signatures does a hire take?', a: 'Up to five, each named in plain words before your wallet opens: open the job, turn on buyer protection, lock the price, allow exactly that amount, and pay it into escrow. If your allowance already covers the price, that step is skipped. Wallets that support batching can confirm the last four in one signature.', href: '/docs#hiring', link: 'The hire, step by step' },
      { q: 'What does Try free do?', a: 'For supported Marque reference services, it sends your task to that service and shows its answer without a wallet or signature. Outside-agent task calls are not assumed free and this preview rail does not invoke them. A preview is not a paid job or a quality grade.' },
      { q: 'What if the price expires before I pay?', a: 'A checked quote is valid for a short window, shown as a countdown. If it runs out before the job is opened, the sheet fetches a fresh one and shows you the new price before you continue.' },
      { q: 'Can I be charged more than the quote?', a: 'No. The price is locked on the job before payment, the approval is for that exact amount, and the escrow contract cannot take more. Marque never asks for an open-ended approval.' },
    ],
  },
  {
    group: 'After you pay',
    intro: 'Delivery, settlement, refunds and ratings.',
    items: [
      { q: 'Where do I follow my job?', a: 'In its Job Room, which opens when you pay and stays at /jobs/56/<job number>. It shows every chain event with its transaction, the deliverable with its hash check, and the actions open to you. My Marque lists all your jobs.', href: '/me', link: 'Open My Marque' },
      { q: 'What is the difference between delivered and settled?', a: 'Submission records a deliverable commitment on chain. Completion and confirmed payment release are separate events. A review deadline passing does not by itself prove that payment was released; inspect the current Job Room events.' },
      { q: 'The agent did not deliver. Do I get my money back?', a: 'For an eligible undelivered job, your wallet can claim a refund from escrow once its onchain expiry permits it. The Job Room shows the current date and allowed action. Disputed or rejected jobs follow their own contract states; a refund is not guaranteed by a page label.' },
      { q: 'The agent delivered, but the answer is wrong. What can I do?', a: 'Open the job\'s Job Room from the wallet that paid and press Report a problem. Use the review deadline read from that job’s onchain policy. That opens a dispute on BNB Chain\'s escrow: the payment stays locked until it is decided, and if the delivery is rejected you are refunded. It costs only the network fee. After the window closes, settlement may become available; confirm the payment-release event separately.  you can still rate it, and the rating stays on its record.', href: '/docs#problems', link: 'Something wrong with a hire?' },
      { q: 'Can I get a refund or open a dispute without Marque?', a: 'Yes. The escrow is BNB Chain\'s contract, not Marque\'s, so the wallet that paid can call dispute(jobId) on the OptimisticPolicy contract or claimRefund(jobId) on AgenticCommerce directly on BscScan, under Write as Proxy. The Job Room does exactly this, with the dates and checks done for you.', href: '/protocol', link: 'Contract addresses' },
      { q: 'Can I cancel a hire?', a: 'Before you pay, yes: an open, unfunded job can be cancelled from its Job Room. After payment the job follows the contract: the agent delivers, or you reclaim after the deadline, or you open a dispute inside the review window (the button sits beside the rating in the Job Room).' },
      { q: 'How do I rate an agent?', a: 'From the Job Room after the agent delivers. Your rating is written to the ERC-8004 reputation registry from your own wallet and tied to the job. Buyer-linked reviews match the exact feedback commitment, identity and funded delivered job, excluding published team wallets. Review records, wallets and independent people are different units; broader registry feedback stays separate.' },
      { q: 'What does Revoke do?', a: 'It sets your remaining token allowance for the escrow contract to zero, from My Marque. It stops any future transfer that relies on that allowance. It does not cancel a funded job or pull money out of escrow.', href: '/me#controls', link: 'Spending controls' },
    ],
  },
  {
    group: 'Trust and evidence',
    intro: 'What the badges mean, and what they do not.',
    items: [
      { q: 'What does Hireable mean?', a: 'The exact service returned an unexpired price sample with its quote mode shown. A fresh task quote, provider, chain, token and expiry must still pass checks before funding. Availability and quality are separate.' },
      { q: 'What does Warranted mean?', a: 'A Warrant binds one exact service to a fixed published case, input/output commitments and test-code version within the freshness window. Older identity-level passes remain Test passed when their service or code binding is unavailable. Failed fields, protocol failures and stale inputs stay separate. Neither a pass nor a hash guarantees the next answer.', href: '/standard', link: 'Read the Standard' },
      { q: 'Is a Warranted agent guaranteed to be safe?', a: 'No. A Warrant records that one service answered one published test correctly at one time. It is not an audit, insurance, or a promise about the next answer. Hireable and Warranted are separate badges for that reason.', href: '/docs/risks', link: 'Risk disclosure' },
      { q: 'What do ONCHAIN, MEASURED, TESTED and CLAIMED mean?', a: 'Where a number came from. ONCHAIN is read from chain events. MEASURED is something Marque observed itself, with a timestamp. TESTED is a conformance result. CLAIMED is whatever the operator wrote in the registry, and is always styled weaker.' },
      { q: 'Why do you show failures?', a: 'Because they are the most useful thing a marketplace can tell you. Registered is not the same as working, and working is not the same as correct. A failed test stays on the record with its reason.', href: '/why', link: 'Why Marque' },
      { q: 'Are Marque\'s own agents ranked higher?', a: 'No. Reference agents are ranked by the same qualification-first rules as third parties, and a third party that performs better sits above them. The reference mark exists so you always know which supply is first-party.' },
    ],
  },
  {
    group: 'The Set and Earn quest',
    intro: 'How progress is counted and who decides rewards.',
    items: [
      { q: 'How do I complete the quest on Marque?', a: 'The local stretch quest covers four categories, delivered-hire ratings and your listing. BNB’s official minimum is three different agents across at least two shortlisted marketplaces plus one agent meeting all six official builder requirements. Register first; Marque cannot certify cross-marketplace or official qualification.', href: '/quest', link: 'Open the quest' },
      { q: 'Where does my progress come from?', a: 'Only from indexed chain events bound to a hire you started on Marque. Nothing is entered by hand. Anyone can check any wallet at /api/v1/phase2/wallet/<address>.', href: '/api/v1/phase2/config', link: 'Quest API configuration' },
      { q: 'Are team wallets counted?', a: 'No. Marque publishes its team and test wallets. Their hires are real and visible, marked as team, and excluded from eligibility.' },
      { q: 'Who decides rewards?', a: 'BNB Chain runs Set and Earn and decides eligibility, cross-marketplace counting and rewards. Marque publishes verifiable records, not prize guarantees. Wash hires and Sybil wallets are excluded.' },
    ],
  },
  {
    group: 'Builders',
    intro: 'Listing an agent you built.',
    items: [
      { q: 'How do I list my agent?', a: 'Open Builders with the identity owner’s wallet. Read the public checks, prove control and explicitly publish through the owner-authorized flow. Basic owner listing, the five local quality checks, exact-service Warrant and hireability are distinct. Task tests require consent; official BNB requirements are separate.', href: '/builders', link: 'Check my agent' },
      { q: 'Does my agent need to pass MCS to list?', a: 'No. Basic owner listing does not imply local quality or a Warrant. The five local quality checks are advisory; a well-formed failed test can be recorded without passing. A current Warrant needs preserved exact-service and test commitments plus a passing result.' },
      { q: 'Can I test an endpoint without listing it?', a: 'The test page can run a supported task after you confirm control or permission and accept possible endpoint side effects. Reachability and task execution are separate. Do not test a paid or unconsented outside operation as though it were free.', href: '/builders/test', link: 'Test an endpoint' },
    ],
  },
  {
    group: 'Safety and support',
    intro: 'Staying safe, and getting help.',
    items: [
      { q: 'Will Marque ever ask for my recovery phrase?', a: 'Never. Every signature happens in your own wallet, and no Marque page, person or bot will ask for a private key or recovery phrase. Anyone who does is not us.' },
      { q: 'How do I report a problem?', a: 'Post the job number, the network and a transaction hash in the Marque Telegram group. Do not share credentials or private task data in public; ask for a private channel if you need one.', href: 'https://t.me/marque_marketplace', link: 'Telegram support' },
    ],
  },
]
