import { BRAND } from '@marque/ui/brand'
import styles from './site.module.css'

/**
 * Shared navigation.
 *
 * Present on every surface so a reader is never stranded, and so every page has
 * a focusable first element — a page whose first tab stop is nothing is a page
 * a keyboard user cannot enter.
 */
export function SiteHeader({ active }: { active?: 'register' | 'standard' | 'design' }) {
  return (
    <header className={styles.nav}>
      <a className={styles.brand} href="/">{BRAND.name}</a>
      <nav className={styles.navLinks} aria-label="Main">
        <a href="/register" aria-current={active === 'register' ? 'page' : undefined}>Register</a>
        <a href="/standard" aria-current={active === 'standard' ? 'page' : undefined}>Standard</a>
        <a href="/_ui" aria-current={active === 'design' ? 'page' : undefined}>Design</a>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>{BRAND.name} · {BRAND.chain} · chain 56</span>
      <span className={styles.footerLinks}>
        <a href="/api/v1/funnel">Funnel API</a>
        <a href="/standard">MCS v1.0</a>
      </span>
    </footer>
  )
}
