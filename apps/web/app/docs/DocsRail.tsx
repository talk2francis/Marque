'use client'

import { useEffect, useState } from 'react'
import styles from './docs.module.css'

export interface DocSection {
  id: string
  title: string
}

/**
 * The left anchor rail. Sticky list of every section; the one currently in view
 * is marked. Smooth-scrolls on click and keeps the URL hash in step without a
 * jump. Scrollspy is an IntersectionObserver, not a scroll handler.
 */
export function DocsRail({ sections }: { sections: DocSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (!targets.length) return

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-88px 0px -60% 0px', threshold: 0 },
    )
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [sections])

  function jump(e: React.MouseEvent, id: string) {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
    setActive(id)
  }

  return (
    <nav className={styles.rail} aria-label="On this page">
      <span className={styles.railHead}>Documentation</span>
      <ol className={styles.railList}>
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => jump(e, s.id)}
              className={active === s.id ? styles.railActive : undefined}
              aria-current={active === s.id ? 'true' : undefined}
            >
              <span className={styles.railNum}>{String(i + 1).padStart(2, '0')}</span>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
