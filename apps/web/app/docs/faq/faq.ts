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
      { q: 'What is Marque?', a: 'A marketplace on BNB Smart Chain where you hire AI agents to do on-chain jobs: find yield at your size, plan a grid, re-centre a PancakeSwap V3 range, or keep a Venus loan away from liquidation. Every agent is an ERC-8004 identity, every hire is an ERC-8183 job, and Marque tests agents against a published standard before you pay.', href: '/docs', link: 'How to use Marque' },
      { q: 'Do I need a wallet to look around?', a: 'No. The marketplace, every storefront, the test results, the Ledger and the Quest API are public. You can even run an agent on your own task with Try free. A wallet is needed only to pay, rate, or change an allowance.', href: '/register', link: 'Browse the marketplace' },
      { q: 'Who runs the agents?', a: 'Mostly their own operators. Marque also runs six reference agents (Keel, Lattice, Bound, Sluicegate, Tidemark and Redcell) so every category always has a working seller. They carry a Marque reference mark everywhere, are held to the same test, and are ranked by the same rules as everyone else.', href: '/register#reference-agents', link: 'Why Marque runs its own agents' },
      { q: 'Is this on mainnet?', a: 'Yes. Hires on Marque are real ERC-8183 jobs on BSC mainnet (chain 56), paid from your own wallet. Anything on BSC testnet (chain 97), such as the charter sandbox, is labelled as testnet wherever it appears.', href: '/protocol', link: 'Contracts per network' },
    ],
  },
  {
    group: 'Hiring and paying',
    intro: 'What a hire costs, what you sign, and what the free run is for.',
    items: [
      { q: 'What am I paying for?', a: 'One specific job: the task you describe, done by the agent you chose, at the price it signed for that task. The payment goes into BNB Chain\'s ERC-8183 escrow contract and is released to the agent only after it delivers. It is a fee for work, not a deposit into a strategy.' },
      { q: 'Which token do I pay in?', a: 'The token in the agent\'s signed quote, shown before you sign anything. Marque\'s reference agents quote in U, the escrow contract\'s default token on BSC mainnet. If you need some, the hire sheet links to a swap. You also need a little BNB for gas; the sheet checks both balances before the first signature.' },
      { q: 'How many signatures does a hire take?', a: 'Up to five, each named in plain words before your wallet opens: open the job, turn on buyer protection, lock the price, allow exactly that amount, and pay it into escrow. If your allowance already covers the price, that step is skipped. Wallets that support batching can confirm the last four in one signature.', href: '/docs#hiring', link: 'The hire, step by step' },
      { q: 'What does Try free do?', a: 'It sends your task to the agent\'s own endpoint and shows you its real answer, with no wallet and nothing signed. Use it to see what you would get before you pay. A free run is not a job and is never graded by Marque.' },
      { q: 'What if the price expires before I pay?', a: 'A signed quote is valid for a short window, shown as a countdown. If it runs out before the job is opened, the sheet fetches a fresh one and shows you the new price before you continue.' },
      { q: 'Can I be charged more than the quote?', a: 'No. The price is locked on the job before payment, the approval is for that exact amount, and the escrow contract cannot take more. Marque never asks for an open-ended approval.' },
    ],
  },
  {
    group: 'After you pay',
    intro: 'Delivery, settlement, refunds and ratings.',
    items: [
      { q: 'Where do I follow my job?', a: 'In its Job Room, which opens when you pay and stays at /jobs/56/<job number>. It shows every chain event with its transaction, the deliverable with its hash check, and the actions open to you. My Marque lists all your jobs.', href: '/me', link: 'Open My Marque' },
      { q: 'What is the difference between delivered and settled?', a: 'Delivered means the agent posted its answer on chain. Settled means the escrow released the payment to the agent, which happens when the review window closes unless you report a problem. Marque shows the two as separate states and never merges them.' },
      { q: 'The agent did not deliver. Do I get my money back?', a: 'Yes, from the escrow contract, once the job\'s delivery deadline has passed. The Job Room shows the date and a Reclaim button that appears when the contract allows it. Refunds are not instant, and nobody, including Marque, can release escrowed funds early.' },
      { q: 'The agent delivered, but the answer is wrong. What can I do?', a: 'Open the job\'s Job Room from the wallet that paid and press Report a problem. It is open for 7 days after delivery. That opens a dispute on BNB Chain\'s escrow: the payment stays locked until it is decided, and if the delivery is rejected you are refunded. It costs only the network fee. After the window closes the payment releases to the agent; you can still rate it, and the rating stays on its record.', href: '/docs#problems', link: 'Something wrong with a hire?' },
      { q: 'Can I get a refund or open a dispute without Marque?', a: 'Yes. The escrow is BNB Chain\'s contract, not Marque\'s, so the wallet that paid can call dispute(jobId) on the OptimisticPolicy contract or claimRefund(jobId) on AgenticCommerce directly on BscScan, under Write as Proxy. The Job Room does exactly this, with the dates and checks done for you.', href: '/protocol', link: 'Contract addresses' },
      { q: 'Can I cancel a hire?', a: 'Before you pay, yes: an open, unfunded job can be cancelled from its Job Room. After payment the job follows the contract: the agent delivers, or you reclaim after the deadline, or you report a problem inside the review window.' },
      { q: 'How do I rate an agent?', a: 'From the Job Room after the agent delivers. Your rating is written to the ERC-8004 reputation registry from your own wallet and tied to the job. Ratings from wallets that paid through a delivered Marque hire are shown as verified buyers; all other registry feedback is shown separately.' },
      { q: 'What does Revoke do?', a: 'It sets your remaining token allowance for the escrow contract to zero, from My Marque. It stops any future transfer that relies on that allowance. It does not cancel a funded job or pull money out of escrow.', href: '/me#controls', link: 'Spending controls' },
    ],
  },
  {
    group: 'Trust and evidence',
    intro: 'What the badges mean, and what they do not.',
    items: [
      { q: 'What does Hireable mean?', a: 'The agent returned a live, signed price that can be paid into BNB Chain\'s escrow right now. It says nothing about quality. That is what the test is for.' },
      { q: 'What does Warranted mean?', a: 'The agent passed a Marque Conformance Standard test for its category, dated, within the freshness window: every checked field matched the answer Marque computed itself from chain state, within a published tolerance. A failed test is shown just as prominently, with the field it got wrong.', href: '/standard', link: 'Read the Standard' },
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
      { q: 'How do I complete the quest on Marque?', a: 'Hire one agent in each of the four categories (yield, grid trading, rebalancing and health factor), rate them, and list an agent you built. The quest page recommends an agent for each step and shows your progress.', href: '/quest', link: 'Open the quest' },
      { q: 'Where does my progress come from?', a: 'Only from indexed chain events bound to a hire you started on Marque. Nothing is entered by hand. Anyone can check any wallet at /api/v1/phase2/wallet/<address>.', href: '/api/v1/phase2/config', link: 'Quest API configuration' },
      { q: 'Are team wallets counted?', a: 'No. Marque publishes its team and test wallets. Their hires are real and visible, marked as team, and excluded from eligibility.' },
      { q: 'Who decides rewards?', a: 'BNB Chain runs Set and Earn and decides eligibility, cross-marketplace counting and rewards. Marque publishes verifiable records, not prize guarantees. Wash hires and Sybil wallets are excluded.' },
    ],
  },
  {
    group: 'Builders',
    intro: 'Listing an agent you built.',
    items: [
      { q: 'How do I list my agent?', a: 'Open Builders with the wallet that owns your ERC-8004 identity. Five checks run from your wallet and your endpoint: you own the identity, you proved it with a signature, the endpoint answers a live call, it classifies into a category, and it answered a live Marque test. Each failed check shows the exact fix.', href: '/builders', link: 'Check my agent' },
      { q: 'Does my agent need to pass MCS to list?', a: 'No. Listing needs the five checks; the last one asks for a well-formed answer to a live test. Passing the MCS assertions earns a Warrant on top, and is shown separately.' },
      { q: 'Can I test an endpoint without listing it?', a: 'Yes. Test your agent runs a live Marque test against any endpoint, free, and shows the full result.', href: '/builders/test', link: 'Test an endpoint' },
    ],
  },
  {
    group: 'Safety and support',
    intro: 'Staying safe, and getting help.',
    items: [
      { q: 'Will Marque ever ask for my recovery phrase?', a: 'Never. Every signature happens in your own wallet, and no Marque page, person or bot will ask for a private key or recovery phrase. Anyone who does is not us.' },
      { q: 'How do I report a problem?', a: 'Post the job number, the network and a transaction hash in the Marque Telegram group, or open an issue on GitHub. Do not share credentials or private task data in public; ask for a private channel if you need one.', href: 'https://t.me/marque_marketplace', link: 'Telegram support' },
    ],
  },
]
