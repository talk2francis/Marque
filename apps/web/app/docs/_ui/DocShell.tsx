import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { LIBRARY } from './library'
import { ScrollSpy } from './ScrollSpy'
import styles from '../docs.module.css'

/**
 * Every page in the documentation library (27 Sep rebuild, after Kerb's docs):
 * a page head with its label, title, lede and actions; then a sticky rail with
 * this page's contents and the rest of the library; then one readable column
 * in the normal document scroll. No tabs, no second scroll area.
 */
export function DocShell({ current, label, title, lede, actions, sections, children }: {
  current: string
  label: string
  title: string
  lede: React.ReactNode
  actions?: React.ReactNode
  sections: Array<{ id: string; label: string }>
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader active="docs" />
      <main className={styles.docs}>
        <header className={styles.pageHead}>
          <span className="t-label">{label}</span>
          <h1>{title}</h1>
          <p className={styles.lede}>{lede}</p>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
        <div className={styles.grid}>
          <aside className={styles.rail}>
            <ScrollSpy items={sections} />
            <nav className={styles.library} aria-label="Documentation library">
              <span className="t-label">Library</span>
              <ul>
                {LIBRARY.map((l) => (
                  <li key={l.slug}><a href={l.href} aria-current={l.slug === current ? 'page' : undefined}>{l.label}</a></li>
                ))}
              </ul>
            </nav>
          </aside>
          <div className={styles.body}>
            {children}
            <aside className={styles.callout}>
              <strong>Still stuck?</strong>
              <p>Ask in the <a href="https://t.me/marque_marketplace" target="_blank" rel="noreferrer">Marque Telegram group</a> or open an <a href="https://github.com/talk2francis/Marque/issues" target="_blank" rel="noreferrer">issue on GitHub</a>. Share a job number or a transaction hash, never a private key or recovery phrase.</p>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

/** A numbered section of a docs page. */
export function DocSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  )
}
