import { BRAND } from '@marque/ui/brand'
import { CharterStrip } from './CharterStrip'
import { NavWallet } from './NavWallet'
import { ThemeToggle } from './ThemeToggle'
import styles from './site.module.css'

/**
 * The shell around every page.
 *
 * The brand lockup is the real finalised artwork (the winged mark + geometric
 * wordmark), extracted to a transparent asset and served per theme — never a
 * re-typeset stand-in. Sticky, lightly frosted navigation; links centred as a
 * group; a five-column footer that makes every built route reachable.
 */

type Active =
  | 'register' | 'positions' | 'benchmarks' | 'builders' | 'docs'
  | 'charters' | 'standard' | 'ledger' | 'pancake' | 'status' | 'me'

/**
 * The primary nav is the buyer's path: find an agent, read a position, the
 * PancakeSwap desk, your own dashboard, the evidence that any of it works.
 * Builders (test / list an agent) and the deeper proof pages live in the
 * footer, one click from anywhere.
 */
const NAV: Array<{ label: string; href: string; key: Active }> = [
  { label: 'Marketplace', href: '/register', key: 'register' },
  { label: 'Positions', href: '/positions', key: 'positions' },
  { label: 'Pancake Desk', href: '/pancakeswap', key: 'pancake' },
  { label: 'Benchmarks', href: '/ledger', key: 'benchmarks' },
  { label: 'My Marque', href: '/me', key: 'me' },
  { label: 'Docs', href: '/docs', key: 'docs' },
]

function BrandLockup() {
  // Two colourways of the real lockup; the CSS shows one per theme (system
  // preference or the explicit [data-theme] toggle).
  return (
    <a className={styles.brand} href="/" aria-label={`${BRAND.name} — home`}>
      <img className={styles.lockInk} src="/brand/lockup-ink.png" alt={BRAND.name} width="132" height="28" />
      <img className={styles.lockCream} src="/brand/lockup-cream.png" alt="" aria-hidden="true" width="132" height="28" />
    </a>
  )
}

export function SiteHeader({ active }: { active?: Active }) {
  return (
    <>
      <CharterStrip />
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <BrandLockup />
          <nav className={styles.navLinks} aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={n.href}
                aria-current={
                  active === n.key || (n.key === 'benchmarks' && active === 'ledger')
                    ? 'page'
                    : undefined
                }
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className={styles.navRight}>
            <ThemeToggle />
            <NavWallet />
          </div>
        </div>
      </header>
    </>
  )
}

const FOOTER: Array<{ head: string; links: Array<[string, string]> }> = [
  {
    head: 'Explore',
    links: [
      ['Marketplace', '/register'],
      ['Positions', '/positions'],
      ['Pancake Desk', '/pancakeswap'],
      ['My Marque', '/me'],
      ['Compare', '/compare'],
      ['Judge mode', '/judge'],
    ],
  },
  {
    head: 'Proof',
    links: [
      ['The Standard', '/standard'],
      ['The Ledger', '/ledger'],
      ['PancakeSwap proof run', '/pancakeswap/proof'],
      ['Receipts', '/receipts/latest'],
      ['Status', '/status'],
    ],
  },
  {
    head: 'Builders',
    links: [
      ['Docs', '/docs'],
      ['Test your agent', '/builders/test'],
      ['List your agent', '/builders/claim'],
      ['Read API', '/api/v1/agents'],
      ['GitHub', 'https://github.com/talk2francis/Marque'],
    ],
  },
  {
    head: 'Ecosystem',
    links: [
      ['BNB Agent Studio', 'https://docs.bnbchain.org/bnb-smart-chain/developers/agents/'],
      ['8004scan', 'https://8004scan.io'],
      ['PancakeSwap', 'https://pancakeswap.finance'],
      ['Venus', 'https://venus.io'],
    ],
  },
]

const REGISTRY_TESTNET = '0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7'

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <BrandLockup />
          <p>Agents you can hold to account.</p>
        </div>
        {FOOTER.map((col) => (
          <nav key={col.head} className={styles.footerCol} aria-label={col.head}>
            <span className={styles.footerHead}>{col.head}</span>
            {col.links.map(([label, href]) => (
              <a key={label} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {label}
              </a>
            ))}
          </nav>
        ))}
      </div>
      <div className={styles.footerRule}>
        <span>{BRAND.name} · {BRAND.chain}</span>
        <a href={`https://testnet.bscscan.com/address/${REGISTRY_TESTNET}`} target="_blank" rel="noreferrer">
          MarqueRegistry {REGISTRY_TESTNET.slice(0, 6)}…{REGISTRY_TESTNET.slice(-4)} · BSC testnet · 97
        </a>
      </div>
    </footer>
  )
}
