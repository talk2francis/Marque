'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './docs.module.css'

export interface DocSection { id: string; title: string }

/**
 * The docs are a tabbed reference, not one long scroll: the rail on the left is
 * sticky, and only the selected section's content is shown, with Previous / Next
 * to move between them. The section markup is rendered server-side inside
 * `children`; this component just picks which one is visible and keeps the URL
 * hash and the rail in step.
 */
export function DocsShell({ sections, children }: { sections: DocSection[]; children: React.ReactNode }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const contentRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  // Initial section from the hash, if valid.
  useEffect(() => {
    const h = window.location.hash.replace('#', '')
    if (h && sections.some((s) => s.id === h)) setActive(h)
  }, [sections])

  // Show only the active section.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>('[data-doc-section]').forEach((el) => {
      el.hidden = el.dataset.docSection !== active
    })
    if (!firstRender.current) {
      history.replaceState(null, '', `#${active}`)
      // The content column is its own scroll container on desktop, so reset IT
      // rather than the window — scrolling the window would move nothing and
      // leave the reader halfway down the previous section's scroll position.
      if (root.scrollHeight > root.clientHeight || root.scrollTop > 0) {
        root.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const top = root.getBoundingClientRect().top + window.scrollY - 96
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      }
    }
    firstRender.current = false
  }, [active])

  // Respond to back/forward.
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '')
      if (h && sections.some((s) => s.id === h)) setActive(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [sections])

  const i = sections.findIndex((s) => s.id === active)
  const prev = i > 0 ? sections[i - 1] : null
  const next = i >= 0 && i < sections.length - 1 ? sections[i + 1] : null

  return (
    <div className={styles.wrap}>
      <nav className={styles.rail} aria-label="Documentation sections">
        <span className={styles.railHead}>Documentation</span>
        <ol className={styles.railList}>
          {sections.map((s, n) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => { e.preventDefault(); setActive(s.id) }}
                className={active === s.id ? styles.railActive : undefined}
                aria-current={active === s.id ? 'true' : undefined}
              >
                <span className={styles.railNum}>{String(n + 1).padStart(2, '0')}</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.docCol} ref={contentRef}>
        {children}
        <nav className={styles.pager} aria-label="Section navigation">
          {prev ? (
            <button type="button" className={styles.pagerPrev} onClick={() => setActive(prev.id)}>
              <span className={styles.pagerDir}>Previous</span>
              <span className={styles.pagerTitle}>{prev.title}</span>
            </button>
          ) : <span />}
          {next ? (
            <button type="button" className={styles.pagerNext} onClick={() => setActive(next.id)}>
              <span className={styles.pagerDir}>Next</span>
              <span className={styles.pagerTitle}>{next.title}</span>
            </button>
          ) : <span />}
        </nav>
      </div>
    </div>
  )
}
