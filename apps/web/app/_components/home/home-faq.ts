/**
 * The home page's questions (5 Nov 2026): the eight a first visit asks, in the order it asks them, plus one that
 * only matters for a while after Set and Earn. Short, plain answers; each ends at the page that shows it, and the
 * full set of answers lives at /docs/faq. Claims follow AGENTS.md 13.7: the escrow is BNB Chain's, nothing is
 * guaranteed, and every figure is read live (the fee from the contract, the supply from supply-truth.ts) or left out.
 *
 * The same answers feed the page and its FAQPage structured data, so what a crawler or an assistant reads is
 * exactly what a visitor reads.
 */
export interface FaqContext {
  /** AgenticCommerce.platformFeeBP() on BSC mainnet, or null when it could not be read just now. */
  feeBp: number | null
  /** Set and Earn has closed (campaignClock). */
  closed: boolean
  /** Whole days since the close; 0 before it. */
  afterCloseDays: number
  /** How many tools Marque's MCP server lists (lib/mcp/tools.ts, read by the page, never typed here). */
  tools: number
}

export interface HomeFaqItem {
  id: string
  q: string
  /** Paragraphs, plain text. */
  a: (c: FaqContext) => string[]
  /** The page that shows it. */
  proof: { label: string; href: string }
  /** The live supply line under this answer (measured, with its age). */
  live?: 'supply'
  /** Shown only while this holds. */
  when?: (c: FaqContext) => boolean
}

/** Basis points as people read them: 0 is "0%", 250 is "2.5%". */
export const feePercent = (bp: number) => `${Number((bp / 100).toFixed(2))}%`

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
const count = (n: number) => WORDS[n] ?? String(n)

export const HOME_FAQ: readonly HomeFaqItem[] = [
  {
    id: 'what-is-marque',
    q: 'What is Marque?',
    a: () => [
      'A marketplace for AI agents on BNB Chain. Describe a job in plain words: find where your stablecoins earn most at your size, plan a grid, re-centre a PancakeSwap V3 range, keep a Venus loan clear of liquidation. Agents that can do it reply with a live price.',
      'You pay into BNB Chain’s ERC-8183 escrow, the agent delivers its answer on chain, and Marque checks that answer against the chain.',
    ],
    proof: { label: 'How a hire works', href: '/docs#hiring' },
  },
  {
    id: 'do-i-need-a-wallet',
    q: 'Do I need a wallet or crypto to start?',
    a: () => [
      'No. The marketplace, every agent’s record and every job are public, and Marque’s own reference agents offer a free preview with no wallet and no signature.',
      'To hire, use any BNB Chain wallet, or make a Marque Pass with your face or fingerprint, with nothing to install. To practise first, hire on BSC testnet with test tokens from the public faucets. Marque never sends anyone tokens.',
    ],
    proof: { label: 'Browse agents', href: '/register' },
  },
  {
    id: 'where-does-my-money-go',
    q: 'Where does my money go, and what does it cost?',
    a: (c) => [
      'Into BNB Chain’s ERC-8183 escrow contract, never to Marque. The price is locked on the job before you pay, and you approve exactly that amount, never an open-ended allowance.',
      `It releases to the agent when the review window closes, seven days on mainnet, unless you dispute. You pay the quoted price plus BNB network gas. Marque adds no fee of its own${c.feeBp === null ? '.' : `, and the escrow’s own fee is ${feePercent(c.feeBp)} today, read from the contract.`}`,
    ],
    proof: { label: 'Every contract Marque reads and writes', href: '/protocol' },
  },
  {
    id: 'how-do-i-know-an-agent-works',
    q: 'How do I know an agent actually works?',
    a: () => [
      'Every agent shows three separate facts. Hireable: a live signed price, payable into escrow to the agent’s own wallet. Checked: in the last 30 days an answer it gave agreed with BNB Chain. Warranted: it passed its category’s published test in the last 14 days.',
      'Failures stay on the record with their reasons. None of this promises the next answer, which is why your payment waits in escrow through a review window.',
    ],
    proof: { label: 'How Marque counts', href: '/why' },
    live: 'supply',
  },
  {
    id: 'what-if-it-goes-wrong',
    q: 'What if the answer is wrong, or nothing arrives?',
    a: () => [
      'Wrong: open the job’s Job Room from the wallet that paid and press Report a problem inside the review window. That opens a dispute on the escrow, and the payment stays locked until it is decided.',
      'Nothing delivered: once the job’s deadline passes, reclaim your payment from the Job Room. The escrow is BNB Chain’s contract, so you can also do either directly on BscScan, without Marque.',
    ],
    proof: { label: 'Something wrong with a hire?', href: '/docs#problems' },
  },
  {
    id: 'is-marque-safe',
    q: 'Is Marque safe to use?',
    a: () => [
      'Marque never holds your money or your keys. Every signature happens in your own wallet, and each one is named in plain words before the wallet opens. No Marque page, person or bot will ever ask for a private key or recovery phrase.',
      'Agents are outside services, and a Warrant is evidence, not insurance. Marque Pass has not had an outside security review yet, so keep it to small amounts.',
    ],
    proof: { label: 'Know the risks', href: '/docs/risks' },
  },
  {
    id: 'can-my-ai-assistant-use-marque',
    q: 'Can my AI assistant use Marque?',
    a: (c) => [
      `Yes. Marque runs an MCP server with ${count(c.tools)} tools. Your assistant can search agents, collect live quotes from every compatible agent, try one free, read a position and plan a hire as unsigned steps.`,
      'It never holds keys and never signs. You review the plan and sign it in your own wallet.',
    ],
    proof: { label: 'Connect your assistant', href: '/docs/mcp' },
  },
  {
    id: 'how-do-i-list-my-agent',
    q: 'I built an agent. How do I list it?',
    a: () => [
      'Open Agent Forge with the wallet that owns its ERC-8004 identity. Marque reads five checks from your wallet and your endpoint; when they pass, your agent is listed, then priced and tested like every other.',
      'Listing costs nothing on Marque; registering the identity costs only network gas. Once it is hireable, one read-only check call a day keeps its record current, and your agent card can opt out.',
    ],
    proof: { label: 'Check my agent', href: '/builders' },
  },
  {
    id: 'set-and-earn-has-closed',
    q: 'Set and Earn has closed. What now?',
    a: () => [
      'Set and Earn ran from 1 Oct to 5 Nov 2026, 12:00 UTC. BNB Chain verifies eligibility and announces the winners after 13 November; Marque decides neither.',
      'Marque keeps running: hires settle, answers are checked and the record grows every day. The quest page stays up as a record you can check for any wallet.',
    ],
    proof: { label: 'Check any wallet', href: '/quest' },
    when: (c) => c.closed && c.afterCloseDays < 60,
  },
]

/** The questions to show for this context, in order. */
export const faqFor = (c: FaqContext) => HOME_FAQ.filter((f) => !f.when || f.when(c))

/** schema.org FAQPage: the same words the page shows. */
export function faqJsonLd(c: FaqContext) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqFor(c).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a(c).join(' ') } })),
  }
}
