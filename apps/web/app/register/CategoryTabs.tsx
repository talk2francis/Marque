import styles from './register.module.css'

/** The four categories plus security, as navigation. No 01/02/03 numbering. */
const TABS = [
  { key: 'all', label: 'All', href: '/register' },
  { key: 'rebalancing', label: 'Rebalancing', href: '/register/rebalancing' },
  { key: 'grid', label: 'Grid trading', href: '/register/grid' },
  { key: 'yield', label: 'Yield', href: '/register/yield' },
  { key: 'health_factor', label: 'Health factor', href: '/register/health-factor' },
  { key: 'security', label: 'Security', href: '/register/security' },
]

export function CategoryTabs({ active }: { active: string }) {
  return (
    <nav className={styles.tabs} aria-label="Categories">
      {TABS.map((t) => (
        <a
          key={t.key}
          href={t.href}
          className={`${styles.tab} ${t.key === active ? styles.tabActive : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  )
}
