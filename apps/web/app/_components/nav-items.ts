/**
 * The navigation model, shared by the desktop bar (`SiteHeader` + `NavMenu`)
 * and the mobile drawer (`MobileNav`). Kept in a plain module — no components,
 * no server imports — so a client component can pull it in without dragging the
 * whole header into the client bundle.
 */

export type Active =
  | 'register' | 'positions' | 'benchmarks' | 'builders' | 'docs'
  | 'charters' | 'standard' | 'ledger' | 'pancake' | 'status' | 'me'

export interface NavMenuItem {
  label: string
  href: string
  external?: boolean
}

/** The flat buyer's path — always visible on desktop, top of the drawer on mobile. */
export const NAV: Array<{ label: string; href: string; key: Active }> = [
  { label: 'Marketplace', href: '/register', key: 'register' },
  { label: 'Positions', href: '/positions', key: 'positions' },
  { label: 'My Marque', href: '/me', key: 'me' },
]

export const PANCAKE_MENU: NavMenuItem[] = [
  { label: 'Pancake Desk', href: '/pancakeswap' },
  { label: 'PancakeSwap proof run', href: '/pancakeswap/proof' },
]
export const PROOF_MENU: NavMenuItem[] = [
  { label: 'The Ledger', href: '/ledger' },
  { label: 'The Standard', href: '/standard' },
  { label: 'Receipts', href: '/receipts/latest' },
  { label: 'Status', href: '/status' },
]
export const BUILD_MENU: NavMenuItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Test your agent', href: '/builders/test' },
  { label: 'List your agent', href: '/builders/claim' },
  { label: 'Read API', href: '/api/v1/agents', external: true },
  { label: 'GitHub', href: 'https://github.com/talk2francis/Marque', external: true },
]

/** The three grouped menus, in bar order. */
export const NAV_GROUPS: Array<{ label: string; items: NavMenuItem[]; match: Active[] }> = [
  { label: 'Pancake', items: PANCAKE_MENU, match: ['pancake'] },
  { label: 'Benchmarks', items: PROOF_MENU, match: ['benchmarks', 'ledger', 'standard', 'status'] },
  { label: 'Docs', items: BUILD_MENU, match: ['docs', 'builders'] },
]
