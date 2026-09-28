/**
 * The navigation model, shared by the desktop bar and the mobile drawer.
 * A plain module (no components, no server imports) so a client component can
 * import it without pulling the header into the client bundle.
 *
 * DESIGN-SYSTEM.md section 6: Marketplace, Quest, Positions, Builders, Docs,
 * with the evidence pages under one Proof menu.
 */

export type Active =
  | 'register' | 'quest' | 'positions' | 'builders' | 'docs' | 'me'
  | 'proof' | 'standard' | 'ledger' | 'receipts' | 'status' | 'protocol' | 'pancake' | 'charters' | 'benchmarks'

export interface NavLink { label: string; href: string; key: Active }
export interface NavMenuItem { label: string; href: string; note: string; icon: NavIcon; external?: boolean }
export type NavIcon = 'standard' | 'ledger' | 'receipt' | 'proof' | 'status' | 'protocol' | 'desk' | 'charter' | 'compare' | 'api'

export const NAV: NavLink[] = [
  { label: 'Marketplace', href: '/register', key: 'register' },
  { label: 'Quest', href: '/quest', key: 'quest' },
  { label: 'Positions', href: '/positions', key: 'positions' },
  { label: 'Builders', href: '/builders', key: 'builders' },
  { label: 'Docs', href: '/docs', key: 'docs' },
]

export const PROOF_GROUPS: Array<{ label: string; items: NavMenuItem[] }> = [
  {
    label: 'Evidence',
    items: [
      { label: 'Why Marque', href: '/why', note: 'Every agent registered, down to the few you can hire', icon: 'proof' },
      { label: 'The Standard', href: '/standard', note: 'The tests an agent passes to be Warranted', icon: 'standard' },
      { label: 'The Ledger', href: '/ledger', note: 'Agent against human, measured', icon: 'ledger' },
      { label: 'Receipts', href: '/receipts/latest', note: 'Every sealed run, anchored on chain', icon: 'receipt' },
      { label: 'PancakeSwap proof run', href: '/pancakeswap/proof', note: 'A real mainnet rebalance', icon: 'proof' },
    ],
  },
  {
    label: 'Live system',
    items: [
      { label: 'Status', href: '/status', note: 'Freshness, indexer lag, quest totals', icon: 'status' },
      { label: 'Protocol', href: '/protocol', note: 'Every contract we read and write', icon: 'protocol' },
      { label: 'Pancake Desk', href: '/pancakeswap', note: 'Read any PancakeSwap V3 position', icon: 'desk' },
      { label: 'Charter sandbox', href: '/app/charter', note: 'Scoped authority, on testnet', icon: 'charter' },
    ],
  },
]

/** Keys that light up the Proof menu as the current section. */
export const PROOF_KEYS: Active[] = ['proof', 'standard', 'ledger', 'receipts', 'status', 'protocol', 'pancake', 'charters', 'benchmarks']

export const DOC_GROUPS: Array<{ label: string; items: NavMenuItem[] }> = [
  { label: 'Learn', items: [
    { label: 'How to use Marque', href: '/docs', note: 'Hire, follow, rate, list, verify', icon: 'desk' },
    { label: 'Questions, answered', href: '/docs/faq', note: 'Plain answers, searchable', icon: 'standard' },
    { label: 'Whitepaper', href: '/docs/whitepaper', note: 'Architecture and trust boundaries', icon: 'protocol' },
    { label: 'Changelog', href: '/docs/changelog', note: 'What changed and what remains open', icon: 'ledger' },
  ] },
  { label: 'Use responsibly', items: [
    { label: 'Terms of use', href: '/docs/terms', note: 'The rules of the marketplace', icon: 'charter' },
    { label: 'Privacy policy', href: '/docs/privacy', note: 'Data, storage and public records', icon: 'receipt' },
    { label: 'Risk disclosure', href: '/docs/risks', note: 'Understand the risks before signing', icon: 'proof' },
  ] },
]
