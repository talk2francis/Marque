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
      <nav className={styles.navLinks} aria-label="Main">
        <a href="/register" aria-current={active === 'register' ? 'page' : undefined}>Register</a>
        <a href="/standard" aria-current={active === 'standard' ? 'page' : undefined}>Standard</a>
        <a href="/ledger" aria-current={active === 'ledger' ? 'page' : undefined}>Ledger</a>
        <a href="/app/charters" aria-current={active === 'charters' ? 'page' : undefined}>Charters</a>
        <a href="/_ui" aria-current={active === 'design' ? 'page' : undefined}>Design</a>
      </nav>
    </header>
    </>
  )
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>{BRAND.name} · {BRAND.chain} · chain 56</span>
      <span className={styles.footerLinks}>
        <a href="/api/v1/funnel">Funnel API</a>
        <a href="/standard">MCS v1.0</a>
        <a href="/ledger/methodology">Ledger method</a>
      </span>
    </footer>
  )
}
