'use client'
import { ArrowRight, ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { faqSlug, type FaqGroup } from '../faq/faq'
import styles from '../docs.module.css'

/**
 * The FAQ, browsable: a search that filters questions and answers as you type,
 * each topic its own numbered block, each answer with the page that shows it.
 * Answers are native <details>, so they work before hydration and without JS.
 */
export function FaqBrowser({ groups }: { groups: FaqGroup[] }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter((f) => !needle || `${f.q} ${f.a}`.toLowerCase().includes(needle)) })).filter((g) => g.items.length),
    [groups, needle],
  )
  const total = shown.reduce((n, g) => n + g.items.length, 0)
  let n = 0
  return (
    <div className={styles.faq}>
      <div className={styles.faqSearch}>
        <label className="t-label" htmlFor="faq-q">Search the questions</label>
        <span className={styles.faqField}>
          <Search aria-hidden="true" />
          <input id="faq-q" type="search" placeholder="Try: refund, escrow, warranted, quest" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </span>
        <span className={styles.faqCount} aria-live="polite">{needle ? `${total} ${total === 1 ? 'answer' : 'answers'} for "${q.trim()}"` : `${total} questions in ${groups.length} topics`}</span>
      </div>
      {shown.length === 0 ? <p className={styles.faqNone}>Nothing matches. <a href="/docs">How to use Marque</a> goes deeper.</p> : null}
      {shown.map((g) => (
        <section key={g.group} id={faqSlug(g.group)} className={styles.faqGroup} aria-labelledby={`${faqSlug(g.group)}-h`}>
          <header className={styles.faqHead}><h2 id={`${faqSlug(g.group)}-h`}>{g.group}</h2><p>{g.intro}</p></header>
          <div className={styles.faqList}>
            {g.items.map((f) => {
              n++
              return (
                <details key={f.q} className={styles.faqItem} open={Boolean(needle)}>
                  <summary>
                    <span className={styles.faqN}>{String(n).padStart(2, '0')}</span>
                    <span className={styles.faqQ}>{f.q}</span>
                    <ChevronDown className={styles.faqChev} aria-hidden="true" />
                  </summary>
                  <div className={styles.faqA}>
                    <p>{f.a}</p>
                    {f.href ? <a className={styles.faqLink} href={f.href}>{f.link ?? 'Open'} <ArrowRight aria-hidden="true" /></a> : null}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
