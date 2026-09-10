import { BRAND } from '@marque/ui/brand'
import { CharterStrip } from './CharterStrip'
import { NavWallet } from './NavWallet'
import { NavMenu } from './NavMenu'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from './ThemeToggle'
import { NAV, PANCAKE_MENU, PROOF_MENU, BUILD_MENU, type Active } from './nav-items'
import styles from './site.module.css'

/**
 * The shell around every page.
 *
 * The brand lockup is the real finalised artwork (the winged mark + geometric
 * wordmark), extracted to a transparent asset and served per theme — never a
 * re-typeset stand-in. Sticky, lightly frosted navigation; links centred as a
 * group; a five-column footer that makes every built route reachable.
 */

/**
 * The primary nav is the buyer's path — find an agent, read a position, your
 * own dashboard — kept to a handful of labels. The deeper routes that used to
 * be footer-only (the proof run, receipts, status, the builder pages, the read
 * API) hang off three small menus (see `nav-items.ts`) so they are one click
 * from anywhere without crowding the bar. Below 900px the whole set moves into
 * the `MobileNav` drawer.
 */

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
                aria-current={active === n.key ? 'page' : undefined}
              >
                {n.label}
              </a>
            ))}
            <NavMenu
              label="Pancake"
              items={PANCAKE_MENU}
              active={active === 'pancake'}
            />
            <NavMenu
              label="Benchmarks"
              items={PROOF_MENU}
              active={active === 'benchmarks' || active === 'ledger' || active === 'standard' || active === 'status'}
            />
            <NavMenu label="Docs" items={BUILD_MENU} active={active === 'docs' || active === 'builders'} />
          </nav>
          <div className={styles.navRight}>
            <ThemeToggle />
            <NavWallet />
            <MobileNav active={active} />
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
          <a
            className={styles.footerSocial}
            href="https://x.com/marquetrade"
            target="_blank"
            rel="noreferrer"
            aria-label="Marque on X — @marquetrade"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @marquetrade
          </a>
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
