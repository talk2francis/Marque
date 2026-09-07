import { BRAND } from '@marque/ui/brand'
import { CharterStrip } from './CharterStrip'
import { NavWallet } from './NavWallet'
import styles from './site.module.css'

/**
 * The shell around every page (P10.5D).
 *
 * Sticky, translucent, hairline-ruled navigation; a five-column footer that
 * makes every built route reachable. The active-charter strip stays pinned
 * above the nav whenever a charter is live — it is untouched here.
 */

type Active = 'register' | 'positions' | 'benchmarks' | 'builders' | 'docs' | 'charters' | 'standard' | 'ledger'

const NAV: Array<{ label: string; href: string; key: Active }> = [
  { label: 'Marketplace', href: '/register', key: 'register' },
  { label: 'Positions', href: '/', key: 'positions' },
  { label: 'Benchmarks', href: '/ledger', key: 'benchmarks' },
  { label: 'Builders', href: '/builders/test', key: 'builders' },
  { label: 'Docs', href: '/standard', key: 'docs' },
]

export function SiteHeader({ active }: { active?: Active }) {
  return (
    <>
      <CharterStrip />
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a className={styles.brand} href="/">
            <span className={styles.brandMark} aria-hidden="true" />
            {BRAND.name}
          </a>
          <nav className={styles.navLinks} aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={n.href}
                aria-current={
                  active === n.key
                  || (n.key === 'benchmarks' && active === 'ledger')
                  || (n.key === 'register' && active === 'standard' && false)
                    ? 'page'
                    : undefined
                }
              >
                {n.label}
              </a>
            ))}
          </nav>
          <NavWallet />
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
      ['Positions', '/'],
      ['Compare', '/compare'],
      ['Receipts', '/receipts/latest'],
      ['Judge mode', '/judge'],
    ],
  },
  {
    head: 'Proof',
    links: [
      ['The Standard', '/standard'],
      ['The Ledger', '/ledger'],
      ['Methodology', '/ledger/methodology'],
      ['Status', '/status'],
      ['Funnel API', '/api/v1/funnel'],
    ],
  },
  {
    head: 'Builders',
    links: [
      ['Test your agent', '/builders/test'],
      ['List your agent', '/builders/claim'],
      ['API', '/api/v1/agents'],
      ['Design system', '/_ui'],
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
          <a href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            {BRAND.name}
          </a>
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
        <a href="https://x.com/usemarque" target="_blank" rel="noreferrer">@usemarque</a>
      </div>
    </footer>
  )
}
