import { BRAND } from '@marque/ui/brand'
import { CharterStrip } from './CharterStrip'
import styles from './site.module.css'

/**
 * Shared navigation.
 *
 * Present on every surface so a reader is never stranded, and so every page has
 * a focusable first element — a page whose first tab stop is nothing is a page
 * a keyboard user cannot enter.
 */
export function SiteHeader({ active }: { active?: 'register' | 'standard' | 'design' | 'charters' | 'ledger' }) {
  return (
    <>
    {/* Whenever any charter is live, this is pinned above everything, on every
        page. Bounded authority nobody can see is not meaningfully bounded. */}
    <CharterStrip />
    <header className={styles.nav}>
      <a className={styles.brand} href="/">{BRAND.name}</a>
      {/* "Design" (/_ui) lives in the footer under Builders, not here — a judge
          does not need the kitchen in the main navigation (P10.5A item 6). */}
      <nav className={styles.navLinks} aria-label="Main">
        <a href="/register" aria-current={active === 'register' ? 'page' : undefined}>Marketplace</a>
        <a href="/standard" aria-current={active === 'standard' ? 'page' : undefined}>Standard</a>
        <a href="/ledger" aria-current={active === 'ledger' ? 'page' : undefined}>Ledger</a>
        <a href="/app/charters" aria-current={active === 'charters' ? 'page' : undefined}>Charters</a>
      </nav>
    </header>
    </>
  )
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      {/* No chain id here on purpose: a footer does not establish the network
          for a page. Every surface that shows or produces a transaction carries
          its own NetworkBadge (P10.5A item 2). */}
      <span>{BRAND.name} · {BRAND.chain}</span>
      <span className={styles.footerLinks}>
        <a href="/api/v1/funnel">Funnel API</a>
        <a href="/standard">MCS v1.0</a>
        <a href="/ledger/methodology">Ledger method</a>
      </span>
      <span className={styles.footerLinks}>
        <b className={styles.footerGroup}>Builders</b>
        <a href="/builders/claim">List your agent</a>
        <a href="/builders/test">Test your agent</a>
        <a href="/_ui">Design system</a>
      </span>
    </footer>
  )
}
